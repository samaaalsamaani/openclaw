#!/usr/bin/env bash
# pre-sync-check.sh — Validate upstream sync safety before merging.
# Reads patched file list, checks if upstream touched any of them,
# and reports conflict risk.
#
# Usage:
#   scripts/pre-sync-check.sh            # fetch + check
#   scripts/pre-sync-check.sh --dry-run  # check only (no merge preview)
#   scripts/pre-sync-check.sh --merge    # check + preview merge (no-commit)

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"

# Patched files (from PATCHES.md "Modified Files" table)
PATCHED_FILES=(
  "src/auto-reply/reply/get-reply.ts"
  "src/memory/manager-sync-ops.ts"
  "src/memory/qmd-manager.ts"
  "package.json"
  "src/config/plugin-auto-enable.ts"
  "apps/macos/Sources/OpenClaw/PermissionManager.swift"
)

# ── Helpers ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}%s${RESET}\n" "$*"; }
ok()    { printf "${GREEN}✓ %s${RESET}\n" "$*"; }
warn()  { printf "${YELLOW}⚠ %s${RESET}\n" "$*"; }
fail()  { printf "${RED}✗ %s${RESET}\n" "$*"; }
header(){ printf "\n${BOLD}%s${RESET}\n" "$*"; }

# ── Parse args ──────────────────────────────────────────────────────────────
DRY_RUN=false
DO_MERGE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --merge)   DO_MERGE=true ;;
    --help|-h)
      echo "Usage: scripts/pre-sync-check.sh [--dry-run] [--merge]"
      echo "  --dry-run   Skip git fetch, check with existing upstream ref"
      echo "  --merge     Preview merge (git merge --no-commit, then abort)"
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Step 1: Fetch upstream ──────────────────────────────────────────────────
header "Step 1: Fetch upstream"

if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
  fail "Remote '$UPSTREAM_REMOTE' not found. Add it with:"
  echo "  git remote add upstream https://github.com/openclaw/openclaw.git"
  exit 1
fi

if [ "$DRY_RUN" = false ]; then
  git fetch "$UPSTREAM_REMOTE" 2>&1 | sed 's/^/  /'
  ok "Fetched $UPSTREAM_REMOTE"
else
  info "Dry run — using existing upstream ref"
fi

# ── Step 2: Find merge base ────────────────────────────────────────────────
header "Step 2: Determine merge base"

MERGE_BASE=$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>/dev/null || true)
if [ -z "$MERGE_BASE" ]; then
  fail "No common ancestor with $UPSTREAM_REMOTE/$UPSTREAM_BRANCH — disjoint histories!"
  exit 1
fi

LOCAL_HEAD=$(git rev-parse --short HEAD)
UPSTREAM_HEAD=$(git rev-parse --short "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")
BASE_SHORT=$(git rev-parse --short "$MERGE_BASE")

info "Local:    $LOCAL_HEAD"
info "Upstream: $UPSTREAM_HEAD"
info "Base:     $BASE_SHORT"

# ── Step 3: Count new upstream commits ──────────────────────────────────────
header "Step 3: New upstream commits"

NEW_COMMITS=$(git log --oneline "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | wc -l | tr -d ' ')

if [ "$NEW_COMMITS" -eq 0 ]; then
  ok "Already up to date — nothing to merge."
  exit 0
fi

info "$NEW_COMMITS new commits upstream:"
git log --oneline "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | head -20 | sed 's/^/  /'
if [ "$NEW_COMMITS" -gt 20 ]; then
  info "  ... and $((NEW_COMMITS - 20)) more"
fi

# ── Step 4: Check patched files for conflicts ───────────────────────────────
header "Step 4: Patched file conflict check"

TOUCHED_COUNT=0
SAFE_COUNT=0

for file in "${PATCHED_FILES[@]}"; do
  # Check if upstream touched this file since merge base
  UPSTREAM_CHANGES=$(git log --oneline "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "$file" | wc -l | tr -d ' ')

  if [ "$UPSTREAM_CHANGES" -gt 0 ]; then
    TOUCHED_COUNT=$((TOUCHED_COUNT + 1))
    warn "$file — TOUCHED by $UPSTREAM_CHANGES upstream commit(s):"
    git log --oneline "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "$file" | sed 's/^/    /'
    echo ""
    info "  Upstream diff:"
    git diff "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "$file" | head -30 | sed 's/^/    /'
    DIFF_LINES=$(git diff "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" -- "$file" | wc -l | tr -d ' ')
    if [ "$DIFF_LINES" -gt 30 ]; then
      info "    ... ($((DIFF_LINES - 30)) more lines, run: git diff $BASE_SHORT..$UPSTREAM_HEAD -- $file)"
    fi
    echo ""
  else
    SAFE_COUNT=$((SAFE_COUNT + 1))
    ok "$file — not touched upstream"
  fi
done

# ── Step 5: Summary ────────────────────────────────────────────────────────
header "Summary"

info "Patched files: ${#PATCHED_FILES[@]} total"
ok "$SAFE_COUNT safe (not touched upstream)"

if [ "$TOUCHED_COUNT" -gt 0 ]; then
  warn "$TOUCHED_COUNT file(s) touched upstream — REVIEW REQUIRED before merge"
  echo ""
  echo "  Next steps:"
  echo "    1. Read the upstream diff for each warned file"
  echo "    2. Check if upstream changes overlap with our patches"
  echo "    3. If overlap: plan re-apply strategy before merging"
  echo "    4. If no overlap: safe to merge, patches will survive"
else
  ok "All patched files are safe — no upstream changes in patched areas"
  echo ""
  printf "  ${GREEN}${BOLD}SAFE TO MERGE${RESET}: git merge $UPSTREAM_REMOTE/$UPSTREAM_BRANCH\n"
fi

# ── Step 6: Optional merge preview ─────────────────────────────────────────
if [ "$DO_MERGE" = true ] && [ "$TOUCHED_COUNT" -gt 0 ]; then
  header "Step 6: Merge preview (--no-commit)"

  if git merge --no-commit --no-ff "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" 2>&1 | sed 's/^/  /'; then
    ok "Merge preview succeeded — no conflicts"
    git merge --abort 2>/dev/null || true
  else
    fail "Merge preview has conflicts:"
    git diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/  /'
    git merge --abort 2>/dev/null || true
  fi
elif [ "$DO_MERGE" = true ]; then
  header "Step 6: Merge preview (--no-commit)"
  ok "Skipped — no patched files were touched, merge is safe"
fi

echo ""
