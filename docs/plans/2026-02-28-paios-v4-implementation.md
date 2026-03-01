# PAIOS v4 — Temporal Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Kuzu + polling with Memgraph + Graphiti + CDC triggers, add conversation mining for all AI sessions, and add context injection before every AI interaction — building a temporal knowledge graph that compounds intelligence with every use.

**Architecture:** Memgraph (in-memory graph, Atomic GraphRAG, bolt://7687) serves as the graph backend. Graphiti (graphiti-core) provides the bi-temporal memory API. SQLite CDC triggers on all 5 source databases feed the graph in real time (~150ms latency). Every AI conversation is mined post-session via Claude Code Stop hook and gateway PostResponse hook, automatically enriching the graph.

**Tech Stack:** Python 3.14, Memgraph Community (Docker ARM64), graphiti-core, neo4j Python driver (works with Memgraph bolt://), SQLite triggers, macOS launchd, Claude Sonnet 4.6 API.

**Design doc:** `docs/plans/2026-02-28-paios-v4-design.md`

**Critical path:** Phase 0 (validate Memgraph+Graphiti) → Phase 1 (CDC + backfill) → Phase 2 (mining + injection) → Phase 3 (cutover, delete Kuzu).

---

## Phase 0: Validation Gate

> **Go/No-go decision.** If Graphiti works against Memgraph bolt://, proceed. If not, swap Memgraph for Neo4j in every step below — all other tasks remain identical.

---

### Task 1: Install Memgraph and validate Graphiti compatibility

**Files:**
- Create: `~/.openclaw/projects/graph/v4/test_memgraph_graphiti.py`

**Step 1: Pull and run Memgraph via Docker**

```bash
docker pull memgraph/memgraph-platform
mkdir -p ~/.openclaw/memgraph
docker run -d \
  --name memgraph \
  -p 7687:7687 \
  -p 7444:7444 \
  -v ~/.openclaw/memgraph:/var/lib/memgraph \
  --restart unless-stopped \
  memgraph/memgraph-platform \
  --storage-wal-enabled=true \
  --storage-snapshot-interval-sec=300 \
  --storage-snapshot-on-exit=true
```

Expected: Container ID printed, no errors.

**Step 2: Verify Memgraph is accepting connections**

```bash
sleep 5
docker exec memgraph mgconsole --eval "RETURN 'ok' AS status;"
```

Expected:
```
+-----------+
| status    |
+-----------+
| "ok"      |
+-----------+
```

**Step 3: Install graphiti-core into the PAIOS venv**

```bash
~/.openclaw/.venv/bin/pip install graphiti-core
~/.openclaw/.venv/bin/pip install neo4j  # bolt:// driver used by Graphiti
~/.openclaw/.venv/bin/python3 -c "import graphiti_core; print('graphiti-core:', graphiti_core.__version__)"
```

Expected: version printed, no import errors.

**Step 4: Create the compatibility test**

Create `~/.openclaw/projects/graph/v4/test_memgraph_graphiti.py`:

```python
#!/usr/bin/env python3
"""
Phase 0 validation: Graphiti against Memgraph bolt://.
All 5 operations must pass. If any fail, use Neo4j instead.
"""
import asyncio
from datetime import datetime, timezone
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

MEMGRAPH_URI      = "bolt://localhost:7687"
MEMGRAPH_USER     = "memgraph"
MEMGRAPH_PASSWORD = ""  # Memgraph Community has no auth by default

async def run_validation():
    print("Connecting to Memgraph via Graphiti...")
    client = Graphiti(MEMGRAPH_URI, MEMGRAPH_USER, MEMGRAPH_PASSWORD)

    print("\n[1] Build indices and constraints...")
    await client.build_indices_and_constraints()
    print("    ✅ indices created")

    print("\n[2] Add episode...")
    result = await client.add_episode(
        name="test_episode_001",
        episode_body="Faisal decided to use Memgraph as the graph backend for PAIOS v4. He believes graph-first architecture is the right long-term choice.",
        source=EpisodeType.text,
        source_description="validation test",
        reference_time=datetime.now(timezone.utc)
    )
    print(f"    ✅ episode added: {result}")

    print("\n[3] Search for added content...")
    results = await client.search("Memgraph graph backend decision")
    assert len(results) > 0, "Search returned no results"
    print(f"    ✅ search returned {len(results)} results")
    for r in results[:2]:
        print(f"       → {r.fact[:80]}...")

    print("\n[4] Retrieve episodes...")
    episodes = await client.get_episodes(reference_time=datetime.now(timezone.utc))
    assert len(episodes) > 0, "No episodes found"
    print(f"    ✅ {len(episodes)} episodes retrieved")

    print("\n[5] Add contradicting belief to test edge invalidation...")
    await client.add_episode(
        name="test_episode_002",
        episode_body="Faisal reconsidered and decided Neo4j would be the graph backend instead of Memgraph.",
        source=EpisodeType.text,
        source_description="validation test - contradiction",
        reference_time=datetime.now(timezone.utc)
    )
    results2 = await client.search("graph backend decision")
    print(f"    ✅ conflict resolution ran: {len(results2)} results after contradiction")

    print("\n\n✅✅✅ ALL 5 OPERATIONS PASSED — Memgraph + Graphiti compatible. Proceed with plan. ✅✅✅\n")

    await client.close()

if __name__ == "__main__":
    asyncio.run(run_validation())
```

**Step 5: Run the validation**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/test_memgraph_graphiti.py
```

Expected output (all 5 checks pass):
```
Connecting to Memgraph via Graphiti...
[1] Build indices and constraints...
    ✅ indices created
[2] Add episode...
    ✅ episode added: ...
[3] Search for added content...
    ✅ search returned N results
[4] Retrieve episodes...
    ✅ N episodes retrieved
[5] Add contradicting belief...
    ✅ conflict resolution ran
✅✅✅ ALL 5 OPERATIONS PASSED
```

**If any check FAILS:** Stop. Run `brew install neo4j && brew services start neo4j`. Replace `MEMGRAPH_URI/USER` with `bolt://localhost:7687 / neo4j / neo4j` in all remaining tasks. All other code is identical.

**Step 6: Clean up test data**

```bash
docker exec memgraph mgconsole --eval "MATCH (n) DETACH DELETE n;"
```

**Step 7: Commit**

```bash
mkdir -p ~/.openclaw/projects/graph/v4
cd ~/.openclaw/projects/graph
git add v4/test_memgraph_graphiti.py
git commit -m "feat(v4): Phase 0 validation — Graphiti+Memgraph compatible"
```

---

## Phase 1: Foundation — Memgraph Schema + CDC + Backfill

---

### Task 2: Create Memgraph schema and Graphiti initializer

**Files:**
- Create: `~/.openclaw/projects/graph/v4/schema.py`
- Create: `~/.openclaw/projects/graph/v4/client.py`

**Step 1: Create the shared Graphiti client module**

Create `~/.openclaw/projects/graph/v4/client.py`:

```python
#!/usr/bin/env python3
"""
Shared Graphiti client for PAIOS v4.
All code that needs graph access imports from here.
Never instantiate Graphiti directly elsewhere.
"""
import os
from graphiti_core import Graphiti

# Memgraph (or Neo4j fallback) connection
GRAPH_URI      = os.getenv("PAIOS_GRAPH_URI", "bolt://localhost:7687")
GRAPH_USER     = os.getenv("PAIOS_GRAPH_USER", "memgraph")
GRAPH_PASSWORD = os.getenv("PAIOS_GRAPH_PASSWORD", "")

# LLM config for Graphiti's entity extraction
# Graphiti uses OpenAI-compatible API by default — route through our gateway
LLM_BASE_URL   = os.getenv("PAIOS_LLM_BASE_URL", "http://localhost:18789/v1")
LLM_API_KEY    = os.getenv("PAIOS_LLM_API_KEY", "gateway")
LLM_MODEL      = os.getenv("PAIOS_LLM_MODEL", "anthropic/claude-sonnet-4-6")

def get_graphiti() -> Graphiti:
    """Return a configured Graphiti client."""
    from graphiti_core.llm_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    llm_client = OpenAIClient(
        LLMConfig(
            api_key=LLM_API_KEY,
            model=LLM_MODEL,
            base_url=LLM_BASE_URL
        )
    )

    embedder = OpenAIEmbedder(
        OpenAIEmbedderConfig(
            api_key=LLM_API_KEY,
            embedding_model="text-embedding-3-small",
            base_url=LLM_BASE_URL
        )
    )

    return Graphiti(
        GRAPH_URI,
        GRAPH_USER,
        GRAPH_PASSWORD,
        llm_client=llm_client,
        embedder=embedder
    )
```

**Step 2: Create schema initializer**

Create `~/.openclaw/projects/graph/v4/schema.py`:

```python
#!/usr/bin/env python3
"""
Memgraph schema for PAIOS v4.
Creates constraints, indexes, and the Atomic GraphRAG vector index.
Safe to run multiple times (idempotent).
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from client import get_graphiti
from neo4j import AsyncGraphDatabase

GRAPH_URI      = "bolt://localhost:7687"
GRAPH_USER     = "memgraph"
GRAPH_PASSWORD = ""

CONSTRAINTS = [
    # Uniqueness constraints
    "CREATE CONSTRAINT ON (e:Event) ASSERT e.event_id IS UNIQUE",
    "CREATE CONSTRAINT ON (d:Decision) ASSERT d.decision_id IS UNIQUE",
    "CREATE CONSTRAINT ON (s:Signal) ASSERT s.signal_id IS UNIQUE",
    "CREATE CONSTRAINT ON (m:Moment) ASSERT m.date IS UNIQUE",
    "CREATE CONSTRAINT ON (a:Artifact) ASSERT a.artifact_id IS UNIQUE",
]

INDEXES = [
    # Temporal indexes for date range queries
    "CREATE INDEX ON :Event(valid_at)",
    "CREATE INDEX ON :Event(category)",
    "CREATE INDEX ON :Decision(valid_at)",
    "CREATE INDEX ON :Decision(domain)",
    "CREATE INDEX ON :Signal(valid_at)",
    "CREATE INDEX ON :Signal(status)",
    "CREATE INDEX ON :Moment(date)",
    "CREATE INDEX ON :Artifact(valid_at)",
]

VECTOR_INDEX = """
CREATE VECTOR INDEX ON :Belief(embedding)
OPTIONS {size: 1536, similarity_metric: 'cos'}
"""


async def initialize_schema():
    """Create all constraints, indexes, and Graphiti indices."""
    # 1. Graphiti's own indices (entities, episodes, communities)
    client = get_graphiti()
    await client.build_indices_and_constraints()
    await client.close()
    print("✅ Graphiti indices created")

    # 2. Custom structured node indexes
    driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    async with driver.session() as session:
        for stmt in CONSTRAINTS:
            try:
                await session.run(stmt)
                print(f"✅ {stmt[:60]}...")
            except Exception as e:
                if "already exists" in str(e).lower():
                    print(f"   (already exists, skipping)")
                else:
                    print(f"⚠️  {e}")

        for stmt in INDEXES:
            try:
                await session.run(stmt)
                print(f"✅ {stmt[:60]}...")
            except Exception as e:
                if "already exists" in str(e).lower():
                    print(f"   (already exists, skipping)")
                else:
                    print(f"⚠️  {e}")

        try:
            await session.run(VECTOR_INDEX)
            print("✅ Belief vector index created")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("   (vector index already exists)")
            else:
                print(f"⚠️  Vector index: {e}")

    await driver.close()
    print("\n✅ Schema initialization complete")


if __name__ == "__main__":
    asyncio.run(initialize_schema())
```

**Step 3: Run schema initialization**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/schema.py
```

Expected: All constraints and indexes created, no errors.

**Step 4: Verify schema in Memgraph**

```bash
docker exec memgraph mgconsole --eval "SHOW INDEX INFO;"
```

Expected: List of created indexes.

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/client.py v4/schema.py
git commit -m "feat(v4): Memgraph schema — constraints, indexes, Graphiti indices"
```

---

### Task 3: Deploy CDC triggers to all 5 SQLite databases

**Files:**
- Create: `~/.openclaw/projects/graph/v4/cdc_triggers.py`

**Background:** CDC (Change Data Capture) triggers write a row to `cdc_events` after every INSERT/UPDATE/DELETE on monitored tables. The CDC worker (Task 4) reads these rows and syncs to Memgraph. Triggers are idempotent — safe to run multiple times.

**Step 1: Create trigger deployment script**

Create `~/.openclaw/projects/graph/v4/cdc_triggers.py`:

```python
#!/usr/bin/env python3
"""
Deploy CDC triggers to all 5 PAIOS SQLite databases.
Creates cdc_events table and AFTER INSERT triggers on monitored tables.
Safe to run multiple times — all statements use IF NOT EXISTS / CREATE OR REPLACE.
"""
import sqlite3
from pathlib import Path

BASE = Path.home() / ".openclaw"

# Map: (db_path, table_name, columns_to_capture)
MONITORED_TABLES = [
    # Observability — events
    (BASE / "observability.sqlite", "events", [
        "id", "trace_id", "timestamp", "category", "action",
        "source", "duration_ms", "error", "metadata"
    ]),

    # KB — decisions, signals, beliefs, life scores
    (BASE / "projects/knowledge-base/kb.sqlite", "decisions", [
        "id", "title", "domain", "chosen", "rationale", "confidence",
        "outcome_rating", "decision_class", "created_at", "context_quality_score"
    ]),
    (BASE / "projects/knowledge-base/kb.sqlite", "officer_signals", [
        "id", "from_role", "to_role", "signal_type", "severity",
        "subject", "body", "acknowledged", "created_at"
    ]),
    (BASE / "projects/knowledge-base/kb.sqlite", "thinking_beliefs", [
        "id", "domain", "belief_text", "confidence", "evidence", "created_at"
    ]),
    (BASE / "projects/knowledge-base/kb.sqlite", "life_scores", [
        "id", "score_type", "dimension", "value", "scored_at"
    ]),

    # Social — posts and metrics
    (BASE / "social-history.sqlite", "posts", [
        "id", "platform", "content_text", "created_at"
    ]),
    (BASE / "social-history.sqlite", "post_metrics", [
        "id", "post_id", "likes", "comments_count", "impressions", "collected_at"
    ]),

    # CEO — relationships, habits
    (BASE / "projects/personal-ceo/ceo.sqlite", "relationships", [
        "id", "name", "relationship_type", "last_contact_at", "notes"
    ]),
    (BASE / "projects/personal-ceo/ceo.sqlite", "habits", [
        "id", "name", "category", "target_frequency", "created_at"
    ]),

    # Autonomy — rules and approvals
    (BASE / "autonomy.sqlite", "action_rules", [
        "id", "action_pattern", "trust_level", "auto_approve", "created_at"
    ]),
    (BASE / "autonomy.sqlite", "approval_log", [
        "id", "action", "decision", "reason", "created_at"
    ]),
]

CDC_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS cdc_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name   TEXT    NOT NULL,
    operation    TEXT    NOT NULL,
    row_id       INTEGER,
    after_json   TEXT,
    occurred_at  INTEGER NOT NULL,
    processed    INTEGER DEFAULT 0,
    processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cdc_unprocessed ON cdc_events(processed, occurred_at);
"""


def make_trigger_sql(table: str, columns: list[str]) -> str:
    """Generate an AFTER INSERT trigger that logs to cdc_events."""
    json_parts = ", ".join(
        f"'{col}', NEW.{col}" for col in columns
    )
    return f"""
CREATE TRIGGER IF NOT EXISTS cdc_{table}_after_insert
AFTER INSERT ON {table}
BEGIN
    INSERT INTO cdc_events (table_name, operation, row_id, after_json, occurred_at)
    VALUES (
        '{table}',
        'INSERT',
        NEW.rowid,
        json_object({json_parts}),
        CAST(strftime('%s', 'now') * 1000 AS INTEGER)
    );
END;
"""


def deploy_triggers():
    """Deploy cdc_events table and triggers to all monitored databases."""
    deployed = 0
    errors = 0

    for db_path, table, columns in MONITORED_TABLES:
        if not db_path.exists():
            print(f"⚠️  DB not found, skipping: {db_path}")
            continue

        try:
            conn = sqlite3.connect(str(db_path))
            conn.execute("PRAGMA journal_mode=WAL")

            # Create cdc_events table if missing
            for stmt in CDC_TABLE_SQL.strip().split(";"):
                if stmt.strip():
                    conn.execute(stmt)

            # Check if monitored table exists
            table_exists = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table,)
            ).fetchone()

            if not table_exists:
                print(f"   Table '{table}' not found in {db_path.name}, skipping")
                conn.close()
                continue

            # Deploy trigger
            trigger_sql = make_trigger_sql(table, columns)
            conn.executescript(trigger_sql)
            conn.commit()
            conn.close()

            print(f"✅ {db_path.name} → {table} (trigger deployed)")
            deployed += 1

        except Exception as e:
            print(f"❌ {db_path.name} → {table}: {e}")
            errors += 1

    print(f"\n{'✅' if errors == 0 else '⚠️'} Deployed {deployed} triggers, {errors} errors")


def verify_triggers():
    """Verify all triggers exist and cdc_events tables are present."""
    print("\n--- Verification ---")
    seen_dbs = set()
    for db_path, table, _ in MONITORED_TABLES:
        if not db_path.exists() or db_path in seen_dbs:
            continue
        seen_dbs.add(db_path)
        conn = sqlite3.connect(str(db_path))
        triggers = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'cdc_%'"
        ).fetchall()
        cdc_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE name='cdc_events'"
        ).fetchone()
        conn.close()
        status = "✅" if cdc_table else "❌"
        print(f"{status} {db_path.name}: cdc_events={'yes' if cdc_table else 'NO'}, triggers={[t[0] for t in triggers]}")


if __name__ == "__main__":
    deploy_triggers()
    verify_triggers()
```

**Step 2: Run trigger deployment**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/cdc_triggers.py
```

Expected:
```
✅ observability.sqlite → events (trigger deployed)
✅ kb.sqlite → decisions (trigger deployed)
✅ kb.sqlite → officer_signals (trigger deployed)
✅ kb.sqlite → thinking_beliefs (trigger deployed)
✅ kb.sqlite → life_scores (trigger deployed)
✅ social-history.sqlite → posts (trigger deployed)
...
✅ Deployed 11 triggers, 0 errors

--- Verification ---
✅ observability.sqlite: cdc_events=yes, triggers=['cdc_events_after_insert', ...]
...
```

**Step 3: Test a trigger fires correctly**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sqlite3
# Insert a test event into observability
db = sqlite3.connect('/Users/user/.openclaw/observability.sqlite')
db.execute(\"INSERT INTO events (trace_id, timestamp, category, action, source) VALUES ('test-cdc-001', datetime('now'), 'system', 'cdc_test', 'test')\")
db.commit()
# Verify CDC event was captured
row = db.execute('SELECT table_name, operation, after_json FROM cdc_events ORDER BY id DESC LIMIT 1').fetchone()
print('CDC captured:', row)
assert row and row[0] == 'events' and row[1] == 'INSERT', 'CDC trigger did not fire!'
db.execute('DELETE FROM cdc_events WHERE id = (SELECT MAX(id) FROM cdc_events)')
db.commit()
db.close()
print('✅ CDC trigger works correctly')
"
```

Expected: `✅ CDC trigger works correctly`

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/cdc_triggers.py
git commit -m "feat(v4): CDC triggers on all 5 SQLite DBs — 150ms real-time sync"
```

---

### Task 4: Build and deploy the CDC worker

**Files:**
- Create: `~/.openclaw/projects/graph/v4/cdc_worker.py`
- Create: `~/.openclaw/cron/ai.openclaw.graph-cdc-worker.plist`

**Step 1: Create the CDC worker**

Create `~/.openclaw/projects/graph/v4/cdc_worker.py`:

```python
#!/usr/bin/env python3
"""
PAIOS v4 CDC Worker — Real-time SQLite → Memgraph sync.
Polls all 5 source DBs every 100ms for unprocessed CDC events.
Maps structured rows directly to Memgraph nodes (no LLM extraction).
Runs as a daemon via launchd.
"""
import asyncio
import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from neo4j import AsyncGraphDatabase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [cdc-worker] %(levelname)s %(message)s"
)
log = logging.getLogger(__name__)

BASE          = Path.home() / ".openclaw"
GRAPH_URI     = "bolt://localhost:7687"
GRAPH_USER    = "memgraph"
GRAPH_PASSWORD = ""
POLL_INTERVAL = 0.1   # 100ms
BATCH_SIZE    = 50    # events per poll cycle

SOURCE_DBS = [
    BASE / "observability.sqlite",
    BASE / "projects/knowledge-base/kb.sqlite",
    BASE / "social-history.sqlite",
    BASE / "projects/personal-ceo/ceo.sqlite",
    BASE / "autonomy.sqlite",
]


def get_unprocessed(db_path: Path) -> list[dict]:
    """Fetch up to BATCH_SIZE unprocessed CDC events from one DB."""
    try:
        conn = sqlite3.connect(str(db_path), timeout=2)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, table_name, operation, row_id, after_json, occurred_at "
            "FROM cdc_events WHERE processed=0 ORDER BY occurred_at LIMIT ?",
            (BATCH_SIZE,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []  # DB may not have cdc_events yet


def mark_processed(db_path: Path, event_ids: list[int]):
    """Mark CDC events as processed."""
    if not event_ids:
        return
    now_ms = int(time.time() * 1000)
    try:
        conn = sqlite3.connect(str(db_path), timeout=2)
        conn.executemany(
            "UPDATE cdc_events SET processed=1, processed_at=? WHERE id=?",
            [(now_ms, eid) for eid in event_ids]
        )
        conn.commit()
        conn.close()
    except Exception as e:
        log.warning(f"Could not mark processed: {e}")


def map_to_cypher(table: str, data: dict, occurred_at: int) -> tuple[str, dict] | None:
    """
    Map a CDC row to a Memgraph MERGE statement.
    Returns (cypher_query, params) or None if table not handled.
    """
    valid_at = datetime.fromtimestamp(occurred_at / 1000, tz=timezone.utc).isoformat()
    discovered_at = datetime.now(timezone.utc).isoformat()

    if table == "events":
        return ("""
            MERGE (e:Event {event_id: $event_id})
            ON CREATE SET
                e.trace_id      = $trace_id,
                e.category      = $category,
                e.action        = $action,
                e.source        = $source,
                e.duration_ms   = $duration_ms,
                e.error         = $error,
                e.severity      = $severity,
                e.outcome       = $outcome,
                e.valid_at      = datetime($valid_at),
                e.discovered_at = datetime($discovered_at),
                e.confidence    = 1.0,
                e.expired_at    = null
            ON MATCH SET
                e.discovered_at = datetime($discovered_at)
        """, {
            "event_id":     data.get("id"),
            "trace_id":     data.get("trace_id", ""),
            "category":     data.get("category", ""),
            "action":       data.get("action", ""),
            "source":       data.get("source", ""),
            "duration_ms":  data.get("duration_ms"),
            "error":        data.get("error"),
            "severity":     "error" if data.get("error") else "info",
            "outcome":      "failure" if data.get("error") else "success",
            "valid_at":     data.get("timestamp", valid_at),
            "discovered_at": discovered_at,
        })

    elif table == "decisions":
        return ("""
            MERGE (d:Decision {decision_id: $decision_id})
            ON CREATE SET
                d.title                 = $title,
                d.domain                = $domain,
                d.chosen                = $chosen,
                d.rationale             = $rationale,
                d.confidence            = $confidence,
                d.outcome_rating        = $outcome_rating,
                d.decision_class        = $decision_class,
                d.context_quality_score = $cqs,
                d.valid_at              = datetime($valid_at),
                d.discovered_at         = datetime($discovered_at),
                d.expired_at            = null
            ON MATCH SET
                d.confidence            = $confidence,
                d.outcome_rating        = $outcome_rating,
                d.context_quality_score = $cqs,
                d.discovered_at         = datetime($discovered_at)
        """, {
            "decision_id": data.get("id"),
            "title":       data.get("title", ""),
            "domain":      data.get("domain", "general"),
            "chosen":      data.get("chosen", ""),
            "rationale":   data.get("rationale", ""),
            "confidence":  data.get("confidence", 0.5),
            "outcome_rating": data.get("outcome_rating"),
            "decision_class": data.get("decision_class", ""),
            "cqs":         data.get("context_quality_score", 0.0),
            "valid_at":    data.get("created_at", valid_at),
            "discovered_at": discovered_at,
        })

    elif table == "officer_signals":
        return ("""
            MERGE (s:Signal {signal_id: $signal_id})
            ON CREATE SET
                s.officer       = $officer,
                s.signal_type   = $signal_type,
                s.title         = $title,
                s.description   = $description,
                s.priority      = $priority,
                s.status        = $status,
                s.valid_at      = datetime($valid_at),
                s.discovered_at = datetime($discovered_at),
                s.expired_at    = null,
                s.confidence    = 0.8
            ON MATCH SET
                s.status        = $status,
                s.discovered_at = datetime($discovered_at)
        """, {
            "signal_id":   data.get("id"),
            "officer":     data.get("from_role", "system"),
            "signal_type": data.get("signal_type", "info"),
            "title":       (data.get("subject") or "Untitled")[:200],
            "description": (data.get("body") or "")[:500],
            "priority":    data.get("severity", "medium"),
            "status":      "acknowledged" if data.get("acknowledged") else "active",
            "valid_at":    data.get("created_at", valid_at),
            "discovered_at": discovered_at,
        })

    elif table == "posts":
        return ("""
            MERGE (a:Artifact {artifact_id: $artifact_id})
            ON CREATE SET
                a.artifact_type  = 'social_post',
                a.source_table   = 'posts',
                a.platform       = $platform,
                a.title          = $title,
                a.valid_at       = datetime($valid_at),
                a.discovered_at  = datetime($discovered_at),
                a.expired_at     = null
            ON MATCH SET
                a.discovered_at  = datetime($discovered_at)
        """, {
            "artifact_id": data.get("id"),
            "platform":    data.get("platform", "unknown"),
            "title":       (data.get("content_text") or "")[:200],
            "valid_at":    data.get("created_at", valid_at),
            "discovered_at": discovered_at,
        })

    # thinking_beliefs, life_scores, relationships, habits, action_rules, approval_log
    # are mined via Graphiti conversation extraction (Path A) or handled in future tasks
    return None


async def process_batch(driver, events: list[dict], db_path: Path):
    """Process a batch of CDC events into Memgraph."""
    processed_ids = []
    async with driver.session() as session:
        for event in events:
            try:
                data = json.loads(event.get("after_json") or "{}")
                result = map_to_cypher(
                    event["table_name"], data, event["occurred_at"]
                )
                if result:
                    query, params = result
                    await session.run(query, params)
                    processed_ids.append(event["id"])
                else:
                    # Table not mapped yet — still mark processed to avoid re-processing
                    processed_ids.append(event["id"])
            except Exception as e:
                log.error(f"Error processing CDC event {event['id']}: {e}")

    mark_processed(db_path, processed_ids)
    return len(processed_ids)


async def main():
    log.info("CDC Worker starting — polling every 100ms")
    driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))

    total_synced = 0
    try:
        while True:
            cycle_start = time.monotonic()
            cycle_count = 0

            for db_path in SOURCE_DBS:
                if not db_path.exists():
                    continue
                events = get_unprocessed(db_path)
                if events:
                    count = await process_batch(driver, events, db_path)
                    cycle_count += count
                    if count > 0:
                        log.info(f"Synced {count} events from {db_path.name}")

            total_synced += cycle_count
            elapsed = time.monotonic() - cycle_start
            sleep_time = max(0, POLL_INTERVAL - elapsed)
            await asyncio.sleep(sleep_time)

    except KeyboardInterrupt:
        log.info(f"CDC Worker stopping. Total synced: {total_synced}")
    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: Test CDC worker manually (30-second smoke test)**

