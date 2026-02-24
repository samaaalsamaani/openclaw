/**
 * Cross-Brain Task Decomposer — orchestrates secondary brain invocations
 * for compound tasks that span multiple domains.
 *
 * Phase 1: Post-reply enrichment (fire-and-forget). Zero latency impact on
 * the primary response — secondary brains run AFTER the reply is delivered.
 * Results are stored in the handoffs table for observability and retrieval.
 */

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../config/config.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runCliAgent } from "./cli-runner.js";
import type { ClassificationResult, TaskDomain } from "./task-classifier.js";

const log = createSubsystemLogger("routing/decomposer");

// ── Types ───────────────────────────────────────────────────────────

export type DecompositionRequest = {
  classification: ClassificationResult;
  originalPrompt: string;
  primaryReplyText: string;
  originalProvider: string;
  originalModel: string;
  runId: string;
  workspaceDir: string;
};

export type EnrichmentResult = {
  domain: TaskDomain;
  provider: string;
  model: string;
  content: string;
  durationMs: number;
  error?: string;
};

// ── Shared constants (extracted to compound-shared.ts) ──────────────

import { DOMAIN_GUIDANCE, ENRICHMENT_TABLE, resolveCliProvider } from "./compound-shared.js";

// ── Gate: only decompose compound tasks with secondary domains ──────

export function shouldDecompose(classification: ClassificationResult): boolean {
  return Boolean(
    classification.isCompound &&
    classification.secondaryDomains &&
    classification.secondaryDomains.length > 0,
  );
}

// ── Build enrichment prompt for a secondary brain ───────────────────

export function buildEnrichmentPrompt(
  domain: TaskDomain,
  originalPrompt: string,
  primaryReply: string,
): string {
  const guidance =
    DOMAIN_GUIDANCE[domain] ??
    "Focus on: factual accuracy, completeness, and adding value beyond what was already said.";

  const promptPreview =
    originalPrompt.length > 1000
      ? originalPrompt.substring(0, 1000) + "\n... (truncated)"
      : originalPrompt;
  const replyPreview =
    primaryReply.length > 4000
      ? primaryReply.substring(0, 4000) + "\n... (truncated)"
      : primaryReply;

  return [
    `You are a ${domain} specialist enrichment agent. Another AI has already answered the user's question.`,
    "Your job is to provide SUPPLEMENTARY insights from your domain expertise — do NOT repeat what was already said.",
    "",
    `Domain: ${domain}`,
    guidance,
    "",
    "--- ORIGINAL USER PROMPT ---",
    promptPreview,
    "",
    "--- PRIMARY RESPONSE (already delivered) ---",
    replyPreview,
    "",
    "--- INSTRUCTIONS ---",
    "Provide a concise enrichment (2-4 paragraphs max) with insights the primary response may have missed.",
    "If the primary response already fully covers your domain, respond with: ENRICHMENT_NOT_NEEDED",
    "Be direct and specific. Do not repeat or summarize the primary response.",
  ].join("\n");
}

// ── Handoffs database (node:sqlite) ─────────────────────────────────

const OBS_DB_PATH = path.join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

