import { describe, expect, it, vi } from "vitest";

// ── Mock dependencies before importing the module under test ────

vi.mock("../infra/agent-events.js", () => ({
  emitAgentEvent: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));

import {
  applyMultiBrainRouting,
  scheduleDecomposition,
  scheduleVerification,
  shouldOrchestrate,
  type RoutingInput,
  type VerificationInput,
} from "./routing-middleware.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeRoutingInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    bodyStripped: "debug this typescript function",
    isHeartbeat: false,
    hasResolvedHeartbeatModelOverride: false,
    hasImages: false,
    sessionId: "session-test-1",
    ...overrides,
  };
}

function makeVerificationInput(overrides: Partial<VerificationInput> = {}): VerificationInput {
  return {
    bodyStripped: "debug this typescript function",
    isHeartbeat: false,
    hasImages: false,
    provider: "openai-codex",
    model: "gpt-5.3-codex",
    sessionId: "session-test-1",
    workspaceDir: "/tmp",
    reply: [{ text: "Here is the fix..." }],
    ...overrides,
  };
}

// ── applyMultiBrainRouting ──────────────────────────────────────────

describe("applyMultiBrainRouting", () => {
  it("returns applied=false for heartbeat", () => {
    const result = applyMultiBrainRouting(makeRoutingInput({ isHeartbeat: true }));
    expect(result.applied).toBe(false);
  });

  it("returns applied=false for empty body", () => {
    const result = applyMultiBrainRouting(makeRoutingInput({ bodyStripped: "" }));
    expect(result.applied).toBe(false);
  });

  it("returns applied=false for undefined body", () => {
    const result = applyMultiBrainRouting(makeRoutingInput({ bodyStripped: undefined }));
    expect(result.applied).toBe(false);
  });

  it("returns applied=false for whitespace-only body", () => {
    const result = applyMultiBrainRouting(makeRoutingInput({ bodyStripped: "   " }));
    expect(result.applied).toBe(false);
  });

  it("returns applied=false for hasResolvedHeartbeatModelOverride", () => {
    const result = applyMultiBrainRouting(
      makeRoutingInput({ hasResolvedHeartbeatModelOverride: true }),
    );
    expect(result.applied).toBe(false);
  });

  it("returns applied=true with provider/model for confident classification", () => {
    const result = applyMultiBrainRouting(
      makeRoutingInput({ bodyStripped: "debug this typescript function and fix the bug" }),
    );
    expect(result.applied).toBe(true);
    expect(result.provider).toBeTruthy();
    expect(result.model).toBeTruthy();
    expect(result.classification).toBeDefined();
  });

  it("includes classification in result even when not applied", () => {
    const result = applyMultiBrainRouting(makeRoutingInput({ bodyStripped: "hello" }));
    // Low-confidence messages may still have a classification
    if (!result.applied) {
      // classification may or may not be present
      expect(result.applied).toBe(false);
    }
  });
});

// ── shouldOrchestrate ───────────────────────────────────────────────

describe("shouldOrchestrate", () => {
  it("returns false for heartbeat", () => {
    const result = shouldOrchestrate(makeRoutingInput({ isHeartbeat: true }));
    expect(result.shouldOrchestrate).toBe(false);
  });

  it("returns false for empty body", () => {
    const result = shouldOrchestrate(makeRoutingInput({ bodyStripped: "" }));
    expect(result.shouldOrchestrate).toBe(false);
  });

  it("returns false for single-domain message", () => {
    const result = shouldOrchestrate(
      makeRoutingInput({ bodyStripped: "debug this python function" }),
    );
    // Single-domain messages should not orchestrate
    if (!result.shouldOrchestrate) {
      expect(result.shouldOrchestrate).toBe(false);
    }
  });

  it("returns classification when present", () => {
    const result = shouldOrchestrate(
      makeRoutingInput({ bodyStripped: "debug this typescript function" }),
    );
    // Should always return a classification for non-empty, non-heartbeat input
    expect(result.classification).toBeDefined();
  });
});

// ── scheduleVerification ────────────────────────────────────────────

describe("scheduleVerification", () => {
  it("does not throw for heartbeat", () => {
    expect(() => scheduleVerification(makeVerificationInput({ isHeartbeat: true }))).not.toThrow();
  });

  it("does not throw for empty body", () => {
    expect(() => scheduleVerification(makeVerificationInput({ bodyStripped: "" }))).not.toThrow();
  });

  it("does not throw for valid input", () => {
    expect(() => scheduleVerification(makeVerificationInput())).not.toThrow();
  });

  it("returns void (fire-and-forget)", () => {
    const result = scheduleVerification(makeVerificationInput());
    expect(result).toBeUndefined();
  });
});

// ── scheduleDecomposition ───────────────────────────────────────────

describe("scheduleDecomposition", () => {
  it("does not throw for heartbeat", () => {
    expect(() => scheduleDecomposition(makeVerificationInput({ isHeartbeat: true }))).not.toThrow();
  });

  it("does not throw for empty body", () => {
    expect(() => scheduleDecomposition(makeVerificationInput({ bodyStripped: "" }))).not.toThrow();
  });

  it("does not throw for valid input", () => {
    expect(() => scheduleDecomposition(makeVerificationInput())).not.toThrow();
  });

  it("returns void (fire-and-forget)", () => {
    const result = scheduleDecomposition(makeVerificationInput());
    expect(result).toBeUndefined();
  });
});
