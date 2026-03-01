# Platform Cleanup Design

**Date:** 2026-03-01
**Scope:** Remove session artifacts, fix dead code, commit orphaned plans — surgical + deep audit approach

---

## Context

A deep audit of the repo identified four distinct areas of clutter accumulated during the Feb 27-28 PAIOS v4 sprint and earlier LLM infrastructure work. The source code itself is clean post-v4. The problems are in (1) root-level session artifact docs, (2) untracked plan docs, (3) two dead code remnants, and (4) potentially one-off scripts.

---

## Area 1 — Root-level Session Artifact Docs

All added in commit `68cbbfd0b` ("feat: add Claude configuration validator script") — a misnamed batch commit that also included 18 PAIOS planning/audit session outputs. These do not belong in the openclaw repo.

### Delete (17 files)

| File                                      | Reason                         |
| ----------------------------------------- | ------------------------------ |
| `AI-SUBSCRIPTION-AUDIT.md`                | PAIOS session artifact         |
| `ARCHITECTURE-VALIDATION-PLAN.md`         | Session artifact               |
| `ARCHITECTURE-VALIDATION-REPORT.md`       | Session artifact               |
| `AUDIT-COMPLETE-SUMMARY.md`               | Session artifact               |
| `CLAUDE-CLI-SPEED-ANALYSIS.md`            | PAIOS-specific                 |
| `CODEX-CLI-SUCCESS.md`                    | One-time setup confirmation    |
| `COMPLETE-LLM-INFRASTRUCTURE-ANALYSIS.md` | PAIOS-specific                 |
| `COMPLETION-REPORT.md`                    | Session artifact               |
| `FINAL-SUBSCRIPTION-SUMMARY.md`           | PAIOS-specific                 |
| `GEMINI-API-SETUP.md`                     | PAIOS-specific                 |
| `GEMINI-CONFIGURED-SUCCESS.md`            | One-time setup confirmation    |
| `GEMINI-STATUS-REPORT.md`                 | PAIOS-specific                 |
| `LLM-CAPABILITIES-AUDIT-PLAN.md`          | Audit artifact                 |
| `LLM-REFERENCE-GUIDE.md`                  | PAIOS-specific model reference |
| `OPENAI-API-TEST-RESULTS.md`              | PAIOS-specific                 |
| `OPTIMIZED-API-ROUTING-IMPLEMENTATION.md` | PAIOS implementation notes     |
| `PHASE1-CLI-INVENTORY-RESULTS.md`         | Inventory artifact             |

### Move (2 files)

| File                                    | Destination                                                   | Reason                                              |
| --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `INTELLIGENCE-EVOLUTION-MASTER-PLAN.md` | `docs/plans/2026-02-27-intelligence-evolution-master-plan.md` | Real plan doc, 2066 lines, deserves proper location |
| `ROUTER-TROUBLESHOOTING.md`             | `docs/reference/router-troubleshooting.md`                    | Legitimate ops reference                            |

### Keep at root

- `VISION.md` — legitimate project vision
- `PATCHES.md` — fork patch tracking (critical for PAIOS)
- `setup-podman.sh` — referenced by `scripts/run-openclaw-podman.sh`
- `Swabble/` — real embedded Swift project, in CI + Dependabot

---

## Area 2 — `docs/plans/` Untracked Files

8 files in `docs/plans/` were never committed (created during Feb 28 sprint).

### Commit (7 files)

| File                                                | Reason                      |
| --------------------------------------------------- | --------------------------- |
| `2026-02-28-paios-v4-design.md`                     | Completed milestone archive |
| `2026-02-28-paios-v4-implementation.md`             | Completed milestone archive |
| `2026-02-28-paios-v4-intelligence-layer.md`         | Completed milestone archive |
| `2026-02-28-paios-kg-implementation-patterns.md`    | Useful reference            |
| `2026-02-28-production-kg-architecture-research.md` | Useful reference            |
| `2026-03-01-claude-optimization-review.md`          | Active concern              |
| `2026-03-01-claude-usage-limits-analysis.md`        | Active concern              |

### Delete (1 file)

| File                                 | Reason                                                |
| ------------------------------------ | ----------------------------------------------------- |
| `2026-02-28-graph-sync-hardening.md` | Kuzu-era plan, superseded by v4 Memgraph architecture |

---

## Area 3 — Dead Code (Deep Audit Results)

The deep audit found only 2 genuine issues. Source code is otherwise clean.

### Fix: `scripts/generate-mcp-plists.ts`

Lines ~24-30 configure a dead MCP server entry for `ai.openclaw.mcp-kb-server`. The KB server was decommissioned during PAIOS v4 cutover (Feb 28). Remove the entry from the `mcpServers` array.

### Delete: `extensions/google-antigravity-auth/`

Empty directory left behind after `382fe8009` removed google-antigravity provider support. No files tracked, safe to remove.

---

## Area 4 — Scripts

### Investigate and likely delete

| File                                   | Status                                            |
| -------------------------------------- | ------------------------------------------------- |
| `scripts/repro/tsx-name-repro.ts`      | Bug repro — verify not referenced, then delete    |
| `scripts/zai-fallback-repro.ts`        | Repro script — verify not referenced, then delete |
| `scripts/firecrawl-compare.ts`         | One-off comparison — verify then delete           |
| `scripts/readability-basic-compare.ts` | One-off comparison — verify then delete           |

These will be verified (checked for CI/workflow references) before deletion.

---

## What We're NOT Touching

- `src/` — no dead code, no broken imports, no `@ts-ignore`
- All extensions except `google-antigravity-auth/` empty dir
- All `scripts/` entries except the 4 listed above
- `Swabble/` — embedded Swift project, do not touch
- `setup-podman.sh` — referenced by run script

---

## Commit Strategy

Three atomic commits:

1. `chore: remove root-level session artifact docs` — deletions + moves from root
2. `docs: commit untracked PAIOS v4 and analysis plans` — commit 7 plan files, delete 1
3. `chore: fix dead mcp-kb-server ref, remove empty extension dir, remove repro scripts` — source + script cleanup
