# PAIOS Graph Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local dark-cosmos web app that renders the PAIOS Memgraph
knowledge graph with four interactive modes: Cosmos, Search, Timeline, Insights.

**Architecture:** FastAPI bridge (Python, port 8765) translates HTTP calls into
Bolt queries against Memgraph. Vite + TypeScript frontend uses Sigma.js v3
(WebGL) for rendering and graphology for in-memory graph algorithms. No React —
vanilla TypeScript + DOM APIs.

**Tech Stack:** Sigma.js 3.0.2, graphology 0.26.0, graphology-layout-forceatlas2
0.10.1, graphology-communities-louvain 2.0.2, FastAPI, Vite 5, TypeScript 5.

**Design doc:** `docs/plans/2026-02-28-graph-visualization-design.md`

---

## Task 1: FastAPI bridge

**Files:**

- Create: `~/.openclaw/projects/graph/v4/bridge.py`
- Create: `~/.openclaw/projects/graph/v4/tests/test_bridge.py`

**Step 1: Install pytest-asyncio and httpx into venv**

```bash
~/.openclaw/.venv/bin/pip install pytest-asyncio httpx
```

Expected: both install successfully.

**Step 2: Write the bridge**

Create `~/.openclaw/projects/graph/v4/bridge.py`:

```python
#!/usr/bin/env python3
"""
PAIOS Graph Visualization Bridge.
FastAPI HTTP server translating browser calls into Memgraph Bolt queries.

Start: uvicorn bridge:app --port 8865 --reload
(Note: port 8865 avoids conflicts with existing services)
"""
from __future__ import annotations

import pathlib
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from neo4j import AsyncGraphDatabase, AsyncDriver
from neo4j.graph import Node, Relationship
from pydantic import BaseModel

BOLT_URI  = os.getenv("PAIOS_GRAPH_URI",      "bolt://localhost:7687")
BOLT_USER = os.getenv("PAIOS_GRAPH_USER",     "memgraph")
BOLT_PASS = os.getenv("PAIOS_GRAPH_PASSWORD", "")

_driver: AsyncDriver | None = None

SKIP_PROPS = {"name_embedding", "fact_embedding"}
SPINE_LABELS = {"Signal", "Belief", "Decision", "AutonomyRule"}
LAYER_LABELS  = {"Event", "Entity", "Artifact", "Episodic", "Moment", "Approval"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _driver
    _driver = AsyncGraphDatabase.driver(BOLT_URI, auth=(BOLT_USER, BOLT_PASS))
    yield
    await _driver.close()


app = FastAPI(title="PAIOS Graph Bridge", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ─────────────────────────────────────────────────────────────────

def node_dict(n: Node) -> dict:
    d = {k: v for k, v in n.items() if k not in SKIP_PROPS}
    d["_id"]     = str(n.element_id)
    d["_labels"] = list(n.labels)
    # Coerce datetime to ISO string
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


def edge_dict(e: Relationship) -> dict:
    d = {k: v for k, v in e.items() if k not in SKIP_PROPS}
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    d["_id"]     = str(e.element_id)
    d["_source"] = str(e.start_node.element_id)
    d["_target"] = str(e.end_node.element_id)
    d["_type"]   = e.type
    return d


async def run(cypher: str, params: dict = {}) -> list:
    assert _driver is not None, "Driver not initialized"
    result = await _driver.execute_query(cypher, params)
    return result.records


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/graph/spine")
async def get_spine(limit: int = Query(500, le=1000)):
    """High-importance nodes: Signals, Beliefs, Decisions, AutonomyRules."""
    records = await run("""
        MATCH (n)
        WHERE n:Signal OR n:Belief OR n:Decision OR n:AutonomyRule
        WITH n, CASE
            WHEN n:Signal        THEN 4
            WHEN n:Belief        THEN 3
            WHEN n:AutonomyRule  THEN 2
            WHEN n:Decision      THEN 1
            ELSE 0
        END AS priority
        ORDER BY priority DESC, n.created_at DESC
        LIMIT $limit
        RETURN n
    """, {"limit": limit})

    nodes = [node_dict(r["n"]) for r in records]
    ids   = [n["_id"] for n in nodes]

    edge_records = await run("""
        MATCH (a)-[r]->(b)
        WHERE a.uuid IN $uuids AND b.uuid IN $uuids
        RETURN r
        LIMIT 2000
    """, {"uuids": [n.get("uuid", "") for n in nodes]})

    edges = [edge_dict(r["r"]) for r in edge_records]
    return {"nodes": nodes, "edges": edges}


@app.get("/graph/neighborhood")
async def get_neighborhood(uuid: str, hops: int = Query(2, ge=1, le=3)):
    """N-hop neighborhood around a node identified by uuid."""
    # Fetch nodes up to N hops out
    records = await run(f"""
        MATCH (n {{uuid: $uuid}})
        CALL {{
            WITH n
            MATCH (n)-[r*1..{hops}]-(m)
            RETURN DISTINCT m AS neighbor, r AS rels
            LIMIT 200
        }}
        RETURN n, neighbor, rels
    """, {"uuid": uuid})

    nodes_seen: dict[str, dict] = {}
    edges_seen: dict[str, dict] = {}

    for r in records:
        n = r["n"]
        m = r["neighbor"]
        rels = r["rels"]

        nd = node_dict(n)
        nodes_seen[nd["_id"]] = nd

        md = node_dict(m)
        nodes_seen[md["_id"]] = md

        for rel in rels:
            ed = edge_dict(rel)
            edges_seen[ed["_id"]] = ed

    return {"nodes": list(nodes_seen.values()), "edges": list(edges_seen.values())}


@app.get("/graph/layers")
async def get_layer(label: str, limit: int = Query(2000, le=5000)):
    """All nodes of a given label for layer toggling."""
    if label not in LAYER_LABELS:
        raise HTTPException(400, f"label must be one of: {sorted(LAYER_LABELS)}")

    records = await run(f"MATCH (n:{label}) RETURN n LIMIT $limit", {"limit": limit})
    nodes = [node_dict(r["n"]) for r in records]
    return {"nodes": nodes, "label": label, "count": len(nodes)}


@app.get("/graph/counts")
async def get_counts():
    """Node count per label — drives the layer toggle UI."""
    records = await run("""
        MATCH (n)
        WITH labels(n)[0] AS label, count(*) AS cnt
        RETURN label, cnt ORDER BY cnt DESC
    """)
    return {r["label"]: r["cnt"] for r in records}


class CypherQuery(BaseModel):
    cypher: str
    params: dict[str, Any] = {}


@app.post("/graph/query")
async def raw_query(body: CypherQuery):
    """Execute a read-only Cypher query. Returns nodes + edges found."""
    upper = body.cypher.upper()
    for dangerous in ("DELETE", "DETACH", "DROP", "REMOVE", "SET ", "CREATE ", "MERGE "):
        if dangerous in upper:
            raise HTTPException(400, f"Destructive keyword not allowed: {dangerous.strip()}")

    records = await run(body.cypher, body.params)
    nodes, edges = [], []
    for rec in records:
        for val in rec.values():
            if isinstance(val, Node):
                nodes.append(node_dict(val))
            elif isinstance(val, Relationship):
                edges.append(edge_dict(val))

    return {"nodes": nodes, "edges": edges, "count": len(records)}


# ── Static frontend (production) ─────────────────────────────────────────────
_dist = pathlib.Path(__file__).parent / "viz" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
```

**Step 3: Write failing bridge tests**

Create `~/.openclaw/projects/graph/v4/tests/__init__.py` (empty).

Create `~/.openclaw/projects/graph/v4/tests/test_bridge.py`:

```python
"""Integration tests for the FastAPI bridge.
Requires Memgraph running at bolt://localhost:7687.
"""
import pytest
import pytest_asyncio
import httpx
from bridge import app


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test"
    ) as c:
        yield c


@pytest.mark.asyncio
async def test_spine_returns_nodes_and_edges(client):
    r = await client.get("/graph/spine?limit=50")
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) > 0
    first = data["nodes"][0]
    assert "_id" in first
    assert "_labels" in first
    # Embeddings must be stripped
    assert "name_embedding" not in first
    assert "fact_embedding" not in first


@pytest.mark.asyncio
async def test_counts_returns_label_map(client):
    r = await client.get("/graph/counts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert any(label in data for label in ["Event", "Decision", "Belief"])


@pytest.mark.asyncio
async def test_layer_rejects_unknown_label(client):
    r = await client.get("/graph/layers?label=INVALID")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_layer_returns_events(client):
    r = await client.get("/graph/layers?label=Event&limit=10")
    assert r.status_code == 200
    data = r.json()
    assert data["label"] == "Event"
    assert data["count"] >= 0


@pytest.mark.asyncio
async def test_raw_query_rejects_destructive(client):
    r = await client.post("/graph/query", json={"cypher": "MATCH (n) DELETE n"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_raw_query_returns_results(client):
    r = await client.post("/graph/query", json={"cypher": "MATCH (n:Belief) RETURN n LIMIT 3"})
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data
    assert len(data["nodes"]) <= 3
```

