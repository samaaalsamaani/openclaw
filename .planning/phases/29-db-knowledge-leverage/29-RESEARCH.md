# Phase 29: db-knowledge-leverage — Research

**Researched:** 2026-03-04
**Domain:** Hybrid vector+FTS search (sqlite-vec / better-sqlite3), Memgraph graph context injection, MCP server wiring, causal graph traversal
**Confidence:** HIGH — all findings verified against live source files

---

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                                            | Research Support                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LEVER-01 | `kbQuery()` and `queryKbForContext()` use hybrid vector+FTS (60% / 40%) when embedding server available; FTS-only fallback             | `kbVecAvailable` + `getQueryEmbedding()` already exist in mcp-servers.ts; vec_articles + vec_entities tables confirmed present; `kbQuery` is sync on line 579, must become async                                          |
| LEVER-02 | Every inbound message >=10 chars triggers Memgraph entity lookup; causal/episodic context injected into agent system prompt (3s bound) | `dispatch-from-config.ts:204` fires `message:received` hook; graph MCP uses Python bridge (not neo4j-driver); Direct Cypher approach requires neo4j-driver install; design doc proposes direct call from get-reply-run.ts |
| LEVER-03 | `graph-intelligence` MCP server (6 tools) available in all agent sessions via `buildSdkMcpServers()`                                   | `~/.openclaw/projects/graph/mcp-server.js` exists and starts; `buildSdkMcpServers()` adds stdio servers with `fs.existsSync` guard; no neo4j-driver needed                                                                |
| LEVER-04 | `graph_trace` tool in KB MCP server traverses `CAUSED_BY` / `LED_TO` / `SUPPORTS` edges                                                | KB MCP at `~/.openclaw/projects/knowledge-base/mcp-server.js` — neo4j-driver NOT installed there or anywhere in openclaw; must install or use Python bridge                                                               |
| LEVER-05 | All existing tests pass; `pnpm tsgo` zero errors; gateway restarts cleanly                                                             | Test file assertions in mcp-servers.test.ts that check exact counts must be updated when tool count changes                                                                                                               |

</phase_requirements>

---

## Summary

Phase 29 activates three dormant intelligence layers that already exist in the codebase but aren't yet wired together. The KB database has vector embeddings (`vec_articles` table) loaded via sqlite-vec, `kbVecAvailable` and `getQueryEmbedding()` are already implemented in `mcp-servers.ts` — but `kbQuery()` and `queryKbForContext()` still only run FTS5. The Memgraph graph server (`~/.openclaw/projects/graph/mcp-server.js`) already has 6 tools and runs correctly, but `buildSdkMcpServers()` does not include it. The `message:received` internal hook already fires in `dispatch-from-config.ts:204` but no bundled handler queries graph context.

The implementation follows three clean tracks: (1) upgrade `kbQuery()` to async with hybrid scoring — the infrastructure is already in place, just wiring needed; (2) wire the graph MCP server as a stdio entry in `buildSdkMcpServers()` — identical pattern to existing servers; (3) inject graph context into the Auto-RAG system prompt in `get-reply-run.ts` alongside `kbContextSection`. The most architectural decision is how LEVER-02 graph context reaches the system prompt: the plan doc correctly identifies that `message:received` hook context doesn't flow downstream to `get-reply-run.ts`, so graph context must be queried directly in `get-reply-run.ts`.

The single critical external dependency issue: **neo4j-driver is not installed anywhere in the openclaw project**. The graph MCP server uses a Python bridge instead of neo4j-driver. For LEVER-02 (direct Cypher queries in a new bundled hook or in get-reply-run.ts), the implementation must either (a) add `neo4j-driver` to the root package.json, or (b) use the existing Python bridge pattern (subprocess call to mcp_bridge.py). For LEVER-04 (graph_trace in KB MCP server, which is outside the git repo), neo4j-driver must also be `npm install`ed in that project.

**Primary recommendation:** Follow the design doc exactly — `kbQuery` async+hybrid, add `neo4j-driver` to openclaw root dependencies for the graph-context hook in `get-reply-run.ts`, wire graph MCP as stdio, add `graph_trace` to KB MCP with `npm install neo4j-driver` in that project.

