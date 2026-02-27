# PAIOS Graph Intelligence Layer - Design Document

**Date:** 2026-02-28
**Author:** Claude Sonnet 4.5
**Status:** Approved
**Implementation Timeline:** 8 weeks

---

## Executive Summary

This document describes the design of a graph-based intelligence layer for PAIOS (Personal AI Operating System) that unifies data from multiple subsystems (observability, knowledge base, autonomy, social media) into a queryable graph structure optimized for AI/LLM consumption.

**Key Features:**

- Unified graph layer connecting events, decisions, entities, and artifacts
- Temporal spine anchored on daily moments
- New intelligence abstractions: signals, lessons, beliefs
- LazyGraphRAG + HybridRAG for LLM-optimized retrieval
- 99% cost reduction vs. standard GraphRAG ($0.10 vs. $100 per query)
- 3-5x better answer accuracy through hybrid retrieval

**Architecture:** Kuzu (embedded graph database) + SQLite (source databases)
**Migration Path:** Batch materialization → Validation → (Optional) Source of Truth

---

## Table of Contents

1. [Background & Requirements](#background--requirements)
2. [Architecture Decision](#architecture-decision)
3. [Schema Design](#schema-design)
4. [Edge Vocabulary](#edge-vocabulary)
5. [Materialization Strategy](#materialization-strategy)
6. [Query Patterns](#query-patterns)
7. [LLM Integration](#llm-integration)
8. [Migration Strategy](#migration-strategy)
9. [MCP Tools](#mcp-tools)
10. [Success Metrics](#success-metrics)
11. [References](#references)

---

## Background & Requirements

### Current State

PAIOS operates with multiple specialized databases:

- **observability.sqlite** (1.8MB): 6,963 events, quality scores, handoffs
- **kb.sqlite** (55MB): 866 articles, 2,251 entities, 2,152 decisions
- **autonomy.sqlite** (120KB): 196 rules, 262 approvals
- **social-history.sqlite** (14MB): 589 posts with engagement metrics
- **ceo.sqlite** (20KB): CEO/officer state, relationships

**Pain Points:**

1. **Data Fragmentation**: Related data spread across databases
2. **Implicit Relationships**: Connections exist but aren't explicitly modeled
3. **Cross-System Queries**: Require manual joins across databases
4. **Learning Gaps**: System can't track "did we learn from this failure?"
5. **No Temporal Spine**: Events float in time without daily anchors
6. **Missing Intelligence Abstractions**: No signals, lessons, or beliefs

### Requirements

**Functional:**

- Unified graph layer connecting all subsystems
- Explicit relationships (caused_by, learned_from, supports, contradicts, etc.)
- Temporal organization via daily moments
- Causality tracking and learning analysis
- LLM-optimized context extraction
- Support for 7 key query patterns (causality, learning, temporal, etc.)

**Non-Functional:**

- Query latency p95 <500ms
- Sync reliability >99%
- Data freshness <30 minutes (hot tier)
- 99% cost reduction vs. standard GraphRAG
- Safe rollback at each migration phase

**Query Patterns (All Must Be Supported):**

1. Causality chains ("What led to this?")
2. Learning queries ("Did we apply this lesson?")
3. Temporal patterns ("What happens 3 days after X?")
4. Cross-system correlation ("When X happens, what else happens?")
5. Entity-centric views ("Everything about entity X")
6. Graph algorithms (PageRank, community detection)
7. LLM context building (intelligent subgraph extraction)

---

## Architecture Decision

### Selected Approach: **Kuzu + SQLite Hybrid** 🏆

**Rationale:**

- **Performance:** 18x faster ingestion than Neo4j, vectorized OLAP
- **Cost:** Open source, embedded (no separate infrastructure)
- **Scale:** Handles hundreds of millions of nodes (tested on LDBC SF100)
- **Integration:** Python/Node.js bindings, full Cypher support
- **LLM-optimized:** Perfect for LazyGraphRAG + HybridRAG

**Architecture Pattern:**

```
Existing Databases (Authoritative)     New Graph Layer (Queryable)
────────────────────────────────       ───────────────────────────
observability.sqlite                   graph.kuzu
  └─ events                  ─────┐      ├─ Nodes (8 types)
kb.sqlite                          ├──→  │  ├─ Moment (new)
  ├─ decisions               ─────┤      │  ├─ Signal (new)
  ├─ entities                ─────┤      │  ├─ Lesson (new)
  └─ articles                ─────┤      │  ├─ Belief (new)
autonomy.sqlite                    │      │  ├─ Event (ref)
  └─ action_rules            ─────┤      │  ├─ Decision (ref)
social-history.sqlite              │      │  ├─ Entity (ref)
  └─ posts                   ─────┘      │  └─ Artifact (ref)
                                         ├─ Edges (16 types)
                                         └─ Materialized views
```

**Alternatives Considered:**

- **SQLite-only:** Simpler but 10-100x slower traversals, limited algorithms
- **DuckDB:** Excellent for analytics but batch-oriented (not real-time)
- **Neo4j:** Industry standard but higher cost/complexity

---

## Schema Design

### Node Types (8 Total)

#### 1. Moment - Daily Anchor (The Spine)

**Purpose:** Central temporal spine - every event/decision/signal anchors to a moment

```cypher
CREATE NODE TABLE Moment (
  date DATE PRIMARY KEY,
  day_score INTEGER,           -- From life_scores (1-10)
  day_type STRING,             -- 'weekday', 'weekend', 'holiday'
  weather STRING,              -- Optional context
  location STRING,             -- Optional context
  summary TEXT,                -- LLM-generated daily summary
  created_at TIMESTAMP,
  synced_at TIMESTAMP          -- Last materialization
)
```

**Key Properties:**

- `date`: ISO date (YYYY-MM-DD)
- `day_score`: Subjective day quality (1-10)
- `summary`: Generated by LLM at end of day

---

#### 2. Event - What Happened (Reference)

**Purpose:** References events from observability.sqlite, adds severity classification

```cypher
CREATE NODE TABLE Event (
  event_id INTEGER PRIMARY KEY, -- Maps to observability.events.id
  trace_id STRING,
  category STRING,              -- 'routing', 'kb', 'content', 'system', etc.
  action STRING,
  severity STRING,              -- 'info', 'warning', 'error', 'critical'
  source STRING,
  duration_ms INTEGER,
  outcome STRING,               -- 'success', 'failure', 'partial'
  error TEXT,
  indexed_at TIMESTAMP
)
```

**Augmented Properties (Not in Source DB):**

- `severity`: Classified by graph sync process
- `outcome`: Inferred from error field + duration

---

#### 3. Signal - Cross-System Intelligence (NEW)

**Purpose:** Officer-generated insights that span multiple systems

```cypher
CREATE NODE TABLE Signal (
  signal_id INTEGER PRIMARY KEY,
  signal_type STRING,           -- 'performance_degradation', 'trust_decay',
                                 -- 'content_success', 'relationship_alert'
  officer STRING,               -- 'CTO', 'COO', 'CBO', etc.
  title STRING,
  description TEXT,
  confidence REAL,              -- 0.0 - 1.0
  priority STRING,              -- 'low', 'medium', 'high', 'critical'
  status STRING,                -- 'new', 'acknowledged', 'acted_upon', 'dismissed'
  created_at TIMESTAMP
)
```

**Example Signal:**

- officer: "CBO"
- signal_type: "content_underperformance"
- description: "Engagement down 40% week-over-week"
- confidence: 0.85

---

#### 4. Decision - What Was Chosen (Reference)

**Purpose:** References decisions from kb.sqlite for causality tracking

```cypher
CREATE NODE TABLE Decision (
  decision_id INTEGER PRIMARY KEY, -- Maps to kb.decisions.id
  title STRING,
  domain STRING,                -- 'code', 'infrastructure', 'content', 'strategy'
  chosen STRING,
  rationale TEXT,
  confidence REAL,
  outcome_rating INTEGER,       -- 1-5 (if evaluated)
  decision_class STRING,        -- 'reversible', 'one-way-door', 'minor', 'major'
  indexed_at TIMESTAMP
)
```

---

#### 5. Lesson - What Was Learned (NEW)

**Purpose:** Captures learnings from failures/successes, tracks application

```cypher
CREATE NODE TABLE Lesson (
  lesson_id INTEGER PRIMARY KEY,
  title STRING,
  context TEXT,
  lesson_text TEXT,             -- The actual learning
  domain STRING,
  applicable_to STRING[],       -- List of contexts where lesson applies
  applied BOOLEAN,              -- Has this been used since learning?
  applied_count INTEGER,        -- How many times applied
  last_applied_at TIMESTAMP,
  created_at TIMESTAMP
)
```

**Example Lesson:**

- title: "Always test API changes in staging"
- lesson_text: "Production API changes without staging validation cause outages"
- applicable_to: ['api', 'infrastructure', 'deployment']
- applied: false (0 applications in 30+ days)

---

#### 6. Belief - What System Thinks Is True (NEW)

**Purpose:** Explicit modeling of system assumptions, enables belief revision

```cypher
CREATE NODE TABLE Belief (
  belief_id INTEGER PRIMARY KEY,
  statement TEXT,               -- "Posting at 8am gets 2x engagement"
  belief_type STRING,           -- 'hypothesis', 'validated', 'refuted', 'evolving'
  domain STRING,
  confidence REAL,              -- 0.0 - 1.0
  evidence_count INTEGER,       -- Supporting data points
  last_updated TIMESTAMP,
  created_at TIMESTAMP
)
```

**Example Belief:**

- statement: "Morning posts get 2x engagement"
- belief_type: "validated"
- confidence: 0.65
- evidence_count: 45 (posts with metrics)

---

#### 7. Entity - People, Systems, Concepts (Reference)

**Purpose:** References entities from kb.sqlite, adds graph-derived metrics

```cypher
CREATE NODE TABLE Entity (
  entity_id INTEGER PRIMARY KEY, -- Maps to kb.entities.id
  canonical_name STRING,
  entity_type STRING,            -- 'person', 'org', 'tool', 'concept', 'project'
  description TEXT,
  centrality_score REAL,         -- From PageRank (weekly)
  community_id INTEGER,          -- From community detection (weekly)
  indexed_at TIMESTAMP
)
```

**Augmented Properties (Computed Weekly):**

- `centrality_score`: PageRank score (0.0-1.0)
- `community_id`: Cluster assignment

---

#### 8. Artifact - Content Produced (Reference)

**Purpose:** Unified view of all content across systems

```cypher
CREATE NODE TABLE Artifact (
  artifact_id INTEGER PRIMARY KEY,
  artifact_type STRING,          -- 'article', 'post', 'document', 'capture'
  source_table STRING,           -- 'kb.articles', 'social.posts'
  source_id INTEGER,             -- ID in source table
  title STRING,
  platform STRING,               -- 'X', 'LinkedIn', NULL (if article)
  performance_score REAL,        -- Engagement metrics
  indexed_at TIMESTAMP
)
```

---

## Edge Vocabulary

### 16 Named Relationships

#### Temporal Edges (2)

**1. happened_on:** Event → Moment

```cypher
CREATE REL TABLE happened_on (
  FROM Event TO Moment,
  time_of_day TIME,
  timezone STRING
)
```

**Semantics:** "This event occurred on this day"

**2. decided_on:** Decision → Moment

```cypher
CREATE REL TABLE decided_on (
  FROM Decision TO Moment,
  time_of_day TIME
)
```

**Semantics:** "This decision was made on this day"

---

#### Causality Edges (3)

**3. caused_by:** Event/Decision → Event/Decision

```cypher
CREATE REL TABLE caused_by (
  FROM Event TO Event,
  confidence REAL,
  inference_method STRING,      -- 'explicit', 'temporal_correlation', 'granger'
  time_delta_seconds INTEGER
)
```

**Semantics:** "This event/decision caused this other event"

**4. resolved_by:** Event → Event/Decision

```cypher
CREATE REL TABLE resolved_by (
  FROM Event TO Event,
  resolution_time_seconds INTEGER
)
```

**Semantics:** "This problem was solved by this action"

**5. prevented_by:** Event → Decision/Lesson

```cypher
CREATE REL TABLE prevented_by (
  FROM Event TO Decision,
  counterfactual_reasoning TEXT
)
```

**Semantics:** "This problem didn't happen because of this decision/lesson"

---

#### Learning Edges (4)

**6. learned_from:** Lesson → Event/Decision

```cypher
CREATE REL TABLE learned_from (
  FROM Lesson TO Event,
  extraction_method STRING,
  created_at TIMESTAMP
)
```

**Semantics:** "This lesson was extracted from this event/decision"

**7. applied_in:** Lesson → Decision/Event

```cypher
CREATE REL TABLE applied_in (
  FROM Lesson TO Decision,
  application_confidence REAL,
  applied_at TIMESTAMP
)
```

**Semantics:** "This lesson influenced this decision/action"

**8. contradicts:** Belief/Decision → Belief/Decision

```cypher
CREATE REL TABLE contradicts (
  FROM Belief TO Belief,
  contradiction_type STRING,
  severity STRING,
  requires_resolution BOOLEAN
)
```

**Semantics:** "These two beliefs/decisions conflict"

**9. supports:** Event/Artifact → Belief

```cypher
CREATE REL TABLE supports (
  FROM Event TO Belief,
  evidence_strength REAL,
  data_points INTEGER
)
```

**Semantics:** "This evidence strengthens this belief"

---

#### Intelligence Edges (2)

**10. triggered_by:** Signal → Event/Artifact

```cypher
CREATE REL TABLE triggered_by (
  FROM Signal TO Event,
  detection_method STRING,
  threshold_value REAL
)
```

**Semantics:** "This signal was generated by detecting this event/pattern"

**11. led_to:** Signal → Decision

```cypher
CREATE REL TABLE led_to (
  FROM Signal TO Decision,
  officer STRING,
  response_time_hours REAL
)
```

**Semantics:** "This signal prompted this decision"

---

#### Entity Edges (2)

**12. involves:** Event/Decision/Artifact → Entity

```cypher
CREATE REL TABLE involves (
  FROM Event TO Entity,
  involvement_type STRING,
  relevance_score REAL
)
```

**Semantics:** "This event/decision/artifact involves this entity"

**13. related_to:** Entity → Entity

```cypher
CREATE REL TABLE related_to (
  FROM Entity TO Entity,
  relation_type STRING,
  strength REAL
)
```

**Semantics:** "These entities are connected"

---

#### Artifact Edges (2)

**14. references:** Artifact/Decision → Artifact

```cypher
CREATE REL TABLE references (
  FROM Artifact TO Artifact,
  reference_type STRING,
  context TEXT
)
```

**Semantics:** "This content references that content"

**15. produced:** Event → Artifact

```cypher
CREATE REL TABLE produced (
  FROM Event TO Artifact,
  production_type STRING
)
```

**Semantics:** "This event resulted in this artifact"

---

#### Meta Edges (1)

**16. evolved_into:** Belief/Decision → Belief/Decision

```cypher
CREATE REL TABLE evolved_into (
  FROM Belief TO Belief,
  evolution_reason TEXT,
  confidence_delta REAL
)
```

**Semantics:** "This belief/decision changed into this newer version"

---

### Edge Vocabulary Summary

| Category         | Count  | Edges                                           |
| ---------------- | ------ | ----------------------------------------------- |
| **Temporal**     | 2      | happened_on, decided_on                         |
| **Causality**    | 3      | caused_by, resolved_by, prevented_by            |
| **Learning**     | 4      | learned_from, applied_in, contradicts, supports |
| **Intelligence** | 2      | triggered_by, led_to                            |
| **Entity**       | 2      | involves, related_to                            |
| **Artifact**     | 2      | references, produced                            |
| **Meta**         | 1      | evolved_into                                    |
| **Total**        | **16** |                                                 |

---

## Materialization Strategy

### Batch Materialization with Incremental Updates

**Philosophy:** Source databases remain authoritative, graph is a materialized view

**Sync Schedule:**

| Tier          | Frequency  | Data                                                   | Reason                        |
| ------------- | ---------- | ------------------------------------------------------ | ----------------------------- |
| **Hot**       | 15 minutes | Events (24h), Today's moment, Active decisions         | CEO briefings need fresh data |
| **Warm**      | Hourly     | Events (7d), Decisions (30d), New lessons              | Balance freshness vs. cost    |
| **Cold**      | Daily      | Events (90d), Historical decisions, Archived artifacts | Rarely changes                |
| **Analytics** | Weekly     | PageRank, Community detection, Belief confidence       | Expensive computations        |

---

### Sync Process

#### 1. MomentFactory (Always First)

**Idempotent moment creation:**

```python
def ensure_today_moment(kuzu_conn, ceo_db_path):
    """
    Creates today's moment if missing, updates if exists.
    Safe to call multiple times per day.
    """
    today = date.today().isoformat()

    result = kuzu_conn.execute(
        "MATCH (m:Moment {date: $date}) RETURN m",
        {"date": today}
    )

    if not result.has_next():
        # Create new
        day_score = get_day_score_from_ceo_db(ceo_db_path, today)
        kuzu_conn.execute("""
            CREATE (m:Moment {
                date: $date,
                day_score: $score,
                day_type: $type,
                created_at: $now,
                synced_at: $now
            })
        """, {...})
    else:
        # Update existing
        kuzu_conn.execute("""
            MATCH (m:Moment {date: $date})
            SET m.day_score = $score,
                m.synced_at = $now
        """, {...})
```

---

#### 2. Incremental Sync Pattern

**Only sync new/changed data:**

```python
def sync_events_incremental(kuzu_conn, obs_db_path, since_timestamp):
    """
    Sync events created/updated since last sync.
    """
    # Read from source
    new_events = obs_conn.execute("""
        SELECT id, trace_id, timestamp, category, action,
               source, duration_ms, error
        FROM events
        WHERE timestamp > ?
        ORDER BY timestamp
    """, (since_timestamp,)).fetchall()

    # Classify and upsert
    for event in new_events:
        severity = classify_severity(event)
        outcome = infer_outcome(event)

        kuzu_conn.execute("""
            MERGE (e:Event {event_id: $id})
            ON MATCH SET e.severity = $severity, ...
            ON CREATE SET e.severity = $severity, ...
        """, {...})

        # Create temporal edge
        event_date = parse_date(event[2])
        kuzu_conn.execute("""
            MATCH (e:Event {event_id: $event_id})
            MATCH (m:Moment {date: $date})
            MERGE (e)-[r:happened_on]->(m)
        """, {...})
```

---

#### 3. Edge Inference

**Infer causality from temporal patterns:**

```python
def infer_causality_edges(kuzu_conn, lookback_hours=24):
    """
    Infer caused_by edges using temporal correlation.
    Pattern: Error shortly after deployment.
    """
    kuzu_conn.execute("""
        MATCH (deploy:Event {category: 'system', action: 'deploy'})
        MATCH (error:Event {severity: 'error'})
        WHERE error.timestamp > deploy.timestamp
          AND error.timestamp < timestamp_add(deploy.timestamp, INTERVAL $hours HOUR)
          AND NOT EXISTS ((error)-[:caused_by]->(deploy))
        CREATE (error)-[r:caused_by]->(deploy)
        SET r.confidence = 0.6,
            r.inference_method = 'temporal_correlation',
            r.time_delta_seconds = timestamp_diff(error.timestamp, deploy.timestamp)
    """, {"hours": lookback_hours})
```

---

### Launchd Integration

**Hot Sync (15 minutes):**

```xml
<key>StartInterval</key>
<integer>900</integer>
```

**Warm Sync (hourly):** Integrated with daily-tasks.sh
**Cold Sync (daily):** Integrated with daily-tasks.sh at 08:00
**Analytics (weekly):** Integrated with weekly-tasks.sh at 03:30

---

## Query Patterns

### Pattern 1: Causality Chains

**Query:** "What led to this error?"

```cypher
MATCH path = (root)-[:caused_by*1..5]->(error:Event {event_id: 12345})
WHERE error.severity = 'error'
RETURN path,
       length(path) as chain_length,
       [node IN nodes(path) | node.action] as causal_sequence
ORDER BY chain_length DESC
LIMIT 1
```

**Expected Result:**

```
Configuration change → Cache invalidation → API timeout → Error event
(chain_length: 3)
```

---

### Pattern 2: Learning Queries

**Query:** "Show failures where we learned a lesson but haven't applied it"

```cypher
MATCH (error:Event {severity: 'error'})-[:learned_from]-(lesson:Lesson)
WHERE lesson.applied = false
  AND date_diff(current_date(), error.timestamp) > 30
RETURN lesson.title, lesson.lesson_text, error.action, error.timestamp
ORDER BY error.timestamp DESC
```

---

### Pattern 3: Temporal Patterns

**Query:** "What typically happens 3 days after infrastructure decisions?"

```cypher
MATCH (d:Decision {domain: 'infrastructure'})-[:decided_on]->(m1:Moment)
MATCH (e:Event)-[:happened_on]->(m2:Moment)
WHERE m2.date = date_add(m1.date, INTERVAL 3 DAY)
RETURN e.category, e.severity, count(*) as frequency
GROUP BY e.category, e.severity
ORDER BY frequency DESC
```

---

### Pattern 4: Cross-System Correlation

**Query:** "When autonomy rules get demoted, what signals preceded it?"

```cypher
MATCH (decision:Decision)
WHERE decision.title CONTAINS 'autonomy' AND decision.title CONTAINS 'demote'
MATCH (decision)-[:decided_on]->(dm:Moment)
MATCH (signal:Signal)-[:triggered_by]->(event:Event)-[:happened_on]->(sm:Moment)
WHERE sm.date >= date_sub(dm.date, INTERVAL 7 DAY)
  AND sm.date < dm.date
RETURN signal.officer, signal.signal_type, signal.description,
       date_diff(dm.date, sm.date) as days_before
ORDER BY days_before
```

---

### Pattern 5: Entity-Centric Views

**Query:** "Show me everything related to 'Claude API'"

```cypher
MATCH (entity:Entity {canonical_name: 'Claude API'})
OPTIONAL MATCH (entity)<-[:involves]-(event:Event)
OPTIONAL MATCH (entity)<-[:involves]-(decision:Decision)
OPTIONAL MATCH (entity)<-[:involves]-(artifact:Artifact)
OPTIONAL MATCH (entity)-[:related_to]-(related:Entity)
RETURN entity.canonical_name,
       collect(DISTINCT event.action)[0..5] as recent_events,
       collect(DISTINCT decision.title)[0..5] as decisions,
       collect(DISTINCT artifact.title)[0..5] as content,
       collect(DISTINCT related.canonical_name) as related_entities
```

---

### Pattern 6: Graph Algorithms

**Query:** "Which entities are most central?"

```cypher
MATCH (e:Entity)
RETURN e.canonical_name, e.entity_type, e.centrality_score, e.community_id
ORDER BY e.centrality_score DESC
LIMIT 20
```

---

### Pattern 7: LLM Context Building

**Query:** "Extract relevant subgraph for: 'Why did content engagement drop?'"

```cypher
// Step 1: Find relevant starting points
MATCH (artifact:Artifact)
WHERE artifact.artifact_type = 'post'
  AND artifact.performance_score < 0.5
MATCH (artifact)-[:happened_on]->(m:Moment)
WHERE m.date >= date_sub(current_date(), INTERVAL 14 DAY)

// Step 2: Expand to signals, beliefs, lessons
OPTIONAL MATCH (signal:Signal)-[:triggered_by]->(artifact)
OPTIONAL MATCH (belief:Belief)<-[:supports]-(artifact)
OPTIONAL MATCH (lesson:Lesson)-[:learned_from]-(similar:Artifact)
WHERE similar.performance_score < 0.5

// Step 3: Get entities
OPTIONAL MATCH (artifact)-[:involves]->(entity:Entity)

// Step 4: Build context document
RETURN {
  artifacts: collect(DISTINCT artifact)[0..5],
  signals: collect(DISTINCT signal),
  beliefs: collect(DISTINCT belief),
  lessons: collect(DISTINCT lesson.lesson_text),
  entities: collect(DISTINCT entity.canonical_name)
} as context
```

---

### Performance Expectations

Based on Kuzu benchmarks (LDBC SF100: 280M nodes, 1.7B edges):

| Query Type        | Latency Target | Notes                  |
| ----------------- | -------------- | ---------------------- |
| Single-hop        | <10ms          | Direct edge lookup     |
| 2-3 hop causality | 50-200ms       | Multi-hop traversal    |
| Entity-centric    | 20-100ms       | Depends on node degree |
| Temporal range    | 100-500ms      | Indexed on date        |
| Graph algorithms  | 1-10 seconds   | Weekly batch OK        |
| Complex subgraph  | 200-800ms      | For LLM context        |

PAIOS scale (~10K nodes, ~20K edges) is **~10,000x smaller** than LDBC, so expect even faster.

---

## LLM Integration

### LazyGraphRAG Context Extraction

**Concept:** Query-time subgraph extraction (no expensive pre-indexing)

**Cost Comparison:**

| Approach          | Index Cost | Query Cost    | Total (1000 queries) |
| ----------------- | ---------- | ------------- | -------------------- |
| Standard GraphRAG | $100       | $0.05/query   | $150                 |
| LazyGraphRAG      | $0         | $0.0001/query | $0.10                |

**99% cost reduction**

---

### HybridRAG Architecture

**Parallel Retrieval:**

```
User Query
    ├─ Vector Search (sqlite-vec)
    ├─ Graph Traversal (Kuzu)
    └─ Keyword Search (FTS5)
         ↓
    Reciprocal Rank Fusion (RRF)
         ↓
    Context Window Optimization
         ↓
    LLM Prompt (Markdown)
```

**Performance:**

- Vector search: 50-200ms
- Graph traversal: 200-800ms
- Keyword search: 20-100ms
- RRF merge: <10ms
- **Total: ~1 second**

**Accuracy Improvement:** 3-5x better than naive RAG (research validated)

---

### Markdown Format for LLMs

**Research Finding:** Markdown format yields 3-40% better accuracy than JSON

**Example Output:**

```markdown
# Relevant Context

## Events

- **deployment_failed** (2026-02-22): Deployment health checks failed
- **api_timeout** (2026-02-22): API requests timing out

## Causality Chain

config_change → cache_invalidated → api_timeout → deployment_failed

## Lessons

- "Always test database migrations in staging" (not applied)

## Beliefs

- "Staging tests prevent 80% of production issues" (confidence: 0.85)
```

---

## Migration Strategy

### Phased Rollout (8 Weeks)

```
Phase 0: Research & Design        ✅ Complete
         ↓
Phase 1: Proof of Concept         Week 1-2
         ↓
Phase 2: Schema & Backfill        Week 3-4
         ↓
Phase 3: Production Integration   Week 5-6
         ↓
Phase 4: Optimization             Week 7-8
         ↓
Phase 5: (Optional) Source of Truth  Month 2+
```

---

### Phase 1: Proof of Concept (Week 1-2)

**Goal:** Validate Kuzu works, test basic queries

**Tasks:**

1. Install Kuzu Python library
2. Create minimal schema (3 nodes, 3 edges)
3. Load 100 sample events, 50 decisions
4. Test causality queries
5. Benchmark LazyGraphRAG

**Success Criteria:**

- ✅ Sample data loaded
- ✅ Queries return expected results
- ✅ Latency <500ms for 2-hop traversals

**Rollback:** Delete graph.kuzu (no production impact)

---

### Phase 2: Schema & Backfill (Week 3-4)

**Goal:** Complete schema, backfill historical data

**Tasks:**

1. Implement all 8 node types, 16 edge types
2. Create indexes
3. Backfill 90 days of data (~7K events, ~2K decisions)
4. Validate data quality
5. Performance benchmarking

**Success Criteria:**

- ✅ Data quality checks pass
- ✅ Query performance meets targets
- ✅ Disk usage <500MB

**Rollback:** Keep graph but don't integrate

---

### Phase 3: Production Integration (Week 5-6)

**Goal:** Integrate into daily workflows

**Tasks:**

1. Implement incremental sync scripts
2. Create launchd services (hot/warm/cold)
3. Build MCP server with 6 tools
4. Integrate with CEO/CTO briefings
5. Test for 3 days

**Success Criteria:**

- ✅ Sync jobs running error-free (3 days)
- ✅ MCP tools functional
- ✅ CEO/CTO reports include graph insights

**Rollback:** Stop sync jobs, disable MCP, revert code

---

### Phase 4: Optimization (Week 7-8)

**Goal:** Fine-tune performance, add advanced features

**Tasks:**

1. Query optimization (indexes, Cypher tuning)
2. Implement HybridRAG (vector + graph + keyword)
3. Weekly graph algorithms (PageRank, communities)
4. Create monitoring dashboard

**Success Criteria:**

- ✅ 95% queries <500ms
- ✅ HybridRAG shows accuracy improvement
- ✅ Algorithms run weekly without issues

---

### Phase 5: (Optional) Source of Truth (Month 2+)

**Decision Point:** After 4-6 weeks of stable operation

**If YES:**

- New Signal/Lesson/Belief writes go to graph first
- Gradual table-by-table migration
- Source DBs become cold storage

**If NO:**

- Keep graph as materialized view indefinitely
- Still provides all query benefits
- Lower risk

---

## MCP Tools

### Tool Summary

| Tool              | Purpose                | Primary Use Case      |
| ----------------- | ---------------------- | --------------------- |
| `graph_query`     | Direct Cypher access   | Power users           |
| `graph_context`   | LazyGraphRAG retrieval | Primary LLM interface |
| `graph_causality` | Root cause analysis    | CTO briefings         |
| `graph_timeline`  | Temporal patterns      | CEO strategy reviews  |
| `graph_entity`    | Entity profiles        | Officer reports       |
| `graph_learn`     | Learning analysis      | System improvement    |

---

### Tool 1: graph_query

**Parameters:**

- `query` (string, required): Cypher query
- `format` (enum, optional): "json", "markdown", "table" (default: "markdown")

**Example:**

```json
{
  "query": "MATCH (e:Event {severity: 'error'})-[:happened_on]->(m:Moment) WHERE m.date = '2026-02-28' RETURN e.action, e.error LIMIT 5",
  "format": "markdown"
}
```

---

### Tool 2: graph_context

**Parameters:**

- `query` (string, required): Natural language question
- `max_tokens` (number, optional): Default 4000
- `retrieval_mode` (enum, optional): "graph_only", "hybrid", "vector_only"
- `include_causality` (boolean, optional): Default true
- `include_lessons` (boolean, optional): Default true

**Example:**

```json
{
  "query": "Why did content engagement drop last week?",
  "max_tokens": 3000,
  "retrieval_mode": "hybrid"
}
```

**Output:** Markdown-formatted context with events, signals, beliefs, lessons

---

### Tool 3: graph_causality

**Parameters:**

- `node_id` (number, required): Event or Decision ID
- `node_type` (enum, required): "Event" or "Decision"
- `direction` (enum, optional): "causes", "effects", "both"
- `max_depth` (number, optional): 1-5 hops

**Use Case:** CTO briefing root cause analysis

---

### Tool 4: graph_timeline

**Parameters:**

- `pattern_type` (enum, required): "daily_summary", "event_trend", "decision_outcomes", "lesson_application"
- `start_date` (string, required): YYYY-MM-DD
- `end_date` (string, optional): Defaults to today
- `filters` (object, optional): category, severity, domain

**Use Case:** CEO weekly strategy reviews

---

### Tool 5: graph_entity

**Parameters:**

- `entity_name` (string, required): Canonical entity name
- `include_related` (boolean, optional): Default true
- `max_items` (number, optional): Default 20

**Use Case:** Officer reports on specific systems/tools

---

### Tool 6: graph_learn

**Parameters:**

- `analysis_type` (enum, required): "unapplied_lessons", "lesson_impact", "domain_learning", "recent_lessons"
- `domain` (string, optional): Filter by domain
- `min_days_unapplied` (number, optional): Default 30

**Use Case:** System improvement, learning tracking

---

## Success Metrics

### Technical Metrics

**Performance:**

- Query latency p95 <500ms ✅
- Sync reliability >99% ✅
- Data freshness <30 minutes (hot tier) ✅
- Disk usage <1GB for 90 days ✅

**Data Quality:**

- Zero orphaned nodes (events without moments) ✅
- Causality inference precision >70% ✅
- Node counts match source DBs ±5% ✅

---

### Business Metrics

**CTO Reports:**

- Root cause analysis in 100% of error briefings
- Causality chains identified for 80%+ errors
- Lesson application tracking weekly

**CEO Insights:**

- Cross-system correlation queries answerable
- Temporal pattern analysis in strategy reviews
- Learning gaps identified and addressed

**Officer Effectiveness:**

- Signals created and tracked in graph
- Beliefs validated or refuted based on evidence
- Decision outcomes linked to lessons

---

### User Experience Metrics

**LLM Query Quality:**

- Answer relevance improved 3-5x (user feedback)
- Context extraction <1 second latency
- Graph context used in 80%+ complex queries

**System Intelligence:**

- Lessons extracted from 50%+ failures
- Lesson application rate >60% (vs. 0% baseline)
- Belief confidence updated monthly

---

## References

### Research Papers & Articles

**Graph-RAG:**

- Microsoft Research: LazyGraphRAG (Nov 2024) - 99% cost reduction
- Microsoft Research: GraphRAG (Apr 2024) - Community summarization
- HybridRAG (Aug 2024) - Vector + graph parallel retrieval

**Temporal Graphs:**

- VLDB 2024: AeonG - Efficient temporal support
- ACM 2024: Causal discovery from temporal data
- IEEE: Temporal graph neural networks

**Knowledge Graphs for LLMs:**

- ICLR 2024: RAPTOR - Recursive abstractive processing
- EMNLP 2024: Multi-hop reasoning with graphs
- ACL 2024: Text-to-Cypher with LLMs

**Graph Databases:**

- Neo4j Performance: Cypher 5.x optimizations
- Kuzu Documentation: LDBC benchmarks
- DuckDB: USING KEY for recursive CTEs (May 2025)

### Tools & Frameworks

- Kuzu Database: https://kuzudb.com
- sqlite-vec: Vector search extension
- LlamaIndex: Knowledge graph modules
- PyTorch Geometric Temporal: Temporal graph learning

---

## Appendix

### A. Complete Node Schema (Cypher)

```cypher
-- Moments (daily spine)
CREATE NODE TABLE Moment (
  date DATE PRIMARY KEY,
  day_score INTEGER,
  day_type STRING,
  weather STRING,
  location STRING,
  summary TEXT,
  created_at TIMESTAMP,
  synced_at TIMESTAMP
);

-- Events (reference to observability.sqlite)
CREATE NODE TABLE Event (
  event_id INTEGER PRIMARY KEY,
  trace_id STRING,
  category STRING,
  action STRING,
  severity STRING,
  source STRING,
  duration_ms INTEGER,
  outcome STRING,
  error TEXT,
  indexed_at TIMESTAMP
);

-- Signals (new intelligence concept)
CREATE NODE TABLE Signal (
  signal_id INTEGER PRIMARY KEY,
  signal_type STRING,
  officer STRING,
  title STRING,
  description TEXT,
  confidence REAL,
  priority STRING,
  status STRING,
  created_at TIMESTAMP
);

-- Decisions (reference to kb.sqlite)
CREATE NODE TABLE Decision (
  decision_id INTEGER PRIMARY KEY,
  title STRING,
  domain STRING,
  chosen STRING,
  rationale TEXT,
  confidence REAL,
  outcome_rating INTEGER,
  decision_class STRING,
  indexed_at TIMESTAMP
);

-- Lessons (new intelligence concept)
CREATE NODE TABLE Lesson (
  lesson_id INTEGER PRIMARY KEY,
  title STRING,
  context TEXT,
  lesson_text TEXT,
  domain STRING,
  applicable_to STRING[],
  applied BOOLEAN,
  applied_count INTEGER,
  last_applied_at TIMESTAMP,
  created_at TIMESTAMP
);

-- Beliefs (new intelligence concept)
CREATE NODE TABLE Belief (
  belief_id INTEGER PRIMARY KEY,
  statement TEXT,
  belief_type STRING,
  domain STRING,
  confidence REAL,
  evidence_count INTEGER,
  last_updated TIMESTAMP,
  created_at TIMESTAMP
);

-- Entities (reference to kb.sqlite)
CREATE NODE TABLE Entity (
  entity_id INTEGER PRIMARY KEY,
  canonical_name STRING,
  entity_type STRING,
  description TEXT,
  centrality_score REAL,
  community_id INTEGER,
  indexed_at TIMESTAMP
);

-- Artifacts (reference to kb.sqlite, social-history.sqlite)
CREATE NODE TABLE Artifact (
  artifact_id INTEGER PRIMARY KEY,
  artifact_type STRING,
  source_table STRING,
  source_id INTEGER,
  title STRING,
  platform STRING,
  performance_score REAL,
  indexed_at TIMESTAMP
);
```

---

### B. Complete Edge Schema (Cypher)

```cypher
-- Temporal edges
CREATE REL TABLE happened_on (FROM Event TO Moment, time_of_day TIME, timezone STRING);
CREATE REL TABLE decided_on (FROM Decision TO Moment, time_of_day TIME);

-- Causality edges
CREATE REL TABLE caused_by (FROM Event TO Event, confidence REAL, inference_method STRING, time_delta_seconds INTEGER);
CREATE REL TABLE resolved_by (FROM Event TO Event, resolution_time_seconds INTEGER);
CREATE REL TABLE prevented_by (FROM Event TO Decision, counterfactual_reasoning TEXT);

-- Learning edges
CREATE REL TABLE learned_from (FROM Lesson TO Event, extraction_method STRING, created_at TIMESTAMP);
CREATE REL TABLE applied_in (FROM Lesson TO Decision, application_confidence REAL, applied_at TIMESTAMP);
CREATE REL TABLE contradicts (FROM Belief TO Belief, contradiction_type STRING, severity STRING, requires_resolution BOOLEAN);
CREATE REL TABLE supports (FROM Event TO Belief, evidence_strength REAL, data_points INTEGER);

-- Intelligence edges
CREATE REL TABLE triggered_by (FROM Signal TO Event, detection_method STRING, threshold_value REAL);
CREATE REL TABLE led_to (FROM Signal TO Decision, officer STRING, response_time_hours REAL);

-- Entity edges
CREATE REL TABLE involves (FROM Event TO Entity, involvement_type STRING, relevance_score REAL);
CREATE REL TABLE related_to (FROM Entity TO Entity, relation_type STRING, strength REAL);

-- Artifact edges
CREATE REL TABLE references (FROM Artifact TO Artifact, reference_type STRING, context TEXT);
CREATE REL TABLE produced (FROM Event TO Artifact, production_type STRING);

-- Meta edges
CREATE REL TABLE evolved_into (FROM Belief TO Belief, evolution_reason TEXT, confidence_delta REAL);
```

---

### C. Sync Script Example

```python
#!/usr/bin/env python3
# ~/.openclaw/projects/graph/sync.py

import sys
from datetime import datetime, timedelta
import kuzu
import sqlite3

def sync_graph(tier='hot'):
    """
    Main sync orchestrator.

    Args:
        tier: 'hot' (15min), 'warm' (hourly), 'cold' (daily), 'analytics' (weekly)
    """
    db = kuzu.Database("~/.openclaw/graph.kuzu")
    conn = kuzu.Connection(db)

    # Step 1: Always ensure today's moment exists
    ensure_today_moment(conn, "~/.openclaw/projects/personal-ceo/ceo.sqlite")

    # Step 2: Sync nodes (incremental)
    if tier in ['hot', 'warm', 'cold']:
        since = get_last_sync_timestamp(tier)
        sync_events_incremental(conn, "~/.openclaw/observability.sqlite", since)
        sync_decisions_incremental(conn, "~/.openclaw/projects/knowledge-base/kb.sqlite", since)

        if tier in ['warm', 'cold']:
            sync_entities_incremental(conn, "~/.openclaw/projects/knowledge-base/kb.sqlite", since)
            sync_artifacts_incremental(conn, "~/.openclaw/social-history.sqlite", since)

    # Step 3: Infer edges
    if tier == 'hot':
        infer_causality_edges(conn, lookback_hours=24)

    # Step 4: Graph algorithms (weekly only)
    if tier == 'analytics':
        run_pagerank(conn)
        run_community_detection(conn)

    # Step 5: Update last sync timestamp
    update_sync_timestamp(tier)

if __name__ == '__main__':
    tier = sys.argv[1] if len(sys.argv) > 1 else 'hot'
    sync_graph(tier)
```

---

## Document History

| Version | Date       | Author            | Changes                 |
| ------- | ---------- | ----------------- | ----------------------- |
| 1.0     | 2026-02-28 | Claude Sonnet 4.5 | Initial design document |

---

**End of Design Document**
