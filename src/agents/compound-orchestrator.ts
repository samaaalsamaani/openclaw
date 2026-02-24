/**
 * Cross-Brain Compound Orchestrator — executes primary + secondary brains
 * in parallel for compound tasks, then merges results into a single response.
 *
 * Pre-reply system: runs BEFORE the reply is delivered. The merged response
 * replaces what would have been a single-brain answer.
 */

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadConfig } from "../config/config.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runCliAgent } from "./cli-runner.js";
import { mergeSubTaskResults } from "./compound-merger.js";
import { DOMAIN_GUIDANCE, ENRICHMENT_TABLE, resolveCliProvider } from "./compound-shared.js";
import type { ClassificationResult, TaskDomain } from "./task-classifier.js";

const log = createSubsystemLogger("routing/orchestrator");

// ── Types ───────────────────────────────────────────────────────────

export type SubTaskResult = {
  domain: TaskDomain;
  provider: string;
  model: string;
  content: string;
  durationMs: number;
  error?: string;
};

export type CompoundResult = {
  mergedText: string;
  subTasks: SubTaskResult[];
  totalDurationMs: number;
  didMerge: boolean;
};

// ── Sub-task prompt builder (pre-reply — no primary reply to reference) ──

function buildSubTaskPrompt(domain: TaskDomain, originalPrompt: string): string {
  const guidance =
    DOMAIN_GUIDANCE[domain] ??
    "Focus on: factual accuracy, completeness, and providing expert-level insight.";

  const promptPreview =
    originalPrompt.length > 1000
      ? originalPrompt.substring(0, 1000) + "\n... (truncated)"
      : originalPrompt;

  return [
    `You are a ${domain} specialist. The user asked a compound question spanning multiple domains.`,
    `Focus ONLY on the ${domain} aspects. Be concise (2-4 paragraphs).`,
    "",
    `Domain: ${domain}`,
    guidance,
    "",
    "--- USER QUESTION ---",
    promptPreview,
    "",
    "--- INSTRUCTIONS ---",
    "Answer ONLY the parts relevant to your domain. Another specialist handles the rest.",
    "Be direct and specific. If there is nothing relevant to your domain, respond with: DOMAIN_NOT_RELEVANT",
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

function storeHandoff(
  primaryProvider: string,
  primaryModel: string,
  domain: TaskDomain,
  result: SubTaskResult,
  context: string,
): void {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO handoffs (from_brain, to_domain, to_provider, to_model, context, priority, status, result, completed_at)
      VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(
      `${primaryProvider}/${primaryModel}`,
      domain,
      result.provider,
      result.model,
      context.substring(0, 500),
      result.error ? "failed" : "completed",
      result.error ?? result.content.substring(0, 2000),
    );
    db.close();
  } catch (err) {
    log.debug(`handoff DB write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Execute a single sub-task against one brain ─────────────────────

async function executeSubTask(
  domain: TaskDomain,
  originalPrompt: string,
  workspaceDir: string,
  subtaskTimeoutMs: number,
): Promise<SubTaskResult> {
  const enricher = ENRICHMENT_TABLE[domain];
  const runId = crypto.randomUUID();
  const prompt = buildSubTaskPrompt(domain, originalPrompt);
  const start = Date.now();

  try {
    const cliResult = await runCliAgent({
      sessionId: runId,
      sessionFile: `/tmp/compound-${runId}.json`,
      workspaceDir,
      config: loadConfig(),
      prompt,
      provider: resolveCliProvider(enricher.provider),
      model: enricher.model,
      timeoutMs: subtaskTimeoutMs,
      runId,
    });

    const content = cliResult.payloads?.[0]?.text ?? "";
    const durationMs = Date.now() - start;

    // Skip if the brain says domain is irrelevant
    if (content.includes("DOMAIN_NOT_RELEVANT")) {
      log.info(`subtask: domain=${domain} skipped (not relevant) ${durationMs}ms`);
      return {
        domain,
        provider: enricher.provider,
        model: enricher.model,
        content: "",
        durationMs,
      };
    }

    log.info(
      `subtask: domain=${domain} provider=${enricher.provider} contentLen=${content.length} ${durationMs}ms`,
    );
    return { domain, provider: enricher.provider, model: enricher.model, content, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.warn(`subtask failed: domain=${domain} error=${errorMsg} ${durationMs}ms`);
    return {
      domain,
      provider: enricher.provider,
      model: enricher.model,
      content: "",
      durationMs,
      error: errorMsg,
    };
  }
}

// ── Observability event emitter ─────────────────────────────────────

function emitObsEvent(action: string, traceId: string, metadata: Record<string, unknown>): void {
  const eventsJs = path.join(
    process.env.HOME ?? "/tmp",
    ".openclaw/projects/observability/events.js",
  );
  execFile(
    "node",
    [
      eventsJs,
      "emit",
      "--category",
      "routing",
      "--action",
      action,
      "--trace-id",
      traceId,
      "--metadata",
      JSON.stringify(metadata),
    ],
    { timeout: 5000 },
    (err: Error | null) => {
      if (err) {
        log.debug(`${action} event not persisted: ${err.message}`);
      }
    },
  );
}

// ── Main orchestration function ─────────────────────────────────────

const SUBTASK_TIMEOUT_MS = 30_000;
const OVERALL_TIMEOUT_MS = 60_000;

export async function orchestrateCompoundTask(input: {
  classification: ClassificationResult;
  originalPrompt: string;
  sessionId: string;
  workspaceDir: string;
  timeoutMs: number;
}): Promise<CompoundResult | null> {
  const { classification, originalPrompt, sessionId, workspaceDir } = input;
  const secondaryDomains = classification.secondaryDomains ?? [];
  if (secondaryDomains.length === 0) {
    return null;
  }

  const orchestrationId = crypto.randomUUID();
  const overallTimeout = Math.min(input.timeoutMs, OVERALL_TIMEOUT_MS);
  const startTime = Date.now();

  log.info(
    `compound orchestration: primary=${classification.domain} ` +
      `secondaries=[${secondaryDomains.map((s) => s.domain).join(",")}] ` +
      `sessionId=${sessionId} orchestrationId=${orchestrationId}`,
  );

  emitObsEvent("compound_orchestration_start", sessionId, {
    orchestrationId,
    primaryDomain: classification.domain,
    secondaryDomains: secondaryDomains.map((s) => s.domain),
  });

  // Execute primary + all secondaries in parallel
  const primaryPromise = executeSubTask(
    classification.domain,
    originalPrompt,
    workspaceDir,
    SUBTASK_TIMEOUT_MS,
  );

  const secondaryPromises = secondaryDomains.map((s) =>
    executeSubTask(s.domain, originalPrompt, workspaceDir, SUBTASK_TIMEOUT_MS),
  );

  // Race against overall timeout
  const allPromises = Promise.allSettled([primaryPromise, ...secondaryPromises]);
  const timeoutPromise = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), overallTimeout),
  );

  const raceResult = await Promise.race([allPromises, timeoutPromise]);

  let primaryResult: SubTaskResult | null = null;
  let secondaryResults: SubTaskResult[] = [];

  if (raceResult === "timeout") {
    // Timeout — try to salvage whatever completed
    log.warn(`compound orchestration timed out after ${overallTimeout}ms`);
    // allSettled may have partial results; we can't cancel but we move on
    // The primary might have completed already
    try {
      primaryResult = await Promise.race([
        primaryPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
    } catch {
      primaryResult = null;
    }
  } else {
    // All settled — extract results
    const settled = raceResult;
    const primarySettled = settled[0];
    primaryResult = primarySettled.status === "fulfilled" ? primarySettled.value : null;

    secondaryResults = settled.slice(1).map((s) =>
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
  }

  // Graceful degradation: if primary failed, fall through to normal path
  if (!primaryResult || (primaryResult.error && !primaryResult.content)) {
    log.warn("compound orchestration: primary failed, falling through to normal path");
    emitObsEvent("compound_orchestration_complete", sessionId, {
      orchestrationId,
      status: "primary_failed",
      totalDurationMs: Date.now() - startTime,
    });
    return null;
  }

  // Store handoffs
  const allResults = [primaryResult, ...secondaryResults];
  for (const result of allResults) {
    storeHandoff(
      classification.provider,
      classification.model,
      result.domain,
      result,
      originalPrompt,
    );
  }

  // Emit per-subtask observability
  for (const result of allResults) {
    emitObsEvent("compound_subtask_complete", sessionId, {
      orchestrationId,
      domain: result.domain,
      provider: result.provider,
      model: result.model,
      contentLength: result.content.length,
      durationMs: result.durationMs,
      error: result.error,
    });
  }

  // Filter out empty/failed secondaries before merge
  const validSecondaries = secondaryResults.filter((r) => !r.error && r.content.trim());
  const didMerge = validSecondaries.length > 0;

  // Merge results
  let mergedText: string;
  if (didMerge) {
    const mergeTimeoutMs = Math.max(overallTimeout - (Date.now() - startTime), 5000);
    mergedText = await mergeSubTaskResults({
      originalPrompt,
      primaryResult,
      secondaryResults: validSecondaries,
      workspaceDir,
      timeoutMs: mergeTimeoutMs,
    });
  } else {
    mergedText = primaryResult.content;
  }

  const totalDurationMs = Date.now() - startTime;
  const successCount = allResults.filter((r) => !r.error && r.content).length;

  // Emit completion event
  emitAgentEvent({
    runId: sessionId,
    stream: "routing",
    data: {
      type: "compound_orchestration_result",
      orchestrationId,
      primaryDomain: classification.domain,
      subTasks: allResults.map((r) => ({
        domain: r.domain,
        provider: r.provider,
        model: r.model,
        contentLength: r.content.length,
        durationMs: r.durationMs,
        error: r.error,
      })),
      successCount,
      didMerge,
      totalDurationMs,
    },
  });

  emitObsEvent("compound_orchestration_complete", sessionId, {
    orchestrationId,
    primaryDomain: classification.domain,
    successCount,
    totalCount: allResults.length,
    didMerge,
    totalDurationMs,
  });

  log.info(
    `compound orchestration complete: ${successCount}/${allResults.length} subtasks, ` +
      `didMerge=${didMerge}, ${totalDurationMs}ms total`,
  );

  return { mergedText, subTasks: allResults, totalDurationMs, didMerge };
}
