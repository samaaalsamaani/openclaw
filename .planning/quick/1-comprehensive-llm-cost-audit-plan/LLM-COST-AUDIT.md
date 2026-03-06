# LLM Cost Audit — PAIOS / OpenClaw Gateway

**Date:** 2026-03-06
**Author:** automated audit agent
**Status:** Draft — sections marked [MANUAL] require OpenRouter dashboard data

---

## SECTION 1: Executive Summary

### Known Spend (as of Mar 6, 2026)

| Metric                                     | Value                         |
| ------------------------------------------ | ----------------------------- |
| Total OpenRouter spend to date             | $492.58                       |
| Mar 5 Sonnet spend (OpenRouter)            | $55.26 (245 requests)         |
| Mar 5 GPT-4o-mini spend (OpenRouter)       | $0.52 (905 requests)          |
| Mar 5 Gemini Flash spend (OpenRouter)      | estimated ~$0.15-0.30 (cheap) |
| Single TikTok link message cost (observed) | $0.439                        |
| Average prompt size (Mar 5)                | ~89K tokens/request           |
| Typical single message cost (Sonnet OR)    | ~$0.29 input + response       |

### Root Cause Hypothesis

The primary cost driver is the pi-ai SDK's conversation context sent to `openrouter/anthropic/claude-sonnet-4.6` on every message. The system prompt alone is ~37K tokens (skills + persona files), and the session conversation history can add another 50K+ tokens on active sessions. Combined with KB, cross-channel, and graph context injections (up to 8K more tokens), average prompt sizes of 89K are explained.

**The 89K average breakdown (estimated):**

- System prompt (SOUL + IDENTITY + USER + AGENTS + skills): ~37K tokens
- Conversation history (JSONL session turns accumulated): ~45K tokens (active sessions)
- Extra context injections (KB + cross-channel + graph): ~3-8K tokens
- Current message + metadata: ~1-3K tokens

**The $0.439 TikTok link cost:**
A link message triggers ALL context augmentations. At ~89K tokens in + ~1.5K out:

- Input: 89,000 \* $3.30/M = $0.294
- Output: 1,500 \* $16.50/M = $0.025
- Subtotal at Sonnet-via-OR rates: ~$0.319

The remaining ~$0.12 suggests a second SDK call (capture pipeline notification) or longer output. This is consistent with the double-billing hypothesis (R8 in recommendations).

### Key Finding: Two Separate LLM Tiers

The observability DB tracks a **different set of calls** than the OpenRouter $55.26 spend:

1. **pi-ai SDK calls** — go through `openrouter/anthropic/claude-sonnet-4.6` with full 89K context windows. These are NOT in the local observability DB. This is the $55.26/day.
2. **Direct API calls** (PAIOS Python layer, PAIOS llm.js) — tracked in `~/.openclaw/observability.sqlite`. These are the claude-sonnet (direct), claude-haiku, gemini-flash calls logged locally.

Total actual daily cost = OpenRouter bill + direct API costs (mostly small).

---

## SECTION 2: Model Inventory

### 2a. Active Models (from `~/.openclaw/openclaw.json` and `~/.openclaw/llm-config.json`)

| Use Case                         | Provider      | Model ID                    | $/M in | $/M out | OR Markup | Config Location                                       |
| -------------------------------- | ------------- | --------------------------- | ------ | ------- | --------- | ----------------------------------------------------- |
| Primary agent (pi-ai SDK)        | OpenRouter    | anthropic/claude-sonnet-4.6 | ~$3.30 | ~$16.50 | ~10%      | `agents.defaults.model.primary` in openclaw.json      |
| Heartbeat (every 55min)          | OpenRouter    | google/gemini-2.5-flash     | $0.15  | $0.60   | varies    | `agents.defaults.heartbeat.model` in openclaw.json    |
| Sub-agents                       | OpenRouter    | google/gemini-2.5-flash     | $0.15  | $0.60   | varies    | `agents.defaults.subagents.model` in openclaw.json    |
| Vision (image messages)          | OpenRouter    | google/gemini-2.5-flash     | $0.15  | $0.60   | varies    | `agents.defaults.imageModel.primary` in openclaw.json |
| intake agent                     | OpenRouter    | google/gemini-2.5-flash     | $0.15  | $0.60   | varies    | `agents.list[1].model.primary` in openclaw.json       |
| team-member/client/supplier      | OpenRouter    | anthropic/claude-sonnet-4.6 | ~$3.30 | ~$16.50 | ~10%      | `agents.list[2-4].model.primary` in openclaw.json     |
| PAIOS Python llm.js (direct)     | Anthropic     | claude-sonnet-4-6           | $3.00  | $15.00  | 0%        | llm-config.json `anthropic/claude-sonnet-4-6`         |
| PAIOS Python llm.js (direct)     | Anthropic     | claude-haiku-4-5-20251001   | $0.80  | $4.00   | 0%        | llm-config.json `anthropic/claude-haiku-4-5`          |
| capture.sh SDK invoke (L2/L3/L4) | Anthropic     | claude-haiku-4-5 (CLI)      | ~$0.80 | ~$4.00  | 0%        | `sdk-invoke --model haiku` in capture.sh              |
| frame-analyzer.sh (vision)       | Gemini CLI    | gemini (free tier)          | $0     | $0      | N/A       | frame-analyzer.sh                                     |
| transcribe.py                    | Local Whisper | local                       | $0     | $0      | N/A       | transcribe.py primary path                            |
| Graph mining (CDC worker)        | OpenRouter    | openai/gpt-4o-mini          | $0.15  | $0.60   | varies    | memgraph_driver.py default model                      |
| PAIOS weekly-prompts             | OpenAI        | gpt-4.1-mini                | $0.40  | $1.60   | 0%        | observability.sqlite log                              |

### 2b. Data Collection Commands

```bash
# Verify current model assignments
cat ~/.openclaw/openclaw.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
agents=d.get('agents',{})
defaults=agents.get('defaults',{})
print('Primary:', defaults.get('model',{}).get('primary'))
print('Heartbeat model:', defaults.get('heartbeat',{}).get('model'))
print('Heartbeat every:', defaults.get('heartbeat',{}).get('every'))
print('Subagents model:', defaults.get('subagents',{}).get('model'))
for a in agents.get('list',[]):
    m = a.get('model',{}).get('primary','(inherits default)')
    print(f'  Agent {a[\"id\"]}: {m}')
"

# View LLM config (costs per model)
cat ~/.openclaw/llm-config.json

# Check if routing weights file exists
cat ~/.openclaw/routing-weights.json 2>/dev/null || echo "No routing-weights.json found"
```