**Step 4: Run tests to verify they fail (bridge not started yet)**

```bash
cd ~/.openclaw/projects/graph/v4
~/.openclaw/.venv/bin/pytest tests/test_bridge.py -v
```

Expected: PASS — tests hit live Memgraph (no mock needed, it's local).

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph/v4
git add bridge.py tests/
git commit -m "feat(viz): FastAPI bridge with 5 endpoints + integration tests"
```

---

## Task 2: Vite project scaffold

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/package.json`
- Create: `~/.openclaw/projects/graph/v4/viz/vite.config.ts`
- Create: `~/.openclaw/projects/graph/v4/viz/tsconfig.json`
- Create: `~/.openclaw/projects/graph/v4/viz/index.html`
- Create: `~/.openclaw/projects/graph/v4/viz/src/styles/main.css`

**Step 1: Create viz directory and package.json**

Create `~/.openclaw/projects/graph/v4/viz/package.json`:

```json
{
  "name": "paios-graph-viz",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "graphology": "^0.26.0",
    "graphology-communities-louvain": "^2.0.2",
    "graphology-layout-forceatlas2": "^0.10.1",
    "graphology-shortest-path": "^2.2.0",
    "sigma": "^3.0.2"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

**Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      "/graph": {
        target: "http://localhost:8865",
        changeOrigin: true,
      },
    },
  },
});
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PAIOS — Knowledge Graph</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/src/styles/main.css" />
  </head>
  <body>
    <div id="app">
      <canvas id="sigma-canvas"></canvas>
      <div id="ui-root"></div>
      <div id="error-overlay" class="hidden"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Step 5: Create src/styles/main.css**

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #050508;
  --glass-bg: rgba(10, 10, 20, 0.85);
  --glass-border: rgba(255, 255, 255, 0.08);
  --text: rgba(255, 255, 255, 0.85);
  --text-dim: rgba(255, 255, 255, 0.45);
  --font-ui: "Inter", sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* Node type colors */
  --signal: #ff6b35;
  --belief: #c77dff;
  --decision: #48cae4;
  --event: #74c69d;
  --entity: #ffd166;
  --artifact: #adb5bd;
  --episodic: #6c757d;
}

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

#app {
  position: relative;
  width: 100vw;
  height: 100vh;
}

#sigma-canvas {
  position: absolute;
  inset: 0;
}

#ui-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
#ui-root > * {
  pointer-events: auto;
}

/* Glass panel mixin */
.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 10px;
  color: var(--text);
  font-family: var(--font-ui);
}

/* Error overlay */
#error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 8, 0.95);
  color: var(--text);
  font-family: var(--font-ui);
  flex-direction: column;
  gap: 16px;
}
#error-overlay.hidden {
  display: none;
}
#error-overlay h2 {
  font-size: 18px;
}
#error-overlay p {
  font-size: 14px;
  color: var(--text-dim);
}
#error-overlay button {
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
}
```

**Step 6: Install dependencies**

```bash
cd ~/.openclaw/projects/graph/v4/viz
npm install
```

Expected: node_modules created, no errors.

**Step 7: Smoke test dev server starts**

```bash
cd ~/.openclaw/projects/graph/v4/viz
npm run dev &
sleep 3
curl -s http://localhost:5173 | grep -c "PAIOS"
kill %1
```

Expected: output `1` (title found in HTML).

**Step 8: Commit**

```bash
cd ~/.openclaw/projects/graph/v4/viz
git add package.json vite.config.ts tsconfig.json index.html src/styles/main.css
git commit -m "feat(viz): Vite + TypeScript scaffold with dark cosmos CSS"
```

---

## Task 3: API client module

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/api.ts`

This module is the only place the frontend talks to the bridge.

**Step 1: Write src/api.ts**

```typescript
// src/api.ts — all HTTP calls to the FastAPI bridge

export interface ApiNode {
  _id: string;
  _labels: string[];
  uuid?: string;
  name?: string;
  summary?: string;
  fact?: string;
  created_at?: string;
  valid_at?: string;
  expired_at?: string;
  group_id?: string;
  [key: string]: unknown;
}

export interface ApiEdge {
  _id: string;
  _source: string;
  _target: string;
  _type: string;
  uuid?: string;
  [key: string]: unknown;
}

export interface GraphPayload {
  nodes: ApiNode[];
  edges: ApiEdge[];
}

const BASE = "/graph";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

export const api = {
  spine: (limit = 500): Promise<GraphPayload> => get(`/spine?limit=${limit}`),

  neighborhood: (uuid: string, hops = 2): Promise<GraphPayload> =>
    get(`/neighborhood?uuid=${encodeURIComponent(uuid)}&hops=${hops}`),

  layer: (label: string, limit = 2000): Promise<GraphPayload & { label: string; count: number }> =>
    get(`/layers?label=${label}&limit=${limit}`),

  counts: (): Promise<Record<string, number>> => get("/counts"),

  query: (
    cypher: string,
    params: Record<string, unknown> = {},
  ): Promise<GraphPayload & { count: number }> => post("/query", { cypher, params }),
};
```

**Step 2: Commit**

```bash
cd ~/.openclaw/projects/graph/v4/viz
git add src/api.ts
git commit -m "feat(viz): typed API client for graph bridge"
```

---

## Task 4: graphology data layer

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/graph.ts`

The single graphology `MultiDirectedGraph` instance that the whole app shares.
Loading, merging, filtering all go through here.

**Step 1: Write src/graph.ts**

```typescript
// src/graph.ts — shared graphology graph + load helpers

import MultiDirectedGraph from "graphology";
import { type ApiNode, type ApiEdge, type GraphPayload } from "./api";

// Node visual attributes stored alongside data
export interface NodeAttrs {
  // Data
  label: string;
  nodeType: string; // Signal | Belief | Decision | Event | …
  uuid: string;
  createdAt: number; // unix timestamp ms (for timeline)
  expiredAt: number | null;
  // Layout (set by ForceAtlas2 or temporal layout)
  x: number;
  y: number;
  // Visual
  size: number;
  color: string;
  hidden: boolean;
  highlighted: boolean;
  // Raw data blob for side panel
  raw: Record<string, unknown>;
}

export interface EdgeAttrs {
  label: string; // edge type: SUPPORTS | CAUSED_BY | …
  color: string;
  size: number;
  hidden: boolean;
}

// Singleton graph instance
export const graph = new MultiDirectedGraph<NodeAttrs, EdgeAttrs>();

// ── Node type config ──────────────────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  Signal: "#FF6B35",
  Belief: "#C77DFF",
  Decision: "#48CAE4",
  Event: "#74C69D",
  Entity: "#FFD166",
  Artifact: "#ADB5BD",
  Episodic: "#6C757D",
  Moment: "#6C757D",
  Approval: "#74C69D",
  AutonomyRule: "#C77DFF",
  Score: "#ADB5BD",
  LifeScore: "#ADB5BD",
  default: "#888888",
};

export const NODE_SIZES: Record<string, number> = {
  Signal: 18,
  Belief: 14,
  Decision: 12,
  Event: 7,
  Entity: 10,
  Artifact: 7,
  Episodic: 5,
  AutonomyRule: 10,
  default: 8,
};

export const EDGE_COLORS: Record<string, string> = {
  SUPPORTS: "#FFD166",
  CAUSED_BY: "#EF233C",
  RELATES_TO: "#48CAE4",
  MENTIONS: "#ADB5BD",
  HAPPENED_ON: "#74C69D",
  default: "#555555",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeType(n: ApiNode): string {
  for (const l of n._labels ?? []) {
    if (l in NODE_COLORS) return l;
  }
  return n._labels?.[0] ?? "unknown";
}

function toTimestamp(iso: string | undefined): number {
  if (!iso) return 0;
  return new Date(iso).getTime();
}

function nodeLabel(n: ApiNode): string {
  return (n.name || n.summary || n.fact || n.uuid || n._id).toString().slice(0, 60);
}

// ── Merge functions (idempotent) ──────────────────────────────────────────────

export function mergeNodes(nodes: ApiNode[]): void {
  for (const n of nodes) {
    if (graph.hasNode(n._id)) continue;
    const type = nodeType(n);
    const color = NODE_COLORS[type] ?? NODE_COLORS.default;
    const size = NODE_SIZES[type] ?? NODE_SIZES.default;
    graph.addNode(n._id, {
      label: nodeLabel(n),
      nodeType: type,
      uuid: n.uuid ?? "",
      createdAt: toTimestamp(n.created_at ?? n.valid_at),
      expiredAt: n.expired_at ? toTimestamp(n.expired_at) : null,
      x: (Math.random() - 0.5) * 1000,
      y: (Math.random() - 0.5) * 1000,
      size,
      color,
      hidden: false,
      highlighted: false,
      raw: n as Record<string, unknown>,
    });
  }
}

export function mergeEdges(edges: ApiEdge[]): void {
  for (const e of edges) {
    if (graph.hasEdge(e._id)) continue;
    if (!graph.hasNode(e._source) || !graph.hasNode(e._target)) continue;
    const color = EDGE_COLORS[e._type] ?? EDGE_COLORS.default;
    graph.addEdgeWithKey(e._id, e._source, e._target, {
      label: e._type,
      color,
      size: e._type === "CAUSED_BY" ? 2 : 1,
      hidden: false,
    });
  }
}

export function mergePayload(payload: GraphPayload): void {
  mergeNodes(payload.nodes);
  mergeEdges(payload.edges);
}

// ── Visibility control ───────────────────────────────────────────────────────

export function showOnlyTypes(types: Set<string>): void {
  graph.forEachNode((id, attrs) => {
    graph.setNodeAttribute(id, "hidden", !types.has(attrs.nodeType));
  });
}

export function showAllNodes(): void {
  graph.forEachNode((id) => graph.setNodeAttribute(id, "hidden", false));
}

export function hideAllExcept(nodeIds: Set<string>): void {
  graph.forEachNode((id) => {
    graph.setNodeAttribute(id, "hidden", !nodeIds.has(id));
  });
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd ~/.openclaw/projects/graph/v4/viz
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/graph.ts
git commit -m "feat(viz): graphology data layer with merge helpers and type config"
```

---

## Task 5: Custom WebGL glow node program

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/renderer/node-glow.ts`

Sigma v3 custom node program that renders each node as a radial gradient
glow disc — bright white core, type color at midpoint, transparent at edge.

**Step 1: Write src/renderer/node-glow.ts**

```typescript
// src/renderer/node-glow.ts
// Custom Sigma v3 WebGL node program: radial glow disc

import { NodeProgram, ProgramInfo } from "sigma/rendering";
import type { RenderParams } from "sigma/types";

const VERTEX_SHADER = /*glsl*/ `
  attribute vec2  a_position;
  attribute float a_size;
  attribute vec4  a_color;
  attribute vec2  a_texCoord;

  uniform mat3    u_matrix;
  uniform float   u_sizeRatio;
  uniform float   u_pixelRatio;
  uniform vec2    u_dimensions;

  varying vec4  v_color;
  varying float v_radius;

  void main() {
    gl_Position = vec4(
      (u_matrix * vec3(a_position, 1.0)).xy,
      0.0, 1.0
    );
    // Size in pixels including glow halo (2x base size)
    float sz = a_size * u_pixelRatio / u_sizeRatio * 2.0;
    gl_PointSize = sz;
    v_color  = a_color;
    v_radius = sz / 2.0;
  }
`;

const FRAGMENT_SHADER = /*glsl*/ `
  precision mediump float;

  varying vec4  v_color;
  varying float v_radius;

  void main() {
    // gl_PointCoord is [0,1]^2; center at (0.5,0.5)
    vec2  uv   = gl_PointCoord - vec2(0.5);
    float dist = length(uv) * 2.0;  // 0 at center, 1 at edge

    // Layers of the glow:
    float core = 1.0 - smoothstep(0.0,  0.18, dist);   // bright white core
    float ring = smoothstep(0.18, 0.28, dist) *
                 (1.0 - smoothstep(0.28, 0.50, dist));  // color ring
    float glow = smoothstep(0.50, 1.00, 1.0 - dist);   // soft halo falloff

    // Compose: white core + color ring + dim color glow
    vec4 col = vec4(0.0);
    col += vec4(1.0, 1.0, 1.0, 1.0) * core;
    col += v_color * ring;
    col += v_color * vec4(1.0, 1.0, 1.0, 0.35) * glow;

    // Alpha: core is fully opaque, ring respects node alpha, glow is soft
    float alpha = core + v_color.a * ring + v_color.a * 0.4 * glow;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col.rgb / max(alpha, 0.001), alpha);
  }
`;

// Attribute layout: position(2) + size(1) + color(4)
const ATTRIBUTES = 7;

export class NodeGlowProgram extends NodeProgram {
  static override readonly PROGRAM_NAME = "node-glow";

  getDefinition(): ProgramInfo {
    return {
      VERTICES: 1,
      VERTEX_SHADER_SOURCE: VERTEX_SHADER,
      FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER,
      METHOD: WebGLRenderingContext.POINTS,
      UNIFORMS: ["u_sizeRatio", "u_pixelRatio", "u_matrix", "u_dimensions"],
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: WebGLRenderingContext.FLOAT },
        { name: "a_size", size: 1, type: WebGLRenderingContext.FLOAT },
        { name: "a_color", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [],
      CONSTANT_DATA: [],
    };
  }

  processVisibleItem(
    nodeIndex: number,
    startIndex: number,
    data: { x: number; y: number; size: number; color: string },
  ): void {
    const array = this.array;
    const i = startIndex * ATTRIBUTES;

    // Parse hex color to RGBA bytes
    const hex = data.color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    array[i] = data.x;
    array[i + 1] = data.y;
    array[i + 2] = data.size;
    array[i + 3] = r;
    array[i + 4] = g;
    array[i + 5] = b;
    array[i + 6] = 200; // alpha (0-255)
  }

  draw(params: RenderParams): void {
    const { u_sizeRatio, u_pixelRatio, u_matrix } = this.uniformLocations as Record<
      string,
      WebGLUniformLocation
    >;
    const gl = this.gl;
    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform1f(u_pixelRatio, params.pixelRatio);
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
    this.drawWebGL(WebGLRenderingContext.POINTS, params);
  }
}
```

> **Note:** Sigma v3's `NodeProgram` API may differ slightly from the above stub
> depending on the exact 3.0.2 release. If `processVisibleItem` or
> `getDefinition` signatures mismatch, fall back to using the built-in
> `createNodeCompoundProgram` with `NodeCircleProgram` and a `NodeBorderProgram`
> stacked — this gives a reasonable approximation of the glow look without
> custom shaders. The visual quality difference is minor.

**Step 2: Commit**

```bash
git add src/renderer/node-glow.ts
git commit -m "feat(viz): custom WebGL glow node program for Sigma v3"
```

---

## Task 6: Sigma canvas initialization + edge colors

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/renderer/edge-colors.ts`
- Create: `~/.openclaw/projects/graph/v4/viz/src/main.ts`

**Step 1: Write src/renderer/edge-colors.ts**

Edge opacity is controlled by attribute — this file maps type → base opacity.

```typescript
// src/renderer/edge-colors.ts
import { EDGE_COLORS } from "../graph";

export const EDGE_OPACITY: Record<string, number> = {
  SUPPORTS: 0.15,
  CAUSED_BY: 0.6,
  RELATES_TO: 0.4,
  MENTIONS: 0.2,
  HAPPENED_ON: 0.15,
  default: 0.25,
};

export const EDGE_OPACITY_HOVER = 0.75;

export function edgeColorWithOpacity(type: string, opacity?: number): string {
  const hex = EDGE_COLORS[type] ?? EDGE_COLORS.default;
  const op = opacity ?? EDGE_OPACITY[type] ?? EDGE_OPACITY.default;
  // Convert 0-1 opacity to hex alpha
  const alpha = Math.round(op * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}
```

**Step 2: Write src/main.ts**

```typescript
// src/main.ts — app entry point

import Graph from "graphology";
import Sigma from "sigma";
import { graph, mergePayload, NodeAttrs, EdgeAttrs } from "./graph";
import { edgeColorWithOpacity } from "./renderer/edge-colors";
import { api } from "./api";

// ── Error overlay ─────────────────────────────────────────────────────────────

const errorEl = document.getElementById("error-overlay")!;
function showError(msg: string, detail: string) {
  errorEl.innerHTML = `
    <h2>${msg}</h2>
    <p>${detail}</p>
    <button onclick="location.reload()">Retry</button>
  `;
  errorEl.classList.remove("hidden");
}

// ── Initialize Sigma ──────────────────────────────────────────────────────────

const container = document.getElementById("sigma-canvas") as HTMLCanvasElement;

// Sigma v3 accepts a container div, not canvas directly
const sigmaContainer = document.createElement("div");
sigmaContainer.style.cssText = "position:absolute;inset:0";
document.getElementById("app")!.prepend(sigmaContainer);

export const sigma = new Sigma(graph as Graph, sigmaContainer, {
  renderLabels: true,
  labelColor: { color: "rgba(255,255,255,0.6)" },
  labelSize: 11,
  labelFont: "Inter, sans-serif",
  labelWeight: "400",
  minCameraRatio: 0.05,
  maxCameraRatio: 4.0,
  // Only render labels when zoomed in enough
  labelRenderedSizeThreshold: 6,
  // Edge rendering
  defaultEdgeType: "line",
  // Node rendering — use built-in circle for now
  // (swap to NodeGlowProgram once shader is validated)
  defaultNodeType: "circle",
});

// ── Edge color reducer (apply opacity by type) ────────────────────────────────

sigma.setSetting("edgeReducer", (edge, data) => {
  const type = (data.label ?? "default") as string;
  return {
    ...data,
    color: edgeColorWithOpacity(type),
    hidden: data.hidden ?? false,
  };
});

// ── Load spine on startup ─────────────────────────────────────────────────────

async function bootstrap() {
  try {
    const payload = await api.spine(500);
    mergePayload(payload);
    sigma.refresh();

    // Dynamically import layout to avoid blocking render
    const { startLayout } = await import("./layout");
    startLayout();

    // Load counts for layer toggle UI
    const { initLayers } = await import("./ui/layers");
    const counts = await api.counts();
    initLayers(counts);

    // Init mode bar
    const { initModeBar } = await import("./ui/modebar");
    initModeBar();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch") || msg.includes("Failed")) {
      showError(
        "Memgraph bridge offline",
        "Start it with: uvicorn bridge:app --port 8865 --reload",
      );
    } else {
      showError("Load error", msg);
    }
  }
}

bootstrap();
```

**Step 3: Verify TypeScript compiles**

```bash
cd ~/.openclaw/projects/graph/v4/viz
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only minor type import warnings from sigma internals).

**Step 4: Start dev server and verify canvas renders**

```bash
# Terminal 1: start bridge
cd ~/.openclaw/projects/graph/v4
~/.openclaw/.venv/bin/uvicorn bridge:app --port 8865 &

# Terminal 2: start Vite
cd ~/.openclaw/projects/graph/v4/viz
npm run dev
```

Open http://localhost:5173. Expected: dark canvas loads, nodes appear within ~2s.

**Step 5: Commit**

```bash
git add src/renderer/edge-colors.ts src/main.ts
git commit -m "feat(viz): Sigma canvas init, edge opacity by type, bootstrap load"
```

---

## Task 7: ForceAtlas2 layout worker

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/layout.ts`

**Step 1: Write src/layout.ts**

```typescript
// src/layout.ts — ForceAtlas2 layout supervisor

import FA2Layout from "graphology-layout-forceatlas2/worker";
import { graph } from "./graph";
import { sigma } from "./main";

let _layout: InstanceType<typeof FA2Layout> | null = null;

const FA2_SETTINGS = {
  gravity: 1.5,
  scalingRatio: 3.0,
  slowDown: 8,
  strongGravityMode: false,
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
  adjustSizes: false,
  outboundAttractionDistribution: false,
};

export function startLayout(): void {
  if (_layout) {
    _layout.stop();
    _layout.kill();
  }

  _layout = new FA2Layout(graph, { settings: FA2_SETTINGS });
  _layout.start();

  // Run for 3 seconds then settle to low-alpha drift
  setTimeout(() => {
    if (_layout) {
      _layout.stop();
      // Restart at very low alpha for the "breathing" effect
      _layout = new FA2Layout(graph, {
        settings: { ..._FA2_SETTINGS_DRIFT },
      });
      _layout.start();
    }
  }, 3000);

  // Bind layout to sigma refresh
  if (_layout) {
    (_layout as any).on?.("updated", () => sigma.refresh());
  }
}

const _FA2_SETTINGS_DRIFT = {
  ...FA2_SETTINGS,
  slowDown: 50, // much slower convergence
  gravity: 0.3, // weak gravity = gentle float
};

export function stopLayout(): void {
  _layout?.stop();
}

export function killLayout(): void {
  _layout?.stop();
  _layout?.kill();
  _layout = null;
}

export function restartLayout(): void {
  killLayout();
  startLayout();
}
```

**Step 2: Commit**

```bash
git add src/layout.ts
git commit -m "feat(viz): ForceAtlas2 layout worker with drift mode"
```

---

## Task 8: Hover interaction

**Files:**

- Modify: `~/.openclaw/projects/graph/v4/viz/src/main.ts`

Add hover dimming: hovered node → full brightness, neighbors → bright,
everything else → 15% opacity.

**Step 1: Add hover state to main.ts**

Add after the `bootstrap()` definition in main.ts:

```typescript
// ── Hover state ───────────────────────────────────────────────────────────────

let hoveredNode: string | null = null;

sigma.on("enterNode", ({ node }) => {
  hoveredNode = node;
  sigma.refresh();
});

sigma.on("leaveNode", () => {
  hoveredNode = null;
  sigma.refresh();
});

sigma.setSetting("nodeReducer", (node, data) => {
  if (hoveredNode === null) return data;

  if (node === hoveredNode) {
    return { ...data, size: data.size * 1.3, zIndex: 2 };
  }

  const isNeighbor =
    graph.hasEdge(hoveredNode, node) ||
    graph.hasEdge(node, hoveredNode) ||
    graph.neighbors(hoveredNode).includes(node);

  if (isNeighbor) {
    return { ...data, zIndex: 1 };
  }

  // Non-neighbor: dim to 15%
  return { ...data, color: data.color + "26", label: "" };
});

sigma.setSetting("edgeReducer", (edge, data) => {
  const type = (data.label ?? "default") as string;

  if (hoveredNode === null) {
    return { ...data, color: edgeColorWithOpacity(type) };
  }

  const [src, tgt] = graph.extremities(edge);
  const isConnected = src === hoveredNode || tgt === hoveredNode;
  if (isConnected) {
    return { ...data, color: edgeColorWithOpacity(type, 0.75), size: 2 };
  }
  return { ...data, hidden: true };
});
```

**Step 2: Commit**

```bash
git add src/main.ts
git commit -m "feat(viz): hover dim effect — neighbors bright, rest 15% opacity"
```

---

## Task 9: Click — re-center + inline info card

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/ui/infocard.ts`
- Modify: `~/.openclaw/projects/graph/v4/viz/src/main.ts`

**Step 1: Write src/ui/infocard.ts**

```typescript
// src/ui/infocard.ts — inline floating info card on node click

import { graph, NodeAttrs } from "../graph";
import { sigma } from "../main";
import type { Sigma } from "sigma";

let _cardEl: HTMLElement | null = null;
let _activeNode: string | null = null;

export function showInfoCard(nodeId: string): void {
  _activeNode = nodeId;
  const attrs = graph.getNodeAttributes(nodeId) as NodeAttrs;

  // Remove existing card
  _cardEl?.remove();

  // Create card
  const card = document.createElement("div");
  card.className = "info-card glass";
  card.innerHTML = buildCardHTML(attrs);
  document.getElementById("ui-root")!.appendChild(card);
  _cardEl = card;

  // Position card offset from node screen position
  positionCard(card, nodeId);

  // Wire buttons
  card.querySelector(".btn-expand")?.addEventListener("click", () => {
    import("../graph").then(async ({ mergePayload }) => {
      const { api } = await import("../api");
      const payload = await api.neighborhood(attrs.uuid, 3);
      mergePayload(payload);
      sigma.refresh();
    });
  });

  card.querySelector(".btn-timeline")?.addEventListener("click", async () => {
    const { activateMode } = await import("./modebar");
    activateMode("timeline");
  });

  card.querySelector(".btn-more")?.addEventListener("click", async () => {
    const { showSidePanel } = await import("./sidepanel");
    showSidePanel(nodeId);
  });
}

export function hideInfoCard(): void {
  _cardEl?.remove();
  _cardEl = null;
  _activeNode = null;
}

function buildCardHTML(attrs: NodeAttrs): string {
  const typeColor =
    getComputedStyle(document.documentElement).getPropertyValue(
      `--${attrs.nodeType.toLowerCase()}`,
    ) || "#888";

  const created = attrs.createdAt
    ? new Date(attrs.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const edgeCount = graph.degree(attrs.uuid ? /* find by uuid */ "" : "") ?? "?";

  return `
    <div class="card-type" style="color:${typeColor}">◉ ${attrs.nodeType.toUpperCase()}</div>
    <div class="card-label">${attrs.label}</div>
    <div class="card-meta">
      <span>Created <b>${created}</b></span>
      <span>Score <b>${attrs.raw.page_rank ? Number(attrs.raw.page_rank).toFixed(3) : "—"}</b></span>
    </div>
    <div class="card-actions">
      <button class="btn-expand">Expand</button>
      <button class="btn-timeline">Timeline</button>
      <button class="btn-more">⋯ More</button>
    </div>
  `;
}

function positionCard(card: HTMLElement, nodeId: string): void {
  // Get node screen position from Sigma
  const pos = sigma.getNodeDisplayData(nodeId);
  if (!pos) return;

  const { x, y } = sigma.graphToViewport({ x: pos.x, y: pos.y });

  // Offset card to top-right of node
  const offset = 80;
  card.style.position = "absolute";
  card.style.left = `${x + offset}px`;
  card.style.top = `${Math.max(10, y - offset)}px`;
}

// Inject card styles
const style = document.createElement("style");
style.textContent = `
  .info-card {
    position: absolute;
    width: 240px;
    padding: 14px 16px;
    font-family: var(--font-ui);
    font-size: 13px;
    z-index: 100;
    pointer-events: auto;
  }
  .card-type {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }
  .card-label {
    font-size: 13px;
    line-height: 1.4;
    color: var(--text);
    margin-bottom: 10px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-dim);
    font-size: 12px;
    margin-bottom: 12px;
  }
  .card-meta b { color: var(--text); font-weight: 500; }
  .card-actions {
    display: flex;
    gap: 8px;
  }
  .card-actions button {
    flex: 1;
    padding: 5px 0;
    border-radius: 5px;
    border: 1px solid var(--glass-border);
    background: rgba(255,255,255,0.05);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    font-family: var(--font-ui);
    transition: background 0.15s;
  }
  .card-actions button:hover { background: rgba(255,255,255,0.12); }
`;
document.head.appendChild(style);
```

**Step 2: Wire click handler in main.ts**

Add after the hover handlers:

```typescript
// ── Click: re-center + info card ──────────────────────────────────────────────

import { showInfoCard, hideInfoCard } from "./ui/infocard";

let _clickedNode: string | null = null;

sigma.on("clickNode", async ({ node }) => {
  _clickedNode = node;
  const attrs = graph.getNodeAttributes(node) as NodeAttrs;

  // Re-center camera on clicked node
  const pos = graph.getNodeAttributes(node) as { x: number; y: number };
  sigma
    .getCamera()
    .animate({ x: pos.x, y: pos.y, ratio: 0.4 }, { duration: 600, easing: "quadraticInOut" });

  // Load 2-hop neighborhood if not cached
  if (attrs.uuid) {
    try {
      const payload = await api.neighborhood(attrs.uuid, 2);
      mergePayload(payload);
      sigma.refresh();
    } catch (_) {
      /* neighborhood load fails silently */
    }
  }

  showInfoCard(node);
});

// Click on empty canvas: dismiss card + return camera
sigma.on("clickStage", () => {
  if (_clickedNode) {
    hideInfoCard();
    _clickedNode = null;
  }
});
```

**Step 3: Commit**

```bash
git add src/ui/infocard.ts src/main.ts
git commit -m "feat(viz): click re-centers camera, loads neighborhood, shows info card"
```

---

## Task 10: Double-click — full side panel

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/ui/sidepanel.ts`
- Modify: `~/.openclaw/projects/graph/v4/viz/src/main.ts`

**Step 1: Write src/ui/sidepanel.ts**

```typescript
// src/ui/sidepanel.ts — full detail panel (double-click)

import { graph } from "../graph";
import type { NodeAttrs } from "../graph";

let _panelEl: HTMLElement | null = null;

export function showSidePanel(nodeId: string): void {
  _panelEl?.remove();

  const attrs = graph.getNodeAttributes(nodeId) as NodeAttrs;
  const panel = document.createElement("div");
  panel.className = "side-panel glass";
  panel.innerHTML = buildPanelHTML(attrs, nodeId);
  document.getElementById("ui-root")!.appendChild(panel);
  _panelEl = panel;

  panel.querySelector(".panel-close")?.addEventListener("click", hideSidePanel);

  // Load Graphiti facts asynchronously
  loadGraphitiFacts(attrs, panel);
}

export function hideSidePanel(): void {
  _panelEl?.remove();
  _panelEl = null;
}

function buildPanelHTML(attrs: NodeAttrs, nodeId: string): string {
  const edges = graph
    .edges(nodeId)
    .slice(0, 5)
    .map((edgeId) => {
      const edgeAttrs = graph.getEdgeAttributes(edgeId);
      const [src, tgt] = graph.extremities(edgeId);
      const other = src === nodeId ? tgt : src;
      const otherAttrs = graph.hasNode(other)
        ? (graph.getNodeAttributes(other) as NodeAttrs)
        : null;
      return `<div class="connection-row">
      <span class="conn-type">${edgeAttrs.label}</span>
      <span class="conn-target">${otherAttrs?.label ?? other}</span>
    </div>`;
    })
    .join("");

  const totalEdges = graph.degree(nodeId);

  const props = Object.entries(attrs.raw)
    .filter(([k]) => !["_id", "_labels", "name_embedding", "fact_embedding"].includes(k))
    .filter(([_, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 8)
    .map(
      ([k, v]) => `<div class="prop-row">
      <span class="prop-key">${k}</span>
      <span class="prop-val">${String(v).slice(0, 80)}</span>
    </div>`,
    )
    .join("");

  return `
    <div class="panel-header">
      <div class="panel-type">${attrs.nodeType.toUpperCase()}</div>
      <button class="panel-close">✕</button>
    </div>
    <div class="panel-label">${attrs.label}</div>

    <div class="panel-section-title">PROPERTIES</div>
    <div class="panel-props">${props}</div>

    <div class="panel-section-title">CONNECTIONS (${totalEdges})</div>
    <div class="panel-connections">${edges}</div>
    ${totalEdges > 5 ? `<div class="show-all">— ${totalEdges - 5} more —</div>` : ""}

    <div class="panel-section-title">GRAPHITI FACTS</div>
    <div class="panel-facts" id="panel-facts-${nodeId}">
      <span class="loading">Loading...</span>
    </div>

    <div class="panel-section-title">RAW CYPHER</div>
    <div class="panel-cypher" id="panel-cypher">
      MATCH (n {uuid: "${attrs.uuid}"}) RETURN n
    </div>
  `;
}

async function loadGraphitiFacts(attrs: NodeAttrs, panel: HTMLElement): Promise<void> {
  const factsEl = panel.querySelector(`[id^="panel-facts-"]`) as HTMLElement;
  if (!factsEl || !attrs.uuid) return;

  try {
    // Call mcp_bridge context via the query endpoint
    const { api } = await import("../api");
    const result = await api.query(
      `MATCH (n {uuid: $uuid})-[:MENTIONS]-(ep:Episodic) RETURN ep.content AS fact LIMIT 3`,
      { uuid: attrs.uuid },
    );

    if (result.nodes.length === 0) {
      factsEl.innerHTML = '<span class="no-facts">No related episodes found</span>';
      return;
    }

    const facts = result.nodes
      .map((n) => `<div class="fact-row">${String(n.content ?? "").slice(0, 200)}</div>`)
      .join("");
    factsEl.innerHTML = facts;
  } catch {
    factsEl.innerHTML = '<span class="no-facts">Could not load facts</span>';
  }
}

// Inject styles
const style = document.createElement("style");
style.textContent = `
  .side-panel {
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 360px;
    padding: 20px;
    overflow-y: auto;
    border-radius: 0;
    border-right: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 200;
    animation: slideIn 0.25s ease;
  }
  @keyframes slideIn {
    from { transform: translateX(360px); opacity: 0; }
    to   { transform: translateX(0);     opacity: 1; }
  }
  .panel-header {
    display: flex; justify-content: space-between; align-items: center;
  }
  .panel-type { font-size: 11px; letter-spacing: 0.1em; color: var(--text-dim); }
  .panel-close {
    background: none; border: none; color: var(--text-dim);
    font-size: 16px; cursor: pointer; padding: 4px 8px;
  }
  .panel-label { font-size: 15px; line-height: 1.5; color: var(--text); }
  .panel-section-title {
    font-size: 10px; letter-spacing: 0.1em;
    color: var(--text-dim); margin-top: 8px;
    border-bottom: 1px solid var(--glass-border); padding-bottom: 4px;
  }
  .prop-row { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; }
  .prop-key { color: var(--text-dim); font-family: var(--font-mono); min-width: 100px; }
  .prop-val { color: var(--text); word-break: break-all; }
  .connection-row { display: flex; gap: 8px; font-size: 12px; padding: 3px 0; }
  .conn-type { color: var(--text-dim); font-family: var(--font-mono); min-width: 90px; }
  .conn-target { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .show-all { font-size: 11px; color: var(--text-dim); text-align: center; padding: 4px 0; }
  .panel-cypher {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
    padding: 8px; background: rgba(255,255,255,0.04); border-radius: 5px;
    word-break: break-all;
  }
  .fact-row { font-size: 12px; color: var(--text); padding: 4px 0; line-height: 1.5; }
  .no-facts, .loading { font-size: 12px; color: var(--text-dim); }
`;
document.head.appendChild(style);
```

**Step 2: Wire double-click in main.ts**

```typescript
import { showSidePanel } from "./ui/sidepanel";

sigma.on("doubleClickNode", ({ node, event }) => {
  event.preventSigmaDefault();
  showSidePanel(node);
});
```

**Step 3: Commit**

```bash
git add src/ui/sidepanel.ts src/main.ts
git commit -m "feat(viz): double-click side panel with properties, connections, Graphiti facts"
```

---

## Task 11: Mode bar + layer toggles

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/ui/modebar.ts`
- Create: `~/.openclaw/projects/graph/v4/viz/src/ui/layers.ts`

**Step 1: Write src/ui/modebar.ts**

```typescript
// src/ui/modebar.ts — top-center mode switcher pill

type Mode = "cosmos" | "search" | "timeline" | "insights";
let _currentMode: Mode = "cosmos";

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: "cosmos", label: "Cosmos", key: "1" },
  { id: "search", label: "Search", key: "2" },
  { id: "timeline", label: "Timeline", key: "3" },
  { id: "insights", label: "Insights", key: "4" },
];

export function initModeBar(): void {
  const bar = document.createElement("div");
  bar.className = "mode-bar glass";
  bar.innerHTML = MODES.map(
    (m) =>
      `<button class="mode-btn ${m.id === "cosmos" ? "active" : ""}" data-mode="${m.id}">
      ${m.label}
    </button>`,
  ).join("");

  document.getElementById("ui-root")!.appendChild(bar);

  bar.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = (btn as HTMLElement).dataset.mode as Mode;
      activateMode(mode);
    });
  });

  // Keyboard: 1-4 switches mode, ESC dismisses panels
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
    const m = MODES.find((m) => m.key === e.key);
    if (m) activateMode(m.id);
    if (e.key === "Escape") {
      import("./infocard").then(({ hideInfoCard }) => hideInfoCard());
      import("./sidepanel").then(({ hideSidePanel }) => hideSidePanel());
    }
    if (e.key === "l" || e.key === "L") {
      import("../main").then(({ sigma }) => {
        const cur = sigma.getSetting("renderLabels");
        sigma.setSetting("renderLabels", !cur);
      });
    }
  });
}

