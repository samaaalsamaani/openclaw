---
phase: quick-1-llm-cost-audit
plan: "01"
subsystem: llm-cost-analysis
tags: [cost, llm, audit, openrouter, anthropic, optimization]
key-files:
  created:
    - .planning/quick/1-comprehensive-llm-cost-audit-plan/LLM-COST-AUDIT.md
  modified: []
decisions:
  - "System prompt is ~37K tokens (skills dominate at 34K) — not loaded per turn but per session reset"
  - "Heartbeat correctly uses Gemini Flash at ~$3/month total — not a cost concern"
  - "capture.sh double-billing is the most likely explanation for $0.439 TikTok message"
  - "Observability DB tracks direct API calls only — pi-ai SDK OR calls are invisible to it"
  - "OpenRouter markup on Sonnet = ~$151/month at current volume"
  - "Top 3 savings opportunities: skill compression ($85/mo), OR markup elimination ($165/mo), capture dedup ($48/mo)"
metrics:
  duration: "25 minutes"
  completed: "2026-03-06"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
---

# Quick Task 1: Comprehensive LLM Cost Audit Plan Summary

**One-liner:** Full LLM cost audit covering every call site, token budget breakdown (37K static + 50K+ history), and 9 ranked optimizations worth $250-450/month.

## What Was Built

Single comprehensive audit document at `.planning/quick/1-comprehensive-llm-cost-audit-plan/LLM-COST-AUDIT.md` covering all 11 planned sections with real data collected from the codebase.

## Key Findings (discovered during execution)

### 1. Two Invisible LLM Tiers

The PAIOS observability DB (`~/.openclaw/observability.sqlite`) only tracks PAIOS Python/direct API calls. The primary cost driver — pi-ai SDK calls through `openrouter/anthropic/claude-sonnet-4.6` — is completely invisible to it. This explains why the DB shows only $12 all-time while OpenRouter shows $492.58.

### 2. System Prompt Composition (Measured)

Actual measured sizes from `~/.openclaw/workspace/`:

| Component         | Bytes       | Tokens      |
| ----------------- | ----------- | ----------- |
| SOUL.md           | 2,771       | 693         |
| IDENTITY.md       | 417         | 104         |
| USER.md           | 1,418       | 354         |
| AGENTS.md         | 7,085       | 1,771       |
| 26 SKILL.md files | 137,077     | 34,269      |
| **Total static**  | **148,768** | **~37,192** |

Skills are cached per session (not reloaded every turn) but reset frequently triggers full reload. Top 2 skills alone (browser-use 22KB + self-improving-agent 20KB) = 10,482 tokens of rarely-needed context.

### 3. Session History Is The Real Driver

Active sessions: 48-68KB = 12-17K tokens. Historical peak session: 7.2MB before reset = ~1.8M tokens. The 89K average input on Mar 5 = ~37K static + ~50K session history + ~2K context augmentation.

### 4. Routing Classifier Is Working But Most Domains Still Route to Sonnet

The `task-classifier.ts` heuristic runs on every message at zero LLM cost. However, 5 of 7 domains (`analysis`, `vision`, `system`, `schedule`, `search`) route to `anthropic/claude-sonnet-4-6`. Only `code` (→ Codex) and `creative` (→ Opus) route away. The critical question is whether `anthropic/claude-sonnet-4-6` in the routing table hits direct Anthropic or still goes through OpenRouter.

### 5. capture.sh Double-Billing Confirmed as Likely

Three haiku SDK calls (L2/L3/L4 summaries) cost ~$0.006. The agent notification message then triggers a full Sonnet OR reply at ~$0.32. This matches the $0.439 observed cost: agent reply ($0.32) + haiku summaries ($0.006) + second notification reply (~$0.11).

### 6. Heartbeat Is NOT a Cost Problem

17 heartbeats/day at ~$0.006 each = ~$3/month. Correctly configured to use Gemini Flash. Not worth optimizing.

### 7. KB Enrichment Has No LLM Cost

`deep-ingest.js` uses local embedding server only. No LLM calls per article. The `enrichment_status` column tracks embedding completion, not LLM processing.

## Optimization Opportunities (Ranked)

| Priority | Recommendation                            | Est. Monthly Savings | Effort | Risk |
| -------- | ----------------------------------------- | -------------------- | ------ | ---- |
| R2       | Switch to direct Anthropic (no OR markup) | ~$165/month          | XS     | Low  |
| R1       | Compress skills (37K→10K tokens)          | ~$85/month           | S-M    | Low  |
| R4       | Session history token cap (50K→20K)       | ~$73/month           | M      | Med  |
| R3       | Eliminate capture.sh double-billing       | ~$48/month           | S      | Low  |
| R5       | Lazy-load context augmentations           | ~$22/month           | S      | Low  |
| R8       | Trim browser-use skill alone              | ~$13/month           | XS     | Low  |
| R6       | Direct Anthropic for team/client/supplier | Traffic-dependent    | XS     | Low  |
| R7       | Audit classifier routing effectiveness    | Unknown              | XS     | None |
| R9       | Cap graph context verbosity               | ~$5-10/month         | S      | Low  |

**Total addressable: ~$250-450/month** (R2+R1+R4+R3+R5)

## Immediate Actions (no code changes needed)

1. Change `agents.defaults.model.primary` in `~/.openclaw/openclaw.json` from `openrouter/anthropic/claude-sonnet-4.6` to `anthropic/claude-sonnet-4-6` — saves ~$165/month
2. Visit https://openrouter.ai/activity to collect per-model token breakdown
3. Remove or heavily trim `browser-use` and `self-improving-agent` SKILL.md files if not actively used

## Deviations from Plan

None — plan executed exactly as written. All 11 sections populated. Discovery commands were run live and real data embedded directly in the document rather than leaving placeholders.

## Self-Check: PASSED

- File exists: `.planning/quick/1-comprehensive-llm-cost-audit-plan/LLM-COST-AUDIT.md` (43KB)
- 11 section headers confirmed: `grep -c "^## SECTION" LLM-COST-AUDIT.md` = 11
- Commit hash: 371ebc725
