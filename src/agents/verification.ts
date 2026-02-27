/**
 * Async Verification Loop — cross-checks high-confidence responses using a different brain.
 *
 * Runs as fire-and-forget after the primary response is delivered.
 * Results feed into observability (quality scores) for the routing optimizer.
 */

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runCliAgent } from "./cli-runner.js";
import type { TaskDomain } from "./task-classifier.js";

const log = createSubsystemLogger("routing/verification");

// ── Types ───────────────────────────────────────────────────────────

export type VerificationRequest = {
  domain: TaskDomain;
  originalProvider: string;
  originalModel: string;
  responseText: string;
  originalPrompt: string;
  runId: string;
  workspaceDir?: string;
};

export type VerificationResult = {
  passed: boolean;
  confidence: number;
  issues?: string[];
  verifierProvider: string;
  verifierModel: string;
};

// ── Verifier table: which brain reviews which domain ────────────────
// Each domain is verified by a DIFFERENT brain to catch blind spots.

const VERIFIER_TABLE: Record<TaskDomain, { provider: string; model: string }> = {
  code: { provider: "anthropic", model: "claude-sonnet-4-6" },
  creative: { provider: "anthropic", model: "claude-sonnet-4-6" },
  analysis: { provider: "anthropic", model: "claude-sonnet-4-6" },
  vision: { provider: "anthropic", model: "claude-sonnet-4-6" },
  system: { provider: "anthropic", model: "claude-sonnet-4-6" },
  schedule: { provider: "anthropic", model: "claude-sonnet-4-6" },
  search: { provider: "anthropic", model: "claude-sonnet-4-6" },
};

// ── Gate: only verify high-impact domains with high confidence ──────

export function shouldVerify(domain: TaskDomain, confidence: number): boolean {
  // High-impact domains: code bugs, creative tone, analysis accuracy, search freshness, vision details, system safety
  const verifiableDomains: TaskDomain[] = [
    "code",
    "creative",
    "analysis",
    "search",
    "vision",
    "system",
  ];
  return confidence >= 80 && verifiableDomains.includes(domain);
}

// ── Prompt builder ──────────────────────────────────────────────────

export function buildVerificationPrompt(req: VerificationRequest): string {
  const DOMAIN_GUIDANCE: Record<string, string> = {
    code: "Check for: bugs, security issues, logic errors, missing edge cases, incorrect assumptions.",
    creative:
      "Check for: tone consistency with brand voice, unclear claims, missing attribution, logical gaps.",
    analysis:
      "Check for: factual accuracy, unsupported claims, logical fallacies, missing nuance, outdated information.",
    search:
      "Check for: stale or outdated information, broken assumptions about current state, missing caveats about data freshness.",
    vision:
      "Check for: misidentified objects, incorrect spatial descriptions, missed text in images, wrong diagram interpretations.",
    system:
      "Check for: dangerous commands, incorrect paths/flags, missing safety warnings, OS-incompatible instructions.",
  };
  const domainGuidance =
    DOMAIN_GUIDANCE[req.domain] ??
    "Check for: factual accuracy, tone consistency, unclear claims, missing attribution, logical gaps.";

  const promptPreview =
    req.originalPrompt.length > 1000
      ? req.originalPrompt.substring(0, 1000) + "\n... (truncated)"
      : req.originalPrompt;
  const responsePreview =
    req.responseText.length > 4000
      ? req.responseText.substring(0, 4000) + "\n... (truncated)"
      : req.responseText;

  return [
    "You are a verification agent. Review the following AI-generated response for quality issues.",
    "",
    `Domain: ${req.domain}`,
    `Original model: ${req.originalProvider}/${req.originalModel}`,
    "",
    "--- ORIGINAL PROMPT ---",
    promptPreview,
    "",
    "--- RESPONSE TO VERIFY ---",
    responsePreview,
    "",
    "--- INSTRUCTIONS ---",
    domainGuidance,
    "",
    'Respond with a JSON object: { "passed": boolean, "confidence": 0-100, "issues": ["issue1", ...] }',
    "If the response is acceptable, set passed=true and issues=[]. Be concise.",
  ].join("\n");
}

// ── Get verifier for a domain ───────────────────────────────────────

export function getVerifier(domain: TaskDomain): { provider: string; model: string } {
  return VERIFIER_TABLE[domain] ?? VERIFIER_TABLE.code;
}

// ── Shared constants (extracted to compound-shared.ts) ──────────────

import { resolveCliProvider } from "./compound-shared.js";

// ── Execute verification against a different brain ──────────────────

/**
 * Runs an actual verification agent against the verifier brain.
 * Parses the JSON response, scores the trace in observability,
 * and emits an agent event with the result.
 */
