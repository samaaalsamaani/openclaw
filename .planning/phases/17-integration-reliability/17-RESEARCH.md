# Phase 17: Integration Reliability - Research

**Researched:** 2026-02-27
**Domain:** Cross-system integration patterns, retry logic, error boundaries, process management
**Confidence:** HIGH

## Summary

Phase 17 focuses on making six critical integration points reliable: Gateway ↔ Claude SDK calls, MCP cross-calls between CLIs, hook execution (PreToolUse, PostToolUse, SessionStart), long prompt handling in Agent SDK, Codex subprocess calls, and MCP server error handling. The system already has solid foundations (ProcessSupervisor for process management, FailoverError classification, circuit breakers from Phase 16) but needs systematic improvements in retry logic, timeout handling, ARG_MAX mitigation, and error boundary patterns.

**Primary recommendation:** Layer defense-in-depth with three tiers: (1) automatic retry with exponential backoff for transient failures, (2) circuit breakers to prevent retry storms, (3) error boundaries that catch and log failures without crashing parent processes. Use temp files for prompts >10KB to avoid ARG_MAX errors. Wrap all hooks in try/catch to prevent hook failures from blocking main operations.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Retry & Backoff Strategy:**

- Max retries: 3 retries (initial + 3 retries = 4 total attempts)
- Backoff strategy: Exponential backoff (1s, 2s, 4s, 8s...)
- Circuit breakers: Yes, implement circuit breakers to prevent retry storms
- Circuit breaker threshold: 5 consecutive failures opens circuit
- Circuit breaker timeout: 60 seconds (from Phase 16 circuit-breaker.ts)

**Timeout Policy:**

- MCP tool calls: 30 seconds timeout (standard for local calls)
- Agent SDK calls: 120 seconds timeout (LLM calls need longer wait)
- Configuration: Hard-coded timeouts (reasonable defaults, no config needed)
- On timeout: Log to observability.sqlite and return error to caller

**Error Classification & Handling:**

- Retryable errors: Network/temp errors only (ECONNRESET, ETIMEDOUT, 503, 429)
- Permanent errors: Return immediately (don't retry client errors like 400, 401, 404)
- Crash policy: Never crash - return structured errors, let caller decide
- Hook error handling: Catch and log, don't block main operation (hook failures shouldn't prevent main action)

**Failure Visibility & Logging:**

- Log destination: observability.sqlite (structured events - queryable, persistent)
- Log detail: Context + stack (timestamp, integration type, error message, stack trace, retry count)
- Retry logging: Final result only (log once after retries exhausted - reduce noise)
- Alerting policy: Repeated failures only (alert after 5+ failures in 10 minutes - avoid alert fatigue)

### Claude's Discretion

None - all integration reliability patterns locked by user decisions.

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                           | Research Support                                                                                                 |
| -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| INTEG-01 | Gateway ↔ Claude SDK calls succeed 99%+ (no ARG_MAX, timeout, or parsing errors)      | Temp file fallback for >10KB prompts, 120s timeout, AbortController cleanup, retry with exponential backoff      |
| INTEG-02 | MCP cross-calls between CLIs work reliably (no connection drops or timeouts)          | 30s timeout, retry on ECONNRESET/ETIMEDOUT, circuit breaker prevents retry storms, error boundaries in MCP tools |
| INTEG-03 | Hooks (PreToolUse, PostToolUse, SessionStart) execute without crashing parent process | Wrap all hook handlers in try/catch, log errors to observability, return gracefully, never throw                 |
| INTEG-04 | Agent SDK handles long prompts (>10KB) without ARG_MAX errors                         | Detect prompt size, write to temp file, pass file path instead of inline arg, cleanup temp file in finally block |
| INTEG-05 | Codex subprocess calls have proper error handling and cleanup                         | ProcessSupervisor already handles cleanup, add retry logic, timeout enforcement, exit code classification        |
| INTEG-06 | MCP server errors are caught and logged (no silent failures)                          | Error boundaries (withErrorBoundary pattern from mcp-servers.ts), isError=true responses, observability logging  |

</phase_requirements>

## Standard Stack

### Core (Already in Use)