---

## Standard Stack

### Core

| Library                          | Version                  | Purpose                                                   | Why Standard                                                                |
| -------------------------------- | ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `better-sqlite3`                 | existing (root deps)     | KB SQLite access                                          | Already used throughout mcp-servers.ts                                      |
| `sqlite-vec`                     | existing (loaded lazily) | Vector search on `vec_articles` / `vec_entities`          | Already loaded in `openKbDb()`, `kbVecAvailable` flag set                   |
| `neo4j-driver`                   | ^5.x                     | Bolt connection to Memgraph for graph context hook        | Used in PAIOS Python layer; needs to be added to openclaw root package.json |
| `@anthropic-ai/claude-agent-sdk` | existing                 | MCP server creation via `createSdkMcpServer()` + `tool()` | Existing in-process SDK pattern                                             |
| `@modelcontextprotocol/sdk`      | existing (graph project) | Graph MCP stdio server transport                          | Already used in `~/.openclaw/projects/graph/mcp-server.js`                  |

### Supporting

| Library  | Version  | Purpose                                       | When to Use                                           |
| -------- | -------- | --------------------------------------------- | ----------------------------------------------------- |
| `zod`    | existing | Input schema validation for new MCP tool args | Used for all in-process MCP tool schemas              |
| `vitest` | existing | Test framework                                | All new tests: bundled hook handler, MCP server tests |

### Alternatives Considered

| Instead of                               | Could Use                                              | Tradeoff                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neo4j-driver` in openclaw               | Python bridge subprocess (like graph MCP)              | Bridge adds latency + process spawn overhead for 3s-bounded context injection; neo4j-driver is cleaner and already proven with Memgraph                  |
| Direct neo4j-driver in graph_trace       | Route through existing graph MCP tools                 | MCP-to-MCP routing not available in KB MCP server; neo4j-driver in KB MCP project is the correct approach                                                |
| Bundled hook storing context in metadata | Calling queryGraphContext directly in get-reply-run.ts | Design doc correctly identifies that hook event metadata doesn't flow to get-reply-run.ts — direct call is simpler and matches the cross-channel pattern |

**Installation (root openclaw package):**

```bash
pnpm add neo4j-driver
```

**Installation (KB MCP project — outside git repo):**

```bash
cd ~/.openclaw/projects/knowledge-base && npm install neo4j-driver --save
```

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── hooks/
│   └── bundled/
│       └── graph-context/         # New bundled hook (LEVER-02)
│           ├── handler.ts         # HookHandler export + queryGraphContext export
│           ├── handler.test.ts    # 4 tests: export shape, event guards, no-throw
│           └── HOOK.md            # Required: event, timeout, min length
├── agents/
│   └── sdk-runner/
│       └── mcp-servers.ts         # kbQuery async, queryKbForContext async, graph-intelligence stdio entry
└── auto-reply/
    └── reply/
        └── get-reply-run.ts       # await queryKbForContext, add graphContextSection

~/.openclaw/projects/knowledge-base/
└── mcp-server.js                  # graph_trace tool added (outside git repo)
```

### Pattern 1: Hybrid Vector+FTS Merge

**What:** Run both FTS5 and vec_articles queries, normalize scores to [0,1], merge by article ID with weighted sum.
**When to use:** Whenever `kbVecAvailable` is true and `getQueryEmbedding()` returns non-null.
**Key insight from source:** `vecEntitySearch()` (line 534) already shows the correct sqlite-vec query pattern — `WHERE v.embedding MATCH ? AND k = ?` with `new Float32Array(queryEmbedding.buffer)` as the first argument. This same pattern applies to `vec_articles`.

```typescript
// Source: src/agents/sdk-runner/mcp-servers.ts:534 (vecEntitySearch — existing pattern)
const rows = db
  .prepare(
    `SELECT v.rowid as id, v.distance,
            a.url, a.title, a.summary ...
     FROM vec_articles v
     JOIN articles a ON a.id = v.rowid
     WHERE v.embedding MATCH ? AND k = ?
       AND NOT (a.para_type = 'archive' AND a.para_area = 'Build Artifacts')
     ORDER BY v.distance`,
  )
  .all(new Float32Array(embedding.buffer), safeLimit * 2);
```

