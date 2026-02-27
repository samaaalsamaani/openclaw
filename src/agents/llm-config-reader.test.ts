import { mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadLlmConfig,
  lookupModel,
  resolveTier,
  resolveRoutingDomain,
  resolveRoutingVerifier,
  resolveRoutingEnrichment,
  resolveRoutingMerger,
  resolveSubsystem,
  getSubsystemFallbackChain,
  getDomainScoring,
  getDomainGuidance,
  getConfidenceThreshold,
  resolveUserPhrase,
  getModelCost,
  _resetCache,
  type LLMConfig,
} from "./llm-config-reader.js";

// Minimal valid config for testing
function makeConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return {
    version: 1,
    models: {
      "anthropic/claude-sonnet-4-6": {
        provider: "anthropic",
        apiModelId: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        capabilities: ["text", "image", "reasoning"],
        cost: { input: 3.0, output: 15.0 },
      },
      "anthropic/claude-opus-4-6": {
        provider: "anthropic",
        apiModelId: "claude-opus-4-6",
        displayName: "Claude Opus 4.6",
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        capabilities: ["text", "image", "reasoning"],
        cost: { input: 15.0, output: 75.0 },
      },
      "openai/gpt-4.1": {
        provider: "openai",
        apiModelId: "gpt-4.1",
        displayName: "GPT-4.1",
        contextWindow: 1_048_576,
        maxTokens: 32_768,
        capabilities: ["text", "image"],
        cost: { input: 2.0, output: 8.0 },
      },
      "openai-codex/gpt-5.3-codex": {
        provider: "openai-codex",
        apiModelId: "gpt-5.3-codex",
        displayName: "GPT-5.3 Codex",
        capabilities: ["text", "code"],
        cost: { input: 2.0, output: 8.0 },
      },
    },
    tiers: {
      fast: {
        description: "Low-latency, cost-effective.",
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: ["openai/gpt-4.1"],
        providerPreference: ["cli", "openai", "anthropic"],
        defaults: { maxTokens: 512, temperature: 0.3, thinking: false, retries: 1 },
      },
      deep: {
        description: "Complex reasoning.",
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: ["openai/gpt-4.1"],
        defaults: { maxTokens: 2048, temperature: 0.7, thinking: true, retries: 2 },
      },
      premium: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["anthropic/claude-sonnet-4-6"],
        defaults: { maxTokens: 4096, temperature: 0.8, thinking: true, retries: 2 },
      },
      code: {
        primary: "openai-codex/gpt-5.3-codex",
        fallbacks: ["anthropic/claude-sonnet-4-6"],
        defaults: { maxTokens: 4096, temperature: 0.2, thinking: false, retries: 2 },
      },
    },
    routing: {
      domains: {
        code: {
          primary: { tier: "code" },
          verifier: { tier: "deep" },
          enrichment: { tier: "code" },
          fallbacks: ["anthropic/claude-sonnet-4-6", "openai/gpt-4.1"],
          scoring: { baseConfidence: 80, keywordBoost: 3, patternBoost: 5 },
          guidance: {
            enrichment: "Focus on code examples.",
            verification: "Check for bugs.",
          },
        },
        creative: {
          primary: { tier: "premium" },
          verifier: { tier: "deep" },
          enrichment: { tier: "premium" },
          fallbacks: ["anthropic/claude-sonnet-4-6"],
        },
        analysis: {
          primary: { tier: "deep" },
          verifier: { tier: "deep" },
          enrichment: { tier: "deep" },
        },
      },
      default: { tier: "fast" },
      confidenceThreshold: 70,
      weights: { keywordMultiplier: 3, patternMultiplier: 5 },
      merger: { tier: "deep" },
    },
    subsystems: {
      kb: {
        enrichment: { tier: "deep" },
        decisions: { tier: "deep" },
        search: { tier: "fast" },
        default: { tier: "fast" },
        fallbackChain: ["cli", "openai", "anthropic"],
      },
      ceo: {
        briefing: { tier: "deep" },
        default: { tier: "deep" },
      },
      voice: {
        stt: { model: "openai/gpt-4.1" },
      },
    },
    overrides: {
      precedence: ["@prefix", "explicit-api", "user-phrase"],
      userPhrases: {
        "ask claude": "anthropic/claude-opus-4-6",
        "use codex": "openai-codex/gpt-5.3-codex",
      },
    },
    ...overrides,
  };
}

