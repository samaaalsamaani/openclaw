#!/usr/bin/env bash
#
# Daily health check with alerting
# Runs health check, detects integration failures, and dispatches alerts
# Logs to ~/.openclaw/logs/daily-alerts.log
#

set -euo pipefail

# Get script directory for relative imports
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Log directory
LOG_DIR="$HOME/.openclaw/logs"
LOG_FILE="$LOG_DIR/daily-alerts.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Log rotation: if log > 10MB, rotate (keep last 3 files)
if [[ -f "$LOG_FILE" ]]; then
    LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo "0")
    if [[ "$LOG_SIZE" -gt 10485760 ]]; then
        echo "[daily-alert-check] Rotating log (size: $LOG_SIZE bytes)" >> "$LOG_FILE"
        [[ -f "$LOG_FILE.2" ]] && rm "$LOG_FILE.2"
        [[ -f "$LOG_FILE.1" ]] && mv "$LOG_FILE.1" "$LOG_FILE.2"
        mv "$LOG_FILE" "$LOG_FILE.1"
    fi
fi

# Log helper
log() {
    local msg="[daily-alert-check][$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

log "Starting daily health check and alert dispatch"

# Check if Bun is available (preferred)
if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"
    log "Using Bun runtime"
elif command -v node >/dev/null 2>&1; then
    RUNTIME="node --import tsx"
    log "Using Node runtime with tsx loader"
else
    log "ERROR: Neither Bun nor Node available, skipping alerts"
    exit 0 # Non-blocking failure
fi

# Run health check and capture JSON output
log "Running health check..."
HEALTH_OUTPUT=$(cd "$PROJECT_ROOT" && $RUNTIME -e "import('./src/infra/health-check.js').then(m => m.checkSystemHealth()).then(r => console.log(JSON.stringify(r)))" 2>/dev/null || echo "{}")

# Parse overall status
OVERALL=$(echo "$HEALTH_OUTPUT" | jq -r '.overall // "unknown"' 2>/dev/null || echo "unknown")
log "Health check overall status: $OVERALL"

# If health check failed, dispatch CRITICAL alert
if [[ "$OVERALL" == "unknown" ]] || [[ -z "$HEALTH_OUTPUT" ]]; then
    log "ERROR: Health check failed, dispatching critical alert"
    cd "$PROJECT_ROOT" && $RUNTIME -e "
        import {dispatchAlert, AlertLevel, AlertChannel} from './src/infra/alert-dispatcher.js';
        await dispatchAlert({
            level: AlertLevel.CRITICAL,
            title: 'PAIOS Health Check Failed',
            message: 'Daily health check could not run - system status unknown',
            source: 'daily-alert-check',
            metadata: { timestamp: new Date().toISOString() }
        }, [AlertChannel.NOTIFICATION, AlertChannel.OBSERVABILITY]);
    " 2>&1 | tee -a "$LOG_FILE" || log "WARNING: Failed to dispatch critical alert"
    exit 0 # Non-blocking
fi

# Dispatch daily summary alert (always)
log "Generating and dispatching daily summary..."
cd "$PROJECT_ROOT" && $RUNTIME -e "
    import {generateDailySummary, dispatchAlert, AlertChannel} from './src/infra/alert-dispatcher.js';
    const summary = await generateDailySummary();
    await dispatchAlert(summary, [AlertChannel.NOTIFICATION, AlertChannel.OBSERVABILITY]);
    console.log('Daily summary dispatched: ' + summary.level);
" 2>&1 | tee -a "$LOG_FILE" || log "WARNING: Failed to dispatch daily summary"

# Detect integration failures
log "Detecting integration failures..."
FAILURES=$(cd "$PROJECT_ROOT" && $RUNTIME -e "
    import {detectIntegrationFailures} from './src/infra/alert-dispatcher.js';
    const failures = await detectIntegrationFailures();
    console.log(JSON.stringify(failures));
" 2>/dev/null || echo "[]")

FAILURE_COUNT=$(echo "$FAILURES" | jq 'length' 2>/dev/null || echo "0")
log "Found $FAILURE_COUNT integration failures"

# If failures detected, dispatch CRITICAL alert for each
if [[ "$FAILURE_COUNT" -gt 0 ]]; then
    log "Dispatching alerts for integration failures..."
    cd "$PROJECT_ROOT" && $RUNTIME -e "
        import {dispatchAlert, AlertLevel, AlertChannel} from './src/infra/alert-dispatcher.js';
        import {detectIntegrationFailures} from './src/infra/alert-dispatcher.js';
        const failures = await detectIntegrationFailures();

        for (const failure of failures) {
            await dispatchAlert({
                level: AlertLevel.CRITICAL,
                title: 'PAIOS Integration Failure Detected',
                message: \`\${failure.errorType} occurred \${failure.count} times in last hour\`,
                source: 'integration-failure-detector',
                metadata: { errorType: failure.errorType, count: failure.count, lastSeen: failure.lastSeen }
            }, [AlertChannel.NOTIFICATION, AlertChannel.OBSERVABILITY]);
            console.log('Alert dispatched for: ' + failure.errorType);
        }
    " 2>&1 | tee -a "$LOG_FILE" || log "WARNING: Failed to dispatch integration failure alerts"
fi

log "Daily alert check complete"
