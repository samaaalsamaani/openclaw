#!/usr/bin/env bash
set -euo pipefail

echo "=== GSD Configuration Validator ==="

# Check .planning/config.json exists
if [[ ! -f .planning/config.json ]]; then
    echo "❌ .planning/config.json not found"
    exit 1
fi

# Validate JSON syntax
if ! jq empty .planning/config.json 2>/dev/null; then
    echo "❌ Invalid JSON in .planning/config.json"
    exit 1
fi

# Check required fields
REQUIRED_FIELDS=(
    ".parallelization"
    ".commit_docs"
    ".model_profile"
    ".workflow.research"
    ".workflow.plan_checker"
    ".workflow.verifier"
    ".workflow.auto_advance"
)

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! jq -e "$field" .planning/config.json >/dev/null 2>&1; then
        echo "❌ Missing required field: $field"
        exit 1
    fi
done

echo "✅ Configuration valid"

# Show current settings
echo ""
echo "Current configuration:"
jq . .planning/config.json
