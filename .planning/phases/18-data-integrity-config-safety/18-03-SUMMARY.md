---
phase: 18-data-integrity-config-safety
plan: "03"
subsystem: config-management
tags: [database-cleanup, credential-loading, single-source-truth]
dependency_graph:
  requires: [18-01, 18-02]
  provides: [placeholder-cleanup, auth-profiles-only-loading]
  affects: [scripts, config-management]
tech_stack:
  added: [jq, lsof]
  patterns: [safe-migration, credential-validation]
key_files:
  created:
    - scripts/cleanup-placeholder-dbs.sh
    - scripts/load-env.sh
  modified: []
decisions:
  - Safe migration pattern checks file size and open handles before deletion
  - load-env.sh fails fast if auth-profiles.json missing (no silent fallback)
  - jq used for safe JSON parsing in shell scripts
  - One-time migration script (not for repeated use)
metrics:
  tasks_completed: 3
  files_created: 2
  files_modified: 0
  duration: 272s
  completed_at: "2026-02-27T23:57:58Z"
---

# Phase 18 Plan 03: Legacy Cleanup & Auth-Profiles Enforcement Summary

**One-liner:** Safe removal of 3 placeholder SQLite files and enforcement of auth-profiles.json as single credential source with fail-fast validation

## What Was Built

Created migration tooling to clean up legacy 0-byte placeholder databases and enforce auth-profiles.json as the single source of truth for API credentials, eliminating plist fallback that caused credential drift.

### Artifacts Created

**scripts/cleanup-placeholder-dbs.sh** (91 lines)

- Safe removal of 3 legacy 0-byte placeholder files
- Validates file size (0 bytes only) before removal
- Checks for open file handles via lsof (prevents crashes)
- Comprehensive verification section confirms cleanup success
- Documents prerequisites (stop services first)
- One-time migration script with clear usage instructions

**scripts/load-env.sh** (80 lines)

- Loads API credentials from auth-profiles.json exclusively
- No plist fallback (fails with clear error if auth-profiles missing)
- Exports environment variables for all API providers (Anthropic, OpenAI, Google, Brave, etc.)
- Uses jq for safe JSON parsing
- Clear error messages guide users to auth-profiles.json

## Architecture Decisions

### Decision 1: Safe Migration with lsof Check

**Context:** Even 0-byte files can have open file descriptors; deleting while open causes process crashes
**Decision:** Check lsof before removal; skip files with open handles
**Rationale:** Safety first - better to skip a file than crash a running service
**Impact:** Users must stop services before running cleanup (documented in prerequisites)

### Decision 2: Fail Fast on Missing auth-profiles.json

**Context:** Plist fallback caused credential drift (Gateway writes to auth-profiles, shell reads from plist)
**Decision:** load-env.sh fails with clear error if auth-profiles.json missing; no silent fallback
**Rationale:** Two sources of truth cause desync; single source ensures consistency
**Impact:** Users see clear error message directing them to auth-profiles.json

### Decision 3: jq for JSON Parsing

**Context:** Bash has no built-in JSON parser; manual parsing is error-prone
**Decision:** Use jq to extract API keys from auth-profiles.json
**Rationale:** Safe, reliable, already available on macOS via Homebrew
**Impact:** Requires jq installation (checked with clear error if missing)

### Decision 4: One-Time Migration Script

**Context:** Placeholder cleanup is legacy migration, not ongoing maintenance
**Decision:** Document script as one-time use; user runs manually (not in launchd)
**Rationale:** Cleanup is irreversible; manual execution ensures user awareness
**Impact:** User must run script once after phase completion

## Implementation Notes

### Placeholder Files Targeted

- `~/.openclaw/projects/social-history.sqlite` (0 bytes, real: `~/.openclaw/social-history.sqlite`)
- `~/.openclaw/social.sqlite` (0 bytes, legacy from old architecture)
- `~/.openclaw/knowledge-base.sqlite` (0 bytes, real: `~/.openclaw/projects/knowledge-base/kb.sqlite`)

### API Keys Exported by load-env.sh

- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- GOOGLE_API_KEY (Direct API)
- BRAVE_API_KEY (Search)
- ELEVENLABS_API_KEY
- DEEPGRAM_API_KEY
- OPENROUTER_API_KEY

### Safety Checks in cleanup-placeholder-dbs.sh

1. File existence check (`[ -f "$file" ]`)
2. File size check (`[ ! -s "$file" ]` - empty only)
3. Open handle check (`lsof "$file"` - not in use)
4. Verification section confirms real databases untouched

## Deviations from Plan

None - plan executed exactly as written.

## User Action Required

**Run cleanup script ONCE after phase completion:**

```bash
# Stop services
launchctl stop ai.openclaw.gateway
launchctl stop ai.openclaw.embedding-server
launchctl stop ai.openclaw.file-watcher

# Run cleanup
./scripts/cleanup-placeholder-dbs.sh

# Restart services
launchctl start ai.openclaw.gateway
launchctl start ai.openclaw.embedding-server
launchctl start ai.openclaw.file-watcher
```

**Use load-env.sh for shell credential loading:**

```bash
# Source in shell to load API keys
source scripts/load-env.sh

# Verify keys loaded
echo $ANTHROPIC_API_KEY
```

## Testing & Validation

### Automated Validation

- ✓ cleanup-placeholder-dbs.sh syntax valid (`bash -n`)
- ✓ load-env.sh syntax valid (`bash -n`)
- ✓ auth-profiles.json referenced in load-env.sh
- ✓ No plist fallback code in load-env.sh
- ✓ cleanup-placeholder-dbs.sh is executable
- ✓ Usage documentation present in both scripts
- ✓ Prerequisites documented in cleanup script

### Manual Validation Required

- [ ] Run cleanup script after stopping services
- [ ] Verify 3 placeholder files removed
- [ ] Verify 6 real databases remain intact
- [ ] Source load-env.sh and verify API keys load
- [ ] Restart services successfully

## Requirements Coverage

| Req ID  | Requirement                                                      | Status   |
| ------- | ---------------------------------------------------------------- | -------- |
| DATA-05 | Remove placeholder 0-byte SQLite files                           | Complete |
| DATA-07 | Auth-profiles.json is single source of truth (no plist fallback) | Complete |

## Metrics

- Tasks completed: 3/3
- Files created: 2
- Files modified: 0
- Commits: 2
- Duration: 272 seconds (4.5 minutes)
- Lines of code: 171 (91 cleanup script, 80 load-env)

## Next Steps

1. User runs cleanup script (one-time migration)
2. Update shell profiles to source load-env.sh if needed
3. Remove any remaining plist credential references from other scripts
4. Document auth-profiles.json as single source in onboarding docs

## Self-Check: PASSED

✓ scripts/cleanup-placeholder-dbs.sh exists and is executable
✓ scripts/load-env.sh exists
✓ Commit 5e280ae31 exists (cleanup script)
✓ Commit 3c91e8498 exists (load-env.sh)
✓ No plist fallback code in load-env.sh
✓ Safety checks present in cleanup script (lsof, file size)
✓ Verification section confirms cleanup success
✓ Documentation complete (usage, prerequisites)
