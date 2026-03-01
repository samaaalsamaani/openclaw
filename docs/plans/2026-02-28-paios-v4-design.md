# PAIOS v4 — Temporal Intelligence Architecture Design

**Date:** 2026-02-28
**Status:** Approved for implementation — Memgraph confirmed as graph backend
**Horizon:** 3-week rebuild, clean cut from Kuzu
**Research basis:** 7 parallel research agents validated every architectural decision including unconstrained alternatives (Redpanda, TigerGraph, Qdrant, LangGraph, ArangoDB, Zep Cloud, Mac Studio M3 Ultra). Only Memgraph > Neo4j is a genuine improvement at this scale.

---

## 1. The Core Insight

The current system treats the graph as a **derived artifact** — a delayed copy of what lives in SQLite. Every architectural problem we've encountered (polling lag, corruption, stale data, no learning loop) flows from this single wrong assumption.

PAIOS v4 inverts this. The temporal knowledge graph is the **primary artifact** — the authoritative, evolving model of Faisal. The SQLite databases become inputs. The AI conversations become inputs. The graph becomes the truth.

**Three capabilities this unlocks that don't exist today:**

1. **Compounding intelligence** — every conversation, decision, and observation permanently enriches the model. The system gets measurably smarter with every use.
2. **Temporal reasoning** — the system knows not just what is true, but what *was* true at any point in time, and how beliefs evolved. It can answer: "What did I think about X on February 1st, and what changed?"
3. **Proactive intelligence** — because the model is always current (sub-200ms from any source), the system can surface patterns and contradictions without being asked.

---

## 2. Why Clean Rebuild, Not Migration

Downtime is acceptable. The system has no production users. This unlocks the correct engineering decision: **delete the old architecture and build the right one**.

What gets deleted:
- `~/.openclaw/graph.kuzu` — the corrupted, archived-DB graph
- `sync.py` and all polling tier code — replaced by CDC
- `sync_context.py` — replaced by Graphiti's lifecycle management
- `sync_state.json` / `sync_state_db.py` — replaced by Graphiti's state
- `hybrid_rag.py`, `lazy_graph_rag.py` — replaced by Graphiti's retrieval
- `monitor.py` — rebuilt for Memgraph
- The entire `enrich/` directory — replaced by Graphiti's extraction pipeline
- All launchd plists for graph sync — replaced by new plists

What stays (untouched):
- The 5 SQLite source databases — they are the truth, never touched
- `~/.openclaw/agents/` and gateway infrastructure
- Claude Code hooks infrastructure
- The OpenClaw gateway and MCP servers (updated to call Graphiti)
- All officer scripts (CEO, CBO, CTO)

---

## 3. Technology Stack

### 3.1 Graph Database: Memgraph Community Edition (Local)

**Why Memgraph over Neo4j and all other alternatives:**

Research validated against: FalkorDB, TigerGraph, ArangoDB, Weaviate, Cozo, Kuzu/Ladybug, Neo4j Enterprise.

**Atomic GraphRAG (Memgraph 3.8)** — the decisive advantage:
- Your entire RAG retrieval pipeline (vector search → graph traversal → ranking) executes as a **single Cypher query** inside the database with full ACID guarantees
- Replaces 5-7 sequential Python steps with one round-trip
- Returns not just context but which nodes/edges were selected — observable, debuggable
- ~10x less retrieval code vs. current manual pipeline

**Single-store vector index:**
- Vectors live in the graph, not in a separate system
- Combined graph+vector queries in one atomic operation — you get relationship context AND semantic similarity together, which Qdrant/separate vector stores cannot do
- Research confirmed: for graph-centric queries (your use case), this beats dedicated vector DBs

**Performance and compatibility:**
- 8x faster reads, 50x faster writes vs. Neo4j (irrelevant at 100K nodes, but correct architecture for scale)
- Cypher + Bolt protocol — same connection string as Neo4j (`bolt://localhost:7687`)
- Graphiti compatibility: uses bolt:// driver, Memgraph is drop-in compatible (validate in Phase 0)
- macOS ARM64 supported natively
- Free Community Edition — same licensing model as Neo4j Community

**Durability (in-memory ≠ volatile):**
- WAL (Write-Ahead Logging) enabled by default — every write persisted to disk before acknowledged
- Periodic snapshots configurable (`--storage-snapshot-interval`)
- Snapshot-on-exit: `--storage-snapshot-on-exit=true`
- Working set in RAM (fast queries), persistence on disk (safe)
- At 100K nodes: ~500MB-1GB RAM footprint — well within Mac specs

