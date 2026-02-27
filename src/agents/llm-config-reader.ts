/**
 * Unified LLM Configuration Reader
 *
 * Loads and caches `~/.openclaw/llm-config.json`, providing typed lookups
 * for models, tiers, domain routing, and subsystem overrides.
 *
 * Gated behind `PAIOS_LLM_CONFIG=1`. When disabled (or config is missing/invalid),
 * every resolve function returns `null` so callers fall back to their existing
 * hardcoded values.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { normalizeModelRef, type ModelRef } from "./model-selection.js";
import type { TaskDomain } from "./task-classifier.js";

const log = createSubsystemLogger("llm-config");

// ── Public types (match llm-config.schema.json) ───────────────────────

export type CostEntry = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type ModelEntry = {
  provider: string;
  apiModelId: string;
  displayName?: string;
  contextWindow?: number;
  maxTokens?: number;
  capabilities?: string[];
  cost?: CostEntry;
};

export type TierDefaults = {
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
  retries?: number;
};

export type TierEntry = {
  description?: string;
  primary: string;
  fallbacks?: string[];
  providerPreference?: string[];
  defaults?: TierDefaults;
};

export type SchemaModelRef = { tier?: string; model?: string };

export type DomainScoring = {
  baseConfidence?: number;
  keywordBoost?: number;
  patternBoost?: number;
};

export type DomainGuidance = {
  enrichment?: string;
  verification?: string;
};

export type DomainConfig = {
  primary?: SchemaModelRef;
  verifier?: SchemaModelRef;
  enrichment?: SchemaModelRef;
  fallbacks?: string[];
  scoring?: DomainScoring;
  guidance?: DomainGuidance;
};

export type RoutingConfig = {
  domains?: Record<string, DomainConfig>;
  default?: SchemaModelRef;
  confidenceThreshold?: number;
  weights?: {
    keywordMultiplier?: number;
    patternMultiplier?: number;
  };
  merger?: SchemaModelRef;
};

export type SubsystemConfig = {
  [task: string]: SchemaModelRef | string[] | undefined;
  fallbackChain?: string[];
};

export type OverrideConfig = {
  precedence?: string[];
  userPhrases?: Record<string, string>;
};

export type LLMConfig = {
  version: number;
  models: Record<string, ModelEntry>;
  tiers: Record<string, TierEntry>;
  routing?: RoutingConfig;
  subsystems?: Record<string, SubsystemConfig>;
  overrides?: OverrideConfig;
};

// ── Resolution result types ───────────────────────────────────────────

export type ModelResolution = {
  provider: string;
  model: string;
  apiModelId: string;
  config?: TierDefaults;
  fallbacks?: ModelRef[];
};

// ── Feature flag ──────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PAIOS_LLM_CONFIG === "1";
}

// ── Config path ───────────────────────────────────────────────────────

function configPath(): string {
  return join(process.env.HOME ?? "/tmp", ".openclaw", "llm-config.json");
}

// ── Mtime-based cache ─────────────────────────────────────────────────

let cachedConfig: LLMConfig | null = null;
let cachedMtimeMs = 0;
let cachedPath = "";

function loadRaw(): LLMConfig | null {
  const path = configPath();
  try {
    const stat = statSync(path);
    if (cachedConfig && path === cachedPath && stat.mtimeMs === cachedMtimeMs) {
      return cachedConfig;
    }
    const raw = JSON.parse(readFileSync(path, "utf-8")) as LLMConfig;
    if (typeof raw.version !== "number" || raw.version !== 1) {
      log.warn(`llm-config.json: unsupported version ${raw.version}, expected 1`);
      return null;
    }
    if (!raw.models || typeof raw.models !== "object") {
      log.warn("llm-config.json: missing or invalid 'models' section");
      return null;
    }
    if (!raw.tiers || typeof raw.tiers !== "object") {
      log.warn("llm-config.json: missing or invalid 'tiers' section");
      return null;
    }
    cachedConfig = raw;
    cachedMtimeMs = stat.mtimeMs;
    cachedPath = path;
    log.debug(
      `loaded llm-config.json (${Object.keys(raw.models).length} models, ${Object.keys(raw.tiers).length} tiers)`,
    );
    return raw;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log.debug("llm-config.json not found, using hardcoded defaults");
    } else {
      log.warn(
        `failed to load llm-config.json: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    cachedConfig = null;
    cachedMtimeMs = 0;
    cachedPath = "";
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Load and cache the LLM config. Returns null when the feature flag is off,
 * the file is missing, or the file fails validation.
 */
