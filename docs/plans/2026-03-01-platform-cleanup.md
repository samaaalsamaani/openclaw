# Platform Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove 17 PAIOS session artifact docs from root, relocate 2 docs to proper paths, commit 7 orphaned plan files, fix 1 dead code reference, delete 1 empty extension dir, and remove 4 one-off scripts.

**Architecture:** Three atomic commits — root-level cleanup, docs/plans commit, then source/script fixes. No code changes except removing a dead entry from `generate-mcp-plists.ts`.

**Tech Stack:** git, TypeScript (one file edit)

---

## Task 1: Delete 17 root-level session artifact docs

These were accidentally committed in `68cbbfd0b` alongside a validator script. They are PAIOS session outputs with no relevance to the openclaw codebase. None are referenced anywhere in src/, CI, or scripts.

**Files:**
- Delete: `AI-SUBSCRIPTION-AUDIT.md`
- Delete: `ARCHITECTURE-VALIDATION-PLAN.md`
- Delete: `ARCHITECTURE-VALIDATION-REPORT.md`
- Delete: `AUDIT-COMPLETE-SUMMARY.md`
- Delete: `CLAUDE-CLI-SPEED-ANALYSIS.md`
- Delete: `CODEX-CLI-SUCCESS.md`
- Delete: `COMPLETE-LLM-INFRASTRUCTURE-ANALYSIS.md`
- Delete: `COMPLETION-REPORT.md`
- Delete: `FINAL-SUBSCRIPTION-SUMMARY.md`
- Delete: `GEMINI-API-SETUP.md`
- Delete: `GEMINI-CONFIGURED-SUCCESS.md`
- Delete: `GEMINI-STATUS-REPORT.md`
- Delete: `LLM-CAPABILITIES-AUDIT-PLAN.md`
- Delete: `LLM-REFERENCE-GUIDE.md`
- Delete: `OPENAI-API-TEST-RESULTS.md`
- Delete: `OPTIMIZED-API-ROUTING-IMPLEMENTATION.md`
- Delete: `PHASE1-CLI-INVENTORY-RESULTS.md`

**Step 1: Delete all 17 files**

```bash
git rm AI-SUBSCRIPTION-AUDIT.md \
       ARCHITECTURE-VALIDATION-PLAN.md \
       ARCHITECTURE-VALIDATION-REPORT.md \
       AUDIT-COMPLETE-SUMMARY.md \
       CLAUDE-CLI-SPEED-ANALYSIS.md \
       CODEX-CLI-SUCCESS.md \
       COMPLETE-LLM-INFRASTRUCTURE-ANALYSIS.md \
       COMPLETION-REPORT.md \
       FINAL-SUBSCRIPTION-SUMMARY.md \
       GEMINI-API-SETUP.md \
       GEMINI-CONFIGURED-SUCCESS.md \
       GEMINI-STATUS-REPORT.md \
       LLM-CAPABILITIES-AUDIT-PLAN.md \
       LLM-REFERENCE-GUIDE.md \
       OPENAI-API-TEST-RESULTS.md \
       OPTIMIZED-API-ROUTING-IMPLEMENTATION.md \
       PHASE1-CLI-INVENTORY-RESULTS.md
```

Expected: 17 files staged for deletion.

**Step 2: Verify nothing remains that shouldn't**

```bash
ls *.md
```

Expected: Only `AGENTS.md`, `CHANGELOG.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `INTELLIGENCE-EVOLUTION-MASTER-PLAN.md`, `PATCHES.md`, `README.md`, `ROUTER-TROUBLESHOOTING.md`, `SECURITY.md`, `VISION.md`

---

## Task 2: Move 2 docs to correct locations

`INTELLIGENCE-EVOLUTION-MASTER-PLAN.md` is a real 2066-line planning doc — it belongs in `docs/plans/`. `ROUTER-TROUBLESHOOTING.md` is a useful ops reference — it belongs in `docs/reference/`.

**Files:**
- Move: `INTELLIGENCE-EVOLUTION-MASTER-PLAN.md` → `docs/plans/2026-02-27-intelligence-evolution-master-plan.md`
- Move: `ROUTER-TROUBLESHOOTING.md` → `docs/reference/router-troubleshooting.md`

**Step 1: Create docs/reference/ if needed and move both files**

```bash
mkdir -p docs/reference
git mv INTELLIGENCE-EVOLUTION-MASTER-PLAN.md docs/plans/2026-02-27-intelligence-evolution-master-plan.md
git mv ROUTER-TROUBLESHOOTING.md docs/reference/router-troubleshooting.md
```

**Step 2: Verify moves are staged**

```bash
git status --short | grep -E "^R"
```

Expected: Two lines showing the renames.

**Step 3: Commit tasks 1 and 2 together**

```bash
git commit -m "chore: remove root-level session artifact docs, move two to proper paths

