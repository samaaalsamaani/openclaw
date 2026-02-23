# Stack Research: AI Orchestration / MCP Mesh / Multi-Agent Systems

**Date**: 2026-02-22
**Context**: Brownfield integration into OpenClaw Gateway (Node.js pnpm monorepo), connecting Claude Code CLI, Codex CLI, and the Gateway via MCP protocol into a unified mesh.

---

## Recommended Stack

### Core Protocol Layer

| Library                          | Version       | Purpose                                      | Rationale                                                                                                                                                            |
| -------------------------------- | ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk`      | 1.26.0 (v1.x) | MCP servers + clients                        | Official TypeScript SDK. v2 pre-alpha exists but v1.x is production-recommended until Q2 2026. Already aligned with existing MCP servers in `~/.openclaw/projects/`. |
| `@agentclientprotocol/sdk`       | 0.14.1        | ACP client/server for IDE/editor integration | Already in use (`src/acp/`). Standardizes agent-to-editor communication. Supported by Claude Code, Codex CLI, Zed, JetBrains.                                        |
| `@anthropic-ai/claude-agent-sdk` | ^0.2.50       | Programmatic Claude Code sessions            | Already a dependency. Provides `query()` async iterator, session management, MCP server injection, hooks (18 events), subagent definitions, sandboxing.              |
| `zod`                            | ^4.3.6        | Schema validation                            | Already a dependency. Required peer dep for MCP SDK v1.x. Used for tool input schemas.                                                                               |

### Agent Execution Layer

| Library                          | Version  | Purpose                                     | Rationale                                                                                                                                                                                        |
| -------------------------------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@anthropic-ai/claude-agent-sdk` | ^0.2.50  | Claude Code agent spawning                  | `query()` spawns Claude Code as child process. Supports `mcpServers`, `allowedTools`, `maxTurns`, `maxBudgetUsd`, `hooks`, `agents` (subagent definitions), `canUseTool` (permission callbacks). |
| Codex CLI                        | 0.104.0+ | OpenAI agent execution                      | Run as MCP server via `codex mcp-server`. Exposes `codex()` and `codex-reply()` tools. Keeps Codex alive across turns.                                                                           |
| Claude Code CLI                  | 2.1.39+  | Claude agent execution (alternative to SDK) | CLI mode with `-p --output-format json`. Already integrated via `cli-backends.ts`. Supports `--mcp-config`, `--model`, sessions.                                                                 |
| GSD                              | 1.20.5   | Build/task orchestration                    | Context engineering + spec-driven development. Spawns specialized agents, collects results, routes to next step. Orchestrator stays thin at 30-40% context usage.                                |

### Data Layer

| Library               | Version                | Purpose                  | Rationale                                                                             |
| --------------------- | ---------------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `better-sqlite3`      | latest                 | SQLite access            | Already used by KB MCP server. Synchronous API ideal for MCP tool handlers.           |
| `sqlite-vec`          | 0.1.7-alpha.2          | Vector similarity search | Already a dependency. Enables KNN queries on embeddings. Runs anywhere, ~30MB memory. |
| OpenAI Embeddings API | text-embedding-3-small | Embedding generation     | Already in use for KB. 1536 dimensions.                                               |

### Observability

| Library                            | Version | Purpose             | Rationale                                                               |
| ---------------------------------- | ------- | ------------------- | ----------------------------------------------------------------------- |
| `tslog`                            | ^4.10.2 | Structured logging  | Already a dependency. Logger writes to stderr (critical for MCP stdio). |
| OpenTelemetry (existing extension) | -       | Distributed tracing | `extensions/diagnostics-otel` already exists. Wire MCP calls as spans.  |

---

## MCP Integration Patterns

### 1. Stdio Transport Wiring (Production Pattern)

The stdio transport is the correct choice for local MCP servers. Each server runs as a child process with JSON-RPC over stdin/stdout.

**Critical rules:**

