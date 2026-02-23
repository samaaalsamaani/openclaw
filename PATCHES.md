# PAIOS Custom Patches

Files modified from upstream openclaw/openclaw.
Review before each upstream sync.

## New Files (no conflict risk)

- `src/agents/task-classifier.ts` — Multi-brain routing (7 domains, Arabic, dynamic weights)
- `src/agents/verification.ts` — Cross-brain quality gate
- `src/agents/sdk-runner.ts` — Agent SDK runtime (in-process Claude agent execution)
- `src/agents/sdk-runner/blocked-patterns.ts` — Execution policy
- `src/agents/sdk-runner/mcp-servers.ts` — SDK MCP server builder
- `src/agents/sdk-runner/sdk-runner.test.ts` — Test coverage (11 tests)
- `src/agents/routing-middleware.ts` — Extracted routing + verification hooks (called from get-reply.ts)
- `src/gateway/channel-events.ts` — Channel health observability (writes to observability.sqlite)
- `.planning/` — PAIOS phase tracking

## Modified Files (must re-apply after upgrade)

| File                                     | What Changed                                                                                                         | Lines |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| `src/auto-reply/reply/get-reply.ts`      | Import routing-middleware; `applyMultiBrainRouting()` call + `scheduleVerification()` call                           | ~17   |
| `src/memory/manager-sync-ops.ts`         | `PRAGMA busy_timeout = 5000` in openDatabaseAtPath()                                                                 | 2     |
| `src/memory/qmd-manager.ts`              | `PRAGMA busy_timeout = 5000` in ensureDb() (upstream has 1ms)                                                        | 1     |
| `package.json`                           | Added `@anthropic-ai/claude-agent-sdk` dependency                                                                    | 1     |
| `src/config/plugin-auto-enable.ts`       | `alreadyEnabled` also checks `plugins.entries` for built-in channels (upstream bug: adds `enabled` to strict schema) | 3     |
| `src/gateway/server-channels.ts`         | Import channel-events; emit start/error/stop events                                                                  | 4     |
| `src/gateway/channel-health-monitor.ts`  | Import channel-events; emit health_restart + restart-failed events                                                   | 7     |
| `apps/macos/.../PermissionManager.swift` | Bundle ID nil guard in ensureNotifications() + status()                                                              | ~8    |

## Integration Architecture

Our routing connects to upstream through ONE file (`get-reply.ts`) via a thin middleware layer:

1. **Input routing**: `applyMultiBrainRouting()` — classifies task domain, returns provider/model if confidence >= 70%
2. **Output verification**: `scheduleVerification()` — fire-and-forget quality check via dynamic import

All routing logic lives in `src/agents/routing-middleware.ts` (new file, zero conflict risk).
The `get-reply.ts` patch is just 1 import + 2 function calls (~17 lines vs previous ~67).

## Upgrade Checklist

1. **Run pre-sync check**: `scripts/pre-sync-check.sh` (or `--merge` to preview)
2. If any patched file shows WARNING: read the upstream diff, plan re-apply
3. `git merge upstream/main`
4. `pnpm install && pnpm build` — must succeed
5. Run `vitest run src/agents/sdk-runner/` — must pass
6. `launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway` — restart + verify health

Last synced: upstream v2026.2.22-1 (commit 457835b10, merged 8271b5f7e)
