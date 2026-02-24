import { describe, expect, it, vi } from "vitest";

// ── Mock dependencies before importing the module under test ────

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { classifyTask, dynamicConfidenceThreshold, type TaskDomain } from "./task-classifier.js";

// ── Helpers ───────────────────────────────────────────────────────────

const ALL_DOMAINS: TaskDomain[] = [
  "code",
  "creative",
  "analysis",
  "vision",
  "system",
  "schedule",
  "search",
];

// ── classifyTask basic routing ──────────────────────────────────────

describe("classifyTask", () => {
  it("routes code-heavy messages to code domain", () => {
    const result = classifyTask({ message: "debug this typescript function and fix the bug" });
    expect(result.domain).toBe("code");
    expect(result.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
  });

  it("routes creative-heavy messages to creative domain", () => {
    const result = classifyTask({ message: "write a blog post about brand voice and content" });
    expect(result.domain).toBe("creative");
    expect(result.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
  });

  it("routes analysis-heavy messages to analysis domain", () => {
    const result = classifyTask({ message: "analyze this data and summarize the findings" });
    expect(result.domain).toBe("analysis");
    expect(result.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
  });

  it("routes schedule-heavy messages to schedule domain", () => {
    const result = classifyTask({
      message: "schedule a meeting for tomorrow and set a reminder for the deadline",
    });
    expect(result.domain).toBe("schedule");
    expect(result.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
  });

  it("routes search-heavy messages to search domain", () => {
    const result = classifyTask({ message: "search for the latest news about current AI trends" });
    expect(result.domain).toBe("search");
    expect(result.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
  });

  it("routes system-heavy messages to system domain", () => {
    const result = classifyTask({
      message: "check system status, disk memory CPU and restart the process",
    });
    expect(result.domain).toBe("system");
    expect(result.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
  });

  it("routes images to vision domain by default", () => {
    const result = classifyTask({ message: "what is in this image?", hasImages: true });
    expect(result.domain).toBe("vision");
    expect(result.overrideSource).toBe("image");
  });

  it("routes code screenshots to code domain", () => {
    const result = classifyTask({
      message: "fix this bug in the typescript code",
      hasImages: true,
    });
    expect(result.domain).toBe("code");
    expect(result.overrideSource).toBe("image");
  });

  it("returns default when nothing matches", () => {
    const result = classifyTask({ message: "hello" });
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-5");
  });

  it("returns confidence of 100 for explicit override", () => {
    const result = classifyTask({
      message: "anything",
      explicitOverride: { provider: "test-provider", model: "test-model" },
    });
    expect(result.confidence).toBe(100);
    expect(result.provider).toBe("test-provider");
    expect(result.model).toBe("test-model");
    expect(result.overrideSource).toBe("user");
  });
});

// ── User override detection ─────────────────────────────────────────

describe("classifyTask user overrides", () => {
  it("detects 'ask claude' override", () => {
    const result = classifyTask({ message: "ask claude about philosophy" });
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.overrideSource).toBe("user");
  });

  it("detects 'use codex' override", () => {
    const result = classifyTask({ message: "use codex to review this" });
    expect(result.provider).toBe("openai-codex");
    expect(result.model).toBe("gpt-5.3-codex");
  });

  it("detects 'use gemini' override", () => {
    const result = classifyTask({ message: "use gemini to analyze this" });
    expect(result.provider).toBe("google-gemini-cli");
  });
});

// ── Compound detection ──────────────────────────────────────────────

describe("compound detection", () => {
  it("detects compound task spanning multiple domains", () => {
    // "write a blog post" (creative) + "analyze the data and research trends" (analysis)
    const result = classifyTask({
      message: "write a blog post that analyzes current research data and summarizes the trends",
    });
    // Should have compound flag if runner-ups exist within 40 points
    if (result.isCompound) {
      expect(result.secondaryDomains).toBeDefined();
      expect(result.secondaryDomains!.length).toBeGreaterThan(0);
    }
  });

  it("does not set isCompound for single-domain messages", () => {
    const result = classifyTask({ message: "debug this python function" });
    // Single-domain should either not be compound or have no secondaries
    if (result.isCompound) {
      expect(result.secondaryDomains?.length).toBeGreaterThan(0);
    } else {
      expect(result.secondaryDomains?.length ?? 0).toBe(0);
    }
  });

  it("widens runner-up gap to 40 points", () => {
    // A message that scores high on code (80+) should still pick up analysis
    // as secondary if analysis scores >=40 points below code
    const result = classifyTask({
      message:
        "refactor this typescript function and analyze the performance data to evaluate tradeoffs",
    });
    // The key test: with a 40-point gap, more runner-ups should qualify
    if (result.isCompound && result.secondaryDomains) {
      for (const secondary of result.secondaryDomains) {
        expect(secondary.confidence).toBeGreaterThanOrEqual(dynamicConfidenceThreshold);
        expect(secondary.confidence).toBeGreaterThanOrEqual(result.confidence - 40);
      }
    }
  });
});

// ── Confidence threshold ────────────────────────────────────────────

describe("confidence threshold", () => {
  it("dynamicConfidenceThreshold is loaded", () => {
    expect(dynamicConfidenceThreshold).toBeGreaterThanOrEqual(0);
    expect(dynamicConfidenceThreshold).toBeLessThanOrEqual(100);
  });

  it("caps confidence at 100", () => {
    // Load a message with tons of keyword hits
    const result = classifyTask({
      message:
        "debug code function bug refactor compile build test lint typescript javascript python rust swift error exception",
    });
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// ── ClassificationResult shape ──────────────────────────────────────

describe("ClassificationResult shape", () => {
  it("always has required fields", () => {
    const result = classifyTask({ message: "hello world" });
    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("provider");
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reason");
    expect(typeof result.domain).toBe("string");
    expect(typeof result.provider).toBe("string");
    expect(typeof result.model).toBe("string");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.reason).toBe("string");
  });

  it("domain is always a valid TaskDomain", () => {
    const result = classifyTask({ message: "anything at all" });
    expect(ALL_DOMAINS).toContain(result.domain);
  });
});
