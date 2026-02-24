import { describe, expect, it, vi } from "vitest";
import type { ClassificationResult, TaskDomain } from "./task-classifier.js";

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

import { DOMAIN_GUIDANCE, ENRICHMENT_TABLE } from "./compound-shared.js";
import { buildEnrichmentPrompt, executeDecomposition, shouldDecompose } from "./task-decomposer.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    domain: "creative",
    provider: "anthropic",
    model: "claude-opus-4-6",
    confidence: 89,
    reason: "keyword match",
    isCompound: false,
    secondaryDomains: [],
    ...overrides,
  };
}

// ── shouldDecompose ──────────────────────────────────────────────────

describe("shouldDecompose", () => {
  it("returns false for non-compound task", () => {
    expect(shouldDecompose(makeClassification())).toBe(false);
  });

  it("returns false when isCompound=true but no secondary domains", () => {
    expect(shouldDecompose(makeClassification({ isCompound: true, secondaryDomains: [] }))).toBe(
      false,
    );
  });

  it("returns false when secondaryDomains is undefined", () => {
    expect(
      shouldDecompose(makeClassification({ isCompound: true, secondaryDomains: undefined })),
    ).toBe(false);
  });

  it("returns true when isCompound and has secondary domains", () => {
    expect(
      shouldDecompose(
        makeClassification({
          isCompound: true,
          secondaryDomains: [{ domain: "search", confidence: 81 }],
        }),
      ),
    ).toBe(true);
  });

  it("returns true with multiple secondary domains", () => {
    expect(
      shouldDecompose(
        makeClassification({
          isCompound: true,
          secondaryDomains: [
            { domain: "search", confidence: 81 },
            { domain: "analysis", confidence: 78 },
          ],
        }),
      ),
    ).toBe(true);
  });
});

// ── buildEnrichmentPrompt ────────────────────────────────────────────

describe("buildEnrichmentPrompt", () => {
  it("includes domain name and guidance", () => {
    const prompt = buildEnrichmentPrompt("code", "Write an API", "Here is the API...");
    expect(prompt).toContain("code specialist enrichment agent");
    expect(prompt).toContain("Domain: code");
    expect(prompt).toContain(DOMAIN_GUIDANCE.code);
  });

  it("includes original prompt and primary reply", () => {
    const prompt = buildEnrichmentPrompt("search", "Find recent AI news", "AI news from...");
    expect(prompt).toContain("--- ORIGINAL USER PROMPT ---");
    expect(prompt).toContain("Find recent AI news");
    expect(prompt).toContain("--- PRIMARY RESPONSE (already delivered) ---");
    expect(prompt).toContain("AI news from...");
  });

  it("truncates long prompts at 1000 chars", () => {
    const longPrompt = "x".repeat(2000);
    const prompt = buildEnrichmentPrompt("analysis", longPrompt, "reply");
    expect(prompt).toContain("... (truncated)");
    // The original prompt should be cut to 1000 chars
    expect(prompt).not.toContain("x".repeat(2000));
  });

  it("truncates long replies at 4000 chars", () => {
    const longReply = "y".repeat(5000);
    const prompt = buildEnrichmentPrompt("creative", "question", longReply);
    expect(prompt).toContain("... (truncated)");
    expect(prompt).not.toContain("y".repeat(5000));
  });

  it("does not truncate short content", () => {
    const prompt = buildEnrichmentPrompt("system", "short prompt", "short reply");
    expect(prompt).not.toContain("(truncated)");
  });

  it("uses fallback guidance for unknown domain", () => {
    const prompt = buildEnrichmentPrompt("unknownDomain" as TaskDomain, "q", "a");
    expect(prompt).toContain("factual accuracy, completeness");
  });

  it("includes enrichment instructions", () => {
    const prompt = buildEnrichmentPrompt("code", "q", "a");
    expect(prompt).toContain("ENRICHMENT_NOT_NEEDED");
    expect(prompt).toContain("2-4 paragraphs");
    expect(prompt).toContain("SUPPLEMENTARY");
  });

  it("covers all known domains with specific guidance", () => {
    const domains: TaskDomain[] = [
      "code",
      "creative",
      "analysis",
      "search",
      "vision",
      "system",
      "schedule",
    ];
    for (const domain of domains) {
      const prompt = buildEnrichmentPrompt(domain, "q", "a");
      expect(prompt).toContain(`Domain: ${domain}`);
      expect(prompt).toContain(DOMAIN_GUIDANCE[domain]);
    }
  });
});

// ── executeDecomposition ─────────────────────────────────────────────

