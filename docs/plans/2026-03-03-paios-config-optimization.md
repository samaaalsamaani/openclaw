# PAIOS Configuration Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all identified config issues, slim AGENTS.md and HEARTBEAT.md to lean bootstrap files, and apply all remaining 2026.3.1 best practices.

**Architecture:** Three-layer approach — (1) fix broken config keys, (2) slim bootstrap files by extracting sections into existing skills, (3) apply remaining gateway/session best practices. No new files created beyond a new `heartbeat` skill. All changes are reversible via git.

**Tech Stack:** `~/.openclaw/openclaw.json` (JSON), `~/.openclaw/workspace/AGENTS.md` (Markdown), `~/.openclaw/workspace/HEARTBEAT.md` (Markdown), `~/.openclaw/workspace/skills/*/SKILL.md` (Markdown)

**Validation command after every task:** `openclaw doctor 2>&1 | tail -5`

---

## Pre-Flight: Backup

### Task 0: Snapshot current state

**Files:**

- Read: `~/.openclaw/openclaw.json`
- Read: `~/.openclaw/workspace/AGENTS.md`
- Read: `~/.openclaw/workspace/HEARTBEAT.md`

**Step 1: Create backups**

```bash
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak-$(date +%Y%m%d)
cp ~/.openclaw/workspace/AGENTS.md ~/.openclaw/workspace/AGENTS.md.bak-$(date +%Y%m%d)
cp ~/.openclaw/workspace/HEARTBEAT.md ~/.openclaw/workspace/HEARTBEAT.md.bak-$(date +%Y%m%d)
```

Expected: three `.bak-20260303` files created, no errors.

**Step 2: Verify git status**

```bash
git -C ~/.openclaw/workspace status 2>/dev/null || echo "not a git repo"
```

If it's a git repo, note current branch. If not, backups are the only safety net.

**Step 3: Commit**

```bash
# Only if workspace is a git repo
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "backup: pre-optimization snapshot"
```

---

## Phase 1: Fix Config Issues

### Task 1: Fix Telegram group policy warning

**Problem:** `groupPolicy: "allowlist"` with empty `groupAllowFrom` silently drops all Telegram group messages.

**Files:**

- Modify: `~/.openclaw/openclaw.json` — `channels.telegram` section

**Step 1: Decide the right fix**

You have two Telegram users configured in WhatsApp's allowFrom. The Telegram `dmPolicy` is `"pairing"` (safe). Since there are no group chat IDs configured and you don't actively use Telegram groups, the correct fix is to change `groupPolicy` to `"allowlist"` and leave `groupAllowFrom` empty — this is intentionally restrictive.

Actually re-reading the doctor warning: the combination is flagged because it _will silently drop_ messages. Change to `"disabled"` to be explicit that groups are intentionally off:

Edit `~/.openclaw/openclaw.json`, find:

```json
"telegram": {
  "enabled": true,
  "dmPolicy": "pairing",
  "botToken": "...",
  "groupPolicy": "allowlist",
  "streaming": "off"
}
```

Change to:

```json
"telegram": {
  "enabled": true,
  "dmPolicy": "pairing",
  "botToken": "...",
  "groupPolicy": "disabled",
  "streaming": "off"
}
```

**Step 2: Validate**

```bash
openclaw doctor 2>&1 | grep -i "telegram\|group\|invalid\|error" | head -10
```

Expected: no telegram groupPolicy warning.

**Step 3: Commit**

```bash
# This is a workspace config file, not in git — just verify it's clean
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

Expected: `Errors: 0`

---

### Task 2: Add subagents.maxConcurrent cap

**Problem:** No concurrency cap on subagents — cascade risk under load.

**Files:**

- Modify: `~/.openclaw/openclaw.json` — `agents.defaults.subagents` section

**Step 1: Edit config**

Find:

```json
"subagents": {
  "model": "openrouter/google/gemini-2.5-flash"
}
```

Change to:

```json
"subagents": {
  "model": "openrouter/google/gemini-2.5-flash",
  "maxConcurrent": 8
}
```

**Step 2: Validate**

```bash
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

