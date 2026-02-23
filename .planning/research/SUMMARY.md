# Research Summary

## Executive Summary

We are building a Personal AI Operating System (PAIOS) that connects three free AI brains -- OpenClaw Gateway, Claude Code CLI, and Codex CLI -- into a unified mesh via MCP protocol. The key insight is that the stack already exists: the Gateway has 400+ source files, the Claude Agent SDK is installed (zero imports), 3 MCP servers are running, and 26 skills are deployed. The work is integration, not greenfield. The critical path is five steps: activate the dormant heartbeat, populate the empty KB, wire the MCP mesh between all three brains, implement Claude Code hooks for automatic context/ingestion, and build a task router that classifies and dispatches to the optimal brain. Everything else (knowledge compounding, autonomy model, agent teams, self-reflection) layers on top of these five.

## Stack Decisions

| #   | Decision                                                                           | Rationale                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Claude Agent SDK `query()` as primary agent primitive** (subprocess as fallback) | Eliminates five bug classes (ARG_MAX, shell quoting, text parsing, timeouts, process limits). Already a dependency. Provides hooks, in-process MCP, structured output. See [STACK.md](STACK.md#agent-sdk-patterns).                                    |
| 2   | **Hub-and-spoke MCP topology** (Gateway as hub, not full mesh)                     | O(n) connections vs O(n^2). Gateway already acts as coordinator. Agents share state via shared-memory MCP server, not direct peer connections. See [STACK.md](STACK.md#3-mcp-mesh-topology).                                                           |
| 3   | **Single shared SQLite database** as memory bus (WAL mode)                         | Already deployed for KB. Zero new dependencies. Concurrent readers with serialized writes. sqlite-vec for semantic search. No external vector DB needed. See [STACK.md](STACK.md#1-sqlite-as-shared-memory-bus).                                       |
| 4   | **Heuristic task classification** (no LLM call for routing)                        | Fast, free, deterministic. Route by keyword/regex before hitting any model. LLM-based classification adds 2-5s latency per message. Refine with logging over time. See [STACK.md](STACK.md#1-pre-generation-classification-recommended).               |
| 5   | **No frameworks** (no LangChain, CrewAI, AutoGen, claude-flow)                     | The Gateway IS the orchestrator. Claude Agent SDK IS the agent loop. Adding another framework creates two competing orchestrators and pulls in massive dependency graphs for what amounts to `spawn() + JSON`. See [STACK.md](STACK.md#anti-patterns). |

## Feature Priorities

| Feature                               | Category       | Complexity | Have it?                               | Phase |
| ------------------------------------- | -------------- | ---------- | -------------------------------------- | ----- |
| Persistent memory across sessions     | Table-stakes   | Medium     | PARTIAL (infra built, KB nearly empty) | 1     |
| Task routing / model selection        | Table-stakes   | Medium     | Designed, not built                    | 3     |
| Tool / skill integration              | Table-stakes   | Low-Med    | YES (26 skills), but 0 in Claude Code  | 2     |
| Multi-channel I/O                     | Table-stakes   | Low        | YES (12+ adapters)                     | --    |
| Security / permissions                | Table-stakes   | Medium     | YES (30 rules), no audit trail         | 5     |
| Heartbeat / autonomous execution      | Table-stakes   | Medium     | Designed, BROKEN (never fired)         | 1     |
| Knowledge base / RAG                  | Table-stakes   | Med-High   | YES (infra), nearly empty (7 articles) | 1     |
| Error handling / graceful degradation | Table-stakes   | Medium     | PARTIAL                                | 1-2   |
| Multi-brain mesh with auto-routing    | Differentiator | HIGH       | NO (core vision, not built)            | 2-3   |
| Zero variable cost architecture       | Differentiator | Low        | YES ($0 via free tiers)                | --    |
| Cross-brain knowledge compounding     | Differentiator | HIGH       | NO                                     | 4     |
| Native OS integration (macOS)         | Differentiator | Medium     | YES (partial)                          | --    |
| Content pipeline (capture to publish) | Differentiator | HIGH       | YES (infra), not chained               | 3     |
| Progressive autonomy model            | Differentiator | Medium     | PARTIAL                                | 5     |
| Dual-perspective code review          | Differentiator | Medium     | NO                                     | 3     |
| Hooks-driven automation               | Differentiator | Medium     | Designed, not built                    | 2     |
| Agent teams / parallel swarms         | Differentiator | Med-High   | PARTIAL                                | 4     |
| Observability / self-reflection       | Differentiator | HIGH       | MINIMAL                                | 5-6   |

Details: [FEATURES.md](FEATURES.md)

## Architecture Blueprint

```
                        +---------------------------+
                        |     OpenClaw Gateway       |
                        |       (The Kernel)         |
                        |  - 12+ channel adapters    |
                        |  - session management      |
                        |  - cron/heartbeat          |
                        |  - model failover chain    |
                        |  - config (Zod-validated)  |
                        +-----+----------+----------+
                              |          |
               +--------------+          +-------------+
               |                                       |
      +--------v---------+               +-------------v----+
      |  Claude Code      |               |  Codex CLI        |
      |  (SDK + CLI)      |               |  (subprocess)     |
      |  - creative/arch  |               |  - code execution |
      |  - writing        |               |  - sandboxed ops  |
      |  - reasoning      |               |  - code review    |
      +--------+----------+               +-------+----------+
               |                                   |
               +---------+     +---------+---------+
                         |     |
                   +-----v-----v------+
                   |  MCP Server Layer |
                   |  (shared services)|
                   +--+----+----+-----+
                      |    |    |
              +-------+  +-+   +--------+
              |          |              |
        +-----v---+ +---v------+ +-----v-------+
        | KB       | | macOS    | | Session     |
        | SQLite   | | System   | | Analytics   |
        | FTS+Vec  | | Control  | | Metrics     |
        +---------+ +----------+ +-------------+
```

**Data flows** (see [ARCHITECTURE.md](ARCHITECTURE.md#data-flow) for full diagrams):

1. **Inbound message**: Channel adapter -> Gateway session router -> agent runtime -> model failover chain -> CLI backend or SDK -> response
2. **Gateway to Claude**: Currently subprocess via `cli-runner.ts`; target is Agent SDK `query()` via new `sdk-runner.ts` (same `EmbeddedPiRunResult` contract)
3. **Cross-brain MCP**: Claude <-> Codex via mutual MCP server registration; shared KB/macOS/Analytics via common MCP servers
4. **Knowledge loop**: Any interaction -> PostToolUse hook -> KB ingest (async) -> embedding -> future SessionStart hook injects relevant context

**Key architectural decisions**: SDK-primary with subprocess fallback; Gateway stays as kernel (no rewrite); MCP as bus (not direct integration); router as standalone MCP server; hook-based KB ingestion (async, not blocking). See [ARCHITECTURE.md](ARCHITECTURE.md#key-architectural-decisions).

## Top 10 Pitfalls

Ranked by severity x probability. Full details: [PITFALLS.md](PITFALLS.md).

| #   | Pitfall                                             | Sev      | Prob | Phase | Prevention                                                                                                      |
| --- | --------------------------------------------------- | -------- | ---- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **SQLite `busy_timeout = 1ms`** (P2)                | Critical | High | 0     | Change to 5000ms in `qmd-manager.ts:924`. Verify WAL mode on all connections.                                   |
| 2   | **MCP stdio orphan processes** (P1)                 | Critical | High | 0     | Process reaper cron (5min), SIGTERM handlers in all MCP servers, `reconcileOrphans()` at Gateway startup.       |
| 3   | **Agent SDK memory leak** (P3)                      | Critical | Med  | 1     | Always `abort()` in `finally`, pin SDK version, watchdog on child process count.                                |
| 4   | **Cross-brain prompt injection via MCP** (P6)       | Critical | Med  | 0     | `wrapExternalContent()` on all KB ingest, tool namespacing, never interpolate KB results as instructions.       |
| 5   | **Heartbeat runaway cost spiral** (P4)              | High     | Med  | 3     | Dry-run first activation, `--max-budget-usd 2.00` on all auto runs, circuit breaker after 5 consecutive errors. |
| 6   | **Cascading failure across brains** (P5)            | High     | Med  | 1     | Bulkhead isolation per brain, health checks before routing, request shedding at queue depth > 10.               |
| 7   | **Shell escaping in subprocess calls** (P7)         | High     | High | 1     | Migrate to Agent SDK `query()`. Until then: list args (no `shell=True`), no `bash -c` wrappers.                 |
| 8   | **MCP server crash = permanent tool loss** (P8)     | Med      | High | 0     | Top-level try/catch in every handler, defensive coding over reconnection (stdio cannot reconnect).              |
| 9   | **Task misclassification** (P9)                     | Med      | Med  | 1     | Start deterministic (keyword/regex), confidence threshold, user override, weekly log review.                    |
| 10  | **Context window overflow from KB injection** (P10) | Med      | Med  | 2     | Max 3 articles, 4000 token budget, two-stage (summaries first, full on demand).                                 |

## Critical Path

Dependency-aware build order. Each phase depends on prior phases.

```
Phase 0: Wire the Mesh (no code changes)                    [0.5-1 day]
  - Register MCP servers for Codex CLI
  - Register mutual MCP (Claude <-> Codex)
  - Fix busy_timeout=1 in qmd-manager.ts
  - Harden MCP servers (SIGTERM handlers, try/catch, tool name prefixes)
  - Refresh Late.dev tokens

Phase 1: Activate (3-5 days)
  - Heartbeat activation (debug launchd cron)
  - KB population (seed 50+ articles via capture pipeline)
  - Content auto-posting verification
       |
       v
Phase 2: Integrate (7-12 days)     [parallel tracks]
  A: sdk-runner.ts (Agent SDK integration in Gateway)
  B: 8 Claude Code native skills (wrappers for existing scripts)
  C: Claude Code hooks (SessionStart context, PostToolUse KB ingest)
  D: Shared MCP server access from all three brains
       |
       v
Phase 3: Route (5-8 days)
  - Task router (classifier + routing table + fallback)
  - Dual-perspective code review
  - Unified `ai` CLI command
       |
       v
Phase 4: Compound (10-15 days)
  - Cross-brain knowledge compounding
  - Auto-ingest from conversations
  - File watchers
  - Agent teams / parallel swarms
       |
       v
Phase 5: Evolve (10-20 days)
  - Audit trail
  - Progressive autonomy model
  - Observability / tracing
  - Cross-system task chains
       |
       v
Phase 6: Frontier (7-14 days)
  - Self-reflection / learning loops
  - Quality scoring and automatic improvement

Total estimate: ~37-66 days (single developer, serial)
```

## Cross-Cutting Concerns

These affect every phase and must be addressed continuously, not as one-off tasks.

**Security**

- `wrapExternalContent()` on ALL content entering KB (every ingest path, every phase)
- MCP tool namespacing to prevent shadowing (`kb_query`, `macos_screenshot`, not `query`)
- `permissionMode: "bypassPermissions"` + `allowedTools` whitelist for daemon tasks
- 30 blocked exec patterns enforced across all brains, not just Gateway
- Never auto-execute financial transactions or social engagement actions

**Testing**

- Phase gates before proceeding: orphan cleanup (P0), router accuracy on 20 samples (P1), SDK process cleanup after 50 queries (P1), KB injection under 4K tokens (P2), heartbeat dry-run 48h (P3)
- All bash scripts tested against macOS bash 3.2 (`/bin/bash`)
- Adversarial input testing: quotes, Unicode (Arabic), null bytes, paths with spaces
- Every external API validated against actual behavior, not docs (lesson from 8 historical bugs)

**Observability**

- Log which brain handled each request (routing optimization data)
- Track cross-brain latency (SDK vs subprocess vs direct API)
- Monitor MCP server health, orphan process count, WAL file sizes
- OpenRouter balance alerting (>$5/day triggers alert)
- Session analytics MCP server populated from Phase 1 onward

**Error Handling**

- Graceful degradation hierarchy: SDK -> subprocess -> embedded Pi -> pure LLM -> honest failure
- Model failover chain already exists in `model-fallback.ts`; extend with `claude-sdk` as first candidate
- Never retry 401s (token/auth issues); retry 429s with backoff; skip provider on 402s
- Circuit breaker pattern for heartbeat (5 consecutive errors = disable)

**Cost Control**

- `--max-budget-usd` on every automated LLM call
- Rate-limit-aware routing across all three brains (separate tracking per provider)
- Vision always routed to Gemini Flash (cheapest), never Codex (preserves free tier)
- Daily cost cap monitoring; emergency: `launchctl unload` the Gateway plist

## Confidence Assessment

**High Confidence (validated, ready to build)**

- MCP SDK v1.26.x is the right protocol layer (official, stable, already aligned)
- Claude Agent SDK `query()` works for daemon integration (documented, already a dependency)
- Hub-and-spoke topology matches existing Gateway architecture
- SQLite + WAL + sqlite-vec handles our concurrency and search needs
- Gateway stays as kernel -- integration via existing seams (`cli-runner.ts`, `model-fallback.ts`)
- The 5-step critical path is correct (heartbeat, KB, mesh, hooks, router)

**Medium Confidence (sound theory, needs validation)**

- Heuristic task classification will be accurate enough (may need LLM fallback for edge cases)
- Codex CLI as MCP server (`codex mcp-server`) is stable enough for production (OpenAI now recommends App Server for "full-fidelity")
- In-process MCP via `createSdkMcpServer()` has acceptable latency characteristics
- 2-3 concurrent agent sessions is the right limit for 16GB RAM (needs profiling)
- PostToolUse hook + async KB ingestion produces useful knowledge (quality of auto-extraction is unknown)

**Low Confidence (needs prototyping)**

- Cascade execution pattern (quality scoring across models is unreliable without a separate evaluator)
- Claude Agent SDK V2 session API (explicitly unstable, not for production until Q2 2026)
- Self-reflection / learning loops (frontier capability, no reference implementation)
- Agent team coordination at scale (error handling across parallel agents is poorly understood)
- Cross-brain knowledge compounding actually improves outputs (may just add noise)
