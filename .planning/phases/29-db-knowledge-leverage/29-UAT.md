---
status: complete
phase: 29-db-knowledge-leverage
source: [29-01-SUMMARY.md, 29-02-SUMMARY.md, 29-03-SUMMARY.md]
started: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Hybrid KB Search — Vector + FTS Active

expected: When the embedding server is running (http://127.0.0.1:11435), KB queries use hybrid vector+FTS scoring. Send a message to the agent and check that KB context is injected (or check logs). The response should reflect semantic understanding beyond just keyword matches — try a question whose answer is related by meaning but not exact words.
result: pass

### 2. KB Search — FTS-Only Fallback

expected: When the embedding server is NOT running, KB search still works and returns results (falls back to FTS-only). Send a message to the agent while embedding server is down — the reply should still arrive and show KB-informed context, just without semantic vector ranking.
result: pass

### 3. Graph Context in Agent System Prompt

expected: For any non-trivial inbound message (>=10 chars, not a slash command), the agent's system prompt includes a graph context section with relevant entities/decisions from Memgraph. You can verify by checking gateway logs or asking the agent something related to a known graph entity — the agent should reference it without being told.
result: pass

### 4. Graph Context — Short Message Skip

expected: Messages shorter than 10 characters or starting with "/" are silently skipped for graph context injection. Send a slash command (e.g., "/help") or a very short message — graph context query should NOT fire (no Memgraph query in logs, faster response).
result: pass

### 5. Graph Context — Memgraph Unavailable Fallback

expected: If Memgraph is not running (stop it or point to wrong port), the agent still replies normally. The graph context returns "" silently and the reply proceeds — no error shown to user, no timeout hanging the response beyond 3 seconds.
result: pass

### 6. graph_trace Tool — Causal Chain Traversal

expected: In an agent session, the graph_trace MCP tool is available. Ask the agent to trace why something happened (a known entity in the graph). The agent should use graph_trace and return a causal chain showing CAUSED_BY/LED_TO/SUPPORTS relationships from Memgraph.
result: issue
reported: "Agent says there's no graph_trace tool. Root cause found: mcp-server.js line 767 uses neo4j.auth.none() which was removed in neo4j-driver v6 — same bug fixed in 29-02 handler.ts but not applied to KB MCP server."
severity: major

### 7. graph-intelligence MCP — Available in Agent Sessions

expected: Agent sessions now include the graph-intelligence stdio MCP server (when ~/.openclaw/projects/graph/mcp-server.js exists). The agent should have access to Memgraph tools. You can verify by asking the agent what tools it has, or by checking that it can answer a question requiring graph traversal.
result: pass
notes: Gateway agent correctly doesn't list it (uses different MCP path). ~/.openclaw/projects/graph/mcp-server.js confirmed present. Entry verified in buildSdkMcpServers() with fs.existsSync guard. SDK agents (Claude Code, Codex, Gemini) receive the server.

### 8. graph-intelligence MCP — Graceful Degradation When Missing

expected: On a machine where ~/.openclaw/projects/graph/mcp-server.js does NOT exist, agent sessions start normally without error. The graph-intelligence entry is simply absent — no crash, no error log, agents function fully with the remaining MCP servers.
result: pass
notes: 2 MCP errors at session start are from task-router and session-analytics — stale .mcp.json entries pointing to non-existent files (pre-existing, unrelated to Phase 29). graph-intelligence graceful degradation confirmed via fs.existsSync guard in code + unit tests.

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "graph_trace tool traverses CAUSED_BY/LED_TO/SUPPORTS edges and returns causal chain from Memgraph"
  status: failed
  reason: "User reported: agent says there's no graph_trace tool — cannot invoke it"
  severity: major
  test: 6
  root_cause: "~/.openclaw/projects/knowledge-base/mcp-server.js line 767 uses neo4j.auth.none() which was removed in neo4j-driver v6. Tool throws on every call. Same bug was fixed in handler.ts (29-02) but not propagated to KB MCP server."
  artifacts:
  - path: "~/.openclaw/projects/knowledge-base/mcp-server.js"
    issue: "neo4j.auth.none() on line 767 — must be neo4j.auth.basic('','')"
    missing:
  - "Change neo4j.auth.none() to neo4j.auth.basic('','') in graph_trace handler"
    debug_session: ""
