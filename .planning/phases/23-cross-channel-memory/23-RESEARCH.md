# Phase 23: cross-channel-memory - Research

**Researched:** 2026-03-02
**Domain:** Memory indexing, context injection, session file architecture
**Confidence:** HIGH — all findings are from direct codebase inspection

## Summary

Phase 23 activates cross-channel memory by (1) building a unified index that ingests session files from every connected channel, (2) injecting retrieved cross-channel context into the agent reply pipeline at search time, and (3) appending a footer attribution signal when cross-channel history was used.

The codebase already has a mature, well-abstracted memory subsystem in `src/memory/`. The `MemoryIndexManager` class is scoped per-agent (`agentId`) and per-workspace-directory. Sessions are stored under `~/.openclaw/agents/<agentId>/sessions/*.jsonl`. Each session key encodes the originating channel as its third colon-segment (e.g. `agent:main:telegram:direct:123` or `agent:main:discord:channel:456`). The primary gap is that the existing memory system only indexes sessions for the same `agentId` as the manager it was created for — it has no concept of "sessions from all channels."

Cross-channel indexing does NOT require a new database or a new embedding provider. The shared index is simply a new `MemoryIndexManager`-equivalent that is scoped to `ALL` session files for an agent, across all channels, rather than just the current-channel-specific subset. Because all session files for a given agent already live in the same directory (`~/.openclaw/agents/<agentId>/sessions/`), the indexer just needs to read that directory without filtering by channel. The channel attribution metadata (for the reply footer and prompt labeling) is derived from the session filename / session key embedded in the JSONL content.

**Primary recommendation:** Implement 23-01 as a `CrossChannelMemoryIndexer` that runs periodically, reads all session files for all configured agents, and stores them with a `channel` metadata column in a shared SQLite index (separate from the per-workspace memory DB). Implement 23-02 as a search function that queries this shared index and injects results as a labeled block into `extraSystemPrompt` in `get-reply-run.ts`. Implement 23-03 as a footer appended to the reply text when the context was used.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Attribution signal format

- Footer note at the bottom of the reply (non-intrusive, discoverable)
- Format: channel + relative time, e.g. "— drawing on context from Telegram (3 days ago)"
- If multiple channels contributed: list all sources, e.g. "drawing on context from Telegram (3 days ago), Slack (1 week ago)"
- Attribution appears on every reply where cross-channel context was used — no suppression based on materiality

#### What gets indexed

- Index all messages — both user and agent turns
- Exclude: slash commands (e.g. /help), media/file attachments. Index text content only
- No hard recency cutoff — index all sessions regardless of age; retrieval handles recency weighting
- Incremental indexing: only process new or changed session files. Full rebuild available as fallback

#### Context injection scope

- Top-N chunks ranked by relevance score, capped at a token budget (e.g. 1000 tokens / 3-5 chunks)
- Labeled in the prompt with source channel + relative time: "[From Telegram, 3 days ago]: ..."
- Only inject when relevance score exceeds a threshold — don't pollute prompt with low-relevance noise
- Cross-channel context comes from OTHER channels only; same-channel history is handled by Phase 22's per-channel memory

