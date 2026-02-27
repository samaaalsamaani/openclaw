/**
 * Hook Error Boundary
 *
 * Wraps plugin hooks in error boundaries to prevent hook failures from crashing
 * the Gateway. All hook errors are caught, logged to observability, and handled
 * gracefully without propagating to the event loop.
 *
 * Created: Phase 17 Plan 03 (Integration Reliability)
 */

import { getObservabilityDbPath } from "../infra/observability-db.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("hook-executor");

/**
 * Hook handler function type (async or sync).
 * Matches the plugin hook system's handler signature.
 */
export type HookHandler = (event: HookEvent) => Promise<void> | void;

/**
 * Hook event passed to handlers.
 * Minimal interface - actual events have more fields.
 */
export interface HookEvent {
  type: string;
  action: string;
  sessionKey?: string;
  [key: string]: unknown;
}

/**
 * Wrap a hook handler in an error boundary.
 *
 * The wrapped handler will:
 * - Catch all exceptions (sync and async)
 * - Log errors to console with full context
 * - Log errors to observability.sqlite
 * - NEVER throw (returns gracefully)
 *
 * This prevents hook failures from crashing the Gateway or blocking main operations.
 *
 * @param hookName - Name of the hook (e.g., "PostToolUse")
 * @param handler - Original hook handler
 * @returns Wrapped handler that catches and logs errors
 *
 * @example
 * ```typescript
 * const safeHandler = wrapHookWithErrorBoundary("PostToolUse", async (event) => {
 *   // ... hook logic that might throw ...
 * });
 * ```
 */
export function wrapHookWithErrorBoundary(hookName: string, handler: HookHandler): HookHandler {
  return async (event: HookEvent) => {
    try {
      await handler(event);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log to console with full context
      log.error(
        `[hook-error] ${hookName} failed for ${event.type}:${event.action} ` +
          `session=${event.sessionKey ?? "unknown"}: ${errorMessage}`,
      );

      // Log to observability database
      logHookFailure({
        hookName,
        eventType: event.type,
        eventAction: event.action,
        sessionKey: event.sessionKey ?? "unknown",
        error: errorMessage,
        stack: errorStack,
        timestamp: Date.now(),
      });

      // CRITICAL: Don't throw—hook failures shouldn't block main operation
    }
  };
}

/**
 * Log hook failure to observability database.
 *
 * Logs to events table:
 * - category: 'hook'
 * - event_type: 'error'
 * - metadata: { hook_name, event_type, event_action, session_key, error, stack }
 *
 * Handles SQLite errors gracefully (logs to stderr, doesn't crash).
 *
 * @param params - Hook failure details
 */
export function logHookFailure(params: {
  hookName: string;
  eventType: string;
  eventAction: string;
  sessionKey: string;
  error: string;
  stack?: string;
  timestamp: number;
}): void {
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
        hook_name: params.hookName,
        event_type: params.eventType,
        event_action: params.eventAction,
        session_key: params.sessionKey,
        error: params.error,
        stack: params.stack,
      });

      const stmt = db.prepare(`
        INSERT INTO events (timestamp, category, action, metadata)
        VALUES (?, 'hook', 'error', ?)
      `);

      stmt.run(params.timestamp, metadata);
    } finally {
      db.close();
    }
  } catch (err) {
    // Don't crash if observability logging fails
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[observability] Failed to log hook failure: ${message}`);
  }
}

/**
 * Register a hook with error boundary protection.
 *
 * This is a convenience function that wraps the handler in an error boundary
 * before registering it with the plugin hook system.
 *
 * @param hookName - Name of the hook
 * @param handler - Hook handler to wrap and register
 *
 * @example
 * ```typescript
 * registerSafeHook("PostToolUse", async (event) => {
 *   // ... hook logic ...
 * });
 * ```
 */
export function registerSafeHook(hookName: string, handler: HookHandler): void {
  const wrappedHandler = wrapHookWithErrorBoundary(hookName, handler);

  // Import and call existing registerHook function from the plugin system
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerInternalHook } = require("./hook-runner-global.js");
  registerInternalHook(hookName, wrappedHandler);
}