describe("executeDecomposition", () => {
  const baseReq = {
    classification: makeClassification({
      isCompound: true,
      secondaryDomains: [{ domain: "search" as TaskDomain, confidence: 81 }],
    }),
    originalPrompt: "Research AI and write a blog post",
    primaryReplyText: "Here is a blog post about AI...",
    originalProvider: "anthropic",
    originalModel: "claude-opus-4-6",
    runId: "run-123",
    workspaceDir: "/tmp",
  };

  it("returns empty array when no secondary domains", async () => {
    const result = await executeDecomposition({
      ...baseReq,
      classification: makeClassification({ secondaryDomains: [] }),
    });
    expect(result).toEqual([]);
    expect(runCliAgentMock).not.toHaveBeenCalled();
  });

  it("runs enrichment for each secondary domain", async () => {
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: "Enrichment content here" }],
    });

    const result = await executeDecomposition(baseReq);

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("search");
    expect(result[0].content).toBe("Enrichment content here");
    expect(result[0].provider).toBe(ENRICHMENT_TABLE.search.provider);
    expect(result[0].model).toBe(ENRICHMENT_TABLE.search.model);
    expect(result[0].error).toBeUndefined();
    expect(result[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("runs multiple secondary domains in parallel", async () => {
    runCliAgentMock.mockClear();
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: "enriched" }],
    });

    const req = {
      ...baseReq,
      classification: makeClassification({
        isCompound: true,
        secondaryDomains: [
          { domain: "search" as TaskDomain, confidence: 81 },
          { domain: "analysis" as TaskDomain, confidence: 78 },
        ],
      }),
    };

    const result = await executeDecomposition(req);

    expect(result).toHaveLength(2);
    expect(result[0].domain).toBe("search");
    expect(result[1].domain).toBe("analysis");
    expect(runCliAgentMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty content for ENRICHMENT_NOT_NEEDED", async () => {
    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: "ENRICHMENT_NOT_NEEDED" }],
    });

    const result = await executeDecomposition(baseReq);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("");
    expect(result[0].error).toBeUndefined();
  });

  it("handles CLI runner errors gracefully", async () => {
    runCliAgentMock.mockRejectedValue(new Error("CLI timed out"));

    const result = await executeDecomposition(baseReq);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("");
    expect(result[0].error).toBe("CLI timed out");
  });

  it("handles mixed success and failure", async () => {
    runCliAgentMock
      .mockResolvedValueOnce({ payloads: [{ text: "Good enrichment" }] })
      .mockRejectedValueOnce(new Error("Timeout"));

    const req = {
      ...baseReq,
      classification: makeClassification({
        isCompound: true,
        secondaryDomains: [
          { domain: "search" as TaskDomain, confidence: 81 },
          { domain: "code" as TaskDomain, confidence: 83 },
        ],
      }),
    };

    const result = await executeDecomposition(req);

    expect(result).toHaveLength(2);
    // One should succeed, one should fail
    const success = result.find((r) => !r.error);
    const failure = result.find((r) => r.error);
    expect(success).toBeDefined();
    expect(success!.content).toBe("Good enrichment");
    expect(failure).toBeDefined();
    expect(failure!.error).toBe("Timeout");
  });

  it("stores enrichment in handoffs DB", async () => {
    stmtRunMock.mockClear();
    dbExecMock.mockClear();
    dbCloseMock.mockClear();

    runCliAgentMock.mockResolvedValue({
      payloads: [{ text: "Stored enrichment" }],
    });

    await executeDecomposition(baseReq);

    expect(stmtRunMock).toHaveBeenCalledTimes(1);
    const args = stmtRunMock.mock.calls[0];
    expect(args[0]).toBe("anthropic/claude-opus-4-6"); // from_brain
    expect(args[1]).toBe("search"); // to_domain
    expect(args[4]).toContain("Research AI"); // context (truncated prompt)
    expect(args[5]).toBe("completed"); // status
    expect(args[6]).toBe("Stored enrichment"); // result
    expect(dbCloseMock).toHaveBeenCalled();
  });

  it("stores failed enrichment with error status", async () => {
    stmtRunMock.mockClear();

    runCliAgentMock.mockRejectedValue(new Error("Agent crashed"));

    await executeDecomposition(baseReq);

    const args = stmtRunMock.mock.calls[0];
    expect(args[5]).toBe("failed");
    expect(args[6]).toBe("Agent crashed");
  });

  it("passes correct provider/model to CLI runner", async () => {
    runCliAgentMock.mockClear();
    runCliAgentMock.mockResolvedValue({ payloads: [{ text: "ok" }] });

    await executeDecomposition(baseReq);

    const call = runCliAgentMock.mock.calls[0][0] as {
      provider: string;
      model: string;
      timeoutMs: number;
    };
    // search domain maps to claude-cli via PROVIDER_TO_CLI (anthropic → claude-cli)
    expect(call.provider).toBe("claude-cli");
    expect(call.model).toBe("claude-haiku-4-5");
    expect(call.timeoutMs).toBe(30_000);
  });

  it("handles empty payloads gracefully", async () => {
    runCliAgentMock.mockResolvedValue({ payloads: [] });

    const result = await executeDecomposition(baseReq);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("");
  });
});

// ── compound-shared constants ────────────────────────────────────────

describe("compound-shared constants", () => {
  it("ENRICHMENT_TABLE covers all TaskDomain values", () => {
    const domains: TaskDomain[] = [
      "code",
      "creative",
      "analysis",
      "search",
      "vision",
      "system",
      "schedule",
    ];
    for (const domain of domains) {
      expect(ENRICHMENT_TABLE[domain]).toBeDefined();
      expect(ENRICHMENT_TABLE[domain].provider).toBeTruthy();
      expect(ENRICHMENT_TABLE[domain].model).toBeTruthy();
    }
  });

  it("DOMAIN_GUIDANCE covers all TaskDomain values", () => {
    const domains: TaskDomain[] = [
      "code",
      "creative",
      "analysis",
      "search",
      "vision",
      "system",
      "schedule",
    ];
    for (const domain of domains) {
      expect(DOMAIN_GUIDANCE[domain]).toBeTruthy();
    }
  });
});
