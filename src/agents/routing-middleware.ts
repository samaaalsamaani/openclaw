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
import { classifyTask, logRoutingDecision, type ClassificationResult } from "./task-classifier.js";

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

  if (classification.confidence >= 70) {
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
