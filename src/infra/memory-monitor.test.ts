import { beforeEach, describe, expect, it, vi } from "vitest";
import { startMemoryMonitoring, _getMemoryHistory, _triggerMemoryCheck } from "./memory-monitor.js";

describe("memory-monitor", () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  it("returns cleanup function", () => {
    const cleanup = startMemoryMonitoring();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("tracks memory history with FIFO behavior", () => {
    vi.useFakeTimers();
    const cleanup = startMemoryMonitoring();

    // Simulate 15 memory checks (should only keep last 12)
    for (let i = 0; i < 15; i++) {
      _triggerMemoryCheck();
    }

    const history = _getMemoryHistory();
    expect(history.length).toBe(12);

    cleanup();
    vi.useRealTimers();
  });

  it("calculates growth rate accurately", () => {
    vi.useFakeTimers();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock process.memoryUsage to return predictable values
    let mockHeapUsed = 100 * 1048576; // Start at 100MB
    vi.spyOn(process, "memoryUsage").mockImplementation(() => ({
      rss: 0,
      heapTotal: 0,
      heapUsed: mockHeapUsed,
      external: 0,
      arrayBuffers: 0,
    }));

    const cleanup = startMemoryMonitoring();

    // Create 12 samples with linear growth of 2MB per minute
    // First sample at 100MB, last sample at 122MB = 22MB growth over 12 minutes = 110 MB/hour
    // To get 120 MB/hour, we need 24MB growth: 2MB * 12 intervals
    // So increase BEFORE checking (except first time)
    _triggerMemoryCheck(); // First sample: 100MB
    for (let i = 1; i < 12; i++) {
      mockHeapUsed += 2 * 1048576; // Increase by 2MB
      _triggerMemoryCheck(); // Sample at 102, 104, 106... 122MB
    }

    // Should have warned about high growth rate (>10 MB/hour threshold)
    expect(consoleWarnSpy).toHaveBeenCalled();

    // Check the final warning (last call) which has full 12-sample window
    // Growth: 100MB → 122MB = 22MB over 12 min = (22 * 60 / 12) = 110 MB/hour
    const finalWarnCall = consoleWarnSpy.mock.calls[consoleWarnSpy.mock.calls.length - 1][0];
    expect(finalWarnCall).toContain("memory-leak-warning");
    expect(finalWarnCall).toContain("110.0 MB/hour");

    cleanup();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not alert for growth below threshold", () => {
    vi.useFakeTimers();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock process.memoryUsage with minimal growth
    let mockHeapUsed = 100 * 1048576; // Start at 100MB
    vi.spyOn(process, "memoryUsage").mockImplementation(() => ({
      rss: 0,
      heapTotal: 0,
      heapUsed: mockHeapUsed,
      external: 0,
      arrayBuffers: 0,
    }));

    const cleanup = startMemoryMonitoring();

    // Create 12 samples with minimal growth
    // To stay under 10MB/hour at ALL window sizes (not just final), use tiny growth
    // Use 0.1MB per interval: 11 * 0.1 = 1.1MB total over 12 min = 5.5 MB/hour (safe)
    _triggerMemoryCheck(); // First sample: 100MB
    for (let i = 1; i < 12; i++) {
      mockHeapUsed += 0.1 * 1048576; // Increase by 0.1MB
      _triggerMemoryCheck();
    }

    // Should NOT have warned (5.5 MB/hour is below 10 MB/hour threshold)
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    cleanup();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("alerts for growth above threshold", () => {
    vi.useFakeTimers();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Mock process.memoryUsage with significant growth
    let mockHeapUsed = 100 * 1048576; // Start at 100MB
    vi.spyOn(process, "memoryUsage").mockImplementation(() => ({
      rss: 0,
      heapTotal: 0,
      heapUsed: mockHeapUsed,
      external: 0,
      arrayBuffers: 0,
    }));

    const cleanup = startMemoryMonitoring();

    // Create 12 samples with 1MB per minute growth
    // This should result in 60MB/hour growth rate (well above 10MB/hour threshold)
    _triggerMemoryCheck(); // First sample
    for (let i = 1; i < 12; i++) {
      mockHeapUsed += 1 * 1048576; // Increase by 1MB
      _triggerMemoryCheck();
    }

    // Should have warned
    expect(consoleWarnSpy).toHaveBeenCalled();
    const warnCall = consoleWarnSpy.mock.calls[0][0];
    expect(warnCall).toContain("memory-leak-warning");

    cleanup();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("cleanup stops monitoring interval", () => {
    vi.useFakeTimers();

    const cleanup = startMemoryMonitoring();

    // Trigger some checks
    _triggerMemoryCheck();
    _triggerMemoryCheck();

    const historyBeforeCleanup = _getMemoryHistory();
    expect(historyBeforeCleanup.length).toBeGreaterThan(0);

    // Cleanup should clear history
    cleanup();

    const historyAfterCleanup = _getMemoryHistory();
    expect(historyAfterCleanup.length).toBe(0);

    vi.useRealTimers();
  });
});
