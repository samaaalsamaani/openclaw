// Defaults for agent metadata when upstream does not supply them.
// Model id uses pi-ai's built-in Anthropic catalog.
import { loadLlmConfig, resolveSubsystem } from "./llm-config-reader.js";

const HARDCODED_PROVIDER = "anthropic";
const HARDCODED_MODEL = "claude-opus-4-6";

function buildDefaults(): { provider: string; model: string } {
  const config = loadLlmConfig();
  if (!config) {
    return { provider: HARDCODED_PROVIDER, model: HARDCODED_MODEL };
  }
  const resolved = resolveSubsystem(config, "agent", "default");
  if (resolved) {
    return { provider: resolved.provider, model: resolved.model };
  }
  return { provider: HARDCODED_PROVIDER, model: HARDCODED_MODEL };
}

const _defaults = buildDefaults();
export const DEFAULT_PROVIDER = _defaults.provider;
export const DEFAULT_MODEL = _defaults.model;
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 200_000;