export async function activateMode(mode: Mode): Promise<void> {
  _currentMode = mode;

  // Update active button
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.mode === mode);
  });

  // Activate mode module
  switch (mode) {
    case "cosmos":
      (await import("../modes/cosmos")).activateCosmos();
      break;
    case "search":
      (await import("../modes/search")).activateSearch();
      break;
    case "timeline":
      (await import("../modes/timeline")).activateTimeline();
      break;
    case "insights":
      (await import("../modes/insights")).activateInsights();
      break;
  }
}

export function currentMode(): Mode {
  return _currentMode;
}

// Styles
const style = document.createElement("style");
style.textContent = `
  .mode-bar {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 22px;
    z-index: 100;
  }
  .mode-btn {
    padding: 6px 18px;
    border-radius: 18px;
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .mode-btn.active {
    background: rgba(255,255,255,0.12);
    color: var(--text);
  }
  .mode-btn:hover:not(.active) { color: var(--text); }
`;
document.head.appendChild(style);
```

**Step 2: Write src/ui/layers.ts**

```typescript
// src/ui/layers.ts — bottom-left layer toggle pill

import { graph, NODE_COLORS, mergePayload } from "../graph";
import { sigma } from "../main";
import { api } from "../api";

const SPINE_TYPES = new Set(["Signal", "Belief", "Decision", "AutonomyRule"]);
const LAYER_TYPES = ["Event", "Entity", "Artifact", "Episodic", "Approval", "Moment"];

