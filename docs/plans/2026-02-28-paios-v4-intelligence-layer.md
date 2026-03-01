# PAIOS v4 Intelligence Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the four critical gaps in PAIOS v4 — temporal properties, structural relationships, learning loop, and retroactive knowledge mining — transforming the graph from 11,800 isolated nodes into a functioning temporal knowledge system.

**Architecture:** Four phases build on each other. Phase 1 fixes the foundation (temporal model). Phase 2 wires the graph structure (relationships). Phase 3 adds the learning loop (outcome → lesson). Phase 4 seeds the graph with historical knowledge via Graphiti's LLM extraction pipeline.

**Tech Stack:** Python 3.14, Memgraph (bolt://localhost:7687), graphiti-core 0.30.0rc5, neo4j async driver. All scripts at `~/.openclaw/projects/graph/v4/`. Run with `~/.openclaw/.venv/bin/python3`.

**Critical data facts discovered during planning:**
- `outcome_rating` is NULL for ALL 2,651 decisions — learning loop must use Graphiti episode mining, not the DB column
- `valid_until` is NULL for all 71 beliefs — no expiry data in source
- decisions DO have `rationale` text — Graphiti can extract entities from them
- Source DB: `agent_id` field does not exist in any SQLite table — derive from `db_name + table_name`

**Run any verification with:**
```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/health_check.py
```

---

## Phase 1: Fix Temporal Properties

> **Goal:** Every structured node gets all 6 temporal fields. `expired_at` invalidation becomes functional.

---

### Task 1: Add `source` and `agent_id` to all CDC mappings + fix `expired_at` sentinel

**Files:**
- Modify: `~/.openclaw/projects/graph/v4/cdc_worker.py`

**What's broken:** `expired_at = null` is hard-coded as a literal in ON CREATE — it's never set to anything else. `source` and `agent_id` are missing from Decision, Signal, Belief, Score, Artifact, Habit, AutonomyRule, and Approval mappings. Without these, you can't distinguish active from expired facts or trace which system created each node.

**Step 1: Read the file header and understand the `_ts()` helper**

```bash
head -30 ~/.openclaw/projects/graph/v4/cdc_worker.py
```

Note that `_ts()` normalises timestamps. We'll use `db_path.name` as the `source` value (e.g. `"observability.sqlite"`) and derive `agent_id` as `"cdc/{table}"`.

**Step 2: Update `map_to_cypher()` — `decisions` mapping**

Find the `elif table == "decisions":` block (~line 167). Replace the entire block with:

```python
    elif table == "decisions":
        return (
            """
            MERGE (d:Decision {decision_id: $decision_id})
            ON CREATE SET
                d.title          = $title,
                d.domain         = $domain,
                d.chosen         = $chosen,
                d.rationale      = $rationale,
                d.confidence     = $confidence,
                d.outcome_rating = $outcome_rating,
                d.decision_class = $decision_class,
                d.life_area      = $life_area,
                d.valid_at       = $valid_at,
                d.discovered_at  = $discovered_at,
                d.expired_at     = null,
                d.source         = $source,
                d.agent_id       = $agent_id,
                d.confidence     = $confidence
            ON MATCH SET
                d.outcome_rating = $outcome_rating,
                d.discovered_at  = $discovered_at
            """,
            {
                "decision_id":   str(data.get("id", "")),
                "title":         (data.get("title") or "")[:200],
                "domain":        data.get("domain", "general"),
                "chosen":        (data.get("chosen") or "")[:500],
                "rationale":     (data.get("rationale") or "")[:500],
                "confidence":    data.get("confidence", 0.5),
                "outcome_rating": data.get("outcome_rating"),
                "decision_class": data.get("decision_class", ""),
                "life_area":     data.get("life_area", ""),
                "valid_at":      _ts(data.get("created_at"), occurred_at),
                "discovered_at": discovered,
                "source":        "kb.sqlite/decisions",
                "agent_id":      "cdc/decisions",
            }
        )
```

**Step 3: Update `officer_signals` mapping**

Find the `elif table == "officer_signals":` block. Add `source` and `agent_id` to ON CREATE SET and params dict:

```python
                s.source        = $source,
                s.agent_id      = $agent_id,
```

Add to params:
```python
                "source":    "kb.sqlite/officer_signals",
                "agent_id":  f"cdc/officer_signals/{data.get('from_role', 'system')}",
```

**Step 4: Update `thinking_beliefs` mapping**

Same pattern. Add to ON CREATE SET:
```python
                b.source         = $source,
                b.agent_id       = $agent_id,
```

Add to params (use `valid_from` if set, else `created_at`):
```python
                "valid_at":  _ts(data.get("valid_from") or data.get("created_at"), occurred_at),
                "source":    "kb.sqlite/thinking_beliefs",
                "agent_id":  "cdc/thinking_beliefs",
```

**Step 5: Update `posts`, `scores`, `habits`, `action_rules`, `approval_log` mappings**

For each remaining table, add `source` and `agent_id` fields following the same pattern.
Use `"{db_name}/{table_name}"` for `source` and `"cdc/{table_name}"` for `agent_id`.

Note: `posts` already has `expired_at = null` — leave that, it gets set by the Graphiti conflict resolution layer in Phase 3.

**Step 6: Add an `expire_node()` helper function**

After the `_ts()` function (~line 93), add:

```python
async def expire_node(session, node_label: str, id_field: str, node_id: str):
    """Mark a node as expired. Used when a contradicting fact is discovered."""
    expired = datetime.now(timezone.utc).isoformat()
    await session.run(
        f"""
        MATCH (n:{node_label} {{{id_field}: $node_id}})
        WHERE n.expired_at IS NULL
        SET n.expired_at = $expired_at,
            n.confidence = 0.0
        """,
        {"node_id": node_id, "expired_at": expired}
    )
```

**Step 7: Verify the changes parse correctly**

```bash
~/.openclaw/.venv/bin/python3 -c "
import ast
with open('/Users/user/.openclaw/projects/graph/v4/cdc_worker.py') as f:
    src = f.read()
ast.parse(src)
print('✅ syntax valid')
"
```

Expected: `✅ syntax valid`

**Step 8: Test a new decision sync picks up source and agent_id**

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio, sqlite3
from pathlib import Path
from neo4j import AsyncGraphDatabase

async def test():
    # Insert a test decision
    conn = sqlite3.connect(str(Path.home() / ".openclaw/projects/knowledge-base/kb.sqlite"))
    conn.execute("""
        INSERT INTO decisions (title, domain, chosen, rationale, confidence, created_at)
        VALUES ('Test temporal properties', 'test', 'Option A', 'Testing v4 temporal model', 0.8, datetime('now'))
    """)
    conn.commit()
    test_id = conn.execute("SELECT MAX(id) FROM decisions").fetchone()[0]
    conn.close()

    import time; time.sleep(0.5)  # Let CDC worker pick it up

    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        r = await s.run("MATCH (n:Decision {decision_id: $id}) RETURN n", id=str(test_id))
        rec = await r.single()
        if rec:
            n = rec['n']
            print(f"✅ source: {n.get('source')}")
            print(f"✅ agent_id: {n.get('agent_id')}")
            print(f"✅ expired_at: {n.get('expired_at')}")
            print(f"✅ valid_at: {n.get('valid_at')}")
            assert n.get('source') == 'kb.sqlite/decisions', f"source mismatch: {n.get('source')}"
            assert n.get('agent_id') == 'cdc/decisions', f"agent_id mismatch"
        else:
            print("❌ Decision not found in Memgraph after 500ms")

    await d.close()

    # Cleanup test row
    conn = sqlite3.connect(str(Path.home() / ".openclaw/projects/knowledge-base/kb.sqlite"))
    conn.execute("DELETE FROM decisions WHERE title = 'Test temporal properties'")
    conn.commit()
    conn.close()
    print("✅ Task 1 complete — temporal properties correct")

asyncio.run(test())
EOF
```

Expected: All three `✅` lines printed.

**Step 9: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/cdc_worker.py
git commit -m "feat(v4): Task 1 — add source/agent_id to all CDC mappings + expire_node() helper"
```

---

## Phase 2: Structural Relationships

> **Goal:** Wire the edges that make this a *knowledge* graph. Moment nodes for temporal anchoring, AutonomyRule→Approval for feedback loop, Event causal chains.

---

### Task 2: Create Moment nodes and temporal anchoring edges

**Files:**
- Create: `~/.openclaw/projects/graph/v4/wire_edges.py`
- Modify: `~/.openclaw/projects/graph/v4/memgraph_driver.py`

**What this unlocks:** `HAPPENED_ON` and `DECIDED_ON` edges let you query "what happened on bad days" — the core temporal analysis use case. Moment nodes are one-per-calendar-day anchors.

**Step 1: Add Moment to memgraph_driver.py indexes**

In `patch_graphiti_for_memgraph()`, find `MEMGRAPH_RANGE_INDEXES`. Add:

```python
        'CREATE INDEX ON :Moment(date)',
        'CREATE INDEX ON :Moment(day_score)',
```

**Step 2: Create `wire_edges.py`**

Create `~/.openclaw/projects/graph/v4/wire_edges.py`:

```python
#!/usr/bin/env python3
"""
PAIOS v4 Edge Wiring — creates structural relationships between existing nodes.

Run order:
  python3 wire_edges.py moments      # Create Moment nodes + temporal anchoring edges
  python3 wire_edges.py autonomy     # AutonomyRule → Approval (BASED_ON)
  python3 wire_edges.py causal       # Event → Event (CAUSED_BY via trace_id)
  python3 wire_edges.py beliefs      # Belief → Decision (SUPPORTS) via text similarity
  python3 wire_edges.py all          # All of the above in sequence

Usage:
  ~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/wire_edges.py moments
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from neo4j import AsyncGraphDatabase

GRAPH_URI      = os.getenv("PAIOS_GRAPH_URI",      "bolt://localhost:7687")
GRAPH_USER     = os.getenv("PAIOS_GRAPH_USER",     "memgraph")
GRAPH_PASSWORD = os.getenv("PAIOS_GRAPH_PASSWORD", "")


async def wire_moments(session) -> int:
    """
    Create one Moment node per calendar day observed in Events and Decisions.
    Then create HAPPENED_ON (Event → Moment) and DECIDED_ON (Decision → Moment) edges.

    Moment node properties:
      date: String  "2026-02-28"
      day_of_week: String  "Saturday"
    """
    print("Creating Moment nodes from Event timestamps...")
    r = await session.run("""
        MATCH (e:Event)
        WHERE e.valid_at IS NOT NULL AND e.expired_at IS NULL
        WITH toString(date(e.valid_at)) AS day
        MERGE (m:Moment {date: day})
        ON CREATE SET m.day_of_week = toString(dayOfWeek(date(day)))
        RETURN count(m) AS created
    """)
    rec = await r.single()
    print(f"  Moment nodes from events: {rec['created'] if rec else 0}")

    print("Creating Moment nodes from Decision timestamps...")
    r = await session.run("""
        MATCH (d:Decision)
        WHERE d.valid_at IS NOT NULL AND d.expired_at IS NULL
        WITH toString(date(d.valid_at)) AS day
        MERGE (m:Moment {date: day})
        ON CREATE SET m.day_of_week = toString(dayOfWeek(date(day)))
        RETURN count(m) AS created
    """)
    rec = await r.single()
    print(f"  Moment nodes from decisions: {rec['created'] if rec else 0}")

    print("Creating HAPPENED_ON edges (Event → Moment)...")
    r = await session.run("""
        MATCH (e:Event)
        WHERE e.valid_at IS NOT NULL AND e.expired_at IS NULL
        WITH e, toString(date(e.valid_at)) AS day
        MATCH (m:Moment {date: day})
        MERGE (e)-[rel:HAPPENED_ON]->(m)
        ON CREATE SET rel.created_at = $now
        RETURN count(rel) AS edges
    """, {"now": datetime.now(timezone.utc).isoformat()})
    rec = await r.single()
    happened_on = rec['edges'] if rec else 0
    print(f"  HAPPENED_ON edges created: {happened_on}")

    print("Creating DECIDED_ON edges (Decision → Moment)...")
    r = await session.run("""
        MATCH (d:Decision)
        WHERE d.valid_at IS NOT NULL AND d.expired_at IS NULL
        WITH d, toString(date(d.valid_at)) AS day
        MATCH (m:Moment {date: day})
        MERGE (d)-[rel:DECIDED_ON]->(m)
        ON CREATE SET rel.created_at = $now
        RETURN count(rel) AS edges
    """, {"now": datetime.now(timezone.utc).isoformat()})
    rec = await r.single()
    decided_on = rec['edges'] if rec else 0
    print(f"  DECIDED_ON edges created: {decided_on}")

    return happened_on + decided_on


async def wire_autonomy(session) -> int:
    """
    Wire (Approval)-[:BASED_ON]->(AutonomyRule) by matching pattern strings.
    Approval.pattern matches AutonomyRule.pattern (exact or substring).
    """
    print("Wiring AutonomyRule → Approval (BASED_ON)...")
    r = await session.run("""
        MATCH (r:AutonomyRule), (a:Approval)
        WHERE a.pattern = r.pattern
           OR a.pattern CONTAINS r.pattern
           OR r.pattern CONTAINS a.pattern
        MERGE (a)-[rel:BASED_ON]->(r)
        ON CREATE SET rel.created_at = $now
        RETURN count(rel) AS edges
    """, {"now": datetime.now(timezone.utc).isoformat()})
    rec = await r.single()
    count = rec['edges'] if rec else 0
    print(f"  BASED_ON edges created: {count}")

    # Update rule stats: count approvals vs denials
    await session.run("""
        MATCH (r:AutonomyRule)<-[:BASED_ON]-(a:Approval)
        WITH r,
             count(a) AS total,
             sum(CASE WHEN toLower(a.action) CONTAINS 'approv' THEN 1 ELSE 0 END) AS approvals,
             sum(CASE WHEN toLower(a.action) CONTAINS 'den' THEN 1 ELSE 0 END) AS denials
        SET r.total_activations = total,
            r.approval_count    = approvals,
            r.denial_count      = denials,
            r.approval_rate     = toFloat(approvals) / toFloat(total)
    """)
    print("  AutonomyRule stats updated (approval_rate, denial_count)")
    return count


async def wire_causal(session) -> int:
    """
    Wire (Event)-[:CAUSED_BY]->(Event) using trace_id chains.
    Events sharing a trace_id form a causal sequence — ordered by timestamp.
    The first event in a trace is the root cause.
    """
    print("Wiring Event causal chains (CAUSED_BY via trace_id)...")
    r = await session.run("""
        MATCH (e1:Event), (e2:Event)
        WHERE e1.trace_id = e2.trace_id
          AND e1.trace_id IS NOT NULL
          AND e1.trace_id <> ''
          AND e1.event_id <> e2.event_id
          AND e1.valid_at < e2.valid_at
        WITH e2, e1
        ORDER BY e1.valid_at DESC
        WITH e2, head(collect(e1)) AS cause
        MERGE (e2)-[rel:CAUSED_BY]->(cause)
        ON CREATE SET rel.confidence = 0.8,
                      rel.inference_method = 'trace_id',
                      rel.created_at = $now
        RETURN count(rel) AS edges
    """, {"now": datetime.now(timezone.utc).isoformat()})
    rec = await r.single()
    count = rec['edges'] if rec else 0
    print(f"  CAUSED_BY edges created: {count}")
    return count


async def wire_beliefs(session) -> int:
    """
    Wire (Belief)-[:SUPPORTS]->(Decision) using domain match.
    If a belief's domain matches a decision's domain, it potentially supports it.
    Uses conservative matching — only same domain, both active.
    A full semantic similarity pass requires Graphiti (done in Task 4).
    """
    print("Wiring Belief → Decision (SUPPORTS via domain match)...")
    r = await session.run("""
        MATCH (b:Belief), (d:Decision)
        WHERE b.domain = d.domain
          AND b.expired_at IS NULL
          AND d.expired_at IS NULL
          AND b.confidence > 0.5
        MERGE (b)-[rel:SUPPORTS]->(d)
        ON CREATE SET rel.confidence   = b.confidence * 0.5,
                      rel.match_type   = 'domain',
                      rel.created_at   = $now,
                      rel.valid_at     = $now,
                      rel.expired_at   = null
        RETURN count(rel) AS edges
    """, {"now": datetime.now(timezone.utc).isoformat()})
    rec = await r.single()
    count = rec['edges'] if rec else 0
    print(f"  SUPPORTS edges created (domain match): {count}")
    print("  Note: Semantic SUPPORTS edges added in Task 4 after retroactive mining")
    return count


async def verify(session):
    """Print edge type counts after wiring."""
    print("\n── Edge Verification ─────────────────────────────")
    r = await session.run("""
        MATCH ()-[e]->()
        RETURN type(e) AS t, count(e) AS c
        ORDER BY c DESC
    """)
    rows = await r.data()
    total = 0
    for row in rows:
        print(f"  {row['t']:<25} {row['c']:>6,}")
        total += row['c']
    print(f"  {'TOTAL':<25} {total:>6,}")

    r = await session.run("MATCH (m:Moment) RETURN count(m) AS c")
    rec = await r.single()
    print(f"\n  Moment nodes: {rec['c'] if rec else 0}")


COMMANDS = {
    "moments":  wire_moments,
    "autonomy": wire_autonomy,
    "causal":   wire_causal,
    "beliefs":  wire_beliefs,
}


async def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"

    driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    total_edges = 0

    try:
        async with driver.session() as session:
            if cmd == "all":
                for name, fn in COMMANDS.items():
                    print(f"\n{'='*50}")
                    print(f"Running: {name}")
                    print('='*50)
                    total_edges += await fn(session)
            elif cmd in COMMANDS:
                total_edges += await COMMANDS[cmd](session)
            else:
                print(f"Unknown command: {cmd}. Valid: {list(COMMANDS)} + 'all'")
                sys.exit(1)

            await verify(session)

    finally:
        await driver.close()

    print(f"\n✅ wire_edges complete — {total_edges} new edges created")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 3: Run moments wiring first (safest, pure Cypher)**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/wire_edges.py moments
```

Expected output:
```
Creating Moment nodes from Event timestamps...
  Moment nodes from events: ~300 (one per unique day in 7,843 events)
Creating HAPPENED_ON edges...
  HAPPENED_ON edges created: ~7,843
Creating DECIDED_ON edges...
  DECIDED_ON edges created: ~2,651
```

**Step 4: Run autonomy wiring**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/wire_edges.py autonomy
```

Expected: Some BASED_ON edges from the 196 rules × 262 approvals where patterns overlap.

**Step 5: Run causal wiring**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/wire_edges.py causal
```

Expected: Events with shared trace_ids get CAUSED_BY edges.

**Step 6: Run belief→decision wiring**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/wire_edges.py beliefs
```

**Step 7: Verify total edge count has meaningfully increased**

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio
from neo4j import AsyncGraphDatabase

async def check():
    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        r = await s.run("MATCH ()-[e]->() RETURN count(e) AS c")
        rec = await r.single()
        total = rec['c'] if rec else 0
        r = await s.run("MATCH (m:Moment) RETURN count(m) AS c")
        rec = await r.single()
        moments = rec['c'] if rec else 0
        # Test temporal query now works
        r = await s.run("""
            MATCH (e:Event)-[:HAPPENED_ON]->(m:Moment)
            RETURN m.date, count(e) AS event_count
            ORDER BY event_count DESC LIMIT 3
        """)
        rows = await r.data()
    await d.close()
    print(f"Total edges: {total:,} (was ~76)")
    print(f"Moment nodes: {moments}")
    print("Top 3 busiest days:")
    for row in rows:
        print(f"  {row['m.date']}: {row['event_count']} events")
    assert total > 5000, f"Expected >5000 edges, got {total}"
    print("✅ Task 2 complete — graph is a graph, not just nodes")

asyncio.run(check())
EOF
```

Expected: Total edges > 5,000. Top days showing actual event clusters.

**Step 8: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/wire_edges.py v4/memgraph_driver.py
git commit -m "feat(v4): Task 2 — Moment nodes + HAPPENED_ON/DECIDED_ON/CAUSED_BY/BASED_ON/SUPPORTS edges"
```

---

## Phase 3: Learning Loop

> **Goal:** Add Outcome and Lesson node types. Build the mechanism that turns decision history into extractable wisdom.

---

### Task 3: Add Outcome and Lesson node types to schema

**Files:**
- Modify: `~/.openclaw/projects/graph/v4/memgraph_driver.py`

**What this builds:** The schema foundation for the learning loop. Without these node types, the `learning_loop.py` script has nowhere to write.

**Step 1: Add Outcome and Lesson indexes to `MEMGRAPH_RANGE_INDEXES`**

In `patch_graphiti_for_memgraph()`, find `MEMGRAPH_RANGE_INDEXES`. Add:

```python
        'CREATE INDEX ON :Outcome(outcome_id)',
        'CREATE INDEX ON :Outcome(decision_id)',
        'CREATE INDEX ON :Outcome(valid_at)',
        'CREATE INDEX ON :Lesson(lesson_id)',
        'CREATE INDEX ON :Lesson(domain)',
        'CREATE INDEX ON :Lesson(applied_count)',
```

**Step 2: Add Lesson text index to `MEMGRAPH_TEXT_INDEXES`**

```python
        "CREATE TEXT INDEX lesson_text ON :Lesson(lesson_text)",
```

**Step 3: Run schema initializer to create new indexes**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/schema.py
```

Expected: New indexes appear in the `SHOW INDEX INFO` output.

**Step 4: Verify new indexes exist**

```bash
echo "SHOW INDEX INFO;" | docker exec -i memgraph mgconsole 2>&1 | grep -E "Outcome|Lesson"
```

Expected: Lines showing index type for Outcome and Lesson labels.

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/memgraph_driver.py
git commit -m "feat(v4): Task 3 — Outcome and Lesson node type indexes"
```

---

### Task 4: Build `learning_loop.py`

**Files:**
- Create: `~/.openclaw/projects/graph/v4/learning_loop.py`

**Background:** `outcome_rating` is NULL for all 2,651 decisions in the source DB — there is no structured outcome data. Instead, outcomes must be detected from the Graphiti episode graph: when a conversation mentions a past decision and discusses its result, that's an outcome signal.

This script does two things:
1. Detects outcomes from Graphiti episodes (semantic search for decision mentions)
2. Distills repeated outcomes into Lessons with confidence scores

**Step 1: Create `learning_loop.py`**

```python
#!/usr/bin/env python3
"""
PAIOS v4 Learning Loop.

Detects decision outcomes from mined conversations and distills Lessons.

Run schedule: weekly (Sunday, via launchd) or manually after significant decisions.

Usage:
  python3 learning_loop.py detect    # Find outcomes from Graphiti episodes
  python3 learning_loop.py distill   # Create Lessons from outcome patterns
  python3 learning_loop.py decay     # Apply weekly confidence decay to Lessons
  python3 learning_loop.py all       # All three in sequence

Decision → Outcome flow:
  1. search Graphiti for episodes mentioning each decision's title
  2. LLM classifies: positive / negative / mixed / unknown
  3. Create Outcome node, link via Decision-[:LED_TO]->Outcome
  4. If 2+ Outcomes share a domain+result pattern → create Lesson

Confidence decay:
  Every Lesson not reinforced by a new application loses 10% confidence per week.
  Floor: 0.1 (never fully forgotten, just low priority).
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from client import get_graphiti, GRAPH_URI, GRAPH_USER, GRAPH_PASSWORD

from neo4j import AsyncGraphDatabase

OUTCOME_CLASSIFY_PROMPT = """
You are analyzing whether a conversation excerpt indicates an outcome for a specific decision.

Decision title: {title}
Decision domain: {domain}
Decision rationale: {rationale}

Conversation excerpt:
{excerpt}

Classify the outcome as one of:
- "positive" — the decision worked well, positive result mentioned
- "negative" — the decision failed or had a bad result
- "mixed" — partially worked, trade-offs visible
- "unknown" — no clear outcome information in this excerpt

Respond with ONLY a JSON object:
{{"outcome": "positive|negative|mixed|unknown", "evidence": "one sentence explaining why", "confidence": 0.0-1.0}}
"""


async def detect_outcomes(limit: int = 20) -> int:
    """
    Find outcomes for decisions that don't have one yet.
    Searches Graphiti episodes for mentions of each decision's title.
    """
    graphiti_client = await get_graphiti(build_indexes=False)
    neo_driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    created = 0

    try:
        # Get decisions without outcomes
        async with neo_driver.session() as session:
            r = await session.run("""
                MATCH (d:Decision)
                WHERE d.expired_at IS NULL
                  AND NOT (d)-[:LED_TO]->(:Outcome)
                  AND d.title IS NOT NULL
                  AND d.title <> ''
                RETURN d.decision_id AS id, d.title AS title,
                       d.domain AS domain, d.rationale AS rationale
                ORDER BY d.valid_at DESC
                LIMIT $limit
            """, {"limit": limit})
            decisions = await r.data()

        print(f"Checking {len(decisions)} decisions for outcomes...")

        for dec in decisions:
            title     = dec['title'] or ''
            domain    = dec['domain'] or ''
            rationale = (dec['rationale'] or '')[:200]

            # Search Graphiti for episodes mentioning this decision
            results = await graphiti_client.search(
                f"{title} decision outcome result",
                num_results=3
            )
            if not results:
                continue

            # Build excerpt from top result
            excerpt = results[0].fact if results else ""
            if len(excerpt) < 30:
                continue

            # Classify outcome using LLM
            from graphiti_core.llm_client.client import Message
            prompt = OUTCOME_CLASSIFY_PROMPT.format(
                title=title, domain=domain, rationale=rationale, excerpt=excerpt
            )
            try:
                response = await graphiti_client.clients.llm_client.generate_response(
                    messages=[Message(role="user", content=prompt)],
                    response_model=None
                )
                outcome_type = response.get("outcome", "unknown")
                evidence     = response.get("evidence", "")
                confidence   = float(response.get("confidence", 0.5))
            except Exception as e:
                print(f"  LLM classify failed for {title[:40]}: {e}")
                continue

            if outcome_type == "unknown":
                continue

            # Create Outcome node and LED_TO edge
            now = datetime.now(timezone.utc).isoformat()
            outcome_id = f"outcome_{dec['id']}_{int(datetime.now().timestamp())}"

            async with neo_driver.session() as session:
                await session.run("""
                    MERGE (o:Outcome {outcome_id: $outcome_id})
                    ON CREATE SET
                        o.decision_id  = $decision_id,
                        o.result       = $result,
                        o.evidence     = $evidence,
                        o.confidence   = $confidence,
                        o.domain       = $domain,
                        o.source       = 'graphiti_search',
                        o.agent_id     = 'learning_loop',
                        o.valid_at     = $now,
                        o.discovered_at = $now,
                        o.expired_at   = null
                    WITH o
                    MATCH (d:Decision {decision_id: $decision_id})
                    MERGE (d)-[rel:LED_TO]->(o)
                    ON CREATE SET rel.confidence = $confidence,
                                  rel.created_at = $now,
                                  rel.valid_at = $now,
                                  rel.expired_at = null
                """, {
                    "outcome_id":  outcome_id,
                    "decision_id": str(dec['id']),
                    "result":      outcome_type,
                    "evidence":    evidence[:300],
                    "confidence":  confidence,
                    "domain":      domain,
                    "now":         now,
                })
                created += 1
                print(f"  ✅ {outcome_type} outcome for: {title[:60]}")

    finally:
        await graphiti_client.close()
        await neo_driver.close()

    print(f"\nOutcomes detected: {created}")
    return created


async def distill_lessons() -> int:
    """
    Find domains with 2+ outcomes of the same type → create Lessons.
    A Lesson captures a generalised pattern: "In domain X, approach Y leads to Z".
    """
    neo_driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    created = 0

    try:
        async with neo_driver.session() as session:
            # Find outcome patterns: domain + result with 2+ examples
            r = await session.run("""
                MATCH (d:Decision)-[:LED_TO]->(o:Outcome)
                WHERE o.confidence > 0.5
                WITH o.domain AS domain, o.result AS result,
                     count(o) AS occurrences,
                     collect(d.title)[0..3] AS examples
                WHERE occurrences >= 2
                RETURN domain, result, occurrences, examples
                ORDER BY occurrences DESC
            """)
            patterns = await r.data()

        print(f"Found {len(patterns)} outcome patterns eligible for Lessons")

        for p in patterns:
            domain      = p['domain'] or 'general'
            result      = p['result']
            occurrences = p['occurrences']
            examples    = p['examples']
            now         = datetime.now(timezone.utc).isoformat()

            lesson_text = (
                f"In the {domain} domain, {occurrences} decisions led to {result} outcomes. "
                f"Examples: {', '.join(str(e)[:40] for e in examples[:3])}. "
                f"Review decision-making patterns in this area."
            )
            lesson_id = f"lesson_{domain}_{result}_{int(datetime.now().timestamp())}"

            async with neo_driver.session() as session:
                # Check if lesson already exists for this domain+result
                r = await session.run("""
                    MATCH (l:Lesson)
                    WHERE l.domain = $domain AND l.result_type = $result
                      AND l.expired_at IS NULL
                    RETURN l.lesson_id AS id LIMIT 1
                """, {"domain": domain, "result": result})
                existing = await r.single()

                if existing:
                    # Reinforce existing lesson
                    await session.run("""
                        MATCH (l:Lesson {lesson_id: $id})
                        SET l.applied_count = coalesce(l.applied_count, 0) + 1,
                            l.confidence = min(1.0, l.confidence + 0.05),
                            l.last_reinforced_at = $now
                    """, {"id": existing['id'], "now": now})
                    print(f"  🔄 Reinforced lesson: {domain}/{result}")
                else:
                    # Create new lesson + GENERATED edges from outcomes
                    await session.run("""
                        MERGE (l:Lesson {lesson_id: $lesson_id})
                        ON CREATE SET
                            l.lesson_text        = $lesson_text,
                            l.domain             = $domain,
                            l.result_type        = $result,
                            l.confidence         = $confidence,
                            l.applied_count      = 0,
                            l.source             = 'learning_loop',
                            l.agent_id           = 'learning_loop',
                            l.valid_at           = $now,
                            l.discovered_at      = $now,
                            l.expired_at         = null,
                            l.last_reinforced_at = $now
                        WITH l
                        MATCH (d:Decision)-[:LED_TO]->(o:Outcome)
                        WHERE o.domain = $domain AND o.result = $result
                        MERGE (o)-[rel:GENERATED]->(l)
                        ON CREATE SET rel.created_at = $now,
                                      rel.valid_at = $now,
                                      rel.expired_at = null
                    """, {
                        "lesson_id":   lesson_id,
                        "lesson_text": lesson_text,
                        "domain":      domain,
                        "result":      result,
                        "confidence":  min(1.0, 0.5 + occurrences * 0.1),
                        "now":         now,
                    })
                    created += 1
                    print(f"  ✨ New lesson: {domain}/{result} ({occurrences} cases)")

    finally:
        await neo_driver.close()

    print(f"\nLessons created: {created}")
    return created


async def apply_confidence_decay() -> int:
    """
    Weekly decay: reduce Lesson confidence by 10% if not applied recently.
    Floor: 0.1. Lessons are never deleted, only deprioritised.
    """
    neo_driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    try:
        async with neo_driver.session() as session:
            r = await session.run("""
                MATCH (l:Lesson)
                WHERE l.expired_at IS NULL
                  AND (l.last_reinforced_at IS NULL
                       OR l.last_reinforced_at < datetime() - duration('P7D'))
                SET l.confidence = max(0.1, l.confidence * 0.9),
                    l.decay_applied_at = $now
                RETURN count(l) AS decayed
            """, {"now": datetime.now(timezone.utc).isoformat()})
            rec = await r.single()
            count = rec['decayed'] if rec else 0
            print(f"Confidence decay applied to {count} lessons")
            return count
    finally:
        await neo_driver.close()


async def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    if cmd == "detect":
        await detect_outcomes(limit=limit)
    elif cmd == "distill":
        await distill_lessons()
    elif cmd == "decay":
        await apply_confidence_decay()
    elif cmd == "all":
        print("Step 1: Detecting outcomes...")
        await detect_outcomes(limit=limit)
        print("\nStep 2: Distilling lessons...")
        await distill_lessons()
        print("\nStep 3: Applying confidence decay...")
        await apply_confidence_decay()
        print("\n✅ Learning loop complete")
    else:
        print(f"Unknown command: {cmd}. Valid: detect, distill, decay, all")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: Test detect with limit=3 first (uses LLM — costs ~1500 tokens)**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/learning_loop.py detect 3
```

Expected: 0-3 outcomes created (depends on what's in Graphiti episodes — may be 0 until retroactive mining in Task 7 seeds episodes).

**Step 3: Test distill (pure Cypher, no LLM)**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/learning_loop.py distill
```

Expected: 0 lessons (no outcomes yet — will run again after Task 7).

**Step 4: Test decay**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/learning_loop.py decay
```

Expected: "Confidence decay applied to 0 lessons" (no lessons yet — correct).

**Step 5: Add launchd plist for weekly learning loop**

Create `~/.openclaw/projects/graph/v4/launchd/ai.openclaw.graph-learning-loop.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.openclaw.graph-learning-loop</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/user/.openclaw/.venv/bin/python3</string>
        <string>/Users/user/.openclaw/projects/graph/v4/learning_loop.py</string>
        <string>all</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key><integer>0</integer>
        <key>Hour</key><integer>3</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/user/.openclaw/logs/graph-learning-loop.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/user/.openclaw/logs/graph-learning-loop.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key><string>/Users/user</string>
        <key>PATH</key><string>/Users/user/.openclaw/.venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>PAIOS_GRAPH_URI</key><string>bolt://localhost:7687</string>
        <key>PAIOS_GRAPH_USER</key><string>memgraph</string>
        <key>PAIOS_GRAPH_PASSWORD</key><string></string>
    </dict>
</dict>
</plist>
```

```bash
cp ~/.openclaw/projects/graph/v4/launchd/ai.openclaw.graph-learning-loop.plist ~/.openclaw/cron/
ln -sf ~/.openclaw/cron/ai.openclaw.graph-learning-loop.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.openclaw.graph-learning-loop.plist
launchctl list | grep learning-loop
```

Expected: Service loaded with exit code 0.

**Step 6: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/learning_loop.py v4/launchd/ai.openclaw.graph-learning-loop.plist
git commit -m "feat(v4): Task 4 — learning loop (Outcome/Lesson nodes, weekly distillation + decay)"
```

---

## Phase 4: Retroactive Knowledge Mining

> **Goal:** Seed the Graphiti episode graph with historical decisions and beliefs so the learning loop has material to work with and search() returns richer results.

---

### Task 5: Build `retroactive_miner.py`

**Files:**
- Create: `~/.openclaw/projects/graph/v4/retroactive_miner.py`

**Background:** The Graphiti episode graph has 2 nodes (test episodes). 2,651 decisions and 163 beliefs in Memgraph have text that Graphiti can extract entities, relationships and contradictions from. Mining them retroactively will:
1. Create 2,000+ Episodic nodes with correct historical `reference_time`
2. Extract 5,000+ Entity nodes (people, projects, concepts, tools)
3. Create 10,000+ RELATES_TO edges between entities
4. Enable learning_loop.py to find outcomes by searching episode content

**Cost estimate:** ~500 tokens/episode × 2,700 episodes = ~1.35M tokens (~$0.50 at Claude Haiku pricing via OpenRouter).

**Step 1: Create `retroactive_miner.py`**

```python
#!/usr/bin/env python3
"""
PAIOS v4 Retroactive Knowledge Miner.

Mines historical decisions and beliefs from Memgraph into Graphiti episodes.
Run once after v4 backfill. Safe to re-run (episodes are idempotent via name).

Usage:
  python3 retroactive_miner.py --source decisions --limit 100
  python3 retroactive_miner.py --source beliefs --limit 50
  python3 retroactive_miner.py --source all --limit 500
  python3 retroactive_miner.py --dry-run --limit 5  # Show what would be mined, no API calls

Progress is logged to ~/.openclaw/logs/retroactive-mining.log
Resume after interruption: already-mined episodes are skipped via name deduplication.
"""
import argparse
import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent))
from client import get_graphiti, GRAPH_URI, GRAPH_USER, GRAPH_PASSWORD

from graphiti_core.nodes import EpisodeType
from neo4j import AsyncGraphDatabase

LOG_FILE = Path.home() / ".openclaw/logs/retroactive-mining.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [retroactive] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, mode='a'),
    ]
)
log = logging.getLogger(__name__)


def decision_to_text(d: dict) -> str:
    """Convert a Decision node to a rich text episode body."""
    parts = []
    if d.get('title'):
        parts.append(f"Decision: {d['title']}")
    if d.get('domain'):
        parts.append(f"Domain: {d['domain']}")
    if d.get('chosen'):
        parts.append(f"Chosen approach: {d['chosen']}")
    if d.get('rationale'):
        parts.append(f"Rationale: {d['rationale']}")
    return "\n".join(parts)


def belief_to_text(b: dict) -> str:
    """Convert a Belief node to a text episode body."""
    parts = []
    stmt = b.get('statement') or b.get('belief_text', '')
    if stmt:
        parts.append(f"Belief: {stmt}")
    if b.get('domain'):
        parts.append(f"Domain: {b['domain']}")
    if b.get('evidence'):
        parts.append(f"Evidence: {b['evidence']}")
    conf = b.get('confidence', 0.5)
    parts.append(f"Confidence: {conf:.0%}")
    return "\n".join(parts)


async def get_already_mined(graphiti_client) -> set[str]:
    """
    Get set of episode names already in the graph to avoid re-mining.
    Uses Graphiti's retrieve_episodes with a large window.
    """
    try:
        episodes = await graphiti_client.retrieve_episodes(
            reference_time=datetime.now(timezone.utc),
            last_n=10000
        )
        return {ep.name for ep in episodes}
    except Exception:
        return set()


async def mine_source(source: str, limit: int, dry_run: bool = False) -> dict:
    """Mine one source (decisions or beliefs) into Graphiti episodes."""
    neo_driver  = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    graphiti_cl = await get_graphiti(build_indexes=False)

    already_mined = await get_already_mined(graphiti_cl)
    log.info(f"Already mined: {len(already_mined)} episodes")

    mined = 0
    skipped = 0
    errors = 0

    try:
        async with neo_driver.session() as session:
            if source == "decisions":
                r = await session.run("""
                    MATCH (d:Decision)
                    WHERE d.expired_at IS NULL
                      AND d.rationale IS NOT NULL
                      AND d.rationale <> ''
                    RETURN d.decision_id AS id, d.title AS title, d.domain AS domain,
                           d.chosen AS chosen, d.rationale AS rationale,
                           d.valid_at AS valid_at
                    ORDER BY d.valid_at DESC
                    LIMIT $limit
                """, {"limit": limit})
                rows = await r.data()

                for row in rows:
                    episode_name = f"decision_{row['id']}"
                    if episode_name in already_mined:
                        skipped += 1
                        continue

                    text = decision_to_text(row)
                    if len(text) < 50:
                        skipped += 1
                        continue

                    ref_time = datetime.now(timezone.utc)
                    if row.get('valid_at'):
                        try:
                            ref_time = datetime.fromisoformat(str(row['valid_at']).replace('Z', '+00:00'))
                        except Exception:
                            pass

                    if dry_run:
                        log.info(f"DRY RUN: would mine {episode_name}: {text[:80]}...")
                        mined += 1
                        continue

                    try:
                        await graphiti_cl.add_episode(
                            name=episode_name,
                            episode_body=text,
                            source=EpisodeType.text,
                            source_description=f"Historical decision from kb.sqlite (id={row['id']})",
                            reference_time=ref_time,
                        )
                        mined += 1
                        if mined % 10 == 0:
                            log.info(f"  {mined}/{len(rows)} decisions mined...")
                        await asyncio.sleep(0.5)  # Rate limiting
                    except Exception as e:
                        log.error(f"  Error mining {episode_name}: {e}")
                        errors += 1

            elif source == "beliefs":
                r = await session.run("""
                    MATCH (b:Belief)
                    WHERE b.expired_at IS NULL
                      AND b.statement IS NOT NULL
                      AND b.statement <> ''
                    RETURN b.belief_id AS id, b.statement AS statement,
                           b.domain AS domain, b.confidence AS confidence,
                           b.evidence AS evidence, b.valid_at AS valid_at
                    ORDER BY b.confidence DESC
                    LIMIT $limit
                """, {"limit": limit})
                rows = await r.data()

                for row in rows:
                    episode_name = f"belief_{row['id']}"
                    if episode_name in already_mined:
                        skipped += 1
                        continue

                    text = belief_to_text(row)
                    if len(text) < 30:
                        skipped += 1
                        continue

                    ref_time = datetime.now(timezone.utc)
                    if row.get('valid_at'):
                        try:
                            ref_time = datetime.fromisoformat(str(row['valid_at']).replace('Z', '+00:00'))
                        except Exception:
                            pass

                    if dry_run:
                        log.info(f"DRY RUN: would mine {episode_name}: {text[:80]}...")
                        mined += 1
                        continue

                    try:
                        await graphiti_cl.add_episode(
                            name=episode_name,
                            episode_body=text,
                            source=EpisodeType.text,
                            source_description=f"Historical belief (id={row['id']})",
                            reference_time=ref_time,
                        )
                        mined += 1
                        if mined % 10 == 0:
                            log.info(f"  {mined}/{len(rows)} beliefs mined...")
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        log.error(f"  Error mining {episode_name}: {e}")
                        errors += 1

    finally:
        await graphiti_cl.close()
        await neo_driver.close()

    return {"source": source, "mined": mined, "skipped": skipped, "errors": errors}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source",  choices=["decisions", "beliefs", "all"], default="all")
    parser.add_argument("--limit",   type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sources = ["decisions", "beliefs"] if args.source == "all" else [args.source]
    t_start = time.monotonic()
    total_mined = 0

    for src in sources:
        log.info(f"\n{'='*50}")
        log.info(f"Mining: {src} (limit={args.limit}, dry_run={args.dry_run})")
        log.info('='*50)
        result = await mine_source(src, args.limit, dry_run=args.dry_run)
        log.info(f"  mined={result['mined']} skipped={result['skipped']} errors={result['errors']}")
        total_mined += result['mined']

    elapsed = time.monotonic() - t_start
    log.info(f"\n✅ Retroactive mining complete: {total_mined} episodes in {elapsed:.1f}s")
    if args.dry_run:
        log.info("DRY RUN — no API calls made, no data written")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: Dry run to verify it finds the right data**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/retroactive_miner.py \
  --source decisions --limit 5 --dry-run
```

Expected:
```
DRY RUN: would mine decision_1: Decision: Launch Claude Code Security Feature...
DRY RUN: would mine decision_2: ...
5 decisions would be mined, 0 errors
```

**Step 3: Mine first 20 decisions (test run — costs ~10k tokens)**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/retroactive_miner.py \
  --source decisions --limit 20
```

Expected: ~20 episodes created, Graphiti extracts entities.

**Step 4: Verify entities were extracted**

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio
from neo4j import AsyncGraphDatabase

async def check():
    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        r = await s.run("MATCH (n:Episodic) RETURN count(n) AS c")
        episodic = (await r.single())['c']
        r = await s.run("MATCH (n:Entity) RETURN count(n) AS c")
        entities = (await r.single())['c']
        r = await s.run("MATCH ()-[e:RELATES_TO]->() RETURN count(e) AS c")
        edges = (await r.single())['c']
    await d.close()
    print(f"Episodic nodes: {episodic} (was 2)")
    print(f"Entity nodes: {entities}")
    print(f"RELATES_TO edges: {edges}")
    assert episodic > 2, "No new episodes created"
    print("✅ Retroactive mining working")

asyncio.run(check())
EOF
```

**Step 5: Mine all decisions (full run — ~$0.25 at Haiku pricing)**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/retroactive_miner.py \
  --source decisions --limit 2651
```

This will take 20-40 minutes due to the 0.5s rate limit delay. Monitor with:

```bash
tail -f ~/.openclaw/logs/retroactive-mining.log
```

**Step 6: Mine all beliefs**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/retroactive_miner.py \
  --source beliefs --limit 234
```

(163 from kb.sqlite + 71 from ceo.sqlite = 234 total)

**Step 7: Run learning loop after mining — it now has material**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/learning_loop.py all 50
```

Expected: Some outcomes detected and lessons created.

**Step 8: Final verification**

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio
from neo4j import AsyncGraphDatabase

async def final_check():
    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        labels = ['Event', 'Decision', 'Belief', 'Episodic', 'Entity', 'Outcome', 'Lesson', 'Moment']
        print("\n── Final Node Counts ──────────────────────")
        for label in labels:
            r = await s.run(f"MATCH (n:{label}) RETURN count(n) AS c")
            rec = await r.single()
            count = rec['c'] if rec else 0
            if count > 0:
                print(f"  {label:<15} {count:>6,}")
        r = await s.run("MATCH ()-[e]->() RETURN type(e) AS t, count(e) AS c ORDER BY c DESC LIMIT 8")
        rows = await r.data()
        print("\n── Top Edge Types ─────────────────────────")
        total = 0
        for row in rows:
            print(f"  {row['t']:<25} {row['c']:>6,}")
            total += row['c']
        print(f"  {'TOTAL (top 8)':<25} {total:>6,}")
    await d.close()

asyncio.run(final_check())
EOF
```

Expected: Episodic > 200, Entity > 500, RELATES_TO > 1000, Moment > 300, HAPPENED_ON > 7000.

**Step 9: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/retroactive_miner.py
git commit -m "feat(v4): Task 5 — retroactive miner: 2651 decisions + 234 beliefs → Graphiti episodes"
```

---

### Task 6: Update health_check.py and HEARTBEAT.md for new components

**Files:**
- Modify: `~/.openclaw/projects/graph/v4/health_check.py`
- Modify: `~/.openclaw/workspace/HEARTBEAT.md`

**Step 1: Add new node type checks to health_check.py**

In `run_checks()`, find the node counts section. Add Episodic, Entity, Moment, Outcome, Lesson to the label list:

```python
        for label in ["Event", "Decision", "Signal", "Belief", "Artifact",
                      "Episodic", "Entity", "Moment", "Outcome", "Lesson",
                      "LifeScore", "AutonomyRule", "Approval"]:
```

Also update `MIN_COUNTS`:
```python
MIN_COUNTS = {
    "Event":    1000,
    "Decision": 100,
    "Artifact": 100,
    "Moment":   100,    # Should exist after wire_edges
    "Episodic": 10,     # Should grow after retroactive mining
}
```

**Step 2: Add edge count check**

After the node counts section, add:

```python
    # 2b. Edge density check
    try:
        driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
        async with driver.session() as s:
            r = await s.run("MATCH ()-[e]->() RETURN count(e) AS c")
            record = await r.single()
            edge_count = record["c"] if record else 0
        await driver.close()
        status = "✅" if edge_count > 1000 else "⚠️"
        results.append(("Edge count", status, f"{edge_count:,} (target: >10,000 after wiring)"))
    except Exception as e:
        results.append(("Edge count", "❌", str(e)))
```

**Step 3: Add weekly learning-loop entry to HEARTBEAT.md**

In `HEARTBEAT.md`, find Tier 7 — Weekly (Sunday):

```markdown
#### Graph Learning Loop (Sunday 03:00)
```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/learning_loop.py all 50
```
- Detect outcomes from recent Graphiti episodes (last 50 decisions)
- Distill patterns into Lessons
- Apply confidence decay to stale Lessons
- Log results to daily memory
```

**Step 4: Run health check to confirm all green**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/health_check.py
```

Expected: All ✅ including new Moment, Episodic, edge count checks.

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/health_check.py
# HEARTBEAT.md is in workspace (not this repo) — commit separately if workspace is a git repo
git commit -m "feat(v4): Task 6 — health check updated for full intelligence layer"
```

---

## Verification: End-to-End Intelligence Test

**Run after all tasks complete.**

**Test 1: Temporal query — "what happened on bad days"**

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio
from neo4j import AsyncGraphDatabase

async def test():
    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        r = await s.run("""
            MATCH (e:Event {severity: 'error'})-[:HAPPENED_ON]->(m:Moment)
            WITH m.date AS day, count(e) AS errors
            ORDER BY errors DESC LIMIT 5
            RETURN day, errors
        """)
        rows = await r.data()
    await d.close()
    print("Top error days:")
    for row in rows:
        print(f"  {row['day']}: {row['errors']} errors")
    assert len(rows) > 0, "No HAPPENED_ON edges — run wire_edges.py moments first"
    print("✅ Test 1 pass — temporal anchoring works")

asyncio.run(test())
EOF
```

**Test 2: Belief supports decision**

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio
from neo4j import AsyncGraphDatabase

async def test():
    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        r = await s.run("""
            MATCH (b:Belief)-[:SUPPORTS]->(d:Decision)
            RETURN b.statement AS belief, d.title AS decision, b.domain AS domain
            LIMIT 3
        """)
        rows = await r.data()
    await d.close()
    for row in rows:
        print(f"  [{row['domain']}] {str(row['belief'])[:50]} → {str(row['decision'])[:50]}")
    assert len(rows) > 0, "No SUPPORTS edges — run wire_edges.py beliefs first"
    print("✅ Test 2 pass — belief→decision edges exist")

asyncio.run(test())
EOF
```

**Test 3: Context injector returns richer results after retroactive mining**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/context_injector.py \
  --query "architecture decisions infrastructure" \
  --format text
```

Expected: Multiple facts including entity relationships extracted by Graphiti (not just raw CDC fields).

**Test 4: Learning loop has material**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/learning_loop.py detect 10
```

Expected: At least some outcomes detected (depends on episode content).

---

## Success Metrics

| Metric | Target | How to measure |
|--------|--------|----------------|
| Temporal properties | 6/6 fields on all nodes | Check Decision node has `source`, `agent_id`, `expired_at` |
| Edge density | > 10,000 edges | `MATCH ()-[e]->() RETURN count(e)` |
| Moment nodes | > 300 | `MATCH (m:Moment) RETURN count(m)` |
| Episodic nodes | > 200 | `MATCH (n:Episodic) RETURN count(n)` |
| Entity nodes | > 500 | `MATCH (n:Entity) RETURN count(n)` |
| Temporal query | Returns results | Test 1 above |
| Context quality | 5+ facts on search | `context_injector.py --query "any topic"` |
| Learning loop | Runs clean | `learning_loop.py all` exits 0 |
