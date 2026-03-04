# DB Knowledge Leverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Activate the full vector + graph stack so every agent response draws on semantic search, causal graph context, and episodic memory — not just keyword FTS.

**Architecture:** Four layered improvements: (1) upgrade the in-process `kbQuery` and `queryKbForContext` functions from FTS-only to hybrid vector+FTS, (2) add a `message:received` hook that injects graph context from Memgraph into every Auto-RAG system prompt, (3) expose the graph MCP server to agent sessions so agents can issue Cypher queries on demand, (4) add a `graph_trace` tool to the KB MCP server for causal chain and timeline traversal.

**Tech Stack:** TypeScript (strict ESM), better-sqlite3, sqlite-vec, neo4j driver (bolt://localhost:7687), vitest, existing hook system (`registerInternalHook`), existing `withErrorBoundary` + `retryWithBackoff` patterns.

---

## Current State (read before touching anything)

| Location                                                               | What it does now                                  | Gap                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `src/agents/sdk-runner/mcp-servers.ts:kbQuery()` (line ~618)           | FTS5 only — `articles_fts MATCH ?`                | No vector search                         |
| `src/agents/sdk-runner/mcp-servers.ts:queryKbForContext()` (line ~850) | FTS5 only — same query                            | No vector search                         |
| `src/auto-reply/reply/get-reply-run.ts:271`                            | Calls `queryKbForContext(bodyForKb, 5)`           | Result is FTS-only                       |
| `~/.openclaw/projects/graph/mcp-server.js`                             | Full graph MCP (6 tools)                          | Not wired to agent sessions              |
| `src/hooks/bundled/`                                                   | 4 bundled hooks, none query graph                 | No graph context injection               |
| `src/agents/sdk-runner/mcp-servers.ts`                                 | Has `kbVecAvailable` flag + `getQueryEmbedding()` | Already loaded, just not used in kbQuery |

## Key Constants (do not change)

- Embedding server: `http://127.0.0.1:11435/v1/embeddings` (768-dim nomic)
- Graph bolt: `bolt://localhost:7687` (no auth: `""`, `""`)
- Vec table: `vec_articles` — `WHERE v.embedding MATCH ? AND k = ?` — arg is `new Float32Array(buffer)`
- Hybrid weights: semantic `0.6`, FTS `0.4` (matches `mcp-server.js`)
- `kbVecAvailable` and `getQueryEmbedding()` already exist in `mcp-servers.ts`

---

## Task 1: Upgrade `kbQuery()` to Hybrid Vector+FTS

**Files:**

- Modify: `src/agents/sdk-runner/mcp-servers.ts` — `kbQuery()` function (~line 618)
- Test: `src/agents/sdk-runner/mcp-servers.test.ts`

**Context:** `kbQuery()` is the function backing the `kb_query` MCP tool used inside agent sessions. It currently runs FTS5 only. `kbVecAvailable` and `getQueryEmbedding()` already exist in this file — we just need to add the vec path and merge.

### Step 1: Write the failing test

Add to `src/agents/sdk-runner/mcp-servers.test.ts`:

```typescript
it("kbQuery function is async-capable (type check)", async () => {
  const mcpServers = await import("./mcp-servers.js");
  // The kbQuery internal function isn't exported, but queryKbForContext is
  // We verify the module loads — hybrid logic is integration-tested separately
  expect(mcpServers.queryKbForContext).toBeDefined();
  // Verify it returns a string (not a Promise<string>) — will change after Task 2
  const result = mcpServers.queryKbForContext("knowledge management");
  expect(typeof result).toBe("string");
});
```

Run: `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "kbQuery function"`
Expected: PASS (baseline — confirms current sync return type)

### Step 2: Change `kbQuery()` to async with hybrid search

Replace the `kbQuery` function in `src/agents/sdk-runner/mcp-servers.ts`:

**Before** (~line 618):

```typescript
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

**After:**

```typescript
const WEIGHT_SEMANTIC = 0.6;
const WEIGHT_FTS = 0.4;

async function kbQuery(query: string, limit: number): Promise<unknown[]> {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safeQuery = query.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();

  // FTS path (always runs)
  let ftsResults: Array<Record<string, unknown>> = [];
  try {
    ftsResults = db
      .prepare(
        `SELECT a.id, a.url, a.title, a.summary, a.type, a.platform, a.language,
                a.summary_l1, a.summary_l2, a.para_type, a.para_area,
                fts.rank as fts_rank
         FROM articles_fts fts
         JOIN articles a ON a.id = fts.rowid
         WHERE articles_fts MATCH ?
           AND NOT (a.para_type = 'archive' AND a.para_area = 'Build Artifacts')
         ORDER BY rank
         LIMIT ?`,
      )
      .all(safeQuery, safeLimit * 2) as Array<Record<string, unknown>>;
  } catch {
    // FTS failure — proceed with vec only
  }

  // Vec path (runs when embedding server available)
  if (kbVecAvailable) {
    const embedding = await getQueryEmbedding(query);
    if (embedding) {
      try {
        const vecResults = db
          .prepare(
            `SELECT v.rowid as id, v.distance,
                    a.url, a.title, a.summary, a.type, a.platform, a.language,
                    a.summary_l1, a.summary_l2, a.para_type, a.para_area
             FROM vec_articles v
             JOIN articles a ON a.id = v.rowid
             WHERE v.embedding MATCH ? AND k = ?
               AND NOT (a.para_type = 'archive' AND a.para_area = 'Build Artifacts')
             ORDER BY v.distance`,
          )
          .all(new Float32Array(embedding.buffer), safeLimit * 2) as Array<Record<string, unknown>>;

        // Hybrid merge: weighted score = 0.6 * semantic + 0.4 * fts
        const merged = new Map<number, Record<string, unknown>>();

        // Normalize FTS ranks (BM25: more negative = better, map to [0,1])
        const ftsRanks = ftsResults.map((r) => r.fts_rank as number);
        const minRank = ftsRanks.length > 0 ? Math.min(...ftsRanks) : -1;
        const maxRank = ftsRanks.length > 0 ? Math.max(...ftsRanks) : 0;
        const ftsRange = maxRank - minRank || 1;

        for (const r of ftsResults) {
          const id = r.id as number;
          const normalizedFts = 1 - ((r.fts_rank as number) - minRank) / ftsRange;
          const { fts_rank, ...article } = r;
          merged.set(id, { ...article, _score: WEIGHT_FTS * normalizedFts });
        }

        for (const r of vecResults) {
          const id = r.id as number;
          const { distance, ...article } = r;
          const similarity = Math.max(0, 1 - ((distance as number) || 0));
          const semScore = WEIGHT_SEMANTIC * similarity;
          if (merged.has(id)) {
            merged.get(id)!._score = (merged.get(id)!._score as number) + semScore;
          } else {
            merged.set(id, { ...article, _score: semScore });
          }
        }

        return Array.from(merged.values())
          .sort((a, b) => (b._score as number) - (a._score as number))
          .slice(0, safeLimit)
          .map(({ _score, ...rest }) => rest);
      } catch {
        // Vec failed — fall through to FTS results
      }
    }
  }

  // Fallback: pure FTS results (strip internal rank field)
  return ftsResults.slice(0, safeLimit).map(({ fts_rank, ...rest }) => rest);
}
```

### Step 3: Update the `kb_query` tool handler to await kbQuery

In `mcp-servers.ts`, the `kb_query` tool handler calls `kbQuery` inside `Promise.resolve(kbQuery(...))`. Since `kbQuery` is now async, update the tool handler:

Find (~line 107):

```typescript
withErrorBoundary("kb_query", async ({ query, limit }) => {
  const results = await retryWithBackoff(
    async () =>
      callWithTimeout(
        async () => Promise.resolve(kbQuery(query, limit ?? 5)),
```

Change `Promise.resolve(kbQuery(...))` to just `kbQuery(...)`:

```typescript
withErrorBoundary("kb_query", async ({ query, limit }) => {
  const results = await retryWithBackoff(
    async () =>
      callWithTimeout(
        async () => kbQuery(query, limit ?? 5),
```

### Step 4: Run tests

```bash
pnpm test src/agents/sdk-runner/mcp-servers.test.ts
```

Expected: All existing tests pass (they test module shape, not query logic)

```bash
pnpm tsgo
```

Expected: No type errors

### Step 5: Commit

```bash
scripts/committer "feat(kb): upgrade SDK kbQuery to hybrid vector+FTS search" \
  src/agents/sdk-runner/mcp-servers.ts \
  src/agents/sdk-runner/mcp-servers.test.ts
```

---

## Task 2: Upgrade `queryKbForContext()` to Hybrid (Auto-RAG)

**Files:**

- Modify: `src/agents/sdk-runner/mcp-servers.ts` — `queryKbForContext()` function (~line 850)
- Test: `src/agents/sdk-runner/mcp-servers.test.ts`

**Context:** `queryKbForContext` is called directly in `get-reply-run.ts:271` as `queryKbForContext(bodyForKb, 5)` — synchronously. It's used for Auto-RAG system prompt injection. We need to make it async and update the call site.

### Step 1: Write the failing test

Add to `src/agents/sdk-runner/mcp-servers.test.ts`:

```typescript
it("queryKbForContext returns a Promise (async upgrade)", async () => {
  const mcpServers = await import("./mcp-servers.js");
  const result = mcpServers.queryKbForContext("knowledge management");
  // After upgrade, this should be a Promise
  expect(result).toBeInstanceOf(Promise);
  const resolved = await result;
  expect(typeof resolved).toBe("string");
});
```

Run: `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "queryKbForContext returns a Promise"`
Expected: **FAIL** — currently returns string, not Promise

### Step 2: Make `queryKbForContext` async with vector path

Replace the `queryKbForContext` function in `src/agents/sdk-runner/mcp-servers.ts`:

**Before:**

```typescript
export function queryKbForContext(query: string, limit = 5): string {
  try {
    const db = getKbDb();
    ...
    const rows = db.prepare(`...articles_fts MATCH ?...`).all(safeQuery, safeLimit);
    if (!rows || rows.length === 0) return "";
    const lines = rows.map((r) => {
      const summary = (r.summary_l2 ?? "").slice(0, 500);
      const tags = r.tags ? ` [${r.tags}]` : "";
      return `- **${r.title}**${tags}\n  ${summary}`;
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}
```

**After:**

```typescript
export async function queryKbForContext(query: string, limit = 5): Promise<string> {
  try {
    const results = await kbQuery(query, limit);
    if (!results || results.length === 0) return "";

    const lines = (
      results as Array<{
        title?: string;
        summary_l2?: string;
        summary?: string;
        tags?: string;
      }>
    ).map((r) => {
      const summary = (r.summary_l2 ?? r.summary ?? "").slice(0, 500);
      const tags = r.tags ? ` [${r.tags}]` : "";
      return `- **${r.title ?? "Untitled"}**${tags}\n  ${summary}`;
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}
```

This reuses the hybrid `kbQuery()` from Task 1 — single implementation, both paths get vector search.

### Step 3: Update the call site in `get-reply-run.ts`

File: `src/auto-reply/reply/get-reply-run.ts`

Find (~line 269):

```typescript
try {
  const kbResult = queryKbForContext(bodyForKb, 5);
  if (kbResult) {
    kbContextSection = `--- RELEVANT KB CONTEXT ---\n${kbResult}`;
  }
} catch {
  // KB unavailable — skip silently
}
```

Replace with:

```typescript
try {
  const kbResult = await queryKbForContext(bodyForKb, 5);
  if (kbResult) {
    kbContextSection = `--- RELEVANT KB CONTEXT ---\n${kbResult}`;
  }
} catch {
  // KB unavailable — skip silently
}
```

### Step 4: Run type check and tests

```bash
pnpm tsgo
```

Expected: No errors

```bash
pnpm test src/agents/sdk-runner/mcp-servers.test.ts
pnpm test src/auto-reply/reply/get-reply-run.test.ts 2>/dev/null || echo "no get-reply-run tests — ok"
```

Expected: All pass

### Step 5: Commit

```bash
scripts/committer "feat(kb): make queryKbForContext async with hybrid vector search" \
  src/agents/sdk-runner/mcp-servers.ts \
  src/auto-reply/reply/get-reply-run.ts \
  src/agents/sdk-runner/mcp-servers.test.ts
```

---

## Task 3: Graph Context Hook (`message:received`)

**Files:**

- Create: `src/hooks/bundled/graph-context/handler.ts`
- Create: `src/hooks/bundled/graph-context/handler.test.ts`
- Create: `src/hooks/bundled/graph-context/HOOK.md`

**Context:** The `message:received` hook fires in `dispatch-from-config.ts:203` for every inbound message. We create a bundled hook handler that queries Memgraph for entities and recent related events, then pushes formatted context into `event.messages` (the same mechanism used by `bootstrap-extra-files`).

The hook handler structure must match the existing bundled handler pattern exactly:

- Default export of type `HookHandler`
- Import from `../../hooks.js` and `../../internal-hooks.js`
- Type guard first line: `if (!isMessageReceivedEvent(event)) return;`
- Never throws — wraps everything in try/catch

### Step 1: Write the failing test

Create `src/hooks/bundled/graph-context/handler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInternalHookEvent } from "../../internal-hooks.js";

// Mock neo4j to avoid needing a live Memgraph in tests
vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => ({
      session: vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      })),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    auth: { basic: vi.fn(() => ({})) },
  },
}));

describe("graph-context hook handler", () => {
  it("exports a default function", async () => {
    const mod = await import("./handler.js");
    expect(typeof mod.default).toBe("function");
  });

  it("ignores non-message-received events", async () => {
    const { default: handler } = await import("./handler.js");
    const event = createInternalHookEvent("agent", "bootstrap", "test-session", {
      workspaceDir: "/tmp",
      bootstrapFiles: [],
    });
    // Should not throw
    await expect(handler(event)).resolves.toBeUndefined();
  });

  it("handles message:received event without throwing", async () => {
    const { default: handler } = await import("./handler.js");
    const event = createInternalHookEvent("message", "received", "test-session", {
      from: "+1234567890",
      content: "tell me about knowledge management",
      channelId: "whatsapp",
      conversationId: "conv-123",
    });
    // Must not throw even if graph is down
    await expect(handler(event)).resolves.toBeUndefined();
  });

  it("skips empty or command messages", async () => {
    const { default: handler } = await import("./handler.js");
    const event = createInternalHookEvent("message", "received", "test-session", {
      from: "+1234567890",
      content: "/help",
      channelId: "whatsapp",
    });
    await expect(handler(event)).resolves.toBeUndefined();
  });
});
```

Run: `pnpm test src/hooks/bundled/graph-context/handler.test.ts`
Expected: **FAIL** — handler file doesn't exist yet

### Step 2: Create the hook handler

Create `src/hooks/bundled/graph-context/handler.ts`:

```typescript
/**
 * Graph Context Hook
 *
 * Fires on message:received. Queries Memgraph for:
 *   1. Recent Events/Decisions related to entities detected in the message (Graphiti search)
 *   2. Causal context: events that CAUSED_BY or HAPPENED_ON recent dates
 *
 * Injects a formatted context block into event.context.metadata.graphContext
 * which is then available to the Auto-RAG system prompt builder.
 *
 * Never throws. Skips silently if Memgraph is unreachable or message is < 10 chars.
 */
import neo4j from "neo4j-driver";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { HookHandler } from "../../hooks.js";
import { isMessageReceivedEvent } from "../../internal-hooks.js";

const log = createSubsystemLogger("hooks/graph-context");

const BOLT_URI = "bolt://localhost:7687";
const GRAPH_TIMEOUT_MS = 3000;
const MIN_QUERY_LEN = 10;

// Driver is lazily created and reused
let _driver: ReturnType<typeof neo4j.driver> | null = null;

function getDriver() {
  if (!_driver) {
    _driver = neo4j.driver(BOLT_URI, neo4j.auth.basic("", ""), {
      connectionTimeout: GRAPH_TIMEOUT_MS,
      maxConnectionLifetime: 3600_000,
    });
  }
  return _driver;
}

/**
 * Extract key terms from message content for graph entity matching.
 * Simple: strip punctuation, take words > 3 chars, deduplicate, limit 5.
 */
function extractTerms(content: string): string[] {
  return [
    ...new Set(
      content
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 10),
    ),
  ].slice(0, 5);
}

async function queryGraphContext(query: string): Promise<string> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const terms = extractTerms(query);
    if (terms.length === 0) return "";

    // Match entities by name keywords, then find recent related events + decisions
    const cypher = `
      MATCH (e:Entity)
      WHERE any(term IN $terms WHERE toLower(e.name) CONTAINS toLower(term))
      WITH e LIMIT 5
      OPTIONAL MATCH (e)<-[:MENTIONS]-(ev:Event)
      WHERE ev.valid_at >= $since
      WITH e, collect(ev)[..3] AS events
      OPTIONAL MATCH (e)<-[:MENTIONS]-(d:Decision)
      RETURN e.name AS entity,
             [ev IN events | ev.action + ': ' + coalesce(ev.category,'') + ' (' + coalesce(ev.outcome,'') + ')'] AS recentEvents,
             collect(DISTINCT d.title)[..2] AS decisions
      LIMIT 5
    `;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await session.run(cypher, { terms, since });

    if (result.records.length === 0) return "";

    const lines: string[] = ["[Graph Context]"];
    for (const record of result.records) {
      const entity = record.get("entity") as string;
      const events = record.get("recentEvents") as string[];
      const decisions = record.get("decisions") as string[];
      lines.push(`• ${entity}`);
      if (events.length > 0) lines.push(`  Events: ${events.join(" | ")}`);
      if (decisions.length > 0) lines.push(`  Decisions: ${decisions.join(", ")}`);
    }

    return lines.join("\n");
  } finally {
    await session.close();
  }
}

const handler: HookHandler = async (event) => {
  if (!isMessageReceivedEvent(event)) return;

  const content = event.context.content ?? "";
  if (content.length < MIN_QUERY_LEN || content.startsWith("/")) return;

  try {
    const graphContext = await Promise.race([
      queryGraphContext(content),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), GRAPH_TIMEOUT_MS)),
    ]);

    if (graphContext) {
      // Store in metadata — get-reply-run.ts reads event.context.metadata
      if (!event.context.metadata) {
        (event.context as Record<string, unknown>).metadata = {};
      }
      (event.context.metadata as Record<string, unknown>).graphContext = graphContext;
      log.debug(`injected graph context (${graphContext.length} chars)`);
    }
  } catch (err) {
    // Graph unavailable — skip silently, never block message processing
    log.debug(`graph context skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
};

export default handler;
```

### Step 3: Create HOOK.md

Create `src/hooks/bundled/graph-context/HOOK.md`:

```markdown
# graph-context

Fires on `message:received`. Queries Memgraph for entities mentioned in the
incoming message and injects related recent events and decisions into
`event.context.metadata.graphContext`.

Used by the Auto-RAG system prompt builder in `get-reply-run.ts` to provide
temporal and causal context alongside KB article matches.

**Event:** `message:received`
**Timeout:** 3 seconds (skips silently if graph is slow)
**Min message length:** 10 characters (skips commands starting with `/`)
```

### Step 4: Run tests

```bash
pnpm test src/hooks/bundled/graph-context/handler.test.ts
```

Expected: All 4 tests pass

```bash
pnpm tsgo
```

Expected: No type errors

### Step 5: Commit

```bash
scripts/committer "feat(hooks): add graph-context bundled hook for message:received" \
  src/hooks/bundled/graph-context/handler.ts \
  src/hooks/bundled/graph-context/handler.test.ts \
  src/hooks/bundled/graph-context/HOOK.md
```

---

## Task 4: Surface Graph Context in Auto-RAG System Prompt

**Files:**

- Modify: `src/auto-reply/reply/get-reply-run.ts`

**Context:** The graph-context hook (Task 3) writes context into `event.context.metadata.graphContext`. However, `get-reply-run.ts` builds the system prompt before the hook fires — the hook fires at the `dispatch-from-config.ts` layer. So the right approach is different: the hook stores context and `get-reply-run.ts` reads it from the session context at reply time.

Actually — looking at the flow more carefully: `dispatch-from-config.ts:203` fires the hook, then calls the reply logic. The `event.context.metadata` is local to the hook event object and isn't passed downstream. The simpler approach: call `queryGraphContext` directly in `get-reply-run.ts` alongside `queryKbForContext`, the same way KB context is already injected.

### Step 1: Add graph context query helper to `get-reply-run.ts`

File: `src/auto-reply/reply/get-reply-run.ts`

Add import at top (with other imports):

```typescript
import { queryGraphContext } from "../../hooks/bundled/graph-context/handler.js";
```

> **Note:** We need to export `queryGraphContext` from `handler.ts`. Add this line to `handler.ts` after the function definition:
>
> ```typescript
> export { queryGraphContext };
> ```

### Step 2: Add graph context injection in `get-reply-run.ts`

After the existing `kbContextSection` block (~line 279), add:

```typescript
// Graph-RAG: inject causal/temporal context from Memgraph
let graphContextSection = "";
if (bodyForKb.length >= 10 && !bodyForKb.startsWith("/")) {
  try {
    const graphResult = await queryGraphContext(bodyForKb);
    if (graphResult) {
      graphContextSection = `--- GRAPH CONTEXT ---\n${graphResult}`;
    }
  } catch {
    // Graph unavailable — skip silently
  }
}
```

Then add `graphContextSection` to the `extraSystemPrompt` array:

Find:

```typescript
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

Replace with:

```typescript
const extraSystemPrompt = [
  inboundMetaPrompt,
  groupChatContext,
  groupIntro,
  groupSystemPrompt,
  kbContextSection,
  graphContextSection,
  crossChannelContextSection,
]
  .filter(Boolean)
  .join("\n\n");
```

### Step 3: Export `queryGraphContext` from handler.ts

In `src/hooks/bundled/graph-context/handler.ts`, add export after function definition:

```typescript
export { queryGraphContext };
```

### Step 4: Run type check

```bash
pnpm tsgo
```

Expected: No type errors

### Step 5: Commit

```bash
scripts/committer "feat(auto-rag): inject Memgraph causal context into system prompt" \
  src/auto-reply/reply/get-reply-run.ts \
  src/hooks/bundled/graph-context/handler.ts
```

---

## Task 5: Wire Graph MCP Server to Agent Sessions

**Files:**

- Modify: `src/agents/sdk-runner/mcp-servers.ts` — `buildSdkMcpServers()` function

**Context:** `~/.openclaw/projects/graph/mcp-server.js` already exists with 6 tools (graph_query, graph_context, graph_causality, graph_timeline, graph_entity, graph_learn). It's a stdio MCP server. The SDK runner already wires external stdio MCPs (google-workspace, cloudflare, etc.) as `{ type: "stdio", command, args, env }` entries. We add the graph MCP the same way.

### Step 1: Write the failing test

Add to `src/agents/sdk-runner/mcp-servers.test.ts`:

```typescript
it("buildSdkMcpServers includes graph-intelligence server config", async () => {
  const mcpServers = await import("./mcp-servers.js");
  const result = await mcpServers.buildSdkMcpServers();
  if (result !== undefined) {
    // Graph server should be present
    expect(Object.keys(result)).toContain("graph-intelligence");
  }
});
```

Run: `pnpm test src/agents/sdk-runner/mcp-servers.test.ts -t "includes graph-intelligence"`
Expected: **FAIL** — graph-intelligence not in result

### Step 2: Add graph MCP to `buildSdkMcpServers()`

Find the section in `buildSdkMcpServers()` where external stdio servers are added (look for `"google-workspace"` or `"brave-search"`). Add the graph server in the same block:

```typescript
// --- Graph Intelligence MCP server (Memgraph via mcp_bridge.py) ---
const graphMcpPath = path.join(
  resolveRequiredHomeDir(),
  ".openclaw",
  "projects",
  "graph",
  "mcp-server.js",
);
if (fs.existsSync(graphMcpPath)) {
  servers["graph-intelligence"] = {
    type: "stdio" as const,
    command: process.execPath, // node binary
    args: [graphMcpPath],
    env: {
      ...process.env,
      HOME: resolveRequiredHomeDir(),
    },
  };
}
```

> **Note:** `path` and `fs` are already `require`d inside `openKbDb()` — hoist them to module-level requires or use the same `require("node:path")` / `require("node:fs")` pattern already in this file.

### Step 3: Run tests and type check

```bash
pnpm test src/agents/sdk-runner/mcp-servers.test.ts
pnpm tsgo
```

Expected: All pass including new test

### Step 4: Smoke test — confirm graph tools appear in session

After building (`pnpm build`), restart the gateway and verify via `pnpm openclaw status` or by checking the gateway log for `[agent/sdk-mcp] graph-intelligence`.

### Step 5: Commit

```bash
scripts/committer "feat(sdk): wire graph-intelligence MCP server to agent sessions" \
  src/agents/sdk-runner/mcp-servers.ts \
  src/agents/sdk-runner/mcp-servers.test.ts
```

---

## Task 6: Add `graph_trace` Tool to KB MCP Server

**Files:**

- Modify: `~/.openclaw/projects/knowledge-base/mcp-server.js`

**Context:** The standalone KB MCP server (`mcp-server.js`) already has a Memgraph connection available (the graph project is on the same host). We add a `graph_trace` tool that answers: "what caused this?" and "what followed from this?" using `CAUSED_BY` + `LED_TO` edge traversal in Memgraph.

This lives in the KB MCP server (not the graph MCP server) because it bridges KB articles with graph causality — given a KB article or search term, trace the causal graph.

### Step 1: Add neo4j client to KB MCP server

At the top of `~/.openclaw/projects/knowledge-base/mcp-server.js`, after existing requires:

```javascript
// Lazy Memgraph client
let _graphDriver = null;
const GRAPH_URI = "bolt://localhost:7687";

function getGraphDriver() {
  if (!_graphDriver) {
    const neo4j = require("neo4j-driver");
    _graphDriver = neo4j.driver(GRAPH_URI, neo4j.auth.basic("", ""), {
      connectionTimeout: 3000,
    });
  }
  return _graphDriver;
}
```

### Step 2: Check neo4j-driver is available in KB project

```bash
cd ~/.openclaw/projects/knowledge-base && node -e "require('neo4j-driver'); console.log('ok')" 2>&1
```

If not available:

```bash
cd ~/.openclaw/projects/knowledge-base && npm install neo4j-driver --save
```

### Step 3: Add the `graph_trace` tool

In `~/.openclaw/projects/knowledge-base/mcp-server.js`, add as the 12th tool (after `kb_communities`):

```javascript
{
  name: 'graph_trace',
  description: 'Trace causal chains in the knowledge graph. Given a topic or entity name, returns what events caused it, what followed from it, and related decisions. Use for root cause analysis and consequence tracing.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Entity name or topic to trace causality for',
      },
      direction: {
        type: 'string',
        enum: ['causes', 'effects', 'both'],
        description: 'causes = what led to this, effects = what followed, both = full chain. Default: both',
      },
      depth: {
        type: 'number',
        description: 'Hop depth for traversal (1-3). Default: 2',
      },
      limit: {
        type: 'number',
        description: 'Max results per direction. Default: 10',
      },
    },
    required: ['topic'],
  },
},
```

### Step 4: Add the tool handler in the `CallToolRequest` switch

Find the `switch (name)` or `if (name === ...)` block and add:

```javascript
case 'graph_trace': {
  const topic = String(args.topic || '').trim();
  if (!topic) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'topic required' }) }] };
  }
  const direction = String(args.direction || 'both');
  const depth = Math.max(1, Math.min(3, Number(args.depth) || 2));
  const limit = Math.max(1, Math.min(20, Number(args.limit) || 10));

  try {
    const driver = getGraphDriver();
    const session = driver.session({ defaultAccessMode: 'READ' });

    const results = {};

    try {
      if (direction === 'causes' || direction === 'both') {
        // What caused/preceded this topic
        const causesCypher = `
          MATCH (e:Entity)
          WHERE toLower(e.name) CONTAINS toLower($topic)
          WITH e LIMIT 3
          MATCH path = (cause)-[:CAUSED_BY|HAPPENED_ON*1..${depth}]->(ev:Event)-[:MENTIONS]->(e)
          RETURN cause, ev, length(path) AS hops
          ORDER BY hops, ev.valid_at DESC
          LIMIT $limit
        `;
        const causesResult = await session.run(causesCypher, { topic, limit: neo4j.integer.fromNumber(limit) });
        results.causes = causesResult.records.map(r => ({
          cause: r.get('cause').properties,
          event: r.get('ev').properties,
          hops: r.get('hops').toNumber(),
        }));
      }

      if (direction === 'effects' || direction === 'both') {
        // What followed / was decided because of this topic
        const effectsCypher = `
          MATCH (e:Entity)
          WHERE toLower(e.name) CONTAINS toLower($topic)
          WITH e LIMIT 3
          MATCH path = (e)<-[:MENTIONS]-(ev:Event)-[:LED_TO|SUPPORTS*1..${depth}]->(effect)
          RETURN ev, effect, length(path) AS hops
          ORDER BY hops, ev.valid_at DESC
          LIMIT $limit
        `;
        const effectsResult = await session.run(effectsCypher, { topic, limit: neo4j.integer.fromNumber(limit) });
        results.effects = effectsResult.records.map(r => ({
          event: r.get('ev').properties,
          effect: r.get('effect').properties,
          hops: r.get('hops').toNumber(),
        }));
      }

      // Related decisions
      const decisionsCypher = `
        MATCH (e:Entity)
        WHERE toLower(e.name) CONTAINS toLower($topic)
        WITH e LIMIT 3
        MATCH (e)<-[:MENTIONS]-(d:Decision)
        RETURN d.title AS title, d.outcome AS outcome, d.valid_at AS date
        ORDER BY d.valid_at DESC
        LIMIT 5
      `;
      const decisionsResult = await session.run(decisionsCypher, { topic });
      results.decisions = decisionsResult.records.map(r => ({
        title: r.get('title'),
        outcome: r.get('outcome'),
        date: r.get('date'),
      }));

    } finally {
      await session.close();
    }

    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  } catch (err) {
    // Memgraph unavailable — return graceful error
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Graph unavailable: ${err.message}`, topic }),
      }],
    };
  }
}
```

### Step 5: Smoke test the new tool

```bash
cd ~/.openclaw/projects/knowledge-base
node -e "
const { execSync } = require('child_process');
// Quick tool list check
const result = execSync('echo \'{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}\' | node mcp-server.js 2>/dev/null', {encoding:'utf8'});
const parsed = JSON.parse(result.split('\n').find(l => l.startsWith('{')));
const tools = parsed.result?.tools?.map(t => t.name);
console.log('tools:', tools);
console.log('has graph_trace:', tools?.includes('graph_trace'));
"
```

Expected: `has graph_trace: true`

### Step 6: Commit

This file is in `~/.openclaw/projects/knowledge-base/` — outside the git repo. Track with:

```bash
cd ~/.openclaw/projects/knowledge-base && git add mcp-server.js && git commit -m "feat(kb-mcp): add graph_trace tool for causal chain traversal"
```

If not a git repo, note this change in a comment at top of mcp-server.js dated `2026-03-04`.

---

## Task 7: Build, Install, Restart, Verify

**Files:**

- No source changes — build + deploy

### Step 1: Build the project

```bash
cd /Users/user/Desktop/projects/openclaw
pnpm build
```

Expected: `✔ Build complete`

### Step 2: Run full test suite

```bash
pnpm test
```

Expected: All tests pass. If any fail, fix before proceeding.

### Step 3: Type check

```bash
pnpm tsgo
```

Expected: No errors

### Step 4: Install globally

```bash
npm install -g .
```

Expected: `up to date` or `changed 1 package`

### Step 5: Build UI assets

```bash
pnpm ui:build
npm install -g .
```

(Required to include UI in global install)

### Step 6: Restart gateway

```bash
launchctl stop ai.openclaw.gateway && sleep 3 && launchctl start ai.openclaw.gateway && sleep 8
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/health && echo ""
```

Expected: `200`

### Step 7: Verify hybrid search is active

Check gateway stdout log for vec initialization:

```bash
grep "sqlite-vec\|graph-intelligence\|graph-context" ~/.openclaw/logs/ai.openclaw.gateway-stdout.log | tail -10
```

Expected: `sqlite-vec loaded for KB vector search` and `graph-intelligence` in MCP server list

### Step 8: Verify graph context fires on a message

Send a test message to your WhatsApp/Telegram bot. Then check:

```bash
grep "graph context\|graphContext\|graph-context" /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log 2>/dev/null | tail -5
```

Expected: `[hooks/graph-context] injected graph context (N chars)`

### Step 9: Commit final state

```bash
cd /Users/user/Desktop/projects/openclaw
scripts/committer "chore: rebuild and reinstall with hybrid vector+graph knowledge stack" \
  dist/
```

---

## Validation Checklist

After all tasks complete, verify each capability:

| Check                        | Command                                                                     | Expected                 |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------ |
| Vec search active in SDK     | `grep "sqlite-vec loaded" ~/.openclaw/logs/ai.openclaw.gateway-stdout.log`  | Present                  |
| Graph MCP wired              | `grep "graph-intelligence" ~/.openclaw/logs/ai.openclaw.gateway-stdout.log` | Present                  |
| Auto-RAG uses hybrid         | Send message → check log for graph context injection                        | `injected graph context` |
| `graph_trace` tool available | MCP tools/list against KB server                                            | `graph_trace` in list    |
| All tests green              | `pnpm test`                                                                 | 0 failures               |
| Type clean                   | `pnpm tsgo`                                                                 | 0 errors                 |

---

## Rollback Plan

If the hybrid search introduces regressions:

1. `kbQuery` regression: The FTS fallback path is always present — if `kbVecAvailable` is false or `getQueryEmbedding` returns null, it falls through to pure FTS (same as before).

2. Graph context hook regression: Wrapped in `try/catch` with 3s timeout. If Memgraph is down, hook exits silently — zero impact on message processing.

3. Graph MCP regression: `buildSdkMcpServers` checks `fs.existsSync(graphMcpPath)` — if the file is missing or the server crashes, the agent session continues without graph tools (graceful degradation already built into SDK runner).

4. Full rollback: `git stash && npm install -g . && pnpm ui:build && npm install -g .` restores the previous binary.