const activeTypes = new Set<string>(SPINE_TYPES);

export function initLayers(counts: Record<string, number>): void {
  const bar = document.createElement("div");
  bar.className = "layer-bar glass";

  const items = [...SPINE_TYPES, ...LAYER_TYPES]
    .filter((t) => counts[t] !== undefined)
    .map((t) => {
      const color = NODE_COLORS[t] ?? "#888";
      const active = activeTypes.has(t);
      return `
        <div class="layer-item ${active ? "active" : ""}" data-type="${t}" title="${t}">
          <span class="layer-dot" style="background:${color}"></span>
          <span class="layer-label">${t}</span>
          <span class="layer-count">${counts[t] ?? 0}</span>
        </div>`;
    })
    .join("");

  bar.innerHTML = items;
  document.getElementById("ui-root")!.appendChild(bar);

  bar.querySelectorAll(".layer-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const type = (item as HTMLElement).dataset.type!;
      const wasActive = activeTypes.has(type);

      if (wasActive) {
        activeTypes.delete(type);
        item.classList.remove("active");
        // Hide nodes of this type
        graph.forEachNode((id, attrs) => {
          if (attrs.nodeType === type) graph.setNodeAttribute(id, "hidden", true);
        });
        sigma.refresh();
      } else {
        activeTypes.add(type);
        item.classList.add("active");
        // Load layer if it's a togglable type
        if (LAYER_TYPES.includes(type)) {
          const payload = await api.layer(type);
          mergePayload(payload);
        }
        graph.forEachNode((id, attrs) => {
          if (attrs.nodeType === type) graph.setNodeAttribute(id, "hidden", false);
        });
        sigma.refresh();
      }
    });
  });
}

