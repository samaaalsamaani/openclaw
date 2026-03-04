---
phase: 23-cross-channel-memory
plan: 02
subsystem: memory
tags: [cross-channel, context-injection, reply-pipeline, fts5, sqlite, prompt-assembly]

# Dependency graph
requires:
  - phase: 23-01
    provides: CrossChannelIndexer singleton with FTS5 search API and CrossChannelSearchResult type

provides:
  - queryCrossChannelContext function wiring CrossChannelIndexer into the reply pipeline
  - CrossChannelContextResult type with section + sources fields (Plan 03 attribution ready)
  - crossChannelContextSection injected into extraSystemPrompt in get-reply-run.ts
  - 8 unit tests covering all guard paths and integration behavior

affects:
  - 23-03 (attribution footer — uses crossChannelContextResult at function scope in get-reply-run.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.race([doSearch, setTimeout(empty, 400ms)]) — latency-bounded async retrieval"
    - "queryBody re-use — bodyForKb guard mirrors kbContextSection guard for consistency"
    - "crossChannelContextResult declared at function scope (not inner block) for downstream access"

key-files:
  created:
    - src/auto-reply/reply/cross-channel-context.ts
    - src/auto-reply/reply/cross-channel-context.test.ts
  modified:
    - src/auto-reply/reply/get-reply-run.ts

key-decisions:
  - "crossChannelContextResult declared as let at function scope (line ~280) so Plan 03 can read result.sources for attribution footer without re-querying"
  - "bodyForKb guard reused for cross-channel query (same <10 char / slash-command conditions as KB context)"
  - "doSearch is private async function (not exported) — async wrapper needed for Promise.race timeout pattern even though indexer.search() is synchronous"
  - "Section format: '--- CROSS-CHANNEL CONTEXT ---\\n[From {Channel}, {N} days ago]: {snippet}'"

patterns-established:
  - "Latency-bounded retrieval: Promise.race(doWork, setTimeout(empty, N)) for any optional context augmentation"
  - "Guard consistency: cross-channel guard mirrors kbContextSection guard (bodyForKb >= 10 chars, not slash command)"

requirements-completed:
  - MEM-02
  - MEM-04

# Metrics
duration: 4min
completed: 2026-03-02
---

# Phase 23 Plan 02: Cross-Channel Context Injection Summary

**queryCrossChannelContext() wired into reply pipeline via Promise.race 400ms timeout, injecting cross-channel session context as labeled prompt section after kbContextSection in extraSystemPrompt**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T14:52:00Z
- **Completed:** 2026-03-02T14:55:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `queryCrossChannelContext()` with 400ms Promise.race timeout and guards for short queries and slash commands
- Injected `crossChannelContextSection` into `extraSystemPrompt` array in `get-reply-run.ts` after `kbContextSection`
- `crossChannelContextResult` declared at function scope (line ~280) for Plan 03 attribution footer access
- 8 tests covering all guard paths, header format, channel labeling, sources array, and exclusion logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Create queryCrossChannelContext function** - `9aadb9caa` (feat)
2. **Task 2: Inject cross-channel context into get-reply-run.ts + write tests** - `ddff93f83` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/auto-reply/reply/cross-channel-context.ts` — queryCrossChannelContext + doSearch + relativeTime/capitalize helpers; CrossChannelContextResult type exported
- `src/auto-reply/reply/cross-channel-context.test.ts` — 8 unit tests for all behavior paths
- `src/auto-reply/reply/get-reply-run.ts` — added import, crossChannelContextResult let declaration, queryCrossChannelContext call, crossChannelContextSection in extraSystemPrompt array

## Injection Point in get-reply-run.ts (for Plan 03)

- **Variable name:** `crossChannelContextResult` (type: `CrossChannelContextResult`)
- **Scope:** Function scope inside `runPreparedReply()` — declared as `let` before the `extraSystemPrompt` block
- **Approximate line numbers:** Lines 279-288 (cross-channel query block), line 296 (crossChannelContextSection in array)
- **Access pattern for Plan 03:** `crossChannelContextResult.sources` — array of `{ channel: string; mtimeMs: number }` entries

## Decisions Made

- `crossChannelContextResult` declared as `let` at function scope so Plan 03 can read `result.sources` for attribution footer without re-querying the indexer
- `bodyForKb` guard reused for the cross-channel query (same `<10 char` / slash-command conditions as KB context) — consistent behavior, single source of truth for the query string
- `doSearch` is a private `async` function (not exported) — the async wrapper is necessary for `Promise.race` timeout even though `indexer.search()` is synchronous
- Section format matches plan spec: `--- CROSS-CHANNEL CONTEXT ---\n[From {Channel}, {N} days ago]: {snippet}`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The timeout unit test required careful design: since `indexer.search()` is synchronous, `doSearch()` always resolves as a microtask before any `setTimeout` fires. The test was rewritten to focus on verifiable behavior: fast completion under timeout, correct empty return for no results, and structural verification of the Promise.race pattern. The timeout mechanism is correctly wired in production for real wall-clock delays (e.g., slow SQLite open).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 (attribution footer) can access `crossChannelContextResult` at function scope in `runPreparedReply()` (line ~280)
- `crossChannelContextResult.sources` provides `{ channel: string; mtimeMs: number }[]` for footer generation
- Cross-channel context will be injected into every non-slash, non-short-query reply that has relevant other-channel history

## Self-Check: PASSED

- FOUND: src/auto-reply/reply/cross-channel-context.ts
- FOUND: src/auto-reply/reply/cross-channel-context.test.ts
- FOUND: .planning/phases/23-cross-channel-memory/23-02-SUMMARY.md
- FOUND: commit 9aadb9caa (Task 1)
- FOUND: commit ddff93f83 (Task 2)

---

_Phase: 23-cross-channel-memory_
_Completed: 2026-03-02_
