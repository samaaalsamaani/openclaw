# Graph-for-LLMs Implementation Guide

**Quick Reference for Building Graph-Augmented Retrieval Systems**

---

## 1. Quick Start: LazyGraphRAG Architecture

### Minimal Implementation (Python)

```python
from typing import List, Dict, Tuple
import numpy as np
from dataclasses import dataclass

@dataclass
class Document:
    id: str
    text: str
    chunks: List[str]

@dataclass
class Entity:
    name: str
    type: str
    doc_id: str

class LazyGraphRAG:
    def __init__(self, vector_store, llm, budget_tokens: int = 5000):
        self.vector_store = vector_store
        self.llm = llm
        self.budget_tokens = budget_tokens
        self.entities: Dict[str, Entity] = {}
        self.graph_edges: List[Tuple[str, str, str]] = []  # (entity1, relation, entity2)

    def index(self, documents: List[Document]):
        """Lightweight indexing: NLP-only extraction"""
        for doc in documents:
            # Extract entities using NLP (not LLM)
            entities = self._extract_entities_nlp(doc)

            # Build lightweight graph
            for entity in entities:
                self.entities[entity.name] = entity

            # Extract relationships (simple pattern matching)
            relations = self._extract_relations_nlp(doc)
            self.graph_edges.extend(relations)

    def query(self, query_text: str) -> str:
        """Query with lazy LLM evaluation"""
        # Step 1: Vector search for relevant chunks
        similar_chunks = self.vector_store.search(query_text, top_k=10)

        # Step 2: Extract entities from query
        query_entities = self._extract_entities_nlp(query_text)

        # Step 3: Graph traversal with LLM budget
        relevant_content = self._traverse_with_budget(
            query_entities,
            similar_chunks,
            budget_tokens=self.budget_tokens
        )

        # Step 4: Generate response
        response = self.llm.generate(
            f"Answer based on: {relevant_content}\nQuestion: {query_text}"
        )
        return response

    def _extract_entities_nlp(self, text: str) -> List[Entity]:
        """Simple NLP-based entity extraction (no LLM)"""
        # Use spaCy, flair, or simple pattern matching
        # Example: simple noun phrase extraction
        entities = []
        # ... implementation ...
        return entities

    def _extract_relations_nlp(self, doc: Document) -> List[Tuple[str, str, str]]:
        """Simple relation extraction"""
        relations = []
        # ... dependency parsing or pattern matching ...
        return relations

    def _traverse_with_budget(self, entities, chunks, budget_tokens: int) -> str:
        """Traverse graph with LLM budget constraints"""
        selected_content = []
        tokens_used = 0

        for entity in entities:
            # Get directly connected entities in graph
            neighbors = self._get_neighbors(entity.name)

            for neighbor, relation in neighbors:
                # Get relevant chunks mentioning this relationship
                relevant = [c for c in chunks if neighbor in c]

                for chunk in relevant:
                    chunk_tokens = len(chunk.split())
                    if tokens_used + chunk_tokens > budget_tokens:
                        # Budget exhausted
                        return "\n".join(selected_content)

                    # Use LLM to evaluate relevance (sparse evaluation)
                    if self._is_relevant_to_query(chunk, entity):
                        selected_content.append(chunk)
                        tokens_used += chunk_tokens

        return "\n".join(selected_content)

    def _get_neighbors(self, entity_name: str) -> List[Tuple[str, str]]:
        """Get connected entities in graph"""
        neighbors = []
        for e1, rel, e2 in self.graph_edges:
            if e1 == entity_name:
                neighbors.append((e2, rel))
            elif e2 == entity_name:
                neighbors.append((e1, rel))
        return neighbors

    def _is_relevant_to_query(self, chunk: str, entity: Entity) -> bool:
        """LLM-based relevance check (sparse evaluation)"""
        # Only evaluate when needed, not for every chunk
        relevance = self.llm.score_relevance(
            chunk, entity.name
        )
        return relevance > 0.5
```

---

## 2. HybridRAG: Parallel Vector + Graph Retrieval

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List

@dataclass
class RetrievalResult:
    content: str
    relevance_score: float
    source_type: str  # "vector" or "graph"

