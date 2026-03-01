# PAIOS Knowledge Graph: Concrete Implementation Patterns (2026)

**Purpose:** Bridge production research findings to PAIOS specific architecture  
**Target:** Kuzu + sqlite-vec hybrid at 10K-100K scale  
**Status:** v1, ready for implementation phases 1-4 (Q1-Q2 2026)

---

## Part 1: Schema Design (FARO-Based 25+ Relationships)

### Current PAIOS Schema (v1.0 — Baseline)

```kuzu
// Nodes (8 types)
CREATE NODE TABLE Moment {
    id STRING,
    timestamp TIMESTAMP,
    source STRING,
    confidence FLOAT,
    PRIMARY KEY (id)
};

CREATE NODE TABLE Event {
    id STRING,
    label STRING,
    description STRING,
    timestamp TIMESTAMP,
    duration_minutes INT64,
    severity STRING, // critical, high, medium, low
    enrichment_status STRING, // complete, pending, partial
    PRIMARY KEY (id)
};

CREATE NODE TABLE Signal {
    id STRING,
    signal_type STRING, // market, behavioral, technical, social
    value FLOAT,
    source STRING,
    detected_at TIMESTAMP,
    validated BOOLEAN,
    validation_confidence FLOAT,
    PRIMARY KEY (id)
};

CREATE NODE TABLE Decision {
    id STRING,
    description STRING,
    decided_at TIMESTAMP,
    decision_maker STRING,
    outcome_status STRING, // pending, succeeded, failed, partial
    outcome_confidence FLOAT,
    PRIMARY KEY (id)
};

CREATE NODE TABLE Lesson {
    id STRING,
    title STRING,
    description STRING,
    learned_from_event_id STRING,
    learned_at TIMESTAMP,
    applicability_domain STRING, // technical, strategic, operational
    reuse_count INT64,
    PRIMARY KEY (id)
};

CREATE NODE TABLE Belief {
    id STRING,
    statement STRING,
    belief_type STRING, // conviction, hypothesis, assumption, principle
    confidence FLOAT,
    first_held TIMESTAMP,
    last_updated TIMESTAMP,
    derived_from_event_id STRING,
    PRIMARY KEY (id)
};

CREATE NODE TABLE Entity {
    id STRING,
    name STRING,
    entity_type STRING, // person, company, concept, metric, asset
    attributes MAP(STRING, STRING),
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    PRIMARY KEY (id)
};

CREATE NODE TABLE Artifact {
    id STRING,
    name STRING,
    artifact_type STRING, // document, code, metric, tool, resource
    created_at TIMESTAMP,
    modified_at TIMESTAMP,
    primary_key STRING, // e.g., "file_path" or "metric_id"
    PRIMARY KEY (id)
};
```

### Phase 1 Extension: Temporal & Causal Enhancement (Q1 2026)

```kuzu
// Add temporal validity to all nodes
ALTER TABLE Event ADD COLUMN valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Event ADD COLUMN valid_until TIMESTAMP DEFAULT NULL; // NULL = still valid
ALTER TABLE Decision ADD COLUMN valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Decision ADD COLUMN valid_until TIMESTAMP DEFAULT NULL;
ALTER TABLE Belief ADD COLUMN valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Belief ADD COLUMN valid_until TIMESTAMP DEFAULT NULL;

// Add causal tracking
ALTER TABLE Decision ADD COLUMN causal_depth INT64 DEFAULT 1; // How many steps to root cause
ALTER TABLE Decision ADD COLUMN root_cause_ids LIST(STRING); // Direct links to causes
```

### Edge Types: FARO-Based Relationship Types (25+)