```bash
# Terminal 1: start the worker
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/cdc_worker.py &
WORKER_PID=$!

# Terminal 2: insert a test event
~/.openclaw/.venv/bin/python3 -c "
import sqlite3, time
db = sqlite3.connect('/Users/user/.openclaw/observability.sqlite')
db.execute(\"INSERT INTO events (trace_id, timestamp, category, action, source) VALUES ('cdc-worker-test', datetime('now'), 'system', 'worker_test', 'test')\")
db.commit()
time.sleep(0.5)
# Verify it was processed
row = db.execute('SELECT processed FROM cdc_events ORDER BY id DESC LIMIT 1').fetchone()
print('Processed:', row[0], '(should be 1)')
db.close()
"

# Stop worker
kill $WORKER_PID 2>/dev/null
```

Expected: `Processed: 1 (should be 1)` — event synced within 100-200ms.

**Step 3: Create launchd plist for CDC worker**

Create `~/.openclaw/cron/ai.openclaw.graph-cdc-worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.openclaw.graph-cdc-worker</string>

    <key>Comment</key>
    <string>PAIOS v4 CDC Worker — real-time SQLite to Memgraph sync (100ms latency)</string>

    <key>ProgramArguments</key>
    <array>
        <string>/Users/user/.openclaw/.venv/bin/python3</string>
        <string>/Users/user/.openclaw/projects/graph/v4/cdc_worker.py</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/user/.openclaw/logs/graph-cdc-worker.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/user/.openclaw/logs/graph-cdc-worker.error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>/Users/user</string>
        <key>PATH</key>
        <string>/Users/user/.openclaw/.venv/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
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

**Step 4: Also create the Memgraph launchd plist**

Create `~/.openclaw/cron/ai.openclaw.memgraph.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.openclaw.memgraph</string>

    <key>Comment</key>
    <string>Memgraph graph database — PAIOS v4 primary graph store</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/docker</string>
        <string>start</string>
        <string>memgraph</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <false/>

    <key>StandardOutPath</key>
    <string>/Users/user/.openclaw/logs/memgraph.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/user/.openclaw/logs/memgraph.error.log</string>