export function loadLlmConfig(): LLMConfig | null {
  if (!isEnabled()) {
    return null;
  }
  return loadRaw();
}

/**
 * Look up a model entry by its canonical key (e.g. "anthropic/claude-sonnet-4-6").
 * Returns the model entry and a normalized ModelRef, or null if not found.
 */
export function lookupModel(
  config: LLMConfig,
  canonicalKey: string,
): { ref: ModelRef; entry: ModelEntry } | null {
  const entry = config.models[canonicalKey];
  if (!entry) {
    return null;
  }
  const ref = normalizeModelRef(entry.provider, entry.apiModelId);
  return { ref, entry };
}

/**
 * Resolve a SchemaModelRef (which references either a tier or a direct model)
 * into a concrete ModelResolution.
 */
export function resolveModelRef(config: LLMConfig, ref: SchemaModelRef): ModelResolution | null {
  if (ref.tier) {
    return resolveTier(config, ref.tier);
  }
  if (ref.model) {
    const looked = lookupModel(config, ref.model);
    if (!looked) {
      log.warn(`model key "${ref.model}" not found in config models registry`);
      return null;
    }
    return {
      provider: looked.ref.provider,
      model: looked.ref.model,
      apiModelId: looked.entry.apiModelId,
    };
  }
  return null;
}

/**
 * Resolve a tier by name. Returns the primary model with tier defaults
 * and fallback chain.
 */
export function resolveTier(config: LLMConfig, tierName: string): ModelResolution | null {
  const tier = config.tiers[tierName];
  if (!tier) {
    log.warn(`tier "${tierName}" not found in config`);
    return null;
  }
  const primary = lookupModel(config, tier.primary);
  if (!primary) {
    log.warn(`tier "${tierName}" primary model "${tier.primary}" not found in models registry`);
    return null;
  }
  const fallbacks: ModelRef[] = [];
  for (const key of tier.fallbacks ?? []) {
    const fb = lookupModel(config, key);
    if (fb) {
      fallbacks.push(fb.ref);
    }
  }
  return {
    provider: primary.ref.provider,
    model: primary.ref.model,
    apiModelId: primary.entry.apiModelId,
    config: tier.defaults,
    fallbacks: fallbacks.length > 0 ? fallbacks : undefined,
  };
}

/**
 * Resolve the model for a routing domain. Returns the primary model
 * for that domain, or falls back to the routing default.
 */
export function resolveRoutingDomain(
  config: LLMConfig,
  domain: TaskDomain,
): ModelResolution | null {
  const routing = config.routing;
  if (!routing?.domains) {
    return null;
  }
  const domainCfg = routing.domains[domain];
  if (domainCfg?.primary) {
    const resolved = resolveModelRef(config, domainCfg.primary);
    if (resolved) {
      // Attach domain-level fallbacks
      if (domainCfg.fallbacks) {
        const fallbacks: ModelRef[] = [];
        for (const key of domainCfg.fallbacks) {
          const fb = lookupModel(config, key);
          if (fb) {
            fallbacks.push(fb.ref);
          }
        }
        if (fallbacks.length > 0) {
          resolved.fallbacks = fallbacks;
        }
      }
      return resolved;
    }
  }
  // Fall back to routing default
  if (routing.default) {
    return resolveModelRef(config, routing.default);
  }
  return null;
}

/**
 * Resolve a domain's verifier model.
 */
