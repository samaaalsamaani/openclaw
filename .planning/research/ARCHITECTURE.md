# Architecture Research

## Executive Summary

This document analyzes how the PAIOS (Personal AI Operating System) should be structured as a multi-AI mesh connecting three independent systems: OpenClaw Gateway (Node.js always-on daemon), Claude Code CLI (session-based, MCP-capable), and Codex CLI (session-based, code-optimized). The analysis is grounded in the actual OpenClaw codebase (400+ source files in `src/`), the existing MCP server configurations, and the Claude Agent SDK already listed as a dependency (`@anthropic-ai/claude-agent-sdk` v0.2.50 in `package.json`).

---

## Component Map

### Component 1: OpenClaw Gateway — The Kernel

**Role:** Always-on orchestration daemon. Receives messages from 12+ channels (WhatsApp, Telegram, Slack, Discord, iMessage, etc.), routes them to the appropriate AI brain, manages sessions, runs scheduled tasks, and delivers responses.

**Boundaries:**

- **Owns:** Channel adapters, session management, cron/heartbeat scheduling, skill system, tool approval, configuration (Zod-validated `openclaw.json`), plugin loading, WebSocket RPC API
- **Does NOT own:** Direct LLM inference (delegates to providers or CLI backends), file-level code operations, MCP client protocol
- **Runtime:** Node.js process managed by launchd on macOS. Listens on port 18789 (IPv4 + IPv6 loopback). Persists across reboots.

**Key source paths:**

- Gateway server: `src/gateway/server.impl.ts` (main entry, ~27K)
- Agent runtime: `src/agents/pi-embedded-runner/run.ts` (embedded Pi agent execution, ~45K)
- CLI delegation: `src/agents/cli-runner.ts` (subprocess-based CLI invocation, ~400 lines)
- CLI backend configs: `src/agents/cli-backends.ts` (Claude CLI + Codex CLI default configs)
- Cron service: `src/cron/service/` (scheduled job engine)
- Hooks system: `src/hooks/internal-hooks.ts` (command, session, agent, gateway, message events)
- Tool system: `src/agents/pi-tools.ts` + `src/agents/tools/` (15+ built-in tools)
- Bash execution: `src/agents/bash-tools.exec.ts` (shell exec with approval system)
- Model fallback: `src/agents/model-fallback.ts` (multi-provider failover chain)
- Memory/KB: `src/memory/` (70+ files, SQLite, embeddings, vector search)

**Critical finding from source:** The Gateway already has a `resolveCliBackendConfig()` function in `cli-backends.ts` that defines both `claude-cli` and `codex-cli` as first-class backend types. The CLI runner (`cli-runner.ts`) handles subprocess spawning, watchdog timeouts, output parsing (JSON/JSONL/text), session management, and failover error classification. This is the exact seam where Agent SDK integration would occur.

### Component 2: Claude Code CLI — The Architect

**Role:** Creative intelligence, reasoning, writing, architecture design, file operations. Session-based with MCP server and client capabilities.

**Boundaries:**

- **Owns:** MCP server (`claude mcp serve`), MCP client (connects to registered MCP servers), hook system (17 event types), Agent Teams, plugin system, file read/write/edit tools
- **Does NOT own:** Always-on daemon lifecycle, channel adapters, scheduling, persistent session store beyond its own
- **Runtime:** Session-based process. Invoked per-task. Currently spawned by Gateway via `cli-runner.ts` as subprocess with args like `claude -p --output-format json --dangerously-skip-permissions`

**Integration surface (current):**

- Invoked by Gateway subprocess: `command: "claude"`, `args: ["-p", "--output-format", "json", ...]`
- Model aliases: opus, sonnet, haiku (mapped to claude-opus-4-6, etc.)
- Session resumption: `--resume {sessionId}` with session ID fields `["session_id", "sessionId", "conversation_id"]`
- System prompt injection: `--append-system-prompt` (append mode, first-turn only)
- Image support: paths appended to prompt text (no dedicated `--image` arg)

**Integration surface (SDK — not yet wired):**

