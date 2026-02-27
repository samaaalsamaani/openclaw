# PAIOS — Personal AI Operating System

## What This Is

A unified Personal AI Operating System connecting three free, world-class AI brains — Claude Code CLI (Opus/Sonnet/Haiku), Codex CLI (gpt-5.3-codex), and OpenClaw Gateway (multi-channel daemon) — via MCP protocol into a single mesh. Any message on any channel reaches the best brain for that task. Knowledge compounds across all interactions. Content creates itself on schedule. Code gets reviewed by two independent AI perspectives. Monthly additional cost: ~$0.

## Core Value

**The mesh**: Three AI brains, one protocol (MCP), shared memory (KB), unified routing — so the right brain handles every task automatically, and knowledge compounds across all interactions.

## Current Milestone: v3.0 System Reliability & Hardening

**Goal:** Transform PAIOS from fragile prototype to production-grade system. Eliminate crashes, prevent regressions, catch all failures, enable safe changes.

**Success criteria:**

- Services run weeks without restart (no crashes/hangs)
- Config/code changes don't cause cascading failures
- All failures detected and alerted immediately
- Documented recovery procedures for every component

**Status:** Defining requirements (NOT adding features — pure stabilization)

## Requirements

### Validated (v1.0 + v2.0 shipped)

**Infrastructure:**

- ✓ OpenClaw Gateway running as always-on daemon (launchd, port 18789) — v1.0
- ✓ MCP mesh wiring — Claude Code ↔ Codex CLI mutual MCP registration — v1.0
- ✓ Shared MCP servers — KB/macOS/Analytics accessible from both CLIs — v1.0
- ✓ Codex experimental features enabled (multi_agent, memory_tool, sqlite) — v1.0
- ✓ Agent SDK integration — Gateway uses SDK instead of subprocess — v1.0
- ✓ SDK in-process MCP servers — Gateway exposes capabilities as MCP tools — v1.0
- ✓ SQLite busy_timeout fixes, MCP server hardening (SIGTERM, try/catch) — v1.0

**Intelligence:**

- ✓ AI Task Router — classify tasks and route to optimal brain — v1.0
- ✓ 8 Claude Code native skills — /kb, /capture, /post, /calendar, /competitors, /health, /brand, /codex-review — v1.0
- ✓ Claude Code hooks — PreToolUse routing, PostToolUse KB ingestion, SessionStart context injection — v1.0
- ✓ KB context injection — relevant articles per task via --append-system-prompt — v1.0
- ✓ Auto-ingest to KB — completed tasks → KB learnings — v1.0
- ✓ Codex memory_tool + sqlite for persistent context — v1.0
- ✓ Dual-brain code review (Codex quality + Claude architecture) — v1.0

**Autonomy:**

- ✓ Heartbeat activation via launchd cron — v1.0
- ✓ KB seeded with 50+ articles via content capture pipeline — v1.0
- ✓ Content auto-posting — calendar → poster.py every 4h — v1.0
- ✓ Competitor daily sweep + weekly digest — v1.0
- ✓ Cross-system task chains — capture → analyze → post (fully automated) — v1.0

**Observability (v2.0):**

- ✓ Structured event tracing with SQLite persistence — v2.0
- ✓ Quality scoring for routing decisions — v2.0
- ✓ LLM usage tracking and cost analytics — v2.0
- ✓ Cross-brain handoff and enrichment tracking — v2.0

**Autonomy (v2.0):**

- ✓ Action classification (safe/ask/never) — v2.0
- ✓ Approval queue with trust accumulation — v2.0
- ✓ Progressive autonomy levels — v2.0
- ✓ File watchers — screenshots/downloads → appropriate AI brain — v2.0

**Control (v2.0):**

- ✓ Unified `ai` CLI command — routes to best system — v2.0
- ✓ Stream-json bidirectional control for programmatic orchestration — v2.0
- ✓ Agent Teams experimental support with quality gates — v2.0
- ✓ Weekly self-reflection analyzing routing patterns — v2.0

### Active (v3.0 — Stabilization)

TBD — Will be defined during requirements gathering

### Out of Scope

### Out of Scope

- Building a new UI/frontend — OpenClaw already has web, macOS, iOS apps
- Creating new messaging channel adapters — 12+ already exist
- Rewriting OpenClaw Gateway internals — we integrate, not rewrite
- Codex Cloud integration — premature, local-first for now
- Local/OSS models via --oss mode — future, not v1
- Building a custom MCP protocol — we use the standard
- Multi-user/multi-tenant support — this is a personal AI system

## Context

### Technical Environment