| Library            | Version          | Purpose                      | Why Standard                                                                |
| ------------------ | ---------------- | ---------------------------- | --------------------------------------------------------------------------- |
| ProcessSupervisor  | Gateway built-in | Process lifecycle management | Already manages spawn, timeout, cleanup for CLI subprocess calls            |
| AbortController    | Node stdlib      | Cancellation signal          | Web standard, works with fetch() and SDK, prevents orphaned processes       |
| better-sqlite3     | Current          | Observability logging        | Synchronous API, already in use for crash logs and event storage            |
| FailoverError      | Gateway built-in | Error classification         | Existing pattern in cli-runner.ts, classifies errors as retryable/permanent |
| circuit-breaker.ts | Phase 16         | Circuit breaker pattern      | 5-failure threshold, 60s timeout, prevents retry storms                     |

### Supporting (Error Handling Patterns)

| Library          | Version     | Purpose             | When to Use                                            |
| ---------------- | ----------- | ------------------- | ------------------------------------------------------ |
| node:fs/promises | Node stdlib | Temp file creation  | ARG_MAX mitigation for prompts >10KB                   |
| node:os          | Node stdlib | Temp directory path | Safe location for temp prompt files                    |
| Zod              | Current     | Input validation    | MCP tool schema validation (already in mcp-servers.ts) |

### Alternatives Considered

| Instead of           | Could Use               | Tradeoff                                                              |
| -------------------- | ----------------------- | --------------------------------------------------------------------- |
| Temp file pattern    | Base64 encoding prompts | Base64 still counts against ARG_MAX, doesn't solve the problem        |
| Circuit breaker      | Simple retry loop       | No protection against retry storms, cascading failures                |
| try/catch boundaries | Let-it-crash philosophy | Crashes entire process, loses in-flight work, no graceful degradation |
| observability.sqlite | Console logging         | Logs lost on restart, not queryable, no structured data               |

**Installation:**

All dependencies already installed (Node stdlib, existing Gateway modules, Phase 16 circuit-breaker.ts).

## Architecture Patterns

### Recommended Integration Structure

```
src/
├── agents/
│   ├── cli-runner.ts               # Subprocess calls (Codex CLI)
│   ├── sdk-runner/
│   │   └── mcp-servers.ts          # Error boundaries for MCP tools
│   ├── hooks/                      # Hook execution wrappers
│   │   ├── pre-tool-use.ts
│   │   ├── post-tool-use.ts
│   │   └── session-start.ts
│   └── retry-logic.ts              # NEW: Shared retry/backoff utilities
├── infra/
│   ├── circuit-breaker.ts          # Phase 16: Circuit breaker
│   └── temp-file-manager.ts        # NEW: ARG_MAX mitigation
└── process/
    └── supervisor/                 # Existing ProcessSupervisor
```

### Pattern 1: Retry with Exponential Backoff

**What:** Retry transient failures with exponential backoff (1s, 2s, 4s, 8s), max 3 retries, classify errors as retryable/permanent

**When to use:** All external integration calls (SDK, MCP, subprocess)

**Example:**

```typescript
// Source: User decisions + industry standard retry pattern
import { FailoverError } from "./failover-error.js";
import { getCircuitBreaker } from "../infra/circuit-breaker.js";

type RetryableError = "ECONNRESET" | "ETIMEDOUT" | "ENOTFOUND" | "EPIPE";
const RETRYABLE_ERRORS: Set<string> = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE"]);
const RETRYABLE_HTTP_CODES: Set<number> = new Set([429, 503, 504]);
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s, 8s

function isRetryableError(error: unknown): boolean {
  if (error instanceof FailoverError) {
    // Respect FailoverError classification
    return error.reason === "timeout" || error.reason === "network";
  }

  if (error instanceof Error) {
    // Network errors
    const code = (error as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_ERRORS.has(code)) {
      return true;
    }
  }

  // HTTP errors
  if (typeof error === "object" && error !== null) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && RETRYABLE_HTTP_CODES.has(statusCode)) {
      return true;
    }
  }

  return false;
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  context: { name: string; circuitKey?: string },
): Promise<T> {
  let lastError: unknown;

  // Check circuit breaker if key provided
  if (context.circuitKey) {
    const breaker = getCircuitBreaker(context.circuitKey);
    if (breaker.state === "open") {
      const elapsed = Date.now() - breaker.lastFailure;
      if (elapsed < 60_000) {
        // 60s timeout
        throw new Error(`Circuit breaker open for ${context.circuitKey}`);
      }
      breaker.state = "half-open";
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await operation();

      // Success—reset circuit breaker
      if (context.circuitKey) {
        const breaker = getCircuitBreaker(context.circuitKey);
        breaker.failures = 0;
        breaker.state = "closed";
      }

      return result;
    } catch (error) {
      lastError = error;

      // Don't retry permanent errors
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === MAX_RETRIES) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
      console.warn(
        `[retry] ${context.name} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ` +
          `retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted—update circuit breaker
  if (context.circuitKey) {
    const breaker = getCircuitBreaker(context.circuitKey);
    breaker.failures++;
    breaker.lastFailure = Date.now();
    if (breaker.failures >= 5) {
      breaker.state = "open";
      console.error(
        `[circuit-breaker] Opened for ${context.circuitKey} after ${breaker.failures} failures`,
      );
    }
  }

  // Log to observability
  logIntegrationFailure({
    integration: context.name,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    retryCount: MAX_RETRIES,
    timestamp: Date.now(),
  });

  throw lastError;
}

