# Requirements: PAIOS — Personal AI Operating System

**Defined:** 2026-02-22
**Core Value:** Three AI brains, one protocol (MCP), shared memory (KB), unified routing — so the right brain handles every task automatically, and knowledge compounds across all interactions.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure (INFRA)

- [x] **INFRA-01**: MCP mesh wired — Claude Code and Codex CLI registered as mutual MCP servers
- [x] **INFRA-02**: KB, macOS, and Analytics MCP servers accessible from both CLIs (not just Claude Code)
- [x] **INFRA-03**: Codex CLI experimental features enabled (multi_agent, memory_tool, sqlite)
- [x] **INFRA-04**: SQLite busy_timeout increased from 1ms to 5000ms in qmd-manager.ts
- [x] **INFRA-05**: All MCP servers hardened with SIGTERM handlers and top-level try/catch
- [x] **INFRA-06**: MCP tool names prefixed with server name to prevent collisions (kb_query, macos_screenshot)
- [x] **INFRA-07**: Late.dev tokens refreshed (YouTube, TikTok, Twitter)
- [x] **INFRA-08**: Gateway heartbeat activated and running on schedule

### Agent SDK Integration (SDK)

- [x] **SDK-01**: New sdk-runner.ts created in Gateway — implements query() with same EmbeddedPiRunResult contract as cli-runner.ts
- [x] **SDK-02**: SDK runner registered as claude-sdk backend in cli-backends.ts
- [x] **SDK-03**: Model failover chain updated: claude-sdk first, claude-cli subprocess as fallback
- [x] **SDK-04**: canUseTool() callback wired to Gateway's ExecApprovalManager
- [x] **SDK-05**: In-process MCP servers created via createSdkMcpServer() for Gateway capabilities
- [x] **SDK-06**: AbortController + timeout logic implemented for SDK sessions
- [x] **SDK-07**: Process cleanup verified — no orphaned Claude Code processes after 50 queries

### Task Router (ROUT)

- [x] **ROUT-01**: Task classifier routes by domain (code, creative, analysis, scheduling, system, vision)
- [x] **ROUT-02**: Classifier uses heuristic rules (keyword/regex), not LLM calls
- [x] **ROUT-03**: Vision tasks always route to Gemini Flash (preserves free tier rate limits)
- [x] **ROUT-04**: Confidence threshold below 70% defaults to Claude Sonnet
- [x] **ROUT-05**: User can override routing with explicit brain selection ("ask Claude", "have Codex review")
- [x] **ROUT-06**: Router exposed as MCP server accessible from both CLIs
- [x] **ROUT-07**: All routing decisions logged for weekly review and optimization

### Claude Code Skills (SKIL)

- [x] **SKIL-01**: /kb skill — query knowledge base via MCP with natural language
- [x] **SKIL-02**: /capture skill — content capture pipeline (URL detection, download, transcribe, analyze, KB ingest)
- [x] **SKIL-03**: /post skill — social media posting with brand voice loading via MCP
- [x] **SKIL-04**: /calendar skill — content calendar list, add, schedule operations
- [x] **SKIL-05**: /competitors skill — competitor sweep and digest via Brave Search
- [x] **SKIL-06**: /health skill — system health check (all 3 brains + MCP mesh + API keys + tokens)
- [x] **SKIL-07**: /brand skill — load brand voice, pillars, personas into session context
- [x] **SKIL-08**: /codex-review skill — dual-brain code review (Codex quality + Claude architecture)

### Hooks & Automation (HOOK)

- [x] **HOOK-01**: SessionStart hook injects relevant KB articles (max 3, under 4000 tokens)
- [x] **HOOK-02**: PostToolUse hook auto-ingests completed task results to KB (async, non-blocking)
- [x] **HOOK-03**: Stop hook validates completion quality before accepting
- [x] **HOOK-04**: SessionEnd hook persists session learnings to KB
- [x] **HOOK-05**: wrapExternalContent() applied to all content entering KB from hooks

### Shared Memory (MEM)

- [x] **MEM-01**: KB populated with 50+ articles via content capture pipeline
- [x] **MEM-02**: PostToolUse auto-ingest produces searchable KB entries (not noise)
- [x] **MEM-03**: Codex instructions.md created with PAIOS context for Codex sessions
- [x] **MEM-04**: Cross-session context retrieval returns relevant prior work for new tasks

### Content Automation (CONT)