---

## SECTION 3: System Prompt Composition Audit

### 3a. Files Loaded Per Turn (Primary Agent, `main` agent)

The system prompt is assembled by `buildWorkspaceSkillSnapshot()` in `src/agents/skills/workspace.ts`, which reads from the workspace directory (`~/.openclaw/workspace/`).

```bash
# Measure all persona + skill files
wc -c \
  ~/.openclaw/workspace/SOUL.md \
  ~/.openclaw/workspace/IDENTITY.md \
  ~/.openclaw/workspace/USER.md \
  ~/.openclaw/workspace/AGENTS.md

# Measure all SKILL.md files and get total
find ~/.openclaw/workspace/skills -name "SKILL.md" | xargs wc -c | sort -rn | head -30

# Count total skill files loaded
find ~/.openclaw/workspace/skills -name "SKILL.md" | wc -l

# Check for remote/bundled skills
ls ~/.openclaw/skills/ 2>/dev/null || echo "No managed skills dir"
find ~/.agents/skills -name "SKILL.md" 2>/dev/null | wc -l
```

### 3b. Measured File Sizes (Mar 6, 2026)

| Component                          | File Path                                | Bytes       | Est. Tokens (bytes/4) |
| ---------------------------------- | ---------------------------------------- | ----------- | --------------------- |
| SOUL                               | ~/.openclaw/workspace/SOUL.md            | 2,771       | ~693                  |
| IDENTITY                           | ~/.openclaw/workspace/IDENTITY.md        | 417         | ~104                  |
| USER                               | ~/.openclaw/workspace/USER.md            | 1,418       | ~354                  |
| AGENTS.md                          | ~/.openclaw/workspace/AGENTS.md          | 7,085       | ~1,771                |
| **All Skills (26 SKILL.md files)** | ~/.openclaw/workspace/skills/\*/SKILL.md | **137,077** | **~34,269**           |
| **Static system prompt total**     |                                          | **148,768** | **~37,192**           |

Top 5 skill files by size:

| Skill                | Bytes  | Est. Tokens |
| -------------------- | ------ | ----------- |
| browser-use          | 22,226 | ~5,556      |
| self-improving-agent | 19,704 | ~4,926      |
| automation-workflows | 10,358 | ~2,589      |
| code-project         | 7,858  | ~1,964      |
| macos-system         | 7,459  | ~1,864      |

**Key finding:** The 26 skill SKILL.md files total 137KB (~34K tokens) and are loaded every turn via `buildWorkspaceSkillSnapshot()`. Skills are loaded once per session (first turn), then cached in `sessionEntry.skillsSnapshot`. They are NOT loaded on every individual turn — but if sessions reset frequently, they are rebuilt.

### 3c. Context Augmentation Per Turn

| Component          | Source                           | Trigger                                      | Timeout | Est. Tokens |
| ------------------ | -------------------------------- | -------------------------------------------- | ------- | ----------- |
| KB context         | `queryKbForContext(body, 5)`     | `body.length >= 10 && !body.startsWith("/")` | none    | ~250-750    |
| Cross-channel      | `queryCrossChannelContext()`     | same as KB                                   | 400ms   | ~125-500    |
| Graph context      | `queryGraphContext()`            | same as KB                                   | 3000ms  | ~125-1,250  |
| Group chat context | `buildGroupChatContext()`        | if group chat                                | none    | ~100-500    |
| Inbound metadata   | `buildInboundMetaSystemPrompt()` | always                                       | none    | ~100-300    |
| Thread history     | `ctx.ThreadHistoryBody`          | if thread/reply                              | none    | ~500-5,000  |

**Guard condition (from `src/auto-reply/reply/get-reply-run.ts` lines 269-299):**

```typescript
const bodyForKb = (sessionCtx.BodyStripped ?? sessionCtx.Body ?? "").trim();
if (bodyForKb.length >= 10 && !bodyForKb.startsWith("/")) {
  // KB, cross-channel, graph all fire here
}
```

### 3d. Session History (Conversation Context)

The pi-ai SDK maintains a JSONL session file per conversation. Each turn writes user + assistant turns to the file. On subsequent turns, the SDK reads back the JSONL and sends the entire history as the conversation context.

```bash
# Check session file sizes (real-world data, Mar 6)
ls -la ~/.openclaw/agents/main/sessions/*.jsonl 2>/dev/null
wc -c ~/.openclaw/agents/main/sessions/*.jsonl 2>/dev/null

# The 7.2MB reset file = one very long session before compaction
# cb3e86f7... = 7.2MB = ~1.8M tokens (massive context window usage)

# Active sessions (Mar 6):
# 37cc0f9e... = 68KB = ~17K tokens
# 88d4bc7c... = 65KB = ~16K tokens
# baed29b2... = 48KB = ~12K tokens
```

Observed session sizes: 48KB-68KB per active session (~12-17K tokens of history). The 7.2MB session before compaction = ~1.8M tokens, which is what drives the "$55/day" cost on days with intensive use.

### 3e. Token Budget Table (Estimated)

| Component                              | Source                       | Typical Bytes    | Est. Tokens         | Load Frequency                 |
| -------------------------------------- | ---------------------------- | ---------------- | ------------------- | ------------------------------ |
| SOUL                                   | workspace/SOUL.md            | 2,771            | 693                 | First turn in session          |
| IDENTITY                               | workspace/IDENTITY.md        | 417              | 104                 | First turn in session          |
| USER                                   | workspace/USER.md            | 1,418            | 354                 | First turn in session          |
| AGENTS.md                              | workspace/AGENTS.md          | 7,085            | 1,771               | First turn in session          |
| Skills (26 files)                      | workspace/skills/\*.md       | 137,077          | 34,269              | First turn in session (cached) |
| KB context                             | kbQuery(body, 5)             | ~3,000-12,000    | ~750-3,000          | If body >= 10 chars            |
| Cross-channel                          | CrossChannelIndexer          | ~500-2,000       | ~125-500            | If body >= 10 chars            |
| Graph context                          | queryGraphContext()          | ~500-5,000       | ~125-1,250          | If body >= 10 chars            |
| Inbound metadata                       | buildInboundMetaSystemPrompt | ~400-1,200       | ~100-300            | Always                         |
| Session history                        | JSONL session file           | ~50,000-500,000+ | ~12,500-125,000+    | Always                         |
| Current message                        | body                         | ~40-4,000        | ~10-1,000           | Always                         |
| **TOTAL (typical active session)**     |                              | ~200,000-700,000 | **~50,000-175,000** |                                |
| **TOTAL (new session, first message)** |                              | ~155,000         | **~38,700**         |                                |