- `@anthropic-ai/claude-agent-sdk` v0.2.50 is already in `package.json` dependencies
- **Zero imports found** in `src/` — the SDK is installed but completely unused
- SDK provides: `query()` for prompt execution, `canUseTool()` callback for permission gating, `createSdkMcpServer()` for in-process MCP, `setMcpServers()` for dynamic MCP, hooks as callbacks, `outputFormat: json_schema` for structured output, V2 sessions with `send()`/`stream()`

### Component 3: Codex CLI — The Engine

**Role:** Code execution, debugging, code review, sandboxed operations. Optimized for code-heavy tasks.

**Boundaries:**

- **Owns:** Code-optimized sandbox (read-only/workspace-write modes), `codex exec` mode for headless execution, `codex review` for code review, `codex mcp-server` for MCP serving, JSONL event streaming
- **Does NOT own:** Creative writing quality, channel management, scheduling
- **Runtime:** Session-based process. Invoked per-task.

**Integration surface (current):**

- Invoked by Gateway subprocess: `command: "codex"`, `args: ["exec", "--json", "--color", "never", "--sandbox", "read-only", "--skip-git-repo-check"]`
- Session resumption: `exec resume {sessionId}` with session ID field `["thread_id"]`
- Output: JSONL for fresh runs, text for resumed sessions
- Image support: `--image` arg with repeat mode (one `--image` per file)

### Component 4: MCP Server Layer — The Shared Services

**Role:** Provide tool capabilities to any connected AI brain via Model Context Protocol.

**Current servers (3):**

| Server            | Transport    | Location                                                   | Purpose                                               |
| ----------------- | ------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| knowledge-base    | stdio (node) | `~/.openclaw/projects/knowledge-base/mcp-server.js`        | KB query, article retrieval, PARA operations, stats   |
| macos-system      | stdio (node) | `~/.openclaw/projects/macos-system-mcp/mcp-server.js`      | Native macOS control (clipboard, notifications, apps) |
| session-analytics | stdio (node) | `~/.openclaw/projects/session-analytics-mcp/mcp-server.js` | Agent session metrics                                 |

**Current registrations:**

- Claude Code: `~/.claude/.mcp.json` (all 3 servers)
- OpenClaw projects: `~/.openclaw/projects/.mcp.json` (all 3 servers, identical config)
- Codex CLI: **NOT registered** (no `~/.codex/config.toml` MCP entries)

### Component 5: KB SQLite — The Shared Memory

**Role:** Persistent knowledge store accessible to all brains via the knowledge-base MCP server.

**Boundaries:**

- **Schema:** articles (7 rows, PARA columns), people (3 rows), content_calendar (1 row), atoms (0 rows), articles_fts (Unicode-aware)
- **Access:** Via knowledge-base MCP server (query.js, deep-ingest.js, organize.js), or direct SQLite from Gateway's memory system (`src/memory/`)
- **Storage:** SQLite file with vector embeddings (sqlite-vec) + FTS5 for full-text search
- **PARA structure:** Physical files in `~/Documents/OpenClaw/` (Inbox, Projects, Areas, Resources, Archives)

### Component 6: Workspace Brain Files — The Identity Layer

**Role:** Define agent personality, capabilities, knowledge, and behavioral rules.

**Key files in `~/.openclaw/workspace/`:**

- `SOUL.md` — agent identity and core values
- `USER.md` — user context and preferences
- `TOOLS.md` — tool documentation (22K)
- `AGENTS.md` — operational rules, security, group behavior (26K)
- `HEARTBEAT.md` — scheduled task definitions (5.3K)
- `MEMORY.md` — long-term memory
- `memory/YYYY-MM-DD.md` — daily logs

**Integration note:** Gateway reads these files at bootstrap via `resolveBootstrapContextForRun()` in `src/agents/bootstrap-files.ts`. The Agent SDK integration should inject these same files via `--append-system-prompt` or the SDK's context injection API.

---

## Data Flow

### Flow 1: Inbound Message (Channel to Brain)