// Styles
const style = document.createElement("style");
style.textContent = `
  .layer-bar {
    position: absolute;
    bottom: 20px;
    left: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    z-index: 100;
    max-height: 70vh;
    overflow-y: auto;
  }
  .layer-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.2s, background 0.15s;
    font-size: 12px;
    font-family: var(--font-ui);
    color: var(--text);
  }
  .layer-item.active { opacity: 1; }
  .layer-item:hover { background: rgba(255,255,255,0.06); }
  .layer-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .layer-label { flex: 1; }
  .layer-count { color: var(--text-dim); font-size: 11px; }
`;
document.head.appendChild(style);
```

**Step 3: Commit**

```bash
git add src/ui/modebar.ts src/ui/layers.ts
git commit -m "feat(viz): mode bar (1-4 keys), layer toggles with live load"
```

---

## Task 12: Cosmos, Search, Timeline, Insights modes

**Files:**

- Create: `~/.openclaw/projects/graph/v4/viz/src/modes/cosmos.ts`
- Create: `~/.openclaw/projects/graph/v4/viz/src/modes/search.ts`
- Create: `~/.openclaw/projects/graph/v4/viz/src/modes/timeline.ts`
- Create: `~/.openclaw/projects/graph/v4/viz/src/modes/insights.ts`

**Step 1: Write src/modes/cosmos.ts**

```typescript
// src/modes/cosmos.ts — default spine view with PageRank filter