- **NEVER use `console.log()` in MCP servers.** It writes to stdout and corrupts JSON-RPC messages. Use `console.error()` or write to a log file.
- **All debug/diagnostic output goes to stderr.**
- **Validate inputs early** in tool handlers and return clear `{ isError: true }` responses.

**Existing pattern** (already working in `~/.openclaw/projects/.mcp.json`):

```json
{
  "mcpServers": {
    "knowledge-base": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server.js"],
      "env": { "OPENAI_API_KEY": "${OPENAI_API_KEY}" }
    }
  }
}
```

**Enhanced pattern** for the orchestration daemon:

```typescript
// Inject MCP servers into Claude Agent SDK sessions
import { query } from "@anthropic-ai/claude-agent-sdk";

const result = query({
  prompt: taskPrompt,
  options: {
    mcpServers: {
      "knowledge-base": {
        type: "stdio",
        command: "node",
        args: ["/Users/user/.openclaw/projects/knowledge-base/mcp-server.js"],
        env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
      },
      "shared-memory": {
        type: "stdio",
        command: "node",
        args: ["/path/to/shared-memory-mcp.js"],
      },
    },
    allowedTools: [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "mcp__knowledge-base__query_kb",
      "mcp__shared-memory__read_context",
      "mcp__shared-memory__write_context",
    ],
    maxTurns: 25,
    maxBudgetUsd: 2.0,
    permissionMode: "bypassPermissions",
  },
});
```

### 2. Error Handling and Reconnection

**For stdio MCP servers**, reconnection means restarting the child process:

```typescript
class ManagedMcpServer {
  private process: ChildProcess | null = null;
  private restartCount = 0;
  private maxRestarts = 5;
  private backoffMs = 1000;

  async start(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
      env: { ...process.env, ...this.env },
    });

    this.process.stderr?.on("data", (chunk) => {
      // Log server diagnostics (NOT protocol messages)
      logger.debug(`[mcp:${this.name}] ${chunk.toString()}`);
    });

    this.process.on("exit", (code) => {
      if (this.restartCount < this.maxRestarts) {
        const delay = this.backoffMs * Math.pow(2, this.restartCount);
        const jitter = Math.random() * delay * 0.3;
        setTimeout(() => this.start(), delay + jitter);
        this.restartCount++;
      }
    });
  }
}
```

**Health check pattern** for MCP servers:

- MCP protocol supports `ping` method natively
- Send periodic pings to detect dead processes
- Use process exit events as primary health signal for stdio
- Reset restart counter after sustained uptime (e.g., 60 seconds)

### 3. MCP Mesh Topology

For this project, use a **hub-and-spoke** topology (NOT full mesh):

```
                    +---------------------+
                    |  OpenClaw Gateway    |
                    |  (Hub / Orchestrator)|
                    +----------+----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
  +-------v-------+   +-------v-------+   +-------v-------+
  | Claude Agent   |   | Codex CLI     |   | Direct API    |
  | SDK Sessions   |   | MCP Server    |   | Calls         |
  +-------+-------+   +-------+-------+   +-------+-------+
          |                    |                    |
     +----+----+          +---+---+           +----+----+
     |MCP Srvrs|          |       |           |         |
     +---------+          |       |           |         |
     |KB       |    (tools are    |     (Anthropic API, |
     |System   |     built-in)    |      OpenAI API,    |
     |Memory   |                  |      OpenRouter)    |
     +---------+                  +---------------------+
```

**Why hub-and-spoke, not full mesh:**

- The Gateway already acts as the central coordinator
- Agents do not need to talk to each other directly -- they share state via the shared memory MCP server
- Full mesh adds O(n^2) connection complexity with no benefit for this use case
- The orchestrator can route tasks to the optimal agent without agents needing awareness of each other

### 4. In-Process vs Out-of-Process MCP Servers

The Claude Agent SDK supports **in-process MCP servers** via `createSdkMcpServer()`:

```typescript
import { createSdkMcpServer, tool, query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const memoryServer = createSdkMcpServer({
  name: "shared-memory",
  tools: [
    tool(
      "read_context",
      "Read shared context for a task",
      {
        key: z.string().describe("Context key"),
      },
      async ({ key }) => {
        const value = db.prepare("SELECT value FROM context WHERE key = ?").get(key);
        return { content: [{ type: "text", text: JSON.stringify(value) }] };
      },
    ),
    tool(
      "write_context",
      "Write shared context",
      {
        key: z.string(),
        value: z.string(),
      },
      async ({ key, value }) => {
        db.prepare("INSERT OR REPLACE INTO context (key, value) VALUES (?, ?)").run(key, value);
        return { content: [{ type: "text", text: "OK" }] };
      },
    ),
  ],
});

// Use in-process -- no child process overhead
const result = query({
  prompt: "...",
  options: {
    mcpServers: {
      "shared-memory": memoryServer, // type: "sdk" internally
    },
  },
});
```

**Recommendation**: Use in-process MCP for the shared memory server (low latency, no serialization overhead). Keep the KB server as out-of-process stdio (it uses `better-sqlite3` which can block the event loop with large queries).

---

## Agent SDK Patterns

### 1. Daemon Integration with `query()`

The Claude Agent SDK's `query()` function spawns a Claude Code child process and communicates via JSON. For a daemon (long-running process like the Gateway):

```typescript
class AgentPool {
  private activeSessions = new Map<string, AbortController>();
  private concurrencyLimit = 3;
  private queue: Array<{ task: Task; resolve: Function; reject: Function }> = [];

  async executeTask(task: Task): Promise<TaskResult> {
    if (this.activeSessions.size >= this.concurrencyLimit) {
      return new Promise((resolve, reject) => {
        this.queue.push({ task, resolve, reject });
      });
    }

    const abortController = new AbortController();
    const sessionKey = `task-${task.id}`;
    this.activeSessions.set(sessionKey, abortController);

    try {
      let result: string = "";
      let usage: any = null;

      for await (const message of query({
        prompt: task.prompt,
        options: {
          abortController,
          cwd: task.workingDir,
          model: task.model ?? "sonnet",
          maxTurns: task.maxTurns ?? 25,
          maxBudgetUsd: task.budgetUsd ?? 1.0,
          mcpServers: this.buildMcpServers(task),
          allowedTools: task.allowedTools,
          permissionMode: "bypassPermissions",
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: task.additionalInstructions,
          },
          hooks: {
            PostToolUse: [
              {
                hooks: [
                  async (input) => {
                    // Log tool usage for observability
                    this.emit("tool-used", { task: task.id, tool: input.tool_name });
                    return {};
                  },
                ],
              },
            ],
          },
        },
      })) {
        if (message.type === "result" && message.subtype === "success") {
          result = message.result;
          usage = message.usage;
        }
      }

      return { result, usage, sessionKey };
    } finally {
      this.activeSessions.delete(sessionKey);
      this.processQueue();
    }
  }

  abort(sessionKey: string): void {
    this.activeSessions.get(sessionKey)?.abort();
  }
}
```

**Key daemon considerations:**

- **Always set `maxTurns` and `maxBudgetUsd`** to prevent runaway sessions.
- **Use `abortController`** to enable cancellation from the Gateway.
- **Pool concurrency** -- each `query()` spawns a child process. On macOS with 16GB RAM, limit to 2-3 concurrent sessions.
- **Handle process cleanup** -- if the daemon crashes, orphaned Claude Code processes continue running. Register cleanup in `process.on("exit")`.
- **Use `permissionMode: "bypassPermissions"`** for autonomous daemon tasks. Combine with `allowedTools` to restrict what tools are available.

### 2. Subagent Definitions (Built-in to Agent SDK)

The Agent SDK supports declarative subagent definitions without spawning separate processes:

