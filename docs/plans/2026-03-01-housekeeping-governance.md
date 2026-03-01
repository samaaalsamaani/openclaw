# Housekeeping Governance System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a five-layer housekeeping governance system that prevents session artifact accumulation, catches dead code after feature removal, and runs automated monthly audits.

**Architecture:** Shell scripts for prevention/detection/protocol (portable bash, no deps), `knip` for dead TS export analysis, one GitHub Action for scheduled audit + branch cleanup. All layers build on a central `tombstones.md` file that serves as the canonical list of removed features.

**Tech Stack:** bash, `knip` (dead export detection), GitHub Actions, `git-hooks/pre-commit` (existing hook infrastructure)

---

## Task 1: Create `docs/reference/tombstones.md`

The foundation — all audit scripts read this file for grep patterns. Create it first so Tasks 2 and 3 can reference it.

**Files:**

- Create: `docs/reference/tombstones.md`

**Step 1: Create the file**

```markdown
# Feature Tombstones

Canonical list of removed features. Audit scripts read grep patterns from this file.
Add a row whenever a feature is removed. Run `scripts/feature-removal-checklist.sh <name>` first.

| Feature            | Removed    | Grep Patterns                                                            |
| ------------------ | ---------- | ------------------------------------------------------------------------ |
| mcp-kb-server      | 2026-02-28 | `mcp-kb-server`, `mcp-server.js`                                         |
| google-antigravity | 2026-02-23 | `google-antigravity`, `antigravity`                                      |
| kuzu / graph-sync  | 2026-02-28 | `kuzu`, `KuzuDB`, `graph-sync-hot`, `graph-sync-warm`, `graph-sync-cold` |
```

**Step 2: Commit**

```bash
git add docs/reference/tombstones.md
git commit -m "docs: add tombstones.md — canonical removed feature registry"
```

---

## Task 2: Create `scripts/feature-removal-checklist.sh`

Run this before committing any feature removal. It checks all the places a feature name can linger and exits 1 if anything is found.

**Files:**

- Create: `scripts/feature-removal-checklist.sh`

**Step 1: Create the script**

```bash
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

# Deduplicate
UNIQUE_PATTERNS=()
declare -A _seen
for p in "${PATTERNS[@]}"; do
  if [[ -z "${_seen[$p]+x}" ]]; then
    UNIQUE_PATTERNS+=("$p")
    _seen[$p]=1
  fi
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
```

**Step 2: Make executable**

```bash
chmod +x scripts/feature-removal-checklist.sh
```

**Step 3: Smoke-test with a known-clean feature name**

```bash
scripts/feature-removal-checklist.sh google-antigravity
```

Expected output:

```
Checking for remaining references to: google-antigravity

[1/6] src/ references         ✓  src/
[2/6] scripts/ references     ✓  scripts/
[3/6] .github/ references     ✓  .github/
[4/6] extensions/ directory   ✓  extensions/google-antigravity-auth/ not present
[5/6] .github/labeler.yml     ✓  Not in .github/labeler.yml
[6/6] tombstones.md           ✓  Listed in tombstones.md

✓ All checks passed — safe to commit removal.
```

**Step 4: Commit**

```bash
git add scripts/feature-removal-checklist.sh
git commit -m "feat(housekeeping): add feature-removal-checklist script"
```

---

## Task 3: Create `scripts/housekeeping-audit.sh`

The core audit script — replicates everything we did manually on 2026-03-01. Run anytime, or via the monthly Action.

**Files:**

- Create: `scripts/housekeeping-audit.sh`

**Step 1: Create the script**

```bash
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
  docker-compose.yml pyproject.toml openclaw.mjs openclaw.podman.env
  knip.json
)
declare -A _ALLOWED_MAP
for f in "${ALLOWED[@]}"; do _ALLOWED_MAP[$f]=1; done

_root_issues=0
while IFS= read -r entry; do
  [[ -d "$ROOT/$entry" ]] && continue
  [[ "$entry" == .* ]] && continue
  if [[ -z "${_ALLOWED_MAP[$entry]+x}" ]]; then
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
    grep_pat=$(echo "$patterns" | tr ',' '\n' | sed 's/[`[:space:]]//g' | paste -sd '|')
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
```

**Step 2: Make executable**

```bash
chmod +x scripts/housekeeping-audit.sh
```

**Step 3: Run a smoke test (should be clean after Task 1+2 cleanup is done)**

```bash
bash scripts/housekeeping-audit.sh
```

Expected: All 6 sections pass. If issues remain from the cleanup plan, they'll show here. Fix them before continuing.

**Step 4: Commit**

```bash
git add scripts/housekeeping-audit.sh
git commit -m "feat(housekeeping): add housekeeping-audit script (6 checks)"
```

---

## Task 4: Add allowlist + stale-docs checks to `git-hooks/pre-commit`

The pre-commit hook lives at `git-hooks/pre-commit` and is installed via `git config core.hooksPath git-hooks` (run automatically by `pnpm prepare`). The hook already collects staged files into `$files`. Append two checks at the end of the file.

**Files:**

- Modify: `git-hooks/pre-commit` (append to end)

**Step 1: Read the current hook end to confirm the append point**

The hook currently ends with:

```bash
git add -- "${files[@]}"
```

**Step 2: Append the two checks after the final `git add` line**

Add to `git-hooks/pre-commit`:

```bash

