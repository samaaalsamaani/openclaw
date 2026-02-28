# PAIOS Graph Visualization — Design Document

**Date:** 2026-02-28
**Status:** Approved, ready for implementation
**Project:** `~/.openclaw/projects/graph/v4/`

---

## Overview

A local web application that renders the PAIOS Memgraph knowledge graph as an
interactive dark-cosmos visualization — inspired by Obsidian's graph view but
purpose-built for a personal AI intelligence layer.

The graph (12,547 nodes, 34,572 edges) holds personal memory: Events,
Decisions, Beliefs, Signals, Entities, Artifacts, Episodic episodes — wired by
causal, temporal, and semantic edges. The visualization gives this data a
spatial, navigable, and alive form.

---

## Architecture

```
Browser (localhost:5173)
  └── Vite + TypeScript app
        ├── Sigma.js v3  (WebGL canvas — the graph)
        ├── graphology    (in-memory graph object + algorithms)
        └── Vanilla TS UI (overlays, panels, controls)
              │
              │ HTTP/JSON (fetch)
              ▼
FastAPI bridge (localhost:8765)
  ├── GET  /graph/spine          → Signals + Beliefs + top Decisions (PageRank)
  ├── GET  /graph/neighborhood   → N-hop neighborhood around a node uuid
  ├── GET  /graph/timeline       → Nodes filtered by date range
  ├── GET  /graph/layers         → Node counts per label (for layer toggles)
  └── POST /graph/query          → Raw Cypher (search / power users)
              │
              │ Bolt (neo4j driver)
              ▼
Memgraph (localhost:7687)
```

### Key decisions

- **No framework.** Vanilla TypeScript + Sigma + graphology. Ships as a single
  `index.html` + bundled JS. No React overhead for a single-page canvas app.
- **Client-side graph object.** graphology holds the loaded subgraph in memory.
  Filtering, layout, and algorithms run client-side — no round-trips for
  pan/zoom/filter/search.
- **Python bridge reuses existing venv.** FastAPI + uvicorn, ~150 lines, 5
  endpoints. Wraps the neo4j bolt driver already used by `mcp_bridge.py`.
- **Single-process production.** `vite build` outputs to `dist/`. FastAPI serves
  `dist/` as static files via `StaticFiles` — one command, one port.
- **Dev proxy.** Vite config proxies `/graph/*` → `http://localhost:8765`.

---

## Visual Design

### Canvas

- Background: `#050508` (near-black with a faint blue cast)
- Subtle radial vignette: center slightly lighter, edges darker
- No grid, no axes. The graph is the space.

### Node types

| Type             | Shape          | Color                    | Glow                   | Size               |
| ---------------- | -------------- | ------------------------ | ---------------------- | ------------------ |
| Signal           | Circle         | `#FF6B35` orange-red     | Strong pulse animation | Fixed large        |
| Belief           | Circle         | `#C77DFF` violet         | Soft steady glow       | Fixed medium-large |
| Decision         | Circle         | `#48CAE4` cyan           | Medium glow            | PageRank score     |
| Event            | Circle         | `#74C69D` green          | Faint, dim by default  | Fixed small        |
| Entity           | Diamond        | `#FFD166` amber          | Faint                  | Degree centrality  |
| Artifact         | Rounded square | `#ADB5BD` grey           | None                   | Fixed small        |
| Episodic         | Circle         | `#6C757D` dark grey      | None                   | Fixed tiny         |
| Belief (expired) | Circle         | `#C77DFF` at 30% opacity | None                   | Same as Belief     |

**Glow implementation:** Each node renders via a custom Sigma WebGL program — a
radial gradient disc: bright white core, type color at 40% radius, transparent
at edge. No post-processing required; the gradient falloff against the black
background creates natural bloom. Implemented as a custom fragment shader
extending Sigma's `NodeCircleProgram`.

### Edge types

| Type          | Color           | Base opacity | Width |
| ------------- | --------------- | ------------ | ----- |
| `SUPPORTS`    | `#FFD166` gold  | 0.15         | 0.5px |
| `CAUSED_BY`   | `#EF233C` red   | 0.6          | 1.5px |
| `RELATES_TO`  | `#48CAE4` cyan  | 0.4          | 1px   |
| `MENTIONS`    | `#ADB5BD` grey  | 0.2          | 0.5px |
| `HAPPENED_ON` | `#74C69D` green | 0.15         | 0.5px |

`SUPPORTS` is near-invisible at rest (20,308 edges would create visual noise).
Brightens to 0.7 opacity on hover of a connected node.

### Typography

- Node labels: `Inter` 11px, white 60% opacity, visible only at zoom ≥ 1.2
- UI chrome: `JetBrains Mono` for data values, `Inter` for labels
- Panels: dark glass — `rgba(10,10,20,0.85)` + `backdrop-filter: blur(12px)`