class HybridRetriever:
    def __init__(self, vector_retriever, graph_retriever):
        self.vector_retriever = vector_retriever
        self.graph_retriever = graph_retriever

    def retrieve(self, query: str, k: int = 5) -> List[RetrievalResult]:
        """Parallel retrieval from both paths"""
        import concurrent.futures

        results = []

        # Parallel execution
        with concurrent.futures.ThreadPoolExecutor() as executor:
            vector_future = executor.submit(
                self.vector_retriever.retrieve,
                query, k
            )
            graph_future = executor.submit(
                self.graph_retriever.retrieve,
                query, k
            )

            vector_results = vector_future.result()
            graph_results = graph_future.result()

        # Merge and deduplicate
        all_results = vector_results + graph_results
        deduplicated = self._deduplicate(all_results)

        # Rank by combined score
        ranked = sorted(
            deduplicated,
            key=lambda r: r.relevance_score,
            reverse=True
        )

        return ranked[:k]

    def _deduplicate(self, results: List[RetrievalResult]) -> List[RetrievalResult]:
        """Remove duplicate content, combine scores"""
        seen = {}

        for result in results:
            content_hash = hash(result.content[:100])  # Simple dedup

            if content_hash in seen:
                # Combine scores
                existing = seen[content_hash]
                existing.relevance_score = max(
                    existing.relevance_score,
                    result.relevance_score
                )
            else:
                seen[content_hash] = result

        return list(seen.values())
```

---

## 3. SubgraphRAG: Context-Window Optimization

```python
import numpy as np
from typing import List, Tuple, Optional

class Triplet:
    def __init__(self, subject: str, relation: str, obj: str):
        self.subject = subject
        self.relation = relation
        self.object = obj

class SubgraphExtractor:
    def __init__(self, embedding_model, llm_context_budget: int = 8000):
        self.embedding_model = embedding_model
        self.llm_context_budget = llm_context_budget
        self.triplet_scorer = TripletScorer(embedding_model)

    def extract_subgraph(
        self,
        query: str,
        graph: List[Triplet],
        model_context_window: Optional[int] = None
    ) -> List[Triplet]:
        """
        Extract subgraph optimized for LLM context window.

        Args:
            query: User query
            graph: Full knowledge graph as triplets
            model_context_window: LLM's context window (if None, uses default)

        Returns:
            Filtered triplets optimized for context window
        """

        # Calculate budget
        if model_context_window:
            query_tokens = len(query.split())
            prompt_tokens = 500  # Estimated prompt overhead
            available_tokens = model_context_window - query_tokens - prompt_tokens
        else:
            available_tokens = self.llm_context_budget

        # Estimate tokens per triplet (avg 8-12 tokens)
        tokens_per_triplet = 10
        max_triplets = available_tokens // tokens_per_triplet

        # Score all triplets
        scores = []
        for triplet in graph:
            score = self.triplet_scorer.score(query, triplet)
            scores.append((triplet, score))

        # Sort by score
        scores.sort(key=lambda x: x[1], reverse=True)

        # Select top-K
        selected = [t for t, _ in scores[:max_triplets]]

        # Remove orphaned nodes (preserve connectivity)
        selected = self._prune_orphans(selected)

        return selected

    def _prune_orphans(self, triplets: List[Triplet]) -> List[Triplet]:
        """Remove triplets with orphaned entities"""
        entities_in_use = set()
        for t in triplets:
            entities_in_use.add(t.subject)
            entities_in_use.add(t.object)

        # Keep triplets where both entities are referenced elsewhere
        filtered = []
        for t in triplets:
            s_refs = sum(1 for tr in triplets if tr.subject == t.subject or tr.object == t.subject)
            o_refs = sum(1 for tr in triplets if tr.subject == t.object or tr.object == t.object)

            # Keep if either entity has other references
            if s_refs > 1 or o_refs > 1 or len(filtered) == 0:
                filtered.append(t)

        return filtered

class TripletScorer:
    def __init__(self, embedding_model):
        self.embedding_model = embedding_model

    def score(self, query: str, triplet: Triplet) -> float:
        """Score triplet relevance to query"""

        # Component 1: Semantic similarity
        query_embedding = self.embedding_model.embed(query)
        triplet_text = f"{triplet.subject} {triplet.relation} {triplet.object}"
        triplet_embedding = self.embedding_model.embed(triplet_text)

        semantic_score = np.dot(query_embedding, triplet_embedding)

        # Component 2: Directional distance encoding (graph structure)
        # Simple heuristic: exact mention gets boost
        exact_match = 1.0 if triplet.subject in query or triplet.object in query else 0.0

        # Component 3: Relation relevance
        relation_boost = 1.0 if triplet.relation in query else 0.5

        # Combine scores
        total_score = (0.5 * semantic_score) + (0.3 * exact_match) + (0.2 * relation_boost)

        return total_score