```kuzu
// Temporal Relationships
CREATE REL TABLE precedes {
    FROM Event TO Event,
    start_time TIMESTAMP,
    end_time TIMESTAMP DEFAULT NULL,
    temporal_type STRING, // "immediate", "within_24h", "week", "month"
};

CREATE REL TABLE overlaps {
    FROM Event TO Event,
    overlap_percentage FLOAT // 0.0-1.0
};

CREATE REL TABLE during {
    FROM Event TO Event,
    COMMENT "Event A occurred during Event B"
};

// Causal Relationships
CREATE REL TABLE causes {
    FROM Event TO Event,
    confidence FLOAT, // 0.0-1.0
    causality_type STRING, // "direct", "indirect", "contributing"
    evidence_count INT64,
    discovered_at TIMESTAMP,
    confidence_decay_rate FLOAT // per week
};

CREATE REL TABLE enables {
    FROM Signal TO Decision,
    FROM Belief TO Decision,
    FROM Event TO Decision,
    causality_confidence FLOAT
};

CREATE REL TABLE prevents {
    FROM Decision TO Event,
    FROM Belief TO Event,
    prevention_confidence FLOAT
};

CREATE REL TABLE corrects {
    FROM Lesson TO Decision,
    FROM Belief TO Belief,
    COMMENT "Newer belief/decision corrects older"
};

// Learning Relationships
CREATE REL TABLE teaches {
    FROM Event TO Lesson,
    FROM Decision TO Lesson,
    teaching_significance FLOAT // 0.0-1.0
};

CREATE REL TABLE explains {
    FROM Belief TO Signal,
    FROM Belief TO Event,
    explanation_quality FLOAT
};

CREATE REL TABLE improves_upon {
    FROM Decision TO Decision,
    FROM Artifact TO Artifact,
    improvement_metric FLOAT
};

// Semantic Relationships
CREATE REL TABLE entails {
    FROM Event TO Event,
    FROM Decision TO Decision,
    COMMENT "If A then logically B must follow"
};

CREATE REL TABLE contradicts {
    FROM Belief TO Belief,
    FROM Decision TO Decision,
    conflict_type STRING // "direct_contradiction", "contradicts_evidence"
};

CREATE REL TABLE presupposes {
    FROM Decision TO Belief,
    FROM Event TO Belief,
    COMMENT "Assumes this belief is true"
};

// Entity Relationships
CREATE REL TABLE participated_in {
    FROM Entity TO Event,
    role STRING
};

CREATE REL TABLE affected_by {
    FROM Entity TO Event,
    FROM Artifact TO Event,
    impact_severity STRING // critical, high, medium, low
};

CREATE REL TABLE references {
    FROM Event TO Entity,
    FROM Decision TO Entity,
    FROM Lesson TO Entity,
    reference_type STRING // mentions, depends_on, targets
};

// Artifact Relationships
CREATE REL TABLE used_in {
    FROM Artifact TO Decision,
    FROM Artifact TO Event,
    FROM Entity TO Artifact
};

CREATE REL TABLE generated_from {
    FROM Artifact TO Event,
    FROM Artifact TO Decision,
    FROM Artifact TO Lesson
};

CREATE REL TABLE related_to {
    FROM Artifact TO Artifact,
    FROM Lesson TO Lesson,
    relatedness_score FLOAT // 0.0-1.0, semantic similarity
};

// Meta-Relationships
CREATE REL TABLE verified_by {
    FROM Event TO Event,
    FROM Signal TO Event,
    FROM Artifact TO Event,
    verification_timestamp TIMESTAMP
};

CREATE REL TABLE supersedes {
    FROM Decision TO Decision,
    FROM Belief TO Belief,
    FROM Artifact TO Artifact
};

CREATE REL TABLE depends_on {
    FROM Decision TO Decision,
    FROM Artifact TO Artifact,
    dependency_type STRING // "hard", "soft", "suggested"
};

CREATE REL TABLE derived_from {
    FROM Belief TO Signal,
    FROM Lesson TO Event,
    derivation_confidence FLOAT
};
```

---

## Part 2: Query Patterns (Hybrid Vector + Graph + FTS)

### Query Type 1: Root Cause Analysis

```kuzu
// Find all events that caused recent failures
MATCH (failure:Event {outcome_status: "failed"})-
      [causes:causes*1..5]-(root:Event)
WHERE failure.timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND causes.confidence > 0.5
RETURN root, failure, causes
ORDER BY causes.confidence DESC, failure.timestamp DESC
LIMIT 10;
```

### Query Type 2: Temporal Reasoning

```kuzu
// Find decisions made during market volatility signals
MATCH (signal:Signal {signal_type: "market"})-
      [during:during]-(event:Event)-
      [enables:enables]-(decision:Decision)
WHERE signal.detected_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event.timestamp BETWEEN signal.detected_at 
                      AND DATE_ADD(signal.detected_at, INTERVAL 1 DAY)
RETURN signal, event, decision, signal.value as volatility
ORDER BY signal.value DESC;
```

### Query Type 3: Pattern Detection (Causal Chains)

```kuzu
// Detect repeated causal patterns: Signal → Decision → Outcome
MATCH (s:Signal)-[sig_enables:enables]->(d:Decision)-[d_causes:causes]->(e:Event)
WHERE s.detected_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
  AND sig_enables.causality_confidence > 0.7
RETURN s.signal_type, d.description, e.outcome_status,
       count(*) as pattern_frequency
GROUP BY s.signal_type, d.description, e.outcome_status
ORDER BY pattern_frequency DESC;
```

