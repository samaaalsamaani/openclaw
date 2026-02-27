/**
 * Universal database initialization helper
 *
 * Ensures all SQLite databases open with WAL mode enabled and busy_timeout set
 * to prevent database locking issues across the system.
 *
 * Pattern: Non-singleton - callers manage connection lifecycle.
 * Different services need different connection lifetimes (embedding server recycles,
 * Gateway long-lived, tests isolated).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

/**
 * Initialize a SQLite database with production-ready settings.
 *
 * Applies:
 * - WAL mode (write-ahead logging) for concurrent read/write access
 * - busy_timeout 5000ms to handle lock contention gracefully
 *
 * @param dbPath Absolute path to the SQLite database file
 * @returns Database instance with WAL mode and busy_timeout configured
 *
 * @example
 * ```typescript
 * import { initDatabase } from "./infra/db-init.js";
 *
 * const db = initDatabase("/path/to/database.sqlite");
 * // Use db with WAL mode + busy_timeout enabled
 * db.close();
 * ```
 */
export function initDatabase(dbPath: string): Database {
  // Dynamic require for better-sqlite3 (native module pattern)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DatabaseConstructor = require("better-sqlite3");
  const db = new DatabaseConstructor(dbPath);

  // Always set busy_timeout first (works regardless of journal mode)
  db.pragma("busy_timeout = 5000");

  // Check current journal mode
  const currentMode = db.pragma("journal_mode", { simple: true }) as string;

  // Enable WAL if not already active
  if (currentMode.toLowerCase() !== "wal") {
    try {
      db.pragma("journal_mode = WAL");

      // Verify WAL was enabled successfully
      const verifyMode = db.pragma("journal_mode", { simple: true }) as string;
      if (verifyMode.toLowerCase() !== "wal") {
        // WAL enable failed - log warning but don't crash (WAL is optimization)
        console.warn(`[db-init] Failed to enable WAL mode for ${dbPath}: mode is ${verifyMode}`);
      }
    } catch (err) {
      // WAL enable threw error - log warning but don't crash
      console.warn(
        `[db-init] Error enabling WAL mode for ${dbPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return db;
}
