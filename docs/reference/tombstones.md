# Feature Tombstones

Canonical list of removed features. Audit scripts read grep patterns from this file.
Add a row whenever a feature is removed. Run `scripts/feature-removal-checklist.sh <name>` first.

| Feature            | Removed    | Grep Patterns                                                            |
| ------------------ | ---------- | ------------------------------------------------------------------------ |
| mcp-kb-server      | 2026-02-28 | `mcp-kb-server`, `mcp-server.js`                                         |
| google-antigravity | 2026-02-23 | `google-antigravity`, `antigravity`                                      |
| kuzu / graph-sync  | 2026-02-28 | `kuzu`, `KuzuDB`, `graph-sync-hot`, `graph-sync-warm`, `graph-sync-cold` |
