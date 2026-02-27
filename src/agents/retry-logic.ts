/**
 * Retry transient failures with exponential backoff, circuit breaker protection, and observability logging.
 *
 * Use this for all external integration calls (SDK, MCP, subprocess) that may fail transiently.
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(async () => callMcpTool("kb_query", { query: "AI" }), {
 *   name: "mcp:kb_query",
 *   circuitKey: "mcp-kb-server",
 * });
 * ```
 */

import { CircuitBreaker } from "../infra/circuit-breaker.js";
import { getObservabilityDbPath } from "../infra/observability-db.js";
import { FailoverError } from "./failover-error.js";
import type { FailoverReason } from "./pi-embedded-helpers/types.js";

// Retryable network error codes
const RETRYABLE_ERRORS: Set<string> = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE"]);

// Retryable HTTP status codes (transient server errors)
const RETRYABLE_HTTP_CODES: Set<number> = new Set([429, 503, 504]);

// Permanent HTTP status codes (client errors)
const PERMANENT_HTTP_CODES: Set<number> = new Set([400, 401, 403, 404]);

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

// Circuit breaker instances keyed by circuit key
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Classify error as retryable or permanent.
 *
 * Retryable errors:
 * - Network errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, EPIPE
 * - HTTP 429 (rate limit), 503 (service unavailable), 504 (gateway timeout)
 * - FailoverError with reason: timeout, network
 *
 * Permanent errors (fail immediately):
 * - HTTP 400, 401, 403, 404
 * - FailoverError with reason: auth, rate_limit (already handled by provider)
 */
export function isRetryableError(error: unknown): boolean {
  // Handle FailoverError classification
  if (error instanceof FailoverError) {
    // Timeouts are permanent failures (operation was killed after exceeding limit)
    // Only retry truly unknown errors that might be transient
    const retryableReasons: Set<FailoverReason> = new Set(["unknown"]);
    return retryableReasons.has(error.reason);
  }

  // Check for network error codes
  if (error && typeof error === "object") {
    const code = (error as { code?: string }).code;
    if (code && RETRYABLE_ERRORS.has(code)) {
      return true;
    }

    // Check HTTP status codes
    const status =
      (error as { status?: number }).status ?? (error as { statusCode?: number }).statusCode;
    if (typeof status === "number") {
      if (PERMANENT_HTTP_CODES.has(status)) {
        return false;
      }
      if (RETRYABLE_HTTP_CODES.has(status)) {
        return true;
      }
    }
  }

  // Default: not retryable
  return false;
}

/**
 * Get or create circuit breaker instance for the given key.
 */
function getCircuitBreaker(key: string): CircuitBreaker {
  let breaker = circuitBreakers.get(key);
  if (!breaker) {
    breaker = new CircuitBreaker(key, {
      failureThreshold: 5,
      timeoutMs: 60_000, // 1 minute
    });
    circuitBreakers.set(key, breaker);
  }
  return breaker;
}

/**
 * Retry operation with exponential backoff and circuit breaker protection.
 *
 * - Max 3 retries with exponential backoff (1s, 2s, 4s, 8s)
 * - Checks circuit breaker before retry loop
 * - Resets breaker on success
 * - Opens breaker after exhausted retries
 * - Logs final failure to observability
 *
 * @param operation - Async function to retry
 * @param context - Context for logging and circuit breaker
 * @returns Result of successful operation
 * @throws Last error if all retries exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  context: { name: string; circuitKey?: string },
): Promise<T> {
  const circuitKey = context.circuitKey;
  const breaker = circuitKey ? getCircuitBreaker(circuitKey) : undefined;

  // Check circuit breaker state before attempting
  if (breaker) {
    const state = breaker.getState();
    if (state === "open") {
      // Circuit is open - fail fast
      throw new Error(`Circuit breaker open for ${circuitKey}`);
    }
  }

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      // Wrap operation in circuit breaker if available
      const result = breaker ? await breaker.execute(operation) : await operation();

      // Success - reset breaker (already done by breaker.execute if used)
      return result;
    } catch (error) {
      lastError = error;
      attempt++;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        // Permanent error - fail immediately without retry
        if (breaker) {
          breaker.getFailureCount(); // Track failure but don't increment (permanent errors shouldn't trigger circuit)
        }
        throw error;
      }

      // If we've exhausted retries, break
      if (attempt > MAX_RETRIES) {
        break;
      }

      // Calculate backoff delay (exponential: 1s, 2s, 4s, 8s)
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted - log failure and throw
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  logIntegrationFailure({
    integration: context.name,
    error: errorMessage,
    retryCount: MAX_RETRIES,
    timestamp: Date.now(),
  });

  throw lastError;
}

/**
 * Log integration failure to observability database after all retries exhausted.
 *
 * Logs to events table:
 * - category: 'integration'
 * - event_type: 'failure'
 * - metadata: { integration, error, retry_count }
 *
 * Handles SQLite errors gracefully (logs to stderr, doesn't crash).
 */
export function logIntegrationFailure(params: {
  integration: string;
  error: string;
  retryCount: number;
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
        integration: params.integration,
        error: params.error,
        retry_count: params.retryCount,
      });

      const stmt = db.prepare(`
        INSERT INTO events (timestamp, category, action, metadata)
        VALUES (?, 'integration', 'failure', ?)
      `);

      stmt.run(params.timestamp, metadata);
    } finally {
      db.close();
    }
  } catch (err) {
    // Log to stderr but don't crash
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to log integration failure to observability: ${message}`);
  }
}
