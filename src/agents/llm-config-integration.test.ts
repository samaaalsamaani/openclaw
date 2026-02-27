import { mkdirSync, writeFileSync, rmSync, utimesSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * Integration tests for the unified LLM configuration system.
 *
 * Tests end-to-end behavior: config loading from disk, caching, feature flag
 * gating, routing domain resolution across all 7 domains, subsystem resolution,
 * user overrides, tier defaults (fast vs deep), rollback (flag disable + file
 * deletion), and validation of the production config.
 */
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
  getConfidenceThreshold,
  resolveUserPhrase,
  getModelCost,
  resolveModelRef,
  getDomainScoring,
  getDomainGuidance,
  _resetCache,
  type LLMConfig,
} from "./llm-config-reader.js";

// ── Full production-like config fixture ──────────────────────────────

function makeProductionConfig(): LLMConfig {
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
      "anthropic/claude-haiku-4-5": {
        provider: "anthropic",
        apiModelId: "claude-haiku-4-5",
        displayName: "Claude Haiku 4.5",
        contextWindow: 200_000,
        maxTokens: 64_000,
        capabilities: ["text", "image"],
        cost: { input: 0.8, output: 4.0 },
      },
      "openai-codex/gpt-5.3-codex": {
        provider: "openai-codex",
        apiModelId: "gpt-5.3-codex",
        displayName: "GPT-5.3 Codex",
        contextWindow: 256_000,
        maxTokens: 64_000,
        capabilities: ["text", "code"],
        cost: { input: 2.0, output: 8.0 },
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
      "openrouter/google/gemini-2.5-flash": {
        provider: "openrouter",
        apiModelId: "google/gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        capabilities: ["text", "image"],
        cost: { input: 0.15, output: 0.6 },
      },
      "openai/gpt-4o-transcribe": {
        provider: "openai",
        apiModelId: "gpt-4o-transcribe",
        displayName: "GPT-4o Transcribe",
        contextWindow: 128_000,
        maxTokens: 16_384,
        capabilities: ["audio"],
        cost: { input: 2.5, output: 10.0 },
      },
      "openai/gpt-4o-mini-tts": {
        provider: "openai",
        apiModelId: "gpt-4o-mini-tts",
        displayName: "GPT-4o Mini TTS",
        contextWindow: 128_000,
        maxTokens: 16_384,
        capabilities: ["audio"],
        cost: { input: 0.6, output: 2.4 },
      },
    },
    tiers: {
      fast: {
        description: "Low-latency, cost-effective.",
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: ["openai/gpt-4.1", "openrouter/google/gemini-2.5-flash"],
        providerPreference: ["cli", "openai", "anthropic"],
        defaults: { maxTokens: 512, temperature: 0.3, thinking: false, retries: 1 },
      },
      deep: {
        description: "Complex reasoning.",
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: ["openai/gpt-4.1"],
        providerPreference: ["anthropic", "openai"],
        defaults: { maxTokens: 2048, temperature: 0.7, thinking: true, retries: 2 },
      },
      premium: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["anthropic/claude-sonnet-4-6"],
        defaults: { maxTokens: 4096, temperature: 0.8, thinking: true, retries: 2 },
      },
      code: {
        primary: "openai-codex/gpt-5.3-codex",
        fallbacks: ["anthropic/claude-sonnet-4-6", "openai/gpt-4.1"],
        defaults: { maxTokens: 4096, temperature: 0.2, thinking: false, retries: 2 },
      },
      vision: {
        primary: "anthropic/claude-sonnet-4-6",
        fallbacks: ["openrouter/google/gemini-2.5-flash"],
        defaults: { maxTokens: 2048, temperature: 0.3, thinking: false, retries: 1 },
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
          scoring: { baseConfidence: 75, keywordBoost: 3, patternBoost: 5 },
        },
        analysis: {
          primary: { tier: "deep" },
          verifier: { tier: "deep" },
          enrichment: { tier: "deep" },
          fallbacks: ["openai/gpt-4.1", "anthropic/claude-haiku-4-5"],
          scoring: { baseConfidence: 75, keywordBoost: 3, patternBoost: 5 },
        },
        search: {
          primary: { tier: "fast" },
          verifier: { tier: "fast" },
          enrichment: { tier: "fast" },
          fallbacks: ["openrouter/google/gemini-2.5-flash"],
          scoring: { baseConfidence: 70, keywordBoost: 3, patternBoost: 5 },
        },
        vision: {
          primary: { tier: "vision" },
          verifier: { tier: "deep" },
          enrichment: { tier: "vision" },
          fallbacks: ["openrouter/google/gemini-2.5-flash"],
          scoring: { baseConfidence: 90, keywordBoost: 3, patternBoost: 5 },
        },
        system: {
          primary: { tier: "fast" },
          verifier: { tier: "fast" },
          enrichment: { tier: "fast" },
          fallbacks: ["anthropic/claude-haiku-4-5"],
          scoring: { baseConfidence: 85, keywordBoost: 3, patternBoost: 5 },
        },
        schedule: {
          primary: { tier: "fast" },
          verifier: { tier: "fast" },
          enrichment: { tier: "fast" },
          fallbacks: ["openai/gpt-4.1"],
          scoring: { baseConfidence: 80, keywordBoost: 3, patternBoost: 5 },
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
        review: { tier: "deep" },
        quarterly: { tier: "deep" },
        crossCheck: { tier: "fast" },
        reflection: { tier: "fast" },
        crm: { tier: "fast" },
        default: { tier: "deep" },
      },
      calendar: {
        generation: { tier: "fast" },
        weekly: { tier: "fast" },
      },
      voice: {
        response: { tier: "fast" },
        stt: { model: "openai/gpt-4o-transcribe" },
        tts: { model: "openai/gpt-4o-mini-tts" },
      },
      media: {
        vision: { tier: "vision" },
      },
      learner: {
        factExtraction: { tier: "fast" },
      },
    },
    overrides: {
      precedence: [
        "@prefix",
        "explicit-api",
        "user-phrase",
        "image-shortcut",
        "heuristic-classification",
        "default-route",
      ],
      userPhrases: {
        "ask claude": "anthropic/claude-opus-4-6",
        "use claude": "anthropic/claude-opus-4-6",
        "ask opus": "anthropic/claude-opus-4-6",
        "ask sonnet": "anthropic/claude-sonnet-4-6",
        "use sonnet": "anthropic/claude-sonnet-4-6",
        "ask haiku": "anthropic/claude-haiku-4-5",
        "use haiku": "anthropic/claude-haiku-4-5",
        "ask codex": "openai-codex/gpt-5.3-codex",
        "use codex": "openai-codex/gpt-5.3-codex",
        "codex review": "openai-codex/gpt-5.3-codex",
        "use gemini": "openrouter/google/gemini-2.5-flash",
        "ask gemini": "openrouter/google/gemini-2.5-flash",
      },
    },
  };
}