- [x] **CONT-01**: Content auto-posting runs on heartbeat (Tier 3, every 4h) — calendar to poster.py
- [x] **CONT-02**: Competitor daily sweep runs on heartbeat (Tier 6)
- [x] **CONT-03**: Engagement sync runs on heartbeat (Tier 6) — analytics.py to KB
- [x] **CONT-04**: Content pipeline chains end-to-end: capture -> analyze -> adapt -> schedule -> post

### Code Review (REVW)

- [x] **REVW-01**: Dual-perspective code review: Haiku reviews code quality, Claude Opus reviews architecture
- [x] **REVW-02**: Combined review report generated with both perspectives
- [x] **REVW-03**: /codex-review skill triggers the dual-review pipeline

## v2 Requirements

Requirements for v2 release. Builds on v1 infrastructure (MCP mesh, KB, task router, hooks, skills).

### Observability (OBSV)

- [x] **OBSV-01**: Every routing decision, MCP tool call, and KB operation emits a structured event with a traceId that links the full request lifecycle
- [x] **OBSV-02**: Events persisted to SQLite (observability.sqlite) with query interface via MCP tool and /trace skill
- [x] **OBSV-03**: Quality scoring system rates routing decisions (correct brain? good result?) and persists scores alongside events
- [x] **OBSV-04**: Weekly self-reflection job (heartbeat Tier 7) analyzes routing quality scores, identifies systematic misclassifications, and generates adjustment recommendations

### File Automation (FILE)

- [x] **FILE-01**: fswatch-based daemon monitors ~/Desktop/Screenshots and ~/Downloads for new files, managed via launchd
- [x] **FILE-02**: File classifier determines type (screenshot, PDF, media, code, document) from extension + MIME type within 100ms
- [x] **FILE-03**: Screenshots auto-routed to Gemini Flash for OCR/description, result ingested to KB
- [x] **FILE-04**: Documents (PDF, DOCX, XLSX) auto-routed to markitdown → KB ingest pipeline
- [x] **FILE-05**: Media files (MP4, MP3) offered for content capture pipeline (not auto-processed — too expensive)

### Progressive Autonomy (AUTO)

- [x] **AUTO-01**: Action classification system categorizes every tool call as safe (always execute), ask (prompt user), or never (blocked) based on action type and target
- [x] **AUTO-02**: Approval queue persists pending actions to SQLite with approve/deny/always-approve responses
- [x] **AUTO-03**: Trust accumulation: 5 consecutive approvals of the same action pattern → auto-promoted to safe
- [x] **AUTO-04**: User-configurable autonomy levels per action type in openclaw.json (override defaults per domain)
- [x] **AUTO-05**: /autonomy skill shows current trust levels, pending approvals, and allows inline reconfiguration

### Unified Interface (UNIF)

- [x] **UNIF-01**: `ai` shell command routes natural language to the best brain (uses v1 task classifier) and streams the response
- [x] **UNIF-02**: `ai --json` mode enables stream-json bidirectional control for programmatic orchestration
- [x] **UNIF-03**: `ai status` subcommand shows system health dashboard (all 3 brains, MCP mesh, KB stats, calendar, costs, autonomy levels)

### Agent Teams (TEAM)

- [x] **TEAM-01**: Agent Teams experimental feature enabled in settings, team templates defined for common workflows (research, review, build)
- [x] **TEAM-02**: TeammateIdle hook enforces quality gates (tests pass, lint clean, output files exist) before teammates go idle
- [x] **TEAM-03**: TaskCompleted hook validates completion criteria (build succeeds, no regressions) before tasks close
- [x] **TEAM-04**: /team skill spawns pre-configured team templates with appropriate model assignments per teammate role

## Out of Scope

