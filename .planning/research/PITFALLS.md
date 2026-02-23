# Pitfalls Research

**Dimension:** What do multi-AI orchestration projects commonly get wrong?
**Context:** PAIOS mesh of Claude Code CLI, Codex CLI, and OpenClaw Gateway connected via MCP protocol
**Date:** 2026-02-22
**Sources:** Codebase analysis, web research, OpenClaw issue tracker, OWASP Agentic AI Top 10, Anthropic engineering blog, industry post-mortems

---

## Critical Pitfalls (will break the system)

### P1. MCP Stdio Server Orphan Processes

**Warning signs:** RAM usage climbs over hours; `ps aux | grep node` shows dozens of identical MCP server processes; subsequent MCP connections fail because the port/pipe is already occupied.

**Why this hits us:** Every MCP server in our mesh (knowledge-base, macos-system, session-analytics) uses stdio transport. Claude Code and Codex CLI each spawn these as child processes. When a session ends abnormally (crash, timeout, SIGKILL), the child process is never terminated. This is a documented Claude Code bug ([anthropics/claude-code#11778](https://github.com/anthropics/claude-code/issues/11778)). With three AI brains each spawning 3-5 MCP servers, orphan accumulation is rapid.

**Prevention strategy:**

- Implement a process reaper cron job that runs every 5 minutes: `pgrep -f "mcp-server.js" | xargs -I{} sh -c 'ps -p {} -o ppid= | xargs ps -p 2>/dev/null || kill {}'` (kills MCP servers whose parent is dead).
- Set `--max-turns` equivalent limits on all CLI invocations so sessions cannot run indefinitely.
- Use the Gateway's existing `ProcessSupervisor.reconcileOrphans()` for processes it spawns.
- Each MCP server should install a SIGTERM handler that cleanly closes DB connections and exits.

**Phase:** Phase 0 (Wire the Mesh) -- must be solved before registering cross-system MCP servers.

---

### P2. SQLite Concurrent Write Contention (SQLITE_BUSY)

**Warning signs:** Intermittent "database is locked" errors in logs; KB ingestion silently fails; queries return stale data; WAL file grows without bound.

**Why this hits us:** The KB SQLite database will be accessed simultaneously by: (a) OpenClaw Gateway's memory manager (reads + writes), (b) knowledge-base MCP server (reads + writes via deep-ingest), (c) Claude Code via MCP (reads + writes via PostToolUse hook auto-ingest), (d) Codex CLI via MCP (reads), (e) heartbeat cron tasks (reads + writes). The current Gateway code sets `PRAGMA busy_timeout = 1` (1 millisecond!) in `src/memory/qmd-manager.ts:924`, which is catastrophically low for concurrent access. Any writer holding a lock for >1ms causes immediate SQLITE_BUSY errors for all other readers.

**Prevention strategy:**

- Increase `busy_timeout` to at least 5000ms (5 seconds) for all DB connections.
- Ensure WAL mode is enabled: `PRAGMA journal_mode=WAL` on every connection.
- Implement a single-writer pattern: route all writes through one MCP server endpoint that serializes them, while allowing concurrent reads.
- Add WAL checkpoint management: periodic `PRAGMA wal_checkpoint(TRUNCATE)` to prevent unbounded WAL growth (checkpoint starvation from long-running reads is a known SQLite pitfall).
- Never hold a read transaction open while waiting for an LLM response -- fetch data, close the transaction, then call the model.

**Phase:** Phase 0 (immediate) -- the `busy_timeout = 1` must be fixed before any MCP server connects.

---

### P3. Agent SDK Child Process Memory Leak

**Warning signs:** Node.js heap grows 50-100MB per hour; `process.memoryUsage().heapUsed` trends upward; Gateway restarts via launchd become frequent; macOS memory pressure warnings.

**Why this hits us:** The Claude Agent SDK bundles the entire Claude Code CLI as `cli.js` and spawns it as a child process. A documented bug causes these child processes to persist after the SDK agent generator completes because the AbortController is never aborted ([GitHub incident report](https://gist.github.com/LEX8888/675867b7f130b7ad614905c9dd86b57a)). With Gateway handling multiple concurrent sessions, each spawning SDK agents, orphan accumulation is severe. In Jan/Feb 2026, Anthropic shipped a memory leak to production that crashed systems within 20 seconds.

**Prevention strategy:**

- Always pass an `AbortController.signal` to SDK `query()` calls and call `.abort()` in a `finally` block.
- Set `--max-budget-usd` on automated runs to cap runaway sessions.
- Implement a watchdog in Gateway that monitors child process count (`pgrep -P $GATEWAY_PID | wc -l`) and kills stale children.
- Pin the Agent SDK to a known-good version after testing; do not auto-update.
- Release API stream buffers, agent context, and skill state after use (recent Anthropic fix pattern).

**Phase:** Phase 1 (Smart Router) -- when Agent SDK integration begins.

---

### P4. Heartbeat Runaway Loop (Cost Spiral)

**Warning signs:** CPU spikes to 100% during heartbeat; OpenRouter balance drains rapidly; Gateway log shows hundreds of consecutive heartbeat agent runs; `cron-state.json` shows `consecutiveErrors` climbing.

**Why this hits us:** OpenClaw has a known bug ([openclaw/openclaw#3181](https://github.com/openclaw/openclaw/issues/3181)) where heartbeat poll messages trigger continuous processing in a tight loop. Our heartbeat has never actually executed (all timestamps = 0), so the first activation is high-risk. The HEARTBEAT.md defines 7 tiers of tasks including LLM-powered content posting, competitor sweeps, and engagement sync -- each consuming API tokens. A single runaway heartbeat could burn through the $110 OpenRouter balance in minutes.

**Prevention strategy:**

- Verify the Gateway's existing `MIN_REFIRE_GAP_MS` (2 seconds) and `ERROR_BACKOFF_SCHEDULE_MS` (30s, 1m, 5m, 15m, 60m) are active for heartbeat jobs.
- Add a daily cost cap: `--max-budget-usd 2.00` on all automated LLM calls.
- Implement a circuit breaker: disable heartbeat after 5 consecutive errors within 10 minutes.
- First activation should be in "dry run" mode: log what would execute without actually calling LLMs.
- Monitor: set up an OpenRouter webhook or daily balance check that alerts if >$5 spent in 24h.

**Phase:** Phase 3 (Event-Driven Orchestration) -- heartbeat activation.

---

### P5. Cascading Failure Across AI Brains

**Warning signs:** One brain goes down (rate limited, API outage, auth expired); tasks routed to it pile up in queue; retry logic floods the other brains; entire system becomes unresponsive; all three brains saturated.

**Why this hits us:** Our mesh has three interdependent brains. If Codex hits its 5h rate limit, tasks re-route to Claude. If Claude's Max sub has an outage (19 incidents in 14 days in Jan 2026), tasks re-route to Gemini via OpenRouter. If OpenRouter balance is depleted, there is no fallback. The dependency chain: Gateway -> Claude/Codex CLI -> MCP servers -> KB SQLite means a failure at any layer cascades upward.

**Prevention strategy:**

- Implement bulkhead isolation: each brain gets its own task queue with independent concurrency limits (Gateway already has `maxConcurrentRuns` in cron config).
- Define graceful degradation per brain: if Claude is down, route to Codex for code tasks and respond directly for conversational tasks (no LLM needed).
- Add health checks before routing: ping each brain's endpoint before dispatching a task.
- Implement request shedding: if queue depth > 10 for any brain, reject new tasks with a user-friendly message rather than queueing indefinitely.
- Never retry the same failed request to the same brain more than 3 times.
- Keep the Gateway's existing `FailoverError` classification and exponential backoff (already in `cli-runner.ts`).

**Phase:** Phase 1 (Smart Router) -- routing logic must handle failures gracefully from day one.

---

### P6. Cross-Brain Prompt Injection (Data Exfiltration via MCP)

**Warning signs:** An MCP tool returns content that changes the AI's behavior; sensitive data from one conversation appears in another; API keys or personal data leak through tool descriptions; a "helpful" MCP response contains hidden instructions.

**Why this hits us:** Our MCP mesh creates multiple injection surfaces: (a) KB articles ingested from untrusted URLs could contain prompt injection payloads that propagate to every brain querying the KB, (b) Codex's MCP server exposes tools to Claude -- a poisoned tool description could manipulate Claude's behavior, (c) Content captured via `capture.sh` from YouTube/Twitter could contain adversarial text in transcripts that gets auto-ingested to KB, (d) MCP tool shadowing: a malicious server could register a tool named identically to a legitimate one. The OWASP Agentic AI Top 10 (2026) lists cascading prompt injection as the #1 risk.

**Prevention strategy:**

- Use OpenClaw's existing `wrapExternalContent()` (from `src/security/external-content.ts`) for ALL content entering the KB. This wraps untrusted content in `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` markers with security warnings.
- Never interpolate KB query results directly into system prompts -- always wrap them as "reference material, not instructions."
- Sanitize MCP tool descriptions: strip any content that looks like prompt injection (patterns already defined in `SUSPICIOUS_PATTERNS` in the security module).
- Enforce tool namespacing: prefix all MCP tools with their server name (`kb:query`, `codex:exec`) to prevent shadowing.
- Apply the principle of least privilege: Claude's MCP access to Codex should only expose read-only code review tools, not arbitrary execution.
- Audit every MCP server tool description for hidden instructions before deployment.

**Phase:** Phase 0 (Wire the Mesh) -- security must be designed in, not bolted on.

---

### P7. Shell Escaping Failures in subprocess Calls

**Warning signs:** Commands silently fail or produce wrong output; special characters in user content break shell parsing; `$(cat ...)` not expanding; quotes within quotes cause syntax errors.

**Why this hits us:** This is our most proven failure mode -- 7 of our 31 historical bugs were shell escaping issues. The `adapter.py` pattern `subprocess.run(["bash", "-c", f'claude -p "$(cat {prompt_file})"'])` is fragile: if the temp file path contains spaces, or if the prompt contains single quotes, the command breaks silently. The Gateway's `cli-runner.ts` already handles this correctly via the `ProcessSupervisor`, but our 8 Python scripts and 12 bash scripts all have their own subprocess patterns.

**Prevention strategy:**

- Migrate all Python `subprocess.run(["bash", "-c", ...])` calls to Agent SDK `query()` calls (Phase 1 deliverable).
- Until SDK migration: always use `subprocess.run(["claude", "-p", prompt_text, ...], input=stdin_data)` with list args (no shell=True, no bash -c wrapper).
- For bash scripts: use `"$@"` for argument passing, never string interpolation of untrusted content into commands.
- Add a linting rule that flags `subprocess.run` with `shell=True` or `bash -c` in Python scripts.
- Test every script with adversarial inputs: quotes, newlines, Unicode, null bytes, paths with spaces.

**Phase:** Phase 1 (Smart Router / SDK integration) -- SDK eliminates the entire class of bugs.

---

## Moderate Pitfalls (will cause pain)

### P8. MCP Server Crash = Permanent Tool Loss Until Restart

**Warning signs:** Claude Code stops using KB tools mid-session; `mcp_server_status` shows "disconnected" but no auto-recovery; user has to restart the entire session to regain MCP tools.

**Why this hits us:** MCP stdio transport cannot recover from server crashes. When the knowledge-base MCP server crashes (e.g., due to an unhandled SQLite error), the stdio pipe breaks. Neither Claude Code nor Codex CLI attempt to reconnect ([agno-agi/agno#3724](https://github.com/agno-agi/agno/issues/3724), [anthropics/claude-code#3487](https://github.com/anthropics/claude-code/issues/3487)). The entire session loses access to KB tools permanently. With 5+ MCP servers per brain, the probability of at least one crashing per day is high.

**Prevention strategy:**

- Wrap every MCP server handler in try/catch at the top level -- never let an unhandled exception crash the process.
- Add a watchdog in each MCP server that sends a health ping every 30 seconds; if the parent process doesn't respond, self-terminate cleanly.
- For Gateway-spawned MCP servers: use the `ProcessSupervisor` to detect crashes and auto-restart.
- For CLI-spawned MCP servers: accept that recovery requires a new session. Mitigate by making MCP servers extremely robust (defensive coding > reconnection logic).
- Log every MCP server crash with full stack trace for post-mortem analysis.

**Phase:** Phase 0 -- MCP servers must be hardened before registration.

---

### P9. Task Classification Errors (Wrong Brain Gets the Task)

**Warning signs:** Codex receives a creative writing request and produces mediocre output; Claude receives a code debugging task and hallucinates API details; response quality drops despite all brains being healthy.

**Why this hits us:** Our router must classify every incoming task and route to the optimal brain. Research shows specification failures account for ~42% of multi-agent system failures. Misclassification is especially damaging because: (a) the user sees a bad response and doesn't know why, (b) the wrong brain may cost money (Gemini Flash for a task Claude could do for free), (c) accumulated misrouting degrades trust in the entire system.

**Prevention strategy:**

- Start with a simple, deterministic classifier (keyword matching + regex) rather than an LLM-based one. LLM classification adds latency and can itself be wrong.
- Define clear routing rules in the router code, not in prompts. Example: if message contains a code block or references a file path, route to Codex; if it asks for writing/translation, route to Claude.
- Add a confidence threshold: if the classifier is <70% confident, route to the best general-purpose brain (Claude Sonnet) rather than guessing.
- Log every routing decision with the classification reasoning. Review weekly to identify systematic misroutes.
- Allow the user to override routing with explicit brain selection (e.g., "ask Claude about...", "have Codex review...").

**Phase:** Phase 1 (Smart Router) -- the router is the most critical new component.

---

### P10. Context Window Overflow from KB Injection

**Warning signs:** Responses become degraded or truncated; Claude returns "I'll focus on the most relevant..." disclaimers; cost per query increases; latency spikes.

**Why this hits us:** Phase 2 plans to inject relevant KB articles into every session via `--append-system-prompt`. If the KB grows to 500+ articles and the injection query returns 10 articles averaging 2000 tokens each, that's 20K tokens of context prepended to every query. Claude Opus's 200K context window can handle it, but: (a) it increases cost proportionally, (b) it reduces the effective space for the actual task, (c) irrelevant context degrades response quality (the "lost in the middle" problem).

**Prevention strategy:**

- Limit KB injection to 3 articles maximum, selected by semantic similarity score.
- Set a hard token budget for injected context: max 4000 tokens total.
- Use a two-stage approach: inject article summaries first (100-200 tokens each), then retrieve full articles only if the model requests them.
- Never inject KB context for simple conversational messages -- only for tasks that benefit from knowledge.
- Monitor the ratio of injected context to actual prompt; if >50%, reduce injection.

**Phase:** Phase 2 (Shared Memory) -- must be designed carefully.

---

### P11. ARG_MAX and macOS Bash 3.2 Limitations

**Warning signs:** Commands fail silently or with cryptic "Argument list too long" errors; bash scripts behave differently than expected; `${!var}` indirect expansion fails; associative arrays don't work.

**Why this hits us:** macOS ships bash 3.2 (2007, GPLv2). Our 12 bash scripts must work within its limitations. Known constraints: no associative arrays (`declare -A`), no `${!var}` indirect expansion, no `|&` (pipe stderr), no `coproc`, no `lastpipe`. Additionally, macOS ARG_MAX is ~1MB for combined command arguments, which we've already hit with base64 image data in `analyze.sh`. We have 5 confirmed historical bugs from bash/ARG_MAX issues.

**Prevention strategy:**

- Standardize: all new scripts should be Python (which has no ARG_MAX issues for in-process data).
- For existing bash scripts: test on macOS bash 3.2 explicitly (`/bin/bash --version`).
- Never pass large data as command arguments; use temp files, stdin, or environment variables.
- Add a header comment to every bash script: `# NOTE: Must work with bash 3.2 (macOS default)`.
- Consider installing bash 5 via Homebrew and updating shebangs to `/opt/homebrew/bin/bash` -- but only if all scripts are tested against it.
- Use `[[ -z "$var" ]]` checks instead of `${1:?Usage: ...}` with nested braces (historical bug #8).

**Phase:** All phases -- ongoing discipline.

---

### P12. Late.dev Token Expiration Cascade

**Warning signs:** Social media posts silently fail; engagement sync returns empty data; `poster.py` reports HTTP 401; content calendar shows "scheduled" entries that never post.

**Why this hits us:** YouTube Late.dev token is already expired. TikTok and Twitter tokens are expiring. Token refresh requires manual browser re-auth (no programmatic refresh flow). When tokens expire, the entire content factory pipeline (capture -> write -> adapt -> schedule -> auto-post -> analytics) breaks at the final step. Heartbeat auto-post (Tier 3, every 4h) would silently fail.

**Prevention strategy:**

- Check token validity at Gateway startup and log warnings for tokens expiring within 7 days.
- Implement a heartbeat check (Tier 2, every 2h) that pings each Late.dev account endpoint.
- When a post fails due to 401, immediately notify the user via macOS notification and mark the calendar entry as "failed" (not "posted").
- Never retry a 401 failure -- it wastes rate limits on other services.
- Document the manual re-auth process in TOOLS.md so it can be done quickly.

**Phase:** Phase 0 (immediate) -- refresh tokens before activating any automation.

---

### P13. Stale Memory and Context Drift

**Warning signs:** The AI references outdated information; MEMORY.md contains facts from weeks ago that are no longer true; daily memory files accumulate but are never reviewed; the AI's "personality" diverges across brains.

**Why this hits us:** Three brains maintain partially overlapping but not synchronized context: (a) OpenClaw reads MEMORY.md, SOUL.md, USER.md at session start, (b) Claude Code reads ~/.claude/ settings and CLAUDE.md, (c) Codex reads ~/.codex/config.toml and instructions.md. If MEMORY.md is updated but CLAUDE.md is not, the brains have inconsistent world views. Additionally, daily memory files (`memory/YYYY-MM-DD.md`) accumulate without cleanup -- the heartbeat cleanup task has never run.

**Prevention strategy:**

- Define a single source of truth for each type of context: KB SQLite for factual knowledge, MEMORY.md for user preferences, SOUL.md for personality (shared via MCP, not file duplication).
- Implement memory decay: entries older than 30 days in MEMORY.md should be archived unless explicitly marked as permanent.
- The heartbeat Tier 6 daily cleanup must actually run: delete memory files older than 7 days, compact MEMORY.md.
- Use the KB MCP server as the universal context provider -- all brains query it rather than reading different local files.

**Phase:** Phase 2 (Shared Memory) and Phase 3 (Heartbeat activation).

---

### P14. Process Accumulation Under launchd

**Warning signs:** `ps aux | grep -c claude` returns dozens; system becomes sluggish; launchd restarts Gateway which spawns new CLI sessions while old ones are still running; fan noise increases.

**Why this hits us:** The Gateway runs as a launchd daemon. When it crashes and relaunches, any CLI sessions it spawned (Claude Code, Codex CLI) become orphans. The new Gateway instance has no record of them. Over time, these accumulate. The Gateway's `ProcessSupervisor` tracks runs with `RunRecord` objects, but these are in-memory -- lost on restart.

**Prevention strategy:**

- Persist `RunRecord` state to disk (JSON file) so the supervisor can reconcile orphans after restart.
- Add a Gateway startup hook that calls `reconcileOrphans()` and kills any child processes from the previous instance.
- Set `ExitTimeOut` in the launchd plist to give the Gateway time to clean up child processes on shutdown (SIGTERM -> wait 10s -> SIGKILL).
- Add a periodic orphan check to the heartbeat (Tier 1, every heartbeat).

**Phase:** Phase 0 -- before activating any automated CLI spawning.

---

## Minor Pitfalls (annoyances)

### P15. MCP Tool Name Collision Across Servers

**Warning signs:** The wrong MCP tool is called; results are unexpected; Claude uses the KB `query` tool when it meant to use the analytics `query` tool.

**Why this hits us:** Three MCP servers may expose tools with similar or identical names. If both knowledge-base and session-analytics expose a `query` tool, the LLM may pick the wrong one based on the prompt context.

**Prevention strategy:** Prefix all tool names with their server name: `kb_query`, `analytics_query`, `macos_screenshot`. Review tool names across all servers before registration.

**Phase:** Phase 0.

---

### P16. Timezone and Locale Inconsistencies

**Warning signs:** Content scheduled for 09:00 Riyadh posts at 06:00 UTC; heartbeat runs outside active hours (07:00-23:00 Asia/Riyadh); date-stamped files use different formats.

**Why this hits us:** Multiple systems need consistent timezone handling: Python scripts (content-calendar), Node.js (Gateway cron), bash scripts (date commands), and SQLite (stored timestamps). Each may default to a different timezone (UTC, system locale, or hardcoded).

**Prevention strategy:** Standardize on UTC for all storage and internal processing; convert to Asia/Riyadh only at display/scheduling boundaries. Set `TZ=Asia/Riyadh` in the launchd plist for consistent behavior.

**Phase:** Phase 1.

---

### P17. Log Volume Explosion

**Warning signs:** Disk usage climbs; `~/.openclaw/logs/` grows to GBs; grep through logs becomes slow; relevant errors buried in noise.

**Why this hits us:** With three brains producing logs, plus MCP server logs, heartbeat logs, and script output, log volume can become unmanageable. The Gateway already produces separate `gateway.err.log` and `gateway.out.log`, but CLI sessions and MCP servers log to stdout which may not be captured.

**Prevention strategy:** Implement log rotation (logrotate or launchd's built-in rotation). Set log level to `warn` for production, `debug` only when investigating issues. Direct MCP server logs to `~/.openclaw/logs/mcp-{name}.log` with size limits.

**Phase:** Phase 0 -- before the log volume increases.

---

### P18. Python Venv Fragility

**Warning signs:** `ModuleNotFoundError` in Python scripts; different Python version found than expected; `uv pip install` fails because the venv is corrupt; Homebrew upgrade changes Python minor version.

**Why this hits us:** The venv at `~/.openclaw/.venv` is pinned to Python 3.14. A Homebrew `brew upgrade python` could install 3.15, breaking the venv. We already had a "split-brain" bug where packages were on 3.12 while the default `python3` was 3.14.

**Prevention strategy:** Pin Python version in the venv shebang (`#!/Users/user/.openclaw/.venv/bin/python`). Add a heartbeat check that verifies `python --version` matches expected. Document venv recreation steps.

**Phase:** Ongoing.

---

### P19. Codex CLI Experimental Feature Instability

**Warning signs:** `multi_agent`, `memory_tool`, or `sqlite` features break after a Codex CLI update; behavior changes without warning; features are removed.

**Why this hits us:** Our Phase 2 plans rely on Codex experimental features (`multi_agent`, `memory_tool`, `sqlite`). Experimental features can change API, break, or be removed at any time.

**Prevention strategy:** Pin Codex CLI version. Build abstractions that can fall back to non-experimental behavior. Test experimental features in isolation before depending on them. Keep a changelog of Codex CLI versions and their feature compatibility.

**Phase:** Phase 2.

---

### P20. Rate Limit Mismanagement Across Brains

**Warning signs:** Codex returns 429 errors; Claude Max sub hits concurrent session limit; OpenRouter returns quota exceeded; tasks fail in bursts then recover.

**Why this hits us:** ChatGPT Pro has a 5h primary + 7-day secondary rate window. Claude Max has concurrent session limits. OpenRouter has per-model rate limits. Our router must respect all three simultaneously. A burst of tasks (e.g., content factory running capture + adapt + post for 5 items) could hit all rate limits at once.

**Prevention strategy:** Implement per-brain rate tracking in the router. Add pre-flight rate checks before dispatching. Use token bucket algorithm with brain-specific limits. Queue tasks rather than failing immediately when rate limited. Spread automated tasks (heartbeat, content posting) across the hour rather than running them all at once.

**Phase:** Phase 1 (Smart Router).

---

## Lessons from Our Bug History

### Pattern Analysis (31 bugs, 4 categories)

| Category            | Count | Examples                                                                                                      | Root Cause                                |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Shell/Process**   | 12    | ARG_MAX overflow, `$(cat)` not expanding, nested brace corruption, indirect expansion, pipe stderr            | macOS bash 3.2 + subprocess misuse        |
| **API/Integration** | 8     | Late.dev URL wrong, Claude CLI no `--max-turns`, urllib import location, timeout too short, JSON construction | Incorrect assumptions about external APIs |
| **Data/Encoding**   | 6     | Arabic FTS regex, nested quotes in Python heredocs, base64 as argv, PARA column migration                     | Unicode + special character handling      |
| **Silent Failures** | 5     | API keys not in env, capture.sh no error handling, scripts missing PATH, heartbeat never ran                  | Missing validation + error reporting      |

### Key Lessons

1. **"Works on my machine" is not testing.** 7 bugs only manifested on macOS (bash 3.2, ARG_MAX, launchd env vars). Always test on the actual target platform.

2. **Silent failures are worse than loud crashes.** 5 bugs were "silent" -- the system appeared to work but produced wrong/empty results. Every function should validate its output and fail loudly.

3. **Never trust shell expansion in subprocess calls.** `subprocess.run(["bash", "-c", f'...$(cat {file})...'])` is the single most bug-prone pattern in our codebase. The Agent SDK eliminates this entire class.

4. **External API documentation lies.** Late.dev's URL was wrong. Claude CLI's `--max-turns` flag doesn't exist. Always validate against the actual API, not the docs.

5. **Compound quoting is fundamentally fragile.** Passing user content through shell -> Python -> Claude CLI involves 3 layers of escaping. Each layer can corrupt the data. Use IPC (SDK, stdin, temp files) instead of string interpolation.

6. **Config schema strictness is a feature, not a bug.** OpenClaw's Zod validation caught many invalid config attempts that would have caused crash loops. Strict schemas are worth the upfront pain.

7. **Unicode awareness must be explicit.** JavaScript `\w` regex doesn't match Arabic characters. Python's `re` module needs `\p{L}` for Unicode letters. Always use Unicode-aware patterns.

---

## Prevention Checklist

### Pre-Build (Before Phase 0)

- [ ] **Fix `busy_timeout = 1`** in `src/memory/qmd-manager.ts:924` -- change to 5000ms
- [ ] **Verify WAL mode** is enabled on all SQLite connections
- [ ] **Refresh Late.dev tokens** (YouTube expired, TikTok/Twitter expiring)
- [ ] **Add SIGTERM handlers** to all 3 MCP server scripts
- [ ] **Add top-level try/catch** to every MCP server tool handler
- [ ] **Review all MCP tool names** across servers for collisions -- rename with prefixes
- [ ] **Set TZ=Asia/Riyadh** in launchd plist
- [ ] **Test MCP servers crash recovery** -- kill each server mid-operation, verify Gateway/CLI handles it gracefully

### Per-Phase Gates

- [ ] **Phase 0 gate:** Can each MCP server crash and restart without orphan processes? Test: `kill -9 <mcp_pid>`, verify parent detects and cleans up.
- [ ] **Phase 1 gate:** Can the router correctly classify 20 sample tasks? Build a test suite with expected routing for common request types.
- [ ] **Phase 1 gate:** Does Agent SDK properly clean up child processes? Test: run 50 SDK queries, verify `pgrep -c claude` returns 0 after all complete.
- [ ] **Phase 2 gate:** Does KB injection stay under 4000 tokens for all queries? Test with a KB of 100+ articles.
- [ ] **Phase 3 gate:** Run heartbeat in dry-run mode for 48 hours. Verify: no runaway loops, cost stays at $0, all tasks execute at correct times.
- [ ] **Phase 3 gate:** Simulate brain outage (block Claude API), verify graceful degradation.

### Ongoing Vigilance

- [ ] **Weekly:** Review routing logs for misclassification patterns
- [ ] **Weekly:** Check OpenRouter balance and daily spend trend
- [ ] **Daily:** Monitor orphan process count (`ps aux | grep -c "mcp-server\|claude\|codex"`)
- [ ] **Daily:** Check WAL file sizes (`ls -la ~/.openclaw/data/*.db-wal`)
- [ ] **Per-release:** Test all 30 scripts against macOS bash 3.2 + Python 3.14
- [ ] **Per-release:** Run the security audit (`src/security/audit.ts`) against all MCP servers
- [ ] **Per-release:** Verify `wrapExternalContent()` is called for all KB ingest paths

### Emergency Procedures

- **Cost spiral detected:** `launchctl unload ~/Library/LaunchAgents/ai.openclaw.gateway.plist` to immediately stop the Gateway. Then investigate logs.
- **MCP server orphan storm:** `pkill -f "mcp-server.js"` to kill all MCP servers. They will respawn on next session.
- **SQLite locked:** `cp ~/.openclaw/data/kb.db ~/.openclaw/data/kb.db.bak && sqlite3 ~/.openclaw/data/kb.db "PRAGMA wal_checkpoint(TRUNCATE);"` to force checkpoint.
- **Brain unresponsive:** Check API status pages (status.anthropic.com, status.openai.com). If confirmed outage, disable auto-routing to that brain in the router config.

---

## Research Sources

- [Implementing MCP: Tips, Tricks and Pitfalls (NearForm)](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/)
- [MCP Security Survival Guide (Towards Data Science)](https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/)
- [Everything Wrong with MCP (Shrivu Shankar)](https://blog.sshh.io/p/everything-wrong-with-mcp)
- [Claude Desktop: 19 incidents in 14 days (GitHub)](https://gist.github.com/LEX8888/675867b7f130b7ad614905c9dd86b57a)
- [Why Multi-Agent Systems Fail: 17x Error Trap (TDS)](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)
- [Cascading Failures in Agentic AI: OWASP ASI08 Guide 2026 (Adversa AI)](https://adversa.ai/blog/cascading-failures-in-agentic-ai-complete-owasp-asi08-security-guide-2026/)
- [MCP Security Vulnerabilities: Prompt Injection & Tool Poisoning (Practical DevSecOps)](https://www.practical-devsecops.com/mcp-security-vulnerabilities/)
- [Agentic Resource Exhaustion: The Infinite Loop Attack (InstaTunnel)](https://medium.com/@instatunnel/agentic-resource-exhaustion-the-infinite-loop-attack-of-the-ai-era-76a3f58c62e3)
- [OpenClaw #3181: Runaway heartbeat loop](https://github.com/openclaw/openclaw/issues/3181)
- [Claude Code #11778: Orphaned MCP server processes](https://github.com/anthropics/claude-code/issues/11778)
- [Claude Code #3487: Stdio transport failure recovery blocked](https://github.com/anthropics/claude-code/issues/3487)
- [SQLite WAL mode documentation](https://sqlite.org/wal.html)
- [SQLite file locking and concurrency](https://sqlite.org/lockingv3.html)
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [New Prompt Injection Attack Vectors Through MCP Sampling (Palo Alto Unit42)](https://unit42.paloaltonetworks.com/model-context-protocol-attack-vectors/)