Expected: `Errors: 0`

---

### Task 3: Fix weekly-review cron error

**Problem:** `ceo:weekly-review` is in `error` state (last run 2 days ago).

**Files:**

- Read: `~/.openclaw/cron/` directory for job definition

**Step 1: Inspect the error**

```bash
openclaw cron list 2>&1 | grep -A3 "weekly"
```

**Step 2: Get last run log**

```bash
ls -lt ~/.openclaw/cron/runs/ 2>/dev/null | head -10
# Find the weekly-review run file and read it
ls ~/.openclaw/cron/runs/ 2>/dev/null | grep weekly | tail -3
```

**Step 3: Read the error**

```bash
# Replace <run-id> with the actual file found above
cat ~/.openclaw/cron/runs/<most-recent-weekly-review-run-file> 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('Status:', d.get('status'))
print('Error:', d.get('error') or d.get('errorMessage') or 'none')
print('Output (last 500):', str(d.get('output',''))[-500:])
" 2>/dev/null || echo "Run file not found — check alternate path"
```

**Step 4: Fix based on error**

Common causes:

- Script path doesn't exist → update the cron job command
- Auth expired → refresh the relevant API key
- Timeout → increase job timeout in cron definition

Run the job manually to confirm fix:

```bash
openclaw cron run ceo:weekly-review 2>&1 | tail -20
```

Expected: job completes with `ok` status.

---

## Phase 2: Slim AGENTS.md

**Context:** AGENTS.md is 487 lines (~12K tokens), injected on EVERY turn. Target: ≤100 lines of true identity/core rules. The large sections that belong elsewhere:

| Section                     | Lines | Move to                                    |
| --------------------------- | ----- | ------------------------------------------ |
| Task Routing Decision Tree  | 81    | New `routing` skill                        |
| Media Pipeline Intelligence | 65    | Existing `media-send` or new `media` skill |
| Knowledge Base Integration  | 44    | Existing `kb` skill                        |
| Thinking Layer              | 44    | Existing `thinking` skill                  |
| Claude Code Session Mgmt    | 40    | Existing `code-project` skill              |
| Proactive Behaviors         | 38    | Keep condensed in AGENTS.md (2 rules)      |
| Heartbeats - Be Proactive   | 27    | Keep 3 lines only                          |

### Task 4: Extract Task Routing into a `routing` skill

**Files:**

- Create: `~/.openclaw/workspace/skills/routing/SKILL.md`
- Modify: `~/.openclaw/workspace/AGENTS.md` — remove Task Routing section, replace with 2-line reference

**Step 1: Create the skill file**

Create `~/.openclaw/workspace/skills/routing/SKILL.md`:

```markdown
---
name: routing
description: Task routing decision tree — when and how to delegate to Claude CLI subagents, tool shortcuts, and compound task handling. Use when deciding HOW to handle a complex request.
triggers:
  - how should I handle
  - route this
  - which subagent
---

## Task Routing Decision Tree

When a message arrives, follow this flow:

### 1. Quick response or needs work?

- **Quick** (chat, opinion, joke, simple factual) → respond directly
- **Needs work** → continue to step 2

### 2. Can it be done in ONE exec call?

- **Yes** → do it inline (weather, clipboard, calendar, quick command, OCR)
- **No** → continue to step 3

### 3. Delegate to Claude CLI (FREE via Max subscription)

**Pick the subagent:**

- "Build/create/code/script..." → `project-builder`
- "Review/audit this code..." → `code-reviewer`
- "Generate a report/PDF/chart..." → `report-builder`
- "Fix this bug/why is X crashing..." → `debugger`
- "Research/analyze/compare/explain..." → `researcher`
- "Write/draft/translate/summarize..." → `writer`

**Pick the model:**
| Complexity | Model | When |
|------------|-------|------|
| Hard | `--model opus` | Multi-file arch, novel algorithms, deep reasoning |
| Medium | `--model sonnet` | Standard features, reports, translations |
| Easy | `--model haiku` | Code reviews, simple scripts, formatting |

Quick test: >10min for senior dev? → Opus. 2-10min? → Sonnet. <2min? → Haiku.

### 4. Tool shortcuts (handle directly, no CLI)

- Weather → `curl wttr.in`
- Web search → web-search skill
- Media download → media-download skill
- Transcription → transcribe skill
- Voice output → voice-output skill
- Image analysis → image-analysis skill
- Calendar/Reminders → macos-system skill
- System status → system-dashboard skill
- KB lookup → kb skill
- Content capture → content-capture skill
- Content creation → content skill

For full examples, see `ROUTING-EXAMPLES.md`.

### 5. Compound Task Detection

Mixed-domain signals (e.g. "review this code AND write a blog post"):

- Execute primary domain immediately (highest confidence)
- Log followup domain to observability for deferred execution
- Connectors: "and then", "then", "after that", "also", "ثم", "وبعدها"

### 6. Async Verification Loop

High-confidence (>=85%) responses are cross-checked:

- Code (Codex) → verified by Claude Haiku
- Creative (Claude) → verified by Gemini Flash
- Fire-and-forget, non-blocking, results → quality scores in observability

### Schedule vs Post

- **"Schedule for [time]"** → `calendar.py add --schedule`
- **"Post NOW"** → `poster.py` then update calendar status
- **Rule:** Future time reference → ALWAYS calendar.py, never poster.py directly
```