| Feature                           | Reason                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| Custom UI/frontend                | OpenClaw already has web, macOS, iOS apps                      |
| New channel adapters              | 12+ already exist                                              |
| Rewriting Gateway internals       | Mature codebase (400+ files), integrate via existing seams     |
| Local/OSS models                  | Premature — three free world-class models already available    |
| Multi-user/multi-tenant           | Personal AI system — one user, one instance                    |
| Custom MCP protocol               | Standard protocol, no vendor lock-in                           |
| Codex Cloud integration           | Premature, local-first for now                                 |
| Real-time voice conversation      | Latency incompatible with LLM inference (sub-200ms impossible) |
| Social engagement bots            | Violates platform ToS, ethically questionable                  |
| Autonomous financial transactions | High risk, catastrophic trust damage on error                  |
| LangChain/CrewAI/AutoGen          | Gateway IS the orchestrator, SDK IS the agent loop             |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase                                | Status |
| ----------- | ------------------------------------ | ------ |
| INFRA-01    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-02    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-03    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-04    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-05    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-06    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-07    | Phase 1: MCP Mesh Foundation         | Done   |
| INFRA-08    | Phase 2: Heartbeat & KB Seeding      | Done   |
| SDK-01      | Phase 3: Agent SDK Integration       | Done   |
| SDK-02      | Phase 3: Agent SDK Integration       | Done   |
| SDK-03      | Phase 3: Agent SDK Integration       | Done   |
| SDK-04      | Phase 3: Agent SDK Integration       | Done   |
| SDK-05      | Phase 3: Agent SDK Integration       | Done   |
| SDK-06      | Phase 3: Agent SDK Integration       | Done   |
| SDK-07      | Phase 3: Agent SDK Integration       | Done   |
| ROUT-01     | Phase 6: Task Router                 | Done   |
| ROUT-02     | Phase 6: Task Router                 | Done   |
| ROUT-03     | Phase 6: Task Router                 | Done   |
| ROUT-04     | Phase 6: Task Router                 | Done   |
| ROUT-05     | Phase 6: Task Router                 | Done   |
| ROUT-06     | Phase 6: Task Router                 | Done   |
| ROUT-07     | Phase 6: Task Router                 | Done   |
| SKIL-01     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-02     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-03     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-04     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-05     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-06     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-07     | Phase 4: Claude Code Native Skills   | Done   |
| SKIL-08     | Phase 4: Claude Code Native Skills   | Done   |
| HOOK-01     | Phase 5: Hooks & Auto-Ingestion      | Done   |
| HOOK-02     | Phase 5: Hooks & Auto-Ingestion      | Done   |
| HOOK-03     | Phase 5: Hooks & Auto-Ingestion      | Done   |
| HOOK-04     | Phase 5: Hooks & Auto-Ingestion      | Done   |
| HOOK-05     | Phase 5: Hooks & Auto-Ingestion      | Done   |
| MEM-01      | Phase 2: Heartbeat & KB Seeding      | Done   |
| MEM-02      | Phase 5: Hooks & Auto-Ingestion      | Done   |
| MEM-03      | Phase 8: Cross-Session Knowledge     | Done   |
| MEM-04      | Phase 8: Cross-Session Knowledge     | Done   |
| CONT-01     | Phase 7: Content Automation Pipeline | Done   |
| CONT-02     | Phase 7: Content Automation Pipeline | Done   |
| CONT-03     | Phase 7: Content Automation Pipeline | Done   |
| CONT-04     | Phase 7: Content Automation Pipeline | Done   |
| REVW-01     | Phase 9: Dual-Brain Code Review      | Done   |
| REVW-02     | Phase 9: Dual-Brain Code Review      | Done   |
| REVW-03     | Phase 9: Dual-Brain Code Review      | Done   |

| OBSV-01 | Phase 10: Observability Foundation | Pending |
| OBSV-02 | Phase 10: Observability Foundation | Done |
| OBSV-03 | Phase 10: Observability Foundation | Done |
| OBSV-04 | Phase 15: Dashboard & Self-Reflection| Done |
| FILE-01 | Phase 11: File Automation | Done |
| FILE-02 | Phase 11: File Automation | Done |
| FILE-03 | Phase 11: File Automation | Done |
| FILE-04 | Phase 11: File Automation | Done |
| FILE-05 | Phase 11: File Automation | Done |
| AUTO-01 | Phase 12: Progressive Autonomy | Done |
| AUTO-02 | Phase 12: Progressive Autonomy | Done |
| AUTO-03 | Phase 12: Progressive Autonomy | Done |
| AUTO-04 | Phase 12: Progressive Autonomy | Done |
| AUTO-05 | Phase 12: Progressive Autonomy | Done |
| UNIF-01 | Phase 13: Unified CLI | Done |
| UNIF-02 | Phase 13: Unified CLI | Done |
| UNIF-03 | Phase 13: Unified CLI | Done |
| TEAM-01 | Phase 14: Agent Teams | Done |
| TEAM-02 | Phase 14: Agent Teams | Done |
| TEAM-03 | Phase 14: Agent Teams | Done |
| TEAM-04 | Phase 14: Agent Teams | Done |

**Coverage:**

- v1 requirements: 46 total (46 done)
- v2 requirements: 21 total (21 done)
- Total: 67 requirements (67 done)
- Mapped to phases: 67
- Unmapped: 0
- Coverage: 100%

