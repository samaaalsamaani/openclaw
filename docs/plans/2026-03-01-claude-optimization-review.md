# Claude Configuration Optimization Review

**Date:** 2026-03-01
**Scope:** CLAUDE.md, MEMORY.md, settings.json, all hooks, MCP servers
**Goal:** Reduce context overhead, rate-limit pressure, and security exposure

---

## Executive Summary

The current configuration is sophisticated and thoughtful — hooks are well-structured, MEMORY.md is dense with useful corrections, and CLAUDE.md covers the right ground. However, several patterns accumulated over the build sprint are working against each other:

1. **No sub-agent vs primary-session distinction** — every hook, every MCP server, every KB ingest fires for sub-agents the same as for human-driven sessions. With 323 sessions on a single day, this multiplies costs dramatically.
2. **`alwaysThinkingEnabled: true`** — adds extended thinking to every API call including agents doing simple file reads.
3. **API keys in plaintext in settings.json** — a security exposure that needs fixing.
4. **MEMORY.md approaching the 200-line truncation limit** — with stale entries and superseded sections consuming space.
5. **7 MCP servers auto-start per session** — including services sub-agents never use.

Fixing items 1–3 will reduce rate-limit hits by an estimated 40–60%.

---

## CLAUDE.md

**File:** `/Users/user/Desktop/projects/openclaw/CLAUDE.md` (106 lines)

### Strengths

- Precise, actionable content. No vague filler.
- The footgun warnings (GitHub heredoc, backtick issue) are excellent — these prevent recurring errors.
- Multi-agent safety section is clear and correct.
- Tool schema guardrails (`no Type.Union/anyOf`) prevent a hard-to-debug class of errors.

### Issues

**1. "Peter" hardcoded (line 25)**