### Query Type 4: Belief Evolution

```kuzu
// Track how a belief evolved and what changed it
MATCH (old_belief:Belief)-[corrected:corrects]->(new_belief:Belief)
WHERE old_belief.belief_type = "hypothesis"
  AND new_belief.confidence > old_belief.confidence
OPTIONAL MATCH (new_belief)<-[derived:derived_from]-(event:Event)
RETURN old_belief.statement as "old assumption",
       new_belief.statement as "updated belief",
       new_belief.confidence,
       event.label as "driven by event"
ORDER BY new_belief.last_updated DESC;
```

### Query Type 5: Lesson Reuse (Similar Situations)

```kuzu
// Find lessons from similar past situations
MATCH (past_event:Event)-[teaches:teaches]->(lesson:Lesson)
WHERE past_event.outcome_status = "succeeded"
OPTIONAL MATCH (current_event:Event)
WHERE current_event.timestamp = TODAY()
  AND levenshtein_distance(past_event.description, current_event.description) < 0.3
RETURN lesson.title,
       lesson.description,
       past_event.label as "original context",
       current_event.label as "applicable to"
ORDER BY lesson.reuse_count DESC, teaches.teaching_significance DESC;
```

### Query Type 6: Hybrid Vector + Graph (High-Level Finding)

```kuzu
// Retrieve similar past decisions using vector search,
// then augment with causal context from graph

// Step 1: Vector similarity search (sqlite-vec)
SELECT id, embedding_similarity FROM decision_embeddings
WHERE vector_distance(embedding, current_decision_vector) < 0.2
ORDER BY vector_distance ASC
LIMIT 10;

// Step 2: For each similar decision, fetch causal chain (Kuzu)
FOR EACH similar_decision IN step_1:
  MATCH (similar_decision:Decision)-[causes:causes*1..3]-(root:Event)
  WHERE causes.confidence > 0.5
  RETURN root, causes
  ORDER BY causes.confidence DESC;
```

### Query Type 7: RRF Fusion (Multi-Evidence Retrieval)

```
Query: "Why did we lose the Q4 enterprise deal?"

Vector search results (ranked 1-10):
  Deal loss decision: rank 1 (semantic similarity 0.92)
  Contract negotiation event: rank 2
  Market shift signal: rank 3
  ...

Graph traversal results (ranked 1-10):
  Contract event -> causes -> deal loss: rank 1
  Customer dissatisfaction -> enables -> deal loss: rank 2
  Competitive move -> prevents -> deal success: rank 3
  ...

FTS keyword search results:
  "Q4 enterprise contract" mentions: rank 1
  ...

RRF Fusion: fused_score(item) = 1/(rank_vector+1) + 1/(rank_graph+1) + 1/(rank_fts+1)
Final ranking merges all signals → best explanation
```

---

## Part 3: Incremental Ingestion Pipeline

### Architecture

```
Data Sources:
  - Daily observations log
  - Decision records
  - Observability events
  - Calendar entries
  - External APIs
        ↓
    Ingestion Layer (real-time)
        ↓
    Entity Recognition + Deduplication
        ↓
    Relationship Extraction
        ↓
    Add to Kuzu (immediate)
        ↓
    Update sqlite-vec (batch)
        ↓
    Enrichment Tasks (async)
```

### Entity Deduplication (Critical)

```python
def deduplicate_entities(new_entity, existing_entities):
    """
    Match new entity against existing ones.
    Returns existing_id if match, else new entity.
    """
    # 1. Exact match (same name + type)
    exact_match = find_exact_match(new_entity, existing_entities)
    if exact_match:
        return exact_match.id
    
    # 2. Semantic similarity (embedding-based)
    semantic_candidates = find_semantic_similar(
        new_entity.description_embedding,
        existing_entities,
        threshold=0.85
    )
    if semantic_candidates:
        return semantic_candidates[0].id  # Highest confidence
    
    # 3. Human review (low confidence, ambiguous)
    if semantic_candidates and confidence < 0.7:
        request_human_review(new_entity, semantic_candidates)
    
    # 4. Create new entity
    return create_entity(new_entity)
```

### Event Ingestion Pattern

