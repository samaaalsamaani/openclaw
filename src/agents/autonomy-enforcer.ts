/**
 * Autonomy Enforcer — wires the PAIOS progressive autonomy system into the
 * SDK runner's canUseTool callback.  Every Bash command is classified against
 * rules in ~/.openclaw/autonomy.sqlite and either allowed or denied.
 *
 * Follows the same fire-and-forget pattern as channel-events.ts:
 *   • Lazy singleton DatabaseSync via requireNodeSqlite()
 *   • WAL mode + busy_timeout for concurrent access with autonomy.js CLI
 *   • All DB writes wrapped in try-catch — never crashes the gateway
 *   • Emits observability events under category "autonomy"
 *
 * Enforcement order (in sdk-runner canUseTool):
 *   1. blocked patterns (exec-approvals.json) — hard security floor
 *   2. autonomy enforcer (this file) — DB-driven trust
 *   3. default allow
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

const log = createSubsystemLogger("agent/autonomy");

const HOME = process.env.HOME ?? "/tmp";
const OPENCLAW_DIR = join(HOME, ".openclaw");
const AUTONOMY_DB_PATH = join(OPENCLAW_DIR, "autonomy.sqlite");
const OBSERVABILITY_DB_PATH = join(OPENCLAW_DIR, "observability.sqlite");

const PROMOTION_THRESHOLD = 5;

// ── Types ──

export type AutonomyLevel = "safe" | "ask" | "never";

export type AutonomyDecision = {
  level: AutonomyLevel;
  pattern: string;
  matchedRule: string | undefined;
  action: "allow" | "deny";
};

type ActionRule = {
  id: number;
  pattern: string;
  level: AutonomyLevel;
  source: string;
  consecutive_approvals: number;
  notes: string | null;
};

// ── Lazy Singleton DBs ──

let autonomyDb: DatabaseSync | null = null;
let autonomyInitFailed = false;
let autonomyLastFailTime = 0;

let observabilityDb: DatabaseSync | null = null;
let observabilityInitFailed = false;
let observabilityLastFailTime = 0;

function getAutonomyDb(): DatabaseSync | null {
  if (autonomyDb) {
    return autonomyDb;
  }
  if (autonomyInitFailed && Date.now() - autonomyLastFailTime < 60_000) {
    return null;
  }
  if (autonomyInitFailed) {
    autonomyInitFailed = false;
  }

  try {
    const { DatabaseSync } = requireNodeSqlite();
    if (!existsSync(OPENCLAW_DIR)) {
      mkdirSync(OPENCLAW_DIR, { recursive: true });
    }
    autonomyDb = new DatabaseSync(AUTONOMY_DB_PATH);
    autonomyDb.exec("PRAGMA journal_mode = WAL");
    autonomyDb.exec("PRAGMA busy_timeout = 5000");

    // Ensure tables exist (schema-compatible with autonomy.js)
    autonomyDb.exec(`
      CREATE TABLE IF NOT EXISTS action_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL UNIQUE,
        level TEXT NOT NULL CHECK (level IN ('safe', 'ask', 'never')),
        source TEXT NOT NULL DEFAULT 'default',
        consecutive_approvals INTEGER NOT NULL DEFAULT 0,
        last_updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS approval_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('approve', 'deny', 'always_approve', 'auto_promote')),
        context TEXT,
        timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    return autonomyDb;
  } catch (err) {
    autonomyInitFailed = true;
    autonomyLastFailTime = Date.now();
    log.warn?.(`autonomy DB unavailable, enforcement will be skipped: ${String(err)}`);
    return null;
  }
}

function getObservabilityDb(): DatabaseSync | null {
  if (observabilityDb) {
    return observabilityDb;
  }
  if (observabilityInitFailed && Date.now() - observabilityLastFailTime < 60_000) {
    return null;
  }
  if (observabilityInitFailed) {
    observabilityInitFailed = false;
  }

  try {
    const { DatabaseSync } = requireNodeSqlite();
    if (!existsSync(OPENCLAW_DIR)) {
      mkdirSync(OPENCLAW_DIR, { recursive: true });
    }
    observabilityDb = new DatabaseSync(OBSERVABILITY_DB_PATH);
    observabilityDb.exec("PRAGMA journal_mode = WAL");
    observabilityDb.exec("PRAGMA busy_timeout = 5000");
    return observabilityDb;
  } catch (err) {
    observabilityInitFailed = true;
    observabilityLastFailTime = Date.now();
    log.warn?.(`observability DB unavailable, autonomy events will be skipped: ${String(err)}`);
    return null;
  }
}

// ── Pattern Extraction ──

/**
 * Extract a colon-separated action pattern from a bash command string.
 *
 * Examples:
 *   "git push origin main"       → "exec:git:push"
 *   "rm -rf /tmp/foo"            → "exec:rm:-rf"
 *   "sudo apt update"            → "exec:sudo:apt"
 *   "curl https://example.com"   → "exec:curl:*"
 *   "LIVE=1 pnpm test"           → "exec:pnpm:test"
 *   "bash -c 'git push'"         → "exec:git:push"
 *   "ls -la"                     → "exec:ls:-la"
 */
