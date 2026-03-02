---
phase: 22-platform-foundations
plan: "02"
subsystem: extensions/packaging
tags: [peer-dependencies, npm-compatibility, package-json, better-sqlite3, concerns]
dependency_graph:
  requires: []
  provides: [FOUND-02, FOUND-03]
  affects: [extensions/*/package.json, .planning/codebase/CONCERNS.md]
tech_stack:
  added: []
  patterns: [peerDependencies semver range >=2026.1.26 alongside devDependencies workspace:*]
key_files:
  created: []
  modified:
    - extensions/bluebubbles/package.json
    - extensions/copilot-proxy/package.json
    - extensions/diagnostics-otel/package.json
    - extensions/discord/package.json
    - extensions/feishu/package.json
    - extensions/google-gemini-cli-auth/package.json
    - extensions/imessage/package.json
    - extensions/irc/package.json
    - extensions/line/package.json
    - extensions/matrix/package.json
    - extensions/mattermost/package.json
    - extensions/memory-lancedb/package.json
    - extensions/minimax-portal-auth/package.json
    - extensions/msteams/package.json
    - extensions/nextcloud-talk/package.json
    - extensions/nostr/package.json
    - extensions/signal/package.json
    - extensions/slack/package.json
    - extensions/synology-chat/package.json
    - extensions/telegram/package.json
    - extensions/tlon/package.json
    - extensions/twitch/package.json
    - extensions/voice-call/package.json
    - extensions/whatsapp/package.json
    - extensions/zalo/package.json
    - extensions/zalouser/package.json
    - .planning/codebase/CONCERNS.md
    - pnpm-lock.yaml
decisions:
  - "peerDependencies uses real semver range >=2026.1.26 (not workspace:*) matching memory-core/googlechat canonical pattern"
  - "devDependencies workspace:* entry retained in all 26 extensions for local monorepo dev"
  - "better-sqlite3 CONCERNS.md entry closed — already in root dependencies, no code change required"
  - "OBS-07 health dashboard unblocked — tsdown external: [better-sqlite3] at lines 108/116 already correct"
metrics:
  duration: "3 minutes"
  completed: "2026-03-02"
  tasks_completed: 2
  files_modified: 28
---

# Phase 22 Plan 02: Extension peerDependencies and better-sqlite3 Verification Summary

**One-liner:** Added `peerDependencies: { "openclaw": ">=2026.1.26" }` to 26 extensions for npm compatibility, and resolved stale CONCERNS.md better-sqlite3 entry that incorrectly claimed production dep misplacement.

## What Was Done

### Task 1: Verify better-sqlite3 and update CONCERNS.md (commit da3faa717)

Verified the current state from source files (not planning docs):

- `package.json` line 165: `"better-sqlite3": "^12.6.2"` is confirmed in `dependencies` (not `devDependencies`).
- `node -e "require('better-sqlite3')"` passes at runtime.
- `tsdown.config.ts` lines 108 and 116: `external: ["better-sqlite3"]` is present in both entry configs.
- No extension `package.json` files carry a duplicate `better-sqlite3` dep.

CONCERNS.md had a stale entry ("better-sqlite3 in devDependencies but used in production code") written from a prior planning-doc state. That entry is now marked RESOLVED with full verification details. The OBS-07 health dashboard blocker ("blocked by better-sqlite3 bundling in tsdown") is also confirmed unblocked — the existing `external` config already handles it correctly.

### Task 2: Add peerDependencies to 26 extensions (commit 29e93020c)

All 26 extension `package.json` files updated following the canonical pattern from `extensions/memory-core` and `extensions/googlechat`:

```json
{
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "peerDependencies": {
    "openclaw": ">=2026.1.26"
  }
}
```

**Extensions updated (26 total):**

| Extension              | Has peerDep | devDep preserved |
| ---------------------- | ----------- | ---------------- |
| bluebubbles            | YES         | YES              |
| copilot-proxy          | YES         | YES              |
| diagnostics-otel       | YES         | YES              |
| discord                | YES         | YES              |
| feishu                 | YES         | YES              |
| google-gemini-cli-auth | YES         | YES              |
| imessage               | YES         | YES              |
| irc                    | YES         | YES              |
| line                   | YES         | YES              |
| matrix                 | YES         | YES              |
| mattermost             | YES         | YES              |
| memory-lancedb         | YES         | YES              |
| minimax-portal-auth    | YES         | YES              |
| msteams                | YES         | YES              |
| nextcloud-talk         | YES         | YES              |
| nostr                  | YES         | YES              |
| signal                 | YES         | YES              |
| slack                  | YES         | YES              |
| synology-chat          | YES         | YES              |
| telegram               | YES         | YES              |
| tlon                   | YES         | YES              |
| twitch                 | YES         | YES              |
| voice-call             | YES         | YES              |
| whatsapp               | YES         | YES              |
| zalo                   | YES         | YES              |
| zalouser               | YES         | YES              |

**Extensions skipped (already correct — untouched):**

- `extensions/memory-core` — already has both devDependencies and peerDependencies
- `extensions/googlechat` — already has both devDependencies and peerDependencies

**Extensions exempt (no openclaw dep — untouched):**

- `extensions/llm-task`
- `extensions/lobster`
- `extensions/open-prose`

**pnpm install outcome:** Ran without `--frozen-lockfile` because the new peerDependencies entries required a lockfile update. `pnpm-lock.yaml` updated accordingly. One pre-existing warning about `@cypress/request-promise` peer deps (from the `request` override) was present before this plan and is unrelated.

## Verification Results

1. `node -e "require('better-sqlite3'); console.log('better-sqlite3 resolves OK')"` — PASSED
2. `grep -c "peerDependencies" extensions/discord/package.json extensions/telegram/package.json extensions/slack/package.json` — each shows 1 — PASSED
3. `grep "workspace:*" extensions/discord/package.json extensions/telegram/package.json` — devDependencies workspace:\* still present — PASSED
4. `grep -l "peerDependencies" extensions/memory-core/package.json extensions/googlechat/package.json` — both already had it, still present — PASSED
5. CONCERNS.md better-sqlite3 section shows RESOLVED status — PASSED
6. Node verification script for all 26 extensions: "All 26 extensions have correct peerDependencies AND devDependencies" — PASSED

## Decisions Made

- Semver range `>=2026.1.26` matches the canonical examples in memory-core and googlechat, and aligns with the current openclaw version `2026.2.24`.
- Placement: `peerDependencies` block placed after `devDependencies` in JSON key order (adjacent, as specified).
- CONCERNS.md better-sqlite3 entry was marked RESOLVED rather than deleted, to preserve audit trail.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: `.planning/phases/22-platform-foundations/22-02-SUMMARY.md`
- FOUND: `.planning/codebase/CONCERNS.md`
- FOUND: `extensions/discord/package.json`
- FOUND: `extensions/telegram/package.json`
- FOUND commit: `da3faa717` (Task 1 — CONCERNS.md update)
- FOUND commit: `29e93020c` (Task 2 — peerDependencies additions)