```typescript
const result = query({
  prompt: "Analyze and fix the performance issue in the auth module",
  options: {
    agents: {
      researcher: {
        description: "Investigates codebases, reads files, searches for patterns",
        tools: ["Read", "Grep", "Glob", "mcp__knowledge-base__query_kb"],
        prompt: "You are a code researcher. Investigate thoroughly before reporting findings.",
        model: "sonnet",
      },
      coder: {
        description: "Writes and edits code based on research findings",
        tools: ["Read", "Write", "Edit", "Bash"],
        prompt: "You are a precise coder. Make minimal, targeted changes.",
        model: "sonnet",
      },
      reviewer: {
        description: "Reviews code changes for correctness and style",
        tools: ["Read", "Grep", "Glob"],
        prompt: "Review code changes critically. Flag issues clearly.",
        model: "haiku",
      },
    },
  },
});
```

The main agent uses the `Task` tool to delegate to subagents. Each subagent runs as a nested Claude Code session with its own tool restrictions and model.

### 3. V2 API Preview (unstable)

The V2 API provides more granular session control but is currently unstable:

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  unstable_v2_prompt,
} from "@anthropic-ai/claude-agent-sdk";
```

**Recommendation**: Use the stable `query()` API for now. The V2 API is useful for long-lived sessions where you need to send multiple prompts, but it is explicitly marked unstable. Monitor for stabilization in Q2 2026.

### 4. Hooks for Observability and Control

The Agent SDK provides 12 hook events for intercepting agent behavior:

| Hook                 | Use Case in Daemon                                        |
| -------------------- | --------------------------------------------------------- |
| `PreToolUse`         | Block dangerous tools, validate inputs, add audit logging |
| `PostToolUse`        | Record tool results, update shared memory                 |
| `PostToolUseFailure` | Track failures, trigger fallback logic                    |
| `Notification`       | Forward agent notifications to Gateway clients            |
| `SessionStart`       | Initialize shared memory context for the task             |
| `SessionEnd`         | Clean up resources, record final metrics                  |
| `SubagentStart`      | Log subagent spawning for debugging                       |
| `SubagentStop`       | Collect subagent results                                  |
| `PreCompact`         | Inject critical context before compaction                 |
| `Stop`               | Handle graceful shutdown                                  |

---

## Task Routing Approaches

### 1. Pre-Generation Classification (Recommended)

Classify the task before sending to any LLM. Use a lightweight classifier:

````typescript
type TaskComplexity = "trivial" | "simple" | "medium" | "complex" | "expert";
type TaskDomain = "code" | "research" | "writing" | "analysis" | "media" | "system";

interface TaskClassification {
  complexity: TaskComplexity;
  domain: TaskDomain;
  requiresVision: boolean;
  requiresTools: string[];
  estimatedTokens: number;
}

function classifyTask(prompt: string, attachments?: Attachment[]): TaskClassification {
  const hasImages = attachments?.some((a) => a.type === "image");
  const hasCode = /```|function |class |import |def |const |let /.test(prompt);
  const hasUrl = /https?:\/\//.test(prompt);
  const wordCount = prompt.split(/\s+/).length;

  // Heuristic classification (fast, no LLM call)
  const complexity: TaskComplexity =
    wordCount < 20 && !hasCode
      ? "trivial"
      : wordCount < 50 && !hasCode
        ? "simple"
        : wordCount < 200
          ? "medium"
          : "complex";

  const domain: TaskDomain = hasCode ? "code" : hasUrl ? "research" : "analysis";

  return {
    complexity,
    domain,
    requiresVision: hasImages,
    requiresTools: inferTools(prompt),
    estimatedTokens: wordCount * 4, // rough approximation
  };
}
````

### 2. Model Routing Matrix

Based on the classification, route to the optimal provider:

```typescript
const ROUTING_TABLE: Record<string, { provider: string; model: string; cost: string }> = {
  // Trivial: cheapest option
  "trivial:*": { provider: "claude-cli", model: "haiku", cost: "free" },

  // Simple: fast + cheap
  "simple:code": { provider: "claude-cli", model: "sonnet", cost: "free" },
  "simple:*": { provider: "claude-cli", model: "haiku", cost: "free" },

  // Medium: balanced
  "medium:code": { provider: "claude-sdk", model: "sonnet", cost: "free" },
  "medium:research": { provider: "codex", model: "gpt-5.3-codex", cost: "free" },
  "medium:writing": { provider: "claude-cli", model: "sonnet", cost: "free" },

  // Complex: best models
  "complex:code": { provider: "claude-sdk", model: "opus", cost: "free" },
  "complex:*": { provider: "codex", model: "gpt-5.3-codex", cost: "free" },

  // Expert: multi-agent
  "expert:*": { provider: "multi-agent", model: "opus+codex", cost: "free" },

  // Vision: always Gemini (preserve Codex rate limits)
  "*:vision": { provider: "openrouter", model: "gemini-2.5-flash", cost: "$0.30/MTok" },
};

function routeTask(classification: TaskClassification): RouteDecision {
  if (classification.requiresVision) {
    return ROUTING_TABLE["*:vision"];
  }
  const key = `${classification.complexity}:${classification.domain}`;
  return ROUTING_TABLE[key] ?? ROUTING_TABLE[`${classification.complexity}:*`];
}
```

### 3. Cascade Pattern (Post-Generation Fallback)

For cost-sensitive environments, try the cheapest model first and escalate:

```typescript
async function cascadeExecution(task: Task): Promise<TaskResult> {
  // Tier 1: Try Haiku (free, fast)
  const tier1 = await executeWithModel(task, "haiku", { maxTurns: 5, maxBudgetUsd: 0.1 });
  if (tier1.quality >= 0.8) return tier1;

  // Tier 2: Try Sonnet (free, better)
  const tier2 = await executeWithModel(task, "sonnet", { maxTurns: 15, maxBudgetUsd: 0.5 });
  if (tier2.quality >= 0.8) return tier2;

  // Tier 3: Use Opus or Codex (free, best)
  return executeWithModel(task, "opus", { maxTurns: 25, maxBudgetUsd: 2.0 });
}
```

**Note**: Quality scoring requires the LLM to self-evaluate or a separate evaluator. In practice, use error-based escalation (if Haiku fails or produces an error, escalate to Sonnet).

### 4. Rate-Limit-Aware Routing

The system already has multiple free tiers with separate rate buckets. Route intelligently:

```typescript
class RateLimitAwareRouter {
  private buckets = new Map<string, { remaining: number; resetsAt: Date }>();

  async route(task: Task, classification: TaskClassification): Promise<string> {
    const preferred = routeTask(classification);

    // Check rate limit for preferred provider
    if (this.hasCapacity(preferred.provider)) {
      return preferred.provider;
    }

    // Fallback chain: Codex -> Codex-Spark -> Claude CLI -> Gemini
    const fallbacks = ["codex", "codex-spark", "claude-cli", "openrouter"];
    for (const fb of fallbacks) {
      if (this.hasCapacity(fb)) return fb;
    }

    // All exhausted -- queue for later
    throw new RateLimitError("All providers exhausted");
  }
}
```

---

## Shared Memory Patterns for Multi-AI Systems

### 1. SQLite as Shared Memory Bus

SQLite is the ideal substrate for shared agent memory in this architecture:

- **Already deployed**: KB uses `kb.sqlite` with FTS5 + sqlite-vec embeddings
- **Single-writer safe**: SQLite WAL mode allows concurrent readers with one writer
- **No network overhead**: File-based, same machine
- **Embeddable**: Works inside MCP servers without external dependencies

**Schema for shared agent memory:**

