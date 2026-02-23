# Roadmap: PAIOS — Personal AI Operating System

## Overview

PAIOS connects three free AI brains (OpenClaw Gateway, Claude Code CLI, Codex CLI) into a unified mesh via MCP protocol. The build path follows the dependency chain: first wire the mesh so brains can communicate, then activate the dormant heartbeat and seed the empty KB so there is something to compound, then replace fragile subprocess calls with the Agent SDK, then expose Gateway capabilities as Claude Code native skills, then wire hooks for automatic context injection and knowledge ingestion, then build the task router so the right brain handles every task, then chain the content automation pipeline end-to-end, then close the knowledge loop with cross-session memory, and finally deliver dual-brain code review as the capstone integration of the entire system.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: MCP Mesh Foundation** - Wire cross-brain MCP, harden servers, fix SQLite, namespace tools, refresh tokens
- [x] **Phase 2: Heartbeat & KB Seeding** - Activate dormant heartbeat, populate KB with 50+ articles
- [x] **Phase 3: Agent SDK Integration** - Replace subprocess calls with SDK runner in Gateway
- [x] **Phase 4: Claude Code Native Skills** - 8 skills bridging Claude Code sessions to Gateway capabilities
- [x] **Phase 5: Hooks & Auto-Ingestion** - Automatic context injection and knowledge capture via Claude Code hooks
- [x] **Phase 6: Task Router** - Heuristic classifier that routes tasks to the optimal brain
- [x] **Phase 7: Content Automation Pipeline** - Auto-posting, competitor sweeps, and end-to-end content chains on heartbeat
- [x] **Phase 8: Cross-Session Knowledge** - Codex persistent context and cross-session retrieval from KB
- [x] **Phase 9: Dual-Brain Code Review** - Two-perspective code review combining Codex quality + Claude architecture analysis
- [x] **Phase 10: Observability Foundation** - Structured event tracing, SQLite persistence, quality scoring for all routing and MCP operations
- [x] **Phase 11: File Automation** - fswatch watchers on Screenshots/Downloads, file classification, auto-routing to appropriate brain
- [x] **Phase 12: Progressive Autonomy** - Action classification (safe/ask/never), approval queue, trust accumulation
- [x] **Phase 13: Unified CLI** - `ai` command routing to best brain, stream-json control, status dashboard
- [x] **Phase 14: Agent Teams** - Enable experimental teams, quality gate hooks, team templates, /team skill
- [x] **Phase 15: Dashboard & Self-Reflection** - Weekly self-reflection, routing optimization, adjustment recommendations

## Phase Details

### Phase 1: MCP Mesh Foundation

**Goal**: All three AI brains can communicate via MCP and share services reliably
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):

1. Claude Code can call Codex CLI tools via MCP, and Codex can call Claude Code tools via MCP (bidirectional)
2. Both CLIs can query the KB, take macOS screenshots, and read session analytics via shared MCP servers
3. Codex CLI responds to `codex --experimental-features` with multi_agent, memory_tool, and sqlite enabled
4. Concurrent MCP queries from two sessions never produce SQLite "database is locked" errors
5. All MCP servers survive 100 consecutive tool calls without crashing (SIGTERM handlers + try/catch proven)
   **Plans**: TBD

Plans:

- [x] 01-01: Register mutual MCP servers (Claude Code <-> Codex CLI) and validate bidirectional calls
- [x] 01-02: Wire shared MCP servers (KB, macOS, Analytics) for both CLIs
- [x] 01-03: Enable Codex experimental features and validate memory_tool + sqlite
- [x] 01-04: Fix SQLite busy_timeout, harden MCP servers (SIGTERM, try/catch, tool prefixes)
- [x] 01-05: Refresh Late.dev tokens (YouTube, TikTok, Twitter)

### Phase 2: Heartbeat & KB Seeding

**Goal**: The system runs autonomously on schedule and has a populated knowledge base to draw from
**Depends on**: Phase 1
**Requirements**: INFRA-08, MEM-01
**Success Criteria** (what must be TRUE):