### Layer toggles

Bottom-left glassmorphism pill: colored dot per node type + count. Click to
toggle. Toggled nodes dissolve out with 300ms fade.

---

## The Four Modes

Toggled from a top-center pill navigation bar. Switching modes re-runs layout
and re-filters the graphology object — canvas animates between states.

### Mode 1 — COSMOS (default)

The spine view. On load, PageRank runs client-side. Top ~300 nodes by score
become visible (Signals, Beliefs, high-centrality Decisions). Remaining nodes
exist in graphology but are hidden in Sigma.

Force layout (ForceAtlas2 via Web Worker):

- Strong repulsion between spine nodes (constellations spread out)
- Moderate attraction along `CAUSED_BY` and `SUPPORTS` edges
- Center gravity prevents infinite drift

Continuous slow simulation (alpha 0.001 decay) — graph breathes gently.
Hovering a node freezes its neighbors. Minimal chrome: layer toggles + mode bar.

### Mode 2 — SEARCH

Top-center search bar expands. Typing filters graphology's label index in
real-time — matching nodes pulse bright, non-matching dims to 5% opacity.
Selecting a result re-centers the graph and triggers click behavior.

Prefix query with `/` for raw Cypher → FastAPI bridge → results render as a
temporary orange-outlined overlay subgraph.

### Mode 3 — TIMELINE

Force layout replaced by temporal layout: X-axis = time, Y-axis = node type
row. Events flow left-to-right. Decisions above. Beliefs as persistent
landmarks at top.

Scrubber bar at bottom: drag to move time window. Nodes appear/disappear.
Speed control. Play button animates graph growth from earliest recorded data
to present. No network calls — all loaded nodes have `valid_at` / `created_at`.

### Mode 4 — INSIGHTS

Three auto-computed overlays (toggleable):

1. **Causal chains** — `CAUSED_BY` edges traced via graphology-shortest-path.
   Chains ≥ 3 hops highlighted in red. Longest chain pulses.

2. **Belief drift** — Beliefs with `expired_at` set shown alongside successors.
   Faded violet → bright violet gradient arc between old and new belief.

3. **Decision clusters** — Louvain community detection (graphology-communities-louvain).
   Each cluster gets a soft colored nebula halo behind its members.