**Step 2: Remove the routing section from AGENTS.md**

In `~/.openclaw/workspace/AGENTS.md`, replace the entire block from `## Task Routing Decision Tree` through `For full routing examples, see \`ROUTING-EXAMPLES.md\`.`(lines ~293-347) plus`### 5. Compound Task Detection`and`### 6. Async Verification Loop`and the`### Schedule vs Post` block (lines ~349-370), with this single line:

```markdown
## Task Routing

See `/routing` skill for the full decision tree. Quick rule: chat/simple → respond directly; one exec call → inline; anything complex → Claude CLI subagent.
```

**Step 3: Verify skill is loadable**

```bash
ls ~/.openclaw/workspace/skills/routing/SKILL.md
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

Expected: file exists, `Errors: 0`.

---

### Task 5: Extract Media Pipeline into existing `media-send` skill

**Files:**

- Modify: `~/.openclaw/workspace/skills/media-send/SKILL.md` — append media pipeline section
- Modify: `~/.openclaw/workspace/AGENTS.md` — replace 65-line section with 3-line reference

**Step 1: Read current media-send skill**

```bash
cat ~/.openclaw/workspace/skills/media-send/SKILL.md
```

**Step 2: Append media pipeline content**

At the bottom of `~/.openclaw/workspace/skills/media-send/SKILL.md`, append:

```markdown
---

## Media Pipeline Intelligence

### Voice Messages (User Sends Audio)

1. Auto-transcribe with Deepgram STT or faster-whisper
2. Process transcribed text as if user typed it
3. Consider TTS response via voice-output skill
4. Confirm: "I heard: [transcribed text]"

### Images (User Sends Photo)

1. Classify: document/receipt → OCR (tesseract). Photo/screenshot → Gemini vision
2. If text present → extract, offer translation
3. If receipt/invoice → extract fields, offer finance log
4. If error screenshot → analyze, suggest fixes, route to debugger

### URLs (User Shares Link)

1. Probe with `probe.js`
2. Chain by type: YouTube → download/transcribe/summarize | Article → KB/summarize/read | GitHub → review/clone | Image URL → analyze | Social → save/download
3. If intent obvious from context → just do it

### Videos

1. Info: `video-tools.sh info`
2. Transcribe: extract audio → faster-whisper → text/SRT
3. Subtitle: SRT → subtitle-burner → hardcoded video
4. Summarize: transcript → writer/researcher subagent
5. Clip/Compress/Thumbnail: `video-tools.sh trim/compress/thumbnail`

### Documents (PDF/Doc/Excel)

1. Extract: `markitdown` for Office, `pdfplumber` for PDFs
2. If scanned: OCR with tesseract
3. Long docs: writer subagent summary
4. Data/reports: researcher subagent analysis

### Smart Chaining Examples

