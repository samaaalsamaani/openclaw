/**
 * Circuit breaker pattern for protecting against cascading failures.
 *
 * Prevents cascading failures by stopping calls to failing services after
 * a threshold is reached, giving them time to recover.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit */
  failureThreshold?: number;
  /** Milliseconds to wait before attempting recovery (half-open) */
  timeoutMs?: number;
  /** Milliseconds between state checks (unused in current implementation) */
  monitorIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  timeoutMs: 60_000, // 1 minute
  monitorIntervalMs: 1_000,
};

/**
 * Circuit breaker for protecting external service calls.
 *
 * State machine:
 * - closed (normal): Calls pass through
 * - open (failing): Calls rejected immediately
 * - half-open (testing): Single call allowed to test recovery
 *
 * Transitions:
 * - closed → open: After N consecutive failures
 * - open → half-open: After timeout period
 * - half-open → closed: On successful call
 * - half-open → open: On failed call
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime: number | undefined;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(
    private readonly key: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a function with circuit breaker protection.
   *
   * @throws Error if circuit is open
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from open to half-open
    if (this.state === "open" && this.shouldAttemptRecovery()) {
      this.state = "half-open";
    }

    // Reject immediately if open
    if (this.state === "open") {
      throw new Error(`Circuit breaker open for ${this.key}`);
    }

    try {
      const result = await fn();
      // Success - reset failure count and close circuit
      this.onSuccess();
      return result;
    } catch (err) {
      // Failure - track and potentially open circuit
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Open circuit if threshold exceeded
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
    }
  }

  private shouldAttemptRecovery(): boolean {
    if (!this.lastFailureTime) {
      return false;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return elapsed >= this.options.timeoutMs;
  }

  /** Get current circuit state (for testing/monitoring) */
  getState(): CircuitState {
    return this.state;
  }

  /** Get current failure count (for testing/monitoring) */
  getFailureCount(): number {
    return this.failureCount;
  }
}
