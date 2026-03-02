import { createRequire } from "node:module";
import path from "node:path";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import {
  isCronRunSessionKey,
  isCronSessionKey,
  isSubagentSessionKey,
} from "../sessions/session-key-utils.js";
import { ensureCrossChannelIndexSchema } from "./cross-channel-schema.js";
import { buildFtsQuery } from "./hybrid.js";
import { buildSessionEntry, listSessionFilesForAgent } from "./session-files.js";
import { requireNodeSqlite } from "./sqlite.js";

const log = createSubsystemLogger("memory/cross-channel");
const _require = createRequire(import.meta.url);

export type CrossChannelSearchResult = {
  /** Session key path (relative), e.g. "sessions/agent:main:telegram:direct:123.jsonl" */
  path: string;
  /** Messaging channel, e.g. "telegram", "discord", "slack" */
  channel: string;
  /** File mtime for relative time display */
  mtimeMs: number;
  /** Matched text excerpt */
  snippet: string;
  /** FTS5 BM25 rank (lower is better; negate for descending sort) */
  score: number;
};

/** Module-level cache — one instance per agentId prevents duplicate intervals. */
const INDEXER_CACHE = new Map<string, CrossChannelIndexer>();

/**
 * Extracts the channel token from a session key's rest segment.
 * Returns null for cron/subagent keys or unrecognized channel tokens.
 */
function extractChannel(sessionKey: string): string | null {
  if (
    isCronRunSessionKey(sessionKey) ||
    isCronSessionKey(sessionKey) ||
    isSubagentSessionKey(sessionKey)
  ) {
    return null;
  }
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed) {
    return null;
  }
  const channel = parsed.rest.split(":")[0]?.trim().toLowerCase() ?? null;
  if (!channel || channel === "unknown") {
    return null;
  }
  return channel;
}

/**
 * Strips slash-command lines (User: /...) from session content text.
 */
function filterSlashCommands(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^User:\s*\//.test(line))
    .join("\n");
}

/**
 * Emits an event to observability.sqlite (best-effort, never throws).
 */