```

---

## 4. Text-to-Cypher with Error Handling

```python
from enum import Enum
from typing import Optional

class QueryValidationError(Exception):
    pass

class TextToCypherConverter:
    def __init__(self, llm, graph_schema: Dict[str, List[str]]):
        self.llm = llm
        self.graph_schema = graph_schema  # e.g. {"Company": ["name", "founded"], "Person": ["name", "role"]}
        self.cypher_parser = CypherParser()

    def convert(self, query: str, retry_count: int = 3) -> str:
        """
        Convert natural language to Cypher with error handling.

        Args:
            query: Natural language question
            retry_count: Number of retry attempts on error

        Returns:
            Valid Cypher query

        Raises:
            QueryValidationError: If valid query cannot be generated
        """

        for attempt in range(retry_count):
            try:
                cypher = self._generate_cypher(query)
                self._validate_cypher(cypher)
                return cypher

            except QueryValidationError as e:
                if attempt < retry_count - 1:
                    # Retry with error feedback
                    query = self._refine_query(query, str(e))
                else:
                    raise

    def _generate_cypher(self, query: str) -> str:
        """Generate Cypher with schema context"""

        schema_context = self._format_schema()

        prompt = f"""You are a Neo4j Cypher expert.

Graph Schema:
{schema_context}

Examples:
Q: "List all companies founded after 2020"
A: MATCH (c:Company) WHERE c.founded > 2020 RETURN c.name

Q: "Who is the CEO of Apple?"
A: MATCH (p:Person)-[:IS_CEO_OF]->(c:Company {{name: "Apple"}}) RETURN p.name

Now convert this to Cypher:
Q: {query}
A: """

        cypher = self.llm.complete(prompt)
        return cypher.strip()

    def _validate_cypher(self, cypher: str) -> None:
        """Validate Cypher syntax without execution"""

        # Check syntax
        if not self.cypher_parser.is_valid(cypher):
            raise QueryValidationError(f"Invalid Cypher syntax: {cypher}")

        # Check schema compliance
        schema_issues = self._check_schema_compliance(cypher)
        if schema_issues:
            raise QueryValidationError(f"Schema violations: {schema_issues}")

    def _check_schema_compliance(self, cypher: str) -> List[str]:
        """Check if Cypher uses valid entities and properties"""
        issues = []

        # Parse entities from MATCH/CREATE clauses
        parsed = self.cypher_parser.parse(cypher)

        for entity_name, entity_type in parsed.entities.items():
            if entity_type not in self.graph_schema:
                issues.append(f"Unknown entity type: {entity_type}")

        return issues

    def _refine_query(self, original: str, error: str) -> str:
        """Generate refined query based on error"""
        prompt = f"""The Cypher generation failed with error: {error}

Original query: {original}

Please rephrase the original question to be more explicit about entity types and relationships."""

        refined = self.llm.complete(prompt)
        return refined

    def _format_schema(self) -> str:
        """Format schema for prompt"""
        lines = []
        for entity, properties in self.graph_schema.items():
            lines.append(f"- {entity}({', '.join(properties)})")
        return "\n".join(lines)

class CypherParser:
    """Simple Cypher parser (in production, use proper Cypher parser)"""

    def is_valid(self, cypher: str) -> bool:
        """Basic validation"""
        # Check for balanced parentheses
        if cypher.count("(") != cypher.count(")"):
            return False

        # Check for required keywords
        if not any(kw in cypher.upper() for kw in ["MATCH", "CREATE", "RETURN"]):
            return False

        return True

    def parse(self, cypher: str):
        """Parse Cypher into components"""
        # Simplified parsing
        class ParseResult:
            def __init__(self):
                self.entities = {}

        result = ParseResult()
        # ... parsing logic ...
        return result
```

---

## 5. Graph Prompting: Format Optimization

```python
from enum import Enum
from typing import Dict, Any

