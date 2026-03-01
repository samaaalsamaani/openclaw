#!/usr/bin/env bash
# scripts/housekeeping-audit.sh
# Comprehensive housekeeping audit. Exit 0 = clean, exit 1 = issues found.
# Run manually: bash scripts/housekeeping-audit.sh
# Run in CI: same command, exit code gates the workflow.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TOMBSTONES="$ROOT/docs/reference/tombstones.md"
TOTAL_ISSUES=0

pass() { echo "  ✓  $1"; }
warn() { echo "  ⚠  $1"; TOTAL_ISSUES=$((TOTAL_ISSUES + 1)); }

# ---------- 1. Root file allowlist ----------
echo "=== [1/6] Root file allowlist ==="

ALLOWED=(
  AGENTS.md CHANGELOG.md CLAUDE.md CONTRIBUTING.md LICENSE PATCHES.md
  README.md SECURITY.md VISION.md setup-podman.sh docs.acp.md
  package.json pnpm-lock.yaml pnpm-workspace.yaml
  tsconfig.json tsconfig.plugin-sdk.dts.json tsdown.config.ts
  vitest.config.ts vitest.e2e.config.ts vitest.extensions.config.ts
  vitest.gateway.config.ts vitest.live.config.ts vitest.unit.config.ts
  zizmor.yml appcast.xml render.yaml fly.toml fly.private.toml
  docker-compose.yml docker-setup.sh pyproject.toml openclaw.mjs openclaw.podman.env
  Dockerfile Dockerfile.sandbox Dockerfile.sandbox-browser Dockerfile.sandbox-common
  knip.json
)
_root_issues=0
while IFS= read -r entry; do
  [[ -d "$ROOT/$entry" ]] && continue
  [[ "$entry" == .* ]] && continue
  _in_list=0
  for _a in "${ALLOWED[@]}"; do
    [[ "$_a" == "$entry" ]] && _in_list=1 && break
  done
  if [[ $_in_list -eq 0 ]]; then
    warn "Unexpected root file: $entry"
    _root_issues=1
  fi
done < <(ls "$ROOT")
[[ $_root_issues -eq 0 ]] && pass "Root is clean"

# ---------- 2. Stale untracked docs/plans/ ----------
echo ""
echo "=== [2/6] Untracked docs/plans/ files older than 3 days ==="

_stale_found=0
while IFS= read -r _f; do
  [[ -z "$_f" ]] && continue
  _mtime=$(stat -f %m "$ROOT/$_f" 2>/dev/null || stat -c %Y "$ROOT/$_f" 2>/dev/null || echo 0)
  _age=$(( ( $(date +%s) - _mtime ) / 86400 ))
  if [[ $_age -gt 3 ]]; then
    warn "$_f (${_age}d old)"
    _stale_found=1
  fi
done < <(git -C "$ROOT" ls-files --others --exclude-standard docs/plans/ 2>/dev/null)
[[ $_stale_found -eq 0 ]] && pass "No stale untracked plan docs"

# ---------- 3. Empty extension directories ----------
echo ""
echo "=== [3/6] Empty extension directories ==="

_empty_found=0
for dir in "$ROOT/extensions"/*/; do
  [[ -d "$dir" ]] || continue
  name=$(basename "$dir")
  tracked=$(git -C "$ROOT" ls-files "extensions/$name/" 2>/dev/null)
  if [[ -z "$tracked" ]]; then
    warn "extensions/$name/ has no tracked files"
    _empty_found=1
  fi
done
[[ $_empty_found -eq 0 ]] && pass "All extension dirs have tracked files"

# ---------- 4. Dead references (tombstones) ----------
echo ""
echo "=== [4/6] Dead references to removed features ==="

_dead_found=0
if [[ -f "$TOMBSTONES" ]]; then
  while IFS='|' read -r _ feature _ patterns _; do
    feature=$(echo "$feature" | xargs 2>/dev/null || true)
    patterns=$(echo "$patterns" | xargs 2>/dev/null || true)
    [[ -z "$feature" || "$feature" == "Feature" || "$feature" =~ ^-+$ ]] && continue
    [[ -z "$patterns" ]] && continue
    grep_pat=$(echo "$patterns" | tr ',' '\n' | sed 's/[`[:space:]]//g' | tr '\n' '|' | sed 's/|$//')
    [[ -z "$grep_pat" ]] && continue
    matches=$(grep -rl --include="*.ts" --include="*.js" --include="*.sh" \
      -E "$grep_pat" "$ROOT/src" "$ROOT/scripts" 2>/dev/null \
      | grep -v node_modules || true)
    if [[ -n "$matches" ]]; then
      warn "Dead ref to '$(echo "$feature" | xargs)': $(echo "$matches" | tr '\n' ' ')"
      _dead_found=1
    fi
  done < "$TOMBSTONES"
  [[ $_dead_found -eq 0 ]] && pass "No dead references found"
else
  warn "tombstones.md not found — create docs/reference/tombstones.md"
fi

# ---------- 5. One-off scripts ----------
echo ""
echo "=== [5/6] One-off scripts ==="

_oneoff_found=0
while IFS= read -r f; do
  warn "$f"
  _oneoff_found=1
done < <(find "$ROOT/scripts" -maxdepth 2 -type f \
  \( -name "*-repro.*" -o -name "*-compare.*" -o -name "*-results.*" \) 2>/dev/null \
  | sed "s|$ROOT/||" | sort)
[[ $_oneoff_found -eq 0 ]] && pass "No one-off scripts found"

# ---------- 6. Stale merged branches ----------
echo ""
echo "=== [6/6] Stale merged branches (>30 days) ==="

_cutoff=$(date -d "30 days ago" +%s 2>/dev/null || date -v-30d +%s 2>/dev/null || echo 0)
_stale_branch_found=0
while IFS= read -r branch; do
  branch="${branch#  }"
  branch=$(echo "$branch" | sed 's|origin/||' | xargs)
  [[ "$branch" =~ ^(main|beta|dev|HEAD)$ ]] && continue
  [[ -z "$branch" ]] && continue
  _merged_date=$(git log -1 --format="%ct" "origin/$branch" 2>/dev/null || echo 0)
  if [[ "$_merged_date" -lt "$_cutoff" && "$_merged_date" -gt 0 ]]; then
    warn "Stale branch: $branch"
    _stale_branch_found=1
  fi
done < <(git branch -r --merged origin/main 2>/dev/null | grep -v HEAD || true)
[[ $_stale_branch_found -eq 0 ]] && pass "No stale merged branches"

# ---------- Summary ----------
echo ""
echo "================================"
if [[ $TOTAL_ISSUES -eq 0 ]]; then
  echo "✓ Housekeeping audit: CLEAN"
  exit 0
else
  echo "⚠ Housekeeping audit: $TOTAL_ISSUES issue(s) found"
  exit 1
fi
