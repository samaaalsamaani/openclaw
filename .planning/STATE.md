---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Consumer Foundation
status: in-progress
last_updated: "2026-03-02T02:19:50Z"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The AI OS for Communication — persistent intelligence present inside every messaging platform users already use, that knows them across channels, acts proactively, and compounds in value the longer it runs.

**Current focus:** v4.0 Consumer Foundation — 7 phases, starting with platform foundations

## Current Position

Phase 22 in progress. Completed plans 22-01 and 22-02.

Resume with Phase 22 next plan.

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

Last session: 2026-03-02
Stopped at: Completed 22-02-PLAN.md (extension peerDependencies + better-sqlite3 verification)
