/**
 * Multi-brain routing middleware — extracted from get-reply.ts to minimize
 * upstream patch surface. All PAIOS routing logic lives here.
 *
 * Two hook points called from get-reply.ts:
 *   1. applyMultiBrainRouting()  — after session state, before model override
 *   2. scheduleVerification()    — after reply, fire-and-forget quality gate
 */

import { emitAgentEvent } from "../infra/agent-events.js";
import { defaultRuntime } from "../runtime.js";
import {
  classifyTask,
  dynamicConfidenceThreshold,
  logRoutingDecision,
  type ClassificationResult,
} from "./task-classifier.js";

// ── Input routing ──────────────────────────────────────────────────────

export type RoutingInput = {
  bodyStripped: string | undefined;
  isHeartbeat: boolean;
  hasResolvedHeartbeatModelOverride: boolean;
  hasImages: boolean;
  sessionId: string | undefined;
};

export type RoutingResult = {
  applied: boolean;
  provider?: string;
  model?: string;
  classification?: ClassificationResult;
};

/**
 * Classifies the incoming message and returns the optimal provider/model.
 * Returns `{ applied: false }` if routing was skipped (heartbeat, empty body, low confidence).
 */
export function applyMultiBrainRouting(input: RoutingInput): RoutingResult {
  if (input.isHeartbeat || input.hasResolvedHeartbeatModelOverride || !input.bodyStripped?.trim()) {
    return { applied: false };
  }

  const classification = classifyTask({ message: input.bodyStripped, hasImages: input.hasImages });
  logRoutingDecision(input.bodyStripped, classification);

  // Fire observability event (fire-and-forget)
  emitAgentEvent({
    runId: input.sessionId ?? "",
    stream: "routing",
    data: {
      domain: classification.domain,
      provider: classification.provider,
      model: classification.model,
      confidence: classification.confidence,
      reason: classification.reason,
      ...(classification.isCompound
        ? {
            isCompound: true,
            secondaryDomains: classification.secondaryDomains,
          }
        : {}),
    },
  });

  if (classification.confidence >= dynamicConfidenceThreshold) {
    return {
      applied: true,
      provider: classification.provider,
      model: classification.model,
      classification,
    };
  }

  return { applied: false, classification };
}

// ── Output verification ────────────────────────────────────────────────

export type VerificationInput = {
  bodyStripped: string | undefined;
  isHeartbeat: boolean;
  hasImages: boolean;
  provider: string;
  model: string;
  sessionId: string | undefined;
  workspaceDir: string;
  reply: unknown; // ReplyPayload | ReplyPayload[] | undefined
};

// ── Compound orchestration gate ───────────────────────────────────────

/**
 * Determines if pre-reply compound orchestration should activate.
 * Checks: not heartbeat, has body, isCompound, secondaries above threshold.
 */
export function shouldOrchestrate(input: RoutingInput): {
  shouldOrchestrate: boolean;
  classification?: ClassificationResult;
} {
  if (input.isHeartbeat || input.hasResolvedHeartbeatModelOverride || !input.bodyStripped?.trim()) {
    return { shouldOrchestrate: false };
  }

  const classification = classifyTask({ message: input.bodyStripped, hasImages: input.hasImages });

  if (
    !classification.isCompound ||
    !classification.secondaryDomains ||
    classification.secondaryDomains.length === 0
  ) {
    return { shouldOrchestrate: false, classification };
  }

  // At least one secondary must meet the confidence threshold
  const hasQualifiedSecondary = classification.secondaryDomains.some(
    (s) => s.confidence >= dynamicConfidenceThreshold,
  );

  return { shouldOrchestrate: hasQualifiedSecondary, classification };
}

/**
 * Runs compound orchestration via dynamic import to avoid circular deps.
 * Returns merged text or null (fall through to normal path).
 */
export async function runCompoundOrchestration(input: {
  classification: ClassificationResult;
  bodyStripped: string;
  sessionId: string;
  workspaceDir: string;
  timeoutMs: number;
}): Promise<{ text: string } | null> {
  const { orchestrateCompoundTask } = await import("./compound-orchestrator.js");
  const result = await orchestrateCompoundTask({
    classification: input.classification,
    originalPrompt: input.bodyStripped,
    sessionId: input.sessionId,
    workspaceDir: input.workspaceDir,
    timeoutMs: input.timeoutMs,
  });

  if (!result || !result.mergedText) {
    return null;
  }

  return { text: result.mergedText };
}

// ── Cross-brain decomposition ─────────────────────────────────────────

/**
 * Schedules fire-and-forget decomposition for compound tasks.
 * Secondary brains enrich the primary reply post-delivery.
 * Dynamic import avoids circular chunk dependencies.
 */
export function scheduleDecomposition(input: VerificationInput): void {
  if (input.isHeartbeat || !input.bodyStripped?.trim()) {
    return;
  }

  const classResult = classifyTask({ message: input.bodyStripped, hasImages: input.hasImages });

  import("./task-decomposer.js")
    .then(({ shouldDecompose, executeDecomposition }) => {
      if (!shouldDecompose(classResult)) {
        return;
      }
      const reply = input.reply as { text?: string } | Array<{ text?: string }> | undefined;
      const replyText = Array.isArray(reply)
        ? reply.map((r) => r.text ?? "").join("\n")
        : ((reply as { text?: string } | undefined)?.text ?? "");
      if (!replyText) {
        return;
      }
      return executeDecomposition({
        classification: classResult,
        originalPrompt: input.bodyStripped ?? "",
        primaryReplyText: replyText,
        originalProvider: input.provider,
        originalModel: input.model,
        runId: input.sessionId ?? "",
        workspaceDir: input.workspaceDir,
      });
    })
    .catch((err) => {
      defaultRuntime.log?.("warn", `decomposition fire-and-forget failed: ${err}`);
    });
}

/**
 * Schedules a fire-and-forget verification check using a different brain.
 * Dynamic import avoids circular chunk dependencies.
 */
export function scheduleVerification(input: VerificationInput): void {
  if (input.isHeartbeat || !input.bodyStripped?.trim()) {
    return;
  }

  const classResult = classifyTask({ message: input.bodyStripped, hasImages: input.hasImages });

  import("./verification.js")
    .then(({ shouldVerify, executeVerification }) => {
      if (!shouldVerify(classResult.domain, classResult.confidence)) {
        return;
      }
      const reply = input.reply as { text?: string } | Array<{ text?: string }> | undefined;
      const replyText = Array.isArray(reply)
        ? reply.map((r) => r.text ?? "").join("\n")
        : ((reply as { text?: string } | undefined)?.text ?? "");
      if (!replyText) {
        return;
      }
      return executeVerification({
        domain: classResult.domain,
        originalProvider: input.provider,
        originalModel: input.model,
        responseText: replyText,
        originalPrompt: input.bodyStripped ?? "",
        runId: input.sessionId ?? "",
        workspaceDir: input.workspaceDir,
      });
    })
    .catch((err) => {
      defaultRuntime.log?.("warn", `verification fire-and-forget failed: ${err}`);
    });
}