Deletes 17 PAIOS audit/session outputs accidentally committed in 68cbbfd0b.
Moves INTELLIGENCE-EVOLUTION-MASTER-PLAN.md to docs/plans/ and
ROUTER-TROUBLESHOOTING.md to docs/reference/."
```

---

## Task 3: Commit 7 orphaned plan docs, delete 1 superseded plan

These 8 files in `docs/plans/` were created during the Feb 28 sprint but never committed. 7 are worth keeping as archive/reference. 1 (`graph-sync-hardening.md`) is a Kuzu-era plan superseded by the v4 Memgraph architecture.

**Files:**
- Commit: `docs/plans/2026-02-28-paios-v4-design.md`
- Commit: `docs/plans/2026-02-28-paios-v4-implementation.md`
- Commit: `docs/plans/2026-02-28-paios-v4-intelligence-layer.md`
- Commit: `docs/plans/2026-02-28-paios-kg-implementation-patterns.md`
- Commit: `docs/plans/2026-02-28-production-kg-architecture-research.md`
- Commit: `docs/plans/2026-03-01-claude-optimization-review.md`
- Commit: `docs/plans/2026-03-01-claude-usage-limits-analysis.md`
- Delete: `docs/plans/2026-02-28-graph-sync-hardening.md`

**Step 1: Delete the superseded Kuzu-era plan**

```bash
rm docs/plans/2026-02-28-graph-sync-hardening.md
```

**Step 2: Stage the 7 plan files and this design doc**

```bash
git add docs/plans/2026-02-28-paios-v4-design.md \
        docs/plans/2026-02-28-paios-v4-implementation.md \
        docs/plans/2026-02-28-paios-v4-intelligence-layer.md \
        docs/plans/2026-02-28-paios-kg-implementation-patterns.md \
        docs/plans/2026-02-28-production-kg-architecture-research.md \
        docs/plans/2026-03-01-claude-optimization-review.md \
        docs/plans/2026-03-01-claude-usage-limits-analysis.md \
        docs/plans/2026-03-01-platform-cleanup-design.md \
        docs/plans/2026-03-01-platform-cleanup.md
```

**Step 3: Verify staging**

```bash
git status --short docs/plans/
```

Expected: 9 new files staged (A), 0 untracked in docs/plans/.

**Step 4: Commit**

```bash
git commit -m "docs: commit orphaned PAIOS v4 plans and cleanup design docs

Archives v4 design/implementation/intelligence-layer (completed Feb 28),
KG patterns, production KG research, Claude usage analysis, and this
cleanup design. Drops graph-sync-hardening (superseded by v4 Memgraph)."
```

---

## Task 4: Remove dead `mcp-kb-server` entry from generate-mcp-plists.ts

The knowledge-base MCP server (`ai.openclaw.mcp-kb-server`) was decommissioned during PAIOS v4 cutover (Feb 28). The MCP daemon limitation (stdio protocol, no daemonize) was discovered in Phase 16 — the KB is now accessed directly via Memgraph. Lines 24-30 of `generate-mcp-plists.ts` reference a server that no longer exists.

**Files:**
- Modify: `scripts/generate-mcp-plists.ts:24-30`

**Step 1: Remove the dead kb entry**

In `scripts/generate-mcp-plists.ts`, remove lines 24-30 (the `kb` server object):

```typescript
// REMOVE this entire object from the mcpServers array:
  {
    name: "kb",
    label: "ai.openclaw.mcp-kb-server",
    serverPath: path.join(HOME, ".openclaw", "projects", "knowledge-base", "mcp-server.js"),
    workingDirectory: path.join(HOME, ".openclaw", "projects", "knowledge-base"),
    port: 3001,
  },