- "Download and summarize YouTube video": `download.sh URL` → `transcribe.py` → writer subagent
- "Transcribe and add subtitles": `transcribe.py` → SRT → `burn.py`
- "Translate video to Arabic": `transcribe.py` → writer translate → Arabic SRT → `burn.py`
- "Read me this article": `deep-ingest.js URL` → summary → `speak.sh`
- "What does this receipt say": Image → Gemini vision extract → format → offer finance log
```

**Step 3: Replace section in AGENTS.md**

Replace entire `## Media Pipeline Intelligence` block (lines ~374-437) with:

```markdown
## Media Pipeline

See `/media-send` skill for full pipeline. Auto-chain: voice → transcribe → process; image → classify → analyze; URL → probe → chain by type; video → full lifecycle; doc → extract → summarize.
```

**Step 4: Validate**

```bash
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

---

### Task 6: Extract Knowledge Base instructions into existing `kb` skill

**Files:**

- Modify: `~/.openclaw/workspace/skills/kb/SKILL.md` — append KB integration section
- Modify: `~/.openclaw/workspace/AGENTS.md` — replace 44-line section with 3-line reference

**Step 1: Read current kb skill**

```bash
cat ~/.openclaw/workspace/skills/kb/SKILL.md | head -20
```

**Step 2: Append KB integration content to skill**

At the bottom of `~/.openclaw/workspace/skills/kb/SKILL.md`, append:

```markdown
---

## Second Brain Integration Rules

When user shares URLs/articles/content:

1. Probe first: `probe.js` (<3s classify)
2. Capture if valuable: `capture.sh URL --depth LEVEL --json`
3. Search when relevant: `query.js` during conversations for context
4. Mention sources when using KB data
5. Offer PARA filing after capture

Depth auto-select: meme/photo → `quick`; video/article → `standard`; "deep dive" → `deep`

Proactive KB use:

- User asks about a topic → `query.js "topic"` before web searching
- "what do I know about X" → KB search + related people/content
- User mentions a person → `organize.js person "name"` to surface profile
- During heartbeat: nudge if >10 unsorted inbox items

Content creation flow:

1. Source: KB item, captured content, or user text
2. Transform: Claude CLI writer subagent
3. Assets: `quote-card.sh`, `speak.sh`
4. Present: thread, LinkedIn, blog outline, quote card, voice summary
5. Publish: social poster or messaging channel
```

**Step 3: Replace section in AGENTS.md**

Replace entire `## Knowledge Base Integration (Second Brain)` block (lines ~215-257) with:

```markdown
## Knowledge Base

See `/kb` skill for full integration rules. Core: probe URLs before ingesting, search KB before web, offer PARA filing after capture.
```

**Step 4: Validate**

```bash
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

---

### Task 7: Extract Thinking Layer into existing `thinking` skill

**Files:**

- Modify: `~/.openclaw/workspace/skills/thinking/SKILL.md` — append usage instructions
- Modify: `~/.openclaw/workspace/AGENTS.md` — replace 44-line section with 3-line reference

**Step 1: Read current thinking skill**

```bash
cat ~/.openclaw/workspace/skills/thinking/SKILL.md 2>/dev/null | head -20 || echo "no thinking skill found"
ls ~/.openclaw/workspace/skills/ | grep think
```

**Step 2: If skill exists, append; if not, create**

Append to or create `~/.openclaw/workspace/skills/thinking/SKILL.md`:

````markdown
---
name: thinking
description: Query the Thinking Layer — beliefs, heuristics, values, voice, and decision patterns. Use before answering decision/content questions to align responses with how Faisal thinks.
triggers:
  - what should I do
  - what do you think
  - my opinion
  - my voice
  - decision
---

## When to Use

- User asks "what should I do about X?" → query thinking first
- Generating content → inject voice + beliefs
- Making decisions → apply heuristics + check blindspots
- Writing responses → match voice profile

## Commands

```bash
# Get thinking context for prompt injection
node ~/.openclaw/projects/knowledge-base/thinking-query.cjs "situation description" --prompt

# Quick decision guidance
~/.openclaw/workspace/thinking.sh what "question here"