**Deployment:**
```
Service:   bolt://localhost:7687
Auth:      memgraph / [local password]
Data:      ~/.openclaw/memgraph/
Launchd:   ai.openclaw.memgraph.plist
RAM:       ~500MB-1GB working set (in-memory graph + WAL on disk)
Install:   docker pull memgraph/memgraph-platform OR brew (ARM64 binary)
```

**Phase 0 validation gate:**
Before committing to Memgraph, run Graphiti's test suite against bolt://localhost:7687 (Memgraph). If all Graphiti operations pass → proceed. If edge cases → fall back to Neo4j Community. Timeline: 1-2 days. Either path preserves the entire remaining plan unchanged.

**What was ruled out and why:**
- **Neo4j**: Valid fallback if Graphiti compatibility fails. No Atomic GraphRAG. JVM overhead.
- **FalkorDB**: Graphiti support experimental. Redis-based architecture adds complexity.
- **ArangoDB**: Single-stack appeal but temporal model is audit-based, not bi-temporal. Loses Graphiti's conflict resolution.
- **Redpanda**: Overkill at 500-1000 events/day. SQLite CDC achieves same latency without a separate service.
- **Qdrant**: Splitting vectors from graph loses the ability to combine relationship context + semantic similarity in one query. Net negative for graph-centric retrieval.
- **LangGraph**: Right for >10 agents or complex conditional routing. For 3-5 officers, existing OpenClaw orchestration is equivalent. Design the interface now, implement when needed.
- **Zep Cloud**: Managed Graphiti. Correct call for non-sensitive data. Wrong call for beliefs, decisions, health, finances — sensitive data stays local per sovereignty decision.

### 3.2 Temporal Memory API: Graphiti (graphiti-core)

**What Graphiti provides out of the box:**
- Bi-temporal model: `valid_at` (when true in reality) + `created_at` (when system learned it)
- Edge invalidation: contradicted facts are marked expired, never deleted
- LLM-based entity and relationship extraction from unstructured text
- Incremental updates: each new episode is processed individually, no batch recompute
- Conflict resolution: LLM arbiter detects contradictions, resolves, and logs
- Hybrid search: semantic (vector) + keyword (fulltext) + graph traversal

**What we add on top of Graphiti:**
- Structured ingestion path (for SQLite CDC data — no LLM extraction needed)
- Custom node types (Signal, Lesson, Moment, Artifact) beyond Graphiti's defaults
- Proactive surfacing layer (pattern detection that generates Signals)
- Officer coordination protocol (multi-agent write conflict resolution)

### 3.3 Two Ingestion Paths (Critical Design Decision)

Graphiti uses an LLM to extract entities and relationships from every episode. This is powerful for conversations but prohibitively expensive for bulk structured data.

**Path A — Semantic (Graphiti native):**
```
Source: Conversations, decisions (text-rich, semantic meaning matters)
Method: graphiti.add_episode(episode_body=text, ...)
Cost:   ~500 tokens LLM per item
Volume: ~50-200 items/week (high value, low volume)
Result: Rich entity extraction, relationship inference, conflict detection
```

**Path B — Structured (Direct Neo4j writes):**
```
Source: SQLite CDC events, observability, social posts (structured columns)
Method: neo4j_driver.execute_query("MERGE (e:Event {...})")
Cost:   Zero LLM tokens
Volume: ~500-1000 items/day (structured, deterministic mapping)
Result: Fast, cheap, exact representation of source data
```

Both paths write to the same Neo4j graph with the same temporal schema. The separation is purely about extraction method.

### 3.4 Vector Search: Memgraph Single-Store Vector Index

Memgraph 3.8 includes a single-store vector index — vectors live inside the graph, not in a separate system. No LanceDB, no Qdrant, no separate process.

```cypher
CREATE VECTOR INDEX ON :Belief(embedding)
OPTIONS {size: 1536, similarity_metric: 'cos', resize_coefficient: 2}
```

**Why single-store beats a dedicated vector DB for this use case:**
Combined graph+vector Atomic GraphRAG query (impossible with split storage):
```cypher
CALL vector_search.search('Belief', 5, $query_embedding) YIELD node, score
MATCH (node)-[:SUPPORTS]->(d:Decision)
WHERE d.valid_at > datetime() - duration('P90D')
RETURN node.statement, score, d.title, d.outcome_rating
ORDER BY score DESC
```

