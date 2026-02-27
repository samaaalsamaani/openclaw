#!/usr/bin/env bash
#
# Daily tasks executed at 07:00 via launchd
# Logs to stdout (captured by launchd)
#

set -euo pipefail

echo "[daily-tasks] Starting daily tasks at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Get script directory for relative imports
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check credential expiry (7-day notification window)
# Must run BEFORE other API-dependent tasks
echo "[daily-tasks] Checking credential expiry..."
(cd "$PROJECT_ROOT" && node --import tsx -e "import('./src/infra/credential-monitor.ts').then(m => m.checkCredentialExpiry('$HOME/.openclaw/auth-profiles.json'))") || {
    echo "[daily-tasks] WARNING: Credential check failed (non-blocking)"
}

# Run daily health check with alerting
echo "[daily-tasks] Running health check and alert dispatch..."
"$SCRIPT_DIR/daily-alert-check.sh" || {
    echo "[daily-tasks] WARNING: Daily alert check failed (non-blocking)"
}

# Add additional daily tasks here as needed
# Examples:
# - Daily KB backup
# - Observability cleanup
# - Social media posting

echo "[daily-tasks] Daily tasks complete at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
