import { describe, expect, it, vi } from "vitest";
import type { TaskDomain } from "./task-classifier.js";

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

// Mock node:child_process to avoid spawning processes
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as typeof import("node:child_process")), execFile: vi.fn() };
});

import {
  buildVerificationPrompt,
  executeVerification,
  getVerifier,
  shouldVerify,
  type VerificationRequest,
} from "./verification.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<VerificationRequest> = {}): VerificationRequest {
  return {
    domain: "code",
    originalProvider: "openai-codex",
    originalModel: "gpt-5.3-codex",
    responseText: "Here is the code solution...",
    originalPrompt: "Fix the bug in my function",
    runId: "run-test-123",
    workspaceDir: "/tmp",
    ...overrides,
  };
}

// ── shouldVerify ────────────────────────────────────────────────────

describe("shouldVerify", () => {
  it("returns true for code domain with high confidence", () => {
    expect(shouldVerify("code", 85)).toBe(true);
  });

  it("returns true for creative domain with high confidence", () => {
    expect(shouldVerify("creative", 90)).toBe(true);
  });

  it("returns true for analysis domain with high confidence", () => {
    expect(shouldVerify("analysis", 80)).toBe(true);
  });

  it("returns true for search domain with high confidence", () => {
    expect(shouldVerify("search", 82)).toBe(true);
  });

  it("returns false for system domain (not verifiable)", () => {
    expect(shouldVerify("system", 90)).toBe(false);
  });

  it("returns false for schedule domain (not verifiable)", () => {
    expect(shouldVerify("schedule", 95)).toBe(false);
  });

  it("returns false for vision domain (not verifiable)", () => {
    expect(shouldVerify("vision", 95)).toBe(false);
  });

  it("returns false for low confidence even on verifiable domain", () => {
    expect(shouldVerify("code", 70)).toBe(false);
  });

  it("returns true at exactly 80 confidence", () => {
    expect(shouldVerify("code", 80)).toBe(true);
  });

  it("returns false at 79 confidence", () => {
    expect(shouldVerify("code", 79)).toBe(false);
  });
});

// ── getVerifier ─────────────────────────────────────────────────────

describe("getVerifier", () => {
  const ALL_DOMAINS: TaskDomain[] = [
    "code",
    "creative",
    "analysis",
    "vision",
    "system",
    "schedule",
    "search",
  ];

  it("returns anthropic/haiku for all domains", () => {
    for (const domain of ALL_DOMAINS) {
      const verifier = getVerifier(domain);
      expect(verifier.provider).toBe("anthropic");
      expect(verifier.model).toBe("claude-haiku-4-5");
    }
  });

  it("falls back to code verifier for unknown domain", () => {
    const verifier = getVerifier("unknown" as TaskDomain);
    expect(verifier.provider).toBe("anthropic");
    expect(verifier.model).toBe("claude-haiku-4-5");
  });

  it("never returns google-gemini-cli (not a valid CLI backend)", () => {
    for (const domain of ALL_DOMAINS) {
      const verifier = getVerifier(domain);
      expect(verifier.provider).not.toBe("google-gemini-cli");
    }
  });
});

// ── buildVerificationPrompt ─────────────────────────────────────────

describe("buildVerificationPrompt", () => {
  it("includes domain and original model", () => {
    const prompt = buildVerificationPrompt(makeRequest());
    expect(prompt).toContain("Domain: code");
    expect(prompt).toContain("openai-codex/gpt-5.3-codex");
  });

  it("includes original prompt and response", () => {
    const prompt = buildVerificationPrompt(makeRequest());
    expect(prompt).toContain("Fix the bug in my function");
    expect(prompt).toContain("Here is the code solution...");
  });

  it("includes code-specific guidance for code domain", () => {
    const prompt = buildVerificationPrompt(makeRequest({ domain: "code" }));
    expect(prompt).toContain("bugs, security issues");
  });

  it("includes creative-specific guidance for creative domain", () => {
    const prompt = buildVerificationPrompt(makeRequest({ domain: "creative" }));
    expect(prompt).toContain("tone consistency");
  });

  it("includes analysis-specific guidance for analysis domain", () => {
    const prompt = buildVerificationPrompt(makeRequest({ domain: "analysis" }));
    expect(prompt).toContain("factual accuracy");
  });

  it("includes search-specific guidance for search domain", () => {
    const prompt = buildVerificationPrompt(makeRequest({ domain: "search" }));
    expect(prompt).toContain("stale or outdated");
  });

  it("truncates long prompts at 1000 chars", () => {
    const prompt = buildVerificationPrompt(makeRequest({ originalPrompt: "x".repeat(2000) }));
    expect(prompt).toContain("... (truncated)");
  });

  it("truncates long responses at 4000 chars", () => {
    const prompt = buildVerificationPrompt(makeRequest({ responseText: "y".repeat(5000) }));
    expect(prompt).toContain("... (truncated)");
  });

  it("requests JSON response format", () => {
    const prompt = buildVerificationPrompt(makeRequest());
    expect(prompt).toContain("JSON object");
    expect(prompt).toContain('"passed"');
  });
});

// ── executeVerification ─────────────────────────────────────────────

describe("executeVerification", () => {
  it("returns parsed JSON result on valid response", async () => {
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: '{"passed": true, "confidence": 92, "issues": []}' }],
    });

    const result = await executeVerification(makeRequest());

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(92);
    expect(result.issues).toEqual([]);
    expect(result.verifierProvider).toBe("anthropic");
    expect(result.verifierModel).toBe("claude-haiku-4-5");
  });

  it("returns parsed result with issues", async () => {
    runCliAgentMock.mockResolvedValue({
      payloads: [
        {
          text: '{"passed": false, "confidence": 45, "issues": ["Missing error handling", "SQL injection risk"]}',
        },
      ],
    });

    const result = await executeVerification(makeRequest());

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(45);
    expect(result.issues).toHaveLength(2);
  });

  it("assumes pass on CLI failure", async () => {
    runCliAgentMock.mockRejectedValue(new Error("CLI timed out"));

    const result = await executeVerification(makeRequest());

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.issues).toContain("Verification agent failed to respond");
  });

  it("uses heuristic fallback for non-JSON response", async () => {
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: "The response looks good and has no issues." }],
    });

    const result = await executeVerification(makeRequest());

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(30); // heuristic confidence
  });

  it("emits observability events", async () => {
    const { execFile } = await import("node:child_process");
    const execFileFn = vi.mocked(execFile);
    execFileFn.mockClear();
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: '{"passed": true, "confidence": 90, "issues": []}' }],
    });

    await executeVerification(makeRequest());

    // Should call execFile for routing event + score event
    expect(execFileFn).toHaveBeenCalledTimes(2);
  });

  it("passes correct provider to CLI runner (claude-cli, not gemini-cli)", async () => {
    runCliAgentMock.mockClear();
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: '{"passed": true, "confidence": 90, "issues": []}' }],
    });

    await executeVerification(makeRequest({ domain: "creative" }));

    const call = runCliAgentMock.mock.calls[0][0] as { provider: string; model: string };
    expect(call.provider).toBe("claude-cli"); // anthropic resolves to claude-cli
    expect(call.model).toBe("claude-haiku-4-5");
  });
});