1. Heartbeat fires on its configured schedule (launchd cron) and produces logs showing successful execution
2. KB contains 50+ articles with embeddings and FTS entries, searchable via natural language queries
3. Content capture pipeline (URL -> download -> transcribe -> analyze -> KB ingest) completes end-to-end for a test URL
   **Plans**: TBD

Plans:

- [x] 02-01: Debug and activate Gateway heartbeat via launchd cron
- [x] 02-02: Seed KB with 50+ articles using content capture pipeline (batch capture)

### Phase 3: Agent SDK Integration

**Goal**: Gateway calls Claude Code via in-process SDK instead of fragile subprocess/exec
**Depends on**: Phase 1
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06, SDK-07
**Success Criteria** (what must be TRUE):

1. A Gateway query routed to Claude via SDK returns the same structured result as the current subprocess path
2. SDK runner is the primary backend; subprocess activates only when SDK fails (failover chain verified)
3. Gateway's 30 blocked exec patterns are enforced on SDK sessions (canUseTool callback)
4. After 50 consecutive SDK queries, `ps aux | grep claude` shows zero orphaned processes
5. SDK sessions respect timeout (AbortController) and abort cleanly within 5 seconds of signal
   **Plans**: TBD

Plans:

- [x] 03-01: Create sdk-runner.ts implementing query() with EmbeddedPiRunResult contract
- [x] 03-02: Register claude-sdk backend and update model failover chain
- [x] 03-03: Wire canUseTool() to ExecApprovalManager + implement AbortController/timeout
- [x] 03-04: Create in-process MCP servers via createSdkMcpServer() for Gateway capabilities
- [x] 03-05: Stress test: 50 queries, verify zero orphans and clean abort

### Phase 4: Claude Code Native Skills

**Goal**: Claude Code sessions have instant access to KB, content, social, health, and brand capabilities
**Depends on**: Phase 1, Phase 2 (KB must be populated for /kb to be useful)
**Requirements**: SKIL-01, SKIL-02, SKIL-03, SKIL-04, SKIL-05, SKIL-06, SKIL-07, SKIL-08
**Success Criteria** (what must be TRUE):

1. Running `/kb "machine learning"` in a Claude Code session returns relevant KB articles
2. Running `/capture <url>` downloads, transcribes, analyzes, and ingests content into KB end-to-end
3. Running `/post` with brand voice selection creates and publishes a social media post via Late.dev
4. Running `/health` reports status of all 3 brains, MCP mesh connectivity, API key validity, and token expiry
5. All 8 skills (/kb, /capture, /post, /calendar, /competitors, /health, /brand, /codex-review) are listed in Claude Code slash command autocomplete
   **Plans**: TBD

Plans:

- [x] 04-01: Create /kb and /brand skills (KB query + brand voice/pillars/personas loading)
- [x] 04-02: Create /capture and /calendar skills (content pipeline + calendar operations)
- [x] 04-03: Create /post and /competitors skills (social posting + competitor sweep)
- [x] 04-04: Create /health and /codex-review skills (system diagnostics + dual-review trigger)

### Phase 5: Hooks & Auto-Ingestion

**Goal**: Claude Code sessions automatically receive relevant context and capture knowledge without user action
**Depends on**: Phase 2 (KB seeded), Phase 3 (SDK for in-process hooks)
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, MEM-02
**Success Criteria** (what must be TRUE):

1. Starting a new Claude Code session shows injected KB context relevant to the working directory or recent topic (max 3 articles, under 4000 tokens)
2. After a tool completes, relevant results appear as new searchable KB entries within 30 seconds (async, non-blocking)
3. The Stop hook rejects incomplete responses and requests elaboration at least once in a test scenario
4. All externally-sourced content entering KB is wrapped with wrapExternalContent() (no raw injection)
5. SessionEnd persists a learnings entry to KB that is retrievable in the next session on the same topic
   **Plans**: TBD

Plans:

- [x] 05-01: Implement SessionStart hook (KB context injection via stdout)
- [x] 05-02: Implement PostToolUse hook (async KB auto-ingest + wrapExternalContent)
- [x] 05-03: Implement Stop hook (completion quality gate) and SessionEnd hook (learnings persistence)