// ── Test helpers ──────────────────────────────────────────────────────

let testDir: string;
const originalEnv = { ...process.env };

function writeConfig(config: LLMConfig): string {
  const configFile = join(testDir, ".openclaw", "llm-config.json");
  writeFileSync(configFile, JSON.stringify(config));
  return configFile;
}

describe("LLM config integration tests", () => {
  beforeEach(() => {
    _resetCache();
    testDir = join(tmpdir(), `llm-config-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, ".openclaw"), { recursive: true });
    process.env.HOME = testDir;
    process.env.PAIOS_LLM_CONFIG = "1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ── 1. Config loading integration ────────────────────────────────

  describe("config loading", () => {
    it("loads full production config from disk and validates structure", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig();
      expect(config).not.toBeNull();
      expect(config!.version).toBe(1);
      expect(Object.keys(config!.models)).toHaveLength(8);
      expect(Object.keys(config!.tiers)).toHaveLength(5);
      expect(Object.keys(config!.routing!.domains!)).toHaveLength(7);
      expect(Object.keys(config!.subsystems!)).toHaveLength(6);
    });

    it("returns null when feature flag PAIOS_LLM_CONFIG is unset", () => {
      delete process.env.PAIOS_LLM_CONFIG;
      writeConfig(makeProductionConfig());
      expect(loadLlmConfig()).toBeNull();
    });

    it("falls back gracefully when config file is missing", () => {
      // No config written — file does not exist
      const config = loadLlmConfig();
      expect(config).toBeNull();
    });

    it("falls back gracefully when config file contains invalid JSON", () => {
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, "{invalid json content,,}");
      expect(loadLlmConfig()).toBeNull();
    });

    it("rejects config with wrong version", () => {
      writeConfig({ ...makeProductionConfig(), version: 42 });
      expect(loadLlmConfig()).toBeNull();
    });

    it("rejects config missing required models section", () => {
      const config = makeProductionConfig();
      // Force invalid config
      const broken = { ...config, models: undefined } as unknown as LLMConfig;
      writeConfig(broken);
      expect(loadLlmConfig()).toBeNull();
    });

    it("rejects config missing required tiers section", () => {
      const config = makeProductionConfig();
      const broken = { ...config, tiers: undefined } as unknown as LLMConfig;
      writeConfig(broken);
      expect(loadLlmConfig()).toBeNull();
    });
  });

  // ── 2. Cache behavior ────────────────────────────────────────────

  describe("cache behavior", () => {
    it("returns same reference on repeated reads (mtime cache hit)", () => {
      writeConfig(makeProductionConfig());
      const first = loadLlmConfig();
      const second = loadLlmConfig();
      expect(first).toBe(second); // same object reference
    });

    it("reloads config when file mtime changes", () => {
      const configFile = writeConfig(makeProductionConfig());
      const first = loadLlmConfig();
      // Touch file with future mtime
      const future = new Date(Date.now() + 60_000);
      utimesSync(configFile, future, future);
      const second = loadLlmConfig();
      expect(first).not.toBe(second); // different reference
      expect(second).not.toBeNull();
      expect(second!.version).toBe(1);
    });

    it("invalidates cache when file is deleted", () => {
      const configFile = writeConfig(makeProductionConfig());
      const first = loadLlmConfig();
      expect(first).not.toBeNull();
      unlinkSync(configFile);
      _resetCache();
      expect(loadLlmConfig()).toBeNull();
    });
  });

  // ── 3. OpenClaw routing — all 7 domains ──────────────────────────

  describe("routing — all 7 domains", () => {
    const DOMAIN_EXPECTATIONS: Record<string, { provider: string; model: string }> = {
      code: { provider: "openai-codex", model: "gpt-5.3-codex" },
      creative: { provider: "anthropic", model: "claude-opus-4-6" },
      analysis: { provider: "anthropic", model: "claude-sonnet-4-6" },
      search: { provider: "anthropic", model: "claude-sonnet-4-6" },
      vision: { provider: "anthropic", model: "claude-sonnet-4-6" },
      system: { provider: "anthropic", model: "claude-sonnet-4-6" },
      schedule: { provider: "anthropic", model: "claude-sonnet-4-6" },
    };

    for (const [domain, expected] of Object.entries(DOMAIN_EXPECTATIONS)) {
      it(`routes "${domain}" domain to ${expected.provider}/${expected.model}`, () => {
        writeConfig(makeProductionConfig());
        const config = loadLlmConfig()!;
        const result = resolveRoutingDomain(config, domain as unknown as TaskDomain);
        expect(result).not.toBeNull();
        expect(result!.provider).toBe(expected.provider);
        expect(result!.model).toBe(expected.model);
      });
    }

    it("verifier models resolve for all configured domains", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      for (const domain of Object.keys(DOMAIN_EXPECTATIONS)) {
        const result = resolveRoutingVerifier(config, domain as unknown as TaskDomain);
        expect(result).not.toBeNull();
        // All verifiers in production config use deep or fast tier -> sonnet
        expect(result!.model).toBe("claude-sonnet-4-6");
      }
    });

    it("enrichment models resolve for all configured domains", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const enrichmentExpected: Record<string, string> = {
        code: "gpt-5.3-codex",
        creative: "claude-opus-4-6",
        analysis: "claude-sonnet-4-6",
        search: "claude-sonnet-4-6",
        vision: "claude-sonnet-4-6",
        system: "claude-sonnet-4-6",
        schedule: "claude-sonnet-4-6",
      };
      for (const [domain, expectedModel] of Object.entries(enrichmentExpected)) {
        const result = resolveRoutingEnrichment(config, domain as unknown as TaskDomain);
        expect(result).not.toBeNull();
        expect(result!.model).toBe(expectedModel);
      }
    });

    it("merger model resolves to deep tier (sonnet)", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveRoutingMerger(config);
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6");
      expect(result!.config?.thinking).toBe(true);
    });

    it("falls back to default route for unknown domain", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      // Cast to any to test unmapped domain
      const result = resolveRoutingDomain(config, "unknown-domain" as unknown as TaskDomain);
      // Should fall back to routing.default = fast tier = sonnet
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6");
    });
  });

  // ── 4. User overrides ────────────────────────────────────────────

  describe("user overrides", () => {
    const PHRASE_TESTS = [
      { phrase: "hey, ask claude about this", expectedModel: "claude-opus-4-6" },
      { phrase: "use claude for my essay", expectedModel: "claude-opus-4-6" },
      { phrase: "ask opus to help", expectedModel: "claude-opus-4-6" },
      { phrase: "ask sonnet to summarize", expectedModel: "claude-sonnet-4-6" },
      { phrase: "use sonnet", expectedModel: "claude-sonnet-4-6" },
      { phrase: "ask haiku for a quick answer", expectedModel: "claude-haiku-4-5" },
      { phrase: "use haiku", expectedModel: "claude-haiku-4-5" },
      { phrase: "use codex for this", expectedModel: "gpt-5.3-codex" },
      { phrase: "ask codex", expectedModel: "gpt-5.3-codex" },
      { phrase: "codex review my PR", expectedModel: "gpt-5.3-codex" },
      { phrase: "use gemini for this", expectedModel: "google/gemini-2.5-flash" },
      { phrase: "ask gemini to translate", expectedModel: "google/gemini-2.5-flash" },
    ];

    for (const { phrase, expectedModel } of PHRASE_TESTS) {
      it(`resolves "${phrase}" to ${expectedModel}`, () => {
        writeConfig(makeProductionConfig());
        const config = loadLlmConfig()!;
        const result = resolveUserPhrase(config, phrase);
        expect(result).not.toBeNull();
        expect(result!.apiModelId).toBe(expectedModel);
      });
    }

    it("returns null for unrecognized user phrase", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      expect(resolveUserPhrase(config, "hello world how are you")).toBeNull();
    });

    it("is case-insensitive for phrase matching", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveUserPhrase(config, "ASK CLAUDE please");
      expect(result).not.toBeNull();
      expect(result!.apiModelId).toBe("claude-opus-4-6");
    });
  });

  // ── 5. KB subsystem ──────────────────────────────────────────────

  describe("KB subsystem integration", () => {
    it("resolves KB enrichment to deep tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "kb", "enrichment");
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6");
      expect(result!.config?.thinking).toBe(true);
      expect(result!.config?.maxTokens).toBe(2048);
    });

    it("resolves KB decisions to deep tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "kb", "decisions");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(true);
    });

    it("resolves KB search to fast tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "kb", "search");
      expect(result).not.toBeNull();
      expect(result!.config?.maxTokens).toBe(512);
      expect(result!.config?.thinking).toBe(false);
    });

    it("falls back to KB default (fast) for unknown task", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "kb", "unknown-task");
      expect(result).not.toBeNull();
      expect(result!.config?.maxTokens).toBe(512); // fast tier
    });

    it("returns KB fallback chain", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const chain = getSubsystemFallbackChain(config, "kb");
      expect(chain).toEqual(["cli", "openai", "anthropic"]);
    });

    it("resolves cost data for model used by KB", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const cost = getModelCost(config, "anthropic/claude-sonnet-4-6");
      expect(cost).toEqual({ input: 3.0, output: 15.0 });
    });
  });

  // ── 6. CEO subsystem ─────────────────────────────────────────────

  describe("CEO subsystem integration", () => {
    it("resolves CEO briefing to deep tier (thinking=true, maxTokens=2048)", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "ceo", "briefing");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(true);
      expect(result!.config?.maxTokens).toBe(2048);
    });

    it("resolves CEO review to deep tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "ceo", "review");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(true);
    });

    it("resolves CEO crossCheck to fast tier (thinking=false, maxTokens=512)", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "ceo", "crossCheck");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(false);
      expect(result!.config?.maxTokens).toBe(512);
    });

    it("resolves CEO crm to fast tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "ceo", "crm");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(false);
    });

    it("CEO default falls back to deep tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "ceo");
      expect(result).not.toBeNull();
      expect(result!.config?.thinking).toBe(true);
      expect(result!.config?.maxTokens).toBe(2048);
    });
  });

  // ── 7. Voice/Media/Learner subsystems ─────────────────────────────

  describe("other subsystem integration", () => {
    it("resolves voice STT to direct model (gpt-4o-transcribe)", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "voice", "stt");
      expect(result).not.toBeNull();
      expect(result!.apiModelId).toBe("gpt-4o-transcribe");
      expect(result!.provider).toBe("openai");
    });

    it("resolves voice TTS to direct model (gpt-4o-mini-tts)", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "voice", "tts");
      expect(result).not.toBeNull();
      expect(result!.apiModelId).toBe("gpt-4o-mini-tts");
    });

    it("resolves media vision to vision tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "media", "vision");
      expect(result).not.toBeNull();
      expect(result!.model).toBe("claude-sonnet-4-6");
      expect(result!.config?.thinking).toBe(false);
    });

    it("resolves learner factExtraction to fast tier", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveSubsystem(config, "learner", "factExtraction");
      expect(result).not.toBeNull();
      expect(result!.config?.maxTokens).toBe(512);
    });
  });

  // ── 8. Tier resolution with defaults ──────────────────────────────

  describe("tier system", () => {
    it("fast tier: maxTokens=512, thinking=false, temperature=0.3", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveTier(config, "fast");
      expect(result).not.toBeNull();
      expect(result!.config).toEqual({
        maxTokens: 512,
        temperature: 0.3,
        thinking: false,
        retries: 1,
      });
    });

    it("deep tier: maxTokens=2048, thinking=true, temperature=0.7", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveTier(config, "deep");
      expect(result).not.toBeNull();
      expect(result!.config).toEqual({
        maxTokens: 2048,
        temperature: 0.7,
        thinking: true,
        retries: 2,
      });
    });

    it("premium tier routes to opus", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveTier(config, "premium");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("anthropic");
      expect(result!.model).toBe("claude-opus-4-6");
    });

    it("code tier routes to codex", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const result = resolveTier(config, "code");
      expect(result).not.toBeNull();
      expect(result!.provider).toBe("openai-codex");
      expect(result!.model).toBe("gpt-5.3-codex");
    });

    it("each tier has correct fallback chain", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const fast = resolveTier(config, "fast")!;
      expect(fast.fallbacks).toHaveLength(2);

      const deep = resolveTier(config, "deep")!;
      expect(deep.fallbacks).toHaveLength(1);
      expect(deep.fallbacks![0].model).toBe("gpt-4.1");

      const code = resolveTier(config, "code")!;
      expect(code.fallbacks).toHaveLength(2);
    });
  });

  // ── 9. Domain scoring and guidance ─────────────────────────────────

  describe("domain scoring and guidance", () => {
    it("returns correct scoring for each domain", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const codeScoring = getDomainScoring(config, "code");
      expect(codeScoring).toEqual({ baseConfidence: 80, keywordBoost: 3, patternBoost: 5 });

      const visionScoring = getDomainScoring(config, "vision");
      expect(visionScoring!.baseConfidence).toBe(90);

      const searchScoring = getDomainScoring(config, "search");
      expect(searchScoring!.baseConfidence).toBe(70);
    });

    it("returns confidence threshold from config", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      expect(getConfidenceThreshold(config)).toBe(70);
    });

    it("returns guidance strings for code domain", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      const guidance = getDomainGuidance(config, "code");
      expect(guidance).not.toBeNull();
      expect(guidance!.enrichment).toContain("code examples");
      expect(guidance!.verification).toContain("bugs");
    });
  });

  // ── 10. Rollback scenarios ────────────────────────────────────────

  describe("rollback", () => {
    it("returns null when feature flag is disabled (hardcoded fallback)", () => {
      writeConfig(makeProductionConfig());
      // Verify config loads initially
      expect(loadLlmConfig()).not.toBeNull();
      // Disable flag
      delete process.env.PAIOS_LLM_CONFIG;
      _resetCache();
      expect(loadLlmConfig()).toBeNull();
    });

    it("returns null when config file is deleted", () => {
      const configFile = writeConfig(makeProductionConfig());
      expect(loadLlmConfig()).not.toBeNull();
      // Delete file and reset cache
      unlinkSync(configFile);
      _resetCache();
      expect(loadLlmConfig()).toBeNull();
    });

    it("recovers when config file is restored after deletion", () => {
      const configFile = writeConfig(makeProductionConfig());
      const first = loadLlmConfig();
      expect(first).not.toBeNull();
      // Delete
      unlinkSync(configFile);
      _resetCache();
      expect(loadLlmConfig()).toBeNull();
      // Restore
      writeConfig(makeProductionConfig());
      const restored = loadLlmConfig();
      expect(restored).not.toBeNull();
      expect(restored!.version).toBe(1);
    });

    it("system continues when config is replaced with invalid file", () => {
      writeConfig(makeProductionConfig());
      expect(loadLlmConfig()).not.toBeNull();
      // Replace with invalid content
      const configFile = join(testDir, ".openclaw", "llm-config.json");
      writeFileSync(configFile, "corrupted!!!");
      _resetCache();
      // Should gracefully return null (hardcoded fallback)
      expect(loadLlmConfig()).toBeNull();
    });
  });

  // ── 11. Production config validation ──────────────────────────────

  describe("production config validation", () => {
    it("all model references in tiers are valid", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      for (const [_tierName, tier] of Object.entries(config.tiers)) {
        const primary = lookupModel(config, tier.primary);
        expect(primary).not.toBeNull();
        for (const fb of tier.fallbacks ?? []) {
          expect(lookupModel(config, fb)).not.toBeNull();
        }
      }
    });

    it("all model references in routing domains are valid", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      for (const [_domain, domainCfg] of Object.entries(config.routing!.domains!)) {
        if (domainCfg.primary) {
          const resolved = resolveModelRef(config, domainCfg.primary);
          expect(resolved).not.toBeNull();
        }
        if (domainCfg.verifier) {
          expect(resolveModelRef(config, domainCfg.verifier)).not.toBeNull();
        }
        if (domainCfg.enrichment) {
          expect(resolveModelRef(config, domainCfg.enrichment)).not.toBeNull();
        }
        for (const fb of domainCfg.fallbacks ?? []) {
          expect(lookupModel(config, fb)).not.toBeNull();
        }
      }
    });

    it("all model references in subsystems are valid", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      for (const [_name, sub] of Object.entries(config.subsystems!)) {
        for (const [task, ref] of Object.entries(sub)) {
          if (task === "fallbackChain") {
            continue;
          }
          if (ref && typeof ref === "object" && ("tier" in ref || "model" in ref)) {
            const resolved = resolveModelRef(
              config,
              ref as unknown as { tier?: string; model?: string },
            );
            expect(resolved).not.toBeNull();
          }
        }
      }
    });

    it("all user phrase model references are valid", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      for (const [_phrase, modelKey] of Object.entries(config.overrides!.userPhrases!)) {
        const looked = lookupModel(config, modelKey);
        expect(looked).not.toBeNull();
      }
    });

    it("all models have cost data", () => {
      writeConfig(makeProductionConfig());
      const config = loadLlmConfig()!;
      for (const [_key, entry] of Object.entries(config.models)) {
        expect(entry.cost).toBeDefined();
        expect(entry.cost!.input).toBeGreaterThanOrEqual(0);
        expect(entry.cost!.output).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