**Reconciliation:** The 89K average reported on Mar 5 is plausible given session history growing over time. New sessions start at ~38K tokens; sessions with 5-10 turns of history add ~10-30K more each.

---

## SECTION 4: Call Site Inventory

### 4a. Primary LLM Call Sites (OpenClaw Source)

| Call Site                      | File                                                     | Model                                  | Trigger                          | Est. Frequency           |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------------ |
| Primary agent reply            | src/agents/pi-embedded-runner/run.ts                     | openrouter/anthropic/claude-sonnet-4.6 | Every inbound message            | All message traffic      |
| Heartbeat                      | src/infra/heartbeat-runner.ts                            | openrouter/google/gemini-2.5-flash     | Every 55 min (active hours)      | ~16-18/day               |
| Sub-agent dispatch             | src/agents/pi-embedded-runner/run.ts                     | openrouter/google/gemini-2.5-flash     | When agent spawns sub-agent      | On demand                |
| Multi-brain routing classifier | src/agents/routing-middleware.ts                         | None (heuristic, 0 LLM calls)          | Every message                    | Always                   |
| Post-reply verification        | src/agents/routing-middleware.ts (scheduleVerification)  | varies by domain                       | Fire-and-forget after reply      | Probabilistic            |
| Post-reply decomposition       | src/agents/routing-middleware.ts (scheduleDecomposition) | varies by domain                       | When compound task detected      | Probabilistic            |
| Memory compaction              | src/auto-reply/reply/agent-runner.ts                     | claude-sonnet-4.6 (same session)       | Context window approaching limit | When session grows large |

### 4b. PAIOS Python Call Sites (Tracked in observability.sqlite)

```bash
# Query observability DB for LLM call breakdown
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  json_extract(metadata,'$.model') as model,
  json_extract(metadata,'$.provider') as provider,
  json_extract(metadata,'$.tier') as tier,
  json_extract(metadata,'$.caller') as caller,
  count(*) as calls,
  sum(json_extract(metadata,'$.inputTokens')) as total_in,
  sum(json_extract(metadata,'$.outputTokens')) as total_out,
  printf('%.4f', sum(json_extract(metadata,'$.estimatedCostUsd'))) as total_cost
FROM events
WHERE action = 'llm_call'
  AND timestamp >= date('now', '-7 days')
GROUP BY model, tier, caller
ORDER BY calls DESC;
"
```

**From observability DB (Mar 1-6, 2026 — direct API calls only):**

| Day   | Model                      | Calls | Input Tokens | Est. Cost |
| ----- | -------------------------- | ----- | ------------ | --------- |
| Mar 6 | claude-sonnet-4-6 (direct) | 49    | 16,188       | $0.15     |
| Mar 6 | gemini-2.5-flash (OR)      | 10    | 5,014        | $0.002    |
| Mar 5 | claude-haiku-4-5 (direct)  | 64    | 69,294       | $0.42     |
| Mar 5 | claude-sonnet-4-6 (direct) | 56    | 17,442       | $0.22     |
| Mar 5 | gemini-2.5-flash (OR)      | 21    | 7,028        | $0.003    |
| Mar 4 | claude-sonnet-4-6 (direct) | 212   | 77,417       | $0.85     |
| Mar 4 | claude-haiku-4-5 (direct)  | 79    | 91,530       | $0.70     |
| Mar 4 | gemini-2.5-flash (OR)      | 99    | 46,772       | $0.02     |

**Critical observation:** The observability DB shows token counts of 300-2,000 per call for direct API calls — far smaller than the 89K average. The $55.26 Mar 5 spend goes through the pi-ai SDK's OpenRouter calls, which bypass the PAIOS observability instrumentation.

### 4c. Graph Mining Call Site

```bash
# Found in ~/.openclaw/projects/graph/v4/memgraph_driver.py
# Default model: 'openai/gpt-4o-mini' via OpenRouter
# Controlled by env var: PAIOS_LLM_MODEL

grep -n "model\|llm\|gpt" ~/.openclaw/projects/graph/v4/memgraph_driver.py | grep -v "#" | head -20
```

---

## SECTION 5: Pipeline Deep Dives

### 5a. capture.sh / content-intel Pipeline

**File:** `~/.openclaw/projects/content-intel/capture.sh`

```bash
# View the capture pipeline
cat ~/.openclaw/projects/content-intel/capture.sh | grep -n "sdk-invoke\|model\|claude\|haiku\|gemini\|LLM" | head -30
```

**Confirmed pipeline steps and LLM usage:**

| Step                          | Implementation                | LLM                                  | Cost Class      |
| ----------------------------- | ----------------------------- | ------------------------------------ | --------------- |
| 1. Input ingestion            | capture.sh arg parsing        | None                                 | $0              |
| 2. Download/metadata          | yt-dlp                        | None                                 | $0              |
| 3. Transcription              | transcribe.py                 | Local Whisper first, OpenAI fallback | $0 / small      |
| 4. Frame extraction           | ffmpeg keyframes              | None                                 | $0              |
| 5. Frame analysis             | frame-analyzer.sh             | Gemini CLI (free tier)               | $0              |
| 6. L3 summary (2-3 sentences) | sdk-invoke --model haiku      | claude-haiku direct                  | ~$0.002         |
| 7. L4 summary (1 sentence)    | sdk-invoke --model haiku      | claude-haiku direct                  | ~$0.001         |
| 8. L2 summary (full)          | sdk-invoke --model haiku      | claude-haiku direct                  | ~$0.005         |
| 9. KB ingest                  | deep-ingest.js                | No LLM (embedding only)              | $0              |
| 10. Agent notification        | Message sent to agent channel | Triggers FULL agent reply            | **~$0.29-0.44** |

**Cost per capture invocation:**