### Phase 6: Task Router

**Goal**: Every incoming task is automatically classified and dispatched to the optimal AI brain
**Depends on**: Phase 1 (mesh), Phase 3 (SDK for Claude calls)
**Requirements**: ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05, ROUT-06, ROUT-07
**Success Criteria** (what must be TRUE):

1. Sending "review this Python function" routes to Codex; sending "write a blog post" routes to Claude; sending an image routes to Gemini Flash
2. Classification completes in under 50ms (no LLM call -- pure heuristic)
3. User saying "ask Claude to..." or "have Codex review..." overrides automatic routing
4. Router is accessible as an MCP tool from both Claude Code and Codex sessions
5. Every routing decision is logged with timestamp, input summary, classification, confidence, and selected brain
   **Plans**: TBD

Plans:

- [x] 06-01: Build heuristic task classifier (keyword/regex rules, domain categories, confidence scoring)
- [x] 06-02: Implement routing table, vision shortcut, confidence threshold fallback, user override parsing
- [x] 06-03: Expose router as MCP server + implement decision logging for weekly review

### Phase 7: Content Automation Pipeline

**Goal**: Content creates, schedules, and publishes itself on heartbeat without human intervention
**Depends on**: Phase 2 (heartbeat active), Phase 4 (skills for content operations), Phase 5 (hooks for KB feedback)
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04
**Success Criteria** (what must be TRUE):

1. Every 4 hours, heartbeat checks the content calendar and auto-posts any scheduled items via poster.py
2. Competitor daily sweep runs and produces a searchable KB entry with new findings
3. Engagement analytics sync runs and updates KB with platform metrics
4. A URL captured via /capture flows through: download -> transcribe -> analyze -> adapt to brand voice -> schedule in calendar -> auto-post at scheduled time (fully unattended)
   **Plans**: TBD

Plans:

- [x] 07-01: Wire content auto-posting on heartbeat Tier 3 (calendar -> poster.py every 4h)
- [x] 07-02: Wire competitor sweep (daily) and engagement sync (daily) on heartbeat Tier 6
- [x] 07-03: Chain end-to-end content pipeline: capture -> analyze -> adapt -> schedule -> post

### Phase 8: Cross-Session Knowledge

**Goal**: Both brains retain and retrieve relevant prior work across sessions
**Depends on**: Phase 5 (hooks populating KB), Phase 1 (Codex features enabled)
**Requirements**: MEM-03, MEM-04
**Success Criteria** (what must be TRUE):

1. Codex sessions start with PAIOS context from instructions.md (architecture, conventions, routing awareness)
2. Starting a task that was previously worked on (in either brain) surfaces the prior session's learnings and decisions
3. Cross-session retrieval returns results from both Claude-originated and Codex-originated KB entries
   **Plans**: TBD

Plans:

- [x] 08-01: Create and maintain Codex instructions.md with PAIOS context
- [x] 08-02: Implement cross-session context retrieval (query KB for prior work on current topic)

### Phase 9: Dual-Brain Code Review

**Goal**: Code gets reviewed from two independent AI perspectives in a single workflow
**Depends on**: Phase 6 (router for dispatching to correct brain), Phase 4 (/codex-review skill)
**Requirements**: REVW-01, REVW-02, REVW-03
**Success Criteria** (what must be TRUE):

1. Running `/codex-review` on a file produces a Codex code-quality review AND a Claude Opus architecture review
2. Both reviews are combined into a single formatted report with clearly labeled perspectives
3. The dual-review pipeline completes in under 3 minutes for a 500-line file
   **Plans**: TBD

Plans:

- [x] 09-01: Build dual-perspective review pipeline (Haiku quality + Opus architecture)
- [x] 09-02: Implement combined report generation and wire to /codex-review skill

### Phase 10: Observability Foundation