**Score normalization:** FTS5 BM25 scores are negative (more negative = better). Normalize: `1 - ((rank - minRank) / range)`. Vec distances: `similarity = Math.max(0, 1 - distance)`. Weighted merge: `0.6 * similarity + 0.4 * normalizedFts`.

### Pattern 2: Async kbQuery with Fallback Chain

**What:** `kbQuery()` becomes async. FTS5 always runs first. Vec runs only if `kbVecAvailable`. Merge if both succeed. Fall back to pure FTS if vec fails.
**Why this order:** FTS never fails on an existing DB (synchronous). Vec can fail if sqlite-vec not loaded or embedding server down.

```typescript
// Always run FTS first, then conditionally attempt vec
async function kbQuery(query: string, limit: number): Promise<unknown[]> {
  // 1. FTS always runs (sync, reliable)
  let ftsResults = db.prepare(`...articles_fts MATCH ?...`).all(safeQuery, safeLimit * 2);

  // 2. Vec only when available
  if (kbVecAvailable) {
    const embedding = await getQueryEmbedding(query);
    if (embedding) {
      // merge and return hybrid results
    }
  }

  // 3. Fallback: pure FTS
  return ftsResults.slice(0, safeLimit);
}
```

### Pattern 3: Graph Context as a Latency-Bounded Call

**What:** Wrap graph query in `Promise.race([doQuery, setTimeout(empty, 3000)])`. Same pattern as cross-channel context in Phase 23.
**When to use:** All graph context injection. Memgraph may be unreachable.

```typescript
// Source pattern from 23-02 (crossChannelContext):
// src/auto-reply/reply/get-reply-run.ts:283
const graphResult = await Promise.race([
  queryGraphContext(bodyForKb),
  new Promise<string>((resolve) => setTimeout(() => resolve(""), 3000)),
]);
```

### Pattern 4: Stdio MCP Server Entry

**What:** Add external stdio servers to `buildSdkMcpServers()` using `fs.existsSync` guard.
**Source pattern:**

```typescript
// Pattern from buildSdkMcpServers (~line 420): filesystem server
const home = resolveRequiredHomeDir();
servers["filesystem"] = {
  type: "stdio" as const,
  command: "npx",
  args: [...],
};

// Graph: same pattern, check file exists first
const graphMcpPath = path.join(home, ".openclaw", "projects", "graph", "mcp-server.js");
if (fs.existsSync(graphMcpPath)) {
  servers["graph-intelligence"] = {
    type: "stdio" as const,
    command: process.execPath,   // node binary — avoids npx overhead
    args: [graphMcpPath],
    env: { ...process.env, HOME: home },
  };
}
```

**Important:** `path` and `fs` are currently `require()`d inside `openKbDb()` (local scope). For `buildSdkMcpServers()`, they must be required inline (same pattern) or imported at module top. The `resolveRequiredHomeDir()` import is already at the top of the file (line 13).

### Pattern 5: Bundled Hook Handler Structure

**What:** Every bundled hook follows a strict structure. See `bootstrap-extra-files/handler.ts` as template.

```typescript
// Required structure (from src/hooks/bundled/bootstrap-extra-files/handler.ts)
import type { HookHandler } from "../../hooks.js";
import { isMessageReceivedEvent } from "../../internal-hooks.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";

const log = createSubsystemLogger("hooks/graph-context");

const handler: HookHandler = async (event) => {
  if (!isMessageReceivedEvent(event)) return; // MUST be first line
  // ...
};

export default handler;
```

**Required files per bundled hook:**

- `handler.ts` — default export of type `HookHandler`
- `handler.test.ts` — vitest tests
- `HOOK.md` — documents the hook (required by bundled-dir.ts discovery)

### Anti-Patterns to Avoid

