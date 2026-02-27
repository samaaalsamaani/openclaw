# Phase 18: Data Integrity & Config Safety - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Prevent data corruption and configuration issues across:

- SQLite databases (5 active: kb, observability, social-history, autonomy, ceo)
- Config files (llm-config.json, auth-profiles.json, openclaw.json)
- API credentials (Late.dev tokens, Codex OAuth, static API keys)

**In scope:** WAL migration, config validation, credential automation, schema enforcement, placeholder cleanup
**Out of scope:** Performance optimization, data migration, new config options

</domain>

<decisions>
## Implementation Decisions

### SQLite WAL Migration

- **Migration timing**: On first open (automatic - check journal_mode, enable WAL if not already)
- **Failure handling**: Log warning and continue (WAL is optimization, still works without it)
- **Verification**: Yes, verify journal_mode after PRAGMA (log if not WAL)
- **busy_timeout**: 5000ms on every connection open (consistent timeout, no risk of forgetting)

### Config Validation Strategy

- **Validation timing**: Before every load (validate each time config is read)
- **Validation failure**: Use last known good (auto-restore from backup)
- **Auto-backup**: Yes, always (backup to ~/.openclaw/backups/ before every write)
- **Gateway rewrite bug fix**: Don't write on shutdown (remove config write from shutdown handler entirely)

### Credential Refresh Automation

- **Check frequency**: Daily (via heartbeat task)
- **Refresh timing**: 7 days before expiry (proactive refresh with plenty of time)
- **Failure handling**: Alert user + retry daily (notification + auto-retry until manual intervention)
- **Scope**: Late.dev + Codex OAuth only (focus on expiring credentials, not static API keys)

### OAuth Renewal Flow

- **Renewal mechanism**: Automatic with manual fallback (try refresh token first, prompt user if fails)
- **Notification**: macOS notification (native notification 7 days before expiry)
- **Browser handling**: Open browser automatically (launch OAuth URL, wait for callback)
- **Testing**: No, only when needed (don't risk breaking working tokens with test refreshes)

</decisions>

<specifics>
## Specific Ideas

**SQLite:**

- Check `PRAGMA journal_mode` on every database open
- If not WAL, run `PRAGMA journal_mode=WAL` and verify result
- Log to observability if WAL enable fails (category: 'data', action: 'wal_migration_failed')

**Config Safety:**

- Backup location: `~/.openclaw/backups/{config-name}-{timestamp}.json`
- Keep last 10 backups per config file (auto-cleanup old backups)
- Validation uses Zod schemas (Gateway already has config-lib.ts with validators)

**Credential Management:**

- Daily heartbeat task checks all credentials for expiry
- Late.dev tokens expire every 60 days (YouTube, TikTok, Twitter)
- Codex OAuth expires ~60 days (current: Mar 3, 2026 - 4 days!)
- Notification 7 days before = plenty of time for manual intervention if auto-refresh fails

**OAuth Flow:**

- Use refresh token from auth-profiles.json
- If refresh succeeds: update access token, update expiresAt, save to auth-profiles
- If refresh fails: macOS notification with instructions, open browser for re-auth
- Browser callback updates auth-profiles automatically

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 18-data-integrity-config-safety_
_Context gathered: 2026-02-27_