**Goal**: Every operation across the PAIOS mesh emits structured, traceable events that persist for analysis
**Depends on**: Phase 6 (task router with decision logging), Phase 5 (hooks for event emission points)
**Requirements**: OBSV-01, OBSV-02, OBSV-03
**Success Criteria** (what must be TRUE):

1. A routing decision includes a traceId that appears in the MCP tool call log and the KB operation log for the same request
2. Events are persisted to `~/.openclaw/observability.sqlite` with structured schema (traceId, timestamp, category, action, metadata)
3. Running `router_classify` via MCP produces an event viewable via the `/trace` skill or `obs_query` MCP tool
4. Quality scores (1-5) can be attached to routing decisions retroactively via MCP tool
5. `obs_query` MCP tool supports filtering by traceId, category, time range, and quality score

Plans:

- [x] 10-01: Design event schema, create observability.sqlite, implement event emitter module
- [x] 10-02: Instrument task router, MCP servers, and hooks with traceId propagation and event emission
- [x] 10-03: Create obs_query MCP tool, /trace skill, and quality scoring interface

### Phase 11: File Automation

**Goal**: New files in watched directories are automatically classified and routed to the appropriate AI brain
**Depends on**: Phase 6 (task router for classification), Phase 10 (observability for tracing file events)
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04, FILE-05
**Success Criteria** (what must be TRUE):

1. Saving a screenshot to ~/Desktop/Screenshots triggers file watcher within 2 seconds
2. File classifier correctly identifies screenshots (PNG/JPG), documents (PDF/DOCX), media (MP4/MP3), and code files
3. Screenshots are automatically sent to Gemini Flash for description and the result appears in KB within 30 seconds
4. PDF/DOCX files are converted via markitdown and ingested to KB inbox
5. Media files generate a notification offering content capture (not auto-processed)
6. File watcher daemon survives system sleep/wake and auto-restarts via launchd

Plans:

- [x] 11-01: Create fswatch watcher daemon with launchd plist for Screenshots + Downloads
- [x] 11-02: Build file classifier (extension + MIME type → category) and routing dispatch
- [x] 11-03: Wire auto-processing pipelines (screenshots → Gemini, documents → markitdown, media → notification)

### Phase 12: Progressive Autonomy

**Goal**: The system learns which actions are safe to execute autonomously and which require human approval
**Depends on**: Phase 10 (observability for logging approval decisions)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05
**Success Criteria** (what must be TRUE):

1. Every tool call is classified as safe/ask/never before execution, with the classification logged
2. An "ask" action pauses execution and presents the user with approve/deny/always-approve options
3. After 5 consecutive approvals of the same action pattern, it auto-promotes to "safe" (user notified)
4. User can set `autonomy.levels.content_post = "always_ask"` in openclaw.json to override defaults
5. Running `/autonomy` shows current trust levels, recent promotions, and pending approvals

Plans:

- [x] 12-01: Design action classification system (safe/ask/never) with default rules per domain
- [x] 12-02: Implement approval queue in SQLite with trust accumulation and auto-promotion
- [x] 12-03: Create /autonomy skill, openclaw.json integration, and user notification system

### Phase 13: Unified CLI

**Goal**: A single `ai` command provides natural language access to the entire PAIOS mesh
**Depends on**: Phase 6 (task classifier for routing), Phase 10 (observability for status)
**Requirements**: UNIF-01, UNIF-02, UNIF-03
**Success Criteria** (what must be TRUE):

1. Running `ai "review this function"` routes to the correct brain (Codex) and streams the response to stdout
2. Running `ai --json "summarize this article"` outputs stream-json events (routing decision, progress, result)
3. Running `ai status` shows a dashboard with: brain health (3 brains), MCP mesh status, KB stats, calendar summary, cost tracker, autonomy levels
4. The `ai` command is installed as a shell function/script accessible from any terminal
5. Response streaming starts within 2 seconds of invocation (no long cold-start)

Plans:

- [x] 13-01: Create `ai` shell command with task classification, brain routing, and response streaming
- [x] 13-02: Implement `ai --json` stream-json mode and `ai status` dashboard (combined with 13-01)

### Phase 14: Agent Teams