Embeddings generated by the existing `~/.openclaw/embedding-server` (Ollama at port 11435) or Claude's embedding API when the local server is unavailable.

---

## 4. The Temporal Schema

Every node and relationship carries temporal metadata. This is not optional — it is the foundation of all temporal reasoning.

### 4.1 Universal Temporal Fields

**All nodes:**
```
valid_at:      DateTime   -- when this fact became true in reality
expired_at:    DateTime?  -- when it stopped being true (null = currently active)
discovered_at: DateTime   -- when the system learned it
confidence:    Float      -- 0.0-1.0, decays over time without reinforcement
source:        String     -- which agent/conversation/document created it
agent_id:      String     -- which AI brain or officer wrote it
```

**All relationships (edges):**
```
valid_at:      DateTime   -- same meaning as nodes
expired_at:    DateTime?  -- edge invalidation (never delete, mark expired)
confidence:    Float      -- strength of this relationship
created_at:    DateTime   -- when the edge was created in the system
```

### 4.2 Node Types

Graphiti creates `Entity` and `Episode` nodes automatically from conversation mining.

We add structured node types for CDC ingestion:

```cypher
// Temporal anchor — one per calendar day
(:Moment {date: Date, day_score: Float, day_type: String, ...})

// Observability events
(:Event {event_id: Int, category: String, action: String,
         severity: String, outcome: String, ...})

// KB decisions
(:Decision {decision_id: Int, title: String, domain: String,
            chosen: String, rationale: String, confidence: Float,
            outcome_rating: Int, context_quality_score: Float, ...})

// Officer signals
(:Signal {signal_id: Int, officer: String, signal_type: String,
          title: String, priority: String, status: String, ...})

// Extracted beliefs (from conversations + KB)
(:Belief {belief_id: String, statement: String, domain: String,
          confidence: Float, evidence_count: Int, ...})

// Extracted lessons (from decision outcomes)
(:Lesson {lesson_id: String, title: String, lesson_text: String,
          domain: String, applied_count: Int, last_applied_at: DateTime, ...})

// Content artifacts
(:Artifact {artifact_id: Int, platform: String, title: String,
            performance_score: Float, ...})
```

### 4.3 Relationship Types

```cypher
// Temporal anchoring
(Event)-[:HAPPENED_ON {time_of_day: String}]->(Moment)
(Decision)-[:DECIDED_ON]->(Moment)
(Signal)-[:RAISED_ON]->(Moment)

// Causal chains (with temporal validity)
(Event)-[:CAUSED_BY {confidence: Float, inference_method: String}]->(Event)
(Decision)-[:LED_TO]->(Outcome)
(Outcome)-[:GENERATED]->(Lesson)

// Knowledge evolution (edge invalidation pattern)
(Belief)-[:EVOLVED_FROM {reason: String}]->(Belief)  -- old belief still queryable
(Belief)-[:SUPPORTS]->(Decision)
(Belief)-[:CONTRADICTS]->(Belief)

// Learning loop (the closed cycle)
(Lesson)-[:APPLIED_IN]->(Decision)
(Decision)-[:RESULTED_IN]->(Outcome)

// Graphiti-managed (created automatically by Graphiti)
(Entity)-[:RELATES_TO]->(Entity)
(Episode)-[:MENTIONS]->(Entity)
```

### 4.4 The Invalidation Pattern

**Never delete a Belief or relationship. Only expire it.**

```python
# When a belief changes:
# 1. Expire the old belief
await session.run("""
    MATCH (b:Belief {belief_id: $id})
    SET b.expired_at = $now, b.confidence = 0.0
""", id=old_id, now=datetime.now())

# 2. Create the new belief linked to the old
await session.run("""
    CREATE (b:Belief {belief_id: $new_id, statement: $statement,
                      valid_at: $now, confidence: $conf, ...})
""", ...)

# 3. Link them (preserves reasoning history)
await session.run("""
    MATCH (old:Belief {belief_id: $old_id}), (new:Belief {belief_id: $new_id})
    CREATE (new)-[:EVOLVED_FROM {reason: $reason, evolved_at: $now}]->(old)
""", ...)
```

