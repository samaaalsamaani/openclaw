/**
 * Real-time status dashboard for PAIOS system health
 *
 * Provides formatted terminal output showing services, APIs, databases,
 * recent errors, and overall system status. Accessible via `ai status` command.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { checkSystemHealth, type HealthReport } from "./health-check.js";

// ── Type Definitions ──────────────────────────────────────────────────

export interface RecentError {
  timestamp: string;
  action: string;
  source: string;
  error: string;
  count?: number;
}

export interface DashboardData {
  health: HealthReport;
  recentErrors: RecentError[];
}

// ── Constants ─────────────────────────────────────────────────────────

// Box-drawing characters
const BOX = {
  // Heavy borders for header
  heavyH: "═",
  heavyV: "║",
  heavyTL: "╔",
  heavyTR: "╗",
  heavyBL: "╚",
  heavyBR: "╝",
  // Light borders for sections
  lightH: "─",
  lightV: "│",
  lightTL: "┌",
  lightTR: "┐",
  lightBL: "└",
  lightBR: "┘",
} as const;

// ANSI color codes
const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
} as const;

// Status symbols
const SYMBOLS = {
  healthy: "✓",
  degraded: "!",
  critical: "✗",
  waiting: "-",
  indicator: "●",
} as const;

// Dashboard width
const DASHBOARD_WIDTH = 62;

// ── Utility Functions ─────────────────────────────────────────────────

/**
 * Color wrapper functions
 */
function green(text: string): string {
  return `${COLORS.green}${text}${COLORS.reset}`;
}

function yellow(text: string): string {
  return `${COLORS.yellow}${text}${COLORS.reset}`;
}

function red(text: string): string {
  return `${COLORS.red}${text}${COLORS.reset}`;
}

function blue(text: string): string {
  return `${COLORS.blue}${text}${COLORS.reset}`;
}

function gray(text: string): string {
  return `${COLORS.gray}${text}${COLORS.reset}`;
}

function bold(text: string): string {
  return `${COLORS.bold}${text}${COLORS.reset}`;
}

/**
 * Pad text to specified width
 */
