---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Consumer Foundation
status: in-progress
last_updated: "2026-03-02T14:56:00Z"
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 0
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The AI OS for Communication — persistent intelligence present inside every messaging platform users already use, that knows them across channels, acts proactively, and compounds in value the longer it runs.

**Current focus:** v4.0 Consumer Foundation — 7 phases, starting with platform foundations

## Current Position

**Phase 23 in progress** (23-01 COMPLETE: cross-channel memory indexer, 23-02 COMPLETE: cross-channel context injection).

Resume with Phase 23 Plan 03 (attribution footer).

## Phase Map

| Phase | Name                          | Goal                                                          |
| ----- | ----------------------------- | ------------------------------------------------------------- |
| 22    | platform-foundations          | Close SSRF gaps, fix deps, fix env path                       |
| 23    | cross-channel-memory          | Activate cross-channel session indexing and context injection |
| 24    | connect-everything-onboarding | Guided channel connection flow, activation metrics            |
| 25    | proactive-ai                  | Scheduled intelligence jobs, daily digest                     |
| 26    | consumer-billing              | Stripe, 3-tier model, billing portal                          |
| 27    | macos-app-polish              | Connection flow, status UI, quick-message, notifications      |
| 28    | developer-platform-groundwork | Plugin SDK on npm, docs site, marketplace UI                  |

## Prior Milestone Velocity

| Milestone | Phases | Plans | Shipped    |
| --------- | ------ | ----- | ---------- |
| v1.0      | 1-9    | 29    | 2026-02-22 |
| v2.0      | 10-15  | 17    | 2026-02-22 |
| v3.0      | 16-21  | 13    | 2026-03-01 |

## Accumulated Context

### Key Decisions Carried Forward

- CrossChannelIndexer singleton via module-level INDEXER_CACHE Map keyed by agentId — prevents duplicate intervals (23-01)
- FTS5 trigram tokenizer for cross-channel search — no embedding dependency for initial MEM-01/MEM-05 delivery (23-01)
- Cross-channel index DB at ~/.openclaw/agents/<agentId>/cross-channel-memory.sqlite (agent-level, not workspace) (23-01)
- crossChannelContextResult declared at function scope in runPreparedReply() so Plan 03 can access result.sources for attribution without re-querying (23-02)
- bodyForKb guard reused for cross-channel query (same <10 char / slash-command conditions as kbContextSection) — consistent guard behavior (23-02)
- Promise.race([doSearch, setTimeout(empty, 400ms)]) — latency-bounded async retrieval pattern for optional context augmentation (23-02)
- Section format: "--- CROSS-CHANNEL CONTEXT ---\n[From {Channel}, {N} days ago]: {snippet}" (23-02)
- Non-singleton database pattern (callers manage connection lifecycle)
- Permanent errors fail fast (400/401/404); transient errors retry with exponential backoff
- Session-scoped MCP servers (TCP wrapper needed for true daemon architecture)
- Cap agent team waves to 4-5 max (Claude Max rate limits hit with 24 concurrent sessions)
- better-sqlite3 must be external in tsdown.config.ts (native module cannot be bundled)
- Alert channels: NOTIFICATION + LOG + OBSERVABILITY (three channels, routing per environment)
- `fetchWithSsrFGuard()` not bare `fetch()` for any user-controlled URL (SSRF guard pattern)
- `resolveEffectiveHomeDir()` not `process.env.HOME` for home dir resolution
- No `workspace:*` in extension `dependencies` — use `peerDependencies` or `devDependencies`
- Extension peerDependencies use real semver range `>=2026.1.26` (not workspace:\*) for npm compatibility (22-02)
- better-sqlite3 is already in root dependencies (not devDependencies) — CONCERNS.md stale entry resolved (22-02)
- OBS-07 health dashboard unblocked — tsdown external: ["better-sqlite3"] already correct (22-02)

### Known Technical Debt (carried from v3.0)

- No recovery runbooks (Phase 20 deferred)
- No integration test suite (CHANGE-05)
- No pre-commit script validation (CHANGE-06)
- No dependency version locking (CHANGE-07)
- OBS-07 health dashboard: UNBLOCKED (22-02 confirmed tsdown config correct)

### Phase 22 Pre-work Context

SSRF-affected files (from .planning/codebase/CONCERNS.md):

- `src/infra/credential-monitor.ts`
- `src/infra/health-check.ts`
- `src/discord/send.outbound.ts`
- 6+ other files using bare `fetch()` on user-controlled URLs

better-sqlite3 location: CONFIRMED in root dependencies (not devDependencies). 22-02 resolved this concern.

process.env.HOME sites: 20+ locations across src/ — need to use `resolveEffectiveHomeDir()` instead.

Extension peerDependencies: 26 extensions updated in 22-02. Extensions now correctly declare both devDependencies (workspace:\*) and peerDependencies (>=2026.1.26).

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-02T14:56:00Z
Stopped at: Completed 23-02-PLAN.md (cross-channel context injection — queryCrossChannelContext, 400ms timeout, extraSystemPrompt injection, 8 tests).
Next: Phase 23 Plan 03 — attribution footer (crossChannelContextResult.sources available at function scope in runPreparedReply()).