```python
def ingest_event(event_data):
    """
    Add event to Kuzu + update embeddings + track lineage.
    """
    # 1. Create event node
    event = Event(
        id=generate_uuid(),
        label=event_data['label'],
        timestamp=event_data['timestamp'],
        source=event_data['source'],  # Which system provided this
        confidence=event_data.get('confidence', 1.0),
        enrichment_status='pending'
    )
    db.create_node(event)
    
    # 2. Extract entities mentioned in event
    entities = extract_entities(event_data['description'])
    for entity_ref in entities:
        existing_id = deduplicate_entities(entity_ref, db.entities)
        # Link event to entity
        db.create_rel(
            "references",
            event.id,
            existing_id,
            reference_type="mentions"
        )
    
    # 3. Link to related events (temporal + semantic)
    recent_events = db.query(
        "MATCH (e:Event) WHERE e.timestamp > $cutoff",
        cutoff=event.timestamp - timedelta(days=7)
    )
    for related_event in recent_events:
        if temporal_proximity(event.timestamp, related_event.timestamp):
            db.create_rel(
                "precedes",
                related_event.id,
                event.id,
                temporal_type=classify_temporal_distance(...)
            )
    
    # 4. Schedule async enrichment
    queue_enrichment_task(
        event_id=event.id,
        task_type="extract_causal_links",
        priority="medium"
    )
    
    # 5. Log lineage
    log_lineage(
        entity_id=event.id,
        source=event_data['source'],
        ingestion_timestamp=NOW(),
        confidence=event.confidence
    )
    
    return event.id
```

### Batch Embedding Update

```python
def batch_update_embeddings():
    """
    Run daily/weekly to re-embed changed nodes.
    """
    # 1. Find nodes without embeddings or stale
    stale_nodes = db.query("""
        SELECT id, label, description
        FROM Event e
        WHERE e.embedding_timestamp IS NULL
           OR e.embedding_timestamp < DATE_SUB(NOW(), INTERVAL 7 DAY)
        LIMIT 1000
    """)
    
    # 2. Generate embeddings in batch
    embeddings = []
    for node in stale_nodes:
        text = f"{node.label} {node.description}"
        embedding = model.embed(text)  # Batch API call
        embeddings.append((node.id, embedding))
    
    # 3. Update sqlite-vec
    vec_db.insert_batch(embeddings, table='event_embeddings')
    
    # 4. Update timestamps
    db.query(f"""
        UPDATE Event SET embedding_timestamp = NOW()
        WHERE id IN {[e[0] for e in embeddings]}
    """)
    
    return len(stale_nodes)
```

---

## Part 4: Temporal Validity & Confidence Decay

### Temporal Validity Pattern

```python
def add_temporal_edge(from_node_id, to_node_id, rel_type, confidence=1.0):
    """
    Create edge with temporal validity interval.
    """
    db.create_rel(
        rel_type,
        from_node_id,
        to_node_id,
        start_time=NOW(),
        end_time=None,  # NULL = still valid
        confidence=confidence,
        confidence_decay_rate=0.01  # 1% per week
    )

def query_with_temporal_filter(query, valid_only=True):
    """
    Apply temporal validity to queries.
    """
    if valid_only:
        query += " AND rel.end_time IS NULL"
    return db.query(query)

def age_based_confidence_decay():
    """
    Reduce confidence of old causal edges weekly.
    """
    # Find old causal edges
    old_edges = db.query(f"""
        SELECT id, confidence, discovered_at, confidence_decay_rate
        FROM causes_rel
        WHERE discovered_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    """)
    
    for edge in old_edges:
        weeks_old = (NOW() - edge.discovered_at).days // 7
        new_confidence = edge.confidence * (1 - edge.confidence_decay_rate) ** weeks_old
        
        if new_confidence < 0.1:  # Mark as invalid
            db.update_rel(edge.id, end_time=NOW())
        else:
            db.update_rel(edge.id, confidence=new_confidence)
```

---

## Part 5: Observability & Lineage Tracking

### Query Performance Tracking