```
User sends message (WhatsApp/Telegram/Slack/etc.)
    |
    v
Channel Adapter (src/channels/) receives message
    |
    v
Gateway Session Router (server-chat.ts)
  - Resolves session key (agent + channel + conversation)
  - Checks allowlist/pairing
  - Loads session history
    |
    v
Agent Runtime (pi-embedded-runner/run.ts)
  - Builds system prompt (bootstrap files, skills, context)
  - Selects model via model-fallback.ts chain
  - Executes against provider:
    A) Embedded Pi (direct API call to Anthropic/OpenAI/Google/etc.)
    B) CLI backend (subprocess to claude/codex via cli-runner.ts)
    |
    v
Response flows back through:
  - Tool execution if needed (pi-tools.ts, bash-tools.exec.ts)
  - Stream processing (pi-embedded-subscribe.ts)
  - Reply delivery to channel
```

### Flow 2: Gateway to CLI (Current — Subprocess)

```
Gateway decides to use CLI backend
    |
    v
cli-runner.ts:
  1. resolveCliBackendConfig() — picks claude-cli or codex-cli config
  2. resolveBootstrapContextForRun() — loads workspace files
  3. buildSystemPrompt() — assembles full system prompt
  4. buildCliArgs() — constructs command-line arguments
  5. enqueueCliRun() — serializes by queue key (prevents concurrent runs)
  6. supervisor.spawn() — creates child process with timeout/watchdog
  7. managedRun.wait() — waits for completion
  8. parseCliJson/parseCliJsonl() — extracts response text + session ID
    |
    v
Result returned as EmbeddedPiRunResult { payloads, meta }
```

**Critical limitation:** This flow passes the prompt as a command-line argument or stdin. On macOS, ARG_MAX is ~1MB, so prompts with injected KB context or long conversation histories can fail silently.

### Flow 3: Gateway to Claude Code (Target — Agent SDK)

```
Gateway decides to use Claude Code
    |
    v
sdk-runner.ts (TO BE CREATED):
  1. Import @anthropic-ai/claude-agent-sdk
  2. sdk.query({
       prompt: userMessage,
       model: "opus" | "sonnet" | "haiku",
       mcpServers: [kb, macOS, analytics],  // in-process MCP
       hooks: {
         canUseTool: (tool, args) => gateway.checkApproval(tool, args),
         onToolResult: (tool, result) => kb.ingest(result)
       },
       outputFormat: json_schema,
       abortSignal: AbortController.signal
     })
  3. Process typed SDKMessage events (no text parsing)
  4. Return structured result
```

**What this eliminates:** ARG_MAX limits, shell quote escaping, subprocess timeout band-aids, raw text parsing, concurrent process management overhead.

### Flow 4: Cron/Heartbeat (Autonomous Execution)

```
CronService (src/cron/service/) timer fires
    |
    v
buildGatewayCronService() resolves:
  - Agent ID (from cron job config or default)
  - Session key (agent-scoped)
  - Runtime config (hot-reloaded)
    |
    v
runCronIsolatedAgentTurn()
  - Creates isolated agent session
  - Runs with system event text (e.g., heartbeat prompt)
  - Delivers result to configured channel/webhook
    |
    v
Delivery options:
  A) Channel message (agent:main → WhatsApp/Telegram/etc.)
  B) Webhook POST
  C) Silent (log only)
```

### Flow 5: Cross-Brain MCP Communication (Target)

```
Claude Code needs code execution:
    |
    v
Claude Code MCP Client → codex-agent MCP server
  - Calls codex tool (e.g., execute_code, review_file)
  - Codex runs in sandboxed mode
  - Returns result via MCP protocol
    |
    v
Codex needs creative analysis:
    |
    v
Codex MCP Client → claude-agent MCP server
  - Calls claude tool (e.g., analyze_architecture, write_docs)
  - Claude runs with Opus reasoning
  - Returns result via MCP protocol
    |
    v
Both read from shared services:
  - knowledge-base MCP → KB SQLite queries
  - macos-system MCP → clipboard, notifications, app control
  - session-analytics MCP → session metrics
```

### Flow 6: Knowledge Compound Loop (Target)

```
Any interaction (message, cron, hook) produces output
    |
    v
PostToolUse hook or explicit call:
  KB MCP server → deep-ingest.js
    - Extract key entities, learnings, decisions
    - Assign PARA category
    - Generate embedding vector
    - Store in SQLite (articles + articles_fts)
    |
    v
Future queries automatically get relevant context:
  SessionStart hook or --append-system-prompt:
    KB MCP server → query.js
    - Semantic search (vector similarity)
    - FTS fallback (full-text search)
    - Return top-N relevant articles
    - Inject into system prompt
```