Right-side insight panel: top 5 findings in plain text (e.g. "3 decisions in
the last 7 days trace back to one belief from October 2025").

---

## Interaction Model

### Hover

Node brightens to full glow. Direct neighbors brighten; everything else dims to
15%. Edge lines to neighbors animate to full opacity and type color. Tooltip:
node label + type badge. Unconnected edges disappear.

### Single click — re-center + info card

Camera animates to center clicked node (`sigma.camera.animate()`). 2-hop
neighborhood loads from `/graph/neighborhood` if not in graphology — new nodes
fade in. Non-neighborhood nodes dim to 8%.

Inline info card appears near node (30° offset, connected by thin line):

```
╭─────────────────────────────────╮
│ ◉ BELIEF                        │
│ "Speed compounds more than      │
│  quality in early stages"       │
│                                 │
│ Created  Feb 14 2026            │
│ Edges    12 connections         │
│ Score    0.847 (PageRank)       │
│                                 │
│ [Expand]  [Timeline]  [⋯ More] │
╰─────────────────────────────────╯
```

Card actions:

- **Expand** — loads 3-hop neighborhood
- **Timeline** — switches to Timeline mode at this node's time period
- **More** — opens full side panel

Dismiss: click canvas or `ESC` (returns to previous camera position).

### Double click — full side panel

380px glassmorphism panel slides in from right (`backdrop-filter: blur(16px)`):

```
╭──────────────────────────────────────╮
│  ◉ BELIEF                      [✕]  │
│  ─────────────────────────────────── │
│  "Speed compounds more than          │
│   quality in early stages"           │
│                                      │
│  PROPERTIES                          │
│  created_at   Feb 14 2026            │
│  group_id     paios-main             │
│  uuid         a3f2...                │
│                                      │
│  CONNECTIONS  (12)                   │
│  → SUPPORTS    Decision: "Ship v3"   │
│  → SUPPORTS    Event: "Feb 14 sync"  │
│  → CAUSED_BY   Signal: "Velocity"    │
│  ── show all ──                      │
│                                      │
│  GRAPHITI FACTS                      │
│  "This belief was reinforced 3x      │
│   during the Feb sprint..."          │
│                                      │
│  RAW CYPHER  [↗]                    │
╰──────────────────────────────────────╯
```

**Graphiti Facts** calls `mcp_bridge.py context` with node name — surfaces
semantically related facts from the full knowledge base.

**RAW CYPHER** opens mini query editor pre-populated with
`MATCH (n {uuid: "..."}) RETURN n`.

### Canvas navigation

- Scroll: zoom (smooth, GPU-driven)
- Click + drag: pan
- Double-click empty canvas: zoom to fit all visible nodes
- Right-click node: context menu — Pin / Hide / Copy UUID / Open in Memgraph Lab

### Keyboard shortcuts

| Key     | Action                                 |
| ------- | -------------------------------------- |
| `ESC`   | Dismiss card / return to previous view |
| `/`     | Focus search bar                       |
| `1–4`   | Switch modes                           |
| `L`     | Toggle labels                          |
| `Space` | Play/pause (Timeline mode)             |

---

## Data Flow

### Initial load

1. FastAPI starts → connects to Memgraph bolt://7687
2. Browser fetches `GET /graph/spine`
3. FastAPI: PageRank-weighted Cypher returns Signals + Beliefs + top Decisions (≤500 nodes) + edges between them
4. graphology populated in-memory
5. ForceAtlas2 runs 500 iterations in Web Worker (non-blocking)
6. Sigma renders → canvas alive in ~1.5s

### Neighborhood expansion

```
GET /graph/neighborhood?uuid=<uuid>&hops=2

Cypher:
  MATCH (n {uuid: $uuid})-[r*1..2]-(m)
  RETURN n, m, r LIMIT 150

Browser: graphology.mergeNode / mergeEdge (idempotent)
Sigma: new nodes fade in over 400ms
ForceAtlas2: brief resume to absorb new nodes
```

### Layer toggle

```
GET /graph/layers?label=Event&limit=2000

Cypher: MATCH (n:Event) RETURN n LIMIT 2000
        + edges connecting to already-loaded nodes

Browser: merges into graphology, Sigma fades nodes in
```

### Timeline scrubber

No network call. All loaded nodes have `created_at` / `valid_at`.

```typescript
graphology.filterNodes((id, attrs) => attrs.created_at <= scrubberDate);
```

Layout switches to temporal grid (precomputed positions, no force simulation).

### Insights

- Causal chains: graphology-shortest-path on `CAUSED_BY` edges (client-side)
- Communities: graphology-communities-louvain in Web Worker
- Belief drift: filter `expired_at IS NOT NULL` + successors
- All three: computed once on mode activation, cached until graph changes

### Search

- Text: graphology label index → instant client-side
- `/cypher`: `POST /graph/query` → Memgraph → orange overlay subgraph

### FastAPI startup

Development: `uvicorn bridge:app --port 8765 --reload`
Production: FastAPI serves `dist/` via `StaticFiles` — single process, single port
Launchd: `ai.openclaw.graph-viz.plist` starts bridge at login

---

## Error Handling

| Failure                      | Behavior                                               |
| ---------------------------- | ------------------------------------------------------ |
| Memgraph unreachable         | Full-canvas message + retry button                     |
| Neighborhood returns 0 nodes | Info card shows "No connections found"                 |
| FastAPI bridge down          | Overlay with start command on first fetch              |
| Cypher error (search mode)   | Inline red error in search bar                         |
| Force layout diverges        | graphology bounding-box normalization clamps positions |

---

## Testing

- **FastAPI bridge:** pytest, 5 integration tests against live Memgraph
- **graphology algorithms:** unit tests — PageRank output shape, Louvain returns ≥1 community, timeline filter date range
- **Sigma rendering:** manual smoke test checklist (spine loads, click expands, timeline scrubs, 4 modes switch)
- **End-to-end:** one Playwright test — app loads, first node clickable, info card appears

---

## File Structure

```
~/.openclaw/projects/graph/v4/
  viz/
    index.html
    src/
      main.ts           ← app entry, Sigma init
      graph.ts          ← graphology object, load/merge helpers
      layout.ts         ← ForceAtlas2 worker, temporal layout
      modes/
        cosmos.ts       ← default spine mode
        search.ts       ← search + Cypher mode
        timeline.ts     ← temporal layout + scrubber
        insights.ts     ← Louvain, causal chains, belief drift
      ui/
        infocard.ts     ← inline node card
        sidepanel.ts    ← full detail panel
        layers.ts       ← bottom layer toggle pill
        modebar.ts      ← top mode navigation
      renderer/
        node-glow.ts    ← custom Sigma WebGL node program
        edge-colors.ts  ← edge color/opacity by type
    vite.config.ts
    tsconfig.json
    package.json
  bridge.py             ← FastAPI bridge (5 endpoints)
  launchd/
    ai.openclaw.graph-viz.plist
```

---

## Dependencies

**Frontend**

- `sigma` v3
- `graphology` + `graphology-layout-forceatlas2` + `graphology-communities-louvain` + `graphology-shortest-path`
- `vite` + `typescript`

**Backend**

- `fastapi` + `uvicorn` (already in Python venv)
- `neo4j` driver (already installed)

No new Python dependencies needed.
