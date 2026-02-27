#!/usr/bin/env bash
#
# PAIOS Health Check CLI
#
# Runs comprehensive health checks on all system components and displays
# formatted results. Returns exit code based on overall health status.
#
# Exit codes:
#   0 = healthy (all checks pass)
#   1 = degraded (non-critical failures)
#   2 = critical (core services or config failures)

set -euo pipefail

# Color codes for output (portable using tput)
GREEN=$(tput setaf 2)
YELLOW=$(tput setaf 3)
RED=$(tput setaf 1)
RESET=$(tput sgr0)

# Health check symbols
CHECK_OK="${GREEN}✓${RESET}"
CHECK_WARN="${YELLOW}!${RESET}"
CHECK_FAIL="${RED}✗${RESET}"

# Get project root (script is in scripts/, source is in src/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Create temporary wrapper script in project root for proper import resolution
TEMP_WRAPPER="${PROJECT_ROOT}/.health-check-wrapper.mjs"
trap 'rm -f "${TEMP_WRAPPER}"' EXIT

cat > "${TEMP_WRAPPER}" << 'WRAPPER_EOF'
import { checkSystemHealth } from './src/infra/health-check.js';
const report = await checkSystemHealth();
console.log(JSON.stringify(report, null, 2));
WRAPPER_EOF

# Run health check using the appropriate runner
# Redirect stderr to a temp file to avoid mixing with JSON output
TEMP_STDERR=$(mktemp)
trap 'rm -f "${TEMP_WRAPPER}" "${TEMP_STDERR}"' EXIT

if command -v bun &>/dev/null; then
  HEALTH_JSON=$(cd "${PROJECT_ROOT}" && bun "${TEMP_WRAPPER}" 2>"${TEMP_STDERR}")
  EXIT_CODE=$?
else
  # Use node with tsx loader for TypeScript support
  HEALTH_JSON=$(cd "${PROJECT_ROOT}" && node --import tsx "${TEMP_WRAPPER}" 2>"${TEMP_STDERR}")
  EXIT_CODE=$?
fi

# Check for execution errors
if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo "${RED}Error: Health check execution failed${RESET}" >&2
  echo "${HEALTH_JSON}" >&2
  exit 2
fi

# Parse JSON report using node (available everywhere)
OVERALL=$(echo "${HEALTH_JSON}" | node -e "const report = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(report.overall);")
TIMESTAMP=$(echo "${HEALTH_JSON}" | node -e "const report = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(report.timestamp);")

# Format timestamp for display
DISPLAY_TIME=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$(echo "${TIMESTAMP}" | cut -d'.' -f1)" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "${TIMESTAMP}")

# Print header
echo ""
echo "PAIOS Health Check (${DISPLAY_TIME})"
echo ""

# Format and print services section
echo "Services:"
echo "${HEALTH_JSON}" | node -e "
const report = JSON.parse(require('fs').readFileSync(0, 'utf8'));
for (const svc of report.services) {
  const status = svc.running ? '${CHECK_OK}' : '${CHECK_FAIL}';
  const detail = svc.running
    ? (svc.pid ? \`(pid \${svc.pid})\` : '(scheduled)')
    : (svc.lastExitCode !== undefined ? \`(not running, last exit: \${svc.lastExitCode})\` : '(not running)');
  console.log(\`  \${status} \${svc.name} \${detail}\`);
}
"

echo ""

# Format and print APIs section
echo "APIs:"
echo "${HEALTH_JSON}" | node -e "
const report = JSON.parse(require('fs').readFileSync(0, 'utf8'));
for (const api of report.apis) {
  const status = api.available ? '${CHECK_OK}' : '${CHECK_FAIL}';
  const detail = api.available
    ? \`(\${api.statusCode}, \${api.latency_ms}ms)\`
    : (api.error ? \`(\${api.error.slice(0, 40)})\` : '(unavailable)');
  console.log(\`  \${status} \${api.name} \${detail}\`);
}
"

echo ""

# Format and print databases section
echo "Databases:"
echo "${HEALTH_JSON}" | node -e "
const report = JSON.parse(require('fs').readFileSync(0, 'utf8'));
for (const db of report.databases) {
  const status = db.accessible ? '${CHECK_OK}' : '${CHECK_FAIL}';
  const detail = db.accessible
    ? \`(\${db.wal_enabled ? 'WAL' : 'DELETE'}, \${db.size_mb}MB)\`
    : (db.error ? \`(\${db.error.slice(0, 40)})\` : '(inaccessible)');
  console.log(\`  \${status} \${db.name} \${detail}\`);
}
"

echo ""

# Format and print configs section
echo "Configs:"
echo "${HEALTH_JSON}" | node -e "
const report = JSON.parse(require('fs').readFileSync(0, 'utf8'));
for (const cfg of report.configs) {
  const status = cfg.valid ? '${CHECK_OK}' : '${CHECK_FAIL}';
  const detail = cfg.valid ? '' : \`(validation error: \${cfg.error?.slice(0, 60)})\`;
  console.log(\`  \${status} \${cfg.name} \${detail}\`);
}
"

echo ""

# Print overall status with color
case "${OVERALL}" in
  healthy)
    echo "Overall: ${GREEN}HEALTHY${RESET}"
    exit 0
    ;;
  degraded)
    echo "Overall: ${YELLOW}DEGRADED${RESET}"
    exit 1
    ;;
  critical)
    echo "Overall: ${RED}CRITICAL${RESET}"
    exit 2
    ;;
  *)
    echo "Overall: ${RED}UNKNOWN${RESET}"
    exit 2
    ;;
esac