```python
@track_query_metrics
def execute_query(query_type, query):
    """
    Track every query for cost, latency, accuracy.
    """
    metrics = {
        'timestamp': NOW(),
        'query_type': query_type,  # 'root_cause', 'pattern_detection', etc
        'execution_time_ms': 0,
        'cost_usd': 0.0,
        'results_count': 0,
        'graph_depth': 0,
        'retrieval_strategies': [],  # ['vector', 'graph', 'fts']
        'fusion_method': None,  # 'rrf', 'union', 'sequential'
    }
    
    start = time.time()
    
    # Route based on cost optimizer
    if is_relationship_heavy_query(query):
        result = graph_search(query)
        metrics['retrieval_strategies'] = ['graph']
    elif is_similarity_query(query):
        result = vector_search(query)
        metrics['retrieval_strategies'] = ['vector']
    else:
        # Hybrid with RRF fusion
        vector_results = vector_search(query)
        graph_results = graph_search(query)
        result = rrf_fusion(vector_results, graph_results)
        metrics['retrieval_strategies'] = ['vector', 'graph']
        metrics['fusion_method'] = 'rrf'
    
    metrics['execution_time_ms'] = (time.time() - start) * 1000
    metrics['results_count'] = len(result)
    metrics['cost_usd'] = estimate_cost(metrics)
    
    # Log for analysis
    log_query_metric(metrics)
    
    return result, metrics
```

### Data Lineage Tracking

```sql
-- Every node/edge has lineage metadata
CREATE NODE TABLE LineageRecord {
    entity_id STRING,
    source_system STRING,  -- "calendar", "observability", "api", "manual"
    extraction_date TIMESTAMP,
    confidence FLOAT,
    lineage_chain LIST(STRING),  -- [source1, source2, source3]
    validation_status STRING,  -- "confirmed", "pending", "disputed"
    PRIMARY KEY (entity_id)
};

-- Query lineage
SELECT * FROM LineageRecord
WHERE entity_id = ?
  AND extraction_date > DATE_SUB(NOW(), INTERVAL 30 DAY)
ORDER BY extraction_date DESC;
```

---

## Part 6: Schema Version Management

### Version Tracking

```python
class SchemaVersion:
    def __init__(self):
        self.version = "2.0"  # Semantic versioning
        self.node_types = {
            'Event': {'fields': ['id', 'label', 'timestamp', ...], 'version': '2.0'},
            'Decision': {'fields': [...], 'version': '2.0'},
            ...
        }
        self.edge_types = {
            'causes': {'fields': ['confidence', 'causality_type', ...], 'version': '2.0'},
            ...
        }
        self.breaking_changes = []
        self.new_in_v2 = ['causal_depth', 'temporal_validity', 'enrichment_status']

def migrate_schema_v1_to_v2():
    """
    Safe migration without downtime.
    """
    # Step 1: Add new fields to existing tables (additive)
    for new_field in SchemaVersion.new_in_v2:
        db.add_column(table, new_field, default_value)
    
    # Step 2: Backfill data (async, in background)
    async def backfill():
        events = db.query("SELECT * FROM Event")
        for event in events:
            event.enrichment_status = analyze_enrichment(event)
            event.valid_from = event.timestamp
            event.valid_until = None
            db.update(event)
    
    # Step 3: Update schema version
    db.set_version("2.0")
    
    # Step 4: Keep both code paths working (v1 + v2) until cutover
    # Old code: can still query v1 fields
    # New code: uses v2 fields
```

---

## Part 7: Cost Optimization (LazyGraphRAG Pattern)

### Query-Time Subgraph Extraction

```python
def lazy_graph_rag(query_text):
    """
    Instead of pre-indexing everything, extract subgraph at query time.
    """
    # Step 1: Semantic search finds relevant nodes
    relevant_nodes = vector_search(query_text, limit=20)
    
    # Step 2: Extract subgraph around those nodes
    subgraph = extract_subgraph(
        node_ids=[n.id for n in relevant_nodes],
        depth=2,  # 2-hop neighborhood
        edge_types=['causes', 'enables', 'related_to']
    )
    # Cost: O(neighbors of relevant_nodes), not O(entire graph)
    
    # Step 3: LLM reasons over subgraph
    context = format_subgraph_for_llm(subgraph)
    answer = llm.generate(query_text, context=context)
    
    # Cost breakdown:
    #   - Vector search: ~$0.001
    #   - Subgraph extraction: O(query), ~$0
    #   - LLM generation: ~$0.005
    #   Total: ~$0.006 per query (vs $0.50 for pre-indexing)
    
    return answer
```

---

## Part 8: Recommended Implementation Order (Phases 1-4)

### Phase 0: Current (Already Done)
- [x] Kuzu with 8 node types, 16 edge types
- [x] sqlite-vec for embeddings
- [x] Basic queries (node lookup, simple traversal)

### Phase 1: Temporal + Causal (Week 1-2, Q1 2026)
- [ ] Add temporal validity fields to all nodes
- [ ] Add confidence + decay to causal edges
- [ ] Implement root cause analysis queries (Query Type 1)
- [ ] Add enrichment_status tracking
- **Metric:** Support "find root causes within X days" queries