# --- Root file allowlist (FAIL if unexpected root-level file staged) ---
_ROOT_ALLOWED=(
  AGENTS.md CHANGELOG.md CLAUDE.md CONTRIBUTING.md LICENSE PATCHES.md
  README.md SECURITY.md VISION.md setup-podman.sh docs.acp.md
  package.json pnpm-lock.yaml pnpm-workspace.yaml
  tsconfig.json tsconfig.plugin-sdk.dts.json tsdown.config.ts
  vitest.config.ts vitest.e2e.config.ts vitest.extensions.config.ts
  vitest.gateway.config.ts vitest.live.config.ts vitest.unit.config.ts
  zizmor.yml appcast.xml render.yaml fly.toml fly.private.toml
  docker-compose.yml pyproject.toml openclaw.mjs openclaw.podman.env
  knip.json
)
declare -A _root_ok
for _f in "${_ROOT_ALLOWED[@]}"; do _root_ok[$_f]=1; done

_root_bad=()
for _f in "${files[@]}"; do
  # Root-level file: no slash, not a dotfile
  if [[ "$_f" != */* && "$_f" != .* ]]; then
    if [[ -z "${_root_ok[$_f]+x}" ]]; then
      _root_bad+=("$_f")
    fi
  fi
done

if [[ ${#_root_bad[@]} -gt 0 ]]; then
  echo "" >&2
  echo "❌ Root file allowlist violation — these files are not allowed at repo root:" >&2
  for _f in "${_root_bad[@]}"; do echo "   $_f" >&2; done
  echo "" >&2
  echo "Move docs to docs/plans/ or docs/reference/." >&2
  echo "To add a file to the allowlist, edit git-hooks/pre-commit (_ROOT_ALLOWED)" >&2
  echo "and scripts/housekeeping-audit.sh (ALLOWED) together." >&2
  exit 1
fi

# --- Stale untracked docs/plans/ (WARN, non-blocking) ---
if command -v stat >/dev/null 2>&1; then
  _stale_warn=()
  while IFS= read -r _uf; do
    [[ -z "$_uf" ]] && continue
    _mtime=$(stat -f %m "$ROOT_DIR/$_uf" 2>/dev/null || stat -c %Y "$ROOT_DIR/$_uf" 2>/dev/null || echo 0)
    _age=$(( ( $(date +%s) - _mtime ) / 86400 ))
    [[ $_age -gt 2 ]] && _stale_warn+=("$_uf (${_age}d)")
  done < <(git ls-files --others --exclude-standard docs/plans/ 2>/dev/null)
  if [[ ${#_stale_warn[@]} -gt 0 ]]; then
    echo "" >&2
    echo "⚠ Untracked docs/plans/ files older than 2 days:" >&2
    for _uf in "${_stale_warn[@]}"; do echo "   $_uf" >&2; done
    echo "  → Commit them or delete them before they accumulate." >&2
    echo "" >&2
  fi
fi
```

**Step 3: Test the allowlist check (dry run)**

Stage a fake root file and confirm the hook blocks it:

```bash
echo "test" > TEST-SESSION-ARTIFACT.md
git add TEST-SESSION-ARTIFACT.md
git commit -m "test" --no-verify=false  # runs the hook
```

Expected: Hook exits with `❌ Root file allowlist violation — TEST-SESSION-ARTIFACT.md`

Then clean up:

```bash
git restore --staged TEST-SESSION-ARTIFACT.md
rm TEST-SESSION-ARTIFACT.md
```

**Step 4: Commit the hook changes**

```bash
git add git-hooks/pre-commit
git commit -m "feat(housekeeping): add root allowlist + stale-docs checks to pre-commit"
```

---

## Task 5: Add PAIOS artifact patterns to `.gitignore`

Prevent specific PAIOS session output filename patterns from ever being committed at root. These are patterns too specific to ever be a legitimate openclaw file.

**Files:**

- Modify: `.gitignore`

**Step 1: Find the end of `.gitignore` and append**

Add to the bottom of `.gitignore`:

```gitignore

# PAIOS session artifacts — these filename patterns should never live at repo root
# They indicate an AI planning session output was accidentally staged.
/*-CONFIGURED-SUCCESS.md
/*-API-TEST-RESULTS.md
/*-STATUS-REPORT.md
/*-SUBSCRIPTION-AUDIT.md
/*-COMPLETION-REPORT.md
/*-INFRASTRUCTURE-ANALYSIS.md
/*-CAPABILITIES-AUDIT-PLAN.md
```

Note: The `/` prefix means "root only" — these patterns only apply to the repo root, not subdirectories.

**Step 2: Verify gitignore works**

```bash
echo "test" > GEMINI-CONFIGURED-SUCCESS.md
git status GEMINI-CONFIGURED-SUCCESS.md
```

Expected: File is not shown as untracked (gitignored).

```bash
rm GEMINI-CONFIGURED-SUCCESS.md
```

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore PAIOS session artifact filename patterns at root"
```

---

## Task 6: Install and configure `knip`

`knip` finds unused TypeScript files, exports, and dependencies across the monorepo. Install it, configure it, run it once to establish a baseline.

**Files:**

- Create: `knip.json`
- Modify: `package.json` (add `knip` script)

**Step 1: Install knip as a dev dependency**

```bash
pnpm add -D knip
```

**Step 2: Create `knip.json` at repo root**

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": [
    "src/index.ts",
    "src/entry.ts",
    "src/extensionAPI.ts",
    "src/cli/**/*.ts",
    "src/commands/**/*.ts",
    "scripts/**/*.ts",
    "scripts/**/*.mjs"
  ],
  "project": ["src/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs"],
  "ignore": [
    "**/*.test.ts",
    "**/*.e2e.test.ts",
    "**/*.live.test.ts",
    "src/test-helpers/**",
    "src/test-utils/**",
    "src/types/**"
  ],
  "ignoreDependencies": ["@types/*"],
  "workspaces": {
    "extensions/*": {
      "entry": ["src/index.ts", "index.ts"],
      "project": ["src/**/*.ts", "*.ts"]
    },
    "packages/*": {
      "entry": ["src/index.ts", "index.ts"],
      "project": ["src/**/*.ts"]
    }
  }
}
```

**Step 3: Add `knip` script to `package.json`**

In `package.json`, find the `"scripts"` section and add:

```json
"knip": "knip",
```

**Step 4: Run knip and review output**

```bash
pnpm knip 2>&1 | head -60
```

Expected: A list of potentially unused files/exports. Review carefully — knip may surface false positives for:

- Plugin entry points (extensions that get dynamically loaded)
- Files that are runtime-required via string paths

For each false positive, add it to the `ignore` array in `knip.json`.

**Step 5: Commit baseline config**

```bash
git add knip.json package.json pnpm-lock.yaml
git commit -m "feat(housekeeping): add knip for dead TypeScript export detection"
```

---

## Task 7: Create `docs/reference/extension-lifecycle.md`

Documents the extension lifecycle so removal steps are never missed.

**Files:**

- Create: `docs/reference/extension-lifecycle.md`

**Step 1: Create the file**

````markdown
# Extension Lifecycle

Extensions live in `extensions/<name>/` as pnpm workspace packages.

## Creating an Extension

1. `mkdir -p extensions/<name>/src`
2. Create `extensions/<name>/package.json` with `openclaw` in `devDependencies`
3. Add to `.github/labeler.yml` with matching file patterns
4. Create the GitHub label: `gh label create "ext/<name>" --color "#0075ca"`
5. Implement in `extensions/<name>/src/index.ts`

## Removing an Extension

Run these steps in order — do not skip any.

1. **Check for references first:**
   ```bash
   scripts/feature-removal-checklist.sh <name>
   ```
````

Fix every issue it reports before continuing.

2. **Remove the directory:**

   ```bash
   git rm -r extensions/<name>/
   ```

3. **Remove from labeler:**
   Edit `.github/labeler.yml` — delete the `<name>` block.

4. **Delete the GitHub label:**

   ```bash
   gh label delete "ext/<name>"
   ```

5. **Document in tombstones:**
   Add a row to `docs/reference/tombstones.md`:

   ```
   | <name> | YYYY-MM-DD | `<name>`, any other grep patterns |
   ```

6. **Commit:**
   ```bash
   git commit -m "chore(extensions): remove <name>"
   ```

## Checklist (copy-paste)

```
[ ] scripts/feature-removal-checklist.sh <name>  → 0 issues
[ ] git rm -r extensions/<name>/
[ ] .github/labeler.yml entry removed
[ ] gh label delete "ext/<name>"
[ ] docs/reference/tombstones.md row added
[ ] committed
```

````

**Step 2: Commit**

```bash
git add docs/reference/extension-lifecycle.md
git commit -m "docs: add extension lifecycle reference with removal checklist"
````