import pagerank from "graphology-metrics/centrality/pagerank";
import { graph, showOnlyTypes } from "../graph";
import { sigma } from "../main";
import { startLayout, killLayout } from "../layout";

const SPINE_TYPES = new Set(["Signal", "Belief", "Decision", "AutonomyRule"]);
const TOP_N = 300;

export function activateCosmos(): void {
  // Remove any search/insight overlays
  document.querySelector(".search-bar")?.remove();
  document.querySelector(".timeline-bar")?.remove();
  document.querySelector(".insight-panel")?.remove();

  // Compute PageRank and surface top N Decision nodes
  // (Signals and Beliefs are always shown; Decisions filtered by score)
  try {
    const scores = pagerank(graph);
    const decisionScores = Object.entries(scores)
      .filter(([id]) => {
        const attrs = graph.getNodeAttributes(id);
        return attrs.nodeType === "Decision";
      })
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_N)
      .map(([id]) => id);

    const visibleSet = new Set<string>();
    graph.forEachNode((id, attrs) => {
      if (SPINE_TYPES.has(attrs.nodeType) && attrs.nodeType !== "Decision") {
        visibleSet.add(id);
      }
    });
    decisionScores.forEach((id) => visibleSet.add(id));

    graph.forEachNode((id) => {
      graph.setNodeAttribute(id, "hidden", !visibleSet.has(id));
    });
  } catch {
    // PageRank failure: just show spine types
    showOnlyTypes(SPINE_TYPES);
  }

  sigma.refresh();
  killLayout();
  startLayout();
}
```

**Step 2: Write src/modes/search.ts**

```typescript
// src/modes/search.ts — text filter + raw Cypher search