function emitObsEvent(action: string, metadata: Record<string, unknown>): void {
  try {
    const dbPath = path.join(resolveRequiredHomeDir(), ".openclaw", "observability.sqlite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = _require("better-sqlite3");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const db = new Database(dbPath, { timeout: 5000 }) as {
      prepare: (sql: string) => { run: (...args: unknown[]) => void };
      close: () => void;
    };
    try {
      db.prepare(
        `INSERT INTO events (trace_id, timestamp, category, action, metadata)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        `cross-channel-${Date.now()}`,
        new Date().toISOString(),
        "memory",
        action,
        JSON.stringify(metadata),
      );
    } finally {
      db.close();
    }
  } catch {
    // Observability must never throw
  }
}

export class CrossChannelIndexer {
  private readonly agentId: string;
  private readonly dbPath: string;
  private _started = false;
  private _interval: ReturnType<typeof setInterval> | null = null;
  private _schemaEnsured = false;

  private constructor(agentId: string) {
    this.agentId = agentId;
    this.dbPath = path.join(
      resolveRequiredHomeDir(),
      ".openclaw",
      "agents",
      agentId,
      "cross-channel-memory.sqlite",
    );
  }

  /**
   * Returns the singleton CrossChannelIndexer for the given agentId.
   * Creates a new instance if none exists.
   */
  static getInstance(agentId: string): CrossChannelIndexer {
    const cached = INDEXER_CACHE.get(agentId);
    if (cached) {
      return cached;
    }
    const instance = new CrossChannelIndexer(agentId);
    INDEXER_CACHE.set(agentId, instance);
    return instance;
  }

  /**
   * Opens (or re-opens) the cross-channel SQLite database.
   */
  private openDb() {
    const { DatabaseSync } = requireNodeSqlite();
    const db = new DatabaseSync(this.dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    if (!this._schemaEnsured) {
      ensureCrossChannelIndexSchema(db);
      this._schemaEnsured = true;
    }
    return db;
  }

  /**
   * Starts the periodic indexer (every 5 minutes). Idempotent — second call is a no-op.
   * Also runs an immediate sync.
   */
  start(): void {
    if (this._started) {
      return;
    }
    this._started = true;
    this._interval = setInterval(
      () => {
        void this.sync();
      },
      5 * 60 * 1000,
    );
    this._interval.unref?.();
    void this.sync();
  }

  /**
   * Stops the periodic indexer and closes any open resources.
   * Used in tests and graceful shutdown.
   */
  stop(): void {
    if (this._interval !== null) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._started = false;
    // Remove from cache so tests can create fresh instances
    INDEXER_CACHE.delete(this.agentId);
  }

  /**
   * Runs one full indexer pass:
   * 1. Lists all session files for the agent
   * 2. Skips cron, subagent, and slash-command-only content
   * 3. Hash-compares to skip unchanged files
   * 4. Upserts files + chunks, deletes stale entries
   * 5. Emits an observability event with sync metrics
   */
  async sync(): Promise<void> {
    const startMs = Date.now();
    let filesIndexed = 0;
    let filesSkipped = 0;
    const channelsSeen = new Set<string>();

    let db: ReturnType<CrossChannelIndexer["openDb"]> | null = null;
    try {
      // Ensure DB directory exists
      const dbDir = path.dirname(this.dbPath);
      const { mkdirSync } = await import("node:fs");
      try {
        mkdirSync(dbDir, { recursive: true });
      } catch {
        // Ignore if already exists
      }

      db = this.openDb();

      const absPaths = await listSessionFilesForAgent(this.agentId);
      const activePaths = new Set<string>();

      for (const absPath of absPaths) {
        // Derive session key from filename (strip directory + .jsonl extension)
        const sessionKey = path.basename(absPath, ".jsonl");

        // Skip cron, subagent sessions
        const channel = extractChannel(sessionKey);
        if (channel === null) {
          filesSkipped++;
          continue;
        }

        const entry = await buildSessionEntry(absPath);
        if (!entry) {
          filesSkipped++;
          continue;
        }

        // Filter slash commands from content
        const filteredContent = filterSlashCommands(entry.content);
        if (!filteredContent.trim()) {
          filesSkipped++;
          continue;
        }

        activePaths.add(entry.path);
        channelsSeen.add(channel);

        // Hash-compare: skip if unchanged
        const existing = db.prepare("SELECT hash FROM files WHERE path = ?").get(entry.path) as
          | { hash: string }
          | undefined;

        if (existing?.hash === entry.hash) {
          filesSkipped++;
          continue;
        }

        const now = Date.now();

        // Upsert into files table
        db.prepare(
          `INSERT OR REPLACE INTO files (path, agent_id, channel, hash, mtime, size, indexed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(entry.path, this.agentId, channel, entry.hash, entry.mtimeMs, entry.size, now);

        // Replace chunks for this file (delete + insert)
        db.prepare("DELETE FROM chunks WHERE path = ?").run(entry.path);

        const chunkId = `${entry.path}:0`;
        const endLine = entry.lineMap.length > 0 ? entry.lineMap.length - 1 : 0;
        db.prepare(
          `INSERT INTO chunks (id, path, agent_id, channel, start_line, end_line, hash, text, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          chunkId,
          entry.path,
          this.agentId,
          channel,
          0,
          endLine,
          entry.hash,
          filteredContent,
          now,
        );

        filesIndexed++;
      }

      // Purge stale entries (session files that no longer exist)
      const storedPaths = db
        .prepare("SELECT path FROM files WHERE agent_id = ?")
        .all(this.agentId) as Array<{ path: string }>;

      for (const { path: storedPath } of storedPaths) {
        if (!activePaths.has(storedPath)) {
          db.prepare("DELETE FROM chunks WHERE path = ?").run(storedPath);
          db.prepare("DELETE FROM files WHERE path = ?").run(storedPath);
          log.debug(`purged stale session: ${storedPath}`);
        }
      }

      const durationMs = Date.now() - startMs;
      log.debug(
        `sync complete: indexed=${filesIndexed} skipped=${filesSkipped} channels=[${[...channelsSeen].join(",")}] duration=${durationMs}ms`,
      );

      emitObsEvent("cross_channel_index_sync", {
        filesIndexed,
        filesSkipped,
        channelsSeen: [...channelsSeen],
        agentId: this.agentId,
        durationMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`sync error: ${msg}`);
    } finally {
      try {
        db?.close();
      } catch {
        // ignore close errors
      }
    }
  }

  /**
   * Searches indexed sessions using FTS5 full-text search.
   * Excludes the current channel to surface cross-channel context.
   */
  search(params: {
    query: string;
    excludeChannel?: string;
    maxResults?: number;
    minScore?: number;
    charBudget?: number;
  }): CrossChannelSearchResult[] {
    const maxResults = params.maxResults ?? 5;
    const charBudget = params.charBudget ?? 4000;
    const excludeChannel = params.excludeChannel ?? "";

    const safeQuery = buildFtsQuery(params.query);
    if (safeQuery === null) {
      return [];
    }

    let db: ReturnType<CrossChannelIndexer["openDb"]> | null = null;
    try {
      db = this.openDb();

      const rows = db
        .prepare(
          `SELECT c.path, c.channel, f.mtime, c.text, bm25(chunks_fts) AS rank
           FROM chunks_fts
           JOIN chunks c ON chunks_fts.rowid = c.rowid
           JOIN files f ON c.path = f.path
           WHERE chunks_fts MATCH ?
             AND c.agent_id = ?
             AND c.channel != ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(safeQuery, this.agentId, excludeChannel, maxResults) as Array<{
        path: string;
        channel: string;
        mtime: number;
        text: string;
        rank: number;
      }>;

      // Apply charBudget truncation
      const results: CrossChannelSearchResult[] = [];
      let totalChars = 0;

      for (const row of rows) {
        if (params.minScore !== undefined && row.rank > params.minScore) {
          continue;
        }
        const snippet = row.text.slice(0, 500); // cap individual snippet
        if (totalChars + snippet.length > charBudget) {
          break;
        }
        totalChars += snippet.length;
        results.push({
          path: row.path,
          channel: row.channel,
          mtimeMs: row.mtime,
          snippet,
          score: row.rank,
        });
      }

      return results;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`search error: ${msg}`);
      return [];
    } finally {
      try {
        db?.close();
      } catch {
        // ignore close errors
      }
    }
  }
}