**Query for current beliefs only:**
```cypher
MATCH (b:Belief) WHERE b.expired_at IS NULL RETURN b
```

**Query for beliefs as of a specific date:**
```cypher
MATCH (b:Belief)
WHERE b.valid_at <= $date AND (b.expired_at IS NULL OR b.expired_at > $date)
RETURN b
```

---

## 5. The CDC System (Real-Time Ingestion)

### 5.1 Trigger Schema (per SQLite DB)

Applied to: observability.sqlite, kb.sqlite, social-history.sqlite, ceo.sqlite, autonomy.sqlite

```sql
-- One table per DB
CREATE TABLE IF NOT EXISTS cdc_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name  TEXT    NOT NULL,
    operation   TEXT    NOT NULL,  -- INSERT, UPDATE, DELETE
    row_id      INTEGER,
    before_json TEXT,
    after_json  TEXT,
    occurred_at INTEGER NOT NULL,  -- Unix ms
    processed   INTEGER DEFAULT 0,
    processed_at INTEGER
);
CREATE INDEX idx_cdc_unprocessed ON cdc_events(processed, occurred_at);

-- Example trigger (observability.sqlite → events table)
CREATE TRIGGER IF NOT EXISTS obs_events_after_insert
AFTER INSERT ON events BEGIN
    INSERT INTO cdc_events (table_name, operation, row_id, after_json, occurred_at)
    VALUES ('events', 'INSERT', NEW.rowid, json_object(
        'id', NEW.id, 'trace_id', NEW.trace_id, 'timestamp', NEW.timestamp,
        'category', NEW.category, 'action', NEW.action, 'source', NEW.source,
        'duration_ms', NEW.duration_ms, 'error', NEW.error
    ), CAST(strftime('%s', 'now') * 1000 AS INTEGER));
END;
```

### 5.2 CDC Worker

Single Python service at `~/.openclaw/projects/graph/cdc_worker.py`.

Runs every 100ms via launchd (StartInterval: not used — runs as daemon with internal sleep loop).

```
Loop every 100ms:
  For each of 5 source DBs:
    SELECT unprocessed CDC events (LIMIT 100)
    Map to Neo4j node type
    Execute MERGE via neo4j driver (structured path B)
    Mark events processed
    If observability event: also emit graph_sync obs event
```

High-value tables with triggers (Phase 1):
- `observability.sqlite`: `events`
- `kb.sqlite`: `decisions`, `officer_signals`, `thinking_beliefs`, `life_scores`
- `social-history.sqlite`: `posts`, `post_metrics`

Lower-value tables (Phase 2, add triggers later):
- `ceo.sqlite`: `relationships`, `habits`
- `autonomy.sqlite`: `action_rules`, `approval_log`

### 5.3 Structured Mapper

For each table → Neo4j node type mapping:

```python
MAPPINGS = {
    ("observability.sqlite", "events"): {
        "node_label": "Event",
        "pk_field": "id",
        "temporal_field": "timestamp",
        "fields": ["trace_id", "category", "action", "source", "duration_ms", "error"]
    },
    ("kb.sqlite", "decisions"): {
        "node_label": "Decision",
        "pk_field": "id",
        "temporal_field": "created_at",
        "fields": ["title", "domain", "chosen", "rationale", "confidence",
                   "outcome_rating", "decision_class", "context_quality_score"]
    },
    ("kb.sqlite", "officer_signals"): {
        "node_label": "Signal",
        "pk_field": "id",
        "temporal_field": "created_at",
        "fields": ["from_role", "signal_type", "severity", "subject", "body", "acknowledged"]
    },
    # ... etc
}
```

---

## 6. Conversation Mining (The Compounding Intelligence Layer)

### 6.1 What It Does

After every AI conversation ends — regardless of which brain handled it — a lightweight pass extracts:
- Beliefs expressed or updated ("I think X", "I now believe Y")
- Decisions made or discussed
- Entities mentioned (people, projects, tools, concepts)
- Lessons identified ("I learned that...", "next time I should...")
- Open questions raised

All extracted content is passed to `graphiti.add_episode()`. Graphiti's LLM extraction handles entity linking, relationship detection, and conflict resolution automatically.

### 6.2 Hook Architecture

**Claude Code sessions:**

Uses Claude Code's `PostToolUse` or session-end hook mechanism. The hook fires when a session ends, receives the full conversation history, and calls the mining endpoint.