import { graph } from "../graph";
import { sigma } from "../main";
import { api, mergePayload } from "../api";

let _searchEl: HTMLElement | null = null;

export function activateSearch(): void {
  _searchEl?.remove();

  const bar = document.createElement("div");
  bar.className = "search-bar glass";
  bar.innerHTML = `
    <input class="search-input" placeholder="Search nodes…  (prefix / for Cypher)" />
    <div class="search-results"></div>
  `;
  document.getElementById("ui-root")!.appendChild(bar);
  _searchEl = bar;

  const input = bar.querySelector(".search-input") as HTMLInputElement;
  const results = bar.querySelector(".search-results") as HTMLElement;

  input.focus();

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.startsWith("/")) {
      results.textContent = "Press Enter to run Cypher";
      return;
    }
    filterGraph(q);
    showResults(q, results);
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && input.value.startsWith("/")) {
      const cypher = input.value.slice(1).trim();
      try {
        const payload = await api.query(cypher);
        // Show results as orange-outlined overlay
        mergePayload(payload);
        const newIds = new Set(payload.nodes.map((n) => n._id));
        graph.forEachNode((id) => {
          const isNew = newIds.has(id);
          graph.setNodeAttribute(id, "highlighted", isNew);
          graph.setNodeAttribute(id, "hidden", !isNew && !graph.getNodeAttribute(id, "hidden"));
        });
        sigma.refresh();
        results.textContent = `${payload.nodes.length} nodes found`;
      } catch (err) {
        results.innerHTML = `<span style="color:#EF233C">${err}</span>`;
      }
    }
    if (e.key === "Escape") {
      showAllAndReset();
    }
  });
}

function filterGraph(query: string): void {
  const q = query.toLowerCase();
  if (!q) {
    graph.forEachNode((id) => graph.setNodeAttribute(id, "hidden", false));
    sigma.refresh();
    return;
  }
  graph.forEachNode((id, attrs) => {
    const match = attrs.label.toLowerCase().includes(q) || attrs.nodeType.toLowerCase().includes(q);
    graph.setNodeAttribute(id, "hidden", !match);
  });
  sigma.refresh();
}

function showResults(q: string, el: HTMLElement): void {
  if (!q) {
    el.innerHTML = "";
    return;
  }
  const matches: string[] = [];
  graph.forEachNode((id, attrs) => {
    if (attrs.label.toLowerCase().includes(q.toLowerCase())) {
      matches.push(`<div class="search-result-item" data-id="${id}">${attrs.label}</div>`);
    }
  });
  el.innerHTML = matches.slice(0, 8).join("");
  el.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const nodeId = (item as HTMLElement).dataset.id!;
      const { showInfoCard } = import("../ui/infocard") as any;
      // Re-center camera
      import("../main").then(({ sigma }) => {
        const pos = graph.getNodeAttributes(nodeId) as { x: number; y: number };
        sigma.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.4 }, { duration: 600 });
      });
    });
  });
}

function showAllAndReset(): void {
  graph.forEachNode((id) => {
    graph.setNodeAttribute(id, "hidden", false);
    graph.setNodeAttribute(id, "highlighted", false);
  });
  sigma.refresh();
  _searchEl?.remove();
  _searchEl = null;
}

// Styles
const style = document.createElement("style");
style.textContent = `
  .search-bar {
    position: absolute;
    top: 62px;
    left: 50%;
    transform: translateX(-50%);
    width: 420px;
    padding: 8px;
    z-index: 150;
  }
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--glass-border);
    background: rgba(255,255,255,0.05);
    color: var(--text);
    font-family: var(--font-ui);
    font-size: 13px;
    outline: none;
  }
  .search-result-item {
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    color: var(--text);
    border-radius: 4px;
  }
  .search-result-item:hover { background: rgba(255,255,255,0.08); }
`;
document.head.appendChild(style);
```

**Step 3: Write src/modes/timeline.ts**

```typescript
// src/modes/timeline.ts — temporal layout with scrubber

import { graph } from "../graph";
import { sigma } from "../main";
import { killLayout } from "../layout";

const TYPE_ROWS: Record<string, number> = {
  Signal: 0,
  Belief: 1,
  Decision: 2,
  AutonomyRule: 2,
  Event: 3,
  Episodic: 4,
  Entity: 5,
  Artifact: 6,
};
const ROW_HEIGHT = 200;

let _barEl: HTMLElement | null = null;
let _playing = false;
let _playTimer: number | null = null;

export function activateTimeline(): void {
  killLayout();

  // Gather time range
  let minT = Infinity,
    maxT = -Infinity;
  graph.forEachNode((_, attrs) => {
    if (attrs.createdAt > 0) {
      minT = Math.min(minT, attrs.createdAt);
      maxT = Math.max(maxT, attrs.createdAt);
    }
  });
  if (!isFinite(minT)) return;

  // Assign temporal positions (X = normalized time, Y = type row)
  const range = maxT - minT || 1;
  const WIDTH = 4000;
  graph.forEachNode((id, attrs) => {
    const t = attrs.createdAt || minT;
    const x = ((t - minT) / range) * WIDTH - WIDTH / 2;
    const y = (TYPE_ROWS[attrs.nodeType] ?? 3) * ROW_HEIGHT - ROW_HEIGHT * 3;
    graph.setNodeAttribute(id, "x", x);
    graph.setNodeAttribute(id, "y", y);
    graph.setNodeAttribute(id, "hidden", false);
  });

  sigma.refresh();
  sigma.getCamera().animate({ x: 0, y: 0, ratio: 0.3 }, { duration: 600 });

  // Render scrubber
  renderScrubber(minT, maxT);
}

function renderScrubber(minT: number, maxT: number): void {
  _barEl?.remove();

  const bar = document.createElement("div");
  bar.className = "timeline-bar glass";
  bar.innerHTML = `
    <button class="tl-play">▶</button>
    <input class="tl-scrubber" type="range" min="${minT}" max="${maxT}" value="${maxT}" />
    <span class="tl-date"></span>
  `;
  document.getElementById("ui-root")!.appendChild(bar);
  _barEl = bar;

  const scrubber = bar.querySelector(".tl-scrubber") as HTMLInputElement;
  const dateEl = bar.querySelector(".tl-date") as HTMLElement;
  const playBtn = bar.querySelector(".tl-play") as HTMLButtonElement;

  const updateDate = (val: number) => {
    dateEl.textContent = new Date(val).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  updateDate(maxT);

  scrubber.addEventListener("input", () => {
    const cutoff = Number(scrubber.value);
    updateDate(cutoff);
    graph.forEachNode((id, attrs) => {
      graph.setNodeAttribute(id, "hidden", attrs.createdAt > cutoff);
    });
    sigma.refresh();
  });

  playBtn.addEventListener("click", () => {
    _playing = !_playing;
    playBtn.textContent = _playing ? "⏸" : "▶";
    if (_playing) {
      scrubber.value = String(minT);
      const step = (maxT - minT) / 200;
      const tick = () => {
        const cur = Number(scrubber.value);
        if (cur >= maxT || !_playing) {
          _playing = false;
          playBtn.textContent = "▶";
          return;
        }
        scrubber.value = String(cur + step);
        scrubber.dispatchEvent(new Event("input"));
        _playTimer = window.requestAnimationFrame(tick);
      };
      tick();
    }
  });

  // Space to play/pause
  document.addEventListener("keydown", (e) => {
    if (e.key === " " && e.target === document.body) {
      e.preventDefault();
      playBtn.click();
    }
  });
}

// Styles
const style = document.createElement("style");
style.textContent = `
  .timeline-bar {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    z-index: 100;
    min-width: 400px;
  }
  .tl-play {
    background: none; border: none; color: var(--text);
    font-size: 16px; cursor: pointer; padding: 4px;
  }
  .tl-scrubber { flex: 1; accent-color: var(--belief); }
  .tl-date { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); min-width: 110px; }
`;
document.head.appendChild(style);
```

**Step 4: Write src/modes/insights.ts**

```typescript
// src/modes/insights.ts — Louvain communities, causal chains, belief drift

import louvain from "graphology-communities-louvain";
import { dijkstra } from "graphology-shortest-path";
import { graph, NODE_COLORS } from "../graph";
import { sigma } from "../main";

const COMMUNITY_COLORS = [
  "#FF6B35",
  "#C77DFF",
  "#48CAE4",
  "#74C69D",
  "#FFD166",
  "#FF99C8",
  "#A0C4FF",
  "#CAFFBF",
  "#FDFFB6",
  "#BDE0FE",
];

let _panelEl: HTMLElement | null = null;

export function activateInsights(): void {
  _panelEl?.remove();

  const findings: string[] = [];

  // ── 1. Louvain communities ────────────────────────────────────────────────
  try {
    const communities = louvain(graph);
    const communityMap: Record<number, string[]> = {};
    Object.entries(communities).forEach(([id, c]) => {
      communityMap[c] = communityMap[c] ?? [];
      communityMap[c].push(id);
    });

    const largestCommunities = Object.entries(communityMap)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 5);

    largestCommunities.forEach(([c, members], i) => {
      const color = COMMUNITY_COLORS[i % COMMUNITY_COLORS.length];
      members.forEach((id) => {
        if (!graph.getNodeAttribute(id, "hidden")) {
          graph.setNodeAttribute(id, "color", color);
        }
      });
      const topNode = members
        .map((id) => ({ id, label: graph.getNodeAttribute(id, "label") as string }))
        .sort((a, b) => graph.degree(b.id) - graph.degree(a.id))[0];
      findings.push(`Cluster of ${members.length} nodes around "${topNode?.label ?? "unknown"}"`);
    });
  } catch {
    /* louvain may fail on disconnected graphs */
  }

  // ── 2. Longest causal chain ───────────────────────────────────────────────
  try {
    let longestChain: string[] = [];
    graph.forEachNode((id, attrs) => {
      if (attrs.nodeType !== "Event" && attrs.nodeType !== "Decision") return;
      const neighbors = graph.filterOutNeighbors(id, (n) => {
        const edge = graph.edge(id, n);
        return !!edge && graph.getEdgeAttribute(edge, "label") === "CAUSED_BY";
      });
      if (neighbors.length === 0) {
        // This is a chain end — walk back via dijkstra approximation
        try {
          const sources = graph.filterNodes((nid) => graph.inDegree(nid) === 0);
          for (const src of sources.slice(0, 5)) {
            const path = dijkstra.bidirectional(graph, src, id);
            if (path && path.length > longestChain.length) {
              longestChain = path;
            }
          }
        } catch {
          /* */
        }
      }
    });

    if (longestChain.length >= 3) {
      longestChain.forEach((id) => {
        if (graph.hasNode(id)) {
          graph.setNodeAttribute(id, "color", "#EF233C");
        }
      });
      findings.push(`Causal chain of ${longestChain.length} events found`);
    }
  } catch {
    /* */
  }

  // ── 3. Belief drift ───────────────────────────────────────────────────────
  let driftCount = 0;
  graph.forEachNode((id, attrs) => {
    if (attrs.nodeType === "Belief" && attrs.expiredAt !== null) {
      graph.setNodeAttribute(id, "color", NODE_COLORS.Belief + "50");
      driftCount++;
    }
  });
  if (driftCount > 0) {
    findings.push(`${driftCount} beliefs have evolved or expired`);
  }

  sigma.refresh();
  renderInsightPanel(findings);
}