---

## Task 8: Create `.github/workflows/housekeeping.yml`

Monthly audit + weekly stale branch report. Opens GitHub issues with results. Uses `GITHUB_TOKEN` (no app token needed — issue creation only).

**Files:**

- Create: `.github/workflows/housekeeping.yml`

**Step 1: Create the workflow**

````yaml
name: Housekeeping

on:
  schedule:
    - cron: "0 9 1-7 * 1" # Monthly: first Monday, 09:00 UTC
    - cron: "0 22 * * 0" # Weekly:  every Sunday, 22:00 UTC
  workflow_dispatch:
    inputs:
      check:
        description: "Which check to run"
        required: false
        default: "all"
        type: choice
        options: [all, audit, branches]

permissions:
  contents: read

jobs:
  # ── Monthly housekeeping audit ──────────────────────────────────────────
  audit:
    name: Housekeeping audit
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.schedule == '0 9 1-7 * 1'
    runs-on: ubuntu-latest
    permissions:
      issues: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run audit
        id: audit
        run: |
          chmod +x scripts/housekeeping-audit.sh
          set +e
          output=$(bash scripts/housekeeping-audit.sh 2>&1)
          exit_code=$?
          set -e
          {
            echo "output<<AUDIT_EOF"
            echo "$output"
            echo "AUDIT_EOF"
            echo "exit_code=$exit_code"
          } >> "$GITHUB_OUTPUT"

      - name: Open issue if issues found
        if: steps.audit.outputs.exit_code != '0'
        uses: actions/github-script@v7
        with:
          script: |
            const date = new Date().toISOString().slice(0, 10);
            const output = `${{ steps.audit.outputs.output }}`;
            const count = (output.match(/⚠/g) || []).length;
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `chore: monthly housekeeping audit — ${date} (${count} issues)`,
              body: [
                '## Housekeeping Audit Report',
                '',
                '```',
                output,
                '```',
                '',
                'Run `bash scripts/housekeeping-audit.sh` locally to reproduce.',
                'Update `docs/reference/housekeeping-log.md` when resolved.',
              ].join('\n'),
              labels: ['housekeeping'],
            });

      - name: Log clean run
        if: steps.audit.outputs.exit_code == '0'
        run: echo "✓ Audit clean — no issue opened."

  # ── Weekly stale branch report ──────────────────────────────────────────
  stale-branches:
    name: Stale branch report
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event.schedule == '0 22 * * 0'
    runs-on: ubuntu-latest
    permissions:
      issues: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Find stale branches
        id: branches
        run: |
          CUTOFF=$(date -d "30 days ago" --iso-8601 2>/dev/null \
            || date -v-30d +%Y-%m-%d 2>/dev/null \
            || echo "1970-01-01")
          STALE=""
          while IFS= read -r branch; do
            branch=$(echo "$branch" | sed 's|origin/||' | xargs)
            case "$branch" in main|beta|dev|HEAD|"") continue ;; esac
            last=$(git log -1 --format="%ci" "origin/$branch" 2>/dev/null | cut -c1-10 || true)
            [[ -z "$last" ]] && continue
            [[ "$last" < "$CUTOFF" ]] && STALE="$STALE $branch"
          done < <(git branch -r --merged origin/main 2>/dev/null | grep -v HEAD || true)
          STALE="${STALE# }"
          echo "stale=$STALE" >> "$GITHUB_OUTPUT"
          echo "count=$(echo "$STALE" | wc -w | xargs)" >> "$GITHUB_OUTPUT"

      - name: Open issue if stale branches found
        if: steps.branches.outputs.stale != ''
        uses: actions/github-script@v7
        with:
          script: |
            const branches = `${{ steps.branches.outputs.stale }}`.trim().split(/\s+/).filter(Boolean);
            const date = new Date().toISOString().slice(0, 10);
            const deleteCmd = `git push origin --delete ${branches.join(' \\\n  ')}`;
            const body = [
              '## Stale Merged Branches',
              '',
              'These branches are merged to `main` and older than 30 days:',
              '',
              ...branches.map(b => `- \`${b}\``),
              '',
              'To delete them all (review first):',
              '```bash',
              `git push origin --delete \\`,
              ...branches.map((b, i) => `  ${b}${i < branches.length - 1 ? ' \\' : ''}`),
              '```',
            ].join('\n');
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `chore: stale branch cleanup — ${date} (${branches.length} branches)`,
              body,
              labels: ['housekeeping'],
            });

      - name: Log clean run
        if: steps.branches.outputs.stale == ''
        run: echo "✓ No stale branches — no issue opened."
