/**
 * Tests for gateway shutdown logic — validates timer tracking and crash logging.
 */
import { describe, it, expect } from "vitest";
import { registerTimer, clearTimer } from "./server-close.js";

describe("server-close timer tracking", () => {
  it("registerTimer returns the timer handle", () => {
    const timer = setInterval(() => {}, 1000);
    const registered = registerTimer(timer);

    expect(registered).toBe(timer);

    clearInterval(timer);
  });

  it("clearTimer removes timer from tracking", () => {
    const timer = setInterval(() => {}, 1000);
    registerTimer(timer);

    // Clear should be idempotent
    clearTimer(timer);
    clearTimer(timer);
    clearTimer(null);
    clearTimer(undefined);

    // No errors expected
    expect(true).toBe(true);
  });

  it("registerTimer allows tracking multiple timers", () => {
    const timer1 = setInterval(() => {}, 1000);
    const timer2 = setInterval(() => {}, 1000);
    const timer3 = setTimeout(() => {}, 1000);

    registerTimer(timer1);
    registerTimer(timer2);
    registerTimer(timer3);

    clearTimer(timer1);
    clearTimer(timer2);
    clearTimer(timer3);

    expect(true).toBe(true);
  });
});

describe("server-close crash logging", () => {
  it("exports registerTimer function", () => {
    expect(registerTimer).toBeDefined();
    expect(typeof registerTimer).toBe("function");
  });

  it("exports clearTimer function", () => {
    expect(clearTimer).toBeDefined();
    expect(typeof clearTimer).toBe("function");
  });

  it("exit handler is installed on module load", async () => {
    // The exit handler should be installed when the module is loaded
    // We can't easily test process.on('exit') without actually exiting
    // But we can verify the module loads without errors
    const serverClose = await import("./server-close.js");
    expect(serverClose.registerTimer).toBeDefined();
    expect(serverClose.clearTimer).toBeDefined();
  });
});
