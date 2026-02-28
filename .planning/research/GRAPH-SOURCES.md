# Complete Sources: Graph Structuring for LLM Consumption

**Research conducted February 28, 2026**

---

## Core Academic Papers

### 1. Graph-RAG: Hierarchical Approach

- **Title:** From Local to Global: A Graph RAG Approach to Query-Focused Summarization
- **Link:** [https://arxiv.org/abs/2404.16130](https://arxiv.org/abs/2404.16130)
- **Date:** April 2024
- **Authors:** Microsoft Research
- **Key Contribution:** Hierarchical community summaries with Leiden clustering
- **Performance:** 70-80% win rate on comprehensiveness vs. naive RAG

### 2. RAPTOR: Tree-Based Retrieval

- **Title:** RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval
- **Link:** [https://arxiv.org/abs/2401.18059](https://arxiv.org/abs/2401.18059)
- **Date:** January 2024 (ICLR 2024 Conference)
- **Authors:** Parth Sarthi, Salman Abdullah, Aditi Tuli, Shubh Khanna, Anna Goldie, Christopher D. Manning
- **Key Contribution:** Recursive clustering and summarization for long documents
- **Performance:** +20% accuracy on QuALITY benchmark with GPT-4

### 3. HybridRAG: Vector + Graph Fusion

- **Title:** HybridRAG: Integrating Knowledge Graphs and Vector Retrieval Augmented Generation for Efficient Information Extraction
- **Link:** [https://arxiv.org/abs/2408.04948](https://arxiv.org/abs/2408.04948)
- **Date:** August 2024
- **Key Contribution:** Parallel retrieval combining semantic and structural relevance
- **Performance:** Outperforms GraphRAG and VectorRAG individually

### 4. SubgraphRAG: Context-Window Optimization

- **Title:** Simple Is Effective: The Roles of Graphs and Large Language Models in Knowledge-Graph-Based Retrieval-Augmented Generation
- **Link:** [https://arxiv.org/abs/2410.20724](https://arxiv.org/abs/2410.20724)
- **Date:** October 2024
- **Key Contribution:** Variable-sized subgraph extraction with context window awareness
- **Performance:** Works with models from 8B to 175B parameters

### 5. Multi-Hop Reasoning with Graphs

- **Title:** LLM-Based Multi-Hop Question Answering with Knowledge Graph Integration in Evolving Environments
- **Link:** [https://aclanthology.org/2024.findings-emnlp.844/](https://aclanthology.org/2024.findings-emnlp.844/)
- **Date:** EMNLP 2024 (September 2024)
- **Key Contribution:** GMeLLo (Graph Memory Editing) for dynamic knowledge graphs
- **Performance:** 40% improvement on MQuAKE benchmark

### 6. Auto-Cypher: Text-to-Query Generation

- **Title:** Auto-Cypher: Improving LLMs on Cypher generation via LLM-supervised generation-verification framework
- **Link:** [https://arxiv.org/abs/2412.12612](https://arxiv.org/abs/2412.12612)
- **Date:** December 2024
- **Key Contribution:** Synthetic data generation for Text-to-Cypher training
- **Performance:** 40% improvement on Text2Cypher test split

### 7. Prompt Formatting Impact

- **Title:** Does Prompt Formatting Have Any Impact on LLM Performance?
- **Link:** [https://arxiv.org/abs/2411.10541](https://arxiv.org/abs/2411.10541)
- **Date:** November 2024
- **Key Contribution:** Empirical evaluation of format sensitivity
- **Finding:** 40% variance for GPT-3.5, 3% for GPT-4 across different formats

### 8. Content-Format Integrated Optimization

- **Title:** Beyond Prompt Content: Enhancing LLM Performance via Content-Format Integrated Prompt Optimization
- **Link:** [https://arxiv.org/abs/2502.04295](https://arxiv.org/abs/2502.04295)
- **Date:** February 2025
- **Key Contribution:** Joint optimization of content and formatting
- **Performance:** Up to 30% improvement through format alone

### 9. LLM-Empowered KG Construction Survey

- **Title:** LLM-empowered knowledge graph construction: A survey
- **Link:** [https://arxiv.org/abs/2510.20345](https://arxiv.org/abs/2510.20345)
- **Date:** October 2024 (preprint)
- **Scope:** Comprehensive survey of LLM-KG integration approaches

### 10. Knowledge Graphs and LLMs Relationship

- **Title:** Knowledge Graphs and Their Reciprocal Relationship with Large Language Models
- **Link:** [https://www.mdpi.com/2504-4990/7/2/38](https://www.mdpi.com/2504-4990/7/2/38)
- **Date:** 2025
- **Journal:** MDPI
- **Scope:** Bidirectional relationship between KGs and LLMs

### 11. Neo4j Text2Cypher Dataset

- **Title:** Benchmarking Using the Neo4j Text2Cypher (2024) Dataset
- **Link:** [https://neo4j.com/blog/developer/benchmarking-neo4j-text2cypher-dataset/](https://neo4j.com/blog/developer/benchmarking-neo4j-text2cypher-dataset/)
- **Date:** 2024
- **Contribution:** 44,387-instance benchmark for Cypher generation
- **Domain:** Neo4j Graph Database

---

## Industry Blog Posts & Official Documentation

### Microsoft Research Publications

#### 1. Graph-RAG Introduction

- **Title:** GraphRAG: New tool for complex data discovery now on GitHub
- **Link:** [https://www.microsoft.com/en-us/research/blog/graphrag-new-tool-for-complex-data-discovery-now-on-github/](https://www.microsoft.com/en-us/research/blog/graphrag-new-tool-for-complex-data-discovery-now-on-github/)
- **Date:** April 2024
- **Contribution:** Official announcement and methodology overview

#### 2. LazyGraphRAG

- **Title:** LazyGraphRAG: Setting a new standard for quality and cost
- **Link:** [https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/](https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/)
- **Date:** November 2024
- **Key Finding:** 99% cost reduction with comparable quality

#### 3. Dynamic Community Selection

- **Title:** GraphRAG: Improving global search via dynamic community selection
- **Link:** [https://www.microsoft.com/en-us/research/blog/graphrag-improving-global-search-via-dynamic-community-selection/](https://www.microsoft.com/en-us/research/blog/graphrag-improving-global-search-via-dynamic-community-selection/)
- **Date:** November 2024
- **Contribution:** Community detection optimization techniques

### GraphRAG Official Documentation

- **Main Site:** [https://microsoft.github.io/graphrag/](https://microsoft.github.io/graphrag/)
- **GitHub:** Graph-RAG open source implementation
- **Config Reference:** [https://graphrag.com/reference/graphrag/](https://graphrag.com/reference/graphrag/)
- **Text2Cypher Module:** [https://graphrag.com/reference/graphrag/text2cypher/](https://graphrag.com/reference/graphrag/text2cypher/)
- **Community Summary Retriever:** [https://graphrag.com/reference/graphrag/global-community-summary-retriever/](https://graphrag.com/reference/graphrag/global-community-summary-retriever/)

### LlamaIndex Documentation & Blogs

#### 1. Knowledge Graph Modules

- **Title:** Knowledge Graph Query Engine
- **Link:** [https://docs.llamaindex.ai/en/stable/examples/query_engine/knowledge_graph_query_engine/](https://docs.llamaindex.ai/en/stable/examples/query_engine/knowledge_graph_query_engine/)
- **Scope:** Complete documentation for KG query engines

#### 2. Property Graph Index

- **Title:** Introducing the Property Graph Index: A Powerful New Way to Build Knowledge Graphs with LLMs
- **Link:** [https://www.llamaindex.ai/blog/introducing-the-property-graph-index-a-powerful-new-way-to-build-knowledge-graphs-with-llms](https://www.llamaindex.ai/blog/introducing-the-property-graph-index-a-powerful-new-way-to-build-knowledge-graphs-with-llms)
- **Date:** 2024
- **Feature:** Flexible property graph construction

#### 3. KG Agents with Workflows

- **Title:** Building knowledge graph agents with LlamaIndex Workflows
- **Link:** [https://www.llamaindex.ai/blog/building-knowledge-graph-agents-with-llamaindex-workflows](https://www.llamaindex.ai/blog/building-knowledge-graph-agents-with-llamaindex-workflows)
- **Date:** 2024
- **Pattern:** Event-driven multi-step KG agents

#### 4. Knowledge Graph Guide with Memgraph

- **Title:** Knowledge Graph Guide: Build With Memgraph
- **Link:** [https://www.llamaindex.ai/blog/constructing-a-knowledge-graph-with-llamaindex-and-memgraph](https://www.llamaindex.ai/blog/constructing-a-knowledge-graph-with-llamaindex-and-memgraph)
- **Date:** 2024
- **Database:** Memgraph integration

### OpenAI Cookbook & Developer Resources

#### 1. RAG with Graph Databases

- **Title:** RAG with a Graph database
- **Link:** [https://cookbook.openai.com/examples/rag_with_graph_db](https://cookbook.openai.com/examples/rag_with_graph_db)
- **Platform:** OpenAI Cookbook
- **Model:** GPT-4 and other OpenAI models

#### 2. Temporal Agents with Knowledge Graphs

- **Title:** Temporal Agents with Knowledge Graphs
- **Link:** [https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents/](https://developers.openai.com/cookbook/examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents/)
- **Date:** 2024
- **Feature:** Time-aware reasoning over graphs

#### 3. Structured Outputs

- **Title:** Structured model outputs
- **Link:** [https://platform.openai.com/docs/guides/structured-outputs](https://platform.openai.com/docs/guides/structured-outputs)
- **Relevance:** JSON schema support for graph extraction

### LangChain Integration Guides

#### 1. Graph RAG Integration

- **Title:** Graph RAG integration
- **Link:** [https://docs.langchain.com/oss/python/integrations/retrievers/graph_rag](https://docs.langchain.com/oss/python/integrations/retrievers/graph_rag)
- **Documentation:** Official LangChain docs

#### 2. Knowledge Graph RAG Applications

- **Title:** Enhancing RAG-based application accuracy by constructing and leveraging knowledge graphs
- **Link:** [https://blog.langchain.com/enhancing-rag-based-applications-accuracy-by-constructing-and-leveraging-knowledge-graphs/](https://blog.langchain.com/enhancing-rag-based-applications-accuracy-by-constructing-and-leveraging-knowledge-graphs/)
- **Date:** 2024

#### 3. DevOps RAG with Knowledge Graphs

- **Title:** Using a Knowledge Graph to implement a DevOps RAG application
- **Link:** [https://blog.langchain.com/using-a-knowledge-graph-to-implement-a-devops-rag-application/](https://blog.langchain.com/using-a-knowledge-graph-to-implement-a-devops-rag-application/)
- **Date:** 2024
- **Use Case:** Domain-specific RAG implementation

#### 4. Neo4j Integration

- **Title:** LangChain Neo4j Integration
- **Link:** [https://neo4j.com/labs/genai-ecosystem/langchain/](https://neo4j.com/labs/genai-ecosystem/langchain/)
- **Database:** Neo4j integration guide

### Neo4j Graph Database Resources

#### 1. Knowledge Graph Extraction Challenges

- **Title:** Knowledge Graph Extraction and Challenges
- **Link:** [https://neo4j.com/blog/developer/knowledge-graph-extraction-challenges/](https://neo4j.com/blog/developer/knowledge-graph-extraction-challenges/)
- **Date:** 2024

#### 2. Multi-Hop Reasoning with KGs

- **Title:** How to Improve Multi-Hop Reasoning With Knowledge Graphs and LLMs
- **Link:** [https://neo4j.com/blog/genai/knowledge-graph-llm-multi-hop-reasoning/](https://neo4j.com/blog/genai/knowledge-graph-llm-multi-hop-reasoning/)
- **Date:** 2024

### Memgraph Blog Posts

- **Title:** HybridRAG and Why Combine Vector Embeddings with Knowledge Graphs for RAG?
- **Link:** [https://memgraph.com/blog/why-hybridrag](https://memgraph.com/blog/why-hybridrag)
- **Date:** 2024
- **Topic:** Hybrid retrieval approach

### Anthropic Research & Techniques

#### 1. Contextual Retrieval

- **Technique:** Contextual Retrieval for improving chunk embeddings
- **Date:** 2024
- **Contribution:** Adding document-level context to chunk representations

#### 2. LLM Interpretability - Attribution Graphs

- **Title:** On the Biology of a Large Language Model
- **Link:** [https://transformer-circuits.pub/2025/attribution-graphs/biology.html](https://transformer-circuits.pub/2025/attribution-graphs/biology.html)
- **Date:** 2025
- **Topic:** Internal reasoning structure of LLMs

---

## Vector Database & Retrieval Research

### 1. Chunking Strategies Overview

- **Title:** Chunking Strategies for LLM Applications
- **Link:** [https://www.pinecone.io/learn/chunking-strategies/](https://www.pinecone.io/learn/chunking-strategies/)
- **Platform:** Pinecone
- **Date:** 2024
- **Scope:** Comprehensive chunking patterns

### 2. Best Chunking Strategies for RAG

- **Title:** Best Chunking Strategies for RAG in 2025
- **Link:** [https://www.firecrawl.dev/blog/best-chunking-strategies-rag](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
- **Platform:** Firecrawl
- **Date:** 2025

### 3. Weaviate Chunking Strategies

- **Title:** Chunking Strategies to Improve LLM RAG Pipeline Performance
- **Link:** [https://weaviate.io/blog/chunking-strategies-for-rag](https://weaviate.io/blog/chunking-strategies-for-rag)
- **Platform:** Weaviate
- **Date:** 2024

### 4. Prompt Compression for RAG

- **Title:** Prompt Compression Techniques: Reducing Context Window Costs While Improving LLM Performance
- **Link:** [https://medium.com/@kuldeep.paul08/prompt-compression-techniques-reducing-context-window-costs-while-improving-llm-performance-afec1e8f1000](https://medium.com/@kuldeep.paul08/prompt-compression-techniques-reducing-context-window-costs-while-improving-llm-performance-afec1e8f1000)
- **Author:** Kuldeep Paul
- **Platform:** Medium
- **Date:** 2024

### 5. Vector Database Market Analysis

- **Title:** Vector Databases Guide: RAG Applications 2025
- **Link:** [https://dev.to/klement_gunndu_e16216829c/vector-databases-guide-rag-applications-2025-55oj](https://dev.to/klement_gunndu_e16216829c/vector-databases-guide-rag-applications-2025-55oj)
- **Platform:** DEV Community
- **Date:** 2025

### 6. Hybrid Search with Vector Databases

- **Title:** Understanding hybrid search RAG for better AI answers
- **Link:** [https://www.meilisearch.com/blog/hybrid-search-rag](https://www.meilisearch.com/blog/hybrid-search-rag)
- **Platform:** Meilisearch
- **Date:** 2024

### 7. Google Vertex AI Hybrid Search

- **Title:** About hybrid search
- **Link:** [https://docs.cloud.google.com/vertex-ai/docs/vector-search/about-hybrid-search](https://docs.cloud.google.com/vertex-ai/docs/vector-search/about-hybrid-search)
- **Platform:** Google Cloud
- **Documentation:** Official docs

---

## Supporting Papers & Research

### 1. LLM-KG Construction Survey

- **Repository:** [GitHub - KG-LLM-Papers](https://github.com/zjukg/KG-LLM-Papers)
- **Scope:** Comprehensive paper list on KG-LLM integration

### 2. GraphRAG Awesome List

- **Repository:** [GitHub - Awesome-GraphRAG](https://github.com/DEEP-PolyU/Awesome-GraphRAG)
- **Scope:** Curated list of GraphRAG resources, papers, and benchmarks

### 3. Graph Retrieval Augmented Generation Survey

- **Title:** Graph Retrieval-Augmented Generation: A Survey
- **Link:** [https://arxiv.org/abs/2408.08921](https://arxiv.org/abs/2408.08921)
- **Date:** August 2024
- **Scope:** Comprehensive survey of graph-based RAG approaches

### 4. Entity Alignment in Knowledge Graphs

- **Title:** A survey: knowledge graph entity alignment research based on graph embedding
- **Link:** [https://link.springer.com/article/10.1007/s10462-024-10866-4](https://link.springer.com/article/10.1007/s10462-024-10866-4)
- **Journal:** Artificial Intelligence Review
- **Date:** 2024

### 5. KG Extraction and Learning

- **Title:** Knowledge Graph Construction: Extraction, Learning, and Evaluation
- **Link:** [https://www.mdpi.com/2076-3417/15/7/3727](https://www.mdpi.com/2076-3417/15/7/3727)
- **Journal:** Applied Sciences
- **Date:** 2024

### 6. Efficient KG Construction and Retrieval

- **Title:** Efficient Knowledge Graph Construction and Retrieval from Unstructured Text for Large-Scale RAG Systems
- **Link:** [https://arxiv.org/abs/2507.03226](https://arxiv.org/abs/2507.03226)
- **Date:** July 2025

---

## Benchmarks & Datasets

### 1. QuALITY Benchmark

- **Benchmark:** QuALITY (QUestion Answering on Long-context Information)
- **Use Case:** Complex reasoning with long documents
- **RAPTOR Results:** +20% accuracy with GPT-4

### 2. MQuAKE Benchmark

- **Benchmark:** MQuAKE (Multi-hop QA in Knowledge Environments)
- **Use Case:** Multi-hop question answering
- **GMeLLo Results:** 40% improvement

### 3. Text2Cypher Dataset

- **Title:** Neo4j Text2Cypher Dataset
- **Size:** 44,387 instances
- **Domains:** Multiple (finance, healthcare, etc.)
- **Purpose:** Text-to-graph-query training

### 4. SPIDER Benchmark

- **Benchmark:** SPIDER (Semantic Parsing in Database Environments)
- **Adaptation:** Graph-SQL variant
- **Auto-Cypher Results:** 30% improvement

---

## Conferences & Workshops

### 1. ICLR 2024

- **Venue:** International Conference on Learning Representations
- **Key Papers:** RAPTOR
- **Date:** May 2024
- **Location:** Vienna

### 2. EMNLP 2024

- **Venue:** Conference on Empirical Methods in Natural Language Processing
- **Key Papers:** Multi-Hop QA with KGs, Graph Memory Editing
- **Date:** September-November 2024
- **Location:** Miami

### 3. ACL 2024

- **Venue:** Annual Meeting of the Association for Computational Linguistics
- **Scope:** Natural language processing and knowledge graphs
- **Date:** August 2024
- **Location:** Bangkok

### 4. LLM-TEXT2KG 2025

- **Workshop:** LLM-Integrated Knowledge Graph Generation from Text
- **Venue:** International workshop
- **Link:** [https://aiisc.ai/text2kg2025/](https://aiisc.ai/text2kg2025/)
- **Frequency:** Annual

---

## Implementation Frameworks

### Open Source Projects

#### 1. GraphRAG

- **Repository:** [https://github.com/microsoft/graphrag](https://github.com/microsoft/graphrag)
- **Language:** Python
- **License:** MIT
- **Status:** Production-ready
- **Owner:** Microsoft Research

#### 2. RAPTOR

- **Repository:** [https://github.com/parthsarthi03/raptor](https://github.com/parthsarthi03/raptor)
- **Language:** Python
- **Implementation:** Official RAPTOR code
- **Status:** Research implementation

#### 3. LlamaIndex

- **Repository:** [https://github.com/run-llm/llama_index](https://github.com/run-llm/llama_index)
- **Language:** Python
- **Module:** Knowledge graph modules
- **Status:** Production-ready
- **Maintainer:** LlamaIndex

#### 4. LangChain

- **Repository:** [https://github.com/langchain-ai/langchain](https://github.com/langchain-ai/langchain)
- **Language:** Python/TypeScript
- **Module:** Graph retrieval integrations
- **Status:** Production-ready
- **Maintainer:** LangChain

#### 5. Graphiti

- **Repository:** [https://github.com/getzep/graphiti](https://github.com/getzep/graphiti)
- **Language:** Python
- **Purpose:** Real-time knowledge graphs for AI agents
- **Status:** Active development

---

## Related Research Topics

### 1. Long-Context Modeling

- **Scope:** Handling extended context windows in LLMs
- **Repository:** [https://github.com/Xnhyacinth/Awesome-LLM-Long-Context-Modeling](https://github.com/Xnhyacinth/Awesome-LLM-Long-Context-Modeling)
- **Papers:** Must-read collection on long-context approaches

### 2. Earthquake Emergency Support with KGs

- **Title:** From knowledge graph construction to retrieval-augmented generation: a framework for comprehensive earthquake emergency support
- **Link:** [https://www.tandfonline.com/doi/full/10.1080/10095020.2025.2514813](https://www.tandfonline.com/doi/full/10.1080/10095020.2025.2514813)
- **Journal:** International Journal of Geographical Information Science
- **Date:** 2025
- **Application:** Domain-specific KG + RAG

### 3. Manufacturing Domain GraphRAG

- **Title:** Document GraphRAG: Knowledge Graph Enhanced Retrieval Augmented Generation for Document Question Answering Within the Manufacturing Domain
- **Link:** [https://www.mdpi.com/2079-9292/14/11/2102](https://www.mdpi.com/2079-9292/14/11/2102)
- **Journal:** Electronics
- **Date:** 2024
- **Application:** Industry-specific implementation

### 4. Causal Graphs for RAG

- **Title:** CausalRAG: Integrating Causal Graphs into Retrieval-Augmented Generation
- **Link:** [https://arxiv.org/abs/2503.19878](https://arxiv.org/abs/2503.19878)
- **Date:** March 2025 (preprint)
- **Innovation:** Causal reasoning in RAG systems

---

## Tools & Platforms Mentioned

### Vector Stores

- Pinecone: [https://www.pinecone.io/](https://www.pinecone.io/)
- Weaviate: [https://weaviate.io/](https://weaviate.io/)
- Meilisearch: [https://www.meilisearch.com/](https://www.meilisearch.com/)
- Chroma: Vector database
- AstraDB: Vector database

### Graph Databases

- Neo4j: [https://neo4j.com/](https://neo4j.com/)
- Memgraph: [https://memgraph.com/](https://memgraph.com/)
- Amazon Neptune: Managed graph database
- Falci: Graph platform

### LLM Platforms

- OpenAI: [https://openai.com/api/](https://openai.com/api/)
- Anthropic: [https://www.anthropic.com/](https://www.anthropic.com/)
- Google Vertex AI: [https://cloud.google.com/vertex-ai](https://cloud.google.com/vertex-ai)
- Azure OpenAI: Microsoft-hosted

---

## Secondary Sources & Articles

### 1. SOTAAZ Blog

- **Title:** GraphRAG: Microsoft's Global-Local Dual Search Strategy
- **Link:** [https://blog.sotaaz.com/post/graphrag-microsoft-en](https://blog.sotaaz.com/post/graphrag-microsoft-en)
- **Date:** 2024

### 2. Data Nucleus

- **Title:** RAG in 2025: The enterprise guide to retrieval augmented generation
- **Link:** [https://datanucleus.dev/rag-and-agentic-ai/what-is-rag-enterprise-guide-2025](https://datanucleus.dev/rag-and-agentic-ai/what-is-rag-enterprise-guide-2025)
- **Date:** 2025

### 3. Medium Articles

- Prompt compression techniques
- LLM chunking strategies
- Graph construction with OpenAI functions
- Building GraphRAG with LangChain

### 4. Technical Blogs

- Towards Data Science
- Analytics Vidhya
- GeeksforGeeks

---

## Citation Notes

All sources were accessed February 28, 2026. For the most current information, consult:

- arxiv.org (preprints)
- Conference proceedings (ICLR, EMNLP, ACL)
- Official project documentation (GraphRAG, LlamaIndex, LangChain)
- Industry blogs (Microsoft Research, OpenAI, Google, Anthropic)

---

**End of Sources Document**
