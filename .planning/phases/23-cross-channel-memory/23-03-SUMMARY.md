---
phase: 23-cross-channel-memory
plan: 03
subsystem: reply
tags: [cross-channel, attribution, footer, reply-pipeline]

requires:
  - phase: 23-02
    provides: crossChannelContextResult at function scope with sources array

provides:
  - buildAttributionFooter helper function
  - Attribution footer appended to replies drawing on cross-channel context
  - 10 unit tests for footer format, relative time, multi-source, and edge cases

affects:
  - User-visible reply text (footer appended when cross-channel context was injected)

tech-stack:
  added: []
  patterns:
    - "Footer appended post-run: replyResult captured, footer applied before return"
    - "Array payload guard: findIndex on toReversed() to find last non-error text payload"

key-files:
  created:
    - src/auto-reply/reply/cross-channel-attribution.ts
    - src/auto-reply/reply/cross-channel-attribution.test.ts
  modified:
    - src/auto-reply/reply/get-reply-run.ts

key-decisions:
  - "Attribution appended only when sources.length > 0 (no-op when no cross-channel context was used)"
  - "Array branch guards on !r.isError to avoid appending footer to error replies"
  - "relativeTime and capitalize helpers duplicated from cross-channel-context.ts intentionally — files kept independent"

requirements-completed:
  - MEM-03

duration: 3min
completed: 2026-03-02
---

# Phase 23 Plan 03: Attribution Footer Summary

**buildAttributionFooter() wired into get-reply-run.ts reply pipeline — replies drawing on cross-channel history end with "— drawing on context from Telegram (3 days ago)"**

## Performance

- **Duration:** 3 min
- **Completed:** 2026-03-02
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `buildAttributionFooter()` — pure function mapping `AttributionSource[]` → footer string
- Wired into `get-reply-run.ts`: footer appended to reply text after agent run, using `crossChannelContextResult.sources` from Plan 02
- 10 unit tests covering empty array, single source, multi-source, relative time variations, and capitalization
- Footer guard: only appended when `sources.length > 0` and `text` is a non-empty string
- Array payload: applied to last non-error text payload via `toReversed().findIndex()`

## End-to-End Cross-Channel Reply Flow

1. **Index (23-01):** `CrossChannelIndexer.sync()` reads session JSONL files, hashes, filters slash commands, upserts to FTS5-backed SQLite
2. **Retrieve (23-02):** `queryCrossChannelContext()` runs FTS5 search against indexed sessions (400ms timeout), builds `--- CROSS-CHANNEL CONTEXT ---` prompt section with labeled channel snippets
3. **Inject (23-02):** Context section appended to `extraSystemPrompt` array in `runPreparedReply()` before agent run
4. **Reply (runtime):** Agent receives cross-channel context in system prompt, can draw on it when composing reply
5. **Attribute (23-03):** After agent run, `buildAttributionFooter(sources)` builds footer from source channels/mtimes and appends to reply text

## Task Commits

1. **Task 1: Create buildAttributionFooter helper and tests** - `4098ae5cd` (feat)
2. **Task 2: Wire attribution footer into get-reply-run.ts** - `c50eeb275` (feat)

## Files Created/Modified

- `src/auto-reply/reply/cross-channel-attribution.ts` — `buildAttributionFooter`, `AttributionSource` type, private `capitalize`/`relativeTime` helpers
- `src/auto-reply/reply/cross-channel-attribution.test.ts` — 10 unit tests
- `src/auto-reply/reply/get-reply-run.ts` — import added, attribution block applied to return value

## Deviations from Plan

None — plan executed exactly as written.

## Post-Review Fixes Applied

The following issues were identified in code review and fixed after initial implementation:

- **FTS5 sanitization**: Added `buildFtsQuery()` from `hybrid.ts` before MATCH to prevent syntax errors on special input like `"NOT query"` or `"{column}"`
- **setInterval unref**: Added `.unref?.()` after `setInterval` in `CrossChannelIndexer.start()` to allow clean process exit
- **Schema re-check**: Added `_schemaEnsured` flag to skip repeated `ensureCrossChannelIndexSchema()` calls on every `search()`
- **Array isError guard**: Added `!r.isError` to `findIndex` predicate in array attribution branch to avoid appending footer to error replies

## Self-Check: PASSED

- FOUND: src/auto-reply/reply/cross-channel-attribution.ts
- FOUND: src/auto-reply/reply/cross-channel-attribution.test.ts
- FOUND: .planning/phases/23-cross-channel-memory/23-03-SUMMARY.md
- FOUND: commit 4098ae5cd (Task 1)
- FOUND: commit c50eeb275 (Task 2)

---

_Phase: 23-cross-channel-memory_
_Completed: 2026-03-02_