```sql
-- Task context: what each agent knows about the current task
CREATE TABLE IF NOT EXISTS agent_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,         -- "claude:main", "codex:research", etc.
  key TEXT NOT NULL,
  value TEXT NOT NULL,            -- JSON blob
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(task_id, agent_id, key)
);

-- Shared scratchpad: inter-agent communication
CREATE TABLE IF NOT EXISTS scratchpad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT,                  -- NULL = broadcast to all
  message TEXT NOT NULL,
  read_by TEXT DEFAULT '[]',      -- JSON array of agent IDs
  created_at TEXT DEFAULT (datetime('now'))
);

-- Task results: final outputs from each agent
CREATE TABLE IF NOT EXISTS task_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  result TEXT NOT NULL,
  quality_score REAL,
  cost_usd REAL,
  duration_ms INTEGER,
  tokens_used INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Vector memory: semantic search across all agent outputs
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
  embedding FLOAT[1536],
  +task_id TEXT,
  +agent_id TEXT,
  +content TEXT
);
```

### 2. MCP Server for Shared Memory

Expose the shared memory via an MCP server so all agents can read/write:

**Tools to expose:**

- `read_context(task_id, key)` -- Read context for current task
- `write_context(task_id, key, value)` -- Write context
- `read_scratchpad(task_id, since?)` -- Read messages from other agents
- `post_to_scratchpad(task_id, message, to_agent?)` -- Post a message
- `search_memory(query, limit?)` -- Semantic search via embeddings
- `store_result(task_id, result, quality?)` -- Store task result

### 3. Context Injection Pattern

Before spawning an agent, inject relevant context from previous agents:

```typescript
async function buildTaskPrompt(task: Task): Promise<string> {
  const db = getSharedDB();

  // Gather context from previous agents on this task
  const context = db
    .prepare("SELECT agent_id, key, value FROM agent_context WHERE task_id = ? ORDER BY created_at")
    .all(task.id);

  // Gather scratchpad messages
  const messages = db
    .prepare("SELECT from_agent, message FROM scratchpad WHERE task_id = ? ORDER BY created_at")
    .all(task.id);

  // Semantic search for relevant past work
  const relevant = await semanticSearch(task.prompt, 5);

  let prompt = task.prompt;

  if (context.length > 0) {
    prompt += "\n\n<prior-agent-context>\n";
    for (const c of context) {
      prompt += `[${c.agent_id}] ${c.key}: ${c.value}\n`;
    }
    prompt += "</prior-agent-context>\n";
  }

  if (messages.length > 0) {
    prompt += "\n\n<agent-scratchpad>\n";
    for (const m of messages) {
      prompt += `[${m.from_agent}]: ${m.message}\n`;
    }
    prompt += "</agent-scratchpad>\n";
  }

  if (relevant.length > 0) {
    prompt += "\n\n<relevant-knowledge>\n";
    for (const r of relevant) {
      prompt += `${r.content}\n---\n`;
    }
    prompt += "</relevant-knowledge>\n";
  }

  return prompt;
}
```

---

## What NOT to Use

### Anti-Patterns