````

**Step 2: Commit**

```bash
git add .github/workflows/housekeeping.yml
git commit -m "ci: add monthly housekeeping audit + weekly stale branch workflow"
```

---

## Task 9: Create `docs/reference/housekeeping-log.md`

Running history of audit results. One row per audit, updated manually when closing the housekeeping issue.

**Files:**

- Create: `docs/reference/housekeeping-log.md`

**Step 1: Create the file**

```markdown
# Housekeeping Log

Updated when each monthly housekeeping issue is closed.
Run `bash scripts/housekeeping-audit.sh` to generate a new report.

| Date       | Issues Found | Issues Resolved | Notes                                                       |
| ---------- | ------------ | --------------- | ----------------------------------------------------------- |
| 2026-03-01 | 24           | 24              | Initial audit — session artifacts, dead refs, repro scripts |
```

**Step 2: Commit**

```bash
git add docs/reference/housekeeping-log.md
git commit -m "docs: add housekeeping-log (running audit history)"
```

---

## Task 10: Update `AGENTS.md` with housekeeping protocols

Make the three new protocols official so agents always follow them. `AGENTS.md` is the source — `CLAUDE.md` is a symlink to it.

**Files:**

- Modify: `AGENTS.md`

**Step 1: Add to Commit & Pull Request Guidelines section (line ~59)**