describe("llm-config-reader", () => {
  // ── loadLlmConfig (file loading + caching) ───────────────────────

  describe("loadLlmConfig", () => {
    let testDir: string;
    const originalEnv = { ...process.env };

    beforeEach(() => {
      _resetCache();
      testDir = join(tmpdir(), `llm-config-test-${Date.now()}`);
      mkdirSync(join(testDir, ".openclaw"), { recursive: true });
      process.env.HOME = testDir;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it("returns null when feature flag is off", () => {
      delete process.env.PAIOS_LLM_CONFIG;
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, JSON.stringify(makeConfig()));
      expect(loadLlmConfig()).toBeNull();
    });

    it("returns null when config file does not exist", () => {
      process.env.PAIOS_LLM_CONFIG = "1";
      expect(loadLlmConfig()).toBeNull();
    });

    it("loads a valid config file", () => {
      process.env.PAIOS_LLM_CONFIG = "1";
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, JSON.stringify(makeConfig()));
      const config = loadLlmConfig();
      expect(config).not.toBeNull();
      expect(config!.version).toBe(1);
      expect(Object.keys(config!.models)).toContain("anthropic/claude-sonnet-4-6");
    });

    it("returns null for invalid version", () => {
      process.env.PAIOS_LLM_CONFIG = "1";
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, JSON.stringify({ ...makeConfig(), version: 99 }));
      expect(loadLlmConfig()).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      process.env.PAIOS_LLM_CONFIG = "1";
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, "not-json{{{");
      expect(loadLlmConfig()).toBeNull();
    });

    it("uses cached config on same mtime", () => {
      process.env.PAIOS_LLM_CONFIG = "1";
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, JSON.stringify(makeConfig()));
      const first = loadLlmConfig();
      const second = loadLlmConfig();
      expect(first).toBe(second); // same reference = cached
    });

    it("reloads when mtime changes", () => {
      process.env.PAIOS_LLM_CONFIG = "1";
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, JSON.stringify(makeConfig()));
      const first = loadLlmConfig();
      // Touch with a different mtime
      const future = new Date(Date.now() + 10000);
      utimesSync(configFile, future, future);
      const second = loadLlmConfig();
      expect(first).not.toBe(second); // different reference = reloaded
    });
  });

  // ── lookupModel ─────────────────────────────────────────────────

  describe("lookupModel", () => {
    it("returns ref and entry for existing model", () => {
      const config = makeConfig();
      const result = lookupModel(config, "anthropic/claude-sonnet-4-6");
      expect(result).not.toBeNull();
      expect(result!.ref.provider).toBe("anthropic");
      expect(result!.ref.model).toBe("claude-sonnet-4-6");
      expect(result!.entry.apiModelId).toBe("claude-sonnet-4-6");
    });

    it("returns null for missing model", () => {
      const config = makeConfig();
      expect(lookupModel(config, "anthropic/claude-nonexistent")).toBeNull();
    });

    it("normalizes codex provider correctly", () => {
      const config = makeConfig();
      const result = lookupModel(config, "openai-codex/gpt-5.3-codex");
      expect(result).not.toBeNull();
      expect(result!.ref.provider).toBe("openai-codex");
      expect(result!.ref.model).toBe("gpt-5.3-codex");
    });
  });

  // ── resolveTier ─────────────────────────────────────────────────

  describe("resolveTier", () => {
    it("resolves fast tier with defaults and fallbacks", () => {
      const config = makeConfig();
      const result = resolveTier(config, "fast");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("anthropic");
      expect(result!.model).toBe("claude-sonnet-4-6");
      expect(result!.apiModelId).toBe("claude-sonnet-4-6");
      expect(result!.config).toEqual({
        maxTokens: 512,
        temperature: 0.3,
        thinking: false,
        retries: 1,
      });
      expect(result!.fallbacks).toHaveLength(1);
      expect(result!.fallbacks![0].model).toBe("gpt-4.1");
    });

    it("resolves code tier to codex", () => {
      const config = makeConfig();
      const result = resolveTier(config, "code");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("openai-codex");
      expect(result!.model).toBe("gpt-5.3-codex");
    });

    it("resolves premium tier to opus", () => {
      const config = makeConfig();
      const result = resolveTier(config, "premium");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("anthropic");
      expect(result!.model).toBe("claude-opus-4-6");
    });

    it("returns null for nonexistent tier", () => {
      const config = makeConfig();
      expect(resolveTier(config, "nonexistent")).toBeNull();
    });

    it("returns null when tier references missing model", () => {
      const config = makeConfig();
      config.tiers.broken = { primary: "anthropic/does-not-exist" };
      expect(resolveTier(config, "broken")).toBeNull();
    });
  });

  // ── resolveRoutingDomain ────────────────────────────────────────

  describe("resolveRoutingDomain", () => {
    it("resolves code domain via code tier", () => {
      const config = makeConfig();
      const result = resolveRoutingDomain(config, "code");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("openai-codex");
      expect(result!.model).toBe("gpt-5.3-codex");
      // Domain-level fallbacks should be attached
      expect(result!.fallbacks).toHaveLength(2);
    });

    it("resolves creative domain via premium tier", () => {
      const config = makeConfig();
      const result = resolveRoutingDomain(config, "creative");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("anthropic");
      expect(result!.model).toBe("claude-opus-4-6");
    });

    it("falls back to routing default for unmapped domain", () => {
      const config = makeConfig();
      const result = resolveRoutingDomain(config, "search");
      expect(result).not.toBeNull();
      // search is not in our test domains, should use routing.default = fast tier
      expect(result!.provider).toBe("anthropic");
      expect(result!.model).toBe("claude-sonnet-4-6");
    });

    it("returns null when routing config is missing", () => {
      const config = makeConfig({ routing: undefined });
      expect(resolveRoutingDomain(config, "code")).toBeNull();
    });
  });

  // ── resolveRoutingVerifier / resolveRoutingEnrichment ───────────

  describe("resolveRoutingVerifier", () => {
    it("resolves verifier for code domain", () => {
      const config = makeConfig();
      const result = resolveRoutingVerifier(config, "code");
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6"); // deep tier
    });

    it("returns null when no verifier configured", () => {
      const config = makeConfig();
      expect(resolveRoutingVerifier(config, "search")).toBeNull();
    });
  });

  describe("resolveRoutingEnrichment", () => {
    it("resolves enrichment for code domain", () => {
      const config = makeConfig();
      const result = resolveRoutingEnrichment(config, "code");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("openai-codex"); // code tier
    });
  });

  // ── resolveRoutingMerger ────────────────────────────────────────

  describe("resolveRoutingMerger", () => {
    it("resolves merger model", () => {
      const config = makeConfig();
      const result = resolveRoutingMerger(config);
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6"); // deep tier
    });

    it("returns null when no merger configured", () => {
      const config = makeConfig({ routing: { domains: {} } });
      expect(resolveRoutingMerger(config)).toBeNull();
    });
  });

  // ── resolveSubsystem ────────────────────────────────────────────

  describe("resolveSubsystem", () => {
    it("resolves specific task within a subsystem", () => {
      const config = makeConfig();
      const result = resolveSubsystem(config, "kb", "enrichment");
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6"); // deep tier
      expect(result!.config?.thinking).toBe(true);
    });

    it("falls back to subsystem default when task not found", () => {
      const config = makeConfig();
      const result = resolveSubsystem(config, "kb", "unknown-task");
      expect(result).not.toBeNull();
      expect(result!.config?.maxTokens).toBe(512); // fast tier defaults
    });

    it("resolves direct model reference in subsystem", () => {
      const config = makeConfig();
      const result = resolveSubsystem(config, "voice", "stt");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("openai");
      expect(result!.model).toBe("gpt-4.1");
    });

    it("returns null for missing subsystem", () => {
      const config = makeConfig();
      expect(resolveSubsystem(config, "nonexistent")).toBeNull();
    });

    it("resolves with no task (uses default)", () => {
      const config = makeConfig();
      const result = resolveSubsystem(config, "ceo");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(true); // deep tier
    });
  });

  // ── getSubsystemFallbackChain ───────────────────────────────────

  describe("getSubsystemFallbackChain", () => {
    it("returns fallback chain for kb", () => {
      const config = makeConfig();
      const chain = getSubsystemFallbackChain(config, "kb");
      expect(chain).toEqual(["cli", "openai", "anthropic"]);
    });

    it("returns null when no chain configured", () => {
      const config = makeConfig();
      expect(getSubsystemFallbackChain(config, "ceo")).toBeNull();
    });
  });

  // ── getDomainScoring / getDomainGuidance ────────────────────────

  describe("getDomainScoring", () => {
    it("returns scoring for code domain", () => {
      const config = makeConfig();
      const scoring = getDomainScoring(config, "code");
      expect(scoring).toEqual({ baseConfidence: 80, keywordBoost: 3, patternBoost: 5 });
    });

    it("returns null for domain without scoring", () => {
      const config = makeConfig();
      expect(getDomainScoring(config, "analysis")).toBeNull();
    });
  });

  describe("getDomainGuidance", () => {
    it("returns guidance for code domain", () => {
      const config = makeConfig();
      const guidance = getDomainGuidance(config, "code");
      expect(guidance).not.toBeNull();
      expect(guidance!.enrichment).toContain("code examples");
      expect(guidance!.verification).toContain("bugs");
    });
  });

  // ── getConfidenceThreshold ──────────────────────────────────────

  describe("getConfidenceThreshold", () => {
    it("returns configured threshold", () => {
      const config = makeConfig();
      expect(getConfidenceThreshold(config)).toBe(70);
    });

    it("returns null when routing missing", () => {
      const config = makeConfig({ routing: undefined });
      expect(getConfidenceThreshold(config)).toBeNull();
    });
  });

  // ── resolveUserPhrase ───────────────────────────────────────────

  describe("resolveUserPhrase", () => {
    it("resolves 'ask claude' to opus", () => {
      const config = makeConfig();
      const result = resolveUserPhrase(config, "hey, ask claude about this");
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-opus-4-6");
    });

    it("resolves 'use codex' to codex", () => {
      const config = makeConfig();
      const result = resolveUserPhrase(config, "use codex for this");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("openai-codex");
    });

    it("returns null for unmatched phrase", () => {
      const config = makeConfig();
      expect(resolveUserPhrase(config, "hello world")).toBeNull();
    });

    it("returns null when no overrides configured", () => {
      const config = makeConfig({ overrides: undefined });
      expect(resolveUserPhrase(config, "ask claude")).toBeNull();
    });
  });

  // ── getModelCost ────────────────────────────────────────────────

  describe("getModelCost", () => {
    it("returns cost entry for known model", () => {
      const config = makeConfig();
      const cost = getModelCost(config, "anthropic/claude-sonnet-4-6");
      expect(cost).toEqual({ input: 3.0, output: 15.0 });
    });

    it("returns null for unknown model", () => {
      const config = makeConfig();
      expect(getModelCost(config, "anthropic/nonexistent")).toBeNull();
    });
  });
});