#### Index update behavior

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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                                                                   | Research Support                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MEM-01 | Session files from all connected channels feed a shared cross-channel memory index                                            | `listSessionFilesForAgent(agentId)` in `src/memory/session-files.ts` reads all JSONL files in a single agent's sessions dir. All channels for a single agent write to the same dir. A new `CrossChannelIndexer` calls this function for each configured `agentId` and tracks processed files in a manifest table.                   |
| MEM-02 | When a user asks a question on any channel, the agent retrieves relevant context from all channels (not just the current one) | The shared index (separate SQLite DB) is searched using the existing `MemorySearchManager` interface. Results from the CURRENT channel's session key prefix are excluded before injection. The session key encodes the channel token: `agent:main:<channel>:...`.                                                                   |
| MEM-03 | Replies include a visible signal when the AI is drawing on cross-channel history                                              | A footer attribution string is appended to the reply text after the agent returns. The channel name is decoded from the session key prefix in the retrieved chunk's path. Relative time is computed from file `mtime`.                                                                                                              |
| MEM-04 | Cross-channel context injection adds no more than 500ms to median response latency                                            | Search is async and non-blocking. Token budget (1000 tokens / ~3-5 chunks) caps result size. The shared index is queried in parallel with the agent run start, not in the critical reply path. A `Promise.race` with a 400ms timeout drops the context silently on slow machines.                                                   |
| MEM-05 | Memory index stays consistent when channels are added or removed                                                              | The periodic indexer (every 5 min) walks the session files directory. New channel sessions appear naturally. Removed channels: their session files are gone, so the indexer purges those paths from the `files` and `chunks` tables — the same stale-path cleanup pattern already in `syncSessionFiles()` in `manager-sync-ops.ts`. |

</phase_requirements>

## Standard Stack

### Core (already in codebase — no new dependencies)

| Component                           | Location                            | Purpose                                                    | Why Standard                                                                      |
| ----------------------------------- | ----------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `MemoryIndexManager`                | `src/memory/manager.ts`             | SQLite-backed embedding + FTS index                        | Already battle-tested; provides `search()`, incremental sync, vector + FTS hybrid |
| `buildSessionEntry`                 | `src/memory/session-files.ts`       | Parses JSONL session files into indexable text             | Handles slash-command exclusion, redaction, user/assistant turn extraction        |
| `listSessionFilesForAgent`          | `src/memory/session-files.ts`       | Lists all JSONL files for an agent                         | Single source of truth for session file enumeration                               |
| `resolveAgentSessionDirs`           | `src/agents/session-dirs.ts`        | Lists all agent session dirs under `~/.openclaw/agents/`   | Filesystem-based discovery; no config dependency                                  |
| `listAgentIds`                      | `src/agents/agent-scope.ts`         | Lists configured agent IDs from config                     | Returns `["main"]` when no explicit agents defined                                |
| `ensureMemoryIndexSchema`           | `src/memory/memory-schema.ts`       | Creates SQLite schema for files/chunks/fts/embedding_cache | Handles migrations via `ensureColumn()`                                           |
| `node:sqlite` (DatabaseSync)        | Node 22 built-in                    | Synchronous SQLite interface                               | Already used throughout `src/memory/`; no extra deps                              |
| `onSessionTranscriptUpdate`         | `src/sessions/transcript-events.ts` | In-process event bus for session file changes              | Used by existing `MemoryManagerSyncOps.ensureSessionListener()`                   |
| `parseAgentSessionKey`              | `src/routing/session-key.ts`        | Parses `agent:<agentId>:<channel>:...` key structure       | Returns `{ agentId, rest }` — `rest` starts with the channel name                 |
| `applyTemporalDecayToHybridResults` | `src/memory/temporal-decay.ts`      | Applies exponential decay to result scores by file age     | Provides recency weighting without a hard cutoff                                  |
| `resolveRequiredHomeDir`            | `src/infra/home-dir.ts`             | Home dir resolution                                        | Consistent with Phase 22 patterns                                                 |

### Supporting

| Component                         | Location                    | Purpose                                    | When to Use                                                        |
| --------------------------------- | --------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `better-sqlite3`                  | `package.json` dependencies | Sync SQLite for infra/observability writes | Use for the obs event emit (already used in `alert-dispatcher.ts`) |
| `createSubsystemLogger("memory")` | `src/logging/subsystem.ts`  | Structured logging                         | Use in new indexer file                                            |
| `redactSensitiveText`             | `src/logging/redact.ts`     | Scrubs sensitive text before indexing      | Already used in `buildSessionEntry`                                |

### Alternatives Considered