```

The array should then start with the `observability` entry at port 3002.

**Step 2: Verify the file compiles**

```bash
bun scripts/generate-mcp-plists.ts --dry-run 2>/dev/null || bun --eval "import './scripts/generate-mcp-plists.ts'" 2>&1 | head -5
```

If no `--dry-run` flag exists, just check it type-checks:

```bash
pnpm tsgo --noEmit 2>&1 | grep "generate-mcp-plists" | head -5
```

Expected: No errors related to this file.

**Step 3: Stage the change**

```bash
git add scripts/generate-mcp-plists.ts
```

---

## Task 5: Delete empty google-antigravity-auth extension directory

The `extensions/google-antigravity-auth/` directory was left empty after `382fe8009` removed google-antigravity provider support. It contains no tracked files.

**Files:**
- Delete: `extensions/google-antigravity-auth/` (directory)

**Step 1: Confirm it's truly empty (no tracked files)**

```bash
git ls-files extensions/google-antigravity-auth/
```

Expected: No output (no tracked files).

**Step 2: Remove the directory**

```bash
rm -rf extensions/google-antigravity-auth/
```

**Step 3: Verify gone**

```bash
ls extensions/ | grep antigravity
```

Expected: No output.

---

## Task 6: Delete 4 one-off scripts

These scripts have no references in CI, package.json, or other scripts. They're repro/comparison one-offs from past investigations.

| Script | What it was for |
|--------|----------------|
| `scripts/repro/tsx-name-repro.ts` | Bug repro for tsx naming issue |
| `scripts/zai-fallback-repro.ts` | Fallback behavior repro |
| `scripts/firecrawl-compare.ts` | One-off firecrawl vs. alternative comparison |
| `scripts/readability-basic-compare.ts` | One-off readability lib comparison |

**Step 1: Verify none are referenced (safety check)**

```bash
grep -r "firecrawl-compare\|readability-basic-compare\|zai-fallback-repro\|tsx-name-repro" \
  .github/ package.json scripts/ src/ 2>/dev/null | grep -v node_modules
```

Expected: No output (or only self-references inside the files themselves).

**Step 2: Delete them**

```bash
git rm scripts/firecrawl-compare.ts \
       scripts/readability-basic-compare.ts \
       scripts/zai-fallback-repro.ts \
       scripts/repro/tsx-name-repro.ts
```

**Step 3: Commit tasks 4, 5, and 6 together**

```bash
git commit -m "chore: fix dead mcp-kb-server ref, remove empty ext dir, drop repro scripts

- generate-mcp-plists.ts: remove decommissioned ai.openclaw.mcp-kb-server entry
- extensions/google-antigravity-auth/: delete empty dir left after provider removal
- scripts/: delete 4 one-off repro/comparison scripts (no CI/package references)"
```

---

## Verification

After all commits:

```bash
# Confirm root is clean
ls *.md
# Expected: AGENTS.md CHANGELOG.md CLAUDE.md CONTRIBUTING.md PATCHES.md README.md SECURITY.md VISION.md

# Confirm docs/plans/ has no untracked files
git status docs/plans/
# Expected: nothing to commit

# Confirm no references to removed systems
grep -r "mcp-kb-server\|google-antigravity\|graph-sync-hot\|kuzu" src/ scripts/ --include="*.ts" 2>/dev/null
# Expected: no output

# Confirm git log shows 3 clean commits
git log --oneline -3
```

---

## What Was NOT Changed

- `VISION.md` — legitimate project vision, stays at root
- `PATCHES.md` — critical fork patch tracking for PAIOS, stays at root
- `setup-podman.sh` — referenced by `scripts/run-openclaw-podman.sh`
- `Swabble/` — real embedded Swift project used in CI + Dependabot
- All source code in `src/` — clean, no dead imports found
- All extensions except the empty `google-antigravity-auth/` dir
- All scripts except the 4 one-off repro/comparison scripts