- **Changing `queryKbForContext` signature without updating `get-reply-run.ts`:** The call site at line 271 is synchronous today — must be `await`ed after the upgrade.
- **Using the hook event metadata to pass graph context downstream:** The design doc clarifies this doesn't work — `event.context.metadata` set in a hook is not accessible in `get-reply-run.ts`. Call `queryGraphContext` directly in `get-reply-run.ts` instead.
- **Forgetting to strip internal score fields before returning:** Both FTS `fts_rank` and vec `_score` fields must be removed from final results (use destructuring: `const { fts_rank, ...rest } = r`).
- **Not updating test assertions for withErrorBoundary count:** Line 122 checks `>= 12`. After adding a `graph_trace` tool to the in-process KB server (if that's the approach), this count increases.
- **Using `process.execPath` without checking it's Node:** `process.execPath` is always the current Node binary in gateway context — safe.

---

## Don't Hand-Roll

| Problem                         | Don't Build                  | Use Instead                                                       | Why                                                                  |
| ------------------------------- | ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Vec distance → similarity score | Custom normalization formula | `Math.max(0, 1 - distance)` — already used in `vecEntitySearch()` | Consistent with existing vec search pattern in same file             |
| FTS rank normalization          | Re-implementing BM25         | Min-max normalize the negative FTS ranks from `ORDER BY rank`     | Simple linear normalization works; BM25 is already applied by SQLite |
| Graph connection pooling        | Manual session management    | neo4j-driver session per query + `session.close()` in finally     | Driver handles connection pooling; session close is correct pattern  |
| Hybrid merge deduplication      | Custom data structure        | `Map<number, Record<string, unknown>>` keyed by article ID        | Standard JS Map handles dedup + accumulation cleanly                 |
| Timeout on graph queries        | Custom Promise race          | `Promise.race([query, new Promise(resolve => setTimeout(...))])`  | Same latency-bound pattern used in cross-channel context (23-02)     |

**Key insight:** `vecEntitySearch()` at line 534 is the exact reference implementation for vec search. The `kbQuery()` upgrade is essentially adapting this pattern for `vec_articles` instead of `vec_entities`.

---

## Common Pitfalls

### Pitfall 1: `queryKbForContext` Return Type Mismatch

**What goes wrong:** `get-reply-run.ts:271` calls `queryKbForContext(bodyForKb, 5)` synchronously. After the upgrade to async, TypeScript will error unless the call site adds `await`. The existing test at line 35 (`const result1 = queryKbForContext("")`) also breaks — it currently asserts `typeof result1 === "string"` but after the upgrade it's a Promise.
**Why it happens:** `queryKbForContext` is exported and called in at least two places.
**How to avoid:** Upgrade `queryKbForContext` signature first, then fix call site in `get-reply-run.ts`, then update mcp-servers.test.ts assertions. Run `pnpm tsgo` after each change.
**Warning signs:** TypeScript error `Property 'then' does not exist on type 'string'` or `Object is of type 'unknown'`.

### Pitfall 2: mcp-servers.test.ts Count Assertions

**What goes wrong:** Tests at lines 107-108 assert `kbToolMatches.length >= 11` and lines 121-124 assert `withErrorBoundary` count `>= 12`. If a `graph_trace` tool is added as an in-process MCP tool, these counts change.
**Why it happens:** Tests verify tool counts by reading the source file.
**How to avoid:** `graph_trace` belongs in the KB MCP server (`~/.openclaw/projects/knowledge-base/mcp-server.js`), NOT in the in-process `buildSdkMcpServers()`. This preserves the in-process tool counts.

### Pitfall 3: `fs.existsSync` Needed Before `process.execPath` Stdio Entry

**What goes wrong:** If `~/.openclaw/projects/graph/mcp-server.js` doesn't exist on a clean install, the MCP server config fails and `buildSdkMcpServers()` may throw or return an invalid config.
**Why it happens:** The graph project is PAIOS-specific — not part of the openclaw install.
**How to avoid:** The `fs.existsSync(graphMcpPath)` guard in the stdio entry is mandatory, same as how KB DB path is checked in `openKbDb()`.

### Pitfall 4: neo4j-driver Not Installed

**What goes wrong:** The graph-context hook handler imports `neo4j-driver` which isn't in `package.json`. Build fails or runtime `MODULE_NOT_FOUND`.
**Why it happens:** The existing graph MCP server uses Python bridge, not neo4j-driver. The openclaw package has never needed neo4j-driver.
**How to avoid:** Run `pnpm add neo4j-driver` in the openclaw root before implementing the graph-context hook. Verify in pnpm-lock.yaml.

### Pitfall 5: FTS5 Query Sanitization Discrepancy

**What goes wrong:** `kbQuery()` currently does `query.replace(/[^\p{L}\p{N}\s]/gu, " ")` without `.trim()`. If the query becomes all spaces, the FTS5 MATCH fails with an error.
**Why it happens:** FTS5 treats empty/whitespace queries as errors.
**How to avoid:** Add `.trim()` and check `if (!safeQuery)` before running the FTS query. The design doc already includes `.trim()` in the upgraded version.

### Pitfall 6: `dispatch-from-config.ts` Fires Hook Fire-and-Forget

**What goes wrong:** The `message:received` hook at line 204 is `void triggerInternalHook(...).catch(...)` — fire and forget. Any context written to `event.context.metadata` is not accessible by callers.
**Why it happens:** The hook fires before the reply logic but in a disconnected context object.
**How to avoid:** Do NOT try to read hook results in `get-reply-run.ts`. Instead, call `queryGraphContext()` directly in `get-reply-run.ts` alongside `queryKbForContext()`. The bundled hook handler can still be created (for future use or for hooks that send messages), but graph context injection for Auto-RAG must go directly in `get-reply-run.ts`.

---

## Code Examples

Verified patterns from live source files:

### Vec_articles Query (from vecEntitySearch pattern)

```typescript
// Source: src/agents/sdk-runner/mcp-servers.ts:544 (vecEntitySearch)
const rows = db
  .prepare(
    `SELECT v.rowid as id, v.distance,
            e.name, e.canonical_name, e.type ...
     FROM vec_entities v          -- use vec_articles for article search
     JOIN entities e ON e.id = v.rowid
     WHERE v.embedding MATCH ? AND k = ?
     ORDER BY v.distance`,
  )
  .all(new Float32Array(queryEmbedding.buffer), fetchLimit * 2);
```

### FTS5 Query (current kbQuery)

```typescript
// Source: src/agents/sdk-runner/mcp-servers.ts:579
function kbQuery(query: string, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safeQuery = query.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return db
    .prepare(
      `SELECT a.id, a.url, a.title, a.summary, a.type, a.platform, a.language,
              a.summary_l1, a.summary_l2, a.para_type, a.para_area
       FROM articles_fts fts
       JOIN articles a ON a.id = fts.rowid
       WHERE articles_fts MATCH ?
         AND NOT (a.para_type = 'archive' AND a.para_area = 'Build Artifacts')
       ORDER BY rank
       LIMIT ?`,
    )
    .all(safeQuery, safeLimit);
}
```

### Graph Query — Python Bridge Pattern (from mcp-server.js)

```javascript
// Source: ~/.openclaw/projects/graph/mcp-server.js:40
async function callBridge(command, args) {
  const argsJson = JSON.stringify(args);
  const { stdout } = await execAsync(
    `${PYTHON_BIN} ${MCP_BRIDGE} ${command} '${argsJson.replace(/'/g, "'\\''")}' 2>/dev/null`,
    {
      cwd: GRAPH_PROJECT_PATH,
      env: { ...process.env, PAIOS_GRAPH_URI: "bolt://localhost:7687" },
      timeout: 30000,
    },
  );
  return JSON.parse(stdout.trim());
}
```

### Current extraSystemPrompt Assembly

```typescript
// Source: src/auto-reply/reply/get-reply-run.ts:291
const extraSystemPrompt = [
  inboundMetaPrompt,
  groupChatContext,
  groupIntro,
  groupSystemPrompt,
  kbContextSection,
  crossChannelContextSection,
]
  .filter(Boolean)
  .join("\n\n");
