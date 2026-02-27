---
phase: 18-data-integrity-config-safety
plan: "01"
subsystem: infra
tags: [sqlite, wal, zod, config-validation, backup-restore, data-integrity]

# Dependency graph
requires:
  - phase: 16-service-hardening
    provides: Crash logger pattern with singleton database connections
provides:
  - Universal database initialization with WAL mode and busy_timeout
  - Config validation with Zod schemas and automatic backup restore
  - Strict mode validation for llm-config.json and auth-profiles.json
  - Early corruption detection in openclaw.json loader
affects: [19-credential-monitoring, database-migrations, config-management]

# Tech tracking
tech-stack:
  added: [zod]
  patterns:
    - Non-singleton database initialization for flexible connection lifecycle
    - Synchronous config validation with backup restore
    - Strict Zod schemas rejecting unknown keys

key-files:
  created:
    - src/infra/db-init.ts
    - src/infra/db-init.test.ts
    - src/infra/config-validator.ts
    - src/infra/config-validator.test.ts
  modified:
    - src/agents/llm-config-reader.ts
    - src/config/io.ts

key-decisions:
  - Non-singleton database pattern lets callers manage connection lifecycle (different services need different lifetimes)
  - Graceful WAL enablement degradation - logs warning but doesn't crash if WAL fails (optimization, not requirement)
  - Synchronous and async validation functions for different config loader patterns
  - Strict mode on LlmConfigSchema and AuthProfilesSchema to catch typos, passthrough on OpenClawConfigSchema (100+ fields)

patterns-established:
  - Database initialization: Always call initDatabase() instead of new Database() directly
  - Config validation: Wrap config loads with loadConfigWithValidationSync/Async for corruption protection
  - Backup discovery: findBackups() searches numbered backups sorted by mtime (newest first)

requirements-completed: [DATA-01, DATA-02, DATA-06]

# Metrics
duration: 1107s
completed: 2026-02-27
---

# Phase 18 Plan 01: Data Integrity & Config Safety Summary

**Universal SQLite WAL initialization and Zod-based config validation with automatic backup restore**

## Performance

- **Duration:** 18 min 27 sec
- **Started:** 2026-02-27T20:10:07Z
- **Completed:** 2026-02-27T20:28:34Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Universal database initialization helper ensures all SQLite databases use WAL mode + 5000ms busy_timeout
- Config validation with Zod schemas catches corruption before it crashes Gateway
- Automatic backup restore tries numbered backups (newest first) when main config is invalid
- Strict mode validation rejects unknown keys (catches typos like "modles" instead of "models")
- All integration transparent to existing code (validation is additive)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create universal database initialization helper** - `6432ef031` (feat)
2. **Task 2: Create config validation with backup restore** - `9bf2b517a` (feat)
3. **Task 3: Integrate validation into config loaders** - `1e4085cff` (feat)

## Files Created/Modified

**Created:**

- `src/infra/db-init.ts` - Universal database initialization with WAL + busy_timeout
- `src/infra/db-init.test.ts` - Module interface validation tests (4 tests)
- `src/infra/config-validator.ts` - Zod schemas and backup restore logic
- `src/infra/config-validator.test.ts` - Schema validation tests (17 tests)

**Modified:**

- `src/agents/llm-config-reader.ts` - Integrated LlmConfigSchema validation with backup restore
- `src/config/io.ts` - Added early OpenClawConfigSchema validation before complex processing

## Decisions Made

**Non-singleton database pattern:** Different services need different connection lifetimes. Embedding server needs recycling, Gateway needs long-lived, tests need isolated instances. Callers manage lifecycle instead of global singleton.

**Graceful WAL degradation:** WAL mode is an optimization, not a requirement. If WAL enable fails, log warning but don't crash. Busy_timeout always applied (works regardless of journal mode).

**Sync + async validation:** Config loaders use different patterns (llm-config-reader is sync, config IO has async paths). Provide both loadConfigWithValidationSync() and loadConfigWithValidation() for flexibility.

**Strict mode strategy:** LlmConfigSchema and AuthProfilesSchema use strict() to reject unknown keys (catches typos). OpenClawConfigSchema uses passthrough() (100+ fields, defer complete typing).

## Deviations from Plan

None - plan executed exactly as written.

The plan specified creating sync validation if config loaders use synchronous patterns. Found llm-config-reader.ts is synchronous, created loadConfigWithValidationSync() alongside async version.

## Issues Encountered

**TypeScript type challenges:**

- ZodError.errors property not typed - used type assertions with eslint-disable
- better-sqlite3 import type missing - used `any` type for Database (dynamic require pattern)
- LlmConfig type mismatch with Zod schema output - added explicit cast with comment

All resolved via type assertions and comments explaining the dynamic module loading patterns.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Foundation complete for Phase 18-02 (credential monitoring):

- Database initialization pattern established for observability.sqlite
- Config validation ready for auth-profiles.json monitoring
- Backup restore mechanism available for credential recovery

No blockers. Ready to proceed to credential expiry detection and refresh automation.

## Self-Check: PASSED

All created files verified:

- src/infra/db-init.ts
- src/infra/db-init.test.ts
- src/infra/config-validator.ts
- src/infra/config-validator.test.ts

All commits verified:

- 6432ef031 (Task 1)
- 9bf2b517a (Task 2)
- 1e4085cff (Task 3)

---

_Phase: 18-data-integrity-config-safety_
_Completed: 2026-02-27_
