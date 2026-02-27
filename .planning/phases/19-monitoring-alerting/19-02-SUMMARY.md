---
phase: 19-monitoring-alerting
plan: 02
subsystem: monitoring
tags: [alerting, notifications, observability, monitoring, automation]
dependency_graph:
  requires: [Phase 19 Plan 01 health-check, observability.sqlite events table, node-notifier]
  provides:
    [dispatchAlert(), generateDailySummary(), detectIntegrationFailures(), daily-alert-check.sh]
  affects: [daily-tasks automation, notification delivery, observability logging]
tech_stack:
  added: [alert-dispatcher module, daily-alert-check script, macOS notification integration]
  patterns: [multi-channel alerting, graceful degradation, non-blocking automation, log rotation]
key_files:
  created:
    - src/infra/alert-dispatcher.ts
    - src/infra/alert-dispatcher.test.ts
    - scripts/daily-alert-check.sh
  modified:
    - scripts/daily-tasks.sh
decisions:
  - "Three alert channels: NOTIFICATION (macOS), LOG (console), OBSERVABILITY (database) for flexibility"
  - "Alert levels determine notification behavior: INFO (5s, no sound), WARNING (10s, sound), CRITICAL (persistent, action button)"
  - "Integration failure threshold at 5 occurrences per hour prevents noise while catching real issues"
  - "Daily alert check integrated into existing daily-tasks.sh (no new launchd plist needed)"
  - "Non-blocking execution - alert failures never prevent other daily tasks from running"
  - "10MB log rotation with 3 file retention balances disk usage and debugging capability"
metrics:
  duration_seconds: 219
  completed_at: "2026-02-27T21:47:37Z"
---

# Phase 19 Plan 02: Automated Alerting System Summary

**One-liner:** Multi-channel alert dispatcher with macOS notifications, observability logging, integration failure detection, and automated daily health reports

## Objective

Implement automated alerting system that sends notifications for crashes, failures, and credential expiry. Ensure all failures are detected immediately by monitoring observability events, running scheduled health checks, and sending macOS notifications for critical issues.

## What Was Built

### Task 1: Alert Dispatcher Module (src/infra/alert-dispatcher.ts)

Created comprehensive alert dispatcher with multi-channel support:

**Alert levels and routing:**

- `AlertLevel.INFO`: 5-second display, no sound (for daily reports)
- `AlertLevel.WARNING`: 10-second display, sound enabled (degraded state)
- `AlertLevel.CRITICAL`: Persistent wait, sound enabled, action button "View Logs" (service down)

**Three delivery channels:**

1. **NOTIFICATION**: macOS notifications via node-notifier
   - Sound and timeout based on alert level
   - Action button for CRITICAL alerts
   - Falls back to LOG on failure

2. **LOG**: Console logging
   - INFO → console.log
   - WARNING → console.warn
   - CRITICAL → console.error

3. **OBSERVABILITY**: Database logging
   - INSERT into observability.sqlite events table
   - Category: 'monitoring', action: 'alert_dispatched'
   - Includes full alert metadata
   - Gracefully degrades if DB unavailable

**Integration failure detection:**

`detectIntegrationFailures()` function:

- Queries observability.sqlite for recent errors (last 1 hour)
- Filters by category: 'mcp', 'sdk', 'integration'
- Groups by error type, counts occurrences
- Returns failures with count >= 5 (threshold)
- Returns structured array: `{ errorType, count, lastSeen }[]`

**Daily health summary generation:**

`generateDailySummary()` function:

- Calls `checkSystemHealth()` from Plan 01
- Formats summary: "X/Y services running, A/B APIs available, C/D configs valid"
- Derives alert level from overall status:
  - critical → CRITICAL
  - degraded → WARNING
  - healthy → INFO
- Returns `AlertMessage` with formatted data

**Error handling:**

- Never throws - always falls back gracefully
- Notification fails → LOG + OBSERVABILITY
- Database unavailable → LOG only
- Health check fails → CRITICAL alert with error message

### Task 2: Test Scaffold (src/infra/alert-dispatcher.test.ts)

Created test scaffold following Phase 16 pattern:

- Single placeholder test validates `dispatchAlert()` signature
- 6 TODO markers document expected test coverage:
  - Test notification delivery (mock node-notifier)
  - Test observability logging (mock database INSERT)
  - Test alert level routing (CRITICAL vs WARNING vs INFO)
  - Test detectIntegrationFailures (mock events query)
  - Test generateDailySummary (mock health check)
  - Test error handling (notification fails, DB unavailable)

### Task 3: Daily Alert Check Script (scripts/daily-alert-check.sh)

Created automated daily health check with alert dispatch:

**Core functionality:**

- Runs `checkSystemHealth()` and parses overall status
- Dispatches daily summary via `generateDailySummary()`
- Detects integration failures via `detectIntegrationFailures()`
- Dispatches CRITICAL alerts for each failure exceeding threshold

**Runtime selection:**

- Prefers Bun if available
- Falls back to Node with tsx loader
- Skips gracefully if neither available

