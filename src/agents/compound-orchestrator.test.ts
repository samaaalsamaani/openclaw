import { describe, expect, it, vi } from "vitest";
import type { ClassificationResult } from "./task-classifier.js";

// ── Mock heavy dependencies before importing the module under test ────

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({}),
}));

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

const runCliAgentMock = vi.fn();
vi.mock("./cli-runner.js", () => ({
  runCliAgent: (...args: unknown[]) => runCliAgentMock(...args),
}));

// Mock node:sqlite to avoid touching real DB
const dbExecMock = vi.fn();
const dbCloseMock = vi.fn();
const stmtRunMock = vi.fn();
vi.mock("node:sqlite", () => ({
  DatabaseSync: class {
    exec = dbExecMock;
    close = dbCloseMock;
    prepare = () => ({ run: stmtRunMock });
  },
}));

// Mock execFile to avoid spawning processes
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as typeof import("node:child_process")), execFile: vi.fn() };
});

// Mock compound-merger
const mergeSubTaskResultsMock = vi.fn();
vi.mock("./compound-merger.js", () => ({
  mergeSubTaskResults: (...args: unknown[]) => mergeSubTaskResultsMock(...args),
}));

import { orchestrateCompoundTask } from "./compound-orchestrator.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    domain: "creative",
    provider: "anthropic",
    model: "claude-opus-4-6",
    confidence: 89,
    reason: "keyword match",
    isCompound: true,
    secondaryDomains: [{ domain: "analysis", confidence: 78 }],
    ...overrides,
  };
}

const baseInput = {
  originalPrompt: "Write a blog post analyzing AI trends",
  sessionId: "session-test-1",
  workspaceDir: "/tmp",
  timeoutMs: 60_000,
};

// ── orchestrateCompoundTask ─────────────────────────────────────────

describe("orchestrateCompoundTask", () => {
  it("returns null when no secondary domains", async () => {
    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification({ secondaryDomains: [] }),
    });
    expect(result).toBeNull();
  });

  it("executes primary + secondary in parallel", async () => {
    runCliAgentMock.mockClear();
    runCliAgentMock.mockResolvedValue({ payloads: [{ text: "Response content" }] });
    mergeSubTaskResultsMock.mockResolvedValue("Merged response");

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    expect(result).not.toBeNull();
    expect(result!.subTasks).toHaveLength(2); // primary + 1 secondary
    // CLI agent called twice: once for primary (creative), once for secondary (analysis)
    expect(runCliAgentMock).toHaveBeenCalledTimes(2);
  });

  it("returns merged text when secondaries succeed", async () => {
    runCliAgentMock.mockResolvedValue({ payloads: [{ text: "Content" }] });
    mergeSubTaskResultsMock.mockResolvedValue("Merged final text");

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    expect(result!.mergedText).toBe("Merged final text");
    expect(result!.didMerge).toBe(true);
  });

  it("returns primary content when all secondaries fail", async () => {
    runCliAgentMock
      .mockResolvedValueOnce({ payloads: [{ text: "Primary response" }] })
      .mockRejectedValueOnce(new Error("Secondary failed"));

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    expect(result).not.toBeNull();
    expect(result!.mergedText).toBe("Primary response");
    expect(result!.didMerge).toBe(false);
  });

  it("returns null when primary fails", async () => {
    runCliAgentMock.mockRejectedValue(new Error("CLI crashed"));

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    expect(result).toBeNull();
  });

  it("handles DOMAIN_NOT_RELEVANT secondary results", async () => {
    runCliAgentMock
      .mockResolvedValueOnce({ payloads: [{ text: "Primary response" }] })
      .mockResolvedValueOnce({ payloads: [{ text: "DOMAIN_NOT_RELEVANT" }] });

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    // The secondary returned empty content, so no merge
    expect(result).not.toBeNull();
    expect(result!.mergedText).toBe("Primary response");
    expect(result!.didMerge).toBe(false);
  });

  it("stores handoffs in database", async () => {
    stmtRunMock.mockClear();
    runCliAgentMock.mockResolvedValue({ payloads: [{ text: "Content" }] });
    mergeSubTaskResultsMock.mockResolvedValue("Merged");

    await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    // 2 handoffs: primary + 1 secondary
    expect(stmtRunMock).toHaveBeenCalledTimes(2);
  });

  it("handles multiple secondary domains", async () => {
    runCliAgentMock.mockClear();
    runCliAgentMock.mockResolvedValue({ payloads: [{ text: "Content" }] });
    mergeSubTaskResultsMock.mockResolvedValue("Merged multi");

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification({
        secondaryDomains: [
          { domain: "analysis", confidence: 78 },
          { domain: "search", confidence: 75 },
        ],
      }),
    });

    expect(result!.subTasks).toHaveLength(3); // primary + 2 secondaries
    expect(runCliAgentMock).toHaveBeenCalledTimes(3);
  });

  it("includes duration tracking in results", async () => {
    runCliAgentMock.mockResolvedValue({ payloads: [{ text: "Content" }] });
    mergeSubTaskResultsMock.mockResolvedValue("Merged");

    const result = await orchestrateCompoundTask({
      ...baseInput,
      classification: makeClassification(),
    });

    expect(result!.totalDurationMs).toBeGreaterThanOrEqual(0);
    for (const subTask of result!.subTasks) {
      expect(subTask.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
