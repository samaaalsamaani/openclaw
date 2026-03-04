---
phase: 29-db-knowledge-leverage
plan: "03"
subsystem: infra
tags: [mcp, graph-intelligence, neo4j-driver, memgraph, stdio-mcp, kb-mcp, causal-traversal]

# Dependency graph
requires:
  - phase: 29-01
    provides: hybrid KB search (FTS+vec), neo4j-driver installed at workspace root
  - phase: 29-02
    provides: queryGraphContext() and graph context injection into agent system prompts

provides:
  - graph-intelligence stdio MCP entry in buildSdkMcpServers() — agents can query Memgraph graph directly via MCP
  - graph_trace tool in KB MCP server — traverses CAUSED_BY/LED_TO/SUPPORTS edges for root-cause and consequence questions
  - fs.existsSync guard for graph-intelligence — graceful degradation when graph project not installed

affects: [agent-sessions, sdk-runner, kb-mcp-server, memgraph-graph]

# Tech tracking
tech-stack:
  added: [neo4j-driver (KB MCP project, already in workspace root from 29-01)]
  patterns:
    - fs.existsSync guard for PAIOS-specific external stdio MCP servers (optional files)
    - process.execPath instead of npx for external node MCP servers (avoids npx overhead, correct binary)
    - HOME env var passed explicitly to external stdio MCP subprocess

key-files:
  created: []
  modified:
    - src/agents/sdk-runner/mcp-servers.ts
    - src/agents/sdk-runner/mcp-servers.test.ts
    - ~/.openclaw/projects/knowledge-base/mcp-server.js (external, not in git)

key-decisions:
  - "graph-intelligence MCP entry uses process.execPath (not npx) — avoids overhead and uses correct gateway Node binary"
  - "fs.existsSync guard around graph-intelligence entry — graph project is PAIOS-specific, not part of openclaw install"
  - "graph_trace direction parameter: causes/effects/both — both=full bidirectional CAUSED_BY|LED_TO|SUPPORTS traversal"
  - "graph_trace hops clamped to 1-5 range — prevents runaway traversals in Memgraph"
  - 'neo4j.auth.basic("","") for Memgraph no-auth mode (auth.none() removed in neo4j-driver v6, established in 29-02)'

patterns-established:
  - "External stdio MCP pattern: process.execPath + fs.existsSync guard + HOME env passthrough"
  - "PAIOS-specific MCP tools use inline require() matching openKbDb() pattern in mcp-servers.ts"

requirements-completed: [LEVER-03, LEVER-04, LEVER-05]

# Metrics
duration: 10min
completed: 2026-03-04
---

# Phase 29 Plan 03: Graph Intelligence MCP Wiring Summary

**graph-intelligence stdio MCP entry wired into all agent sessions via buildSdkMcpServers(), with graph_trace causal traversal tool added to KB MCP server**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-04T22:28:21Z
- **Completed:** 2026-03-04T22:51:01Z
- **Tasks:** 2
- **Files modified:** 3 (2 in-repo, 1 external KB MCP)

## Accomplishments

- Added `graph-intelligence` stdio MCP entry to `buildSdkMcpServers()` with `fs.existsSync` guard — all agent sessions now get access to Memgraph graph tools when the graph project is installed
- Entry uses `process.execPath` (Node binary) instead of `npx`, passes `HOME` env var to subprocess — consistent with PAIOS gateway architecture
- Added `graph_trace` tool to `~/.openclaw/projects/knowledge-base/mcp-server.js` — traverses `CAUSED_BY`, `LED_TO`, and `SUPPORTS` edges bidirectionally with configurable hops (1-5) and direction (causes/effects/both)
- Installed `neo4j-driver` in KB MCP project (`npm install neo4j-driver --save`)
- Added 2 new tests: behavioral check when file exists + source-level guard assertion — all 15 mcp-servers tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add graph-intelligence stdio entry to buildSdkMcpServers() and test** - `2dacefb` (feat)
2. **Task 2: Add graph_trace tool to KB MCP server and install neo4j-driver** - (external files — no openclaw repo commit; KB MCP at `~/.openclaw/projects/knowledge-base/mcp-server.js` is outside git)

## Files Created/Modified

- `src/agents/sdk-runner/mcp-servers.ts` - Added `graph-intelligence` stdio entry (lines 440-456) with `fs.existsSync` guard and `process.execPath` command
- `src/agents/sdk-runner/mcp-servers.test.ts` - Added `describe("graph-intelligence MCP entry")` block with 2 tests
- `~/.openclaw/projects/knowledge-base/mcp-server.js` - Added `graph_trace` tool in the tools object; `neo4j-driver` installed in that project

## Decisions Made

- **process.execPath over npx:** The graph MCP server is a local Node.js script at a known path. Using `process.execPath` avoids npx installation overhead and ensures the same Node binary used by the gateway is used for the subprocess.
- **fs.existsSync guard:** The graph project (`~/.openclaw/projects/graph/`) is PAIOS-specific and not part of the openclaw install. The guard enables graceful degradation — agents work normally on machines without the graph project.
- **HOME env passthrough:** The graph MCP server needs HOME to resolve PAIOS paths. Passing `{ ...process.env, HOME: home }` where `home = resolveRequiredHomeDir()` ensures the subprocess uses the same home resolution as the gateway.
- **neo4j.auth.basic("","")** for Memgraph no-auth — consistent with 29-02 decision (auth.none() was removed in neo4j-driver v6).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The graph-intelligence entry is automatically enabled when `~/.openclaw/projects/graph/mcp-server.js` exists; no manual configuration needed.

## Next Phase Readiness

- Phase 29 fully complete: hybrid KB search (29-01), graph context injection (29-02), and graph MCP wiring + causal traversal (29-03)
- Agents now have three layers of graph intelligence: system prompt injection (29-02), in-process KB MCP tools (gateway-kb), and full Memgraph MCP tools (graph-intelligence stdio server)
- No blockers for subsequent phases

## Self-Check: PASSED

- FOUND: `.planning/phases/29-db-knowledge-leverage/29-03-SUMMARY.md`
- FOUND: `src/agents/sdk-runner/mcp-servers.ts`
- FOUND: `src/agents/sdk-runner/mcp-servers.test.ts`
- FOUND: commit `2dacefb` (feat(29-03): add graph-intelligence stdio MCP entry to buildSdkMcpServers)

---

_Phase: 29-db-knowledge-leverage_
_Completed: 2026-03-04_