| Instead of                                    | Could Use                     | Tradeoff                                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:sqlite` (DatabaseSync) for shared index | `better-sqlite3`              | `node:sqlite` is already used in all `src/memory/` files; `better-sqlite3` is only used in infra files. Consistency favors `node:sqlite` for the new index file.                                                       |
| Separate SQLite DB for cross-channel index    | Extending the per-agent index | Separate DB is cleaner — it is logically distinct from any single agent's workspace memory and can be shared across agents. The per-agent DB at `~/.openclaw/agents/<id>/workspace/.memory.db` is not the right place. |
| Polling with `setInterval`                    | Filesystem watcher (chokidar) | Polling is simpler and sufficient for a 5-minute cadence. The existing `ensureSessionListener` already handles real-time per-session updates. The cross-channel indexer only needs the periodic cadence.               |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

```
src/memory/
├── cross-channel-indexer.ts      # Plan 23-01: CrossChannelIndexer class
├── cross-channel-schema.ts       # Schema for shared cross-channel index DB
├── cross-channel-search.ts       # Plan 23-02: search + injection logic
src/auto-reply/reply/
├── cross-channel-context.ts      # Plan 23-02: query + inject into extraSystemPrompt
├── cross-channel-attribution.ts  # Plan 23-03: footer signal builder
```

### Pattern 1: Channel Name Extraction from Session Key / File Path

The session key encodes the channel at position 3 (0-indexed): `agent:main:<channel>:...`. Session JSONL files are named after the session key with colons replaced by filesystem-safe chars. The session key can be derived from the filename.

```typescript
// Source: src/routing/session-key.ts + src/sessions/session-key-utils.ts (verified by direct read)
import { parseAgentSessionKey } from "../../routing/session-key.js";

// Session key format: "agent:main:telegram:direct:123456"
// Session file name:  "agent:main:telegram:direct:123456.jsonl"
function extractChannelFromSessionKey(sessionKey: string): string | null {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed?.rest) return null;
  const parts = parsed.rest.split(":");
  return parts[0]?.trim().toLowerCase() || null;
  // Returns: "telegram", "discord", "slack", "signal", "imessage", etc.
}

// From session file path, derive the session key (reverse of resolveSessionTranscriptPathInDir):
function sessionKeyFromFilePath(absPath: string): string | null {
  const name = path.basename(absPath, ".jsonl");
  // Session keys are stored literally as the filename (with .jsonl extension)
  return name || null;
}
```

### Pattern 2: Cross-Channel Index Schema

Extends the existing `ensureMemoryIndexSchema` pattern with a `channel` column added to `files` and `chunks`:

```typescript
// Source: src/memory/memory-schema.ts (verified by direct read) — adapt for cross-channel
// Cross-channel index DB path: ~/.openclaw/cross-channel-memory.sqlite

export function ensureCrossChannelIndexSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,         -- sessions/<sessionKey>.jsonl (relative path)
      agent_id TEXT NOT NULL,
      channel TEXT NOT NULL,         -- "telegram", "discord", "slack", etc.
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_channel ON chunks(channel);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_channel ON files(channel);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_agent_id ON files(agent_id);`);
}
```

### Pattern 3: Incremental Indexer (hash-based, same as existing manager-sync-ops.ts)

```typescript
// Source: src/memory/manager-sync-ops.ts::syncSessionFiles() (verified by direct read)
// The cross-channel indexer reuses the same hash-comparison pattern:

async function indexIfChanged(db: DatabaseSync, absPath: string, agentId: string): Promise<void> {
  const entry = await buildSessionEntry(absPath); // from src/memory/session-files.ts
  if (!entry) return;

  const channel = extractChannelFromSessionKey(entry.path) ?? "unknown";
  const record = db.prepare(`SELECT hash FROM files WHERE path = ?`).get(entry.path) as
    | { hash: string }
    | undefined;

  if (record?.hash === entry.hash) {
    return; // unchanged — skip
  }

  // Index the entry (embed + upsert chunks)
  await indexEntry({ db, entry, agentId, channel });
}
```