# List beliefs
~/.openclaw/workspace/thinking.sh list --type beliefs

# Stats
~/.openclaw/workspace/thinking.sh stats
```
````

## Workflow

1. Parse user question
2. Query: `node thinking-query.cjs "QUESTION" --prompt`
3. Inject beliefs + values + voice into response
4. Be conversational, conclusion-first

````

**Step 3: Replace section in AGENTS.md**

Replace entire `## Thinking Layer (Your Personal AI)` block (lines ~107-141) with:

```markdown
## Thinking Layer

See `/thinking` skill. Before decision/content questions: query thinking layer to align voice, beliefs, heuristics.
````

**Step 4: Validate**

```bash
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

---

### Task 8: Extract Claude Code session management into existing `code-project` skill

**Files:**

- Modify: `~/.openclaw/workspace/skills/code-project/SKILL.md` — append session tracking section
- Modify: `~/.openclaw/workspace/AGENTS.md` — replace 40-line section with 2-line reference

**Step 1: Read current code-project skill**

```bash
cat ~/.openclaw/workspace/skills/code-project/SKILL.md | head -20
```

**Step 2: Append Claude Code session management**

At the bottom of `~/.openclaw/workspace/skills/code-project/SKILL.md`, append:

````markdown
---

## Claude Code Session Management

After every Claude Code invocation with `--output-format json`:

1. Parse output — extract `session_id` from JSON response
2. Save to `memory/heartbeat-state.json` under `claudeCodeSessions`
3. Track costs — log to `memory/claude-code-costs.jsonl`
4. Before new invocation — check for existing session; use `--resume` for follow-ups
5. During heartbeats — clean up stale sessions (>24h)

Follow-up detection:

- **Follow-up:** "now add/also/fix that", same project, <5min since last result, reply to summary
- **New task:** Different project, "start fresh", >30min since last result

Context injection when invoking Claude Code:

```bash
claude -p 'Task...' \
  --append-system-prompt "Channel: Telegram. Owner: Faisal (AbuKhalid), Riyadh. Recent context: [1-2 lines from today's memory]. Keep responses concise." \
  --dangerously-skip-permissions
```
````

Always inject: channel, owner name, recent memory context. Never inject: API keys, full memory files.

````

**Step 3: Replace section in AGENTS.md**

Replace entire `## Claude Code Session Management` block (lines ~151-189) with:

```markdown
## Claude Code

See `/code-project` skill for session tracking, cost logging, and context injection patterns. Core rule: check for existing session before starting new — use `--resume` when follow-up.
````

**Step 4: Validate**

```bash
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

---

### Task 9: Verify and measure AGENTS.md after slimming

**Step 1: Count lines**

```bash
wc -l ~/.openclaw/workspace/AGENTS.md
```

Expected: ≤130 lines (down from 487).

**Step 2: Read final AGENTS.md to confirm it reads well**

Skim the full file — every section should be either:

- Core identity/rules that apply to EVERY turn (keep)
- A 1-3 line pointer to a skill (extracted)

**Step 3: Estimate token savings**

```bash
# Rough token estimate: 4 chars per token
wc -c ~/.openclaw/workspace/AGENTS.md
# Divide by 4 to get approx tokens
```

Before: ~12,000 tokens per turn. Target after: ~3,000 tokens per turn.

**Step 4: Commit workspace changes**

```bash
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "perf: slim AGENTS.md 487→130 lines, extract into skills"
```

---

## Phase 3: Slim HEARTBEAT.md

**Context:** HEARTBEAT.md is 271 lines. With `lightContext: true`, this is the ONLY file loaded during heartbeats — every 55 minutes. Target: ≤60 lines. The heavy content (bash commands, Tier 3-7 scripts) moves to a new `heartbeat` skill that is invoked explicitly.

### Task 10: Create a `heartbeat` skill with Tier 2-7 tasks

**Files:**

- Create: `~/.openclaw/workspace/skills/heartbeat/SKILL.md`

**Step 1: Create the skill**

Create `~/.openclaw/workspace/skills/heartbeat/SKILL.md`:

````markdown
---
name: heartbeat
description: Full heartbeat task library — Tier 2 through Tier 7 scripts and logic for graph health, system checks, content calendar, competitor sweeps, and weekly review. Loaded on demand during heartbeat runs.
triggers:
  - heartbeat tier
  - run tier
  - graph health
  - system health check
  - competitor sweep
  - weekly review
---

## Tier 2 — Every ~2 Hours

### Graph Intelligence Health

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/health_check.py --json 2>/dev/null
```
````

Alert if Memgraph unreachable or CDC backlog > 50. Log to daily memory.

### System Health

```bash
df -h /
tail -20 ~/.openclaw/logs/gateway.err.log
```

Alert if disk <5GB free or error spike.

### Channel Health (WhatsApp)

```bash
grep -c -E 'reconnect|ECONNRESET|socket close' ~/.openclaw/logs/gateway.err.log
```

> 5/hour = persistent alert. <=5/hour = log only.

### Calendar Awareness

```bash
osascript -l JavaScript -e '
const app = Application("Calendar");
const now = new Date();
const soon = new Date(now.getTime() + 1800000);
const cals = app.calendars();
const upcoming = [];
cals.forEach(cal => {
  try {
    cal.events.whose({_and: [{startDate: {_greaterThan: now}}, {startDate: {_lessThan: soon}}]})().forEach(e => {
      const s = e.startDate();
      if (s > now && s < soon) upcoming.push({title: e.summary(), start: s.toISOString()});
    });
  } catch(err) {}
});
JSON.stringify(upcoming);
'
```

Events within 30 min → send notification. Log to daily memory.

---

## Tier 3 — Every ~4 Hours

### Graph Pattern Detection

```bash
~/.openclaw/.venv/bin/python3 ~/.openclaw/projects/graph/v4/pattern_detector.py 2>/dev/null
```

Log signal count to daily memory.

### Content Calendar Auto-Post

```bash
python3 ~/.openclaw/projects/content-calendar/calendar.py auto-post --json
```

Posts scheduled entries. Alert on failure.

### System Power & Gateway Health

```bash
pmset -g batt && uptime
pgrep -f "openclaw" > /dev/null && echo "Gateway: running" || echo "Gateway: DOWN"
```

Alert if battery <20% unplugged, load >8.0, or gateway down.

### Network Connectivity

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://openrouter.ai/api/v1/models
curl -s -o /dev/null -w "%{http_code}" --max-time 5 https://api.anthropic.com/v1/messages
```

Alert if either API unreachable.

---

## Tier 4 — Every ~6 Hours

### Weather

```bash
curl -s "wttr.in/Riyadh?format=%C+%t+%h+%w"
```

Notify if extreme (>45°C, sandstorm, heavy rain). Otherwise log only.

---

## Tier 5 — Every ~12 Hours

### Project Check

```bash
git -C ~/.openclaw/workspace status
```

Commit and push if dirty.

### Claude Code Cleanup

Check `memory/heartbeat-state.json` for stale sessions (>24h). Remove completed/abandoned session IDs.

---

## Tier 6 — Daily

### Competitor Sweep (~08:00)

```bash
for profile in faisal samaa; do
  python3 ~/.openclaw/projects/competitor-tracker/tracker.py sweep --profile "$profile" --json 2>/dev/null
done
```

### Content Pillar Balance (~09:00)

```bash
for profile in faisal samaa; do
  python3 ~/.openclaw/projects/content-calendar/calendar.py pillar-balance --profile "$profile" --json 2>/dev/null
done
```

Note in daily memory if any pillar >10% off target.

### Graph Daily Stats (~08:00)

```bash
~/.openclaw/.venv/bin/python3 - << 'EOF'
import asyncio, json
from neo4j import AsyncGraphDatabase
async def stats():
    d = AsyncGraphDatabase.driver('bolt://localhost:7687', auth=('memgraph',''))
    async with d.session() as s:
        r = await s.run("MATCH (n) RETURN count(n) AS nodes")
        nodes = (await r.single())['nodes']
        r = await s.run("MATCH ()-[e]->() RETURN count(e) AS edges")
        edges = (await r.single())['edges']
    await d.close()
    print(f"Graph: {nodes:,} nodes, {edges:,} edges")
asyncio.run(stats())
EOF
```