export function extractCommandPattern(command: string): string {
  let cmd = command.trim();

  // Strip leading env vars (KEY=VALUE ...)
  while (/^[A-Z_][A-Z0-9_]*=\S*\s/.test(cmd)) {
    cmd = cmd.replace(/^[A-Z_][A-Z0-9_]*=\S*\s+/, "");
  }

  // Unwrap shell wrappers: bash -c '...', sh -c '...'
  const shellWrapper = /^(?:bash|sh)\s+-c\s+(['"])(.*)\1\s*$/.exec(cmd);
  if (shellWrapper) {
    cmd = shellWrapper[2].trim();
    // Strip env vars again in case they're inside the wrapper
    while (/^[A-Z_][A-Z0-9_]*=\S*\s/.test(cmd)) {
      cmd = cmd.replace(/^[A-Z_][A-Z0-9_]*=\S*\s+/, "");
    }
  }

  // Split into tokens
  const tokens = cmd.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return "exec:unknown";
  }

  const binary = tokens[0];

  // For URLs or long arguments after certain commands, use wildcard
  if (tokens.length > 1 && /^https?:\/\//i.test(tokens[1])) {
    return `exec:${binary}:*`;
  }

  // Take first two meaningful tokens (binary + first arg)
  if (tokens.length === 1) {
    return `exec:${binary}`;
  }

  return `exec:${binary}:${tokens[1]}`;
}

// ── Pattern Matching ──

function matchPattern(db: DatabaseSync, actionPattern: string): ActionRule | undefined {
  // Exact match first
  const exact = db.prepare("SELECT * FROM action_rules WHERE pattern = ?").get(actionPattern) as
    | ActionRule
    | undefined;
  if (exact) {
    return exact;
  }

  // Progressively broader wildcards: exec:git:push → exec:git:* → exec:*
  const parts = actionPattern.split(":");
  for (let i = parts.length - 1; i >= 1; i--) {
    const wildcard = parts.slice(0, i).join(":") + ":*";
    const match = db.prepare("SELECT * FROM action_rules WHERE pattern = ?").get(wildcard) as
      | ActionRule
      | undefined;
    if (match) {
      return match;
    }
  }

  return undefined;
}

// ── Recording ──

function recordDecision(
  db: DatabaseSync,
  pattern: string,
  action: "approve" | "deny",
  context: string | null,
): void {
  try {
    // Log the decision
    db.prepare("INSERT INTO approval_log (pattern, action, context) VALUES (?, ?, ?)").run(
      pattern,
      action,
      context,
    );

    if (action === "approve") {
      // Wrap in transaction to prevent race conditions on concurrent approvals
      db.exec("BEGIN IMMEDIATE");
      try {
        // Re-read inside transaction for atomicity
        const existing = db.prepare("SELECT * FROM action_rules WHERE pattern = ?").get(pattern) as
          | ActionRule
          | undefined;

        if (existing) {
          const newCount = existing.consecutive_approvals + 1;
          if (newCount >= PROMOTION_THRESHOLD && existing.level === "ask") {
            // Auto-promote to safe
            db.prepare(
              `UPDATE action_rules SET level = 'safe', source = 'auto_promoted',
               consecutive_approvals = ?, last_updated = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE pattern = ?`,
            ).run(newCount, pattern);
            db.prepare(
              "INSERT INTO approval_log (pattern, action, context) VALUES (?, 'auto_promote', ?)",
            ).run(pattern, `Auto-promoted after ${newCount} consecutive approvals`);
            log.info(`autonomy: auto-promoted "${pattern}" to safe after ${newCount} approvals`);
          } else {
            db.prepare(
              `UPDATE action_rules SET consecutive_approvals = ?,
               last_updated = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE pattern = ?`,
            ).run(newCount, pattern);
          }
        } else {
          // Create new rule at "ask" level for previously unknown patterns
          db.prepare(
            `INSERT OR IGNORE INTO action_rules (pattern, level, source, consecutive_approvals)
             VALUES (?, 'ask', 'learned', 1)`,
          ).run(pattern);
        }
        db.exec("COMMIT");
      } catch (txErr) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        throw txErr;
      }
    }
  } catch (err) {
    log.warn?.(`failed to record autonomy decision: ${String(err)}`);
  }
}