function getDb(): DatabaseSync {
  const db = new DatabaseSync(OBS_DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

function storeEnrichment(
  req: DecompositionRequest,
  domain: TaskDomain,
  result: EnrichmentResult,
): void {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO handoffs (from_brain, to_domain, to_provider, to_model, context, priority, status, result, completed_at)
      VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      `${req.originalProvider}/${req.originalModel}`,
      domain,
      result.provider,
      result.model,
      req.originalPrompt.substring(0, 500),
      result.error ? "failed" : "completed",
      result.error ?? result.content,
    );
    db.close();
  } catch (err) {
    log.debug(`handoff DB write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Execute enrichment against secondary brains ─────────────────────

export async function executeDecomposition(req: DecompositionRequest): Promise<EnrichmentResult[]> {
  const secondaryDomains = req.classification.secondaryDomains ?? [];
  if (secondaryDomains.length === 0) {
    return [];
  }

  const decompositionRunId = crypto.randomUUID();

  log.info(
    `decomposition: primary=${req.classification.domain} secondaries=[${secondaryDomains.map((s) => s.domain).join(",")}] ` +
      `runId=${req.runId}`,
  );

  const startTime = Date.now();

  // Run all secondary brains in parallel with individual 30s timeouts
  const promises = secondaryDomains.map(async (secondary): Promise<EnrichmentResult> => {
    const enricher = ENRICHMENT_TABLE[secondary.domain];
    const enrichmentRunId = crypto.randomUUID();
    const prompt = buildEnrichmentPrompt(
      secondary.domain,
      req.originalPrompt,
      req.primaryReplyText,
    );
    const enrichStart = Date.now();

    try {
      const cliResult = await runCliAgent({
        sessionId: enrichmentRunId,
        sessionFile: `/tmp/enrich-${enrichmentRunId}.json`,
        workspaceDir: req.workspaceDir,
        config: loadConfig(),
        prompt,
        provider: resolveCliProvider(enricher.provider),
        model: enricher.model,
        timeoutMs: 30_000,
        runId: enrichmentRunId,
      });

      const content = cliResult.payloads?.[0]?.text ?? "";
      const durationMs = Date.now() - enrichStart;

      // Skip if the enrichment agent says it's not needed
      if (content.includes("ENRICHMENT_NOT_NEEDED")) {
        log.info(`enrichment: domain=${secondary.domain} skipped (not needed) ${durationMs}ms`);
        return {
          domain: secondary.domain,
          provider: enricher.provider,
          model: enricher.model,
          content: "",
          durationMs,
        };
      }

      log.info(
        `enrichment: domain=${secondary.domain} provider=${enricher.provider} ` +
          `contentLen=${content.length} ${durationMs}ms`,
      );

      return {
        domain: secondary.domain,
        provider: enricher.provider,
        model: enricher.model,
        content,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - enrichStart;
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.warn(`enrichment failed: domain=${secondary.domain} error=${errorMsg} ${durationMs}ms`);
      return {
        domain: secondary.domain,
        provider: enricher.provider,
        model: enricher.model,
        content: "",
        durationMs,
        error: errorMsg,
      };
    }
  });

  const settled = await Promise.allSettled(promises);
  const results: EnrichmentResult[] = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : {
          domain: "analysis" as TaskDomain,
          provider: "unknown",
          model: "unknown",
          content: "",
          durationMs: 0,
          error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        },
  );

  // Store each result in the handoffs table
  for (const result of results) {
    storeEnrichment(req, result.domain, result);
  }

  const totalDurationMs = Date.now() - startTime;
  const successCount = results.filter((r) => !r.error && r.content).length;

  // Emit observability events
  const eventsJs = path.join(
    process.env.HOME ?? "/tmp",
    ".openclaw/projects/observability/events.js",
  );
  const metadata = JSON.stringify({
    primaryDomain: req.classification.domain,
    secondaryDomains: secondaryDomains.map((s) => s.domain),
    successCount,
    totalCount: results.length,
    totalDurationMs,
  });

  execFile(
    "node",
    [
      eventsJs,
      "emit",
      "--category",
      "routing",
      "--action",
      "decomposition_complete",
      "--trace-id",
      req.runId,
      "--metadata",
      metadata,
    ],
    { timeout: 5000 },
    (err: Error | null) => {
      if (err) {
        log.debug(`decomposition event not persisted: ${err.message}`);
      }
    },
  );

  emitAgentEvent({
    runId: req.runId,
    stream: "routing",
    data: {
      type: "decomposition_result",
      decompositionRunId,
      primaryDomain: req.classification.domain,
      enrichments: results.map((r) => ({
        domain: r.domain,
        provider: r.provider,
        model: r.model,
        contentLength: r.content.length,
        durationMs: r.durationMs,
        error: r.error,
      })),
      successCount,
      totalDurationMs,
    },
  });

  log.info(
    `decomposition complete: ${successCount}/${results.length} enrichments, ${totalDurationMs}ms total`,
  );

  return results;
}