function logIntegrationFailure(params: {
  integration: string;
  error: string;
  retryCount: number;
  timestamp: number;
}) {
  // Log to observability.sqlite (final result only, after retries exhausted)
  try {
    const Database = require("better-sqlite3");
    const path = require("node:path");
    const dbPath = path.join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");
    const db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");

    db.prepare(
      `
      INSERT INTO events (timestamp, category, event_type, metadata)
      VALUES (?, 'integration', 'failure', ?)
    `,
    ).run(
      params.timestamp,
      JSON.stringify({
        integration: params.integration,
        error: params.error,
        retry_count: params.retryCount,
      }),
    );

    db.close();
  } catch {
    // Don't crash if observability logging fails
    console.error("[observability] Failed to log integration failure");
  }
}
```

### Pattern 2: ARG_MAX Mitigation with Temp Files

**What:** Detect prompts >10KB, write to temp file, pass file path as argument instead of inline content

**When to use:** Agent SDK calls, CLI subprocess calls with large prompts

**Example:**

```typescript
// Source: ARG_MAX research + Node.js temp file best practices
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const ARG_MAX_THRESHOLD = 10_000; // 10KB (conservative—ARG_MAX is ~260KB on macOS)

async function withTempFile<T>(
  content: string,
  operation: (filePath: string) => Promise<T>,
): Promise<T> {
  if (content.length < ARG_MAX_THRESHOLD) {
    // Content small enough—pass inline (no temp file needed)
    return operation(content);
  }

  // Content too large—use temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `openclaw-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );

  try {
    await fs.writeFile(tmpFile, content, "utf-8");
    console.info(`[temp-file] Created ${tmpFile} for ${content.length} byte prompt`);

    // Pass file path to operation
    const result = await operation(tmpFile);
    return result;
  } finally {
    // Always cleanup temp file
    try {
      await fs.unlink(tmpFile);
    } catch (cleanupError) {
      console.warn(`[temp-file] Failed to cleanup ${tmpFile}: ${cleanupError}`);
    }
  }
}

// Usage with Agent SDK
async function runSdkAgentWithLargePrompt(prompt: string) {
  return withTempFile(prompt, async (filePathOrContent) => {
    const args =
      filePathOrContent.length > ARG_MAX_THRESHOLD
        ? ["--prompt-file", filePathOrContent] // Use file path
        : ["--prompt", filePathOrContent]; // Use inline content

    // Call SDK with appropriate args
    const result = await sdkRunner.query({ args });
    return result;
  });
}
```

### Pattern 3: Hook Error Boundaries

**What:** Wrap all hook handlers in try/catch, log errors to observability, return gracefully without blocking main operation

**When to use:** PreToolUse, PostToolUse, SessionStart, SessionEnd hooks

**Example:**

```typescript
// Source: User decision "hook failures shouldn't prevent main action" + existing internal-hooks.ts
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { InternalHookEvent, InternalHookHandler } from "./internal-hooks.js";

const log = createSubsystemLogger("hook-executor");

function wrapHookWithErrorBoundary(
  hookName: string,
  handler: InternalHookHandler,
): InternalHookHandler {
  return async (event: InternalHookEvent) => {
    try {
      await handler(event);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log to observability
      log.error(
        `[hook-error] ${hookName} failed for ${event.type}:${event.action} ` +
          `session=${event.sessionKey}: ${errorMessage}`,
      );

      logHookFailure({
        hookName,
        eventType: event.type,
        eventAction: event.action,
        sessionKey: event.sessionKey,
        error: errorMessage,
        stack: errorStack,
        timestamp: Date.now(),
      });

      // Continue execution—hook failure doesn't block main operation
      // This is a CRITICAL pattern: hooks are decorators, not requirements
    }
  };
}