### Phase 2: Schema Evolution (Week 3-4, Q1 2026)
- [ ] Implement schema versioning system
- [ ] Add migration tracking
- [ ] Test backward compatibility
- [ ] Document migration procedures
- **Metric:** Can add new relationship type without query breakage

### Phase 3: Incremental Ingestion (Week 1-2, Q2 2026)
- [ ] Build entity deduplication module
- [ ] Implement source + lineage tracking
- [ ] Add batch embedding updates
- [ ] Create ingestion queues + error handling
- **Metric:** New data integrated in <1s, no full rebuild required

### Phase 4: Hybrid Retrieval (Week 3-4, Q2 2026)
- [ ] Implement RRF fusion
- [ ] Build cost optimizer (choose retrieval strategy)
- [ ] Add query performance metrics tracking
- [ ] Optimize for sub-500ms latency
- **Metric:** Multi-hop queries return in <500ms with 3-5x better accuracy

---

## Performance Targets (By End of Phase 4)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Graph size | 100K nodes | 13K nodes | On track (10x growth) |
| Query latency (simple) | <100ms | <10ms | ✓ Excellent |
| Query latency (multi-hop) | <500ms | N/A | To implement |
| Indexing cost | $0 (query-time) | N/A | New approach |
| Schema versions | Unlimited (backward compat) | v1 | To implement |
| Entity dedup accuracy | >98% | ~80% (manual) | To improve |
| Temporal queries | 100% of queries | ~10% | To expand |
| Causal chain depth | 5+ hops | 1-2 hops | To expand |

---

## Code Examples: Ready-to-Implement

### Quick Start: Root Cause Query

```kuzu
// Find what caused recent failures
MATCH (failure:Event)-[causes:causes*1..5]-(root:Event)
WHERE failure.outcome_status = "failed"
  AND failure.timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND ALL(rel in causes WHERE rel.confidence > 0.5)
RETURN root.label as root_cause,
       failure.label as failure,
       length(causes) as hops,
       reduce(score = 1.0, rel in causes | score * rel.confidence) as chain_confidence
ORDER BY chain_confidence DESC
LIMIT 10;
```

### Quick Start: Pattern Detection

```kuzu
// Find repeated patterns: Signal → Decision → Success
MATCH path = (s:Signal)-[sig:enables]->(d:Decision)-[dec:causes]->(e:Event)
WHERE s.detected_at > DATE_SUB(NOW(), INTERVAL 90 DAY)
  AND e.outcome_status = "succeeded"
  AND sig.causality_confidence > 0.7
WITH s.signal_type as signal_type,
     d.description as decision,
     count(*) as pattern_count
WHERE pattern_count > 2
RETURN signal_type, decision, pattern_count
ORDER BY pattern_count DESC;
```

---

## Gotchas & Lessons Learned

### Data Quality
- **Trap:** Ingest events with manual descriptions → inconsistent semantics
- **Fix:** Normalize descriptions through LLM extraction before ingestion
- **Cost:** One-time + incremental as new data comes in

### Schema Evolution
- **Trap:** Add required field without default → old queries break
- **Fix:** All new fields must have defaults; mark as optional/extensible
- **Timeline:** Additive schema changes every sprint are fine; destructive changes require migration planning

### Temporal Reasoning
- **Trap:** Store timestamp but not "is this still true?"
- **Fix:** Use [valid_from, valid_until] intervals on all time-dependent facts
- **Decay:** Causal confidence decays with age (events drift apart)

### Entity Deduplication
- **Trap:** Manual dedup does not scale past 1K entities
- **Fix:** Automate with semantic similarity + human review for ambiguous cases
- **Accuracy:** Expect 90%+ with fallback to human review

---

## Conclusion

This implementation guide provides concrete patterns to evolve PAIOS from v1.0 (baseline) to v3.0 (production temporal knowledge graph) across Q1-Q2 2026.

**Key principles:**
- Additive schema evolution (no breaking changes)
- Temporal validity on all time-dependent facts
- Confidence + decay on causal edges
- Incremental ingestion (no full rebuilds)
- Hybrid retrieval (vector + graph + FTS)
- Cost-aware routing (query-time subgraph extraction)

Follow phases 1-4 in order; each builds on the previous.

---

**Version:** 2026-02-28-v1  
**Next Review:** 2026-05-31
