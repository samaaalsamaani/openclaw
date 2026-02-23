/**
 * SDK Runner — runs Claude Code agent via the Agent SDK in-process instead of
 * spawning a subprocess.  Returns the same EmbeddedPiRunResult contract used by
 * cli-runner.ts so it slots into the existing failover chain transparently.
 *
 * Key advantages over subprocess:
 *   • canUseTool() callback for per-tool permission gating
 *   • In-process MCP servers (createSdkMcpServer) — no extra stdio processes
 *   • Structured message stream (no stdout JSON parsing)
 *   • AbortController-based cancellation with clean shutdown
 *   • Session management with resume support
 */

import type {
  McpServerConfig,
  Options as SdkOptions,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ImageContent } from "@mariozechner/pi-ai";
import { resolveHeartbeatPrompt } from "../auto-reply/heartbeat.js";
import type { ThinkLevel } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveSessionAgentIds } from "./agent-scope.js";
import { enforceAutonomy } from "./autonomy-enforcer.js";
import { makeBootstrapWarn, resolveBootstrapContextForRun } from "./bootstrap-files.js";
import { buildSystemPrompt } from "./cli-runner/helpers.js";
import { resolveOpenClawDocsPath } from "./docs-path.js";
import { FailoverError, resolveFailoverStatus } from "./failover-error.js";
import { classifyFailoverReason, isFailoverErrorMessage } from "./pi-embedded-helpers.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner.js";
import { loadExecApprovalBlockedPatterns } from "./sdk-runner/blocked-patterns.js";
import { buildSdkMcpServers } from "./sdk-runner/mcp-servers.js";
import { redactRunIdentifier, resolveRunWorkspaceDir } from "./workspace-run.js";

const log = createSubsystemLogger("agent/claude-sdk");

/** Model aliases for the SDK (claude model shortnames → full IDs). */
const SDK_MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5",
  haiku: "claude-haiku-4-5",
  default: "claude-sonnet-4-5",
};

function resolveModel(model: string): string {
  const key = model.trim().toLowerCase();
  return SDK_MODEL_ALIASES[key] ?? model;
}

/** Map SDK error subtypes to FailoverError reasons. */
function classifySdkError(
  errorSubtype: string | undefined,
): "auth" | "billing" | "rate_limit" | "timeout" | "unknown" {
  switch (errorSubtype) {
    case "authentication_failed":
      return "auth";
    case "billing_error":
      return "billing";
    case "rate_limit":
      return "rate_limit";
    default:
      return "unknown";
  }
}

export type SdkRunnerParams = {
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  sessionFile: string;
  workspaceDir: string;
  config?: OpenClawConfig;
  prompt: string;
  provider: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  timeoutMs: number;
  runId: string;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  sdkSessionId?: string;
  images?: ImageContent[];
  /** Extra MCP servers to expose to the SDK session (in-process or stdio). */
  mcpServers?: Record<string, McpServerConfig>;
};