function logHookFailure(params: {
  hookName: string;
  eventType: string;
  eventAction: string;
  sessionKey: string;
  error: string;
  stack?: string;
  timestamp: number;
}) {
  try {
    const Database = require("better-sqlite3");
    const path = require("node:path");
    const dbPath = path.join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");
    const db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");

    db.prepare(
      `
      INSERT INTO events (timestamp, category, event_type, metadata)
      VALUES (?, 'hook', 'error', ?)
    `,
    ).run(
      params.timestamp,
      JSON.stringify({
        hook_name: params.hookName,
        event_type: params.eventType,
        event_action: params.eventAction,
        session_key: params.sessionKey,
        error: params.error,
        stack: params.stack,
      }),
    );

    db.close();
  } catch {
    // Don't crash if observability logging fails
    log.warn("[observability] Failed to log hook failure");
  }
}

// Apply to all hook registrations
export function registerSafeHook(eventKey: string, handler: InternalHookHandler) {
  const wrappedHandler = wrapHookWithErrorBoundary(eventKey, handler);
  registerInternalHook(eventKey, wrappedHandler);
}
```

### Pattern 4: MCP Tool Error Boundaries

**What:** Wrap MCP tool handlers in try/catch, return isError=true instead of crashing, include error details in response

**When to use:** All MCP tool implementations (in-process and stdio servers)

**Example:**

```typescript
// Source: Existing mcp-servers.ts withErrorBoundary pattern
function withMcpErrorBoundary<T extends Record<string, unknown>>(
  toolName: string,
  handler: (input: T) => Promise<{ content: Array<{ type: string; text: string }> }>,
): (input: T) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  return async (input: T) => {
    try {
      return await handler(input);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log to observability
      console.error(`[mcp-error] ${toolName} failed:`, {
        input,
        error: errorMessage,
        stack: errorStack,
      });

      logMcpToolFailure({
        toolName,
        input: JSON.stringify(input),
        error: errorMessage,
        timestamp: Date.now(),
      });

      // Return structured error response (isError=true signals failure to MCP client)
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error in ${toolName}: ${errorMessage}`,
          },
        ],
      };
    }
  };
}

function logMcpToolFailure(params: {
  toolName: string;
  input: string;
  error: string;
  timestamp: number;
}) {
  try {
    const Database = require("better-sqlite3");
    const path = require("node:path");
    const dbPath = path.join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");
    const db = new Database(dbPath);
    db.pragma("busy_timeout = 5000");

    db.prepare(
      `
      INSERT INTO events (timestamp, category, event_type, metadata)
      VALUES (?, 'mcp', 'tool_error', ?)
    `,
    ).run(
      params.timestamp,
      JSON.stringify({
        tool_name: params.toolName,
        input: params.input,
        error: params.error,
      }),
    );

    db.close();
  } catch {
    console.warn("[observability] Failed to log MCP tool failure");
  }
}
```

### Pattern 5: Timeout Enforcement with AbortController

**What:** Use AbortController for cancellation, enforce timeouts (30s MCP, 120s SDK), cleanup on timeout

**When to use:** All async integration calls (SDK, MCP, subprocess)

**Example:**

```typescript
// Source: User decision (30s MCP, 120s SDK) + AbortController best practices
async function callWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    console.warn(`[timeout] ${context} exceeded ${timeoutMs}ms, aborting`);
    controller.abort();
  }, timeoutMs);

  try {
    const result = await operation(controller.signal);
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      // Timeout occurred
      const timeoutError = new Error(`${context} timed out after ${timeoutMs}ms`);

      logIntegrationFailure({
        integration: context,
        error: `Timeout after ${timeoutMs}ms`,
        retryCount: 0,
        timestamp: Date.now(),
      });

      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// Usage with MCP call
async function callMcpTool(toolName: string, input: unknown) {
  return callWithTimeout(
    async (signal) => {
      const response = await fetch("http://localhost:3000/mcp/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, input }),
        signal, // Pass abort signal to fetch
      });
      return response.json();
    },
    30_000, // 30s timeout for MCP
    `mcp:${toolName}`,
  );
}

// Usage with SDK call
async function callSdkAgent(prompt: string) {
  return callWithTimeout(
    async (signal) => {
      const result = await sdkRunner.query({
        prompt,
        signal, // Pass abort signal to SDK
      });
      return result;
    },
    120_000, // 120s timeout for SDK
    "sdk:query",
  );
}
```

### Anti-Patterns to Avoid

- **Retrying non-retryable errors:** Don't retry 400, 401, 404 errors. Classify errors properly.
- **No circuit breaker:** Infinite retries cause cascading failures. Always use circuit breaker with retry.
- **Inline prompts >10KB:** ARG_MAX errors are silent and confusing. Always use temp file fallback.
- **Throwing in hooks:** Hook failures should never crash parent process. Wrap in try/catch, log, continue.
- **Silent MCP tool failures:** Returning nothing hides errors. Always return isError=true with error message.
- **No timeout enforcement:** Operations hang forever. Always use AbortController with timeouts.
- **Logging every retry attempt:** Creates noise. Log final result only (after all retries exhausted).

## Don't Hand-Roll

| Problem              | Don't Build                       | Use Instead                                 | Why                                                                                             |
| -------------------- | --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Retry logic          | Custom retry loop per integration | Shared retryWithBackoff() utility           | Consistent backoff, error classification, circuit breaker integration, observability logging    |
| Process cleanup      | Manual PID tracking and kill()    | Existing ProcessSupervisor                  | Already handles spawn, timeout, cleanup, zombie prevention for subprocess calls                 |
| Error classification | String matching on error messages | Existing FailoverError + isRetryableError() | Structured error types, reason codes, already integrated with failover logic                    |
| Circuit breaker      | Custom failure counter            | Phase 16 circuit-breaker.ts                 | 5-failure threshold, 60s timeout, state transitions (closed/open/half-open) already implemented |
| Temp file management | Random file names in /tmp         | withTempFile() pattern                      | Cleanup guarantee via finally block, collision-resistant names, automatic threshold detection   |

**Key insight:** Integration reliability is deceptively complex—race conditions, partial failures, retry storms, resource leaks. Reuse proven patterns (ProcessSupervisor, FailoverError, circuit-breaker.ts) and extend with standardized utilities (retryWithBackoff, withTempFile, error boundaries) rather than rebuilding per-integration.

## Common Pitfalls

### Pitfall 1: ARG_MAX Errors Are Silent

**What goes wrong:** Subprocess call with >260KB of arguments fails silently with exit code 0 but produces no output. Debugging is extremely difficult because there's no error message—the process just doesn't execute.

**Why it happens:** Operating system ARG_MAX limit (262144 bytes on macOS) is enforced by kernel before process starts. Shell/subprocess library receives no error—the exec() syscall simply fails to start the process. System prompts with KB context can easily exceed 100KB.

**How to avoid:** Detect prompt size before making subprocess call. If >10KB, write to temp file and pass file path instead of inline argument. Always use withTempFile() pattern for Agent SDK and CLI subprocess calls.

**Warning signs:** Subprocess returns quickly with exit 0 but no stdout/stderr, large prompts (>50KB) being passed as arguments, KB context injection making prompts unexpectedly large.

### Pitfall 2: Retry Storms Without Circuit Breakers

**What goes wrong:** Service goes down (rate limited, crashed, network partition), retry logic floods it with requests, makes recovery impossible, cascades to other services, entire system becomes unresponsive.

**Why it happens:** Simple retry loops without circuit breakers don't detect systemic failures. If one brain (Codex) is down, every task routed to it retries 3 times, creating 4x traffic. With 10 concurrent sessions, that's 40 requests hitting a down service.

**How to avoid:** Always pair retry logic with circuit breaker. After 5 consecutive failures, open circuit and fail-fast for 60 seconds. This gives the failing service time to recover without retry traffic pressure.

**Warning signs:** API rate limit errors (429), multiple concurrent failures to same integration, logs showing retry → retry → retry loops, CPU/network saturation during outage.

### Pitfall 3: Hook Failures Crash Parent Process

**What goes wrong:** PostToolUse hook throws exception, entire Gateway crashes mid-session, user loses in-flight work, session state corrupted, no recovery possible.

**Why it happens:** Hooks are registered as synchronous event handlers. Uncaught exceptions in hooks propagate to the event loop and crash Node.js process. Hooks are "nice to have" features (auto-ingestion, SessionStart context) but should never crash critical operations.

**How to avoid:** Wrap ALL hook handlers in try/catch at registration time (wrapHookWithErrorBoundary). Log errors to observability. Never let hook exceptions escape to caller. Follow principle: hooks are decorators, not requirements.

**Warning signs:** Gateway crashes correlated with hook execution, "Unhandled rejection" in logs from hook code, session state inconsistencies after crashes.

### Pitfall 4: MCP Servers Crash on First Error

**What goes wrong:** MCP tool handler throws exception, entire MCP server process crashes, ALL tools in that server become unavailable, Claude/Codex sessions lose access to KB/system tools permanently.

**Why it happens:** MCP stdio protocol has no error recovery. When server process exits, the stdio pipe breaks. Neither Claude Code nor Codex CLI attempt to reconnect. A single uncaught exception in one tool (kb_query) crashes the entire server, making all tools (kb_article, kb_stats, etc.) unavailable.

**How to avoid:** Wrap every MCP tool handler in withMcpErrorBoundary. Return isError=true instead of throwing. Server stays up despite tool failures. Log errors to observability for debugging.

**Warning signs:** All MCP tools suddenly unavailable, "MCP server disconnected" messages, server restart required to regain tools, single tool error affects all tools.

### Pitfall 5: Timeout Without Cleanup

**What goes wrong:** SDK call times out, AbortController fires, but process continues running, accumulates orphaned child processes, memory leak, eventual OOM crash.

**Why it happens:** AbortController only signals cancellation—it doesn't force cleanup. If SDK doesn't respect abort signal, process keeps running. Agent SDK has documented memory leak from unclosed child processes (LEX8888/675867b7f130b7ad614905c9dd86b57a).

**How to avoid:** Always use AbortController with timeout. In timeout path, explicitly kill child processes via ProcessSupervisor. Log timeout to observability for investigation. Verify SDK respects abort signal in tests.

**Warning signs:** Memory growing after timeouts, orphaned processes visible in `ps aux | grep claude`, timeout logs but process still running, eventual Gateway crash from OOM.

### Pitfall 6: Retrying Non-Retryable Errors

**What goes wrong:** Authentication fails (401), retry logic tries 3 more times, wastes 15 seconds on exponential backoff, delays user response, no benefit.

**Why it happens:** Not all errors are transient. Authentication failures (401), authorization failures (403), not found (404), bad request (400) will never succeed on retry—they're permanent failures requiring user intervention.

**How to avoid:** Classify errors before retry. Only retry network errors (ECONNRESET, ETIMEDOUT), rate limits (429), service unavailable (503). Immediately return permanent errors to caller. Use FailoverError classification already in cli-runner.ts.

**Warning signs:** Logs showing retries of 401/403/404 errors, unnecessary retry delays, circuit breaker opening on permanent errors.

## Code Examples

Verified patterns from official sources:

### Subprocess Error Classification (Existing Pattern)

```typescript
// Source: cli-runner.ts lines 276-307
if (result.exitCode !== 0 || result.reason !== "exit") {
  if (result.reason === "no-output-timeout" || result.noOutputTimedOut) {
    const timeoutReason = `CLI produced no output for ${Math.round(noOutputTimeoutMs / 1000)}s and was terminated.`;
    throw new FailoverError(timeoutReason, {
      reason: "timeout",
      provider: params.provider,
      model: modelId,
      status: resolveFailoverStatus("timeout"),
    });
  }
  if (result.reason === "overall-timeout") {
    const timeoutReason = `CLI exceeded timeout (${Math.round(params.timeoutMs / 1000)}s) and was terminated.`;
    throw new FailoverError(timeoutReason, {
      reason: "timeout",
      provider: params.provider,
      model: modelId,
      status: resolveFailoverStatus("timeout"),
    });
  }
  const err = stderr || stdout || "CLI failed.";
  const reason = classifyFailoverReason(err) ?? "unknown";
  const status = resolveFailoverStatus(reason);
  throw new FailoverError(err, {
    reason,
    provider: params.provider,
    model: modelId,
    status,
  });
}
```

### MCP Error Boundary (Existing Pattern)

```typescript
// Source: mcp-servers.ts lines 18-51
function withErrorBoundary<T extends Record<string, unknown>>(
  toolName: string,
  handler: (input: T) => Promise<{ content: Array<{ type: string; text: string }> }>,
): (input: T) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  return async (input: T) => {
    try {
      return await handler(input);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log error with full context
      console.error(`[mcp-error] ${toolName} failed:`, {
        input,
        error: errorMessage,
        stack: errorStack,
      });

      // Return structured error response
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error in ${toolName}: ${errorMessage}`,
          },
        ],
      };
    }
  };
}
```

### ProcessSupervisor Usage (Existing Pattern)

```typescript
// Source: cli-runner.ts lines 235-255
const supervisor = getProcessSupervisor();
const scopeKey = buildCliSupervisorScopeKey({
  backend,
  backendId: backendResolved.id,
  cliSessionId: useResume ? cliSessionIdToSend : undefined,
});