Hook configuration at `~/.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/conversation_miner.py --source claude-code --session-file $CLAUDE_SESSION_FILE"
          }
        ]
      }
    ]
  }
}
```

**Gateway conversations (all other brains):**

The gateway already processes all AI responses. Add a `PostResponse` hook that fires after each complete exchange. For multi-turn conversations, batch the full exchange and mine at session end (detected by timeout or explicit session close).

### 6.3 The Mining Script

`~/.openclaw/projects/graph/conversation_miner.py`:

```python
async def mine_conversation(content: str, source: str, session_id: str):
    """
    Extract knowledge from a conversation and add to temporal graph.

    Uses Graphiti's add_episode() which handles:
    - Entity extraction via LLM
    - Relationship detection
    - Conflict resolution with existing beliefs
    - Temporal metadata
    """
    await graphiti.add_episode(
        name=f"{source}_{session_id}_{datetime.now().isoformat()}",
        episode_body=content,
        source=EpisodeType.text,
        source_description=f"AI conversation via {source}",
        reference_time=datetime.now()
    )
```

Cost: ~500 tokens per conversation via Claude API. At 10 conversations/day: ~$0.15/day. Negligible.

### 6.4 What Compounds Over Time

Month 1: The graph knows your formal decisions and events (from CDC).
Month 2: The graph knows your expressed beliefs and reasoning patterns (from conversations).
Month 3: The graph detects that you express certain beliefs repeatedly, elevates them to high-confidence anchors.
Month 6: The graph recognizes that you're about to contradict a strongly-held belief you haven't questioned in 90 days — and surfaces it before you finalize the decision.

This is the compounding effect. It requires no additional engineering after the hook is wired.

---

## 7. Context Injection (Before Every AI Interaction)

### 7.1 What It Does

Before any AI interaction begins — in Claude Code or via the gateway — the system queries the temporal graph for context relevant to the current conversation. This context is injected into the system prompt.

The AI always has:
- Your current active beliefs relevant to the topic
- Recent decisions in this domain and their outcomes
- Lessons that apply to the current situation
- Patterns the system has detected about how you approach this type of problem

### 7.2 The Retrieval Query

Graphiti's hybrid search (semantic + keyword + graph traversal):

```python
async def get_context_for_query(query: str, limit: int = 10) -> str:
    """
    Retrieve relevant context from the temporal graph.
    Returns formatted string for system prompt injection.
    """
    results = await graphiti.search(
        query=query,
        num_results=limit,
        # Only return currently active facts
        center_node_uuid=None
    )

    # Format for injection
    context_parts = []
    for edge in results:
        context_parts.append(f"- {edge.fact} (confidence: {edge.weight:.1f})")

    return "\n".join(context_parts)
```

### 7.3 Gateway Integration

Pre-prompt hook in the gateway (before sending to any AI brain):

```python
async def inject_context(user_message: str, system_prompt: str) -> str:
    context = await get_context_for_query(user_message)
    if not context:
        return system_prompt

    injection = f"""
## Relevant Context From Your Knowledge Graph
The following facts from your personal knowledge base are relevant to this conversation:
{context}

Use this context to inform your response. If you notice a contradiction with what's being discussed, surface it.
"""
    return system_prompt + "\n\n" + injection
```

---

## 8. The Learning Loop (Closed Feedback Cycle)

### 8.1 The Missing Link Today

Current state: Decisions are recorded. Lessons exist (4 hard-coded). But there is no mechanism that connects outcomes back to decisions, or decisions forward to lessons.

The learning loop is open. Nothing feeds back.

### 8.2 Closing the Loop

**New node type: Outcome**
```cypher
(:Outcome {
    outcome_id: String,
    description: String,
    result: String,         -- 'success', 'failure', 'partial', 'unclear'
    magnitude: Float,       -- 0.0-1.0, how significant
    observed_at: DateTime,
    valid_at: DateTime,
    source: String
})
```

**New relationships:**
```cypher
(Decision)-[:RESULTED_IN]->(Outcome)
(Outcome)-[:GENERATED]->(Lesson)  -- when pattern is detected
(Lesson)-[:APPLIED_IN]->(Decision)  -- when lesson informs a future decision
```

**Automatic outcome detection:**
A weekly analytics pass (integrated into `weekly-tasks.sh`) queries for:
- Decisions made >30 days ago with no linked Outcome
- Conversations mentioning those decisions
- Any signal that the outcome has been observed