```

### External Stdio MCP Entry Pattern

```typescript
// Source: src/agents/sdk-runner/mcp-servers.ts:420 (filesystem server)
const home = resolveRequiredHomeDir();
servers["filesystem"] = {
  type: "stdio" as const,
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", ...],
};
```

### Bundled Hook Handler Pattern (must match exactly)

```typescript
// Source: src/hooks/bundled/bootstrap-extra-files/handler.ts
import type { HookHandler } from "../../hooks.js";
import { isAgentBootstrapEvent } from "../../internal-hooks.js"; // use isMessageReceivedEvent for message hooks

const handler: HookHandler = async (event) => {
  if (!isAgentBootstrapEvent(event)) return; // type guard FIRST
  // ... logic ...
};
export default handler;
```

---

## State of the Art

| Old Approach                        | Current Approach                                  | When Changed | Impact                                                   |
| ----------------------------------- | ------------------------------------------------- | ------------ | -------------------------------------------------------- |
| FTS-only kbQuery                    | FTS-only (this phase upgrades it)                 | Phase 29     | Phase 29 makes both kbQuery and queryKbForContext hybrid |
| No graph context in replies         | Memgraph entity+decision context in system prompt | Phase 29     | LEVER-02                                                 |
| Graph MCP server exists but unwired | Wired into all agent sessions                     | Phase 29     | Agents can query graph directly                          |
| KB MCP has no causal traversal      | graph_trace tool added                            | Phase 29     | LEVER-04                                                 |

**Deprecated/outdated:**

- `Promise.resolve(kbQuery(...))` wrapper in kb_query tool handler: Once kbQuery is async, just call `kbQuery(...)` directly — the Promise.resolve wrapper becomes redundant.

---

## Open Questions

1. **neo4j-driver version compatibility with Memgraph bolt://localhost:7687**
   - What we know: Memgraph is compatible with neo4j-driver. PAIOS Python layer uses `neo4j` Python package with Memgraph.
   - What's unclear: Whether neo4j-driver v5.x has any bolt protocol changes that affect Memgraph compatibility.
   - Recommendation: Use neo4j-driver v5.x (current). Test with `driver.verifyConnectivity()` before first use in tests. Mock in unit tests.

2. **Graph context hook: bundled hook vs direct call in get-reply-run.ts**
   - What we know: The design doc recommends BOTH — create the bundled hook for future extensibility, AND export `queryGraphContext` for direct use in get-reply-run.ts.
   - What's unclear: Whether maintaining both is worth the complexity for Phase 29.
   - Recommendation: The plan doc is correct — create the bundled hook (for LEVER-02 completeness), but also call `queryGraphContext` directly in `get-reply-run.ts`. The hook exists as the canonical registration point; the direct call is how context actually flows.

3. **graph_trace tool location — KB MCP vs graph MCP**
   - What we know: LEVER-04 explicitly says KB MCP server. The design doc puts it in `~/.openclaw/projects/knowledge-base/mcp-server.js`. The graph MCP server already has `graph_causality` and `graph_timeline` tools via Python bridge.
   - What's unclear: Whether `graph_trace` in the KB MCP duplicates `graph_causality` from the graph MCP.
   - Recommendation: Implement as specified (KB MCP) — `graph_trace` answers KB-centric questions (given an article topic, trace its causal graph), while `graph_causality` in the graph MCP is a general-purpose Cypher tool.

---

## Validation Architecture

### Test Framework

| Property           | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| Framework          | Vitest (v4)                                           |
| Config file        | vitest.config.ts (root)                               |
| Quick run command  | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts` |
| Full suite command | `pnpm test`                                           |

