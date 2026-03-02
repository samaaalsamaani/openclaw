---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Consumer Foundation
status: ready
last_updated: "2026-03-02T00:00:00.000Z"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The AI OS for Communication — persistent intelligence present inside every messaging platform users already use, that knows them across channels, acts proactively, and compounds in value the longer it runs.

**Current focus:** v4.0 Consumer Foundation — 7 phases, starting with platform foundations

## Current Position

Milestone v4.0 roadmap defined 2026-03-02. Ready to plan Phase 22.

Run `/gsd:plan-phase 22` to start.

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

### Known Technical Debt (carried from v3.0)

- No recovery runbooks (Phase 20 deferred)
- No integration test suite (CHANGE-05)
- No pre-commit script validation (CHANGE-06)
- No dependency version locking (CHANGE-07)
- OBS-07 health dashboard blocked by better-sqlite3 bundling in tsdown

### Phase 22 Pre-work Context

SSRF-affected files (from .planning/codebase/CONCERNS.md):

- `src/infra/credential-monitor.ts`
- `src/infra/health-check.ts`
- `src/discord/send.outbound.ts`
- 6+ other files using bare `fetch()` on user-controlled URLs

better-sqlite3 location: currently in devDependencies, used in `db-init.ts`, `crash-logger.ts`, and others — will crash if devDeps pruned.

process.env.HOME sites: 20+ locations across src/ — need to use `resolveEffectiveHomeDir()` instead.

Extension workspace:_ count: 28 extensions have `workspace:_`in`dependencies` — breaks external npm install.

### Pending Todos

None.

### Blockers/Concerns

None. Roadmap defined, ready to execute.

## Session Continuity

Last session: 2026-03-02
Stopped at: v4.0 roadmap defined from vision document 7 priority bets.
Resume with: `/gsd:plan-phase 22`