| Anti-Pattern                                                              | Why                                                                                                                                                                                                                                     | Alternative                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **LangChain/LangGraph** for orchestration                                 | Adds massive abstraction layer over what is essentially `spawn() + JSON`. OpenClaw Gateway already handles routing, sessions, and provider abstraction. LangChain's agent abstraction conflicts with Claude Code's built-in agent loop. | Use Claude Agent SDK `query()` directly. It IS the agent loop.                                           |
| **Full mesh agent-to-agent communication**                                | O(n^2) connections, debugging nightmare. Agents do not need to talk to each other.                                                                                                                                                      | Hub-and-spoke via Gateway orchestrator + shared SQLite memory.                                           |
| **MCP SDK v2 (pre-alpha)** in production                                  | Explicitly unstable. API surface will change.                                                                                                                                                                                           | Stay on v1.26.x until v2 reaches stable release (expected Q2 2026).                                      |
| **HTTP/SSE MCP transport for local servers**                              | Unnecessary network overhead for same-machine communication. Adds port management, CORS, auth.                                                                                                                                          | Use stdio transport for all local MCP servers. Reserve HTTP for remote/cloud MCP servers.                |
| **`console.log()` in MCP servers**                                        | Corrupts JSON-RPC on stdout. This is the #1 MCP debugging issue.                                                                                                                                                                        | Use `console.error()` or `tslog` configured for stderr.                                                  |
| **Auto-scaling agent processes**                                          | Each Claude Code / Codex process uses 200-500MB RAM. On a Mac Mini with 16GB, more than 3-4 concurrent agents will cause swapping.                                                                                                      | Fixed pool size (2-3 concurrent), queue overflow.                                                        |
| **Storing embeddings in a separate vector DB** (Pinecone, Weaviate, etc.) | Adds external dependency, network latency, cost. sqlite-vec already handles this in the same process/file.                                                                                                                              | sqlite-vec in the same SQLite database as KB.                                                            |
| **CrewAI / AutoGen / Semantic Kernel**                                    | These frameworks assume they own the agent loop. OpenClaw Gateway + Claude Agent SDK already own it. Adding another framework creates two competing orchestrators.                                                                      | Use the existing Gateway as orchestrator. Claude Agent SDK for Claude tasks, Codex CLI for OpenAI tasks. |
| **Claude Agent SDK V2 unstable API** in production                        | `unstable_v2_createSession` etc. are explicitly prefixed "unstable".                                                                                                                                                                    | Use `query()` (stable API). Monitor V2 for stabilization.                                                |
| **Passing large payloads as CLI arguments**                               | macOS ARG_MAX is ~1MB. Base64 images, long prompts will fail with E2BIG. Already hit this bug in `analyze.sh`.                                                                                                                          | Use temp files + heredoc variable expansion, or MCP tool input (piped via stdin).                        |
| **Multiple SQLite databases for different agents**                        | Fragmented state, no cross-agent search, migration complexity.                                                                                                                                                                          | Single shared SQLite DB with table-per-concern (context, scratchpad, results, vectors).                  |

### Specific Library Avoidances

- **`@langchain/mcp-adapters`**: Pulls in LangChain dependency graph. Use raw `@modelcontextprotocol/sdk` instead.
- **`openai` npm package for Codex orchestration**: Codex CLI already wraps this. Use `codex mcp-server` to expose it as MCP tools.
- **`claude-flow`**: Third-party orchestration layer (ruvnet/claude-flow). Impressive benchmarks (84.8% SWE-Bench) but adds 60+ agent complexity unsuitable for a focused personal system. The patterns it demonstrates (swarm coordination, self-learning routing) can be implemented directly in the Gateway at much smaller scale.

---

## Confidence Levels