// ── Observability ──

function emitAutonomyEvent(data: {
  action: string;
  pattern: string;
  level: string;
  command: string;
  matchedRule?: string;
}): void {
  try {
    const db = getObservabilityDb();
    if (!db) {
      return;
    }

    const traceId = `t-${Date.now().toString(16)}-${randomBytes(4).toString("hex")}`;
    const meta = {
      pattern: data.pattern,
      level: data.level,
      matchedRule: data.matchedRule,
      command: data.command.substring(0, 200),
    };

    db.prepare(
      `INSERT INTO events (trace_id, category, action, source, metadata)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(traceId, "autonomy", data.action, "sdk-runner/autonomy", JSON.stringify(meta));
  } catch (err) {
    // Swallow — observability must never crash the gateway
    log.warn?.(`failed to emit autonomy event: ${String(err)}`);
  }
}

// ── Main Entry Point ──

/**
 * Enforce autonomy policy on a bash command.
 * Returns an allow/deny decision. Never throws.
 */
export function enforceAutonomy(command: string): AutonomyDecision {
  const pattern = extractCommandPattern(command);

  // If DB is unavailable, fail open
  const db = getAutonomyDb();
  if (!db) {
    return { level: "safe", pattern, matchedRule: undefined, action: "allow" };
  }

  try {
    const rule = matchPattern(db, pattern);

    if (!rule) {
      // Unknown pattern — allow + create new "ask" rule + record
      recordDecision(db, pattern, "approve", "unknown pattern, auto-allowed");
      emitAutonomyEvent({
        action: "allow_unknown",
        pattern,
        level: "ask",
        command,
      });
      return { level: "ask", pattern, matchedRule: undefined, action: "allow" };
    }

    if (rule.level === "never") {
      // Hard deny
      recordDecision(db, pattern, "deny", `blocked by rule: ${rule.pattern}`);
      emitAutonomyEvent({
        action: "deny",
        pattern,
        level: "never",
        command,
        matchedRule: rule.pattern,
      });
      return { level: "never", pattern, matchedRule: rule.pattern, action: "deny" };
    }

    if (rule.level === "safe") {
      // Allow without recording (low noise)
      return { level: "safe", pattern, matchedRule: rule.pattern, action: "allow" };
    }

    // level === "ask" — allow + record approval for trust accumulation
    recordDecision(db, pattern, "approve", `auto-approved via canUseTool`);
    emitAutonomyEvent({
      action: "allow_ask",
      pattern,
      level: "ask",
      command,
      matchedRule: rule.pattern,
    });
    return { level: "ask", pattern, matchedRule: rule.pattern, action: "allow" };
  } catch (err) {
    // Fail open on any error
    log.warn?.(`autonomy enforcement error, allowing command: ${String(err)}`);
    return { level: "safe", pattern, matchedRule: undefined, action: "allow" };
  }
}

// ── Testing Helpers ──

/** Reset DB singletons (for testing). */
export function _resetForTesting(): void {
  autonomyDb = null;
  autonomyInitFailed = false;
  observabilityDb = null;
  observabilityInitFailed = false;
}