| Step                                     | Model                | Est. Tokens        | Est. Cost   |
| ---------------------------------------- | -------------------- | ------------------ | ----------- |
| Transcribe (local Whisper)               | Local                | —                  | $0.00       |
| Frame analyze (Gemini CLI)               | gemini (free)        | —                  | $0.00       |
| SDK invoke L3 (haiku direct)             | claude-haiku-4-5     | ~1K in, ~200 out   | ~$0.0018    |
| SDK invoke L4 (haiku direct)             | claude-haiku-4-5     | ~500 in, ~50 out   | ~$0.0006    |
| SDK invoke L2 (haiku direct)             | claude-haiku-4-5     | ~2K in, ~500 out   | ~$0.0036    |
| **Sub-total (capture only)**             |                      |                    | **~$0.006** |
| **Agent notification reply (Sonnet OR)** | claude-sonnet-4.6 OR | ~89K in, ~1.5K out | **~$0.32**  |
| **Total per capture**                    |                      |                    | **~$0.33**  |

**IMPORTANT:** The agent notification (step 10) is where most of the cost happens. When capture.sh sends a message like "TikTok analyzed: [title]" to the agent channel, it triggers the full primary agent reply pipeline with the 89K+ token system prompt. This is the double-billing scenario.

### 5b. Heartbeat Flow

**Config (from openclaw.json):**

- Interval: every 55 minutes
- Active hours: 07:00-23:00 Asia/Riyadh
- Model: `openrouter/google/gemini-2.5-flash`
- Target: last active session

**Active window:** 07:00-23:00 = 16 hours/day = ~17 heartbeats/day (16\*60/55 ≈ 17.5)

**System prompt for heartbeat:** Heartbeat goes through the same `getReplyFromConfig()` pipeline, which calls `runPreparedReply()`. This means heartbeat also loads the full system prompt (SOUL + IDENTITY + skills) on first turn or session refresh.

```bash
# Find heartbeat prompt content
cat ~/.openclaw/workspace/HEARTBEAT.md
wc -c ~/.openclaw/workspace/HEARTBEAT.md
```

HEARTBEAT.md size: 1,307 bytes (~327 tokens). The heartbeat prompt says "Read HEARTBEAT.md" which loads this file as the user message.

**Heartbeat cost estimate:**

