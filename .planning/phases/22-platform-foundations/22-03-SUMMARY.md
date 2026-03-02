---
phase: 22-platform-foundations
plan: "03"
subsystem: infra
tags: [home-dir, process.env, portability, paths, sqlite, mcp-servers]

requires: []
provides:
  - "All 31 process.env.HOME sites in production src/ replaced with resolveRequiredHomeDir()"
  - "4 module-level constants converted to lazy functions (call-time evaluation)"
  - "Hardcoded /Users/user developer path bug removed from mcp-servers.ts"
  - "Tilde expansion uses expandHomePrefix() not manual string replace"
affects: [23-cross-channel-memory]

tech-stack:
  added: []
  patterns:
    - "resolveRequiredHomeDir() for all path construction needing $HOME"
    - "expandHomePrefix() for tilde expansion instead of .replace(/^~/, process.env.HOME)"
    - "Module-level path constants → lazy getter functions when env-dependent"

key-files:
  modified:
    - src/agents/compound-orchestrator.ts
    - src/agents/task-decomposer.ts
    - src/agents/autonomy-enforcer.ts
    - src/gateway/channel-events.ts
    - src/infra/alert-dispatcher.ts
    - src/infra/crash-logger.ts
    - src/infra/status-dashboard.ts
    - src/infra/health-check.ts
    - src/agents/conversation-learner.ts
    - src/agents/llm-config-reader.ts
    - src/agents/sdk-runner/mcp-servers.ts
    - src/agents/task-classifier.ts
    - src/agents/verification.ts
    - src/agents/opencode-zen-models.ts
    - src/imessage/monitor/monitor-provider.ts
    - src/auto-reply/reply/commands-export-session.ts
    - src/wizard/onboarding.completion.ts
    - src/cli/completion-cli.ts
    - src/commands/doctor-platform-notes.ts

key-decisions:
  - "Module-level constants converted to functions (not just inline replacements) to preserve call-time evaluation and test isolation"
  - "Test harness files left untouched — they intentionally mutate process.env.HOME for isolation"
  - "os.homedir() imports removed from files where resolveRequiredHomeDir() made them unused"

patterns-established:
  - "All env-dependent path construction uses resolveRequiredHomeDir() evaluated at call time, never module scope"
  - "Tilde paths use expandHomePrefix() from home-dir.ts"

requirements-completed:
  - FOUND-04

duration: ~45min
completed: 2026-03-02
---

# Phase 22-03: HOME Dir Resolution Summary

**All 31 process.env.HOME production sites replaced with resolveRequiredHomeDir(); 4 module-level constants converted to lazy functions; hardcoded /Users/user developer path bug fixed**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-03-02
- **Tasks:** 2 (module-level constants, remaining inline sites) + test run
- **Files modified:** 19

## Accomplishments

- Replaced all 31 `process.env.HOME` references in production `src/` — zero remain outside test harnesses and `home-dir.ts` itself
- Converted 4 module-level constants to lazy functions: `getObsDbPath()` in `compound-orchestrator.ts` and `task-decomposer.ts`, `autonomy-enforcer.ts`, `getDbDir()` in `channel-events.ts` — preserving call-time evaluation for test isolation
- Fixed hardcoded `/Users/user` fallback in `mcp-servers.ts` (line 419) — replaced with `resolveRequiredHomeDir()`
- Converted 2 tilde-expansion sites to `expandHomePrefix()`: `imessage/monitor-provider.ts`, `commands-export-session.ts`
- Removed now-unused `os` imports from `wizard/onboarding.completion.ts`, `cli/completion-cli.ts`, `commands/doctor-platform-notes.ts`

## Task Commits

1. **Task 1: Module-level constants → lazy functions** — `46c68af46` (fix)
2. **Task 2: Remaining inline sites** — `2148f444d` (fix)

## Files Created/Modified

- `src/agents/compound-orchestrator.ts` — `OBS_DB_PATH` const → `getObsDbPath()` function
- `src/agents/task-decomposer.ts` — `OBS_DB_PATH` const → `getObsDbPath()` function
- `src/agents/autonomy-enforcer.ts` — `HOME` const removed; path.join uses `resolveRequiredHomeDir()` inline
- `src/gateway/channel-events.ts` — `DB_DIR` const → `getDbDir()` function
- `src/infra/alert-dispatcher.ts` — 2 inline sites replaced
- `src/infra/crash-logger.ts` — 1 inline site replaced
- `src/infra/status-dashboard.ts` — 1 inline site replaced
- `src/infra/health-check.ts` — 8 inline sites replaced
- `src/agents/conversation-learner.ts` — 2 inline sites replaced
- `src/agents/llm-config-reader.ts` — 1 inline site replaced
- `src/agents/sdk-runner/mcp-servers.ts` — 2 sites replaced; `/Users/user` hardcode removed
- `src/agents/task-classifier.ts` — 1 inline site replaced
- `src/agents/verification.ts` — 1 inline site replaced
- `src/agents/opencode-zen-models.ts` — 1 inline site replaced
- `src/imessage/monitor/monitor-provider.ts` — tilde expansion → `expandHomePrefix()`
- `src/auto-reply/reply/commands-export-session.ts` — tilde expansion → `expandHomePrefix()`
- `src/wizard/onboarding.completion.ts` — os.homedir fallback → `resolveRequiredHomeDir()`; `os` import removed
- `src/cli/completion-cli.ts` — 2 os.homedir fallback sites → `resolveRequiredHomeDir()`; `os` import removed
- `src/commands/doctor-platform-notes.ts` — os.homedir fallback → `resolveRequiredHomeDir()`; `os` import removed

## Decisions Made

- **Function conversion (not inline):** Module-level constants had to become functions, not just inline replacements. If left as module-level with `resolveRequiredHomeDir()`, they'd still evaluate once at import — tests mutating `process.env.HOME` after import would see the original value.
- **Test harnesses excluded:** `src/gateway/test-helpers.server.ts` and `src/agents/models-config.e2e-harness.ts` intentionally set `process.env.HOME` — left unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

Zero `process.env.HOME` in production code. Path resolution is portable and test-safe. Ready for Phase 23.

---

_Phase: 22-platform-foundations_
_Completed: 2026-03-02_