</dict>
</plist>
```

**Step 5: Load both services**

```bash
# Symlink plists to LaunchAgents
ln -sf ~/.openclaw/cron/ai.openclaw.memgraph.plist ~/Library/LaunchAgents/
ln -sf ~/.openclaw/cron/ai.openclaw.graph-cdc-worker.plist ~/Library/LaunchAgents/

# Start Memgraph container first
docker start memgraph 2>/dev/null || true
sleep 3

# Load CDC worker
launchctl load ~/Library/LaunchAgents/ai.openclaw.graph-cdc-worker.plist
sleep 2
launchctl list | grep cdc-worker
```

Expected: `[PID]  0  ai.openclaw.graph-cdc-worker` (exit code 0).

**Step 6: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/cdc_worker.py ~/.openclaw/cron/ai.openclaw.graph-cdc-worker.plist \
    ~/.openclaw/cron/ai.openclaw.memgraph.plist
git commit -m "feat(v4): CDC worker + launchd plists — 100ms real-time SQLite→Memgraph sync"
```

---

### Task 5: Backfill all historical data into Memgraph

**Files:**
- Create: `~/.openclaw/projects/graph/v4/backfill.py`

**Step 1: Create backfill script**

Create `~/.openclaw/projects/graph/v4/backfill.py`:

```python
#!/usr/bin/env python3
"""
One-time backfill: load all historical data from 5 SQLite DBs into Memgraph.
Uses the same mapping as cdc_worker.py but reads directly without CDC events.
Run once after schema is created. Safe to re-run (all writes use MERGE).
"""
import asyncio
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cdc_worker import map_to_cypher
from neo4j import AsyncGraphDatabase

BASE          = Path.home() / ".openclaw"
GRAPH_URI     = "bolt://localhost:7687"
GRAPH_USER    = "memgraph"
GRAPH_PASSWORD = ""

QUERIES = {
    "events": "SELECT id, trace_id, timestamp, category, action, source, duration_ms, error FROM events ORDER BY id",
    "decisions": "SELECT id, title, domain, chosen, rationale, confidence, outcome_rating, decision_class, created_at, context_quality_score FROM decisions ORDER BY id",
    "officer_signals": "SELECT id, from_role, to_role, signal_type, severity, subject, body, acknowledged, created_at FROM officer_signals ORDER BY id",
    "posts": "SELECT id, platform, content_text, created_at FROM posts ORDER BY id",
}

SOURCE_TABLE_DB = {
    "events":          BASE / "observability.sqlite",
    "decisions":       BASE / "projects/knowledge-base/kb.sqlite",
    "officer_signals": BASE / "projects/knowledge-base/kb.sqlite",
    "posts":           BASE / "social-history.sqlite",
}

BATCH = 200


async def backfill_table(driver, table: str, db_path: Path):
    if not db_path.exists():
        print(f"  ⚠️  DB not found: {db_path}")
        return 0

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(QUERIES[table]).fetchall()
    conn.close()

    total = len(rows)
    synced = 0
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    async with driver.session() as session:
        for i in range(0, total, BATCH):
            batch = rows[i:i+BATCH]
            for row in batch:
                data = dict(row)
                result = map_to_cypher(table, data, now_ms)
                if result:
                    query, params = result
                    try:
                        await session.run(query, params)
                        synced += 1
                    except Exception as e:
                        print(f"  Error on {table} id={data.get('id')}: {e}")

            print(f"  {table}: {min(i+BATCH, total)}/{total} processed...", end="\r")

    print(f"  ✅ {table}: {synced}/{total} synced")
    return synced


async def main():
    print("PAIOS v4 Backfill — loading historical data into Memgraph")
    print("=" * 60)

    driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    total = 0

    for table, db_path in SOURCE_TABLE_DB.items():
        print(f"\nBackfilling {table} from {db_path.name}...")
        count = await backfill_table(driver, table, db_path)
        total += count

    await driver.close()

    print(f"\n{'='*60}")
    print(f"✅ Backfill complete: {total} total nodes created/updated")
    print("Run verification to confirm counts.")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: Run the backfill**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/backfill.py
```

