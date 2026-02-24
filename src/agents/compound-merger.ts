/**
 * Compound Merger — merges sub-task results from multiple brains into
 * a single coherent response.
 *
 * Tiered strategy:
 *   1. No secondaries succeeded → return primary text as-is
 *   2. 1+ secondaries succeeded → LLM merge via Haiku
 *   3. Merge LLM fails → simple concatenation with dividers
 */

import crypto from "node:crypto";
import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runCliAgent } from "./cli-runner.js";
import type { SubTaskResult } from "./compound-orchestrator.js";
import { resolveCliProvider } from "./compound-shared.js";

const log = createSubsystemLogger("routing/merger");

export async function mergeSubTaskResults(input: {
  originalPrompt: string;
  primaryResult: SubTaskResult;
  secondaryResults: SubTaskResult[];
  workspaceDir: string;
  timeoutMs: number;
}): Promise<string> {
  const succeeded = input.secondaryResults.filter((r) => !r.error && r.content.trim());

  // Tier 1: no secondaries succeeded — return primary as-is
  if (succeeded.length === 0) {
    log.info("merge: no secondaries succeeded, returning primary as-is");
    return input.primaryResult.content;
  }

  // Tier 2: LLM merge via Haiku
  try {
    const merged = await llmMerge(input.originalPrompt, input.primaryResult, succeeded, input);
    if (merged) {
      log.info(`merge: LLM merge succeeded, outputLen=${merged.length}`);
      return merged;
    }
  } catch (err) {
    log.warn(`merge: LLM merge failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Tier 3: fallback concatenation
  log.info("merge: falling back to concatenation");
  return concatenateFallback(input.primaryResult, succeeded);
}

// ── LLM merge via Haiku ─────────────────────────────────────────────

async function llmMerge(
  originalPrompt: string,
  primary: SubTaskResult,
  secondaries: SubTaskResult[],
  opts: { workspaceDir: string; timeoutMs: number },
): Promise<string | null> {
  const mergeRunId = crypto.randomUUID();

  const sectionParts = secondaries.map(
    (s) => `--- ${s.domain.toUpperCase()} SPECIALIST ---\n${s.content.substring(0, 3000)}`,
  );

  const promptPreview =
    originalPrompt.length > 500
      ? originalPrompt.substring(0, 500) + "\n... (truncated)"
      : originalPrompt;
  const primaryPreview =
    primary.content.length > 4000
      ? primary.content.substring(0, 4000) + "\n... (truncated)"
      : primary.content;

  const mergePrompt = [
    "You are a response synthesizer. Multiple AI specialists answered different",
    "aspects of the user's question. Merge their outputs into one coherent, natural reply.",
    "",
    "Rules:",
    "- Preserve all unique insights from each specialist",
    "- Remove redundancy and contradictions (prefer the primary specialist)",
    "- Keep tone consistent and conversational",
    "- Do NOT label sections by domain or mention that multiple specialists were involved",
    "- Write as if a single knowledgeable expert answered the full question",
    "- Preserve code blocks, formatting, and structure from the primary response",
    "",
    "--- USER QUESTION ---",
    promptPreview,
    "",
    `--- PRIMARY SPECIALIST (${primary.domain.toUpperCase()}) ---`,
    primaryPreview,
    "",
    ...sectionParts,
    "",
    "--- MERGED RESPONSE ---",
  ].join("\n");

  const result = await runCliAgent({
    sessionId: mergeRunId,
    sessionFile: `/tmp/merge-${mergeRunId}.json`,
    workspaceDir: opts.workspaceDir,
    config: loadConfig(),
    prompt: mergePrompt,
    provider: resolveCliProvider("anthropic"),
    model: "claude-haiku-4-5",
    timeoutMs: opts.timeoutMs,
    runId: mergeRunId,
  });

  const text = result.payloads?.[0]?.text?.trim();
  if (!text || text.length < 20) {
    return null;
  }
  return text;
}

// ── Concatenation fallback ──────────────────────────────────────────

function concatenateFallback(primary: SubTaskResult, secondaries: SubTaskResult[]): string {
  const parts = [primary.content];
  for (const s of secondaries) {
    parts.push(
      `\n\n---\n\n**${s.domain.charAt(0).toUpperCase() + s.domain.slice(1)} perspective:**\n\n${s.content}`,
    );
  }
  return parts.join("");
}