class GraphFormat(Enum):
    MARKDOWN = "markdown"
    JSON = "json"
    TRIPLETS = "triplets"
    NATURAL = "natural"

class GraphFormatter:
    """Format graph data for optimal LLM consumption"""

    def __init__(self, format_preference: GraphFormat = GraphFormat.MARKDOWN):
        self.format_preference = format_preference

    def format_entity(self, entity: Dict[str, Any], relationships: List[Tuple]) -> str:
        """
        Format a single entity with relationships.

        Args:
            entity: Entity attributes (id, name, type, etc.)
            relationships: List of (relation_type, target_entity) tuples

        Returns:
            Formatted string optimized for LLM consumption
        """

        if self.format_preference == GraphFormat.MARKDOWN:
            return self._format_markdown(entity, relationships)
        elif self.format_preference == GraphFormat.JSON:
            return self._format_json(entity, relationships)
        elif self.format_preference == GraphFormat.TRIPLETS:
            return self._format_triplets(entity, relationships)
        else:
            return self._format_natural(entity, relationships)

    def _format_markdown(self, entity: Dict[str, Any], relationships: List[Tuple]) -> str:
        """Markdown format (best for smaller models)"""

        lines = []
        lines.append(f"## {entity['name']}")
        lines.append(f"**Type:** {entity.get('type', 'Unknown')}")

        # Attributes
        if 'attributes' in entity:
            lines.append("\n### Attributes")
            for key, value in entity['attributes'].items():
                lines.append(f"- **{key}:** {value}")

        # Relationships
        if relationships:
            lines.append("\n### Related Entities")
            for rel_type, target in relationships:
                lines.append(f"- **{rel_type}** → {target}")

        return "\n".join(lines)

    def _format_json(self, entity: Dict[str, Any], relationships: List[Tuple]) -> str:
        """JSON format (machine-parseable)"""
        import json

        data = {
            "entity": {
                "id": entity.get('id'),
                "name": entity.get('name'),
                "type": entity.get('type'),
                "attributes": entity.get('attributes', {})
            },
            "relationships": [
                {
                    "type": rel_type,
                    "target": target
                }
                for rel_type, target in relationships
            ]
        }

        return json.dumps(data, indent=2)

    def _format_triplets(self, entity: Dict[str, Any], relationships: List[Tuple]) -> str:
        """RDF-style triplets"""

        lines = []
        entity_id = entity.get('id', entity['name'].lower().replace(" ", "_"))

        # Entity definition
        lines.append(f"{entity_id} a {entity.get('type', 'Entity')}")

        # Attributes as properties
        for key, value in entity.get('attributes', {}).items():
            lines.append(f"{entity_id} :{key} {repr(value)}")

        # Relationships
        for rel_type, target in relationships:
            lines.append(f"{entity_id} :{rel_type} {target.lower().replace(' ', '_')}")

        return " ;\n  ".join(lines) + " ."

    def _format_natural(self, entity: Dict[str, Any], relationships: List[Tuple]) -> str:
        """Natural language format"""

        text = f"{entity['name']} is a {entity.get('type', 'entity')}. "

        if 'attributes' in entity:
            attrs = [f"its {k} is {v}" for k, v in entity['attributes'].items()]
            text += "Key facts: " + ", ".join(attrs) + ". "

        if relationships:
            rels = [f"it {rel} {target}" for rel, target in relationships]
            text += "It is connected to: " + ", ".join(rels) + "."

        return text
```

---

## 6. Context Window Budget Manager

```python
from dataclasses import dataclass

@dataclass
class ContextBudget:
    total_tokens: int
    query_tokens: int
    system_tokens: int

    @property
    def available_tokens(self) -> int:
        return self.total_tokens - self.query_tokens - self.system_tokens