When a decision has a clear outcome, link them and check if a Lesson should be created.

**Lesson confidence decay:**
```python
# Weekly: decay lesson confidence if not applied recently
def decay_lessons():
    cutoff = datetime.now() - timedelta(days=30)
    # Lessons not applied in 30 days decay by 10%
    session.run("""
        MATCH (l:Lesson)
        WHERE l.last_applied_at < $cutoff AND l.expired_at IS NULL
        SET l.confidence = l.confidence * 0.9
    """, cutoff=cutoff)
```

---

## 9. Proactive Intelligence (The System That Surfaces Patterns)

### 9.1 Pattern Detection (runs every 4 hours via launchd)

```python
async def detect_patterns():
    """Surface patterns and contradictions as officer Signals."""

    # Pattern 1: Repeated decision mistake
    # "You've made this class of decision 3+ times with negative outcomes"
    repeated_failures = await session.run("""
        MATCH (d:Decision)-[:RESULTED_IN]->(o:Outcome {result: 'failure'})
        MATCH (d2:Decision)-[:RESULTED_IN]->(o2:Outcome {result: 'failure'})
        WHERE d.domain = d2.domain AND d.decision_id <> d2.decision_id
          AND d.valid_at > datetime() - duration('P90D')
        WITH d.domain as domain, count(*) as failures
        WHERE failures >= 2
        RETURN domain, failures
    """)

    # Pattern 2: Decaying high-confidence belief
    # "You held this belief strongly 60 days ago. No reinforcement since."
    decaying_beliefs = await session.run("""
        MATCH (b:Belief)
        WHERE b.confidence > 0.7
          AND b.discovered_at < datetime() - duration('P60D')
          AND NOT (b)<-[:SUPPORTS]-(:Event {valid_at: > datetime() - duration('P60D')})
          AND b.expired_at IS NULL
        RETURN b LIMIT 5
    """)

    # Pattern 3: Imminent contradiction
    # "You're about to decide X, but you believed not-X strongly 30 days ago"
    # Triggered by context injection — when retrieved belief contradicts
    # the current conversation topic

    # For each pattern: create a Signal in kb.sqlite (officer_signals table)
    # This Signal flows into the graph via CDC
```

### 9.2 The Proactive Surface

Patterns become **officer Signals** that appear in your morning briefing, Claude Code context, and gateway pre-prompts. Not a separate interface — they flow through existing channels.

---

## 10. Migration Plan (From Here to There)

### Phase 0: Stabilize Current System (Week 1, Days 1-3)

Execute the minimum subset of the Phase 1 hardening plan needed to keep the system running during the transition:
- Fix `conversation_embedding` typo in sync.py (prevents decision sync crash)
- Keep hot sync running for observability (the existing graph is used until Phase 1 completes)
- Do NOT invest in SyncContext, sync_state.sqlite, or other Kuzu improvements — these will be deleted

### Phase 1: Foundation (Week 1, Days 4-7)

1. **Phase 0 validation (Days 1-2):** Install Memgraph Community (`docker pull memgraph/memgraph-platform` or ARM64 binary). Run Graphiti's test suite against bolt://localhost:7687. Confirm all Graphiti operations pass. If they do, proceed. If not, install Neo4j Community as fallback (identical remaining steps).
2. Configure Memgraph as launchd service, verify bolt:// connection, enable WAL + snapshot-on-exit
3. Install `graphiti-core` and `neo4j` Python packages (Graphiti uses the neo4j bolt driver — same driver works for Memgraph)
4. Create Memgraph schema (constraints, indexes, Atomic GraphRAG vector index)
5. Write CDC trigger schema and deploy to all 5 SQLite DBs
6. Write CDC worker (cdc_worker.py)
7. Run initial backfill from all 5 SQLite DBs into Memgraph (structured path)

End state: All 7.8K events, 2.6K decisions, 2K entities, 24 signals, 50 beliefs in Memgraph with temporal metadata. System runs on both Kuzu (old) and Memgraph (new) in parallel during validation.

### Phase 2: Intelligence (Week 2, Days 8-14)

1. Wire conversation mining hook (Claude Code Stop hook)
2. Wire gateway PostResponse hook
3. Test mining with 5 real conversations — verify entities/beliefs extracted correctly
4. Build context injection pre-prompt hook
5. Verify context injection appears in Claude Code sessions
6. Build proactive surfacing (pattern detection, 4-hour launchd job)
7. Build learning loop (Outcome node, outcome detection script)

