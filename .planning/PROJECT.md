# PAIOS — Personal AI Operating System

## What This Is

A unified Personal AI Operating System connecting three free, world-class AI brains — Claude Code CLI (Opus/Sonnet/Haiku), Codex CLI (gpt-5.3-codex), and OpenClaw Gateway (multi-channel daemon) — via MCP protocol into a single mesh. Any message on any channel reaches the best brain for that task. Knowledge compounds across all interactions. Content creates itself on schedule. Code gets reviewed by two independent AI perspectives. Monthly additional cost: ~$0.

## Core Value

**The mesh**: Three AI brains, one protocol (MCP), shared memory (KB), unified routing — so the right brain handles every task automatically, and knowledge compounds across all interactions.

## Requirements

### Validated

- ✓ OpenClaw Gateway running as always-on daemon (launchd, port 18789) — existing
- ✓ Claude Code CLI installed with Opus/Sonnet/Haiku models (Max sub) — existing
- ✓ Codex CLI installed with gpt-5.3-codex (ChatGPT Pro) — existing
- ✓ 7 API keys validated (Anthropic, OpenAI, OpenRouter, Brave, ElevenLabs, Deepgram, Late.dev) — existing
- ✓ 30 scripts across 21 projects (all syntax + runtime validated) — existing
- ✓ 26 OpenClaw skills configured — existing
- ✓ 3 MCP servers (knowledge-base, macos-system, session-analytics) — existing
- ✓ 6 custom Claude Code subagents + 11 GSD agents — existing
- ✓ 2 brand profiles with voice, pillars, personas, competitors — existing
- ✓ Content library at ~/Documents/OpenClaw/ with PARA structure — existing
- ✓ KB SQLite with PARA columns, FTS, Unicode-aware search — existing
- ✓ Python venv at ~/.openclaw/.venv (3.14, 17+ packages) — existing
- ✓ Claude Agent SDK v0.2.50 installed — existing
- ✓ GSD v1.20.5 installed (11 agents, 32 commands) — existing

### Active

- [ ] MCP mesh wiring — Claude Code ↔ Codex CLI mutual MCP registration
- [ ] Shared MCP servers — KB/macOS/Analytics accessible from both CLIs
- [ ] Codex experimental features enabled (multi_agent, memory_tool, sqlite)
- [ ] AI Task Router — classify tasks and route to optimal brain via MCP
- [ ] Agent SDK integration — Gateway uses SDK instead of subprocess for Claude calls
- [ ] SDK in-process MCP servers — Gateway exposes channels/heartbeat/skills as MCP tools
- [ ] 8 Claude Code native skills (/kb, /capture, /post, /calendar, /competitors, /health, /brand, /codex-review)
- [ ] Claude Code hooks — PreToolUse routing, PostToolUse KB ingestion, SessionStart context injection, Stop quality gate
- [ ] KB context injection — relevant articles injected per task via --append-system-prompt
- [ ] Auto-ingest to KB — completed tasks → KB learnings via PostToolUse hook
- [ ] Codex memory_tool + sqlite features for persistent context
- [ ] Heartbeat activation — cron-driven autonomous tasks (never ran despite config)
- [ ] Content auto-posting — calendar → poster.py every 4h
- [ ] Competitor daily sweep + weekly digest
- [ ] File watchers — screenshots/downloads → appropriate AI brain
- [ ] Claude Code Agent Teams — parallel research/review swarms
- [ ] Cross-system task chains — capture → analyze → post (fully automated)
- [ ] Unified `ai` CLI command — routes to best system
- [ ] Stream-json bidirectional control for programmatic orchestration
- [ ] Late.dev token refresh (YouTube expired, TikTok/Twitter expiring)

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

### Known Issues

- Heartbeat never executed (all timestamps = 0)
- KB barely populated (7 articles, 3 people, 0 atoms)
- Late.dev YouTube token expired, TikTok/Twitter expiring
- Gateway dist/ not built from source (using installed binary)
- 0 Claude Code native skills (26 OpenClaw skills exist but aren't accessible from Claude Code sessions)

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

---

_Last updated: 2026-02-22 after initialization_