class BudgetManager:
    """Manage context window allocation for graph retrieval"""

    # Model context windows (tokens)
    MODEL_CONTEXTS = {
        "llama-8b": 8192,
        "mistral-7b": 32768,
        "gpt-4": 128000,
        "claude-opus": 200000,
    }

    def __init__(self, model_name: str):
        if model_name not in self.MODEL_CONTEXTS:
            raise ValueError(f"Unknown model: {model_name}")
        self.model_name = model_name
        self.context_window = self.MODEL_CONTEXTS[model_name]

    def allocate_budget(
        self,
        query: str,
        system_prompt: str = None,
        reserved_ratio: float = 0.1  # Reserve 10% for output
    ) -> ContextBudget:
        """
        Allocate context budget for graph retrieval.

        Args:
            query: User query
            system_prompt: System message (if any)
            reserved_ratio: Fraction to reserve for output

        Returns:
            ContextBudget with available tokens for graph data
        """

        query_tokens = self._count_tokens(query)
        system_tokens = self._count_tokens(system_prompt) if system_prompt else 0
        reserved = int(self.context_window * reserved_ratio)

        total_reserved = query_tokens + system_tokens + reserved
        available = self.context_window - total_reserved

        return ContextBudget(
            total_tokens=self.context_window,
            query_tokens=query_tokens,
            system_tokens=system_tokens
        )

    def estimate_triplet_capacity(self, budget: ContextBudget) -> int:
        """
        Estimate how many triplets fit in remaining budget.

        Empirically, each triplet takes ~10 tokens when formatted.
        """
        tokens_per_triplet = 10
        return budget.available_tokens // tokens_per_triplet

    def _count_tokens(self, text: str) -> int:
        """Rough token count (1 token ≈ 4 chars for English)"""
        if not text:
            return 0
        return len(text.split())  # Simple word count

class AdaptiveGraphSelector:
    """Select graph details based on context budget"""

    def __init__(self, budget_manager: BudgetManager):
        self.budget_manager = budget_manager

    def select_details(
        self,
        query: str,
        entities: List[Dict],
        relationships: List[Tuple],
        model_name: str = "gpt-4"
    ) -> Tuple[List[Dict], List[Tuple]]:
        """
        Select entities and relationships based on context budget.
        """

        budget = self.budget_manager.allocate_budget(query)
        triplet_capacity = self.budget_manager.estimate_triplet_capacity(budget)

        # Score and rank relationships by relevance
        scored_rels = [
            (rel, self._score_relevance(query, rel))
            for rel in relationships
        ]
        scored_rels.sort(key=lambda x: x[1], reverse=True)

        # Select top relationships
        selected_rels = [rel for rel, _ in scored_rels[:triplet_capacity]]

        # Identify entities referenced in selected relationships
        selected_entity_ids = set()
        for rel_type, target in selected_rels:
            selected_entity_ids.add(target)

        # Add query-relevant entities
        for entity in entities:
            if entity['name'].lower() in query.lower():
                selected_entity_ids.add(entity['id'])

        # Filter entities
        selected_entities = [
            e for e in entities if e['id'] in selected_entity_ids
        ]

        return selected_entities, selected_rels

    def _score_relevance(self, query: str, relationship: Tuple) -> float:
        """Simple relevance scoring"""
        rel_type, target = relationship

        # Mention in query = high relevance
        if rel_type.lower() in query.lower() or target.lower() in query.lower():
            return 1.0

        # Related term = medium relevance
        return 0.5
```

---

## 7. Integration Example: Complete Pipeline

```python
class GraphAugmentedRAG:
    """Complete graph-augmented retrieval pipeline"""

    def __init__(self,
                 vector_store,
                 graph_db,
                 llm,
                 model_name: str = "gpt-4"):
        self.vector_store = vector_store
        self.graph_db = graph_db
        self.llm = llm
        self.model_name = model_name

        # Components
        self.hybrid_retriever = HybridRetriever(
            vector_store.retriever(),
            graph_db.retriever()
        )
        self.subgraph_extractor = SubgraphExtractor(
            embedding_model=vector_store.embedding_model
        )
        self.budget_manager = BudgetManager(model_name)
        self.formatter = GraphFormatter()

    def retrieve_and_rank(self, query: str, k: int = 5):
        """Retrieve using hybrid approach"""
        results = self.hybrid_retriever.retrieve(query, k=k)
        return results

    def extract_relevant_subgraph(self, query: str) -> List[Triplet]:
        """Extract context-optimized subgraph"""
        full_graph = self.graph_db.get_all_triplets()
        subgraph = self.subgraph_extractor.extract_subgraph(
            query,
            full_graph,
            model_context_window=self.budget_manager.context_window
        )
        return subgraph

    def format_context(self, entities, relationships) -> str:
        """Format graph for LLM"""
        formatted_parts = []

        for entity in entities:
            entity_rels = [
                (rel, target) for rel, target in relationships
                if target == entity['name']
            ]
            formatted = self.formatter.format_entity(entity, entity_rels)
            formatted_parts.append(formatted)

        return "\n\n".join(formatted_parts)

    def answer_query(self, query: str) -> str:
        """End-to-end query answering"""

        # Step 1: Hybrid retrieval
        retrieved = self.retrieve_and_rank(query, k=5)

        # Step 2: Extract subgraph
        subgraph = self.extract_relevant_subgraph(query)

        # Step 3: Format for LLM
        graph_context = self.format_context(
            self.graph_db.get_entities(),
            subgraph
        )

        # Step 4: Generate answer
        prompt = f"""Answer the question using the provided information.

Graph Context:
{graph_context}

Retrieved Documents:
{chr(10).join([r.content for r in retrieved])}

Question: {query}

Answer:"""

        answer = self.llm.generate(prompt)
        return answer