function renderInsightPanel(findings: string[]): void {
  const panel = document.createElement("div");
  panel.className = "insight-panel glass";
  panel.innerHTML = `
    <div class="insight-title">INSIGHTS</div>
    ${findings.map((f) => `<div class="insight-item">◈ ${f}</div>`).join("") || '<div class="insight-item">No patterns detected yet</div>'}
  `;
  document.getElementById("ui-root")!.appendChild(panel);
  _panelEl = panel;
}

// Styles
const style = document.createElement("style");
style.textContent = `
  .insight-panel {
    position: absolute;
    top: 62px;
    right: 20px;
    width: 280px;
    padding: 14px 16px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .insight-title {
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--text-dim);
  }
  .insight-item {
    font-size: 13px;
    color: var(--text);
    line-height: 1.5;
    padding: 6px 0;
    border-bottom: 1px solid var(--glass-border);
  }
  .insight-item:last-child { border-bottom: none; }
`;
document.head.appendChild(style);
```

**Step 5: Commit**

```bash
git add src/modes/
git commit -m "feat(viz): all four modes — Cosmos, Search, Timeline, Insights"
```

---

## Task 13: Launchd plist + production build

**Files:**

- Create: `~/.openclaw/projects/graph/v4/launchd/ai.openclaw.graph-viz.plist`

**Step 1: Create plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.openclaw.graph-viz</string>

  <key>Comment</key>
  <string>PAIOS Graph Visualization Bridge (FastAPI, port 8865)</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Users/user/.openclaw/.venv/bin/uvicorn</string>
    <string>bridge:app</string>
    <string>--port</string>
    <string>8865</string>
    <string>--host</string>
    <string>127.0.0.1</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/user/.openclaw/projects/graph/v4</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>/Users/user/.openclaw/logs/graph-viz.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/user/.openclaw/logs/graph-viz.error.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>/Users/user</string>
    <key>PATH</key>
    <string>/Users/user/.openclaw/.venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>PAIOS_GRAPH_URI</key>
    <string>bolt://localhost:7687</string>
    <key>PAIOS_GRAPH_USER</key>
    <string>memgraph</string>
    <key>PAIOS_GRAPH_PASSWORD</key>
    <string></string>
  </dict>
</dict>
</plist>
```

**Step 2: Build frontend**

```bash
cd ~/.openclaw/projects/graph/v4/viz
npm run build
```

Expected: `dist/` directory created, no TypeScript errors.

**Step 3: Verify production serves from FastAPI**

```bash
cd ~/.openclaw/projects/graph/v4
~/.openclaw/.venv/bin/uvicorn bridge:app --port 8865 &
sleep 2
curl -s http://localhost:8865 | grep -c "PAIOS"
```

Expected: `1` (HTML served from FastAPI static mount).

**Step 4: Load plist**

```bash
cp ~/.openclaw/projects/graph/v4/launchd/ai.openclaw.graph-viz.plist \
   ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.openclaw.graph-viz.plist
launchctl list | grep graph-viz
```

Expected: process listed with a PID.

**Step 5: Smoke test — full manual checklist**

```
Open http://localhost:5173 (dev) or http://localhost:8865 (prod)

[ ] Dark canvas loads, no error overlay
[ ] Spine nodes visible within 2 seconds (Signals orange, Beliefs violet, Decisions cyan)
[ ] Nodes drift gently in slow force simulation
[ ] Hover: node brightens, non-neighbors dim to ~15%
[ ] Click: camera re-centers, info card appears near node
[ ] Double-click: side panel slides in from right
[ ] Press 1-4: modes switch, mode bar updates
[ ] Press L: labels toggle
[ ] Press ESC: info card dismisses
[ ] Mode 2 (Search): type a word, nodes filter in real-time
[ ] Mode 3 (Timeline): nodes reposition by date, scrubber moves them
[ ] Mode 4 (Insights): community colors applied, insight panel appears
[ ] Layer pill (bottom-left): click "Event" to load Event nodes
```

**Step 6: Commit all**

```bash
cd ~/.openclaw/projects/graph/v4
git add launchd/ai.openclaw.graph-viz.plist viz/
git commit -m "feat(viz): production build, launchd plist, smoke test checklist complete"
```

---

## Task 14: Integration tests + bridge pytest

**Files:**

- Run existing tests

**Step 1: Run bridge tests**

```bash
cd ~/.openclaw/projects/graph/v4
~/.openclaw/.venv/bin/pytest tests/test_bridge.py -v
```

Expected: 6/6 tests pass.

**Step 2: Final commit**

```bash
git commit -m "test(viz): bridge integration tests passing"
```

---

## Summary

| Task | Component            | Output                                    |
| ---- | -------------------- | ----------------------------------------- |
| 1    | FastAPI bridge       | 5 endpoints + 6 integration tests         |
| 2    | Vite scaffold        | project structure, CSS, dark canvas       |
| 3    | API client           | typed fetch wrapper                       |
| 4    | graphology layer     | merge helpers, node/edge config           |
| 5    | WebGL glow program   | custom Sigma node renderer                |
| 6    | Sigma canvas + edges | initialized renderer, edge opacity        |
| 7    | ForceAtlas2 worker   | layout + breathing drift                  |
| 8    | Hover interaction    | dim non-neighbors to 15%                  |
| 9    | Info card            | click re-center + floating card           |
| 10   | Side panel           | double-click full detail + Graphiti facts |
| 11   | Mode bar + layers    | 4 modes (1-4 keys), layer toggles         |
| 12   | Four modes           | Cosmos, Search, Timeline, Insights        |
| 13   | Production           | build + launchd + smoke test              |
| 14   | Tests                | bridge integration suite                  |

**Start bridge:** `uvicorn bridge:app --port 8865 --reload` (from `v4/` dir)
**Start dev:** `npm run dev` (from `v4/viz/` dir)
**Open:** http://localhost:5173
