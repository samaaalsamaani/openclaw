# Housekeeping Governance System — Design

**Date:** 2026-03-01
**Scope:** Five-layer system for long-term project cleanliness — prevention, detection, protocol, cadence, tracking.

---

## Context

A manual audit on 2026-03-01 found 24 issues accumulated over ~3 weeks:

- 17 PAIOS session artifact docs committed at root in a mis-named batch commit
- 8 plan docs sitting untracked for 1+ days
- 1 dead code reference surviving a feature removal (`mcp-kb-server` in `generate-mcp-plists.ts`)
- 1 empty extension directory left after removal (`google-antigravity-auth/`)
- 4 one-off repro/comparison scripts never cleaned up

Root causes: no placement enforcement, no removal protocol, no plan doc lifecycle, no audit cadence.

---

## Layer 1 — Prevention

Stops bad things from entering the repo.

### a) Root file allowlist — pre-commit hook

Hook added to `git-hooks/pre-commit` (or `.git/hooks/pre-commit` via `prek`). Maintains an explicit allowlist of permitted root-level files. Fails with a clear message if an unexpected file is staged at root.

**Allowlist:**

- Docs: `AGENTS.md`, `CHANGELOG.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `LICENSE`, `PATCHES.md`, `README.md`, `SECURITY.md`, `VISION.md`
- Config: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `tsconfig.plugin-sdk.dts.json`, `tsdown.config.ts`, `vitest.config.ts`, `vitest.e2e.config.ts`, `vitest.extensions.config.ts`, `vitest.gateway.config.ts`, `vitest.live.config.ts`, `vitest.unit.config.ts`, `zizmor.yml`, `appcast.xml`, `render.yaml`, `fly.toml`, `fly.private.toml`, `docker-compose.yml`, `pyproject.toml`, `openclaw.mjs`, `openclaw.podman.env`, `setup-podman.sh`, `docs.acp.md`
- Directories (always allowed): checked separately, directories not files

### b) Stale untracked plan docs — pre-commit warning

Same hook checks `git ls-files --others --exclude-standard docs/plans/` for files older than 2 days. Warns (non-blocking):

```
⚠ Untracked docs/plans/ files older than 2 days:
  docs/plans/2026-02-28-graph-sync-hardening.md (3 days)
  → Commit them or delete them before they accumulate.
```

### c) PAIOS artifact gitignore patterns

Additions to `.gitignore` (root-only patterns using `/` prefix) for session output filenames that can never be legitimate openclaw files:

```gitignore
# PAIOS session artifacts — should never live at repo root
/*-CONFIGURED-SUCCESS.md
/*-API-TEST-RESULTS.md
/*-STATUS-REPORT.md
/*-SUBSCRIPTION-AUDIT.md
/*-COMPLETION-REPORT.md
```

---

## Layer 2 — Detection

Catches what slipped through prevention.

### a) `scripts/housekeeping-audit.sh`

Single script replicating the manual audit. Checks:

1. Root files against allowlist
2. Untracked `docs/plans/` files older than 3 days
3. Empty directories in `extensions/`
4. Dead references (reads patterns from `docs/reference/tombstones.md`)
5. One-off scripts matching `*-repro.*`, `*-compare.*`, `*-results.*` in `scripts/`
6. Branches merged to main more than 30 days ago

Output: `✓ Clean` or `⚠ N issues` per category. Exit code 1 on any issue (CI-compatible).

### b) `knip` — dead TypeScript exports and files

Add `knip` as a dev dependency. Config at `knip.json` pointing at `src/`, `extensions/*/src/`, and `scripts/`. Surfaces:

- Source files never imported
- Exported symbols never consumed outside their file
- Unused `package.json` dependencies

Run: `pnpm knip`. Add to CI as a non-blocking check initially, promote to blocking after first clean run.

---

## Layer 3 — Protocol

Defines what to do during risky operations.

### a) `scripts/feature-removal-checklist.sh <feature-name>`

Mandatory step when removing any feature, provider, or extension. Checks:

1. `src/` for references
2. `scripts/` for references
3. `.github/` for references (CI, labeler)
4. `extensions/` for leftover directory
5. `.github/labeler.yml` for label entry
6. `package.json` for dependency

Outputs pass/fail per check. Exit code 1 if anything found — prevents committing the removal until all references are clean.

### b) `docs/reference/extension-lifecycle.md`

Documents the full lifecycle of an extension from creation to removal. Key section:

**Removal checklist:**

1. Run `scripts/feature-removal-checklist.sh <name>`
2. `git rm -r extensions/<name>/`
3. Remove from `.github/labeler.yml` and delete the GitHub label
4. Add row to `docs/reference/tombstones.md`
5. Commit: `chore(extensions): remove <name>`

---

## Layer 4 — Cadence

Scheduled automation that maintains hygiene without manual effort.

### a) Monthly housekeeping GitHub Action

File: `.github/workflows/housekeeping.yml`

- Schedule: first Monday of each month, 09:00 UTC
- Also: `workflow_dispatch` for manual runs
- Runs: `scripts/housekeeping-audit.sh`
- If issues found: opens GitHub issue with full report, label `housekeeping`
- If clean: no issue opened (zero noise)
- Issue title: `chore: monthly housekeeping audit — YYYY-MM-DD (N issues)`

### b) Stale branch cleanup (same workflow, weekly)

- Schedule: Sunday 22:00 UTC
- Lists branches merged to `main` more than 30 days ago
- Posts comment on open housekeeping issue (or opens small issue) with delete command
- Never auto-deletes — always human-confirmed
- Excludes: `main`, `beta`, `dev`, any branch with open PR

### c) `housekeeping` GitHub label

- Color: `#e4e669`
- Description: "Scheduled maintenance and cleanup"
- All audit issues and branch cleanup issues use this label