```
- When Peter asks for links, use full `https://docs.openclaw.ai/...` URLs.
```

This is baked into every session's context, including all sub-agents. They have no idea who Peter is. Either remove it or make it generic: `"When the user asks for doc links..."`.

**2. Signal/Fly deployment command (~150 tokens)**
The Fly SSH console command + machine ID is specific one-off operational knowledge that rarely applies. When it does apply, you'd reference it directly. Storing it permanently in every session's context is a token tax. Consider moving to a separate `OPERATIONS.md` that you load on demand.

**3. Channels list is a token sink**

```
Core: src/telegram, src/discord, src/slack, src/signal, src/imessage, src/web, src/channels, src/routing
Extensions: extensions/* (msteams, matrix, zalo, zalouser, voice-call)
```

This 2-line list is only relevant when refactoring channel logic. Moving to a comment in the source directory (or a referenced file) would save ~100 tokens per session without losing value.

**4. No sub-agent model guidance**
CLAUDE.md has no instruction about model selection for spawned sub-agents. As a result, all agents inherit Opus (69% of all API calls are Opus — the most rate-limited model). Adding a line like: _"When spawning sub-agents via Task, default subagent model to `sonnet` unless the task requires deep reasoning"_ would have high ROI.

**5. `scripts/committer` workflow assumes git knowledge**
The "Commits: `scripts/committer "<msg>" <file...>`" line is correct but sub-agents consistently default to `git add && git commit` anyway. If you want this enforced, it should be in the Multi-Agent Safety section, not Build Commands.

### Recommended edits: -4 lines, +2 lines (net -2)

---

## MEMORY.md

**File:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/MEMORY.md` (141 lines)
**Limit:** 200 lines (content after line 200 is truncated and invisible to Claude)

### Strengths

- Critical Corrections section is outstanding — exactly the right type of memory: things that are wrong by default and will repeatedly bite you.
- Gotchas section (SQLite, APIs, Memgraph) is high-signal and saves real debugging time.
- Subsystem reference links are a clean pattern for deep context on demand.

### Issues

**1. Stale date anchor in System Snapshot**

```
## System Snapshot (Feb 28 — PAIOS v4 COMPLETE, v3.0 stabilization ongoing)
```

This will be wrong next week. The heading embeds a date that ages. Better: `## System Snapshot (v3.0)` — version anchors age more gracefully than dates.

**2. "Stale 0-byte placeholders" section (4 lines)**
Documenting broken state as a permanent workaround in memory is a code smell. These files should either be deleted or the section should say "TODO: delete these". Keeping it as "ignore these" means they'll exist forever.

**3. `graph.md` reference marked SUPERSEDED**

```
- [graph.md](subsystems/graph.md) — **SUPERSEDED** — Kuzu era archived. v4 is Memgraph.
```

If it's superseded, remove the link. It wastes a line and invites confusion. The Memgraph reference in PAIOS v4 section is sufficient.

**4. Active Work section is partially stale (3 items)**

- `Retroactive mine` — listed as "Background, ~$9 total, safe to let run." This has been running since Feb 28. It may be done. Check and update or remove.
- `Learning loop` — "Will seed first Outcomes/Lessons after mine completes" — if mine is done, this should now say "run immediately" or "complete".
- These stale entries consume 5 lines that could be freed for current context.

**5. DB Paths section is verbose**
The full DB path list with file sizes (6 lines) is correct but sizes go stale. The paths matter; the sizes don't. Trim the sizes.

**6. LLM Routing section has retired information**

```
- **Retired tier names**: `code`, `vision` (now domain-only)...
```

Once the TIER_ALIASES shim is stable, the retired names are irrelevant context noise. This section could be cut to 3 lines.

**7. Approaching truncation limit**
At 141 lines, adding 60 more lines hits the invisible wall. The Gotchas section alone is 40+ lines — the most valuable section — and it's near the bottom. If memory grows, it gets cut first. Consider moving Gotchas to a separate `gotchas.md` and linking from MEMORY.md.

### Current line budget estimate

- Headers/spacing: ~20 lines
- Critical Corrections: 12 lines
- System Snapshot + DB paths: 18 lines
- LLM Routing: 10 lines
- Model Config: 9 lines
- Subsystem refs: 9 lines
- PAIOS v4: 10 lines
- Active Work: 6 lines
- Gotchas (4 sections): ~50 lines
- Rate limits + Next Level: 12 lines
- **Total: ~156 lines after Mar 1 addition**

44 lines of headroom before truncation. Pruning the 5 issues above frees ~15 lines for future use.

---

## settings.json

**File:** `~/.claude/settings.json`

### Critical: API Keys in Plaintext

```json
"env": {
    "OPENROUTER_API_KEY": "sk-or-v1-...",
    "OPENAI_API_KEY": "sk-proj-...",
    "ELEVENLABS_API_KEY": "sk_...",
    "DEEPGRAM_API_KEY": "...",
    "LATE_API_KEY": "sk_...",
    "BRAVE_API_KEY": "..."
}
```

Six API keys are stored in plaintext in settings.json. This file is:

- Readable by any process running as your user
- Passed to **every sub-agent session** (all 323 sessions on Feb 26 received all 6 keys)
- Sub-agents doing file reads don't need OpenRouter, ElevenLabs, or Deepgram keys

The gateway already reads credentials from `auth-profiles.json`. These env keys are for Claude Code hooks and scripts that call APIs directly. Consider:

1. Moving them to a `.env` file sourced by hooks only (not injected globally)
2. Or at minimum, only including the keys actually used by hooks (`OPENROUTER_API_KEY` for some scripts; the others appear unused by hooks)

### `alwaysThinkingEnabled: true`

Extended thinking is enabled globally. This means every API call — including sub-agents running `grep`, reading files, or executing simple Bash — pays the thinking token cost. Thinking is appropriate for reasoning-heavy tasks (architecture decisions, debugging), not for file operations.

**Impact:** Thinking tokens are billed as output tokens at the full rate. On a session with 700 turns (like session `40ff9369`), the cumulative thinking overhead is significant.

**Fix:** Remove `alwaysThinkingEnabled: true` from global settings. It can be enabled per-session when needed via `/think` or by starting a session with `claude --think`.

### `cleanupPeriodDays: 14`

Session files are purged after 14 days. Given you're doing heavy agent work with complex multi-session projects, 14 days is too short for retroactive debugging. Increase to 30.

### autoApprove Bash patterns

The current patterns are reasonable for productivity but have some gaps:

```json
"^(pnpm|npm|bun|node|python|uv) (?!.*uninstall)"
```

This auto-approves `node /path/to/any/script.js`. Any hook or agent that writes then executes a Node script bypasses confirmation. Consider tightening to known-safe paths.

```json
"^curl -s"
```

Silent curl is auto-approved. This could silently exfiltrate data to an attacker-controlled URL if an agent were compromised. Consider `^curl -s https://` to at least require HTTPS, or add a domain allowlist.

### Missing: Sub-agent concurrency cap

settings.json has no configuration for limiting concurrent agent spawns. The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` env var enables teams but doesn't bound them. A `maxConcurrentAgents: 4` setting (if/when Claude Code supports it) would address the root cause of the rate-limit spikes.

---

## Hooks

### SessionStart: `gsd-check-update.js`

**Fires:** Every session start, no matcher (includes all sub-agents)
**Does:** Spawns a background Node process to check for GSD updates via a cache file

This hook runs for every one of the 323 sessions on Feb 26. The update check is low-overhead (reads a cache file, spawns a background child), but it's a Node spawn per session that's entirely irrelevant for sub-agents. Sub-agents don't need to know about GSD updates mid-task.

**Fix:** Add a sub-agent skip guard at the top (detect via session type or environment variable).

### SessionStart: `kb-context-inject.sh`

**Fires:** Sessions with matcher `"startup"` only
**Does:** Queries KB for relevant articles, injects up to 3 articles (~16K chars max) into context

The `"startup"` matcher correctly limits this to non-subagent sessions. **This hook is well-designed.** However, the query always fires for the `openclaw` directory with `"openclaw OR gateway OR MCP OR agent"` — which is extremely broad and likely returns the same top-3 articles every time. Consider adding a TTL deduplication: if the same 3 articles were injected in the last N hours, skip the query.

### PostToolUse: `kb-auto-ingest.sh`

**Fires:** After every `Write` tool use, async
**Does:** Reads the written file, wraps it, ingests into KB

This hook fires for sub-agent writes too. In a 10-agent team each writing 5 files, this spawns 50 Node processes running `deep-ingest.js`. Each ingest is a SQLite write + embedding generation.

The file skip list is good (skips `.json`, `.lock`, `CLAUDE.md`, etc.) but still ingests `.sh`, `.ts`, `.py`, `.md` files written by sub-agents. Sub-agent outputs are typically intermediate work, not KB-worthy knowledge.

**Fix:** Add a minimum session age guard (skip if session < 5 minutes old) or detect sub-agent sessions via environment.

### PostToolUse: `gsd-context-monitor.js`

**Fires:** After every `Write` or `Edit`, async
**Does:** Reads a metrics file from `/tmp`, injects context-limit warnings

This hook **already handles sub-agents correctly** — it exits silently if no metrics file exists for the session ID. Well-designed.

### Stop: `quality-gate.sh`

**Fires:** Synchronously on every Stop event (every response completion)
**Does:** Reads transcript, checks for truncation/TODO patterns

The `timeout: 5` cap is appropriate. The logic is simple and fast. However, it fires for every sub-agent response too — many of which are single tool-result turns with no text. The `tail -1` transcript read is harmless but is a file I/O per response.

The check logic has a minor gap: it only catches `"todo:" ... "implement"` (both must be present). A response saying just "TODO: add error handling" wouldn't be caught. Low priority.

### SessionEnd: `session-learnings.sh`

**Fires:** Every session end, async
**Does:** Reads full transcript, builds a summary, ingests to KB

This is the most expensive hook. For every sub-agent session that ends, it:

1. Reads the entire transcript
2. Parses JSON entries
3. Calls `deep-ingest.js` (SQLite write + embedding)

For a 10-agent team, this creates 10 KB articles with titles like "Session Learnings: 2026-02-26 openclaw". These pollute the KB inbox with low-value entries.

The guard `if [ ${#SUMMARY} -lt 50 ]` catches truly empty sessions, but most agent sessions produce ≥50 chars of summary.

**Fix:** Add a minimum turns guard (e.g., skip if `user_turns < 3`) — sub-agents typically have 0 or 1 user turns (they're programmatic). This would skip ~90% of sub-agent sessions while keeping all human-driven sessions.

### SessionEnd: `claude_code_hook.sh` (graph CDC)

**Fires:** Every session end, async, 5-second timeout
**Does:** Triggers conversation mining into Memgraph

Async with short timeout — appropriate. The underlying `memgraph_driver.py` correctly falls back to reading `auth-profiles.json` for API keys. Well-designed.

### TeammateIdle / TaskCompleted hooks

Both have `timeout: 15` (synchronous). If `teammate-idle.sh` or `task-completed.sh` are slow or fail, they block the team coordinator for 15 seconds. Should be marked `async: true` unless they return critical data that the coordinator needs.

---

## MCP Servers

**7 servers auto-start per session:**

| Server              | Weight                 | Sub-agents need it? |
| ------------------- | ---------------------- | ------------------- |
| `knowledge-base`    | Heavy (Node + SQLite)  | Rarely              |
| `observability`     | Medium (Node + SQLite) | No                  |
| `macos-system`      | Light                  | No                  |
| `session-analytics` | Unknown                | No                  |
| `task-router`       | Unknown                | No                  |
| `codex-cli`         | Medium                 | No                  |
| `google-workspace`  | Heavy (uvx Python)     | Never               |

Every Claude Code session — including all sub-agents — spawns all 7. That's 7 child processes per session. The debug logs confirm they all start fresh per session:

```
MCP server "macos-system": Successfully connected to stdio server in 84ms
```

The zombie cleanup script (`cleanup-mcp-zombies.sh`) handles abnormal exits, but the normal spawning cost is still real.

**Immediate wins:**

- `google-workspace`: Should only load when explicitly doing calendar/email/docs work. Never needed by sub-agents.
- `session-analytics` and `task-router`: If these have limited use, move to on-demand loading via ToolSearch rather than always-on.

Claude Code currently doesn't support per-session MCP scoping (all configured servers load for all sessions). The workaround is to separate MCP configs between a "primary session" settings file and a "sub-agent" settings file — but this requires Claude Code support for inherited vs. override configs.

---

## Cross-Cutting: No Sub-Agent Detection

The single most impactful missing pattern is a reliable way to detect "I am a sub-agent, not a human-driven session." Every hook, MCP server, and KB ingest would benefit from this.

Current detection opportunities:

1. **Session type**: Claude Code passes session metadata to hooks. Sub-agents spawned via Task tool have a different origin than human-initiated sessions.
2. **Environment variable**: Set `CLAUDE_SUBAGENT=1` when spawning agents via the `team` skill or GSD executor. Hooks can read this.
3. **Turn count**: Sub-agents typically have 0 or 1 user turns at SessionEnd. session-learnings.sh could use `user_turns < 2` as a proxy.
4. **Parent session ID**: Available in the hook JSON. If `parent_session_id` is set, it's a sub-agent.

**Recommended pattern for all hooks:**

```bash
# Near top of every hook script
PARENT_SESSION=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('parent_session_id',''))" 2>/dev/null)
if [ -n "$PARENT_SESSION" ]; then
  exit 0  # Skip for sub-agents
fi
```

---

## Priority Matrix

| Issue                                              | Impact                     | Effort  | Priority |
| -------------------------------------------------- | -------------------------- | ------- | -------- |
| Remove `alwaysThinkingEnabled`                     | High (tokens + cost)       | 1 line  | **P0**   |
| Add sub-agent guard to session-learnings.sh        | High (KB pollution + cost) | 5 lines | **P0**   |
| Add sub-agent guard to kb-auto-ingest.sh           | Medium (cost)              | 5 lines | **P0**   |
| Move API keys out of settings.json env             | High (security)            | Medium  | **P0**   |
| Add sub-agent guard to gsd-check-update.js         | Low-medium                 | 3 lines | **P1**   |
| Mark TeammateIdle/TaskCompleted as async           | Medium (latency)           | 2 lines | **P1**   |
| Remove `alwaysThinkingEnabled`                     | High                       | 1 line  | **P1**   |
| Prune MEMORY.md (stale entries)                    | Medium (context quality)   | 15 min  | **P1**   |
| Fix "Peter" in CLAUDE.md                           | Low                        | 1 line  | **P2**   |
| Move Signal/Fly command out of CLAUDE.md           | Low                        | 2 lines | **P2**   |
| Add Sonnet-default sub-agent guidance to CLAUDE.md | High (rate limits)         | 2 lines | **P2**   |
| Increase cleanupPeriodDays to 30                   | Low                        | 1 value | **P2**   |
| Consolidate Gotchas into separate gotchas.md       | Medium (memory limit)      | 20 min  | **P3**   |
| Remove superseded graph.md reference               | Low                        | 1 line  | **P3**   |

---

## Quick-Win Change List

### settings.json

```jsonc
// REMOVE:
"alwaysThinkingEnabled": true

// CHANGE:
"cleanupPeriodDays": 30  // was 14

// REMOVE from env (not used by hooks):
"ELEVENLABS_API_KEY": ...
"DEEPGRAM_API_KEY": ...
```

### CLAUDE.md

```diff
- When Peter asks for links, use full `https://docs.openclaw.ai/...` URLs.
+ When the user asks for doc links, use full `https://docs.openclaw.ai/...` URLs.

+ Sub-agents (Task tool): default model to `sonnet` unless deep reasoning required.

- Signal: "update fly" => `fly ssh console -a flawd-bot -C "bash -lc 'cd /data/clawd/openclaw && git pull --rebase origin main'"` then `fly machines restart e825232f34d058 -a flawd-bot`.
+ Signal: "update fly" => see `.agents/OPERATIONS.md` for fly deployment commands.
```

### session-learnings.sh (5-line change)

After `user_turns` is computed (~line 90), add:

```bash
# Skip for sub-agents (programmatic sessions have < 3 user turns)
if [ "$USER_TURNS" -lt 3 ] 2>/dev/null; then
  exit 0
fi
```

### hooks/kb-auto-ingest.sh (3-line change)

After extracting `SESSION_ID`, add:

```bash
# Skip for sub-agents
PARENT_SESSION=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('parent_session_id',''))" 2>/dev/null)
if [ -n "$PARENT_SESSION" ]; then exit 0; fi
```

### hooks/gsd-check-update.js (3-line change)

Near the top after reading `process.cwd()`:

```js
// Skip for sub-agents (they inherit parent's update check)
const inputData = JSON.parse(fs.readFileSync("/dev/stdin", "utf8") || "{}");
if (inputData.parent_session_id) process.exit(0);
```

---

## What to Leave Alone

These are working well — don't change them:

- `kb-context-inject.sh` "startup" matcher — already correctly skipped for sub-agents
- `gsd-context-monitor.js` — already handles sub-agent detection via metrics file
- `quality-gate.sh` — lightweight, correct, useful
- `session-register.sh` — minimal overhead, useful telemetry
- The requireConfirmation bash patterns — well-calibrated
- The MEMORY.md Critical Corrections section — excellent, don't touch
- CLAUDE.md Multi-Agent Safety section — precise and correct
