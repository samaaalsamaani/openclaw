# Phase 23: cross-channel-memory - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Activate the memory system across all connected channels — session files from every channel feed a shared unified index, the agent retrieves context regardless of which channel it originated from, and replies include a visible attribution signal when cross-channel history was used. Per-channel memory (Phase 22) is unchanged; this phase adds cross-channel bridging on top of it.

</domain>

<decisions>
## Implementation Decisions

### Attribution signal format

- Footer note at the bottom of the reply (non-intrusive, discoverable)
- Format: channel + relative time, e.g. "— drawing on context from Telegram (3 days ago)"
- If multiple channels contributed: list all sources, e.g. "drawing on context from Telegram (3 days ago), Slack (1 week ago)"
- Attribution appears on every reply where cross-channel context was used — no suppression based on materiality

### What gets indexed

- Index all messages — both user and agent turns
- Exclude: slash commands (e.g. /help), media/file attachments. Index text content only
- No hard recency cutoff — index all sessions regardless of age; retrieval handles recency weighting
- Incremental indexing: only process new or changed session files. Full rebuild available as fallback

### Context injection scope

- Top-N chunks ranked by relevance score, capped at a token budget (e.g. 1000 tokens / 3-5 chunks)
- Labeled in the prompt with source channel + relative time: "[From Telegram, 3 days ago]: ..."
- Only inject when relevance score exceeds a threshold — don't pollute prompt with low-relevance noise
- Cross-channel context comes from OTHER channels only; same-channel history is handled by Phase 22's per-channel memory

### Index update behavior

- Channel added: index its sessions on next background indexer run (non-blocking)
- Channel removed: purge its entries from the shared index on next indexer run
- Indexer cadence: periodic, every ~5 minutes
- Observability: emit events to the existing observability system (obs_emit); no new UI needed

### Claude's Discretion

- Exact token budget number and N for top-N retrieval
- Relevance threshold value
- Internal storage format for the shared index (embedding store, vector DB, etc.)
- How the indexer tracks what's already been processed (manifest file, DB table, etc.)
- Exact prompt injection structure (system message section vs inline)

</decisions>

<specifics>
## Specific Ideas

- No specific references — open to standard approaches consistent with Phase 22's memory architecture

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 23-cross-channel-memory_
_Context gathered: 2026-03-02_
