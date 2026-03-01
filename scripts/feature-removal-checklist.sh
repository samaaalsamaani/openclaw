#!/usr/bin/env bash
# Usage: scripts/feature-removal-checklist.sh <feature-name>
# Checks for remaining references to a removed feature before committing.
# Exit 0 = clean, exit 1 = issues found.

set -euo pipefail

FEATURE="${1:-}"
if [[ -z "$FEATURE" ]]; then
  echo "Usage: $0 <feature-name>" >&2
  echo "Example: $0 mcp-kb-server" >&2
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
TOMBSTONES="$ROOT/docs/reference/tombstones.md"
ISSUES=0

echo "Checking for remaining references to: $FEATURE"
echo ""

# Build grep pattern: feature name + any extra patterns from tombstones.md
PATTERNS=("$FEATURE")
if [[ -f "$TOMBSTONES" ]]; then
  while IFS= read -r line; do
    if echo "$line" | grep -qi "$FEATURE"; then
      patterns_col=$(echo "$line" | awk -F'|' '{print $4}')
      while IFS=',' read -r pat; do
        pat=$(echo "$pat" | tr -d '` ' | xargs 2>/dev/null || true)
        [[ -n "$pat" ]] && PATTERNS+=("$pat")
      done <<< "$patterns_col"
    fi
  done < <(grep '|' "$TOMBSTONES" 2>/dev/null || true)
fi

# Deduplicate (bash 3.2 compatible — no associative arrays)
UNIQUE_PATTERNS=()
for p in "${PATTERNS[@]}"; do
  _dup=0
  for _existing in "${UNIQUE_PATTERNS[@]+"${UNIQUE_PATTERNS[@]}"}"; do
    [[ "$_existing" == "$p" ]] && _dup=1 && break
  done
  [[ $_dup -eq 0 ]] && UNIQUE_PATTERNS+=("$p")
done
GREP_PATTERN=$(IFS='|'; echo "${UNIQUE_PATTERNS[*]}")

check_refs() {
  local label="$1"; shift
  local matches
  matches=$(grep -rl --include="*.ts" --include="*.js" --include="*.json" \
    --include="*.yml" --include="*.yaml" --include="*.sh" \
    -E "$GREP_PATTERN" "$@" 2>/dev/null | grep -v node_modules || true)
  if [[ -n "$matches" ]]; then
    echo "  ⚠  $label"
    echo "$matches" | sed 's/^/     /'
    ISSUES=$((ISSUES + 1))
  else
    echo "  ✓  $label"
  fi
}

echo "[1/6] src/ references"
check_refs "src/" "$ROOT/src"

echo "[2/6] scripts/ references"
check_refs "scripts/" "$ROOT/scripts"

echo "[3/6] .github/ references"
check_refs ".github/" "$ROOT/.github"

echo "[4/6] extensions/ directory"
if [[ -d "$ROOT/extensions/$FEATURE" ]]; then
  echo "  ⚠  extensions/$FEATURE/ still exists"
  ISSUES=$((ISSUES + 1))
else
  echo "  ✓  extensions/$FEATURE/ not present"
fi

echo "[5/6] .github/labeler.yml"
LABELER="$ROOT/.github/labeler.yml"
if [[ -f "$LABELER" ]] && grep -qiE "$GREP_PATTERN" "$LABELER"; then
  echo "  ⚠  Found in .github/labeler.yml"
  ISSUES=$((ISSUES + 1))
else
  echo "  ✓  Not in .github/labeler.yml"
fi

echo "[6/6] tombstones.md (is it documented?)"
if [[ -f "$TOMBSTONES" ]] && grep -qi "$FEATURE" "$TOMBSTONES"; then
  echo "  ✓  Listed in tombstones.md"
else
  echo "  ⚠  Not in docs/reference/tombstones.md — add a row after removal!"
  ISSUES=$((ISSUES + 1))
fi

echo ""
if [[ $ISSUES -eq 0 ]]; then
  echo "✓ All checks passed — safe to commit removal."
  exit 0
else
  echo "⚠ $ISSUES issue(s) found — resolve before committing removal."
  exit 1
fi
