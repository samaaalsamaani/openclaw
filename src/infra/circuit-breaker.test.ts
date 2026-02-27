import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker } from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows calls in closed state", async () => {
    const breaker = new CircuitBreaker("test-service");

    const mockFn = vi.fn(async () => "success");
    const result = await breaker.execute(mockFn);

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalled();
    expect(breaker.getState()).toBe("closed");
  });

  it("opens after 5 consecutive failures", async () => {
    const breaker = new CircuitBreaker("test-service", { failureThreshold: 5 });

    const mockFn = vi.fn(async () => {
      throw new Error("Service unavailable");
    });

    // Trigger 5 failures
    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(mockFn)).rejects.toThrow("Service unavailable");
    }

    expect(breaker.getState()).toBe("open");
    expect(breaker.getFailureCount()).toBe(5);
  });

  it("stays open for configured timeout", async () => {
    const breaker = new CircuitBreaker("test-service", {
      failureThreshold: 2,
      timeoutMs: 5000,
    });

    const mockFn = vi.fn(async () => {
      throw new Error("Fail");
    });

    // Open the circuit
    await expect(breaker.execute(mockFn)).rejects.toThrow("Fail");
    await expect(breaker.execute(mockFn)).rejects.toThrow("Fail");
    expect(breaker.getState()).toBe("open");

    // Try before timeout - should still be open and reject immediately
    vi.advanceTimersByTime(3000);
    const mockSuccessFn = vi.fn(async () => "success");
    await expect(breaker.execute(mockSuccessFn)).rejects.toThrow("Circuit breaker open");
    expect(mockSuccessFn).not.toHaveBeenCalled(); // Function should NOT execute
    expect(breaker.getState()).toBe("open");
  });

  it("transitions to half-open after timeout", async () => {
    const breaker = new CircuitBreaker("test-service", {
      failureThreshold: 2,
      timeoutMs: 5000,
    });

    const mockFn = vi.fn(async () => {
      throw new Error("Fail");
    });

    // Open the circuit
    await expect(breaker.execute(mockFn)).rejects.toThrow("Fail");
    await expect(breaker.execute(mockFn)).rejects.toThrow("Fail");
    expect(breaker.getState()).toBe("open");

    // Advance past timeout
    vi.advanceTimersByTime(5000);

    // Next call should transition to half-open
    const mockSuccessFn = vi.fn(async () => "success");
    await breaker.execute(mockSuccessFn);

    expect(mockSuccessFn).toHaveBeenCalled();
    expect(breaker.getState()).toBe("closed"); // Success in half-open closes it
  });

  it("closes on success in half-open state", async () => {
    const breaker = new CircuitBreaker("test-service", {
      failureThreshold: 2,
      timeoutMs: 1000,
    });

    // Open the circuit
    const failFn = vi.fn(async () => {
      throw new Error("Fail");
    });
    await expect(breaker.execute(failFn)).rejects.toThrow("Fail");
    await expect(breaker.execute(failFn)).rejects.toThrow("Fail");
    expect(breaker.getState()).toBe("open");

    // Advance past timeout to half-open
    vi.advanceTimersByTime(1000);

    // Successful call in half-open should close circuit
    const successFn = vi.fn(async () => "recovered");
    const result = await breaker.execute(successFn);

    expect(result).toBe("recovered");
    expect(breaker.getState()).toBe("closed");
    expect(breaker.getFailureCount()).toBe(0);
  });

  it("reopens on failure in half-open state", async () => {
    const breaker = new CircuitBreaker("test-service", {
      failureThreshold: 2,
      timeoutMs: 1000,
    });

    // Open the circuit
    const failFn = vi.fn(async () => {
      throw new Error("Fail");
    });
    await expect(breaker.execute(failFn)).rejects.toThrow("Fail");
    await expect(breaker.execute(failFn)).rejects.toThrow("Fail");
    expect(breaker.getState()).toBe("open");

    // Advance past timeout to half-open
    vi.advanceTimersByTime(1000);

    // Failed call in half-open should reopen circuit
    await expect(breaker.execute(failFn)).rejects.toThrow("Fail");
    expect(breaker.getState()).toBe("open");
    expect(breaker.getFailureCount()).toBe(3);
  });

  it("rejects immediately when open without executing function", async () => {
    const breaker = new CircuitBreaker("test-service", { failureThreshold: 1 });

    // Open the circuit with one failure
    const failFn = vi.fn(async () => {
      throw new Error("Fail");
    });
    await expect(breaker.execute(failFn)).rejects.toThrow("Fail");
    expect(breaker.getState()).toBe("open");

    // Try to call - should reject immediately without calling function
    const mockFn = vi.fn(async () => "should not execute");
    await expect(breaker.execute(mockFn)).rejects.toThrow("Circuit breaker open for test-service");
    expect(mockFn).not.toHaveBeenCalled();
  });
});