**Goal**: Complex tasks are parallelized across coordinated AI teammates with quality gates
**Depends on**: Phase 10 (observability for team tracing), Phase 12 (autonomy for team permissions)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04
**Success Criteria** (what must be TRUE):

1. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in settings and agent teams spawn successfully
2. TeammateIdle hook prevents teammates from going idle if their output files don't exist or tests fail
3. TaskCompleted hook verifies build success and no regressions before allowing task closure
4. Running `/team research "topic"` spawns a 3-teammate research swarm with Sonnet models
5. Team templates exist for: research (3 teammates), review (2 teammates), build (4 teammates)

Plans:

- [x] 14-01: Enable Agent Teams, create TeammateIdle and TaskCompleted quality gate hooks
- [x] 14-02: Design team templates (research, review, build) with role-specific model assignments
- [x] 14-03: Create /team skill for spawning pre-configured teams

### Phase 15: Dashboard & Self-Reflection

**Goal**: The system analyzes its own performance and automatically improves routing accuracy
**Depends on**: Phase 10 (observability data), Phase 12 (autonomy trust data), Phase 14 (team performance data)
**Requirements**: OBSV-04
**Success Criteria** (what must be TRUE):

1. Weekly self-reflection job (heartbeat Tier 7) runs and produces a routing quality report
2. Report identifies top 3 systematic misclassifications with specific adjustment recommendations
3. Quality scores from Phase 10 feed into routing weight adjustments (classifier learns from feedback)
4. Self-reflection report is ingested to KB and surfaced in next session's context injection
5. Month-over-month routing accuracy improves (measured by quality score average)

Plans:

- [x] 15-01: Build weekly self-reflection analyzer (query observability data, identify patterns, generate report)
- [x] 15-02: Implement routing weight adjustment based on quality feedback + wire to heartbeat Tier 7

## Progress

**Execution Order:**
v1 Phases: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
v2 Phases: 10 -> 11 -> 12 -> 13 -> 14 -> 15
Post-build: E2E Validation -> Post-Validation Hardening -> Daily Use (current)

Note: v1 phases (1-9) are complete. v2 phases (10-15) follow dependency chains: Phase 10 (observability) is foundational — Phases 11 and 12 depend on it. Phase 13 depends on 10. Phase 14 depends on 10 and 12. Phase 15 depends on 10, 12, and 14. Phases 11 and 12 can run in parallel after Phase 10.

| Phase                           | Plans Complete | Status   | Completed  |
| ------------------------------- | -------------- | -------- | ---------- |
| 1. MCP Mesh Foundation          | 5/5            | Complete | 2026-02-22 |
| 2. Heartbeat & KB Seeding       | 2/2            | Complete | 2026-02-22 |
| 3. Agent SDK Integration        | 5/5            | Complete | 2026-02-22 |
| 4. Claude Code Native Skills    | 4/4            | Complete | 2026-02-22 |
| 5. Hooks & Auto-Ingestion       | 3/3            | Complete | 2026-02-22 |
| 6. Task Router                  | 3/3            | Complete | 2026-02-22 |
| 7. Content Automation Pipeline  | 3/3            | Complete | 2026-02-22 |
| 8. Cross-Session Knowledge      | 2/2            | Complete | 2026-02-22 |
| 9. Dual-Brain Code Review       | 2/2            | Complete | 2026-02-22 |
| 10. Observability Foundation    | 3/3            | Complete | 2026-02-22 |
| 11. File Automation             | 3/3            | Complete | 2026-02-22 |
| 12. Progressive Autonomy        | 3/3            | Complete | 2026-02-22 |
| 13. Unified CLI                 | 2/2            | Complete | 2026-02-22 |
| 14. Agent Teams                 | 3/3            | Complete | 2026-02-22 |
| 15. Dashboard & Self-Reflection | 2/2            | Complete | 2026-02-22 |
| E2E Validation                  | 7/7 subsystems | Complete | 2026-02-22 |
| Post-Validation Hardening       | 3/3 gaps       | Complete | 2026-02-22 |