const managedRun = await supervisor.spawn({
  sessionId: params.sessionId,
  backendId: backendResolved.id,
  scopeKey,
  replaceExistingScope: Boolean(useResume && scopeKey),
  mode: "child",
  argv: [backend.command, ...args],
  timeoutMs: params.timeoutMs,
  noOutputTimeoutMs,
  cwd: workspaceDir,
  env,
  input: stdinPayload,
});
const result = await managedRun.wait();
```

## State of the Art

| Old Approach             | Current Approach             | When Changed                            | Impact                                                 |
| ------------------------ | ---------------------------- | --------------------------------------- | ------------------------------------------------------ |
| Inline prompts only      | Temp file fallback for >10KB | 2024 (ARG_MAX discovery)                | Eliminates silent subprocess failures on large prompts |
| Simple retry loops       | Retry + circuit breaker      | 2023 (microservices best practice)      | Prevents retry storms, protects failing services       |
| Let hooks crash          | Error boundaries on hooks    | 2025 (hook reliability pattern)         | Hook failures don't block main operations              |
| MCP tools throw on error | isError=true response        | MCP spec 1.0 (2024)                     | Server stays up despite tool failures                  |
| No timeout enforcement   | AbortController everywhere   | 2023 (fetch standard, Node.js adoption) | Operations can be cancelled, prevents hangs            |

**Deprecated/outdated:**

- **No error classification:** Retrying all errors wastes time on permanent failures. Modern approach: classify as retryable/permanent.
- **Synchronous subprocess spawn:** Blocks event loop, no timeout control. Modern approach: async spawn via ProcessSupervisor.
- **Console logging only:** Logs lost on restart, not queryable. Modern approach: structured logging to observability.sqlite.
- **No circuit breaker:** Retry storms during outages. Modern approach: circuit breaker prevents cascading failures.

## Open Questions

1. **Observability alert thresholds:**
   - What we know: Alert after 5+ failures in 10 minutes (user decision)
   - What's unclear: Should different integrations have different thresholds? (SDK vs MCP vs subprocess)
   - Recommendation: Start with unified threshold (5 in 10min), tune based on production data. SDK may need higher threshold (slower, expected timeouts).

2. **Temp file cleanup on crash:**
   - What we know: withTempFile() uses finally block for cleanup
   - What's unclear: What happens if process crashes during operation? Temp files accumulate?
   - Recommendation: Implement periodic cleanup cron job (delete files older than 1h in /tmp/openclaw-prompt-\*). Low priority—OS cleanup handles most cases.

3. **MCP cross-call retry vs circuit breaker:**
   - What we know: MCP calls should retry on ECONNRESET/ETIMEDOUT, use circuit breaker to prevent storms
   - What's unclear: Should circuit breaker be per-server (kb, macos, analytics) or per-tool (kb_query, kb_article)?
   - Recommendation: Per-server circuit breaker. If KB server is down, all tools are down—no point trying individual tools. Simpler state management.

## Validation Architecture

> Phase 17 has `workflow.verifier: true` in .planning/config.json

### Test Framework

| Property           | Value                                            |
| ------------------ | ------------------------------------------------ |
| Framework          | Vitest (existing)                                |
| Config file        | vitest.config.ts                                 |
| Quick run command  | `pnpm test src/agents/retry-logic.test.ts --run` |
| Full suite command | `pnpm test --run`                                |

### Phase Requirements → Test Map

| Req ID   | Behavior                                            | Test Type | Automated Command                                           | File Exists?          |
| -------- | --------------------------------------------------- | --------- | ----------------------------------------------------------- | --------------------- |
| INTEG-01 | ARG_MAX mitigation via temp file for >10KB prompts  | unit      | `pnpm test src/infra/temp-file-manager.test.ts --run`       | ❌ Wave 0             |
| INTEG-01 | SDK timeout enforcement (120s) with AbortController | unit      | `pnpm test src/agents/sdk-runner/timeout.test.ts --run`     | ❌ Wave 0             |
| INTEG-02 | MCP retry on ECONNRESET with exponential backoff    | unit      | `pnpm test src/agents/retry-logic.test.ts --run`            | ❌ Wave 0             |
| INTEG-02 | Circuit breaker opens after 5 MCP failures          | unit      | `pnpm test src/infra/circuit-breaker.test.ts --run`         | ✅ (Phase 16, extend) |
| INTEG-03 | Hook error boundary prevents parent crash           | unit      | `pnpm test src/agents/hooks/error-boundary.test.ts --run`   | ❌ Wave 0             |
| INTEG-04 | Temp file cleanup in finally block                  | unit      | `pnpm test src/infra/temp-file-manager.test.ts --run`       | ❌ Wave 0             |
| INTEG-05 | Codex subprocess error classification               | unit      | `pnpm test src/agents/cli-runner.test.ts --run`             | ✅ (existing, verify) |
| INTEG-06 | MCP tool returns isError=true instead of crashing   | unit      | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts --run` | ✅ (existing, extend) |