Expected output:
```
PAIOS v4 Backfill — loading historical data into Memgraph
============================================================
Backfilling events from observability.sqlite...
  ✅ events: 7797/7797 synced
Backfilling decisions from kb.sqlite...
  ✅ decisions: 2633/2633 synced
Backfilling officer_signals from kb.sqlite...
  ✅ officer_signals: 24/24 synced
Backfilling posts from social-history.sqlite...
  ✅ posts: 589/589 synced
✅ Backfill complete: 11043 total nodes created/updated
```

**Step 3: Verify counts in Memgraph**

```bash
~/.openclaw/.venv/bin/python3 -c "
import asyncio
from neo4j import AsyncGraphDatabase

async def verify():
    driver = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph', ''))
    async with driver.session() as s:
        for label in ['Event', 'Decision', 'Signal', 'Artifact']:
            r = await s.run(f'MATCH (n:{label}) RETURN count(n) as c')
            record = await r.single()
            print(f'{label}: {record[\"c\"]}')
        r = await s.run('MATCH ()-[e]->() RETURN count(e) as c')
        record = await r.single()
        print(f'Edges: {record[\"c\"]}')
    await driver.close()

asyncio.run(verify())
"
```

Expected: Event ≥7797, Decision ≥2633, Signal ≥24, Artifact ≥589.

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/backfill.py
git commit -m "feat(v4): backfill complete — 11K+ nodes in Memgraph with temporal metadata"
```

---

## Phase 2: Intelligence Layer

---

### Task 6: Build the conversation miner

**Files:**
- Create: `~/.openclaw/projects/graph/v4/conversation_miner.py`

**Background:** This is the most important file in the entire v4 architecture. Every AI conversation is automatically mined post-session. Graphiti's LLM extraction handles entity identification, relationship detection, and conflict resolution. The graph compounds with every use.

**Step 1: Create conversation_miner.py**

Create `~/.openclaw/projects/graph/v4/conversation_miner.py`:

```python
#!/usr/bin/env python3
"""
PAIOS v4 Conversation Miner.
Called after every AI session (Claude Code Stop hook, gateway PostResponse).
Extracts beliefs, decisions, entities, and lessons from the conversation.
Passes to Graphiti which handles: LLM extraction, entity linking, conflict resolution.

Usage:
  python3 conversation_miner.py --source claude-code --content "conversation text..."
  python3 conversation_miner.py --source gateway --session-id abc123 --content "..."
  cat conversation.txt | python3 conversation_miner.py --source claude-code --stdin
"""
import argparse
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from client import get_graphiti
from graphiti_core.nodes import EpisodeType

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.WARNING)  # Quiet by default — runs as hook

# Minimum content length to bother mining (very short exchanges have low signal)
MIN_CONTENT_LENGTH = 200

# Sources that feed the graph
VALID_SOURCES = {"claude-code", "gateway", "codex", "gemini", "manual"}


async def mine(content: str, source: str, session_id: str | None = None) -> dict:
    """
    Mine a conversation for knowledge and add to the temporal graph.
    Returns summary of what was added.
    """
    if len(content) < MIN_CONTENT_LENGTH:
        return {"skipped": True, "reason": "too_short", "length": len(content)}

    name = f"{source}_{session_id or 'unknown'}_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

    client = get_graphiti()
    try:
        result = await client.add_episode(
            name=name,
            episode_body=content,
            source=EpisodeType.text,
            source_description=f"AI conversation via {source}",
            reference_time=datetime.now(timezone.utc)
        )
        return {
            "mined": True,
            "source": source,
            "session_id": session_id,
            "episode_name": name,
            "content_length": len(content),
            "result": str(result)[:200]
        }
    finally:
        await client.close()


def main():
    parser = argparse.ArgumentParser(description="Mine AI conversations into the temporal graph")
    parser.add_argument("--source", choices=list(VALID_SOURCES), required=True)
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--content", default=None, help="Conversation text directly")
    parser.add_argument("--stdin", action="store_true", help="Read content from stdin")
    parser.add_argument("--content-file", default=None, help="Path to file with conversation")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.INFO, force=True)

    # Get content from one of three sources
    content = None
    if args.content:
        content = args.content
    elif args.stdin:
        content = sys.stdin.read()
    elif args.content_file:
        content = Path(args.content_file).read_text()

    if not content:
        print(json.dumps({"error": "No content provided"}))
        sys.exit(1)

    result = asyncio.run(mine(content, args.source, args.session_id))

    if args.verbose:
        print(json.dumps(result, indent=2))
    elif result.get("mined"):
        print(f"✅ Mined {result['content_length']} chars from {result['source']}")
    elif result.get("skipped"):
        pass  # Silent skip — normal for short exchanges


if __name__ == "__main__":
    main()
```

**Step 2: Test mining with a real conversation snippet**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/conversation_miner.py \
  --source manual \
  --session-id test_001 \
  --verbose \
  --content "I've been thinking about the PAIOS architecture. I strongly believe that graph-first is the right approach for long-term intelligence. The key insight is that every conversation should compound into a permanent model. I decided to use Memgraph over Neo4j because of Atomic GraphRAG — it simplifies the retrieval pipeline significantly. One lesson from this process: always validate tech choices against real alternatives before committing."
```

Expected:
```json
{
  "mined": true,
  "source": "manual",
  "session_id": "test_001",
  "episode_name": "manual_test_001_...",
  "content_length": 421,
  "result": "..."
}
```

**Step 3: Verify extracted entities appear in Memgraph**