## v3.0 Requirements (System Reliability & Hardening)

**NOT adding features** — pure stabilization to make v1/v2 infrastructure production-grade.

### Service Reliability (SERV)

- [ ] **SERV-01**: Gateway runs 7+ days without crash, hang, or restart
- [ ] **SERV-02**: All 6 launchd services start successfully on boot and stay running
- [ ] **SERV-03**: MCP servers handle 1000+ consecutive calls without crashing
- [ ] **SERV-04**: Embedding server processes requests without memory leaks or timeouts
- [ ] **SERV-05**: File watcher monitors directories without missing events or dying
- [ ] **SERV-06**: Heartbeat tasks (daily/weekly) execute successfully on schedule

### Integration Reliability (INTEG)

- [ ] **INTEG-01**: Gateway ↔ Claude SDK calls succeed 99%+ (no ARG_MAX, timeout, or parsing errors)
- [ ] **INTEG-02**: MCP cross-calls between CLIs work reliably (no connection drops or timeouts)
- [ ] **INTEG-03**: Hooks (PreToolUse, PostToolUse, SessionStart) execute without crashing parent process
- [ ] **INTEG-04**: Agent SDK handles long prompts (>10KB) without ARG_MAX errors
- [ ] **INTEG-05**: Codex subprocess calls have proper error handling and cleanup
- [ ] **INTEG-06**: MCP server errors are caught and logged (no silent failures)

### Data Integrity (DATA)

- [ ] **DATA-01**: SQLite databases use proper busy_timeout and WAL mode (no lock errors)
- [ ] **DATA-02**: Config files (llm-config, auth-profiles, openclaw.json) are never corrupted or overwritten unexpectedly
- [ ] **DATA-03**: Credential refresh works automatically (Late.dev tokens, OAuth renewal)
- [ ] **DATA-04**: Codex OAuth token renewal process documented and automated (expires Mar 3!)
- [ ] **DATA-05**: Remove placeholder 0-byte SQLite files (kb.sqlite, knowledge-base.sqlite, social.sqlite in ~/.openclaw/)
- [ ] **DATA-06**: Config schema validation prevents invalid keys from crashing Gateway
- [ ] **DATA-07**: Auth-profiles.json is single source of truth (no plist fallback causing drift)

### Observability & Monitoring (OBS)

- [ ] **OBS-01**: Comprehensive health check endpoint covering all services, APIs, databases
- [ ] **OBS-02**: Service crash detection with automatic restart (launchd KeepAlive + logging)
- [ ] **OBS-03**: Integration failure alerts (MCP timeouts, SDK errors logged to observability.sqlite)
- [ ] **OBS-04**: Config corruption detection (validate before loading, alert on schema errors)
- [ ] **OBS-05**: Credential expiry warnings (check all tokens, warn 7 days before expiry)
- [ ] **OBS-06**: Daily health report (email/notification with status of all components)
- [ ] **OBS-07**: Dashboard showing system health at a glance (services, APIs, databases, recent errors)

### Recovery Procedures (REC)

- [ ] **REC-01**: Gateway crash recovery — documented steps to restart and verify
- [ ] **REC-02**: MCP server crash recovery — how to restart individual servers
- [ ] **REC-03**: Config corruption recovery — restore from backup, validate, reload
- [ ] **REC-04**: Database lock recovery — kill hanging connections, verify integrity
- [ ] **REC-05**: Credential renewal procedures — OAuth flow, token refresh, key rotation
- [ ] **REC-06**: Runbook for each service (how it works, how to diagnose, how to fix)

### Change Safety (CHANGE)

- [ ] **CHANGE-01**: Config changes validated before apply (Zod schema check, dry-run mode)
- [ ] **CHANGE-02**: Config backup before changes (auto-backup to ~/.openclaw/backups/)
- [ ] **CHANGE-03**: Gateway config no longer rewritten on shutdown (fix the auto-rewrite bug)
- [ ] **CHANGE-04**: Rollback mechanism for failed config changes
- [ ] **CHANGE-05**: Integration tests for critical paths (MCP calls, SDK invocation, hooks)
- [ ] **CHANGE-06**: Pre-commit hooks validate scripts (syntax check, lint)
- [ ] **CHANGE-07**: Version locking for critical dependencies (prevent breaking updates)

---

_Requirements defined: 2026-02-22 (v1/v2), 2026-02-27 (v3.0)_
_Last updated: 2026-02-27 — v3.0 stabilization requirements added (37 requirements across 6 groups)_