### Pattern 4: Purge Removed Channel Sessions (same stale-path pattern as existing sync)

```typescript
// Source: src/memory/manager-sync-ops.ts::syncSessionFiles() stale cleanup (verified)
// After indexing all active paths, delete stale DB entries:

const activePaths = new Set(activeSessions.map((e) => e.path));
const staleRows = db.prepare(`SELECT path FROM files WHERE agent_id = ?`).all(agentId) as Array<{
  path: string;
}>;
for (const stale of staleRows) {
  if (activePaths.has(stale.path)) continue;
  db.prepare(`DELETE FROM files WHERE path = ?`).run(stale.path);
  db.prepare(`DELETE FROM chunks WHERE path = ?`).run(stale.path);
}
```

### Pattern 5: Context Injection into extraSystemPrompt

The injection point is in `src/auto-reply/reply/get-reply-run.ts` at the `extraSystemPrompt` assembly block (lines 275-283, verified by direct read). Cross-channel context becomes a new section in that array:

```typescript
// Source: src/auto-reply/reply/get-reply-run.ts lines 261-283 (verified)
// New section added to extraSystemPrompt assembly:

const crossChannelContextSection = await queryCrossChannelContext({
  query: bodyForKb,
  currentChannel: extractChannelFromSessionKey(agentSessionKey),
  agentId,
  cfg,
  timeoutMs: 400,
});

const extraSystemPrompt = [
  inboundMetaPrompt,
  groupChatContext,
  groupIntro,
  groupSystemPrompt,
  kbContextSection,
  crossChannelContextSection, // NEW — injected here
]
  .filter(Boolean)
  .join("\n\n");
```

The `queryCrossChannelContext` function returns a string like:

```
--- CROSS-CHANNEL CONTEXT ---
[From Telegram, 3 days ago]: User asked about project deadlines. Assistant replied with...
[From Slack, 1 week ago]: User mentioned preference for async standups.
```

### Pattern 6: Attribution Footer on Reply

```typescript
// New: src/auto-reply/reply/cross-channel-attribution.ts
// Appended AFTER the agent reply text, before delivery:

export function buildAttributionFooter(
  sources: Array<{ channel: string; mtimeMs: number }>,
): string {
  if (sources.length === 0) return "";
  const parts = sources.map((s) => `${capitalize(s.channel)} (${relativeTime(s.mtimeMs)})`);
  return `\n\n— drawing on context from ${parts.join(", ")}`;
}

// e.g.: "— drawing on context from Telegram (3 days ago), Slack (1 week ago)"
```

The attribution footer is built from the `channel` and `mtime` fields of the chunks actually retrieved and injected. It is appended to the reply text string before the response is sent to the channel.

### Pattern 7: Slash Command Exclusion

The existing `buildSessionEntry()` already filters to only `role: "user"` and `role: "assistant"` turns with `type: "message"` records. Slash commands are typically `role: "user"` with text starting with `/`. The exclusion rule from CONTEXT.md ("exclude slash commands") requires one additional filter:

```typescript
// In buildCrossChannelSessionEntry (new function wrapping buildSessionEntry):
// After extracting text, filter lines starting with "User: /":
const filteredContent = content
  .split("\n")
  .filter((line) => !line.match(/^User:\s*\//))
  .join("\n");
```

### Anti-Patterns to Avoid