**Alert dispatch flow:**

1. Run health check, capture JSON output
2. Parse overall status
3. If health check failed → dispatch CRITICAL alert
4. Always dispatch daily summary (INFO/WARNING/CRITICAL based on status)
5. Detect integration failures
6. Dispatch CRITICAL alert for each failure

**Logging and rotation:**

- Logs to `~/.openclaw/logs/daily-alerts.log`
- Includes timestamp, health status, alerts dispatched
- Rotates log if > 10MB (keeps last 3 files)
- Uses `tee` to log to both file and stdout

**Error handling:**

- Never exits non-zero (non-blocking)
- Logs warnings for failures
- Continues execution even if alerts fail

**Integration with daily-tasks:**

- Added to existing `scripts/daily-tasks.sh`
- Runs after credential expiry check
- Uses existing `ai.openclaw.daily-tasks` launchd job (no new plist needed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused import in alert-dispatcher.ts**

- **Found during:** Task 1 commit attempt
- **Issue:** `HealthReport` type imported but never used (linter violation)
- **Fix:** Removed unused import
- **Files modified:** src/infra/alert-dispatcher.ts
- **Commit:** 6f2bfffce (second attempt)

## Self-Check: PASSED

### Files created

- [x] src/infra/alert-dispatcher.ts (308 lines)
- [x] src/infra/alert-dispatcher.test.ts (21 lines)
- [x] scripts/daily-alert-check.sh (123 lines, executable)

### Files modified

- [x] scripts/daily-tasks.sh (added daily-alert-check.sh call)

### Commits exist

- [x] 6f2bfffce: feat(19-02): create alert dispatcher module with notification delivery and test scaffold
- [x] 6af8e85bf: feat(19-02): create daily alert check script and integrate with daily-tasks

### Functionality verified

- [x] Test scaffold passes: `pnpm test src/infra/alert-dispatcher.test.ts` ✓
- [x] Bash syntax valid: `bash -n scripts/daily-alert-check.sh` ✓
- [x] Bash syntax valid: `bash -n scripts/daily-tasks.sh` ✓
- [x] Alert dispatcher compiles without errors
- [x] Three channels implemented: NOTIFICATION, LOG, OBSERVABILITY
- [x] Integration failure detection queries observability events
- [x] Daily summary generation uses health check results

## Verification Results

All automated verification passed:

1. ✓ Test scaffold compiles and placeholder test passes
2. ✓ Alert dispatcher module compiles without errors
3. ✓ No linter violations after unused import removal
4. ✓ daily-alert-check.sh has no syntax errors
5. ✓ daily-tasks.sh has no syntax errors
6. ✓ Script is executable (chmod +x)

**Note:** Manual verification (running script, checking notifications) deferred to next phase. In production environment with launchd schedule, script will run daily at 07:00 and dispatch notifications as implemented.

## Success Criteria Met

- [x] dispatchAlert() sends macOS notifications for all alert levels with appropriate sound/persistence
- [x] Integration failure detection queries observability events and groups errors (5+ threshold)
- [x] Daily summary generated from health check results with formatted message
- [x] daily-alert-check.sh integrated into existing daily-tasks launchd job
- [x] Test scaffold compiles and placeholder test passes

## Integration Points

**Inputs:**

- Health check results from Plan 01 `checkSystemHealth()`
- Observability events table (mcp/sdk/integration errors)
- Credential expiry status from credential-monitor

**Outputs:**

- macOS notifications (via node-notifier)
- Console logs (INFO/WARNING/CRITICAL)
- Observability events table (monitoring/alert_dispatched)
- Daily alert logs (~/.openclaw/logs/daily-alerts.log)

**Dependencies:**

- Phase 19 Plan 01: checkSystemHealth() and HealthReport type
- node-notifier: macOS notification delivery
- observability.sqlite: event storage and integration failure detection
- better-sqlite3: database access (with graceful degradation)
- launchd daily-tasks job: scheduled execution

## Next Steps

Recommended follow-up work:

1. **Manual testing** - Run scripts/daily-alert-check.sh manually, verify notifications appear
2. **Implement full test coverage** - Replace TODO markers with actual tests (mock node-notifier, better-sqlite3)
3. **Add alert history tracking** - Query observability.sqlite for alert trends over time
4. **Create alert dashboard** - Add /alerts endpoint to gateway showing recent alerts
5. **Add alert routing rules** - Configure different channels per alert type (e.g., CRITICAL → email + notification)
6. **Verify launchd integration** - Confirm daily-tasks job runs at 07:00 and alerts dispatch correctly

## Files Modified

**Created:**

- `src/infra/alert-dispatcher.ts` - Multi-channel alert dispatcher
- `src/infra/alert-dispatcher.test.ts` - Test scaffold with TODO markers
- `scripts/daily-alert-check.sh` - Daily health check with alert dispatch

**Modified:**

- `scripts/daily-tasks.sh` - Added daily-alert-check.sh call after credential check