---

## Integration Boundaries

### Boundary 1: Gateway ↔ Claude Code CLI

**Current:** Subprocess via `cli-runner.ts`. Gateway constructs CLI args, spawns process, parses stdout.

**Target:** Agent SDK (`@anthropic-ai/claude-agent-sdk`). In-process Node.js library calls.

**Migration path:**

1. Create `src/agents/sdk-runner.ts` parallel to `cli-runner.ts`
2. Implement the same `EmbeddedPiRunResult` return type
3. Wire into `resolveCliBackendConfig()` as a new backend type (`claude-sdk`)
4. Add config toggle: `agents.defaults.cliBackends.claude-cli.mode: "sdk" | "subprocess"`
5. Fallback: if SDK fails, fall back to subprocess (existing `cli-runner.ts`)

**Key interface contract (from `cli-runner.ts` line 53):**

```typescript
// Input
{
  sessionId: string;
  prompt: string;
  provider: string;       // "claude-cli" | "codex-cli" | custom
  model?: string;         // "opus" | "sonnet" | "haiku"
  thinkLevel?: ThinkLevel;
  timeoutMs: number;
  extraSystemPrompt?: string;
  images?: ImageContent[];
}

// Output (EmbeddedPiRunResult)
{
  payloads?: { text: string }[];
  meta: {
    durationMs: number;
    agentMeta: {
      sessionId: string;
      provider: string;
      model: string;
      usage?: object;
    };
  };
}
```

### Boundary 2: Gateway ↔ Codex CLI

**Current:** Subprocess via same `cli-runner.ts`. Uses `codex exec --json` with JSONL output.

**Target:** Stays subprocess (no Codex SDK for Node.js yet). Enhanced with:

- MCP server registration (`codex mcp add` for KB/macOS/Analytics)
- Experimental features enabled in `~/.codex/config.toml`
- Structured output via `--output-schema`

**Why not SDK:** There is no official Codex SDK for Node.js. The `codex exec` subprocess interface is already clean (JSONL event stream, structured output, session management). The main improvement is sharing MCP servers so Codex can access KB/macOS tools natively.

### Boundary 3: Claude Code ↔ Codex CLI (Mutual MCP)

**Direction:** Peer-to-peer. Neither is the "master."

**Wiring:**

- `claude mcp add codex-agent -- codex mcp-server` (Claude uses Codex tools)
- `codex mcp add claude-agent -- claude mcp serve` (Codex uses Claude tools)

**What crosses the boundary:**

- Claude → Codex: `execute_code`, `review_file`, `run_tests` (code execution in sandbox)
- Codex → Claude: `analyze_architecture`, `write_documentation`, `creative_writing` (reasoning-heavy tasks)

**What does NOT cross:** Session state, conversation history, internal tool results. Each brain maintains its own session independently. Shared knowledge flows through the KB MCP server, not through direct state sharing.

### Boundary 4: All Brains ↔ MCP Servers

**Protocol:** stdio-based MCP (JSON-RPC over stdin/stdout). Each MCP server is a separate Node.js process.

**Process model:** Each client (Claude, Codex, or future Gateway MCP client) spawns its own MCP server process instance. This means the KB SQLite file has concurrent readers. SQLite handles this natively with WAL mode, but:

- **Write contention:** Only one writer at a time. If two brains try to ingest simultaneously, one waits.
- **Embedding generation:** CPU-intensive. Parallel embedding requests should be serialized or batched.
- **Server lifecycle:** MCP servers start/stop with the calling brain's session. No persistent MCP server daemon.

### Boundary 5: Gateway ↔ Channel Adapters

**Current and unchanged.** Channel adapters are tightly integrated into the Gateway process:

- Built-in: `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/imessage/`, `src/web/`
- Extensions: `extensions/whatsapp/`, `extensions/matrix/`, `extensions/msteams/`, etc.

**What PAIOS changes:** The task router (Phase 1) sits between the channel adapter and the agent runtime. Messages are classified before being dispatched to the optimal brain.

---

## Build Order

The dependency graph determines what must exist before what. Each phase depends on the completion of all prior phases.

### Phase 0: MCP Mesh Wiring (No code changes)

