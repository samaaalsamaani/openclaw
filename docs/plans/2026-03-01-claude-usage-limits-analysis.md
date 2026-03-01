# Claude Max Plan — Usage Limits Root Cause Analysis

**Date:** 2026-03-01
**Symptom:** Hitting usage limits despite daily/weekly counters appearing healthy
**Status:** Root causes identified, mitigations documented

---

## The Core Paradox

Anthropic's Max plan uses a **5-hour rolling window**, not a 24-hour bucket. The dashboard shows daily aggregates; the enforcer measures the last 5 hours. A 1-hour burst can exhaust the 5-hour window while the daily counter barely moves.

---

## Data Summary (Feb 20 – Mar 1, 2026)

### Daily Usage

| Date       | Sessions | API Requests | Cache Reads | Peak Concurrent |
| ---------- | -------- | ------------ | ----------- | --------------- |
| Feb 22     | 2        | 316          | 20M         | ~1              |
| Feb 23     | 12       | 2,420        | 226M        | ~2              |
| Feb 24     | 26       | 4,606        | 452M        | ~3              |
| Feb 25     | 24       | 3,149        | 318M        | ~3              |
| **Feb 26** | **323**  | **5,237**    | **464M**    | **24 🔴**       |
| Feb 27     | 36       | 4,884        | 638M        | 6               |
| Feb 28     | 7        | 2,602        | 671M        | ~2              |

**Totals across 8 days:**

- 23,250 API requests
- 2.79 billion cache read tokens
- 552K actual input tokens (cache reads are 5,000× larger)

### Model Distribution

```
claude-opus-4-6:         16,069 requests  (69%)
claude-sonnet-4-5:        4,852 requests  (21%)
claude-sonnet-4-6:        1,980 requests   (9%)
claude-haiku-4-5:           318 requests   (1%)
```

### Session Startup Cost

Every new session pays a fixed overhead on the first API request:

- Cache creation (first time): avg **15,413 tokens**
- Cache read (warm starts): avg **43,764 tokens**
- Combined startup tax: **~59K tokens per session**

---

## Root Causes

### 1. Agent Team Concurrency Spike (Primary)

**Feb 26 at 08:00–08:05: 24 simultaneous active sessions.**

The `team` skill and GSD's `execute-phase` (wave-based parallelization) spawn 5–24 agents simultaneously. Every agent opens a new session, reads the full context on every turn, and makes multiple tool calls — each tool call is a separate API round-trip.

24 concurrent sessions generate a **synchronized burst** into Anthropic's API. All sessions share one account's rate limit pool within the same 5-hour window.

At peak: 24 sessions × ~400 requests/hour = 9,600 requests/hour = 160 req/min.

### 2. 69% of Requests Use Opus 4.6

Opus is Anthropic's most capacity-constrained model. The 5-hour window for Opus is dramatically tighter than for Sonnet. Sub-agents doing file reads, grep searches, planning steps, and code reviews are all running Opus when Sonnet is sufficient.

### 3. Session Startup Overhead at Scale

The `kb-context-inject.sh` hook injects ~22K tokens on every new session start, including every sub-agent launch. Evidence from debug logs:

```
[DEBUG] Auto tool search enabled: 22529 tokens (threshold: 20000, 10% of context)
```

With 323 sessions on Feb 26: `323 × 59K = ~19M tokens` in session startup overhead alone.

### 4. Auto Tool Search Overhead

The debug logs show ToolSearch firing **dozens of times per second** during heavy sessions, triggered whenever context exceeds 20K tokens (which happens immediately given startup overhead). Each ToolSearch invocation is itself a token-consuming operation that acts as a per-turn multiplier.

### 5. Cache Reads Count Toward Rate Limits

Cache reads (2.79B tokens) dwarf actual input tokens (552K) by 5,000×. While cache reads cost less per-token than uncached input, they still count toward the 5-hour throughput bucket. The 638M cache reads on Feb 27 alone represent enormous effective throughput even at the discounted rate.

---

## Mitigations

### Immediate (High Impact)

**1. Cap agent team concurrency to 3–5 max**
The GSD executor's wave-based parallelization is the primary Feb 26 culprit. Setting max wave size to 4–5 agents prevents synchronized bursts from overwhelming the 5-hour window.

**2. Switch sub-agents to Sonnet by default**
In `gsd:execute-phase`, `team`, and any skill that spawns sub-agents: default model should be `sonnet` (claude-sonnet-4-6), not the parent session's model. Only the final synthesis/decision-making step justifies Opus. This alone could cut rate-limit exposure by 50–60%.

**3. Stagger agent launches**
Add a 2–3 second delay between agent spawns. The cache is already warm; synchronized starts provide no benefit but create a burst spike.

### Medium-Term

**4. Skip KB context injection for sub-agents**
The `kb-context-inject.sh` hook fires for every session including programmatic sub-agents. Sub-agents doing file reads, grep operations, or focused coding tasks rarely need full KB context. Add a detection mechanism (env variable or session type flag) to skip the hook for agent-spawned sessions.

**5. Monitor the 5-hour window, not the daily counter**
The actionable metric is: "how many effective tokens have I processed in the last 5 hours?" — not the daily total. A simple monitoring script that sums `cache_read_tokens × 0.1 + input_tokens + output_tokens` over a rolling 5-hour window from the session JSONL files would surface the real pressure.

**6. Use Haiku for pure tool-use sub-agents**
Sub-agents whose entire job is running Bash commands, reading files, or executing searches don't need reasoning capability. Haiku is significantly less rate-limited and handles tool execution reliably.

---

## Recommended Configuration Changes

In `gsd:execute-phase` and the `team` skill:

```yaml
# Before
max_parallel_waves: 10
default_model: inherit  # inherits Opus from parent

# After
max_parallel_waves: 4
default_model: sonnet   # claude-sonnet-4-6
opus_only_for: [synthesis, final-review, architecture-decisions]
```

In `kb-context-inject.sh`:

```bash
# Skip injection for programmatic sub-agents
if [[ "${CLAUDE_AGENT_TYPE:-}" == "subagent" ]]; then
  exit 0
fi
```

---

## Key Numbers for Reference

- **2.79B** total cache read tokens (8 days)
- **23,250** total API requests (8 days)
- **24** peak concurrent sessions (Feb 26 08:00)
- **69%** of requests used Opus 4.6 (most rate-limited model)
- **59K tokens** average session startup cost
- **5 hours** — the actual rate limit window (not 24h/weekly)
- **5,000×** — ratio of cache reads to actual input tokens
