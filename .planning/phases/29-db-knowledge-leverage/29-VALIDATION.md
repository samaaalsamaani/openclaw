---
phase: 29
slug: db-knowledge-leverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                 |
| ---------------------- | ----------------------------------------------------- |
| **Framework**          | Vitest (v4)                                           |
| **Config file**        | vitest.config.ts (root)                               |
| **Quick run command**  | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts` |
| **Full suite command** | `pnpm test`                                           |
| **Estimated runtime**  | ~30 seconds (full), ~5 seconds (quick)                |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test src/agents/sdk-runner/mcp-servers.test.ts`
- **After every plan wave:** Run `pnpm test && pnpm tsgo`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave  | Requirement | Test Type  | Automated Command                                                                              | File Exists | Status     |
| -------- | ---- | ----- | ----------- | ---------- | ---------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 29-01-01 | 01   | 0     | LEVER-01    | unit       | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "queryKbForContext returns a Promise"` | ❌ W0       | ⬜ pending |
| 29-01-02 | 01   | 0     | LEVER-01    | unit       | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "kbQuery function"`                    | ❌ W0       | ⬜ pending |
| 29-01-03 | 01   | 1     | LEVER-01    | typecheck  | `pnpm tsgo`                                                                                    | ✅ existing | ⬜ pending |
| 29-02-01 | 02   | 0     | LEVER-02    | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "exports a default function"`    | ❌ W0       | ⬜ pending |
| 29-02-02 | 02   | 0     | LEVER-02    | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "ignores non-message"`           | ❌ W0       | ⬜ pending |
| 29-02-03 | 02   | 0     | LEVER-02    | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "handles message:received"`      | ❌ W0       | ⬜ pending |
| 29-02-04 | 02   | 0     | LEVER-02    | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "skips empty"`                   | ❌ W0       | ⬜ pending |
| 29-03-01 | 03   | 1     | LEVER-03    | unit       | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "includes graph-intelligence"`         | ❌ W0       | ⬜ pending |
| 29-all   | all  | final | LEVER-05    | regression | `pnpm test && pnpm tsgo`                                                                       | ✅ existing | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/hooks/bundled/graph-context/handler.ts` — bundled hook handler (LEVER-02)
- [ ] `src/hooks/bundled/graph-context/handler.test.ts` — 4 tests covering LEVER-02 behaviors
- [ ] `src/hooks/bundled/graph-context/HOOK.md` — required by bundled-dir.ts discovery
- [ ] New test cases in `src/agents/sdk-runner/mcp-servers.test.ts` — async queryKbForContext (LEVER-01), graph-intelligence key (LEVER-03)
- [ ] `pnpm add neo4j-driver` — required before graph-context hook compiles

---

## Manual-Only Verifications

| Behavior                                           | Requirement | Why Manual                                                                 | Test Instructions                                                                                  |
| -------------------------------------------------- | ----------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Memgraph graph context appears in live agent reply | LEVER-02    | Requires live Memgraph + real message dispatch                             | Send ≥10 char message to agent, check reply system prompt includes graph context section           |
| graph-intelligence tools visible in agent session  | LEVER-03    | Requires live graph MCP server at ~/.openclaw/projects/graph/mcp-server.js | Start gateway, send message, verify agent has access to graph tools                                |
| graph_trace tool in KB MCP returns causal chain    | LEVER-04    | Requires live neo4j-driver + Memgraph connectivity in KB MCP               | Query KB MCP graph_trace tool with known entity, verify CAUSED_BY/LED_TO traversal                 |
| Gateway restarts cleanly with all hooks active     | LEVER-05    | Integration test — requires full gateway restart                           | `launchctl stop ai.openclaw.gateway && launchctl start ai.openclaw.gateway`, check logs for errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
