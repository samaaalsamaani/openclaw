/**
 * Crash logger for service failures — writes crash events to observability.sqlite
 *
 * Records process exits, crashes, and fatal errors with context for root cause analysis.
 * Uses better-sqlite3 for reliable writes even during process teardown.
 */

import path from "node:path";

interface CrashLogParams {
  serviceName: string;
  exitCode: number | null;
  signal: string | null;
  restartAttempt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

/**
 * Open observability database connection with crash-safe settings.
 * Singleton pattern — connection stays open for fast writes.
 */
function getDb() {
  if (db) {
    return db;
  }

  const dbPath = path.join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

  // Dynamic require for better-sqlite3 (native module pattern)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  db = new Database(dbPath);
  db.pragma("busy_timeout = 5000");

  return db;
}

/**
 * Log service crash to observability.sqlite for analysis.
 *
 * Inserts event with:
 * - category: 'system'
 * - event_type: 'service_crash'
 * - metadata: JSON with exit details
 *
 * Degrades gracefully — logs to stderr if DB write fails, never crashes.
 */
export function logServiceCrash(params: CrashLogParams): void {
  try {
    const database = getDb();

    const metadata = {
      exitCode: params.exitCode,
      signal: params.signal,
      restartAttempt: params.restartAttempt,
      timestamp: new Date().toISOString(),
    };

    const stmt = database.prepare(`
      INSERT INTO events (timestamp, category, event_type, service_name, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(Date.now(), "system", "service_crash", params.serviceName, JSON.stringify(metadata));
  } catch (err) {
    // Degradation: log to stderr but don't crash on crash logger failure
    console.error(
      "[crash-logger] Failed to log crash:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Close database connection (for test cleanup).
 * Not normally needed in production — connection stays open until process exit.
 */
export function closeCrashLogger(): void {
  if (db) {
    db.close();
    db = null;
  }
}
