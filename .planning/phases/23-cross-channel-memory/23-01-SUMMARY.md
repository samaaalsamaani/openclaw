---
phase: 23-cross-channel-memory
plan: 01
subsystem: memory
tags: [sqlite, fts5, session-indexer, cross-channel, node-sqlite]

requires:
  - phase: 22-platform-foundations
    provides: resolveRequiredHomeDir() for home-dir safety, SSRF guards, peerDeps pattern

provides:
  - CrossChannelIndexer singleton class with start()/sync()/search()/stop() API
  - ensureCrossChannelIndexSchema() for files/chunks/chunks_fts tables
  - FTS5 full-text search index over all session files at ~/.openclaw/agents/<agentId>/cross-channel-memory.sqlite
  - Hash-based incremental sync, cron/subagent exclusion, slash-command filtering
  - Unit test suite (14 tests) covering schema, channel extraction, exclusion, purge, and search

affects:
  - 23-02 (cross-channel context injection needs CrossChannelIndexer.search())
  - 23-03 (memory tool integration reads from this index)

tech-stack:
  added: []
  patterns:
    - "CrossChannelIndexer singleton via module-level Map<string, CrossChannelIndexer> keyed by agentId"
    - "FTS5 external content table with trigram tokenizer and INSERT/UPDATE/DELETE triggers"
    - "Hash-based incremental indexing: skip unchanged files, purge stale entries"
    - "requireNodeSqlite() for node:sqlite access, better-sqlite3 via createRequire for obs writes"
    - "resolveRequiredHomeDir() for home dir (never process.env.HOME)"

key-files:
  created:
    - src/memory/cross-channel-schema.ts
    - src/memory/cross-channel-indexer.ts
    - src/memory/cross-channel-indexer.test.ts
  modified: []

key-decisions:
  - "No vector/embedding column in initial implementation — FTS5 trigram search delivers MEM-01/MEM-05 without embedding dependency"
  - "DB path at ~/.openclaw/agents/<agentId>/cross-channel-memory.sqlite (agent-level, not workspace-level)"
  - "Module-level INDEXER_CACHE Map<string, CrossChannelIndexer> prevents duplicate intervals per agentId"
  - "stop() removes instance from INDEXER_CACHE to allow clean test isolation"
  - "Slash command filter: lines matching /^User:\\s*\\// excluded from indexed text"
  - "Single chunk per file (id = path:0) — chunking can be extended later without schema change"

requirements-completed: [MEM-01, MEM-05]

duration: 5min
completed: 2026-03-02
---

# Phase 23 Plan 01: Cross-Channel Memory Indexer Summary

**SQLite-backed cross-channel session indexer using FTS5 trigram search, with hash-based incremental sync and cron/subagent/slash-command exclusion, stored at ~/.openclaw/agents/<agentId>/cross-channel-memory.sqlite**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T14:43:31Z
- **Completed:** 2026-03-02T14:49:20Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- `ensureCrossChannelIndexSchema()` creates files/chunks/chunks_fts tables with FTS5 trigram tokenizer and sync triggers
- `CrossChannelIndexer` singleton provides `start()` / `sync()` / `search()` / `stop()` API; one instance per agentId via `INDEXER_CACHE`
- `sync()` handles incremental updates (hash comparison), cron/subagent/slash-command exclusion, stale entry purge, and observability event emission
- `search()` performs FTS5 BM25-ranked full-text search with channel exclusion and charBudget truncation
- 14 unit tests cover schema creation, idempotency, channel extraction, slash-command filtering, stale purge, FTS search

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cross-channel SQLite schema** - `78f46cc54` (feat)
2. **Task 2: Implement CrossChannelIndexer singleton** - `01cca4eaf` (feat)
3. **Task 3: Write unit tests for indexer and schema** - `6d8fe4471` (test)

## Files Created/Modified

- `src/memory/cross-channel-schema.ts` — `ensureCrossChannelIndexSchema()`: files, chunks, chunks_fts tables + FTS triggers + indexes
- `src/memory/cross-channel-indexer.ts` — `CrossChannelIndexer` singleton class with full sync/search implementation
- `src/memory/cross-channel-indexer.test.ts` — 14 Vitest unit tests using temp dirs, mocked home-dir and session-files

## CrossChannelIndexer API (for Plan 02 executor)

```typescript
import { CrossChannelIndexer, type CrossChannelSearchResult } from "./cross-channel-indexer.js";

// Get singleton (creates if not exists)
const indexer = CrossChannelIndexer.getInstance("main");

// Start background indexing (5-min interval + immediate sync)
indexer.start();

// Search: exclude current channel, budget 4000 chars
const results: CrossChannelSearchResult[] = indexer.search({
  query: "project timeline",
  excludeChannel: "telegram", // exclude current channel from results
  maxResults: 5,
  charBudget: 4000,
});
// results[].path, .channel, .mtimeMs, .snippet, .score
```

DB path: `~/.openclaw/agents/<agentId>/cross-channel-memory.sqlite`

## Decisions Made

- FTS5 trigram tokenizer chosen over porter/unicode61 for substring/partial-word match capability
- No embedding column in initial schema — keeps indexer dependency-free while delivering MEM-01 and MEM-05
- `stop()` removes from `INDEXER_CACHE` to allow clean test isolation without module reset
- Test mock of `../infra/home-dir.js` redirects all DB paths to temp directory
- Used static ESM imports for `parseAgentSessionKey`/`isCronSessionKey`/`isSubagentSessionKey` in tests (no CJS `require()`)

## Deviations from Plan

None — plan executed exactly as written.

Minor implementation details that differed from plan guidance:

- `emitObsEvent` uses `better-sqlite3` via `createRequire` (same pattern as rest of codebase) rather than the execFile approach in compound-orchestrator.ts, since the indexer already runs in-process
- `stop()` also removes the instance from `INDEXER_CACHE` (plan didn't specify this; added for test isolation)

## Issues Encountered

- Channel extraction tests initially used CJS `require()` inside test bodies, which fails in ESM Vitest — fixed by using static ESM imports at top of test file
- `InstanceType<typeof CrossChannelIndexer>` fails when constructor is private — fixed by using `import("...").CrossChannelIndexer` type directly
- Formatting: `oxfmt` reformatted test file once after initial write; re-ran to clean

## Next Phase Readiness

- `CrossChannelIndexer.getInstance(agentId).start()` is ready to call from agent initialization
- `search()` API is ready for Plan 02's context injection hook
- DB schema is stable; Plan 02 can add FTS queries with channel metadata filtering

## Self-Check: PASSED

- FOUND: src/memory/cross-channel-schema.ts
- FOUND: src/memory/cross-channel-indexer.ts
- FOUND: src/memory/cross-channel-indexer.test.ts
- FOUND: .planning/phases/23-cross-channel-memory/23-01-SUMMARY.md
- FOUND commit 78f46cc54 (feat: schema)
- FOUND commit 01cca4eaf (feat: indexer)
- FOUND commit 6d8fe4471 (test: unit tests)

---

_Phase: 23-cross-channel-memory_
_Completed: 2026-03-02_