# Usage
rag = GraphAugmentedRAG(
    vector_store=my_vector_store,
    graph_db=my_graph_db,
    llm=my_llm,
    model_name="gpt-4"
)

answer = rag.answer_query("What companies did Tim Cook work for?")
print(answer)
```

---

## 8. Testing & Evaluation

```python
from typing import List
import json

class GraphRAGEvaluator:
    """Evaluate graph-augmented retrieval quality"""

    def __init__(self, llm):
        self.llm = llm

    def evaluate_retrieval(
        self,
        query: str,
        retrieved_items: List[str],
        expected_items: List[str]
    ) -> Dict[str, float]:
        """
        Evaluate retrieval quality.

        Metrics:
        - Precision: % of retrieved items that are relevant
        - Recall: % of expected items that were retrieved
        - F1: Harmonic mean
        """

        retrieved_set = set(retrieved_items)
        expected_set = set(expected_items)

        true_positives = len(retrieved_set & expected_set)
        false_positives = len(retrieved_set - expected_set)
        false_negatives = len(expected_set - retrieved_set)

        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

        return {
            "precision": precision,
            "recall": recall,
            "f1": f1
        }

    def evaluate_answer_quality(
        self,
        query: str,
        generated_answer: str,
        reference_answer: str
    ) -> Dict[str, float]:
        """
        Evaluate answer generation quality using LLM.

        Metrics:
        - Relevance: Is answer relevant to query?
        - Completeness: Does answer address all aspects?
        - Accuracy: Is answer factually correct?
        """

        prompt = f"""Evaluate the generated answer on these criteria:
1. Relevance (0-1): How relevant is the answer to the query?
2. Completeness (0-1): Does it address all aspects of the question?
3. Accuracy (0-1): Is the answer factually correct based on the reference?

Query: {query}
Reference: {reference_answer}
Generated: {generated_answer}

Return as JSON: {{"relevance": X, "completeness": X, "accuracy": X}}"""

        scores_json = self.llm.generate(prompt)
        scores = json.loads(scores_json)

        return scores
```

---

## Key Implementation Metrics

| Component               | Typical Cost | Latency | Quality   |
| ----------------------- | ------------ | ------- | --------- |
| Vector Search           | $0.001/query | 50ms    | Good      |
| Graph Traversal         | $0.01/query  | 100ms   | Good      |
| Hybrid (Vector + Graph) | $0.012/query | 120ms   | Very Good |
| LazyGraphRAG            | $0.002/query | 150ms   | Excellent |
| Full GraphRAG           | $0.10/query  | 200ms   | Excellent |
| RAPTOR (Large docs)     | $0.015/query | 180ms   | Very Good |

---

## Troubleshooting Guide

### Problem: High latency with large graphs

**Solution:** Implement caching at multiple levels:

- Cache query results
- Cache entity embeddings
- Cache pre-computed subgraphs

### Problem: Token budget exceeded

**Solution:** Implement compression:

- Remove redundant triplets
- Summarize clusters
- Use sparse representations

### Problem: Poor answer quality

**Solution:** Improve graph construction:

- Better entity extraction
- More comprehensive relationships
- Hierarchical organization

### Problem: Text2Cypher generation fails

**Solution:** Add safety guardrails:

- Syntax validation
- Schema checking
- Human-in-the-loop for complex queries