- **Blocking the reply path with slow embedding**: Cross-channel retrieval must use `Promise.race` with a 400ms timeout. If the index is not ready or the search is slow, inject nothing and skip attribution — never delay the reply.
- **Querying the shared index for the current channel**: The decision is explicit in CONTEXT.md: "Cross-channel context comes from OTHER channels only." Filter out results whose `channel` column matches the current session's channel.
- **Using module-level `process.env.HOME`**: Follow Phase 22's pattern — use `resolveRequiredHomeDir()` in a function, not at module scope.
- **Indexing media/file attachments**: `buildSessionEntry()` already returns only text content. The cross-channel indexer must use the same function and not add any additional media indexing.
- **Searching cross-channel index on every reply**: Only search when the inbound query body is at least 10 characters and does not start with `/` (same guard as the existing KB context injection at line 263 of `get-reply-run.ts`).
- **Hard-wiring channel names**: Channel name is extracted from the session key's third token. Do not enumerate a hardcoded list of channel names — any channel whose sessions appear under the agent's sessions dir will be indexed automatically.

## Don't Hand-Roll

| Problem                         | Don't Build                 | Use Instead                                                                                    | Why                                                                                             |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Session file text extraction    | Custom JSONL parser         | `buildSessionEntry()` from `src/memory/session-files.ts`                                       | Already handles multi-turn, redaction, line mapping, role filtering                             |
| Embedding + vector search       | Custom embedding pipeline   | Reuse `MemoryIndexManager` pattern (or instantiate one per-agent with `sources: ["sessions"]`) | Full pipeline: provider selection, batch mode, FTS fallback, hybrid search, MMR, temporal decay |
| Hash-based incremental indexing | Custom file-change tracking | Reuse the `hash` comparison pattern from `syncSessionFiles()`                                  | Exactly the same problem — file content hash → skip if unchanged                                |
| Relative time formatting        | Custom date logic           | `Date.now() - entry.mtime` → bucket into "N days ago", "N weeks ago"                           | Simple arithmetic; no library needed                                                            |
| Session key channel extraction  | Custom regex                | `parseAgentSessionKey(key)?.rest.split(":")[0]`                                                | Already available, tested                                                                       |

**Key insight:** The memory subsystem already has everything needed. Phase 23 is composition, not construction: take the existing session indexing infrastructure and route it through a shared cross-agent index, then wire retrieval results into the reply pipeline's `extraSystemPrompt`.

## Common Pitfalls

### Pitfall 1: The Shared Index DB Path