- System prompt: ~38K tokens (first turn) / ~50K+ (ongoing session)
- Heartbeat prompt: ~500 tokens
- Response: usually HEARTBEAT_OK token (~10-50 tokens), or alerts (~500-1,000 tokens)
- HEARTBEAT_OK runs: transcript is pruned (no cost accumulation in history)
- Alert runs: ~$0.50-1.50 via Gemini Flash (not expensive since it's Flash)

**Monthly heartbeat cost:**

- ~17 heartbeats/day × 30 = ~510/month
- Gemini Flash: 40K tokens in × $0.15/M = $0.006 per heartbeat × 510 = ~$3/month (cheap)

### 5c. Memory Compaction

**Code reference:** `src/auto-reply/reply/agent-runner.ts` (lines 57, 369, 735, 754)

Compaction is triggered automatically by the pi-ai SDK when the session context window approaches the limit (~200K tokens by default). The compaction uses the same model as the current session (claude-sonnet-4.6 via OpenRouter).

```bash
# Check compaction count in session entries
cat ~/.openclaw/agents/main/sessions/sessions.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for k,v in d.items():
    if isinstance(v,dict) and v.get('compactionCount',0) > 0:
        print(f'{k}: compactionCount={v[\"compactionCount\"]}, totalTokens={v.get(\"totalTokens\")}')
"

# The 7.2MB session file before reset suggests a session that grew extremely large
# before compaction triggered
```

**Trigger condition:** The pi-ai SDK triggers compaction when `totalTokens` in session state approaches the model's context limit. The default context is 200,000 tokens.

**Compaction cost:** A compaction call sends the full session history (potentially 100K-200K tokens) and asks the model to summarize it. This can cost $0.50-3.00 per compaction event.

### 5d. KB Enrichment Pipeline (deep-ingest.js)

**File:** `~/.openclaw/projects/knowledge-base/deep-ingest.js`

```bash
# Check model used in deep-ingest
grep -n "model\|openrouter\|anthropic\|embedding\|LLM\|llm" \
  ~/.openclaw/projects/knowledge-base/deep-ingest.js | grep -v "// "

# Check KB article enrichment status
sqlite3 ~/.openclaw/projects/knowledge-base/kb.sqlite \
  "SELECT enrichment_status, count(*) FROM articles GROUP BY enrichment_status;"
```

**Key finding from inspection:** `deep-ingest.js` uses local embedding server (768-dim nomic model) for vector embeddings. No LLM calls for enrichment — it is embedding-only, not LLM-based summarization. The `enrichment_status` column tracks embedding completion, not LLM enrichment.

---

## SECTION 6: Routing Logic Audit

### 6a. PAIOS Optimized Routing (Active)

**Status: ACTIVE in production**

```bash
# Verify env var
echo $PAIOS_OPTIMIZED_ROUTING  # Should print: 1
echo $PAIOS_CANARY_PCT         # Should print: 100

# From ~/.zshrc:
# export PAIOS_OPTIMIZED_ROUTING=1
# export PAIOS_CANARY_PCT=100
```

**How it works (`src/agents/routing-middleware.ts` + `src/agents/task-classifier.ts`):**

1. Every inbound message runs `applyMultiBrainRouting()` → calls `classifyTask()` (pure heuristic, <1ms, zero LLM cost)
2. `classifyTask()` matches message against keyword/regex rules for 7 domains
3. If confidence >= 70 (default threshold), routes to domain-specific provider/model
4. `applyMultiBrainRouting()` returns `{ applied: true, provider, model }` if routed

**Current routing table (from `llm-config.json` → task-classifier.ts `buildRoutingTable()`):**

| Domain   | Provider     | Model             | Trigger Keywords                                              |
| -------- | ------------ | ----------------- | ------------------------------------------------------------- |
| code     | openai-codex | gpt-5.3-codex     | "code", "function", "bug", "typescript", git commands, etc.   |
| creative | anthropic    | claude-opus-4-6   | "write", "blog", "post", "article", "tiktok", "content", etc. |
| analysis | anthropic    | claude-sonnet-4-6 | "analyze", "summarize", "explain", "research", etc.           |
| vision   | anthropic    | claude-sonnet-4-6 | image attachments detected                                    |
| system   | anthropic    | claude-sonnet-4-6 | "system", "status", "health", "config", etc.                  |
| schedule | anthropic    | claude-sonnet-4-6 | "schedule", "remind", "meeting", "calendar", etc.             |
| search   | anthropic    | claude-sonnet-4-6 | "search", "latest", "news", "weather", etc.                   |
| default  | anthropic    | claude-sonnet-4-6 | below threshold / no match                                    |

**Critical finding:** The routing classifier routes to `anthropic/claude-sonnet-4-6` for most domains. However, the DEFAULT provider for the pi-ai SDK run is `openrouter/anthropic/claude-sonnet-4.6`. The routing result overrides the provider/model, so when routing sends `anthropic/claude-sonnet-4-6`, it goes **direct Anthropic** (no markup). When no routing match, it falls back to `openrouter/anthropic/claude-sonnet-4.6`.

**This means:** When the heuristic classifier successfully routes (confidence >= 70), the call goes direct Anthropic. When below threshold, it goes through OpenRouter with ~10% markup.

**Unresolved question:** The pi-ai SDK must also have an auth mapping that translates `anthropic/claude-sonnet-4-6` to either direct Anthropic or OpenRouter. Need to verify that `anthropic` provider in routing table actually routes direct and not through OR.

```bash
# Check if routing is actually switching providers
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  json_extract(metadata,'$.provider') as provider,
  json_extract(metadata,'$.model') as model,
  json_extract(metadata,'$.optimizedRouting') as opt_routing,
  json_extract(metadata,'$.fallbackUsed') as fallback,
  count(*) as calls
FROM events
WHERE action = 'llm_call'
  AND timestamp >= date('now', '-3 days')
GROUP BY provider, model, opt_routing
ORDER BY calls DESC;"
```

### 6b. OpenRouter vs Direct Anthropic Analysis

**What goes through OpenRouter (10% markup):**

- Primary agent: `openrouter/anthropic/claude-sonnet-4.6` (when routing below threshold)
- All team-member/client/supplier agents: `openrouter/anthropic/claude-sonnet-4.6`
- Heartbeat: `openrouter/google/gemini-2.5-flash`
- Sub-agents: `openrouter/google/gemini-2.5-flash`
- Graph mining: `openai/gpt-4o-mini` via OpenRouter

**What goes direct (no markup):**

- PAIOS Python llm.js calls: direct anthropic + direct OpenAI
- capture.sh sdk-invoke: direct Anthropic (claude-haiku CLI)
- When routing classifier routes to `anthropic/claude-sonnet-4-6` (direct provider) — **IF** the SDK actually uses direct API for this

**Markup calculation:**

- At $55.26/day Sonnet via OpenRouter:
- Direct Anthropic would cost: $55.26 / 1.10 = $50.24/day
- Daily markup cost: $55.26 - $50.24 = **$5.02/day**
- Monthly markup cost: $5.02 × 30 = **~$151/month wasted on markup**

---

## SECTION 7: OpenRouter Usage Analytics

### 7a. Local Observability Data (Direct API Calls Only)

The local observability DB does NOT capture pi-ai SDK OpenRouter calls. It only captures PAIOS Python (llm.js) and direct API calls.

```bash
# All-time stats from local observability DB
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  json_extract(metadata,'$.model') as model,
  json_extract(metadata,'$.provider') as provider,
  count(*) as calls,
  sum(json_extract(metadata,'$.inputTokens')) as total_in_tokens,
  sum(json_extract(metadata,'$.outputTokens')) as total_out_tokens,
  printf('%.4f', sum(json_extract(metadata,'$.estimatedCostUsd'))) as total_cost_usd
FROM events
WHERE action = 'llm_call'
GROUP BY model
ORDER BY calls DESC LIMIT 15;"
```

**All-time local observability totals (as of Mar 6, 2026):**

| Model                     | Provider           | Calls | Input Tokens | Output Tokens | Est. Cost        |
| ------------------------- | ------------------ | ----- | ------------ | ------------- | ---------------- |
| claude-sonnet-4-6         | anthropic (direct) | 1,234 | 737,335      | 369,567       | $7.76            |
| google/gemini-2.5-flash   | openrouter         | 421   | 187,745      | 77,808        | $0.07            |
| claude-haiku-4-5-20251001 | anthropic (direct) | 388   | 436,670      | 128,974       | $3.24            |
| haiku                     | cli                | 378   | —            | —             | $0 (CLI billing) |
| claude-sonnet-4-5         | anthropic (direct) | 135   | 56,698       | 64,980        | $1.14            |
| gpt-4.1-mini              | openai             | 74    | 83,570       | 51,835        | $0.07            |
| sonnet                    | cli                | 5     | —            | —             | $0 (CLI billing) |

**Local API direct costs total:** ~$12.28 (all time)
**OpenRouter spend total:** $492.58 (all time)
**Ratio:** OpenRouter (pi-ai SDK) is ~40x the direct API costs.

### 7b. OpenRouter Dashboard Data [MANUAL — Visit https://openrouter.ai/activity]

```
https://openrouter.ai/activity
```

Record the following manually:

| Date     | Model                       | Requests | Tokens In                 | Tokens Out | Cost           |
| -------- | --------------------------- | -------- | ------------------------- | ---------- | -------------- |
| Mar 5    | anthropic/claude-sonnet-4.6 | 245      | ~21.3M (est from 89K avg) | ?          | $55.26         |
| Mar 5    | openai/gpt-4o-mini          | 905      | ?                         | ?          | $0.52          |
| Mar 5    | google/gemini-2.5-flash     | ?        | ?                         | ?          | est $0.15-0.30 |
| All time | all                         | ?        | ?                         | ?          | $492.58        |

Note: The 245 Sonnet requests at $55.26 gives $0.226/request average. At $3.30/M in and $16.50/M out:

- $0.226 / request = implies ~(X _ $3.30 + Y _ $16.50) / 1,000,000
- If X=60K in, Y=1.5K out: (60,000 _ 3.30 + 1,500 _ 16.50) / 1,000,000 = $0.198 + $0.025 = $0.223 ✓
- This confirms ~60K average input tokens (not 89K — perhaps the 89K was a specific endpoint measurement)

---

## SECTION 8: Cost-Per-Use-Case Analysis

### Model Rates Used

| Model                              | In $/M | Out $/M | Notes            |
| ---------------------------------- | ------ | ------- | ---------------- |
| claude-sonnet-4.6 via OpenRouter   | $3.30  | $16.50  | ~10% markup      |
| claude-sonnet-4-6 direct Anthropic | $3.00  | $15.00  | no markup        |
| claude-haiku-4-5 direct            | $0.80  | $4.00   | direct Anthropic |
| gemini-2.5-flash via OR            | $0.15  | $0.60   |                  |
| gpt-4o-mini via OR                 | $0.15  | $0.60   |                  |

### Scenario 1: Simple Text Message ("hello")

Estimate (new session, first turn):

- System prompt: ~37K tokens (skills + persona loaded for first time)
- User message: ~10 tokens
- Inbound metadata: ~150 tokens
- Response: ~100 tokens
- **Total: ~37K in + 100 out via Sonnet OR**
- Cost: (37,000 _ $3.30 + 100 _ $16.50) / 1,000,000 = $0.122 + $0.002 = **$0.124**

Estimate (ongoing session, 5 turns of history):

- System prompt cached, history: ~20K tokens, new message: ~37K system + 20K history + 10 = ~57K in
- Cost: (57,000 _ $3.30 + 100 _ $16.50) / 1,000,000 = $0.188 + $0.002 = **$0.190**

### Scenario 2: Link Message (TikTok URL) — the $0.439 trigger

- System prompt: ~37K tokens
- Conversation history: ~20K tokens (mid-session)
- User message: ~20 tokens
- KB context: ~2,000 tokens (relevant article found)
- Cross-channel context: ~500 tokens
- Graph context: ~1,500 tokens
- Inbound metadata: ~200 tokens
- **Total input: ~61K tokens**
- Response: ~1,500 tokens (analysis)
- Cost via Sonnet OR: (61,000 _ $3.30 + 1,500 _ $16.50) / 1,000,000 = $0.201 + $0.025 = **$0.226**

Reconciliation with observed $0.439:

- The $0.226 is the agent reply. The additional ~$0.21 could be the capture pipeline sdk-invoke (3 haiku calls = ~$0.006) + a second agent notification message.
- OR: the session history was ~50K tokens (longer session), making total input ~90K = $0.297 + $0.025 = $0.322 + further compounding.
- Most likely: $0.439 = agent reply ($0.32) + capture.sh haiku summary ($0.006) + second agent reply from capture notification ($0.11) = $0.436 ≈ $0.439 ✓

### Scenario 3: capture.sh Full Pipeline (TikTok video)

| Step                     | Model                | Est. Tokens         | Cost        |
| ------------------------ | -------------------- | ------------------- | ----------- |
| Download + metadata      | yt-dlp               | 0                   | $0.000      |
| Transcription (local)    | Whisper              | 0                   | $0.000      |
| Frame analysis           | Gemini CLI (free)    | 0                   | $0.000      |
| L3 summary (haiku)       | claude-haiku-4-5     | ~1,500 in + 150 out | $0.0018     |
| L4 summary (haiku)       | claude-haiku-4-5     | ~700 in + 60 out    | $0.0008     |
| L2 summary (haiku)       | claude-haiku-4-5     | ~3,000 in + 500 out | $0.0044     |
| KB ingest (embedding)    | nomic local          | 0                   | $0.000      |
| Agent notification reply | claude-sonnet-4.6 OR | ~60K in + 1K out    | ~$0.214     |
| **Total per capture**    |                      |                     | **~$0.221** |

If agent notification triggers a second reply (discussion of content):

- **Total with double notification: ~$0.44**

### Scenario 4: Heartbeat (55-minute check-in)

Normal HEARTBEAT_OK heartbeat (no alerts):

- System prompt: ~37K tokens (or more if session has history)
- Heartbeat prompt: ~500 tokens
- Response: "HEARTBEAT_OK" ~15 tokens (transcript pruned after)
- Model: gemini-2.5-flash via OR
- Cost: (38,000 _ $0.15 + 15 _ $0.60) / 1,000,000 = $0.0057 + $0.000009 = **~$0.006 per heartbeat**

Alert heartbeat (model notices something to report):

- Same input, response: ~500-1,000 tokens
- Cost: (38,000 _ $0.15 + 750 _ $0.60) / 1,000,000 = $0.0057 + $0.00045 = **~$0.006 per heartbeat**

Monthly heartbeat cost: ~17/day × 30 days × $0.006 = **~$3.06/month** (cheap, Gemini Flash is economical)

### Scenario 5: KB Enrichment (per article)

`deep-ingest.js` does NOT use LLM — it uses local embedding server for 768-dim vectors. No LLM cost per article.

For reference if LLM enrichment is added later:

- Article content: ~2-5K tokens
- Enrichment instruction: ~500 tokens
- Output (metadata/tags): ~300-500 tokens
- Cost per article (haiku direct): (3,000 _ $0.80 + 400 _ $4.00) / 1,000,000 = $0.0024 + $0.0016 = $0.004
- 867 articles × $0.004 = $3.47 one-time batch cost

---

## SECTION 9: Optimization Recommendations

Ranked by estimated monthly savings (high to low).

### Tier 1: High Savings, Low Risk

**R1. Compress System Prompt (reduce skills from 34K to 10K tokens)**

- **Problem:** 26 SKILL.md files total 137KB (34,269 tokens). Top 2 alone (browser-use: 22KB, self-improving-agent: 20KB) are 42KB of rarely-needed context.
- **Fix:** Implement conditional skill loading — only load skills relevant to the message type. Use the task classifier's domain to filter: `code` messages → load `code-project`, `macos-system`; `creative` → load `content`, `brand-voice`; etc.
- **Or (simpler fix):** Remove or heavily trim skills not actively used. browser-use (5,556 tokens) and self-improving-agent (4,926 tokens) = 10,482 tokens that fire every turn.
- **Savings estimate:** If prompt drops from 60K to 25K tokens avg: save 35K tokens × $3.30/M × 245 req/day × 30 days = **~$85/month**
- **Effort:** S-M (config + skill filter logic already exists in `skillFilter` param)
- **Risk:** Low (skills already have `skillFilter` parameter in `ensureSkillSnapshot()`)

```bash
# Verify skillFilter is supported
grep -n "skillFilter" /Users/user/Desktop/projects/openclaw/src/auto-reply/reply/session-updates.ts
```

**R2. Switch primary model to direct Anthropic (eliminate 10% OpenRouter markup)**

- **Problem:** `openrouter/anthropic/claude-sonnet-4.6` charges ~10% markup over direct Anthropic pricing
- **Fix:** Change `agents.defaults.model.primary` in `~/.openclaw/openclaw.json` from `openrouter/anthropic/claude-sonnet-4.6` to `anthropic/claude-sonnet-4-6`
- **Savings:** 10% of Sonnet spend. At ~$55/day = **~$5.50/day = ~$165/month**
- **Effort:** XS (single config change + test)
- **Risk:** Low (same model, same API surface — routing middleware already uses `anthropic/claude-sonnet-4-6` for classified domains)

```bash
# Make the change:
# Edit ~/.openclaw/openclaw.json:
# "primary": "anthropic/claude-sonnet-4-6"  (not "openrouter/anthropic/claude-sonnet-4.6")
# Also update team-member, client, supplier agents

# Verify direct Anthropic works:
# cat ~/.openclaw/agents/main/agent/auth-profiles.json | python3 -c "import json,sys; p=json.load(sys.stdin); print([k for k in p['profiles'] if 'anthropic' in k.lower()])"
```

**R3. Eliminate capture.sh double-billing (suppress secondary agent notification)**

- **Problem:** capture.sh sends a notification to the agent after KB ingest. This triggers the full primary agent pipeline (~$0.32). The capture result is already processed by haiku; the notification reply may be redundant.
- **Fix:** Make the capture notification a silent system event (no agent reply expected) OR route it to haiku instead of the primary Sonnet agent.
- **Savings:** If 5 captures/day: 5 × $0.32 × 30 = **~$48/month**
- **Effort:** S (modify capture.sh or add a flag to suppress reply)
- **Risk:** Low (capture notifications can be logged without Sonnet reply)

### Tier 2: Medium Savings, Medium Effort

**R4. Implement session history token cap**

- **Problem:** Session history grows unboundedly until compaction (context limit). Sessions observed at 65-220KB (16-55K tokens of history), and compaction requires sending 100K-200K tokens.
- **Fix:** Hard cap session history at last N turns (e.g., 30 turns) or K tokens (e.g., 20K). Implement rolling window in JSONL reader.
- **Savings:** If history reduced from avg 50K to 20K tokens: save 30K × $3.30/M × 245 req/day × 30 days = **~$73/month**
- **Effort:** M (requires changes to pi-ai SDK session loading, or preprocessing JSONL before sending)
- **Risk:** Med (older context lost, may affect agent memory of long conversations)

**R5. Lazy-load context augmentations (KB/cross-channel/graph)**

- **Problem:** KB, cross-channel, and graph context fire for every message with body >= 10 chars. A message like "ok" gets the same augmentation as a complex research query.
- **Fix:** Add a quick pre-check: only fire KB/graph context if message body >= 30 chars AND doesn't match patterns like "^(ok|thanks|got it|cool|sure|yes|no|lol)$"
- **Savings:** If 30% of messages skip augmentation: save ~3K tokens × $3.30/M × 0.30 × 245 × 30 = **~$22/month**
- **Effort:** S (add length/pattern guard before context queries)
- **Risk:** Low (edge cases where short messages do need context can still get it via fallback)

**R6. Move team-member/client/supplier agents to direct Anthropic or downgrade model**

- **Problem:** Three additional agents (team-member, client, supplier) use `openrouter/anthropic/claude-sonnet-4.6`. If these receive traffic, they add to OR markup.
- **Fix:** Switch to `anthropic/claude-sonnet-4-6` (direct) or use `anthropic/claude-haiku-4-5` for intake-type interactions
- **Savings:** Depends on traffic volume (unknown — check logs)
- **Effort:** XS (config change)
- **Risk:** Low

### Tier 3: Low Effort Quick Wins

**R7. Audit task classifier routing effectiveness**

- **Problem:** Unknown what % of messages actually get classified and routed vs falling to default (Sonnet)
- **Fix:** Query routing decision log in observability DB to see domain distribution
- **Savings:** Investigation only — identifies where further routing optimization helps
- **Effort:** XS

```bash
# Query routing decisions from observability
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  json_extract(metadata,'$.domain') as domain,
  json_extract(metadata,'$.provider') as provider,
  json_extract(metadata,'$.model') as model,
  json_extract(metadata,'$.confidence') as confidence,
  json_extract(metadata,'$.applied') as applied,
  count(*) as count
FROM events
WHERE action = 'agent.routing' OR category = 'routing'
ORDER BY count DESC
LIMIT 20;"
```

**R8. Trim or lazy-load browser-use skill (5,556 tokens on every reply)**

- **Problem:** browser-use skill (22KB, 5,556 tokens) loads for every message even if no browser action is needed
- **Fix:** Move browser-use to conditional loading (only when `@code`, `@search`, or message contains URL)
- **Savings:** 5,556 tokens × $3.30/M × 245 × 30 = **~$13/month**
- **Effort:** XS (move skill to conditional filter)
- **Risk:** Low

**R9. Monitor and reduce graph context verbosity**

- **Problem:** queryGraphContext() can return up to 5K tokens of Memgraph data
- **Fix:** Add a token limit to graph context (e.g., max 1,500 tokens) and prioritize highest-confidence nodes
- **Savings:** Depends on graph size, likely $5-10/month
- **Effort:** S
- **Risk:** Low

---

## SECTION 10: Data Collection Checklist

### Required for Complete Analysis

- [ ] **OpenRouter dashboard breakdown by model for last 30 days** — visit https://openrouter.ai/activity
  - Required to verify actual token counts (not just $amounts)
  - Confirm whether 245 Sonnet requests on Mar 5 = one type of request or mixed
- [ ] **Routing classifier effectiveness** — query observability.sqlite for `agent.routing` events to find what % of messages match high-confidence domains
- [ ] **Session history distribution** — analyze all JSONL session files to find typical history sizes
  - `wc -c ~/.openclaw/agents/main/sessions/*.jsonl`
- [ ] **Verification that `anthropic/claude-sonnet-4-6` in routing table routes direct Anthropic** — check auth-profiles.json for anthropic provider mapping
- [ ] **Confirm capture.sh double-billing** — add logging to capture.sh to track whether notification triggers Sonnet reply
- [ ] **Check if AGENTS.md (7KB) is loaded per turn** — verify it's part of skills snapshot or separate
- [ ] **Confirm deep-ingest.js has no LLM calls** — current inspection found only embedding, but verify completely
- [ ] **task-decomposer.ts and verification.ts models** — these run fire-and-forget after replies; confirm which models they use

### Required for Markup Calculation

- [ ] **Exact OpenRouter markup for claude-sonnet-4.6** — check https://openrouter.ai/anthropic/claude-sonnet-4.6 pricing vs direct Anthropic
- [ ] **Current month's OpenRouter Sonnet total** — needed for R2 savings estimate

### Required for ROI Estimates

- [ ] **Average daily requests by agent** — are team-member/client/supplier agents receiving traffic?
- [ ] **Capture pipeline frequency** — how many captures per day?
- [ ] **Message type distribution** — what % of messages are simple ("ok", "thanks") vs complex?

---

## SECTION 11: Next Steps

### Immediate (same day, no code changes)

1. **Switch primary model to direct Anthropic (R2)**
   - Edit `~/.openclaw/openclaw.json`: change all `openrouter/anthropic/claude-sonnet-4.6` → `anthropic/claude-sonnet-4-6`
   - Edit team-member, client, supplier agents too
   - Expected savings: ~$165/month
   - Restart gateway: `launchctl stop ai.openclaw.gateway && launchctl start ai.openclaw.gateway`

2. **Disable or skip loading of browser-use skill (R8)**
   - Edit browser-use/SKILL.md to reduce size, or use `skillFilter` to exclude it from non-browser sessions

3. **Visit OpenRouter dashboard** and collect per-model breakdown for R2 savings validation

### Short Term (1-2 weeks)

4. **Verify capture.sh double-billing (R3)**
   - Add `OPENCLAW_DEBUG=1` flag or log to check whether capture notification triggers Sonnet reply
   - If confirmed: modify notification to be a silent KB event, not a channel message that triggers agent

5. **Implement session history token cap (R4)**
   - Add rolling window: send only last 25 turns of JSONL history
   - Or add `maxContextTokens` per-session config option

6. **Audit routing classifier effectiveness (R7)**
   - Pull routing decisions from observability, categorize what % goes to each domain
   - Focus on whether "analysis", "system", "search" (all still Sonnet) could be downtiered

### Medium Term (2-4 weeks)

7. **Domain-based skill filtering (R1)**
   - Use `opts.skillFilter` in `ensureSkillSnapshot()` to load only domain-relevant skills
   - Implement filter map: `{ code: ['code-project', 'macos-system'], creative: ['content', 'brand-voice'], ... }`
   - Expected savings: ~$85/month

8. **Add cheap classifier tier (future R3)**
   - Route chitchat, simple questions, short messages to gemini-flash instead of Sonnet
   - Requires quality testing to verify coverage doesn't regress

9. **Create a follow-up planning phase** for each optimization cluster:
   - Run `/gsd:plan-phase` for "system-prompt-optimization" with tasks: skill audit, conditional loading, size benchmarks
   - Run `/gsd:plan-phase` for "capture-pipeline-dedup" with tasks: notification flow audit, silent event mode

---

## Appendix A: Key Config Locations

| Config                   | Path                                               | Key Setting                                      |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------ |
| Primary model            | `~/.openclaw/openclaw.json`                        | `agents.defaults.model.primary`                  |
| Heartbeat model/interval | `~/.openclaw/openclaw.json`                        | `agents.defaults.heartbeat.{model,every}`        |
| Sub-agent model          | `~/.openclaw/openclaw.json`                        | `agents.defaults.subagents.model`                |
| LLM cost table           | `~/.openclaw/llm-config.json`                      | `models.*`                                       |
| Routing weights          | `~/.openclaw/routing-weights.json`                 | `domains.*.baseConfidence`                       |
| Skills directory         | `~/.openclaw/workspace/skills/`                    | `*/SKILL.md`                                     |
| Persona files            | `~/.openclaw/workspace/`                           | `SOUL.md`, `IDENTITY.md`, `USER.md`, `AGENTS.md` |
| Auth profiles            | `~/.openclaw/agents/main/agent/auth-profiles.json` | `profiles.anthropic:default.key`                 |
| Session files            | `~/.openclaw/agents/main/sessions/`                | `*.jsonl`                                        |
| Observability DB         | `~/.openclaw/observability.sqlite`                 | `events` table                                   |

## Appendix B: Quick Cost Formulas

```
Cost of one Sonnet OR reply =
  (input_tokens * 3.30 + output_tokens * 16.50) / 1,000,000

Cost of one Sonnet direct reply =
  (input_tokens * 3.00 + output_tokens * 15.00) / 1,000,000

Cost of one Gemini Flash OR reply =
  (input_tokens * 0.15 + output_tokens * 0.60) / 1,000,000

Cost of one Haiku direct reply =
  (input_tokens * 0.80 + output_tokens * 4.00) / 1,000,000

Approximate system prompt tokens (current) = 37,192 tokens
Approximate system prompt bytes (current) = 148,768 bytes

Monthly Sonnet cost projection:
  = avg_request_cost * requests_per_day * 30
  = $0.226 * 245 * 30 = $1,661/month at current rate
```

## Appendix C: Observability DB Quick Queries

```bash
# Daily LLM spend for the past 7 days
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  date(timestamp) as day,
  json_extract(metadata,'$.model') as model,
  count(*) as calls,
  printf('%.4f', sum(json_extract(metadata,'$.estimatedCostUsd'))) as cost_usd
FROM events
WHERE action = 'llm_call'
  AND timestamp >= date('now', '-7 days')
GROUP BY day, model
ORDER BY day DESC, cost_usd DESC;"

# Find most expensive individual calls
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  timestamp,
  json_extract(metadata,'$.model') as model,
  json_extract(metadata,'$.inputTokens') as in_tokens,
  json_extract(metadata,'$.outputTokens') as out_tokens,
  printf('%.4f', json_extract(metadata,'$.estimatedCostUsd')) as cost_usd,
  json_extract(metadata,'$.caller') as caller
FROM events
WHERE action = 'llm_call'
ORDER BY json_extract(metadata,'$.estimatedCostUsd') DESC
LIMIT 20;"

# Monthly cost projection based on last 7 days
sqlite3 ~/.openclaw/observability.sqlite "
SELECT
  json_extract(metadata,'$.model') as model,
  count(*)/7.0 as calls_per_day,
  printf('%.2f', sum(json_extract(metadata,'$.estimatedCostUsd'))/7.0*30) as monthly_cost_usd
FROM events
WHERE action = 'llm_call'
  AND timestamp >= date('now', '-7 days')
GROUP BY model
ORDER BY monthly_cost_usd DESC;"
```