End state: Every conversation enriches the graph. Context is injected before interactions. Patterns are surfaced as Signals.

### Phase 3: Cutover (Week 3, Days 15-21)

1. Verify Neo4j graph is consistent and complete
2. Update MCP server tools to query Neo4j/Graphiti instead of Kuzu
3. Delete graph.kuzu, all sync.py polling code, Kuzu-specific infrastructure
4. Remove old launchd plists (graph-sync-hot, graph-sync-warm, graph-sync-cold)
5. Add new launchd plists (memgraph, cdc-worker, pattern-detector)
6. Run 24-hour validation: verify no data loss, CDC latency <200ms, mining working
7. Deploy proactive surfacing to production
8. Archive all Kuzu-era code to `~/.openclaw/projects/graph/archive/`

End state: Kuzu is gone. Neo4j + Graphiti + CDC is the live system.

---

## 11. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Graphiti LLM extraction quality poor | Medium | Medium | Test with 20 conversations before deploying to all. Fine-tune extraction prompt. |
| Neo4j JVM too slow on older hardware | Low | Medium | Has 16GB+ RAM Mac. JVM overhead ~512MB. Acceptable. |
| CDC triggers slow down SQLite writes | Low | Low | +100% write overhead measured in practice at ~2ms. KB gets ~10 writes/hour. Imperceptible. |
| Graphiti API changes break mining | Low | Medium | Pin graphiti-core version. Monitor GitHub. We can fork if needed (~3K lines). |
| Neo4j data corruption | Very Low | High | Daily backup via `neo4j-admin dump`. 3-day retention. Automated via daily-tasks.sh. |
| Mining produces noisy/wrong entities | Medium | Low | Graphiti has conflict resolution. Wrong entities expire naturally. Human review via weekly briefing. |
| Kuzu-era data loss during cutover | None | High | All data rebuilt from SQLite source DBs. The graph is always derived, never primary. |

---

## 12. Success Metrics

**Week 3 (post-cutover):**
- CDC latency: p95 < 200ms from SQLite write to Neo4j node
- Conversation mining: 100% of Claude Code sessions mined
- Context injection: active in all gateway interactions
- Data completeness: all 7.8K events, 2.6K decisions, 50+ beliefs in Neo4j

**Month 2:**
- 500+ conversation episodes mined and stored
- Active beliefs: 100+ (growing organically from conversations)
- Learning loop: at least 10 Decision → Outcome → Lesson chains closed

**Month 3:**
- Proactive surfacing: at least 3 genuine patterns surfaced that would not have been noticed manually
- One instance of: "system surfaced a belief contradiction before a decision was finalized"
- Intelligence compounds: the system is measurably smarter than month 1 with zero manual curation

---

## 13. Final Stack Summary

```
Graph engine:     Memgraph Community Edition (local, bolt://localhost:7687)
                  Atomic GraphRAG, single-store vector, temporal graph networks
                  Free. macOS ARM64. WAL + snapshots for durability.

Memory API:       Graphiti (self-hosted, graphiti-core pip package)
                  Bi-temporal, edge invalidation, LLM extraction, conflict resolution
                  Points to Memgraph via bolt:// (same driver as Neo4j)

Event ingestion:  SQLite CDC triggers (all 5 source DBs, 100-200ms latency)
                  Validated: right tool at 500-1000 events/day

AI (heavy):       Claude Sonnet 4.6 API (complex reasoning, synthesis, decisions)
AI (light):       Llama 3.3 70B via Ollama (extraction, classification, background analysis)
                  Near-zero marginal cost on local hardware

Orchestration:    OpenClaw gateway (existing, right for 3-5 officers)
                  Design LangGraph interface now, implement when >10 agents needed

Source data:      SQLite × 5 (unchanged — the source of truth, never modified)

Hardware note:    Mac Studio M3 Ultra 512GB ($11,699) changes the economics if
                  using the system 2+ hours/day. Breakeven 18-24 months vs. cloud-only.
                  Optional but high-ROI for serious daily use.
```

## 14. What This Is, In One Sentence

A temporal knowledge graph that treats every conversation you have with AI as a permanent contribution to your model of yourself — and uses that model to make every future AI interaction more intelligent, more contextual, and more aligned with who you are and what you've learned.

That's PAIOS v4.
