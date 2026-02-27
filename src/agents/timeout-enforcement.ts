/**
 * Enforce timeouts on async operations using AbortController.
 *
 * Use this for all integration calls that need cancellation (MCP, SDK, subprocess).
 *
 * @example
 * ```typescript
 * const result = await callWithTimeout(
 *   async (signal) => fetch(url, { signal }),
 *   MCP_TIMEOUT_MS,
 *   "mcp:external-api",
 * );
 * ```
 */

import { getObservabilityDbPath } from "../infra/observability-db.js";

/** Default timeout for MCP calls (30 seconds) */
export const MCP_TIMEOUT_MS = 30_000;

/** Default timeout for SDK calls (120 seconds / 2 minutes) */
export const SDK_TIMEOUT_MS = 120_000;

/**
 * Execute an async operation with a timeout.
 *
 * Creates an AbortController, sets a timeout to abort after timeoutMs,
 * passes the signal to the operation, and cleans up the timeout handle.
 *
 * @param operation - Async function that accepts an AbortSignal
 * @param timeoutMs - Timeout in milliseconds
 * @param context - Context string for logging (e.g., "mcp:kb_query")
 * @returns Result of successful operation
 * @throws Error if operation times out or fails
 */
export async function callWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  const controller = new AbortController();
  const signal = controller.signal;

  // Set up timeout
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    // Execute operation with signal
    const result = await operation(signal);

    // Success - return result
    return result;
  } catch (error) {
    // Check if this was an abort/timeout
    if (signal.aborted) {
      // Log timeout to observability
      logTimeout({
        integration: context,
        timeoutMs,
        timestamp: Date.now(),
      });

      throw new Error(`Operation timed out after ${timeoutMs}ms: ${context}`, { cause: error });
    }

    // Re-throw other errors
    throw error;
  } finally {
    // Always clear timeout to prevent leaks
    clearTimeout(timeoutHandle);
  }
}

/**
 * Log timeout event to observability database.
 *
 * Logs to events table:
 * - category: 'integration'
 * - event_type: 'timeout'
 * - metadata: { integration, timeout_ms }
 *
 * Handles SQLite errors gracefully (logs to stderr, doesn't crash).
 */
function logTimeout(params: { integration: string; timeoutMs: number; timestamp: number }): void {
  // Skip logging in test environment if better-sqlite3 is not available
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    try {
      // Try to load better-sqlite3, but if it fails (missing bindings), skip silently
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require.resolve("better-sqlite3");
    } catch {
      // Better-sqlite3 not available (bindings not built) - skip logging in tests
      return;
    }
  }

  try {
    // Dynamic import to avoid issues with native modules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const dbPath = getObservabilityDbPath();
    const db = new Database(dbPath, { timeout: 5000 });

    try {
      const metadata = JSON.stringify({
        integration: params.integration,
        timeout_ms: params.timeoutMs,
      });

      const stmt = db.prepare(`
        INSERT INTO events (timestamp, category, action, metadata)
        VALUES (?, 'integration', 'timeout', ?)
      `);

      stmt.run(params.timestamp, metadata);
    } finally {
      db.close();
    }
  } catch (err) {
    // Log to stderr but don't crash
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to log timeout to observability: ${message}`);
  }
}