| Recommendation                                    | Confidence      | Reasoning                                                                                                                                                                                                     |
| ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk` v1.26.x               | **High**        | Official SDK, production-recommended, already aligned with existing MCP servers.                                                                                                                              |
| `@anthropic-ai/claude-agent-sdk` `query()`        | **High**        | Already a dependency, stable API, comprehensive options (mcpServers, hooks, agents, permissions). Well-documented.                                                                                            |
| Hub-and-spoke MCP topology                        | **High**        | Matches existing Gateway architecture. Simpler than mesh. Proven in OpenClaw's channel routing.                                                                                                               |
| SQLite shared memory via MCP                      | **High**        | Already using SQLite+sqlite-vec for KB. Zero new dependencies. WAL mode handles concurrency.                                                                                                                  |
| In-process MCP servers via `createSdkMcpServer()` | **High**        | Documented in official SDK. Eliminates child process overhead for latency-sensitive tools.                                                                                                                    |
| Codex CLI as MCP server (`codex mcp-server`)      | **Medium-High** | Documented by OpenAI. Exposes `codex()` and `codex-reply()`. But OpenAI now recommends App Server for "full-fidelity" integrations. MCP mode sufficient for task routing.                                     |
| Heuristic task classification (no LLM call)       | **Medium-High** | Fast and free. Works for clear-cut cases. Will misclassify edge cases. Can be refined with few-shot examples over time.                                                                                       |
| GSD for build orchestration                       | **Medium**      | Good for spec-driven development workflows. But it is a prompt engineering framework, not a programmatic orchestration API. Use it for human-driven development sessions, not for automated daemon pipelines. |
| Cascade execution pattern                         | **Medium**      | Sound theory. In practice, quality scoring is unreliable without a separate evaluator LLM call, which adds cost and latency. Error-based escalation is simpler and more reliable.                             |
| ACP protocol for IDE integration                  | **Medium**      | Already implemented in `src/acp/`. Stable enough but spec is still evolving (introduced Sep 2025). Watch for breaking changes.                                                                                |
| Claude Agent SDK V2 preview                       | **Low**         | Explicitly unstable. Useful for prototyping multi-turn sessions. Do not ship to production until stable release.                                                                                              |
| Claude-flow / multi-agent swarms                  | **Low**         | Overkill for a personal system with 1-3 concurrent users. The patterns are sound but the scale assumptions (60+ agents, distributed swarms) do not match.                                                     |

---

## Key Takeaways

1. **The stack already exists.** OpenClaw Gateway + Claude Agent SDK + Codex CLI + MCP servers form a functional mesh. The work is integration, not greenfield.

2. **`query()` is the agent primitive.** The Claude Agent SDK's `query()` function handles the full agent loop (tool calls, subagents, sessions, permissions). Build the orchestrator around it, not around a framework that reimplements it.

3. **MCP is the tool bus.** Every capability that agents need (KB search, system control, shared memory, analytics) should be an MCP server. Agents discover tools via MCP, not via hardcoded integrations.

4. **SQLite is the memory bus.** A single shared SQLite database (with WAL mode) serves as the substrate for inter-agent communication, task context, and semantic search. No external vector DB needed.

5. **Route by classification, not by hope.** Classify tasks before routing. Use the cheapest free provider (Haiku) for trivial tasks, Sonnet for medium, Opus/Codex for complex. Vision always goes to Gemini Flash.

6. **Concurrency is the constraint.** On macOS with 16GB RAM, limit concurrent agent sessions to 2-3. Each Claude Code process uses 200-500MB. Queue overflow, do not over-provision.

---

## Sources

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- Official SDK, v1.26.0
- [Claude Agent SDK Reference (TypeScript)](https://platform.claude.com/docs/en/agent-sdk/typescript) -- Full API docs
- [Claude Agent SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos) -- Code examples
- [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) -- ACP spec
- [Codex CLI MCP](https://developers.openai.com/codex/mcp/) -- MCP server mode
- [Building Consistent Workflows with Codex CLI & Agents SDK](https://cookbook.openai.com/examples/codex/codex_mcp_agents_sdk/building_consistent_workflows_codex_cli_agents_sdk) -- Multi-agent patterns
- [MCP Connection Health Checks](https://mcpcat.io/guides/implementing-connection-health-checks/) -- Production MCP monitoring
- [MCP Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) -- Error handling patterns
- [claude-flow](https://github.com/ruvnet/claude-flow) -- Multi-agent orchestration reference (patterns, not dependency)
- [GSD](https://github.com/gsd-build/get-shit-done) -- Spec-driven development framework
- [sqlite-vec](https://github.com/asg017/sqlite-vec) -- Vector search extension
- [Multi-Agent AI Orchestration (Enterprise Patterns)](https://www.onabout.ai/p/mastering-multi-agent-orchestration-architectures-patterns-roi-benchmarks-for-2025-2026) -- Industry patterns
- [LLM Mesh Architectures](https://ai-academy.training/2025/11/14/model-routing-agents-the-emerging-pattern-of-llm-mesh-architectures/) -- Routing patterns
- [AWS Multi-LLM Routing](https://aws.amazon.com/blogs/machine-learning/multi-llm-routing-strategies-for-generative-ai-applications-on-aws/) -- Routing strategies
- [MCP Best Practices (NearForm)](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) -- Implementation pitfalls
