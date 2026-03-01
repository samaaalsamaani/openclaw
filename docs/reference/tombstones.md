# Feature Tombstones

Canonical list of removed features. Audit scripts read grep patterns from this file.
Add a row whenever a feature is removed. Run `scripts/feature-removal-checklist.sh <name>` first.

| Feature            | Removed    | Grep Patterns                                                            | Known Remaining Refs                                                                                                             |
| ------------------ | ---------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| mcp-kb-server      | 2026-02-28 | `mcp-kb-server`, `mcp-server.js`                                         | `src/agents/sdk-runner/mcp-servers.ts` (circuit keys), `src/infra/health-check.ts`, `src/agents/retry-logic.ts` (comment), tests |
| google-antigravity | 2026-02-23 | `google-antigravity`, `antigravity`                                      | `src/agents/pi-tools-agent-config.test.ts`, `src/agents/auth-health.test.ts`, `src/commands/models.*.test.ts` (mock provider)    |
| kuzu / graph-sync  | 2026-02-28 | `kuzu`, `KuzuDB`, `graph-sync-hot`, `graph-sync-warm`, `graph-sync-cold` |                                                                                                                                  |
