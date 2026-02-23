/**
 * Channel Health Observability — emits structured events to the PAIOS observability DB
 * for channel lifecycle, connection state, and health monitor actions.
 *
 * Uses the same schema as ~/.openclaw/projects/observability/events.js but writes
 * directly from the gateway process via node:sqlite to avoid child-process overhead.
 *
 * Category: "channel"
 * Actions: start, stop, error, health_restart
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

const log = createSubsystemLogger("channel/events");

const DB_DIR = join(process.env.HOME ?? "/tmp", ".openclaw");
const DB_PATH = join(DB_DIR, "observability.sqlite");

let db: DatabaseSync | null = null;
let initFailed = false;

function getDb(): DatabaseSync | null {
  if (db) {
    return db;
  }
  if (initFailed) {
    return null;
  }

  try {
    const { DatabaseSync } = requireNodeSqlite();
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    return db;
  } catch (err) {
    initFailed = true;
    log.warn?.(`observability DB unavailable, channel events will be skipped: ${String(err)}`);
    return null;
  }
}

function generateTraceId(): string {
  const ts = Date.now().toString(16);
  const rand = randomBytes(4).toString("hex");
  return `t-${ts}-${rand}`;
}

export type ChannelEventAction = "start" | "stop" | "error" | "health_restart";

type ChannelEventData = {
  channelId: string;
  accountId?: string;
  action: ChannelEventAction;
  metadata?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
};

/**
 * Emit a channel health event to the observability DB.
 * Fire-and-forget — never throws.
 */
export function emitChannelEvent(data: ChannelEventData): void {
  try {
    const connection = getDb();
    if (!connection) {
      return;
    }

    const traceId = generateTraceId();
    const meta = {
      channelId: data.channelId,
      accountId: data.accountId ?? "default",
      ...data.metadata,
    };

    connection
      .prepare(
        `INSERT INTO events (trace_id, category, action, source, metadata, duration_ms, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        traceId,
        "channel",
        data.action,
        `channel/${data.channelId}`,
        JSON.stringify(meta),
        data.durationMs ?? null,
        data.error ?? null,
      );
  } catch (err) {
    // Swallow — observability must never crash the gateway
    log.warn?.(`failed to emit channel event: ${String(err)}`);
  }
}