- macOS (Darwin 25.3.0) on Apple Silicon
- Node.js monorepo (pnpm) for Gateway
- Swift Package for macOS/iOS apps
- Python 3.14 venv for scripts
- SQLite for KB (with embeddings + FTS)
- launchd for daemon management

### Three AI Brains

- **OpenClaw Gateway** = The Kernel: always-on daemon, 12+ channels, cron, heartbeat, 26 skills, bash exec tools. Connects via exec/subprocess to CLIs. No native MCP client.
- **Claude Code CLI** = The Architect: creative intelligence, MCP server+client, 18 hooks, agent teams, plugins. Session-based. Agent SDK enables programmatic control from Node.js.
- **Codex CLI** = The Engine: code execution, sandboxed runtime, 272K context, code review, MCP server+client, exec mode. Session-based. Experimental: multi_agent, memory_tool, sqlite.

### Prior Work

- 4-phase system validation completed (100% infra, 100% scripts, 100% skills, 93% integration)
- 31 bugs found and fixed across all components
- PAIOS-MASTER.md created as single source of truth (900+ lines)
- Cost optimized from ~$780/mo to ~$0-60/mo

### System Crisis (Stabilization Required)

**Critical Issues (v3.0 focus):**

- **Services crash/restart constantly** — Gateway hangs, MCP servers die, launchd services unstable
- **Integration failures** — MCP calls fail, SDK timeouts, cross-brain communication breaks frequently
- **Config corruption** — llm-config.json, auth-profiles.json, openclaw.json get overwritten/broken
- **Credential management broken** — Keys expire, auth-profiles.json drift, token refresh fails
- **SQLite locking issues** — Database locks, KB inconsistency, lost events
- **Silent failures everywhere** — No alerts, no monitoring, discover failures manually
- **Change fragility** — Config edits, code changes, dependency updates cause cascading failures
- **Technical debt accumulated** — Rapid development left fragile components throughout system
- **No recovery procedures** — When things break, unclear how to fix them

**Previous Known Issues (v1/v2):**

- Late.dev YouTube token expired, TikTok/Twitter expiring
- Gateway dist/ not built from source (using installed binary)

## Constraints

- **Cost**: $0 variable cost target — use free tiers (Codex via ChatGPT Pro, Claude via Max sub). OpenRouter only for vision (~$0-2/day)
- **Architecture**: Gateway has NO native MCP client — must use exec/subprocess or Agent SDK to bridge to CLIs
- **Config schema**: OpenClaw config uses strict Zod validation — invalid keys = crash loops. Always validate before editing openclaw.json
- **CLI mode**: Claude Code CLI mode disables OpenClaw tools — main agent MUST stay on API for Gateway, use CLI for direct sessions
- **macOS bash**: Version 3.2 — no associative arrays, no `${!var}` indirect expansion, no `|&`
- **ARG_MAX**: macOS limits command args to ~1MB — use temp files or Agent SDK for long prompts
- **Security**: 30 blocked exec patterns in exec-approvals.json — respect these boundaries

## Key Decisions

| Decision                            | Rationale                                                                                                     | Outcome   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| MCP as the universal protocol       | Both CLIs support MCP server+client natively. Gateway bridges via exec. Standard protocol, no vendor lock-in. | — Pending |
| Agent SDK replaces subprocess calls | Eliminates ARG_MAX, timeout, parsing, quote escaping bugs. Adds hooks, permissions, structured output.        | — Pending |
| GSD orchestrates the PAIOS build    | 11 specialized agents, wave-parallel execution, goal-backward verification. Prevents ad-hoc drift.            | — Pending |
| Skill Creator for 8 native skills   | Bridges 26→0 gap. Claude Code sessions get instant access to KB, content, social capabilities.                | — Pending |
| Quality model profile (Opus)        | PAIOS is architecture-heavy. Opus reasoning is worth the token cost (free via Max sub anyway).                | — Pending |
| OpenClaw = Kernel, not rewritten    | Gateway is mature (400+ files). We integrate via SDK/exec, not fork/rewrite.                                  | ✓ Good    |
| Codex for code, Claude for creative | Each model's strength. Codex = code-optimized sandbox. Claude = best reasoning + writing.                     | — Pending |
| KB SQLite as shared memory          | Already exists with PARA, FTS, embeddings. Accessible via MCP server.                                         | ✓ Good    |

| Stabilization milestone (v3.0) | Freeze new features, fix everything before building more | All 15 v1/v2 phases shipped but system unstable. Do it right. | — Pending |

---

_Last updated: 2026-02-27 after milestone v3.0 started_
