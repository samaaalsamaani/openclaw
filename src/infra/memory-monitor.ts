/**
 * Memory monitoring module for detecting potential memory leaks.
 *
 * Tracks heap usage over time and alerts when growth rate exceeds threshold.
 * Helps catch leaks before they cause OOM crashes.
 */

const MEMORY_CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds
const MEMORY_GROWTH_THRESHOLD_MB = 10; // Alert if growing >10MB/hour
const HISTORY_SIZE = 12; // Track last 12 minutes (12 samples)

let monitoringInterval: NodeJS.Timeout | undefined;
let memoryHistory: number[] = [];

/**
 * Start monitoring memory usage. Checks heap every 60 seconds and alerts
 * if growth rate exceeds 10MB/hour.
 *
 * @returns Cleanup function to stop monitoring
 */
export function startMemoryMonitoring(): () => void {
  // Clear any existing monitoring
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  // Reset history
  memoryHistory = [];

  // Start monitoring loop
  monitoringInterval = setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1048576); // bytes to MB

    // Add to history (FIFO circular buffer)
    memoryHistory.push(heapUsedMB);
    if (memoryHistory.length > HISTORY_SIZE) {
      memoryHistory.shift();
    }

    // Only check growth if we have enough samples
    if (memoryHistory.length >= 2) {
      const oldest = memoryHistory[0];
      const newest = memoryHistory[memoryHistory.length - 1];
      const windowSizeMinutes = memoryHistory.length;

      // Calculate growth rate in MB/hour
      const growthMB = newest - oldest;
      const growthRateMBPerHour = (growthMB * 60) / windowSizeMinutes;

      // Alert if exceeding threshold
      if (growthRateMBPerHour > MEMORY_GROWTH_THRESHOLD_MB) {
        console.warn(
          `[memory-leak-warning] Heap growing ${growthRateMBPerHour.toFixed(1)} MB/hour (current: ${heapUsedMB}MB, window: ${windowSizeMinutes} min)`,
        );
      }
    }
  }, MEMORY_CHECK_INTERVAL_MS);

  // Return cleanup function
  return () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = undefined;
    }
    memoryHistory = [];
  };
}

/**
 * Get current memory history (for testing)
 * @internal
 */
export function _getMemoryHistory(): number[] {
  return [...memoryHistory];
}

/**
 * Force a memory check (for testing)
 * @internal
 */
export function _triggerMemoryCheck(): void {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1048576);
  memoryHistory.push(heapUsedMB);
  if (memoryHistory.length > HISTORY_SIZE) {
    memoryHistory.shift();
  }

  // Check growth rate (same logic as in interval)
  if (memoryHistory.length >= 2) {
    const oldest = memoryHistory[0];
    const newest = memoryHistory[memoryHistory.length - 1];
    const windowSizeMinutes = memoryHistory.length;

    // Calculate growth rate in MB/hour
    const growthMB = newest - oldest;
    const growthRateMBPerHour = (growthMB * 60) / windowSizeMinutes;

    // Alert if exceeding threshold
    if (growthRateMBPerHour > MEMORY_GROWTH_THRESHOLD_MB) {
      console.warn(
        `[memory-leak-warning] Heap growing ${growthRateMBPerHour.toFixed(1)} MB/hour (current: ${heapUsedMB}MB, window: ${windowSizeMinutes} min)`,
      );
    }
  }
}