If nodes haven't grown in 48h → "Graph not growing — check hooks".

### Engagement Sync (~22:00)

```bash
for profile in faisal samaa; do
  python3 ~/.openclaw/projects/content-calendar/calendar.py sync-engagement --profile "$profile" --json 2>/dev/null
done
python3 ~/.openclaw/projects/social-analytics/analytics.py --period 7d --store-kb 2>/dev/null
```

### Version Check (~10:00)

Check for OpenClaw updates. Log, don't auto-update — inform Faisal.

### Cleanup (~23:00)

```bash
find /tmp -name "openclaw-*" -mtime +1 -delete 2>/dev/null
```

Delete downloaded media older than 48h. Compact daily memory files older than 7 days.

---

## Tier 7 — Weekly (Sunday)

### Competitor Digest

```bash
for profile in faisal samaa; do
  python3 ~/.openclaw/projects/competitor-tracker/tracker.py digest --profile "$profile" --period 7d --json 2>/dev/null
done
```

AI-analyzed summary of competitor activity. Surface content gaps.

### Self-Reflection & Routing Optimization

```bash
node ~/.openclaw/projects/self-reflection/reflect.js --days 7
node ~/.openclaw/projects/self-reflection/optimize.js --apply
```

Analyze routing, quality scores, error patterns. Adjust weights. Report saved to Areas/PAIOS Reports/ and ingested to KB.

---

## State Tracking

Track timestamps in `memory/heartbeat-state.json`:

```json
{
  "lastChecks": {
    "memoryMaintenance": 0,
    "systemHealth": 0,
    "calendarAwareness": 0,
    "contentAutoPost": 0,
    "systemPower": 0,
    "networkConnectivity": 0,
    "weather": 0,
    "projectCheck": 0,
    "claudeCodeCleanup": 0,
    "competitorSweep": 0,
    "pillarBalance": 0,
    "engagementSync": 0,
    "versionCheck": 0,
    "cleanup": 0,
    "competitorDigest": 0,
    "selfReflection": 0
  },
  "claudeCodeSessions": {}
}
```

````

**Step 2: Verify skill created**

```bash
wc -l ~/.openclaw/workspace/skills/heartbeat/SKILL.md
````

Expected: ~180 lines.

---

### Task 11: Slim HEARTBEAT.md to lean trigger file

**Files:**

- Modify: `~/.openclaw/workspace/HEARTBEAT.md` — replace with slim version

**Step 1: Replace HEARTBEAT.md with slim version**

Replace the entire content of `~/.openclaw/workspace/HEARTBEAT.md` with:

```markdown
# HEARTBEAT.md - Periodic Tasks

Active hours: 07:00–23:00 Asia/Riyadh. Outside these hours → HEARTBEAT_OK unless urgent.

## Every Heartbeat (Tier 1)

1. Create `memory/YYYY-MM-DD.md` if it doesn't exist
2. Run preflight: `bash ~/.openclaw/projects/heartbeat-tasks/preflight.sh`
   - Critical failure → alert immediately, stop
3. Check `memory/heartbeat-state.json` — run tiers whose `lastChecks` timestamp is overdue:
   - > 55m overdue → Tier 2 (graph health, system, calendar, WhatsApp health)
   - > 4h overdue → Tier 3 (pattern detection, content auto-post, power, network)
   - > 6h overdue → Tier 4 (weather)
   - > 12h overdue → Tier 5 (project check, Claude Code cleanup)
   - Day changed → Tier 6 (competitor sweep, pillar balance, graph stats, engagement, version check, cleanup)
   - Sunday + not yet run this week → Tier 7 (competitor digest, self-reflection)
4. Load `/heartbeat` skill for commands to run each tier
5. Update `lastChecks` timestamps after each tier completes
6. If nothing needs attention → HEARTBEAT_OK

## Rules