After the existing bullet `- Group related changes; avoid bundling unrelated refactors.`, add:

```markdown
- Before committing a root-level `.md`, verify it's in the root allowlist (pre-commit hook enforces this; `scripts/housekeeping-audit.sh` [1/6] also checks).
```

**Step 2: Add new Feature Removal section after Commit & PR Guidelines**

```markdown
## Feature Removal

When removing any feature, provider, or extension:

1. Run `scripts/feature-removal-checklist.sh <name>` — fix all issues it reports.
2. Add a row to `docs/reference/tombstones.md` with grep patterns.
3. For extensions, follow `docs/reference/extension-lifecycle.md` checklist.
```

**Step 3: Add to Testing Guidelines section (line ~53)**

After the existing testing bullets, add:

```markdown
- Run `pnpm knip` before PRs that remove or rename significant exports.
```

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add housekeeping protocols — root allowlist, feature removal, knip"
```

---

## Task 11: Create the `housekeeping` GitHub label

The workflow opens issues with this label. Create it before the first scheduled run.

**Step 1: Create the label**

```bash
gh label create "housekeeping" \
  --color "e4e669" \
  --description "Scheduled maintenance and cleanup" \
  --repo openclaw/openclaw
```

Expected: `✓ Label "housekeeping" created`

**Step 2: Verify**

```bash
gh label list --repo openclaw/openclaw | grep housekeeping
```

Expected: `housekeeping   Scheduled maintenance and cleanup   #e4e669`

---

## Final Verification

Run the full audit to confirm all layers are working:

```bash
# 1. Audit script runs clean
bash scripts/housekeeping-audit.sh

# 2. knip runs (review output, not blocking)
pnpm knip 2>&1 | head -30

# 3. Pre-commit hook catches violations
echo "test" > BAD-SESSION-ARTIFACT.md
git add BAD-SESSION-ARTIFACT.md
git diff --cached --name-only  # should list it
git restore --staged BAD-SESSION-ARTIFACT.md
rm BAD-SESSION-ARTIFACT.md

# 4. Confirm all reference docs exist
ls docs/reference/

# 5. Confirm workflow file exists
ls .github/workflows/housekeeping.yml

# 6. Confirm AGENTS.md has new sections
grep -A3 "Feature Removal" AGENTS.md
```

All green = governance system is live.
