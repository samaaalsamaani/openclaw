# graph-context Hook

**Event:** `message:received`
**Action:** Queries Memgraph for entities related to the message content and logs context.
**Timeout:** 3000ms (latency-bounded; Memgraph may be unreachable)
**Min length:** 10 chars (short messages and slash-commands are skipped)

This hook registers the `queryGraphContext` export for use in Auto-RAG injection in `get-reply-run.ts`.
The bundled hook itself fires on `message:received` for future extensibility; graph context injection
into the agent system prompt is handled by calling `queryGraphContext` directly in `get-reply-run.ts`.