- **DO NOT** repeat tasks from prior chats — only follow this file
- **DO NOT** make up data — always exec commands for real data
- One notification per event, not per heartbeat
- Late night (23:00-07:00) → HEARTBEAT_OK unless critical
```

**Step 2: Measure result**

```bash
wc -l ~/.openclaw/workspace/HEARTBEAT.md
```

Expected: ~35 lines (down from 271).

**Step 3: Validate doctor**

```bash
openclaw doctor 2>&1 | grep "Errors:" | head -3
```

**Step 4: Commit**

```bash
git -C ~/.openclaw/workspace add -A && git -C ~/.openclaw/workspace commit -m "perf: slim HEARTBEAT.md 271→35 lines, extract tiers into heartbeat skill"
```

---

## Phase 4: Final Config Enhancements

### Task 12: Add gateway hot-reload mode and remaining best practices

**Files:**

- Modify: `~/.openclaw/openclaw.json`

**Step 1: Add gateway reload mode and parentForkMaxTokens**

In `~/.openclaw/openclaw.json`, add inside the `"gateway"` object:

```json
"reload": {
  "mode": "hybrid"
}
```

And inside `"agents": { "defaults": { ... } }`, add:

```json
"parentForkMaxTokens": 150000
```

This raises the fork inheritance limit from 100K to 150K so longer Telegram threads carry context into new threads.

**Step 2: Add WhatsApp streaming config**

WhatsApp currently has no streaming config. Add `"streaming": "block"` for better message delivery UX:

Inside `"channels": { "whatsapp": { ... } }`, add:

```json
"streaming": "block"
```

**Step 3: Validate**

```bash
openclaw doctor 2>&1 | grep "Errors:\|invalid\|Unrecognized" | head -10
```

Expected: `Errors: 0`, no unrecognized keys. If any key is flagged, revert that specific key.

**Step 4: Restart gateway to pick up changes**

```bash
launchctl stop ai.openclaw.gateway && sleep 2 && launchctl start ai.openclaw.gateway
sleep 4 && openclaw status 2>&1 | grep -E "Telegram|WhatsApp|Heartbeat|Agents" | head -10
```

Expected: Telegram ok, WhatsApp linked, Heartbeat interval: 55m.

---

## Validation Checklist

Run after all tasks complete:

```bash
echo "=== Final Health Check ==="

# 1. Config valid
openclaw doctor 2>&1 | grep "Errors:"

# 2. File sizes
echo "--- File sizes ---"
wc -l ~/.openclaw/workspace/AGENTS.md
wc -l ~/.openclaw/workspace/HEARTBEAT.md

# 3. Skills present
echo "--- Skills ---"
ls ~/.openclaw/workspace/skills/ | sort

# 4. Gateway healthy
echo "--- Gateway ---"
openclaw status 2>&1 | grep -E "Telegram|WhatsApp|Heartbeat" | head -5

# 5. No breaking cron jobs
echo "--- Cron ---"
openclaw cron list 2>&1 | grep -E "ok|error" | head -10
```

Expected results:

- `Errors: 0`
- AGENTS.md: ≤130 lines
- HEARTBEAT.md: ≤40 lines
- `routing`, `heartbeat` skills present alongside existing ones
- Gateway: Telegram ok, WhatsApp linked
- All cron jobs ok (weekly-review fixed)

---

## Token Savings Estimate

| File         | Before                  | After                   | Tokens saved/turn                  |
| ------------ | ----------------------- | ----------------------- | ---------------------------------- |
| AGENTS.md    | 487 lines (~12K tokens) | ~120 lines (~3K tokens) | ~9K                                |
| HEARTBEAT.md | 271 lines (~7K tokens)  | ~35 lines (~900 tokens) | ~6K (heartbeat runs only)          |
| **Total**    |                         |                         | **~9K tokens/turn, ~6K/heartbeat** |

At Sonnet 4.6 pricing ($3/M input), 9K tokens = **$0.027 saved per conversation turn**.
At 55min heartbeats × 16 active hours = ~17 heartbeats/day × 6K tokens = **~100K tokens/day = $0.30/day saved on heartbeats alone**.