### Sampling Rate

- **Per task commit:** `pnpm test src/agents/retry-logic.test.ts src/infra/temp-file-manager.test.ts --run` (<30 sec)
- **Per wave merge:** `pnpm test src/agents/ src/infra/ --run` (~2-3 min)
- **Phase gate:** Full suite green (`pnpm test --run`)

### Wave 0 Gaps

- [ ] `src/agents/retry-logic.ts` + `src/agents/retry-logic.test.ts` — retryWithBackoff, isRetryableError, logIntegrationFailure (INTEG-02)
- [ ] `src/infra/temp-file-manager.ts` + `src/infra/temp-file-manager.test.ts` — withTempFile pattern, ARG_MAX threshold (INTEG-01, INTEG-04)
- [ ] `src/agents/hooks/error-boundary.ts` + `src/agents/hooks/error-boundary.test.ts` — wrapHookWithErrorBoundary, logHookFailure (INTEG-03)
- [ ] `src/agents/sdk-runner/timeout.test.ts` — callWithTimeout, AbortController enforcement (INTEG-01)
- [ ] Extend `src/infra/circuit-breaker.test.ts` — verify integration with retry logic (INTEG-02)
- [ ] Extend `src/agents/sdk-runner/mcp-servers.test.ts` — verify error boundary coverage on all tools (INTEG-06)
- [ ] Verify `src/agents/cli-runner.test.ts` — error classification for Codex subprocess calls (INTEG-05)