**What goes wrong:** Placing the shared index DB at a path relative to a workspace directory (e.g., inside an agent's workspace) — it will not be "shared" across agents, and it will be wiped on workspace reset.

**Why it happens:** Following the per-agent memory DB pattern (`src/memory/manager.ts` stores the index at `settings.store.path` which resolves to the agent workspace).

**How to avoid:** Store the cross-channel index at a fixed path: `path.join(resolveRequiredHomeDir(), ".openclaw", "cross-channel-memory.sqlite")`. This is consistent with the observability DB location (`~/.openclaw/observability.sqlite`).

**Warning signs:** If the DB path contains `workspace` or `agentId` in its string, it is wrong.

### Pitfall 2: Cross-Channel Query Including Same-Channel Results

**What goes wrong:** The retrieval step returns chunks from the current channel, which then get injected as "cross-channel context" — duplicate/confusing.

**Why it happens:** The shared index stores all channels; without filtering, search returns all results.

**How to avoid:** Extract the current channel name from `agentSessionKey` using `parseAgentSessionKey(key)?.rest.split(":")[0]`. Pass it as an exclusion filter to the search query: `WHERE channel != ?`.

**Warning signs:** Attribution footer shows the same channel the user is currently messaging on.

### Pitfall 3: Attribution Footer on Non-Text Channels

**What goes wrong:** Appending a footer to a rich media reply or a voice message breaks formatting on some channels.

**Why it happens:** The attribution logic is unaware of reply content type.

**How to avoid:** Only append the footer when `replyPayload.text` is a non-empty string. Check `typeof replyPayload.text === "string" && replyPayload.text.length > 0` before appending. Do not append to media-only replies.

### Pitfall 4: Index Running on Every Process Startup

**What goes wrong:** The periodic indexer creates a new `setInterval` every time a new `MemoryIndexManager` is created (if the cross-channel indexer is embedded in the manager). Multiple gateway processes or test suites create duplicate intervals.

**Why it happens:** The existing `ensureIntervalSync()` pattern in `MemoryManagerSyncOps` is an instance method — fine when there is one manager per process, but the cross-channel indexer is a singleton.

**How to avoid:** The cross-channel indexer must be a module-level singleton with a guard: `let INDEXER_STARTED = false`. Only start the interval once per process. Use the same pattern as `INDEX_CACHE` in `manager.ts` (line 41: `const INDEX_CACHE = new Map<string, MemoryIndexManager>()`).

### Pitfall 5: Attribution Footer Not Matching Injected Context

**What goes wrong:** The footer lists sources that were injected but the threshold filter later drops them, or vice versa — the agent uses context but no footer appears.

**Why it happens:** Retrieving, filtering, injecting, and attributing are implemented in separate places with separate logic.

**How to avoid:** Return the retrieved chunks (with channel + mtime) from `queryCrossChannelContext()` and only set the attribution if the chunks were actually added to `extraSystemPrompt`. The attribution signal is derived from the same list of chunks that were injected, not computed separately.

### Pitfall 6: "From Unknown (X days ago)" in Attribution

**What goes wrong:** The channel token extracted from the session key is `"unknown"` because the session key format is unexpected.

**Why it happens:** Not all session keys follow the `agent:main:<channel>:...` pattern. Legacy keys, cron keys, and subagent keys may not have a channel token.

**How to avoid:** Skip indexing sessions whose channel token is unrecognized or `"unknown"` — these are not user-facing conversation sessions. Filter using the existing `isCronSessionKey()` and `isSubagentSessionKey()` checks from `src/sessions/session-key-utils.ts`. Only index sessions that have a known channel identifier.

## Code Examples

### Session File to Channel Attribution

```typescript
// Source: src/memory/session-files.ts + src/routing/session-key.ts (both verified by direct read)
import path from "node:path";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { isCronSessionKey, isSubagentSessionKey } from "../../sessions/session-key-utils.js";

export function extractChannelFromAbsSessionPath(absPath: string): string | null {
  // Session filename IS the session key (without .jsonl)
  const sessionKey = path.basename(absPath, ".jsonl");
  if (isCronSessionKey(sessionKey) || isSubagentSessionKey(sessionKey)) {
    return null; // skip non-user-session files
  }
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed?.rest) return null;
  const channel = parsed.rest.split(":")[0]?.trim().toLowerCase();
  // Known channels: telegram, discord, slack, signal, imessage, web, etc.
  if (!channel || channel === "unknown") return null;
  return channel;
}
```

### Relative Time Helper

```typescript
// No library needed — simple arithmetic
export function relativeTime(mtimeMs: number): string {
  const ageMs = Date.now() - mtimeMs;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}
```

### Cross-Channel Context Query with Timeout

```typescript
// Source pattern from: src/auto-reply/reply/get-reply-run.ts lines 261-283 (verified)
// New function: src/auto-reply/reply/cross-channel-context.ts

const CROSS_CHANNEL_TIMEOUT_MS = 400;
const CROSS_CHANNEL_TOKEN_BUDGET = 1000; // Claude's discretion
const CROSS_CHANNEL_MAX_CHUNKS = 5; // Claude's discretion
const CROSS_CHANNEL_MIN_SCORE = 0.6; // Claude's discretion

export async function queryCrossChannelContext(params: {
  query: string;
  currentChannel: string | null;
  agentId: string;
  cfg: OpenClawConfig;
  timeoutMs?: number;
}): Promise<{ section: string; sources: Array<{ channel: string; mtimeMs: number }> }> {
  const empty = { section: "", sources: [] };
  if (!params.query || params.query.length < 10 || params.query.startsWith("/")) {
    return empty;
  }

  const timeout = params.timeoutMs ?? CROSS_CHANNEL_TIMEOUT_MS;
  try {
    const result = await Promise.race([
      doSearch(params),
      new Promise<typeof empty>((resolve) => setTimeout(() => resolve(empty), timeout)),
    ]);
    return result;
  } catch {
    return empty;
  }
}

async function doSearch(params: {
  query: string;
  currentChannel: string | null;
  agentId: string;
  cfg: OpenClawConfig;
}): Promise<{ section: string; sources: Array<{ channel: string; mtimeMs: number }> }> {
  const indexer = CrossChannelIndexer.getInstance(params.cfg);
  const results = await indexer.search({
    query: params.query,
    agentId: params.agentId,
    excludeChannel: params.currentChannel ?? undefined,
    maxResults: CROSS_CHANNEL_MAX_CHUNKS,
    minScore: CROSS_CHANNEL_MIN_SCORE,
    tokenBudget: CROSS_CHANNEL_TOKEN_BUDGET,
  });

  if (results.length === 0) {
    return { section: "", sources: [] };
  }

  const lines = results.map(
    (r) => `[From ${capitalize(r.channel)}, ${relativeTime(r.mtimeMs)}]: ${r.snippet}`,
  );
  const section = `--- CROSS-CHANNEL CONTEXT ---\n${lines.join("\n")}`;
  const sources = results.map((r) => ({ channel: r.channel, mtimeMs: r.mtimeMs }));
  return { section, sources };
}
```

### Observability Event Emission

The cross-channel indexer emits a single observability event after each sync run, following the pattern in `src/agents/compound-orchestrator.ts`:

```typescript
// Source: src/agents/compound-orchestrator.ts lines 173-178 (verified pattern)
function emitObsEvent(action: string, metadata: Record<string, unknown>): void {
  try {
    const { default: Database } = require("better-sqlite3");
    // ... insert into ~/.openclaw/observability.sqlite
    // action: "cross_channel_index_sync"
    // metadata: { filesIndexed, filesSkipped, channelsFound, agentsIndexed, durationMs }
  } catch {
    // Observability is non-critical — never throw
  }
}
```

## State of the Art

| Old Approach                                   | Current Approach                                   | When Changed | Impact                                                |
| ---------------------------------------------- | -------------------------------------------------- | ------------ | ----------------------------------------------------- |
| Per-session memory (Phase 22)                  | Cross-channel unified index (Phase 23)             | Phase 23     | Sessions from all channels are searched together      |
| Memory search scoped to single agent workspace | Cross-channel search with channel exclusion filter | Phase 23     | Context crosses channel boundaries for the first time |
| No reply attribution                           | Footer attribution signal                          | Phase 23     | Users can see when cross-channel history is used      |

**Deprecated/outdated:**

- The `MemorySource = "memory" | "sessions"` type in `src/memory/types.ts` does not need a new variant. Cross-channel sessions are stored in their own separate DB with a `channel` column. The existing `source` column values (`"memory"`, `"sessions"`) are for the per-workspace memory system and should not be extended here.

## Open Questions

1. **Shared index placement when multiple agents are configured**
   - What we know: `listAgentIds(cfg)` returns all configured agent IDs. The cross-channel index could be per-agent or global.
   - What's unclear: If there are multiple agents (e.g., `main`, `work`), should they share a single cross-channel index or have separate ones? Per the CONTEXT.md, "session files from every channel feed a shared unified index" — this implies a single index per agent (cross its own channels), not across all agents.
   - Recommendation: Scope the cross-channel index per `agentId`. DB path: `~/.openclaw/agents/<agentId>/cross-channel-memory.sqlite`. This is consistent with the per-agent workspace pattern and ensures agent isolation.

2. **Slash command detection in indexed content**
   - What we know: `buildSessionEntry()` only indexes `role: "user"` and `role: "assistant"` turns. Slash commands like `/help` are user turns.
   - What's unclear: Should the check be on raw JSONL content or on the assembled `content` string?
   - Recommendation: Apply the slash command filter in the cross-channel indexer's preprocessing step AFTER `buildSessionEntry()` constructs the `content` field. Filter lines matching `^User:\s*/` from the content string before embedding. This is a cheap string filter, not a JSONL re-parse.

3. **Token budget vs. character budget for context injection**
   - What we know: The existing `clampResultsByInjectedChars()` in `src/agents/tools/memory-tool.ts` uses a character budget. Tokens ≈ chars / 4 for English text.
   - What's unclear: Whether to count characters or tokens.
   - Recommendation: Use a character budget of 4000 chars (≈ 1000 tokens) as the discretionary default. The existing `clampResultsByInjectedChars` pattern can be reused verbatim.

4. **Whether to use `MemoryIndexManager` directly or build a thin wrapper**
   - What we know: `MemoryIndexManager.get({ cfg, agentId })` creates a manager scoped to the agent's workspace directory with `sources: ["sessions"]`. It already does everything needed for 23-01.
   - What's unclear: Whether instantiating a `MemoryIndexManager` with a custom `store.path` pointing to the cross-channel DB is cleaner than writing a thin wrapper.
   - Recommendation (Claude's discretion): Reuse `MemoryIndexManager` directly by passing a custom `store.path` in the config. The manager already handles all the incremental indexing, embedding, FTS, and search. The only addition needed is the `channel` column in the schema — which requires extending `ensureMemoryIndexSchema`. This is less code than building a parallel class. Add `channel` to `MemorySearchResult` as an optional field so callers can read it for attribution.

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `src/memory/session-files.ts` — complete read; session file listing and text extraction
- `src/memory/manager-sync-ops.ts` — complete read; incremental sync, session listener, stale cleanup
- `src/memory/manager.ts` — complete read; `MemoryIndexManager` constructor and search
- `src/memory/memory-schema.ts` — complete read; SQLite schema creation pattern
- `src/memory/temporal-decay.ts` — complete read; age-based score weighting
- `src/memory/search-manager.ts` — complete read; `getMemorySearchManager` factory
- `src/memory/types.ts` — complete read; `MemorySearchResult`, `MemorySource`
- `src/agents/agent-scope.ts` — `listAgentIds`, `listAgentEntries` verified
- `src/agents/session-dirs.ts` — `resolveAgentSessionDirs` verified
- `src/routing/session-key.ts` — `buildAgentPeerSessionKey`, `parseAgentSessionKey` verified
- `src/sessions/session-key-utils.ts` — `parseAgentSessionKey`, `isCronSessionKey`, `isSubagentSessionKey`, `deriveSessionChatType` verified
- `src/sessions/transcript-events.ts` — complete read; in-process event bus
- `src/config/sessions/paths.ts` — complete read; `resolveSessionTranscriptsDirForAgent`
- `src/auto-reply/reply/get-reply-run.ts` — lines 261-283 verified; `extraSystemPrompt` assembly
- `src/agents/tools/memory-tool.ts` — complete read; search tool and `clampResultsByInjectedChars`
- `src/routing/bindings.ts` — complete read; channel-to-agent binding model
- `src/memory/sqlite.ts` — complete read; `node:sqlite` wrapper

### Secondary (MEDIUM confidence — planning docs cross-referenced)

- `.planning/phases/23-cross-channel-memory/23-CONTEXT.md` — user decisions, all locked
- `.planning/REQUIREMENTS.md` — MEM-01 through MEM-05 descriptions verified

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all components are existing codebase files read directly
- Architecture patterns: HIGH — directly derived from `manager-sync-ops.ts` and `get-reply-run.ts` patterns
- Pitfalls: HIGH — derived from code analysis; pitfall 4 (singleton) is directly observable in `manager.ts` INDEX_CACHE pattern
- Open questions: MEDIUM — depend on design decisions within Claude's discretion

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable memory subsystem; recheck if significant memory refactors land)