### Phase Requirements → Test Map

| Req ID   | Behavior                                                   | Test Type  | Automated Command                                                                              | File Exists?        |
| -------- | ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| LEVER-01 | `queryKbForContext` returns Promise after async upgrade    | unit       | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "queryKbForContext returns a Promise"` | ❌ Wave 0           |
| LEVER-01 | `kbQuery` async capability (module loads, exports defined) | unit       | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "kbQuery function"`                    | ❌ Wave 0           |
| LEVER-02 | graph-context handler exports a function                   | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "exports a default function"`    | ❌ Wave 0           |
| LEVER-02 | handler ignores non-message events                         | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "ignores non-message"`           | ❌ Wave 0           |
| LEVER-02 | handler doesn't throw on message:received                  | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "handles message:received"`      | ❌ Wave 0           |
| LEVER-02 | handler skips short/command messages                       | unit       | `pnpm test src/hooks/bundled/graph-context/handler.test.ts -t "skips empty"`                   | ❌ Wave 0           |
| LEVER-03 | buildSdkMcpServers includes graph-intelligence key         | unit       | `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "includes graph-intelligence"`         | ❌ Wave 0           |
| LEVER-05 | All existing tests pass unchanged                          | regression | `pnpm test`                                                                                    | ✅ (existing suite) |
| LEVER-05 | TypeScript clean                                           | typecheck  | `pnpm tsgo`                                                                                    | ✅ (existing)       |