**Dependencies:** None (all tools already installed)

**Steps (order matters):**

1. Register Codex MCP servers: `codex mcp add knowledge-base -- node ~/.openclaw/projects/knowledge-base/mcp-server.js`
2. Register Codex MCP servers: `codex mcp add macos-system -- node ...`
3. Register Codex MCP servers: `codex mcp add session-analytics -- node ...`
4. Register mutual MCP: `claude mcp add codex-agent -- codex mcp-server`
5. Register mutual MCP: `codex mcp add claude-agent -- claude mcp serve`
6. Enable Codex experimental features in `~/.codex/config.toml`
7. Verify: each brain can call the other's tools and access KB

**Deliverable:** All three brains share KB/macOS/Analytics MCP servers. Claude and Codex can invoke each other's tools. No code written.

### Phase 1A: Agent SDK Integration (Code change in Gateway)

**Dependencies:** Phase 0 (MCP mesh verified working)

**Steps:**

1. Create `src/agents/sdk-runner.ts` — implements `runSdkAgent()` with same contract as `runCliAgent()`
2. Create `src/agents/sdk-runner/mcp-bridge.ts` — wraps existing MCP servers as in-process SDK MCP servers via `createSdkMcpServer()`
3. Create `src/agents/sdk-runner/hooks.ts` — implements `canUseTool()` callback that delegates to Gateway's `ExecApprovalManager`
4. Add `"claude-sdk"` backend type to `cli-backends.ts`
5. Add config schema extension: `agents.defaults.cliBackends.claude-sdk.enabled: boolean`
6. Wire into `model-fallback.ts` as preferred candidate before `claude-cli` subprocess fallback
7. Add tests: unit test for SDK runner, e2e test for fallback behavior

**Why this order:** The SDK runner must be built before the task router (Phase 1B), because the router needs to programmatically invoke Claude with structured output. The subprocess fallback ensures we never lose capability.

### Phase 1B: Task Router (New project)

**Dependencies:** Phase 1A (SDK runner available for structured output)

**Steps:**

1. Create `~/.openclaw/projects/ai-router/` project
2. Build `router.py` — task classifier (categories: code, creative, analysis, scheduling, system, vision)
3. Build `mcp-server.py` — expose router as MCP server with `classify_task()` and `route_task()` tools
4. Register in all three brains: `claude/codex mcp add ai-router -- python3 ~/.openclaw/projects/ai-router/mcp-server.py`
5. Create Gateway hook: message → classify → route to optimal brain

**Why this after SDK:** The router's `route_task()` function needs to invoke Claude SDK for classification (using Haiku for speed). Without SDK, it would require a subprocess call for every classification, adding 2-5 seconds latency per message.

### Phase 1C: Claude Code Native Skills (8 skills)

**Dependencies:** Phase 0 (MCP mesh working)

**Steps:**

1. Create `~/.claude/skills/` directory
2. Create 8 skill files: `/kb`, `/capture`, `/post`, `/calendar`, `/competitors`, `/health`, `/brand`, `/codex-review`
3. Each skill wraps existing OpenClaw scripts/MCP calls with Claude Code-native invocation patterns
4. Test each skill in interactive Claude Code session

