---
phase: 29-db-knowledge-leverage
plan: 02
subsystem: hooks
tags: [memgraph, neo4j-driver, graph-context, rag, system-prompt, bundled-hook]

# Dependency graph
requires:
  - phase: 29-01
    provides: neo4j-driver installed at workspace root, hybrid KB search pattern
  - phase: 23-02
    provides: Promise.race latency-bounded context injection pattern, extraSystemPrompt assembly in get-reply-run.ts
provides:
  - queryGraphContext() exported from src/hooks/bundled/graph-context/handler.ts
  - graph-context bundled hook registered for message:received events
  - graphContextSection injected into extraSystemPrompt in get-reply-run.ts via 3s Promise.race
affects: [auto-reply, hooks, agent system prompt, Memgraph integration]

# Tech tracking
tech-stack:
  added: [neo4j-driver (v6, dynamic import for test isolation)]
  patterns:
    [dynamic import for optional runtime deps, Promise.race 3s latency-bounded Memgraph query]

key-files:
  created:
    - src/hooks/bundled/graph-context/handler.ts
    - src/hooks/bundled/graph-context/handler.test.ts
    - src/hooks/bundled/graph-context/HOOK.md
  modified:
    - src/auto-reply/reply/get-reply-run.ts

key-decisions:
  - "neo4j.auth.basic('','') used instead of auth.none() — auth.none() not present in neo4j-driver v6 API"
  - "Dynamic import of neo4j-driver inside queryGraphContext() to prevent test env failures when driver not available"
  - "Hook handler fires on message:received for future extensibility; graph context injection is handled directly in get-reply-run.ts via queryGraphContext() import"
  - "3s Promise.race timeout (same latency-bound approach as cross-channel context's 400ms, but relaxed for graph traversal)"
  - "Word extraction: strip non-alphanumeric, split on whitespace, filter words >=4 chars, take top 5 — avoids stopword noise"

patterns-established:
  - "Graph RAG pattern: bodyForKb guard (>=10 chars, not slash-command) + Promise.race 3s + graceful empty-string fallback"
  - "Bundled hook dual role: fires for extensibility while primary injection happens via direct import in get-reply-run.ts"

requirements-completed: [LEVER-02, LEVER-05]

# Metrics
duration: 15min
completed: 2026-03-04
---

# Phase 29 Plan 02: Graph-Context Hook Summary

**Memgraph entity/decision context injected into agent system prompt via queryGraphContext() with 3s latency-bounded neo4j-driver query on every non-trivial inbound message**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-04T22:16:00Z
- **Completed:** 2026-03-04T22:28:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created graph-context bundled hook at `src/hooks/bundled/graph-context/handler.ts` with `queryGraphContext()` export and `HookHandler` default export
- HOOK.md created for bundled-dir.ts discovery (event: message:received)
- 4 unit tests pass: default function export, ignores non-message events, handles message:received without throwing, skips messages <10 chars
- `queryGraphContext()` wired into `get-reply-run.ts` after `crossChannelContextSection` with 3s Promise.race timeout
- Messages <10 chars or starting with "/" are silently skipped; Memgraph unreachable returns "" and reply proceeds normally

## Task Commits

Each task was committed atomically:

1. **Task 1: Create graph-context bundled hook scaffold with failing tests** - `f02ed0aa4` (feat)
2. **Task 2: Wire queryGraphContext into get-reply-run.ts extraSystemPrompt** - `1555d7f3f` (feat)

## Files Created/Modified

- `src/hooks/bundled/graph-context/handler.ts` - HookHandler default export + queryGraphContext() for Memgraph entity/decision lookup
- `src/hooks/bundled/graph-context/handler.test.ts` - 4 unit tests covering guard behaviors
- `src/hooks/bundled/graph-context/HOOK.md` - Hook documentation for bundled-dir.ts discovery
- `src/auto-reply/reply/get-reply-run.ts` - Added queryGraphContext import + graphContextSection in extraSystemPrompt array

## Decisions Made

- Used `neo4j.auth.basic("", "")` instead of `auth.none()` — auth.none() was removed in neo4j-driver v6 API (deviation: Rule 1 bug fix during Task 1 TDD)
- Dynamic import of `neo4j-driver` inside `queryGraphContext()` body prevents import failures in test environments that don't have Memgraph available
- Hook handler fires on `message:received` for future extensibility, but the primary graph context injection is via direct `queryGraphContext()` call in `get-reply-run.ts` — matches the cross-channel context pattern from Phase 23

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed neo4j.auth.none() API not present in neo4j-driver v6**

- **Found during:** Task 1 (TDD RED phase, running tests)
- **Issue:** Plan specified `neo4j.auth.none()` but neo4j-driver v6 removed this method; only `auth.basic()`, `auth.bearer()`, `auth.kerberos()` are available
- **Fix:** Changed to `neo4j.auth.basic("", "")` for Memgraph's no-auth mode; updated test mock to match `auth.basic` instead of `auth.none`
- **Files modified:** src/hooks/bundled/graph-context/handler.ts, handler.test.ts
- **Verification:** Tests pass with corrected mock; no TypeScript errors on handler
- **Committed in:** f02ed0aa4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Necessary correctness fix for neo4j-driver v6 API. No scope creep.

## Issues Encountered

- neo4j-driver v6 dropped `auth.none()` method — required switching to `auth.basic("", "")` for Memgraph's unauthenticated mode. Caught during TDD RED phase, fixed before GREEN.

## User Setup Required

None - no external service configuration required. Memgraph must be running on bolt://localhost:7687 for graph context to function; if unreachable, query returns "" silently.

## Next Phase Readiness

- Graph context injection is live: every agent reply with non-trivial message body now has Memgraph entity/decision context in its system prompt
- LEVER-02 and LEVER-05 requirements complete
- Ready for Phase 29-03 (graph-context-enrichment or next db-knowledge-leverage plan)

---

_Phase: 29-db-knowledge-leverage_
_Completed: 2026-03-04_

## Self-Check: PASSED

- FOUND: src/hooks/bundled/graph-context/handler.ts
- FOUND: src/hooks/bundled/graph-context/handler.test.ts
- FOUND: src/hooks/bundled/graph-context/HOOK.md
- FOUND: .planning/phases/29-db-knowledge-leverage/29-02-SUMMARY.md
- FOUND: commit f02ed0aa4 (feat: add graph-context bundled hook handler with tests)
- FOUND: commit 1555d7f3f (feat: inject graph context into agent system prompt via queryGraphContext)
- FOUND: graphContextSection appears 3 times in get-reply-run.ts (declaration, assignment, array entry)
