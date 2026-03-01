# PAIOS Retrospective

## Milestone: v3.0 — System Reliability & Hardening

**Shipped:** 2026-03-01
**Phases:** 4 (16–19 via GSD) | **Plans:** 13 | **Tasks:** 71

### What Was Built

- Crash logging to observability.sqlite with timer tracking and MCP error boundaries
- Memory leak detection (10MB/hr threshold), circuit breakers, embedding server recycling
- Production launchd configs for all 10 services (KeepAlive, ThrottleInterval, ExitTimeOut)
- Exponential backoff retry with error-type classification and AbortController timeouts
- Universal WAL mode + busy_timeout 5000ms across all SQLite databases
- Zod schema validation (strict) for llm-config.json and auth-profiles.json
- Credential monitoring with 7-day expiry warnings + OAuth refresh automation
- auth-profiles.json as single credential source, fail-fast load-env.sh
- Comprehensive health check covering all PAIOS components
- Multi-channel alert dispatcher with daily automated health reports
- Config validate command with dry-run mode + auto-backup (ad-hoc, Phase 21)
- auth-profiles.json write throttle — usage-only updates max 1/5min (ad-hoc, Phase 21)

### What Worked

- **GSD wave parallelization**: Phases 16–19 executed cleanly with minimal deviations. The plan-checker → executor → verifier loop caught most issues before they reached production.
- **Error-type classification**: Distinguishing permanent (400/401/404 fail fast) from transient (ETIMEDOUT/503 retry) errors was the right call — zero false positive retries.
- **Non-singleton database pattern**: Letting callers own connection lifecycle eliminated the "connection reuse across async boundaries" class of bug.
- **Credential check before daily tasks**: Ordering credential validation first in daily-tasks.sh prevented cascading API failures.
- **Three alert channels**: NOTIFICATION + LOG + OBSERVABILITY flexibility proved useful immediately — can silence notifications without losing audit trail.

### What Was Inefficient

- **Phase 20 and 21 were never properly planned via GSD**: Runbooks and integration tests were originally in scope but kept getting deferred. Should have either committed to them or explicitly descoped at Phase 19 completion instead of leaving them as "not started."
- **Ad-hoc work outside GSD**: 21-01 (config validate) and 21-02 (auth throttle) were committed without GSD plans, making them invisible to the tracker. Either use GSD for everything or document the decision to go ad-hoc.
- **better-sqlite3 bundling issue**: The tsdown bundling problem with better-sqlite3 blocked OBS-07 and wasn't resolved — carried forward as tech debt. Should have been a dedicated mini-fix before closing Phase 19.
- **State drift**: STATE.md milestone frontmatter said `v1.0` the entire v3.0 sprint. Fixing this was manual cleanup. GSD tools should auto-update milestone version on milestone start.

### Patterns Established

- `external: ['better-sqlite3']` in tsdown.config.ts is required for any module using the native binding
- Auth-profiles write pattern: force:true for credential changes, throttled for usage updates
- launchd pattern: KeepAlive + SuccessfulExit:false + ThrottleInterval:10 + ExitTimeOut:30 + ProcessType:Background
- MCP tool layering: withErrorBoundary → retryWithBackoff → callWithTimeout → operation

### Key Lessons

1. **Scope gates matter**: Phases 20–21 should have been explicitly dropped or replaced with smaller, shippable tasks rather than left as "planned but not started." Unstarted phases accumulate as cognitive debt.
2. **Track ad-hoc work immediately**: When doing work outside GSD, at minimum create a SUMMARY.md retroactively so it's not invisible.
3. **Cap concurrent sessions**: Claude Max rate limits at 24 concurrent agent sessions. Hard cap waves at 4–5 agents, stagger launches 2–3s apart.
4. **Verify bundling compatibility early**: Native Node modules (better-sqlite3, canvas, etc.) require tsdown external config. Catch this in Phase 00 test scaffolds.

### Cost Observations

- Model mix: Predominantly Sonnet 4.6 for execution, Opus 4.6 for planning/review
- Sessions: High volume (estimated 300+ Claude sessions across v3.0)
- Notable: Rate limits hit on high-parallelism days — 5-hour rolling window, not daily

---

## Cross-Milestone Trends

| Metric          | v1.0       | v2.0       | v3.0                    |
| --------------- | ---------- | ---------- | ----------------------- |
| Phases          | 9          | 6          | 4 (tracked)             |
| Plans           | 29         | 17         | 13                      |
| Shipped         | 2026-02-22 | 2026-02-22 | 2026-03-01              |
| Scope adherence | ~100%      | ~100%      | ~70% (20/21 deferred)   |
| Ad-hoc work     | Low        | Low        | Moderate                |
| Key blocker     | None       | None       | better-sqlite3 bundling |