## Sources

### Primary (HIGH confidence)

- Codebase analysis:
  - `src/agents/cli-runner.ts` — Existing subprocess error classification, FailoverError pattern
  - `src/agents/sdk-runner/mcp-servers.ts` — withErrorBoundary pattern for MCP tools
  - `src/process/supervisor/` — ProcessSupervisor for process management
  - `src/infra/circuit-breaker.ts` — Phase 16 circuit breaker implementation
  - `src/hooks/internal-hooks.ts` — Hook registration and event system
  - `.planning/phases/17-integration-reliability/17-CONTEXT.md` — User decisions on retry/timeout/logging
  - `.planning/phases/16-service-hardening/16-RESEARCH.md` — Circuit breaker patterns

- User decisions (17-CONTEXT.md):
  - Max retries: 3 (4 total attempts)
  - Backoff: exponential (1s, 2s, 4s, 8s)
  - Circuit breaker: 5 failures, 60s timeout
  - Timeouts: 30s MCP, 120s SDK
  - Error handling: never crash, return errors, log to observability

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` — ARG_MAX pitfall, MCP orphan processes, retry storm patterns
- OpenClaw issue tracker patterns — Shell escaping failures (7 of 31 historical bugs)
- Node.js AbortController docs — Standard cancellation pattern
- MCP specification 1.0 — isError response pattern for tool failures

### Tertiary (LOW confidence - verify during implementation)

- Industry retry patterns (3 retries, exponential backoff) — widely adopted but not protocol-specific
- ARG_MAX threshold (10KB conservative, actual ~260KB on macOS) — verify with testing

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — All tools already in use (ProcessSupervisor, FailoverError, circuit-breaker.ts, AbortController)
- Architecture: HIGH — Patterns drawn from existing codebase (cli-runner.ts, mcp-servers.ts) + user decisions
- Pitfalls: HIGH — Identified from codebase issues (ARG_MAX, hook crashes) and research (PITFALLS.md)
- Retry/backoff values: HIGH — User-specified in CONTEXT.md
- Timeout values: HIGH — User-specified (30s MCP, 120s SDK)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (30 days — stable domain, patterns evolve slowly)