### Sampling Rate

- **Per task commit:** `pnpm test src/agents/sdk-runner/mcp-servers.test.ts`
- **Per wave merge:** `pnpm test && pnpm tsgo`
- **Phase gate:** Full suite green + `pnpm tsgo` clean before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/hooks/bundled/graph-context/handler.test.ts` — covers LEVER-02 (4 tests per design doc)
- [ ] `src/hooks/bundled/graph-context/handler.ts` — the handler itself
- [ ] `src/hooks/bundled/graph-context/HOOK.md` — required by bundled-dir.ts discovery
- [ ] New test cases in `src/agents/sdk-runner/mcp-servers.test.ts` — covers LEVER-01 async return and LEVER-03 graph-intelligence key
- [ ] `pnpm add neo4j-driver` — required before graph-context hook compiles

---

## Sources

### Primary (HIGH confidence)

- `src/agents/sdk-runner/mcp-servers.ts` — Verified: `kbQuery` at line 579 (sync, FTS only), `kbVecAvailable` at line 456, `getQueryEmbedding` at line 502, `vecEntitySearch` at line 534, `buildSdkMcpServers` at line 65, external stdio pattern at lines 356-439
- `src/auto-reply/reply/get-reply-run.ts` — Verified: `queryKbForContext` call at line 271 (sync), `extraSystemPrompt` assembly at line 291, `crossChannelContextSection` pattern at lines 280-289
- `src/hooks/internal-hooks.ts` — Verified: `isMessageReceivedEvent` type guard at line 258, `createInternalHookEvent` at line 220, `MessageReceivedHookContext.metadata` at line 62
- `src/auto-reply/reply/dispatch-from-config.ts` — Verified: `message:received` hook fires at line 204, fire-and-forget (`void`), metadata is included in hook context
- `src/hooks/bundled/bootstrap-extra-files/handler.ts` — Verified: canonical bundled hook structure
- `~/.openclaw/projects/graph/mcp-server.js` — Verified: 6 tools, Python bridge pattern, `process.execPath` (node), MCP stdio transport
- `src/agents/sdk-runner/mcp-servers.test.ts` — Verified: count assertions at lines 107, 122 that will need updating if in-process tools change

### Secondary (MEDIUM confidence)

- `~/.openclaw/projects/knowledge-base/mcp-server.js` — Verified structure (828 lines, tools object at line 181, 11 existing tools); neo4j-driver absent from KB project node_modules
- `~/.openclaw/projects/graph/package.json` — Verified: no neo4j-driver, only `@modelcontextprotocol/sdk`

### Tertiary (LOW confidence)

- neo4j-driver v5.x Memgraph compatibility — based on known Memgraph/neo4j protocol alignment; not directly verified against current neo4j-driver v5 changelog

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all dependencies verified in live source files
- Architecture: HIGH — patterns extracted directly from working production code in same repo
- Pitfalls: HIGH — identified from actual test assertions in mcp-servers.test.ts and flow analysis of dispatch-from-config.ts
- neo4j-driver Memgraph compatibility: MEDIUM — well-known compatibility but version details unverified

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain — sqlite-vec, neo4j-driver, Memgraph bolt protocol are stable)
