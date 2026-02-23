/**
 * Loads blocked command patterns from ~/.openclaw/exec-approvals.json.
 * Used by the SDK runner's canUseTool callback to deny dangerous bash commands.
 */

import fs from "node:fs";
import { resolveExecApprovalsPath } from "../../infra/exec-approvals.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { DEFAULT_AGENT_ID } from "../../routing/session-key.js";

const log = createSubsystemLogger("agent/sdk-blocked");

/** Cached patterns to avoid re-reading the file on every tool call. */
let cachedPatterns: string[] | null = null;
let cachedMtimeMs = 0;

export function loadExecApprovalBlockedPatterns(agentId?: string): string[] {
  const filePath = resolveExecApprovalsPath();
  try {
    const stat = fs.statSync(filePath);
    if (cachedPatterns && stat.mtimeMs === cachedMtimeMs) {
      return cachedPatterns;
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      agents?: Record<string, { blockedPatterns?: string[] }>;
    };

    const resolvedAgentId = agentId ?? DEFAULT_AGENT_ID;
    const agentConfig = parsed.agents?.[resolvedAgentId];
    const patterns = agentConfig?.blockedPatterns ?? [];

    cachedPatterns = patterns;
    cachedMtimeMs = stat.mtimeMs;

    log.info(`loaded ${patterns.length} blocked patterns for agent=${resolvedAgentId}`);
    return patterns;
  } catch {
    log.warn(`failed to load blocked patterns from ${filePath}, using empty list`);
    return [];
  }
}

/** Reset the cache (useful for testing). */
export function resetBlockedPatternsCache(): void {
  cachedPatterns = null;
  cachedMtimeMs = 0;
}