export function resolveRoutingVerifier(
  config: LLMConfig,
  domain: TaskDomain,
): ModelResolution | null {
  const domainCfg = config.routing?.domains?.[domain];
  if (domainCfg?.verifier) {
    return resolveModelRef(config, domainCfg.verifier);
  }
  return null;
}

/**
 * Resolve a domain's enrichment model.
 */
export function resolveRoutingEnrichment(
  config: LLMConfig,
  domain: TaskDomain,
): ModelResolution | null {
  const domainCfg = config.routing?.domains?.[domain];
  if (domainCfg?.enrichment) {
    return resolveModelRef(config, domainCfg.enrichment);
  }
  return null;
}

/**
 * Resolve the merger model for compound routing.
 */
export function resolveRoutingMerger(config: LLMConfig): ModelResolution | null {
  if (config.routing?.merger) {
    return resolveModelRef(config, config.routing.merger);
  }
  return null;
}

/**
 * Resolve a model for a subsystem task. Tries the specific task first,
 * then falls back to the subsystem's "default" key.
 */
export function resolveSubsystem(
  config: LLMConfig,
  subsystem: string,
  task?: string,
): ModelResolution | null {
  const sub = config.subsystems?.[subsystem];
  if (!sub) {
    return null;
  }
  // Try specific task
  if (task) {
    const ref = sub[task] as SchemaModelRef | undefined;
    if (ref && typeof ref === "object" && ("tier" in ref || "model" in ref)) {
      const resolved = resolveModelRef(config, ref);
      if (resolved) {
        return resolved;
      }
    }
  }
  // Try "default" key
  const defaultRef = sub.default as SchemaModelRef | undefined;
  if (
    defaultRef &&
    typeof defaultRef === "object" &&
    ("tier" in defaultRef || "model" in defaultRef)
  ) {
    return resolveModelRef(config, defaultRef);
  }
  return null;
}

/**
 * Get the fallback chain for a subsystem (e.g. ["cli", "openai", "anthropic"]).
 */
export function getSubsystemFallbackChain(config: LLMConfig, subsystem: string): string[] | null {
  const sub = config.subsystems?.[subsystem];
  if (!sub?.fallbackChain || !Array.isArray(sub.fallbackChain)) {
    return null;
  }
  return sub.fallbackChain;
}

/**
 * Get scoring parameters for a routing domain.
 */
export function getDomainScoring(config: LLMConfig, domain: TaskDomain): DomainScoring | null {
  return config.routing?.domains?.[domain]?.scoring ?? null;
}

/**
 * Get guidance strings for a routing domain.
 */
export function getDomainGuidance(config: LLMConfig, domain: TaskDomain): DomainGuidance | null {
  return config.routing?.domains?.[domain]?.guidance ?? null;
}

/**
 * Get the confidence threshold for routing.
 */
export function getConfidenceThreshold(config: LLMConfig): number | null {
  return config.routing?.confidenceThreshold ?? null;
}

/**
 * Look up a user phrase override. Returns a canonical model key or null.
 */
export function resolveUserPhrase(config: LLMConfig, phrase: string): ModelResolution | null {
  const phrases = config.overrides?.userPhrases;
  if (!phrases) {
    return null;
  }
  const lower = phrase.toLowerCase().trim();
  for (const [pattern, modelKey] of Object.entries(phrases)) {
    if (lower.includes(pattern.toLowerCase())) {
      const looked = lookupModel(config, modelKey);
      if (looked) {
        return {
          provider: looked.ref.provider,
          model: looked.ref.model,
          apiModelId: looked.entry.apiModelId,
        };
      }
    }
  }
  return null;
}

/**
 * Get cost info for a model by canonical key.
 */
export function getModelCost(config: LLMConfig, canonicalKey: string): CostEntry | null {
  return config.models[canonicalKey]?.cost ?? null;
}

// ── Cache reset (for testing) ─────────────────────────────────────────

export function _resetCache(): void {
  cachedConfig = null;
  cachedMtimeMs = 0;
  cachedPath = "";
}