export async function executeVerification(req: VerificationRequest): Promise<VerificationResult> {
  const verifier = getVerifier(req.domain);
  const verificationRunId = crypto.randomUUID();
  const prompt = buildVerificationPrompt(req);
  const workspaceDir = req.workspaceDir ?? process.cwd();

  log.info(
    `verification: domain=${req.domain} original=${req.originalProvider}/${req.originalModel} ` +
      `verifier=${verifier.provider}/${verifier.model} runId=${req.runId}`,
  );

  let result: VerificationResult;

  try {
    const cliResult = await runCliAgent({
      sessionId: verificationRunId,
      sessionFile: `/tmp/verify-${verificationRunId}.json`,
      workspaceDir,
      config: loadConfig(),
      prompt,
      provider: resolveCliProvider(verifier.provider),
      model: verifier.model,
      timeoutMs: 30_000,
      runId: verificationRunId,
    });

    const responseText = cliResult.payloads?.[0]?.text ?? "";
    result = parseVerificationResponse(responseText, verifier);
  } catch (err) {
    log.warn(`verification failed: ${err instanceof Error ? err.message : String(err)}`);
    result = {
      passed: false, // Conservative: don't assume pass on verification failure
      confidence: 0,
      issues: ["Verification agent failed to respond"],
      verifierProvider: verifier.provider,
      verifierModel: verifier.model,
    };
  }

  // Calculate quality score (1-5 scale)
  const score = computeQualityScore(result);

  // Persist routing event + score to observability SQLite for optimize.js
  // optimize.js joins events (category=routing) with scores on trace_id
  const eventsJs = path.join(
    process.env.HOME ?? "/tmp",
    ".openclaw/projects/observability/events.js",
  );
  const metadata = JSON.stringify({
    domain: req.domain,
    provider: req.originalProvider,
    model: req.originalModel,
    confidence: result.confidence,
    verified: true,
  });

  // Emit routing event so optimize.js can join scores with routing metadata
  execFile(
    "node",
    [
      eventsJs,
      "emit",
      "--category",
      "routing",
      "--action",
      "verified",
      "--trace-id",
      req.runId,
      "--metadata",
      metadata,
    ],
    { timeout: 5000 },
    (err: Error | null) => {
      if (err) {
        log.debug(`routing event not persisted: ${err.message}`);
      }
    },
  );

  // Score the trace
  execFile(
    "node",
    [
      eventsJs,
      "score",
      "--trace-id",
      req.runId,
      "--score",
      String(score),
      "--comment",
      `Verification by ${verifier.provider}/${verifier.model}: ${result.passed ? "PASS" : "FAIL"}`,
    ],
    { timeout: 5000 },
    (err: Error | null) => {
      if (err) {
        log.debug(`quality score not persisted: ${err.message}`);
      }
    },
  );

  // Emit in-memory agent event with verification result
  emitAgentEvent({
    runId: req.runId,
    stream: "routing",
    data: {
      type: "verification_result",
      domain: req.domain,
      passed: result.passed,
      confidence: result.confidence,
      issuesCount: result.issues?.length ?? 0,
      verifierProvider: verifier.provider,
      verifierModel: verifier.model,
      qualityScore: score,
    },
  });

  return result;
}

// ── Quality score calculation ────────────────────────────────────────

function computeQualityScore(result: VerificationResult): number {
  if (result.confidence === 0) {
    return 3;
  } // Neutral — verification didn't run properly
  if (result.passed) {
    return 5;
  }
  const issueCount = result.issues?.length ?? 0;
  if (issueCount === 0) {
    return 4;
  } // Failed but no specific issues (unusual)
  if (issueCount === 1) {
    return 3;
  } // Minor issue
  if (issueCount <= 3) {
    return 2;
  } // Multiple issues
  return 1; // Many issues
}

// ── Parse verification response ─────────────────────────────────────

function parseVerificationResponse(
  text: string,
  verifier: { provider: string; model: string },
): VerificationResult {
  // Try to extract JSON by finding balanced braces containing "passed"
  try {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        if (start === -1) {
          start = i;
        }
        depth++;
      } else if (text[i] === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = text.substring(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed === "object" && parsed !== null && "passed" in parsed) {
              return {
                passed: Boolean(parsed.passed),
                confidence:
                  typeof parsed.confidence === "number"
                    ? Math.min(100, Math.max(0, parsed.confidence))
                    : 50,
                issues: Array.isArray(parsed.issues) ? parsed.issues : [],
                verifierProvider: verifier.provider,
                verifierModel: verifier.model,
              };
            }
          } catch {
            // Not valid JSON, continue searching
          }
          start = -1;
        }
      }
    }
  } catch {
    // Fall through to heuristic
  }

  // Heuristic fallback: look for pass/fail signals with word boundaries
  const lowerText = text.toLowerCase();
  const passed =
    /\bpass(?:ed|es)?\b/.test(lowerText) ||
    /\blooks\s+good\b/.test(lowerText) ||
    /\bno\s+issues\b/.test(lowerText) ||
    /\baccept(?:ed|able)\b/.test(lowerText);

  return {
    passed,
    confidence: 30,
    issues: passed ? [] : ["Could not parse structured response"],
    verifierProvider: verifier.provider,
    verifierModel: verifier.model,
  };
}
