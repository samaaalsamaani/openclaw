/**
 * Shared constants for cross-brain orchestration — extracted from
 * task-decomposer.ts and verification.ts to eliminate duplication.
 */

import { getDomainGuidance, loadLlmConfig, resolveRoutingEnrichment } from "./llm-config-reader.js";
import type { TaskDomain } from "./task-classifier.js";

// ── Provider mapping for CLI runner ─────────────────────────────────

export const PROVIDER_TO_CLI: Record<string, string> = {
  anthropic: "claude-cli",
  "openai-codex": "codex-cli",
};

export function resolveCliProvider(provider: string): string {
  return PROVIDER_TO_CLI[provider] ?? provider;
}

// ── Enrichment table: which brain handles which domain ──────────────

const HARDCODED_ENRICHMENT_TABLE: Record<TaskDomain, { provider: string; model: string }> = {
  code: { provider: "openai-codex", model: "gpt-5.3-codex" },
  creative: { provider: "anthropic", model: "claude-opus-4-6" },
  analysis: { provider: "anthropic", model: "claude-sonnet-4-6" },
  search: { provider: "anthropic", model: "claude-sonnet-4-6" },
  vision: { provider: "anthropic", model: "claude-sonnet-4-6" },
  system: { provider: "anthropic", model: "claude-sonnet-4-6" },
  schedule: { provider: "anthropic", model: "claude-sonnet-4-6" },
};

function buildEnrichmentTable(): Record<TaskDomain, { provider: string; model: string }> {
  const config = loadLlmConfig();
  if (!config) {
    return HARDCODED_ENRICHMENT_TABLE;
  }
  const ALL_DOMAINS: TaskDomain[] = [
    "code",
    "creative",
    "analysis",
    "search",
    "vision",
    "system",
    "schedule",
  ];
  const result = { ...HARDCODED_ENRICHMENT_TABLE };
  for (const domain of ALL_DOMAINS) {
    const resolved = resolveRoutingEnrichment(config, domain);
    if (resolved) {
      result[domain] = { provider: resolved.provider, model: resolved.model };
    }
  }
  return result;
}

export const ENRICHMENT_TABLE: Record<TaskDomain, { provider: string; model: string }> =
  buildEnrichmentTable();

// ── Domain-specific prompt guidance ─────────────────────────────────

const HARDCODED_DOMAIN_GUIDANCE: Record<string, string> = {
  code: "Focus on: code examples, implementation patterns, technical accuracy, API details, edge cases.",
  creative:
    "Focus on: engaging writing, clear structure, audience-appropriate tone, compelling narrative, strong hooks.",
  analysis:
    "Focus on: data-driven insights, factual accuracy, balanced perspective, evidence-based conclusions.",
  search:
    "Focus on: current/recent information, verified facts, source attribution, freshness of data.",
  vision:
    "Focus on: visual details, spatial relationships, text extraction, diagram interpretation.",
  system: "Focus on: precise commands, safety warnings, correct paths/flags, OS-specific details.",
  schedule: "Focus on: time constraints, dependencies, realistic estimates, conflict detection.",
};

function buildDomainGuidance(): Record<string, string> {
  const config = loadLlmConfig();
  if (!config) {
    return HARDCODED_DOMAIN_GUIDANCE;
  }
  const result = { ...HARDCODED_DOMAIN_GUIDANCE };
  for (const domain of Object.keys(result)) {
    const guidance = getDomainGuidance(config, domain as TaskDomain);
    if (guidance?.enrichment) {
      result[domain] = guidance.enrichment;
    }
  }
  return result;
}

export const DOMAIN_GUIDANCE: Record<string, string> = buildDomainGuidance();