```bash
~/.openclaw/.venv/bin/python3 -c "
import asyncio
import sys
sys.path.insert(0, '/Users/user/.openclaw/projects/graph/v4')
from client import get_graphiti

async def verify():
    client = get_graphiti()
    results = await client.search('Memgraph graph architecture decision')
    print(f'Found {len(results)} relevant facts:')
    for r in results[:5]:
        print(f'  → {r.fact[:100]}')
    await client.close()

asyncio.run(verify())
"
```

Expected: 2-5 facts about Memgraph, graph architecture, decisions returned.

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/conversation_miner.py
git commit -m "feat(v4): conversation miner — every AI session feeds the temporal graph"
```

---

### Task 7: Wire Claude Code Stop hook

**Files:**
- Modify: `~/.claude/settings.json`

**Step 1: Read current Claude Code settings**

```bash
cat ~/.claude/settings.json | python3 -m json.tool | head -50
```

**Step 2: Add the Stop hook**

The Stop hook fires when a Claude Code session ends. It receives the session transcript via environment variable or stdin depending on hook type. We use a shell wrapper to capture and forward to the miner.

Create `~/.openclaw/projects/graph/v4/claude_code_hook.sh`:

```bash
#!/bin/bash
# Claude Code Stop hook — mines the completed session into the temporal graph.
# Called by Claude Code with CLAUDE_SESSION_FILE or via stdin.

MINER="/Users/user/.openclaw/projects/graph/v4/conversation_miner.py"
PYTHON="/Users/user/.openclaw/.venv/bin/python3"
LOG="/Users/user/.openclaw/logs/conversation-mining.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Claude Code session ended" >> "$LOG"

# Get session content
if [ -n "$CLAUDE_SESSION_FILE" ] && [ -f "$CLAUDE_SESSION_FILE" ]; then
    CONTENT=$(cat "$CLAUDE_SESSION_FILE" 2>/dev/null)
elif [ -p /dev/stdin ]; then
    CONTENT=$(cat /dev/stdin 2>/dev/null)
else
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No session content available" >> "$LOG"
    exit 0
fi

if [ -z "$CONTENT" ]; then
    exit 0
fi

# Mine in background (don't block Claude Code exit)
echo "$CONTENT" | "$PYTHON" "$MINER" \
    --source claude-code \
    --stdin \
    >> "$LOG" 2>&1 &

exit 0
```

```bash
chmod +x ~/.openclaw/projects/graph/v4/claude_code_hook.sh
```

**Step 3: Add hook to Claude Code settings**

```bash
# Read current settings
SETTINGS=~/.claude/settings.json
python3 -c "
import json, sys
with open('$SETTINGS') as f:
    data = json.load(f)

# Add Stop hook
hooks = data.setdefault('hooks', {})
stop_hooks = hooks.setdefault('Stop', [])

hook = {
    'matcher': '',
    'hooks': [{
        'type': 'command',
        'command': '/Users/user/.openclaw/projects/graph/v4/claude_code_hook.sh'
    }]
}

# Only add if not already present
if not any(h.get('hooks', [{}])[0].get('command', '').endswith('claude_code_hook.sh')
           for h in stop_hooks):
    stop_hooks.append(hook)
    with open('$SETTINGS', 'w') as f:
        json.dump(data, f, indent=2)
    print('✅ Stop hook added')
else:
    print('   Hook already present')
"
```

**Step 4: Verify hook appears in settings**

```bash
python3 -c "
import json
with open('/Users/user/.claude/settings.json') as f:
    data = json.load(f)
hooks = data.get('hooks', {}).get('Stop', [])
print('Stop hooks:', json.dumps(hooks, indent=2))
"
```

Expected: The `claude_code_hook.sh` command appears in Stop hooks.

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/claude_code_hook.sh
git commit -m "feat(v4): Claude Code Stop hook — sessions automatically mined into graph"
```

---

### Task 8: Build the context injector

**Files:**
- Create: `~/.openclaw/projects/graph/v4/context_injector.py`

**Background:** Before any AI interaction, this module queries the temporal graph for relevant context and returns formatted text for system prompt injection. Makes every AI session aware of your current beliefs, recent decisions, and applicable lessons.

**Step 1: Create context_injector.py**

Create `~/.openclaw/projects/graph/v4/context_injector.py`:

```python
#!/usr/bin/env python3
"""
PAIOS v4 Context Injector.
Retrieves relevant temporal graph context for a given query.
Called by the gateway before any AI interaction.
Returns formatted system prompt injection text.

Usage:
  python3 context_injector.py --query "user's message here"
  Returns JSON: {"context": "formatted text for system prompt", "facts_count": N}
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from client import get_graphiti

CONTEXT_TEMPLATE = """
## Your Temporal Knowledge Context
The following facts from your personal knowledge graph are relevant to this conversation.
Use this context to inform your response. Surface any contradictions you notice.

{facts}

*Context retrieved: {count} facts | Most recent: {recency}*
"""


async def get_context(query: str, limit: int = 10) -> dict:
    """
    Retrieve relevant facts from the temporal graph for a given query.
    Returns formatted context string ready for system prompt injection.
    """
    client = get_graphiti()
    try:
        results = await client.search(query, num_results=limit)

        if not results:
            return {"context": "", "facts_count": 0}

        facts = []
        for r in results:
            fact = r.fact.strip()
            if fact:
                confidence = getattr(r, 'weight', 1.0)
                facts.append(f"- {fact}" + (f" (confidence: {confidence:.1f})" if confidence < 0.9 else ""))

        # Find most recent result timestamp
        recency = "unknown"
        for r in results:
            if hasattr(r, 'created_at') and r.created_at:
                recency = str(r.created_at)[:10]
                break

        context = CONTEXT_TEMPLATE.format(
            facts="\n".join(facts),
            count=len(facts),
            recency=recency
        ).strip()

        return {
            "context": context,
            "facts_count": len(facts),
            "facts": facts
        }
    finally:
        await client.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True, help="User's message or topic")
    parser.add_argument("--limit", type=int, default=10, help="Max facts to retrieve")
    parser.add_argument("--format", choices=["json", "text"], default="json")
    args = parser.parse_args()

    result = asyncio.run(get_context(args.query, args.limit))

    if args.format == "text":
        print(result["context"])
    else:
        print(json.dumps(result))


if __name__ == "__main__":
    main()
```

**Step 2: Test context retrieval**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/context_injector.py \
  --query "graph database architecture decision" \
  --format text
```

Expected: Formatted context block containing facts about Memgraph, graph-first architecture, etc. (from the mining test in Task 6).

**Step 3: Verify response time is acceptable**

```bash
time ~/.openclaw/.venv/bin/python3 \
  ~/.openclaw/projects/graph/v4/context_injector.py \
  --query "what decisions have I made this week" \
  --format json | python3 -m json.tool | head -5
```

Expected: Response within 2-3 seconds (Graphiti performs a vector search + graph traversal).

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/context_injector.py
git commit -m "feat(v4): context injector — temporal graph context before every AI interaction"
```

---

### Task 9: Build the pattern detector (proactive surfacing)

**Files:**
- Create: `~/.openclaw/projects/graph/v4/pattern_detector.py`
- Create: `~/.openclaw/cron/ai.openclaw.graph-pattern-detector.plist`

**Step 1: Create pattern_detector.py**

Create `~/.openclaw/projects/graph/v4/pattern_detector.py`:

```python
#!/usr/bin/env python3
"""
PAIOS v4 Pattern Detector.
Runs every 4 hours. Detects patterns, decaying beliefs, and repeated mistakes.
Surfaces findings as officer Signals in kb.sqlite (flows to graph via CDC).
"""
import asyncio
import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from neo4j import AsyncGraphDatabase

GRAPH_URI      = "bolt://localhost:7687"
GRAPH_USER     = "memgraph"
GRAPH_PASSWORD = ""
KB_PATH        = Path.home() / ".openclaw/projects/knowledge-base/kb.sqlite"


async def detect_repeated_failures(session) -> list[dict]:
    """Find decision domains with 2+ negative outcomes in last 90 days."""
    result = await session.run("""
        MATCH (d:Decision)
        WHERE d.outcome_rating IS NOT NULL
          AND d.outcome_rating <= 2
          AND d.valid_at > datetime() - duration('P90D')
          AND d.expired_at IS NULL
        WITH d.domain as domain, count(d) as failures, collect(d.title)[0..3] as examples
        WHERE failures >= 2
        RETURN domain, failures, examples
        ORDER BY failures DESC
        LIMIT 5
    """)
    records = await result.data()
    return records


async def detect_decaying_beliefs(session) -> list[dict]:
    """Find beliefs with high initial confidence that haven't been reinforced in 60+ days."""
    result = await session.run("""
        MATCH (b:Belief)
        WHERE b.confidence > 0.6
          AND b.discovered_at < datetime() - duration('P60D')
          AND b.expired_at IS NULL
        RETURN b.statement as statement, b.confidence as confidence,
               b.domain as domain, b.discovered_at as discovered_at
        ORDER BY b.confidence DESC
        LIMIT 5
    """)
    records = await result.data()
    return records


def create_signal(title: str, body: str, severity: str = "medium") -> None:
    """Write a Signal to kb.sqlite (CDC will pick it up within 100ms)."""
    if not KB_PATH.exists():
        return
    conn = sqlite3.connect(str(KB_PATH))
    conn.execute("""
        INSERT INTO officer_signals
            (from_role, to_role, signal_type, severity, subject, body, acknowledged, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
    """, ("pattern-detector", "CEO", "pattern", severity, title, body))
    conn.commit()
    conn.close()


async def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Pattern detector running...")
    driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
    signals_created = 0

    async with driver.session() as session:
        # Pattern 1: Repeated failures in same domain
        failures = await detect_repeated_failures(session)
        for f in failures:
            title = f"⚠️ Repeated failures: {f['domain']} ({f['failures']} decisions)"
            body = (f"You have {f['failures']} decisions with poor outcomes in the '{f['domain']}' "
                    f"domain in the last 90 days.\n\nExamples: {', '.join(f['examples'])}\n\n"
                    f"Consider reviewing your decision-making pattern in this area.")
            create_signal(title, body, "high")
            signals_created += 1
            print(f"  Signal: {title}")

        # Pattern 2: Decaying high-confidence beliefs
        beliefs = await detect_decaying_beliefs(session)
        for b in beliefs:
            title = f"🔄 Review belief: {str(b['statement'])[:60]}..."
            body = (f"You held this belief with {b['confidence']:.0%} confidence, "
                    f"but it hasn't been reinforced in 60+ days.\n\n"
                    f"Statement: {b['statement']}\n\nDo you still hold this view?")
            create_signal(title, body, "low")
            signals_created += 1
            print(f"  Signal: {title[:80]}")

    await driver.close()
    print(f"Created {signals_created} signals")


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 2: Test detector runs without errors**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/pattern_detector.py
```

Expected: Runs cleanly, prints count of signals created (0 is fine initially — no patterns yet).

**Step 3: Create launchd plist (every 4 hours)**

Create `~/.openclaw/cron/ai.openclaw.graph-pattern-detector.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.openclaw.graph-pattern-detector</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/user/.openclaw/.venv/bin/python3</string>
        <string>/Users/user/.openclaw/projects/graph/v4/pattern_detector.py</string>
    </array>
    <key>StartInterval</key>
    <integer>14400</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/user/.openclaw/logs/graph-pattern-detector.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/user/.openclaw/logs/graph-pattern-detector.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key><string>/Users/user</string>
        <key>PATH</key><string>/Users/user/.openclaw/.venv/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

**Step 4: Load service**

```bash
ln -sf ~/.openclaw/cron/ai.openclaw.graph-pattern-detector.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.openclaw.graph-pattern-detector.plist
launchctl list | grep pattern-detector
```

**Step 5: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/pattern_detector.py ~/.openclaw/cron/ai.openclaw.graph-pattern-detector.plist
git commit -m "feat(v4): pattern detector — proactive surfacing every 4 hours via Signals"
```

---

## Phase 3: Cutover — Delete Kuzu, Validate, Go Live

---

### Task 10: Update MCP server tools to query Memgraph/Graphiti

**Files:**
- Modify: `~/.openclaw/projects/graph/mcp-server.ts`

**Step 1: Read current MCP server tools**

```bash
grep -n "execute\|query\|kuzu\|MATCH" ~/.openclaw/projects/graph/mcp-server.ts | head -30
```

**Step 2: Replace graph query tools to use Graphiti search**

The MCP server exposes tools like `graph_query`, `graph_context`, `graph_timeline`. Replace their implementations to use the context_injector and Graphiti search instead of Kuzu.

Create `~/.openclaw/projects/graph/v4/mcp_bridge.py` as a Python subprocess the MCP server can call:

```python
#!/usr/bin/env python3
"""
MCP Bridge — exposes Graphiti search to the TypeScript MCP server via subprocess.
MCP server calls: python3 mcp_bridge.py <command> <args_json>
Returns JSON to stdout.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from client import get_graphiti
from context_injector import get_context


async def graph_search(query: str, limit: int = 10) -> dict:
    client = get_graphiti()
    try:
        results = await client.search(query, num_results=limit)
        return {
            "facts": [{"fact": r.fact, "weight": getattr(r, "weight", 1.0)} for r in results],
            "count": len(results)
        }
    finally:
        await client.close()


async def graph_context(query: str) -> dict:
    return await get_context(query, limit=10)


COMMANDS = {
    "search":  lambda args: graph_search(args["query"], args.get("limit", 10)),
    "context": lambda args: graph_context(args["query"]),
}


async def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: mcp_bridge.py <command> <args_json>"}))
        sys.exit(1)

    command = sys.argv[1]
    args = json.loads(sys.argv[2])

    if command not in COMMANDS:
        print(json.dumps({"error": f"unknown command: {command}"}))
        sys.exit(1)

    result = await COMMANDS[command](args)
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())
```

**Step 3: Test MCP bridge**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/mcp_bridge.py \
  search '{"query": "architecture decisions", "limit": 5}'
```

Expected: JSON with facts array.

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/mcp_bridge.py
git commit -m "feat(v4): MCP bridge — graph tools now query Graphiti/Memgraph"
```

---

### Task 11: 24-hour validation and system health check

**Files:**
- Create: `~/.openclaw/projects/graph/v4/health_check.py`

**Step 1: Create health check**

Create `~/.openclaw/projects/graph/v4/health_check.py`:

```python
#!/usr/bin/env python3
"""PAIOS v4 Health Check — validates the entire stack is operational."""
import asyncio
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from neo4j import AsyncGraphDatabase

GRAPH_URI = "bolt://localhost:7687"
GRAPH_USER = "memgraph"
GRAPH_PASSWORD = ""
BASE = Path.home() / ".openclaw"

CHECKS = []

async def run_checks():
    results = []

    # 1. Memgraph connectivity
    try:
        driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
        async with driver.session() as s:
            r = await s.run("RETURN 1 AS ok")
            await r.single()
        await driver.close()
        results.append(("Memgraph connectivity", "✅", "bolt://localhost:7687 responsive"))
    except Exception as e:
        results.append(("Memgraph connectivity", "❌", str(e)))

    # 2. Node counts
    try:
        driver = AsyncGraphDatabase.driver(GRAPH_URI, auth=(GRAPH_USER, GRAPH_PASSWORD))
        async with driver.session() as s:
            for label in ["Event", "Decision", "Signal", "Artifact"]:
                r = await s.run(f"MATCH (n:{label}) RETURN count(n) as c")
                record = await r.single()
                count = record["c"]
                status = "✅" if count > 0 else "⚠️"
                results.append((f"{label} nodes", status, f"{count:,}"))
        await driver.close()
    except Exception as e:
        results.append(("Node counts", "❌", str(e)))

    # 3. CDC worker active
    try:
        import subprocess
        out = subprocess.check_output(
            ["launchctl", "list", "ai.openclaw.graph-cdc-worker"], text=True
        )
        pid_line = [l for l in out.split("\n") if "PID" in l or l.strip().split("\t")[0].isdigit()]
        results.append(("CDC worker launchd", "✅", "service loaded"))
    except Exception as e:
        results.append(("CDC worker launchd", "⚠️", str(e)))

    # 4. CDC events backlog (should be near-zero)
    for db_path in [BASE/"observability.sqlite", BASE/"projects/knowledge-base/kb.sqlite"]:
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                backlog = conn.execute(
                    "SELECT COUNT(*) FROM cdc_events WHERE processed=0"
                ).fetchone()[0]
                conn.close()
                status = "✅" if backlog < 10 else "⚠️"
                results.append((f"CDC backlog ({db_path.name})", status, f"{backlog} unprocessed"))
            except Exception:
                results.append((f"CDC backlog ({db_path.name})", "⚠️", "cdc_events not found"))

    # 5. Mining log recent activity
    mining_log = BASE / "logs/conversation-mining.log"
    if mining_log.exists():
        lines = mining_log.read_text().splitlines()
        results.append(("Mining log", "✅", f"{len(lines)} entries"))
    else:
        results.append(("Mining log", "⚠️", "No mining activity yet (hook not triggered)"))

    # Print results
    print(f"\nPAIOS v4 Health Check — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 65)
    for name, status, detail in results:
        print(f"  {status}  {name:<35} {detail}")
    print("=" * 65)

    failures = sum(1 for _, s, _ in results if s == "❌")
    warnings = sum(1 for _, s, _ in results if s == "⚠️")
    print(f"  Result: {len(results)-failures-warnings} passed, {warnings} warnings, {failures} failures\n")
    return failures == 0


if __name__ == "__main__":
    ok = asyncio.run(run_checks())
    exit(0 if ok else 1)
```

**Step 2: Run health check**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/health_check.py
```

Expected: All ✅, 0 failures.

**Step 3: Run for 24 hours, then verify CDC latency**

After 24 hours of operation, verify CDC is working correctly:

```bash
# Check CDC backlog is near zero
~/.openclaw/.venv/bin/python3 -c "
import sqlite3
dbs = [
    '/Users/user/.openclaw/observability.sqlite',
    '/Users/user/.openclaw/projects/knowledge-base/kb.sqlite',
]
for db in dbs:
    conn = sqlite3.connect(db)
    backlog = conn.execute('SELECT COUNT(*) FROM cdc_events WHERE processed=0').fetchone()[0]
    total = conn.execute('SELECT COUNT(*) FROM cdc_events').fetchone()[0]
    conn.close()
    print(f'{db.split(\"/\")[-1]}: {backlog} unprocessed / {total} total')
"
```

Expected: Backlog near 0 for both DBs.

**Step 4: Commit**

```bash
cd ~/.openclaw/projects/graph
git add v4/health_check.py
git commit -m "feat(v4): health check — validates full stack operational status"
```

---

### Task 12: Cutover — delete Kuzu infrastructure

> **Only run this after 24-hour validation passes with 0 failures.**

**Step 1: Stop all old Kuzu-related launchd services**

```bash
launchctl unload ~/Library/LaunchAgents/ai.openclaw.graph-sync-hot.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/ai.openclaw.mcp-kb-server.plist 2>/dev/null
echo "Old graph services stopped"
launchctl list | grep graph
```

**Step 2: Archive old graph code**

```bash
mkdir -p ~/.openclaw/projects/graph/archive/kuzu-era
# Move all old Kuzu code to archive
mv ~/.openclaw/projects/graph/sync.py \
   ~/.openclaw/projects/graph/sync_context.py \
   ~/.openclaw/projects/graph/sync_state_db.py \
   ~/.openclaw/projects/graph/schema.py \
   ~/.openclaw/projects/graph/monitor.py \
   ~/.openclaw/projects/graph/hybrid_rag.py \
   ~/.openclaw/projects/graph/lazy_graph_rag.py \
   ~/.openclaw/projects/graph/graph_context.py \
   ~/.openclaw/projects/graph/conversation_embeddings.py \
   ~/.openclaw/projects/graph/archive/kuzu-era/ 2>/dev/null || true

mv ~/.openclaw/projects/graph/enrich \
   ~/.openclaw/projects/graph/archive/kuzu-era/ 2>/dev/null || true

echo "Old Kuzu code archived"
```

**Step 3: Delete Kuzu database (point of no return)**

```bash
# Confirm backfill is complete first
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/health_check.py

# Then delete
rm -rf ~/.openclaw/graph.kuzu
rm -rf ~/.openclaw/graph.kuzu.corrupted 2>/dev/null
rm -f ~/.openclaw/projects/graph/sync_state.json 2>/dev/null
rm -f ~/.openclaw/projects/graph/sync_state.sqlite 2>/dev/null
echo "✅ Kuzu database deleted"
```

**Step 4: Remove old launchd plist symlinks**

```bash
rm -f ~/Library/LaunchAgents/ai.openclaw.graph-sync-hot.plist
rm -f ~/Library/LaunchAgents/ai.openclaw.graph-sync-warm.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/ai.openclaw.graph-sync-cold.plist 2>/dev/null
echo "✅ Old launchd plists removed"
```

**Step 5: Final health check**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/health_check.py
```

Expected: All green, Kuzu references gone, Memgraph operational.

**Step 6: Commit cutover**

```bash
cd ~/.openclaw/projects/graph
git add -A
git commit -m "feat(v4): cutover complete — Kuzu deleted, Memgraph+Graphiti live, PAIOS v4 operational"
```

---

## Verification: End-to-End System Test

**Run after Phase 3 cutover is complete.**

**Test 1: CDC latency measurement**

```bash
~/.openclaw/.venv/bin/python3 -c "
import sqlite3, time, asyncio
from neo4j import AsyncGraphDatabase

async def measure_latency():
    # Insert test event
    conn = sqlite3.connect('/Users/user/.openclaw/observability.sqlite')
    t_start = time.time()
    conn.execute(\"INSERT INTO events (trace_id, timestamp, category, action, source) VALUES ('latency-test', datetime('now'), 'system', 'latency_measure', 'test')\")
    conn.commit()
    test_id = conn.execute('SELECT MAX(id) FROM events').fetchone()[0]
    conn.close()

    # Poll for it in Memgraph
    driver = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph', ''))
    for attempt in range(50):  # Up to 5 seconds
        await asyncio.sleep(0.1)
        async with driver.session() as s:
            r = await s.run('MATCH (e:Event {event_id: \$id}) RETURN e', id=test_id)
            if await r.single():
                t_end = time.time()
                print(f'CDC latency: {(t_end - t_start)*1000:.0f}ms')
                await driver.close()
                return
    print('TIMEOUT: event not synced within 5 seconds')
    await driver.close()

asyncio.run(measure_latency())
"
```

Expected: `CDC latency: 100-300ms`

**Test 2: Conversation mining end-to-end**

```bash
echo "I have a strong belief that real-time data is essential for intelligence systems. This is based on my experience with the PAIOS v4 architecture migration, where we moved from 15-minute polling to 150ms CDC. The lesson learned: always measure latency impact before choosing a polling interval." | \
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/conversation_miner.py \
  --source manual --stdin --verbose
```

Then verify it's searchable:

```bash
sleep 3
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/context_injector.py \
  --query "real-time data latency belief" --format text
```

Expected: Context containing facts about real-time data and CDC latency.

**Test 3: Pattern detector runs cleanly**

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/pattern_detector.py
echo "Exit: $?"
```

Expected: Exit 0, no errors.

---

## Success Metrics

| Metric | Target | How to measure |
|--------|--------|----------------|
| CDC latency | p95 < 300ms | Latency test above |
| Mining coverage | 100% of Claude Code sessions | Check `conversation-mining.log` after each session |
| Backlog | < 10 unprocessed CDC events | Health check |
| Node count growth | Increases daily | `health_check.py` node counts |
| Context injection | Returns facts within 3s | `context_injector.py` timing |
| Pattern detector | Runs clean every 4h | `graph-pattern-detector.log` |