function pad(text: string, width: number, align: "left" | "right" | "center" = "left"): string {
  // Calculate visible width (strip ANSI codes for measurement)
  // eslint-disable-next-line no-control-regex
  const visibleText = text.replace(/\x1b\[[0-9;]*m/g, "");
  const visibleWidth = visibleText.length;
  const padding = Math.max(0, width - visibleWidth);

  if (align === "right") {
    return " ".repeat(padding) + text;
  }
  if (align === "center") {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return " ".repeat(leftPad) + text + " ".repeat(rightPad);
  }
  return text + " ".repeat(padding);
}

/**
 * Create horizontal line with box-drawing characters
 */
function hLine(left: string, middle: string, right: string, isHeavy = false): string {
  const h = isHeavy ? BOX.heavyH : BOX.lightH;
  return left + h.repeat(DASHBOARD_WIDTH - 2) + right;
}

/**
 * Create text line with borders
 */
function textLine(text: string, align: "left" | "center" = "left", border = BOX.lightV): string {
  const padded = pad(text, DASHBOARD_WIDTH - 4, align);
  return `${border} ${padded} ${border}`;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format service name for display (remove prefix)
 */
function formatServiceName(name: string): string {
  return name.replace("ai.openclaw.", "");
}

/**
 * Format file size in MB
 */
function formatSize(mb: number): string {
  if (mb >= 1000) {
    return `${(mb / 1000).toFixed(1)}GB`;
  }
  return `${mb.toFixed(1)}MB`;
}

// ── Data Fetching ─────────────────────────────────────────────────────

/**
 * Fetch recent errors from observability.sqlite
 */
async function fetchRecentErrors(): Promise<RecentError[]> {
  try {
    const dbPath = join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

    // Check if database exists
    try {
      statSync(dbPath);
    } catch {
      return [];
    }

    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    db.pragma("busy_timeout = 5000");

    const rows = db
      .prepare(
        `
      SELECT action, source, error, timestamp
      FROM events
      WHERE error IS NOT NULL
        AND timestamp > datetime('now', '-24 hours')
      ORDER BY timestamp DESC
      LIMIT 50
    `,
      )
      .all() as Array<{ action: string; source: string; error: string; timestamp: string }>;

    db.close();

    // Group errors by type and count occurrences
    const errorMap = new Map<string, RecentError>();

    for (const row of rows) {
      const key = `${row.action}:${row.error.substring(0, 50)}`; // Group by action + error prefix

      if (errorMap.has(key)) {
        const existing = errorMap.get(key)!;
        existing.count = (existing.count ?? 1) + 1;
        // Keep most recent timestamp
        if (new Date(row.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = row.timestamp;
        }
      } else {
        errorMap.set(key, {
          timestamp: row.timestamp,
          action: row.action,
          source: row.source,
          error: row.error,
          count: 1,
        });
      }
    }

    // Convert to array and sort by timestamp (most recent first)
    const errors = Array.from(errorMap.values()).toSorted(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return errors.slice(0, 10); // Return top 10 most recent unique errors
  } catch (err) {
    console.error(
      "[status-dashboard] Failed to fetch recent errors:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

// ── Dashboard Rendering ───────────────────────────────────────────────

/**
 * Render header section
 */
function renderHeader(timestamp: string): string[] {
  return [
    hLine(BOX.heavyTL, BOX.heavyH, BOX.heavyTR, true),
    textLine(bold("PAIOS System Status"), "center", BOX.heavyV),
    textLine(formatTimestamp(timestamp), "center", BOX.heavyV),
    hLine(BOX.heavyBL, BOX.heavyH, BOX.heavyBR, true),
    "",
  ];
}

/**
 * Render overall health indicator
 */
function renderOverallHealth(overall: "healthy" | "degraded" | "critical"): string[] {
  let indicator: string;
  if (overall === "healthy") {
    indicator = green(`${SYMBOLS.indicator} HEALTHY`);
  } else if (overall === "degraded") {
    indicator = yellow(`${SYMBOLS.indicator} DEGRADED`);
  } else {
    indicator = red(`${SYMBOLS.indicator} CRITICAL`);
  }

  return [`Overall Health: ${indicator}`, ""];
}

/**
 * Render services section
 */
function renderServices(report: HealthReport): string[] {
  const running = report.services.filter((s) => s.running).length;
  const total = report.services.length;

  const lines: string[] = [
    hLine(BOX.lightTL, BOX.lightH, BOX.lightTR),
    textLine(
      `${BOX.lightH} Services (${running}/${total} running) ${BOX.lightH.repeat(DASHBOARD_WIDTH - 28)}`,
    ),
  ];

  // Render services in two columns
  for (let i = 0; i < report.services.length; i += 2) {
    const left = report.services[i];
    const right = report.services[i + 1];

    if (!left) {
      continue;
    }

    const leftSymbol = left.running ? green(SYMBOLS.healthy) : blue(SYMBOLS.waiting);
    const leftName = formatServiceName(left.name).padEnd(18);
    const leftPid = left.pid ? `[${String(left.pid).padStart(5)}]` : `   [-]`;
    const leftText = `${leftSymbol} ${leftName} ${gray(leftPid)}`;

    if (right) {
      const rightSymbol = right.running ? green(SYMBOLS.healthy) : blue(SYMBOLS.waiting);
      const rightName = formatServiceName(right.name).padEnd(16);
      const rightPid = right.pid ? `[${String(right.pid).padStart(5)}]` : `   [-]`;
      const rightText = `${rightSymbol} ${rightName} ${gray(rightPid)}`;

      lines.push(textLine(`${leftText} ${BOX.lightV} ${rightText}`));
    } else {
      lines.push(textLine(leftText));
    }
  }

  lines.push(hLine(BOX.lightBL, BOX.lightH, BOX.lightBR));
  lines.push("");

  return lines;
}

/**
 * Render APIs section
 */
function renderApis(report: HealthReport): string[] {
  const available = report.apis.filter((a) => a.available).length;
  const total = report.apis.length;

  const lines: string[] = [
    hLine(BOX.lightTL, BOX.lightH, BOX.lightTR),
    textLine(
      `${BOX.lightH} APIs (${available}/${total} available) ${BOX.lightH.repeat(DASHBOARD_WIDTH - 28)}`,
    ),
  ];

  // Render APIs in two columns
  for (let i = 0; i < report.apis.length; i += 2) {
    const left = report.apis[i];
    const right = report.apis[i + 1];

    if (!left) {
      continue;
    }

    const leftSymbol = left.available ? green(SYMBOLS.healthy) : red(SYMBOLS.critical);
    const leftName = left.name.padEnd(15);
    const leftStatus = left.statusCode
      ? `${left.statusCode} ${gray(`${left.latency_ms}ms`)}`
      : gray("timeout");
    const leftText = `${leftSymbol} ${leftName} ${leftStatus.padEnd(15)}`;

    if (right) {
      const rightSymbol = right.available ? green(SYMBOLS.healthy) : red(SYMBOLS.critical);
      const rightName = right.name.padEnd(13);
      const rightStatus = right.statusCode
        ? `${right.statusCode} ${gray(`${right.latency_ms}ms`)}`
        : gray("timeout");
      const rightText = `${rightSymbol} ${rightName} ${rightStatus}`;

      lines.push(textLine(`${leftText} ${BOX.lightV} ${rightText}`));
    } else {
      lines.push(textLine(leftText));
    }
  }

  lines.push(hLine(BOX.lightBL, BOX.lightH, BOX.lightBR));
  lines.push("");

  return lines;
}

/**
 * Render databases section
 */
function renderDatabases(report: HealthReport): string[] {
  const accessible = report.databases.filter((d) => d.accessible).length;
  const total = report.databases.length;

  const lines: string[] = [
    hLine(BOX.lightTL, BOX.lightH, BOX.lightTR),
    textLine(
      `${BOX.lightH} Databases (${accessible}/${total} accessible) ${BOX.lightH.repeat(DASHBOARD_WIDTH - 34)}`,
    ),
  ];

  for (const db of report.databases) {
    const symbol = db.accessible ? green(SYMBOLS.healthy) : red(SYMBOLS.critical);
    const name = db.name.padEnd(32);
    const wal = db.wal_enabled !== undefined ? (db.wal_enabled ? "WAL" : "DEL") : "---";
    const size = db.size_mb !== undefined ? formatSize(db.size_mb).padStart(7) : "    ---";

    lines.push(textLine(`${symbol} ${name} ${gray(wal)}  ${gray(size)}`));
  }

  lines.push(hLine(BOX.lightBL, BOX.lightH, BOX.lightBR));
  lines.push("");

  return lines;
}

/**
 * Render recent errors section
 */
function renderRecentErrors(errors: RecentError[]): string[] {
  const lines: string[] = [
    hLine(BOX.lightTL, BOX.lightH, BOX.lightTR),
    textLine(
      `${BOX.lightH} Recent Errors (last 24 hours) ${BOX.lightH.repeat(DASHBOARD_WIDTH - 36)}`,
    ),
  ];

  if (errors.length === 0) {
    lines.push(textLine(gray("No errors in the last 24 hours")));
  } else {
    for (const err of errors) {
      const timestamp = new Date(err.timestamp);
      const time = `${String(timestamp.getHours()).padStart(2, "0")}:${String(timestamp.getMinutes()).padStart(2, "0")}`;
      const action = err.action.padEnd(18);
      const errorMsg = err.error.substring(0, 30);
      const count = err.count && err.count > 1 ? gray(` (${err.count} times)`) : "";

      lines.push(textLine(`${gray(time)}  ${action}  ${errorMsg}${count}`));
    }
  }

  lines.push(hLine(BOX.lightBL, BOX.lightH, BOX.lightBR));
  lines.push("");

  return lines;
}

/**
 * Render configs section
 */
function renderConfigs(report: HealthReport): string[] {
  const configParts: string[] = [];

  for (const config of report.configs) {
    const symbol = config.valid ? green(SYMBOLS.healthy) : red(SYMBOLS.critical);
    configParts.push(`${symbol} ${config.name}`);
  }

  return [`Configs: ${configParts.join("  ")}`, ""];
}

// ── Main Dashboard Function ───────────────────────────────────────────

/**
 * Render complete dashboard with all sections
 *
 * @returns Formatted dashboard string ready for terminal output
 */
export async function renderDashboard(): Promise<string> {
  try {
    // Fetch data
    const health = await checkSystemHealth();
    const recentErrors = await fetchRecentErrors();

    // Build dashboard sections
    const lines: string[] = [];

    lines.push(...renderHeader(health.timestamp));
    lines.push(...renderOverallHealth(health.overall));
    lines.push(...renderServices(health));
    lines.push(...renderApis(health));
    lines.push(...renderDatabases(health));
    lines.push(...renderRecentErrors(recentErrors));
    lines.push(...renderConfigs(health));

    return lines.join("\n");
  } catch (err) {
    // Error handling: always return formatted output, never throw
    const errorMsg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? `\n\n${err.stack}` : "";
    return [
      hLine(BOX.heavyTL, BOX.heavyH, BOX.heavyTR, true),
      textLine(bold("PAIOS System Status"), "center", BOX.heavyV),
      textLine(red("Status check failed"), "center", BOX.heavyV),
      hLine(BOX.heavyBL, BOX.heavyH, BOX.heavyBR, true),
      "",
      `Error: ${errorMsg}${stack}`,
      "",
    ].join("\n");
  }
}