---

## Layer 5 — Tracking

Long-term visibility into project health.

### a) `docs/reference/housekeeping-log.md`

Running log, one row per monthly audit:

| Date       | Issues Found | Issues Resolved | Notes                                                       |
| ---------- | ------------ | --------------- | ----------------------------------------------------------- |
| 2026-03-01 | 24           | 24              | Initial audit — session artifacts, dead refs, repro scripts |

Updated by maintainer when closing the housekeeping issue.

### b) `docs/reference/tombstones.md`

Canonical list of removed features. Scripts read this file for grep patterns:

| Feature            | Removed    | Grep Patterns                                                            |
| ------------------ | ---------- | ------------------------------------------------------------------------ |
| mcp-kb-server      | 2026-02-28 | `mcp-kb-server`, `mcp-server.js`                                         |
| google-antigravity | 2026-02-23 | `google-antigravity`, `antigravity`                                      |
| kuzu / graph-sync  | 2026-02-28 | `kuzu`, `KuzuDB`, `graph-sync-hot`, `graph-sync-warm`, `graph-sync-cold` |

Add a row every time you remove a feature. Scripts do the rest.

### c) CLAUDE.md additions

Three additions to make protocols official for agents:

1. Under **Commit & PR Guidelines**: "Before committing a root-level `.md`, verify it's in the root allowlist (`scripts/housekeeping-audit.sh` will catch it otherwise)."
2. New section **Feature Removal**: "Always run `scripts/feature-removal-checklist.sh <name>` and update `docs/reference/tombstones.md` before committing a removal."
3. Under **Testing Guidelines**: "Run `pnpm knip` before PRs that remove or rename significant exports."

---

## Implementation Order

1. Layer 5b — `tombstones.md` (needed by Layer 2a and 3a scripts)
2. Layer 3a — `feature-removal-checklist.sh` (uses tombstones.md)
3. Layer 2a — `housekeeping-audit.sh` (uses tombstones.md)
4. Layer 1a+b — pre-commit hook additions (uses allowlist, checks untracked)
5. Layer 1c — `.gitignore` additions
6. Layer 2b — `knip` setup
7. Layer 3b — `extension-lifecycle.md`
8. Layer 4 — GitHub Action (housekeeping + branch cleanup)
9. Layer 5a+c — `housekeeping-log.md` + CLAUDE.md additions
10. `housekeeping` label creation in GitHub