**Why parallel with 1A/1B:** Skills are independent of SDK integration. They bridge the gap where Claude Code sessions currently have 0 OpenClaw skills (vs. Gateway's 26).

### Phase 2: Shared Memory and Context (Code changes)

**Dependencies:** Phase 1A (SDK runner), Phase 1C (skills)

**Steps:**

1. Implement `SessionStart` hook — injects relevant KB articles via `--append-system-prompt` or SDK context
2. Implement `PostToolUse` hook — auto-ingests completed task results into KB
3. Implement `Stop` hook — quality gate validates completion before accepting
4. Implement `SessionEnd` hook — persists session learnings to KB
5. Enable Codex `memory_tool` and `sqlite` experimental features
6. Create `~/.codex/instructions.md` context file for Codex sessions
7. Populate KB with 50+ content captures

### Phase 3: Event-Driven Orchestration

**Dependencies:** Phase 2 (shared memory working)

**Steps:**

1. Activate Gateway heartbeat (currently configured but never ran — all timestamps = 0)
2. Wire content auto-posting: heartbeat Tier 3 (every 4h) → calendar.py → poster.py
3. Wire competitor daily sweep: heartbeat Tier 6 → tracker.py → KB
4. Wire engagement sync: heartbeat Tier 6 → analytics.py → KB
5. Implement file watchers: fswatch → classify → route to appropriate brain
6. Implement Claude Code Agent Teams for parallel research/review
7. Add `--max-budget-usd` for automated runs (cost caps)
8. Implement cross-system task chains: capture → analyze → post

### Phase 4: Unified Interface

**Dependencies:** Phase 3 (event-driven working)

**Steps:**

1. Create unified `ai` CLI command that routes to optimal system
2. Implement stream-json bidirectional control (`--input-format stream-json`)
3. Build progress dashboard (calendar, KB, health, costs)
4. Achieve channel unification (any channel → any brain)

---

## Error Handling Patterns

### Pattern 1: Model Failover Chain

**Source:** `src/agents/model-fallback.ts`

The Gateway already implements a sophisticated multi-model failover chain. This is the backbone of PAIOS reliability.

```
Primary model attempt (e.g., claude-sdk/opus)
    |-- FailoverError (billing, rate_limit, auth, timeout, format, model_not_found)
    v
Classify error reason → resolveFailoverReasonFromError()
    |-- billing (402) → skip provider entirely
    |-- rate_limit (429) → try next model, mark cooldown
    |-- auth (401/403) → try next auth profile
    |-- timeout (408/503) → try next model with higher timeout
    |-- format (400) → try different model (format incompatibility)
    |-- model_not_found (404) → skip model
    v
Next candidate from ordered list:
  1. claude-sdk/opus (primary)
  2. claude-cli/opus (subprocess fallback for same model)
  3. codex-cli/gpt-5.3-codex (different brain)
  4. openrouter/gemini-2.5-flash (paid fallback)
    |
    v
Auth profile rotation (within each provider):
  ensureAuthProfileStore() → resolveAuthProfileOrder()
  Cycles through configured API keys/OAuth tokens
  Marks failed profiles with cooldown expiry
```

**PAIOS extension:** Add `claude-sdk` as the first candidate in the chain, with `claude-cli` as immediate fallback. The SDK and subprocess use the same underlying Anthropic API, so failover from SDK to subprocess should be transparent.

### Pattern 2: CLI Subprocess Watchdog

**Source:** `src/agents/cli-runner.ts` lines 229-306

Every CLI subprocess run has two independent timeouts:

- **Overall timeout** (`timeoutMs`): absolute wall-clock limit for the entire run
- **No-output timeout** (`noOutputTimeoutMs`): kills process if no stdout/stderr for N seconds

When either fires:

1. Process is killed via supervisor
2. FailoverError is thrown with reason `"timeout"`
3. Model failover chain picks next candidate

**PAIOS adaptation:** The SDK runner should implement equivalent timeout logic using `AbortController`:

```typescript
const controller = new AbortController();
const overallTimer = setTimeout(() => controller.abort(), timeoutMs);
const noOutputTimer = /* reset on each SDK event */;
```

### Pattern 3: MCP Server Health Check

**Current state:** No health checking. MCP servers are spawned per-session and assumed healthy.

**PAIOS pattern:**

1. At Session start: `mcpServerStatus()` (SDK API) checks all registered MCP servers
2. If KB server is down: log warning, continue without KB context injection (graceful degradation)
3. If macOS server is down: disable macOS tools for this session
4. If all MCP servers are down: fall back to pure LLM mode (no tools)

### Pattern 4: Subprocess Crash Recovery

**Source:** `src/process/supervisor/` (process supervisor pattern)

The process supervisor manages CLI subprocess lifecycle:

- Tracks running processes by session ID and scope key
- Replaces existing scoped processes (e.g., on session resume)
- Captures exit code, stdout, stderr
- Handles signal-based termination

**PAIOS extension for SDK:** The SDK runs in-process, so subprocess crashes become Node.js exceptions. Error boundary:

```
try {
  result = await sdk.query(...)
} catch (error) {
  if (isFailoverError(error)) {
    // Model failover chain handles this
    throw error;
  }
  // SDK internal error — fall back to subprocess
  log.warn(`SDK error, falling back to CLI: ${error.message}`);
  result = await runCliAgent(/* same params */);
}
```

### Pattern 5: Configuration Hot-Reload Safety

**Source:** `src/gateway/config-reload.ts`

The Gateway supports live configuration reloading without restart:

- File watcher on `openclaw.json`
- Zod validation before applying (invalid config = reject, keep old)
- Atomic swap of runtime config reference
- Channel/plugin re-initialization if needed

**PAIOS implication:** New config keys for SDK mode (`agents.defaults.cliBackends.claude-sdk.*`) must be added to the Zod schema in `src/config/zod-schema.ts`. Invalid values must be caught by validation, not at runtime.

### Pattern 6: Graceful Degradation Hierarchy

When components fail, the system degrades gracefully rather than failing entirely:

```
Full PAIOS mesh (all working)
    |-- SDK fails → subprocess fallback
    |-- Primary model rate-limited → next model in chain
    |-- All Anthropic models fail → Codex CLI fallback
    |-- All CLI backends fail → embedded Pi (direct API)
    |-- KB MCP server down → no context injection (still functional)
    |-- macOS MCP server down → no system control (still functional)
    |-- All MCP servers down → pure LLM mode (no tools)
    |-- Internet down → error response to user (honest failure)
```

---

## Scaling Considerations

### Concurrency Model

**Current:** The Gateway uses request serialization per CLI backend. From `cli-runner.ts`:

```typescript
const serialize = backend.serialize ?? true;
const queueKey = serialize ? backendResolved.id : `${backendResolved.id}:${params.runId}`;
```

This means `claude-cli` runs are serialized (one at a time) and `codex-cli` runs are serialized (one at a time), but claude and codex can run concurrently with each other.

**PAIOS impact:** The SDK runner should follow the same serialization pattern. `claude-sdk` should be a separate queue from `claude-cli`, allowing SDK and subprocess to run concurrently (useful during migration).

**Future:** Remove serialization for SDK calls once stable. The SDK uses HTTP/2 multiplexing internally, so concurrent SDK queries are safe. The serialization was originally needed because CLI processes compete for terminal resources.

### MCP Server Process Count

**Current:** 0 concurrent MCP servers (Gateway has no MCP client).
**Phase 0:** Up to 6 concurrent MCP server processes (3 per CLI brain, when both are active simultaneously).
**Phase 1+:** SDK's `createSdkMcpServer()` runs in-process, so Gateway's SDK queries add 0 extra processes.

**Memory overhead per MCP server process:** ~50-80MB (Node.js baseline + SQLite connection for KB). Six concurrent servers = ~300-480MB additional RAM.

**Mitigation:** Use MCP server pooling or a single long-lived MCP server per type (rather than spawning per-session). This requires modifying how Claude Code and Codex manage MCP server lifecycle, which may not be configurable.

### KB SQLite Contention

**Current:** Single writer (Gateway's memory manager). Low contention.
**PAIOS target:** Multiple concurrent readers (Gateway + Claude MCP + Codex MCP), single writer at a time.

**SQLite WAL mode handles this well for reads.** Write contention is the concern:

- KB ingestion (via MCP server) acquires a write lock
- Embedding generation is CPU-bound (seconds per article)
- Concurrent ingestion requests will queue

**Mitigation:** Batch ingestion via the existing `src/memory/manager-embedding-ops.ts` batch system. PostToolUse hooks should queue ingestion requests rather than writing synchronously.

### Session Store Growth

**Current:** JSONL session files in `~/.openclaw/agents/<agentId>/sessions/`. Session compaction exists (`pi-embedded-runner/compact.ts`).

**PAIOS impact:** More brains = more sessions. Each brain (Claude SDK, Codex subprocess, router classification) creates session state. The existing session reaper (`src/cron/session-reaper.ts`) handles cleanup, but thresholds may need tuning.

**Mitigation:**

- Configure session TTL per backend type (SDK sessions may be shorter-lived than interactive sessions)
- Cron-triggered sessions should default to `cleanup: "delete"` after completion
- Router classification sessions should be ephemeral (no persistence)

### Rate Limits and Cost

**Architecture constraint:** The mesh must respect rate limits across all three brains simultaneously.

| Brain                    | Rate Limit                                | Strategy                            |
| ------------------------ | ----------------------------------------- | ----------------------------------- |
| Claude Code (SDK or CLI) | Max subscription limits                   | Queue serialization, model fallback |
| Codex CLI                | ChatGPT Pro: 5h primary + 7-day secondary | Queue serialization, spark fallback |
| OpenRouter (Gemini)      | Per-API-key limits                        | Only for vision, low volume         |

**Cross-brain rate limit awareness:** Currently, each backend manages its own rate limits independently via `auth-profiles.ts` cooldown tracking. This is sufficient because the brains use different API keys and providers. The router should track which brain was recently rate-limited to avoid sending tasks to an exhausted brain.

### Observability

**Current:** Gateway logs via `src/logging/subsystem.ts` (structured subsystem logging). Session analytics via MCP server.

**PAIOS additions needed:**

- Log which brain handled each request (for routing optimization)
- Track cross-brain latency (SDK vs subprocess vs direct API)
- Monitor MCP server health (up/down/latency)
- Track KB growth and query performance
- Dashboard endpoint (Phase 4) aggregating all metrics

---

## Key Architectural Decisions

### Decision 1: SDK as Primary, Subprocess as Fallback

The Agent SDK should be the primary path for Claude Code integration, with the existing subprocess path as automatic fallback. This is not a replacement but a layered approach:

**Rationale:** The SDK eliminates five classes of bugs (ARG_MAX, shell quoting, text parsing, timeout management, concurrent process limits) while adding capabilities (in-process MCP, hooks as callbacks, structured output). But the subprocess path is battle-tested and should remain available.

### Decision 2: Gateway Stays as Kernel (No Rewrite)

The Gateway is a 400+ file mature codebase with sophisticated agent runtime, channel adapters, cron system, and configuration management. PAIOS integrates via the existing seams (`cli-runner.ts`, `model-fallback.ts`, `hooks/internal-hooks.ts`) rather than rewriting.

**Rationale:** The `EmbeddedPiRunResult` type, the `CliBackendConfig` system, and the `FailoverError` chain provide clean integration points. Adding an SDK backend type requires ~200-300 lines of new code, not thousands.

### Decision 3: MCP as Bus, Not Direct Integration

The three brains communicate via MCP servers, not direct function calls or shared memory. The KB SQLite is accessed exclusively through the knowledge-base MCP server.

**Rationale:** MCP is already supported by both CLIs. Direct SQLite access from multiple processes risks write contention. MCP servers provide a clean API boundary with schema validation.

### Decision 4: Router is MCP Server, Not Gateway Module

The task router should be a standalone MCP server (`~/.openclaw/projects/ai-router/mcp-server.py`), not embedded in the Gateway process.

**Rationale:** This allows both CLIs to use the router independently (via MCP), not just the Gateway. It also allows the router to be upgraded/restarted without restarting the Gateway.

### Decision 5: Hook-Based KB Ingestion (Not Synchronous)

PostToolUse hooks should queue KB ingestion rather than blocking the response.

**Rationale:** Embedding generation takes 1-3 seconds per article. Blocking the response on ingestion adds unacceptable latency. Queue the ingestion and let it happen asynchronously.

---

## Risk Register

| Risk                                            | Probability | Impact | Mitigation                                                 |
| ----------------------------------------------- | ----------- | ------ | ---------------------------------------------------------- |
| Agent SDK API breaks between versions           | Medium      | High   | Pin version, test on upgrade, subprocess fallback          |
| MCP server process sprawl (6+ concurrent)       | High        | Medium | Pool servers, monitor memory, kill idle                    |
| KB write contention under load                  | Medium      | Low    | Batch writes, queue ingestion, WAL mode                    |
| Codex CLI subprocess flaky (no SDK)             | Low         | Medium | Watchdog timeouts, JSONL parsing resilience                |
| Config schema migration breaks Gateway          | Medium      | High   | Zod validation catches invalid keys before apply           |
| Rate limit exhaustion across brains             | Low         | Medium | Router tracks brain availability, adaptive routing         |
| Heartbeat activation causes unexpected behavior | Medium      | Medium | Start with conservative schedule, monitor before expanding |