export async function runSdkAgent(params: SdkRunnerParams): Promise<EmbeddedPiRunResult> {
  const started = Date.now();

  // Resolve workspace directory
  const workspaceResolution = resolveRunWorkspaceDir({
    workspaceDir: params.workspaceDir,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    config: params.config,
  });
  const workspaceDir = workspaceResolution.workspaceDir;
  if (workspaceResolution.usedFallback) {
    const redactedSid = redactRunIdentifier(params.sessionId);
    const redactedKey = redactRunIdentifier(params.sessionKey);
    const redactedWs = redactRunIdentifier(workspaceDir);
    log.warn(
      `[workspace-fallback] caller=runSdkAgent reason=${workspaceResolution.fallbackReason} run=${params.runId} session=${redactedSid} sessionKey=${redactedKey} agent=${workspaceResolution.agentId} workspace=${redactedWs}`,
    );
  }

  // Resolve model
  const modelId = (params.model ?? "default").trim() || "default";
  const resolvedModel = resolveModel(modelId);

  // Build system prompt (same as CLI runner, but WITHOUT "Tools are disabled")
  const sessionLabel = params.sessionKey ?? params.sessionId;
  const { contextFiles } = await resolveBootstrapContextForRun({
    workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    warn: makeBootstrapWarn({ sessionLabel, warn: (msg) => log.warn(msg) }),
  });
  const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.config,
  });
  const heartbeatPrompt =
    sessionAgentId === defaultAgentId
      ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
      : undefined;
  const docsPath = await resolveOpenClawDocsPath({
    workspaceDir,
    argv1: process.argv[1],
    cwd: process.cwd(),
    moduleUrl: import.meta.url,
  });
  const systemPrompt = buildSystemPrompt({
    workspaceDir,
    config: params.config,
    defaultThinkLevel: params.thinkLevel,
    extraSystemPrompt: params.extraSystemPrompt?.trim(),
    ownerNumbers: params.ownerNumbers,
    heartbeatPrompt,
    docsPath: docsPath ?? undefined,
    tools: [],
    contextFiles,
    modelDisplay: `${params.provider}/${modelId}`,
    agentId: sessionAgentId,
  });

  // Load blocked patterns for canUseTool
  const blockedPatterns = loadExecApprovalBlockedPatterns(params.agentId);

  // Build canUseTool callback
  const canUseTool: SdkOptions["canUseTool"] = async (toolName, input) => {
    if (toolName === "Bash" && typeof input.command === "string") {
      const command = input.command;
      for (const pattern of blockedPatterns) {
        if (command.includes(pattern)) {
          log.warn(
            `sdk canUseTool: blocked command matching "${pattern}": ${command.substring(0, 100)}`,
          );
          return {
            behavior: "deny" as const,
            message: `Command blocked by security policy (matches: ${pattern})`,
          };
        }
      }

      // Autonomy enforcer — DB-driven trust layer (after blocked patterns)
      const autonomy = enforceAutonomy(command);
      if (autonomy.action === "deny") {
        log.warn(
          `sdk canUseTool: autonomy denied (level=${autonomy.level}, pattern=${autonomy.pattern}): ${command.substring(0, 100)}`,
        );
        return {
          behavior: "deny" as const,
          message: `Command blocked by autonomy policy (pattern: ${autonomy.matchedRule ?? autonomy.pattern})`,
        };
      }
    }
    return { behavior: "allow" as const, updatedInput: input };
  };

  // Build in-process MCP servers if none provided
  const mcpServers = params.mcpServers ?? (await buildSdkMcpServers());

  // Set up AbortController with timeout
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (params.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      log.warn(
        `sdk timeout: provider=${params.provider} model=${modelId} timeoutMs=${params.timeoutMs}`,
      );
      controller.abort();
    }, params.timeoutMs);
  }

  try {
    // Dynamically import the SDK (it's an ESM package with a .mjs entry)
    const sdk = await import("@anthropic-ai/claude-agent-sdk");

    // Build SDK options
    const sdkOptions: SdkOptions = {
      model: resolvedModel,
      cwd: workspaceDir,
      abortController: controller,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      canUseTool,
      systemPrompt: systemPrompt
        ? { type: "preset", preset: "claude_code", append: systemPrompt }
        : { type: "preset", preset: "claude_code" },
      persistSession: false,
      settingSources: [],
      mcpServers,
    };

    // Resume if session ID is provided
    if (params.sdkSessionId) {
      sdkOptions.resume = params.sdkSessionId;
    }

    log.info(
      `sdk exec: provider=${params.provider} model=${resolvedModel} promptChars=${params.prompt.length}`,
    );

    // Run the SDK query
    const queryObj = sdk.query({ prompt: params.prompt, options: sdkOptions });

    // Collect result from streaming messages
    let resultText = "";
    let sdkSessionId: string | undefined;
    let resultMessage: SDKResultMessage | undefined;
    let lastError: string | undefined;

    for await (const message of queryObj) {
      const msg = message;

      switch (msg.type) {
        case "system":
          if (msg.subtype === "init") {
            sdkSessionId = msg.session_id;
          }
          break;

        case "assistant": {
          // Extract text content from assistant message
          if (msg.message?.content) {
            for (const block of msg.message.content) {
              if (
                typeof block === "object" &&
                block !== null &&
                "type" in block &&
                block.type === "text" &&
                "text" in block
              ) {
                resultText += (block as { text: string }).text;
              }
            }
          }
          // Check for error on the assistant message
          if (msg.error) {
            lastError = msg.error;
          }
          break;
        }

        case "result":
          resultMessage = msg;
          if (msg.subtype === "success" && "result" in msg) {
            resultText = msg.result ?? resultText;
          }
          break;
      }
    }

    // Handle error results
    if (resultMessage && resultMessage.is_error) {
      const errorMsg =
        "errors" in resultMessage && resultMessage.errors?.length
          ? resultMessage.errors.join("; ")
          : `SDK run failed: ${resultMessage.subtype}`;

      if (lastError) {
        const reason = classifySdkError(lastError);
        throw new FailoverError(errorMsg, {
          reason,
          provider: params.provider,
          model: modelId,
          status: resolveFailoverStatus(reason),
        });
      }
      // Non-API errors (max turns, max budget, etc.) — still return the text we got
      log.warn(`sdk run ended with error: ${resultMessage.subtype} — ${errorMsg}`);
    }

    // Build usage from result (SDK uses snake_case field names)
    const usage = resultMessage?.usage
      ? {
          input: resultMessage.usage.input_tokens,
          output: resultMessage.usage.output_tokens,
          cacheRead: resultMessage.usage.cache_read_input_tokens,
          cacheWrite: resultMessage.usage.cache_creation_input_tokens,
          total: (resultMessage.usage.input_tokens ?? 0) + (resultMessage.usage.output_tokens ?? 0),
        }
      : undefined;

    const text = resultText.trim();
    const payloads = text ? [{ text }] : undefined;

    return {
      payloads,
      meta: {
        durationMs: Date.now() - started,
        agentMeta: {
          sessionId: sdkSessionId ?? params.sessionId,
          provider: params.provider,
          model: modelId,
          usage,
        },
      },
    };
  } catch (err) {
    // Re-throw FailoverErrors as-is
    if (err instanceof FailoverError) {
      throw err;
    }

    // Handle AbortError from timeout
    const errMsg = err instanceof Error ? err.message : String(err);
    if ((err instanceof Error && err.name === "AbortError") || errMsg.includes("abort")) {
      throw new FailoverError(
        `SDK session timed out after ${Math.round(params.timeoutMs / 1000)}s`,
        {
          reason: "timeout",
          provider: params.provider,
          model: modelId,
          status: resolveFailoverStatus("timeout"),
        },
      );
    }

    // Classify other errors
    if (isFailoverErrorMessage(errMsg)) {
      const reason = classifyFailoverReason(errMsg) ?? "unknown";
      throw new FailoverError(errMsg, {
        reason,
        provider: params.provider,
        model: modelId,
        status: resolveFailoverStatus(reason),
      });
    }

    throw err;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    // Ensure controller is aborted to clean up any remaining processes
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }
}
