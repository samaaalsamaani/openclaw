# PAIOS Architecture Validation Report

> Date: 2026-02-27
> Scope: Full architecture validation of all 8 PAIOS subsystems
> Team: 8 specialized validation agents + 1 report writer

---

## 1. Executive Summary

| Metric                      | Value                                                         |
| --------------------------- | ------------------------------------------------------------- |
| Subsystems validated        | 8                                                             |
| Total issues found          | 23 (16 critical, 7 medium)                                    |
| Documentation files updated | 9                                                             |
| Line changes                | ~500 lines added/updated across all docs                      |
| Validation tests passing    | LLM config: 15/15, Integration: pending, DB connectivity: 6/6 |
| Launchd services            | 6/6 running                                                   |

All 8 subsystems were validated against live system state. Every documentation file was
updated to reflect the actual configuration, schema, and operational state as of
2026-02-27. MEMORY.md was trimmed from 202 lines (over the 200-line limit) to 103 lines
with detailed content moved into 6 subsystem topic files and 1 archive file.

---

## 2. Validation Summary by Subsystem

### 2.1 CMDB Master Registry (Task #1 -- cmdb-validator)

| Detail            | Value                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------- |
| File updated      | `~/.openclaw/workspace/CMDB.md`                                                           |
| Lines             | 997 -> 1,147 (+150)                                                                       |
| Key findings      | Script inventory expanded to 76+; new sections for LLM config, embedding, and CEO scripts |
| Issues discovered | 3 critical (stale script counts, missing new scripts, outdated DB sizes)                  |

The CMDB was audited against the actual file system. Script counts were corrected across
all 8 sections (KB, File Watcher, Content, Heartbeat, Observability, Social, CEO, Utility).
New entries added for llm.js, llm_config.js, db-open.js, probe.js, and all CEO scripts.

### 2.2 Gateway & Infrastructure (Task #2 -- gateway-validator)

| Detail            | Value                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| File updated      | `memory/subsystems/gateway.md`                                                                                                                      |
| Lines             | ~100 -> 174 (+74)                                                                                                                                   |
| Key findings      | 5 new sections added: Unified LLM Config System, Confidence Scoring, Auth System, Autonomy System, Dependency Map                                   |
| Issues discovered | 4 critical (stale "sonnet" user override, gemini-cli still referenced, version mismatch plist vs package.json, google:default not in auth-profiles) |

Full routing table documented with all 7 domains, enrichment table, verification table,
merge model, user override phrases, and @prefix routing. Confidence scoring algorithm
documented with base scores per domain and compound detection thresholds.

### 2.3 Knowledge Base (Task #3 -- kb-validator)

| Detail            | Value                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| File updated      | `memory/subsystems/knowledge-base.md`                                                                                                |
| Lines             | ~80 -> 146 (+66)                                                                                                                     |
| Key findings      | 5 new sections: LLM Integration, Provider Chain, Tier-Specific Config, Prompt Caching, Observability                                 |
| Issues discovered | 3 critical (vec sync gaps: 670/866 articles = 77%, cost table still references gpt-4.1-mini, Google token counts are approximations) |

Complete schema documented with all 32 article columns. Enrichment pipeline, embedding
system, and LLM integration with the unified config system fully mapped. Script inventory
verified against filesystem (13 scripts confirmed).

### 2.4 External Integrations (Task #4 -- integrations-validator)

| Detail            | Value                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File updated      | `memory/subsystems/integrations.md`                                                                                                                              |
| Lines             | ~50 -> 85 (+35)                                                                                                                                                  |
| Key findings      | Major corrections to MCP server inventory; auth-profiles verified against live file                                                                              |
| Issues discovered | 3 critical (google:default does NOT exist in auth-profiles despite MEMORY.md claim, Claude Code MCP reduced from 7 to 4 servers, Late.dev DNS failure confirmed) |

Auth-profiles verified: 8 active profiles (not 6 as previously documented). MCP server
inventory corrected: Claude Code has 4 global servers (down from 7), Gemini has 11
(up from 9). Late.dev API confirmed unreachable via DNS resolution test.

### 2.5 Observability & Autonomy (Task #5 -- observability-validator)

| Detail            | Value                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| File updated      | `memory/subsystems/observability.md`                                                                                      |
| Lines             | ~60 -> 169 (+109)                                                                                                         |
| Key findings      | Full schema rewrite with CREATE TABLE statements; 17 event categories discovered (was 13)                                 |
| Issues discovered | 3 critical (4 undocumented event categories, autonomy rules count 196 not 129, stale 0-byte placeholder paths misleading) |

Complete SQL schemas documented for all 5 tables across 2 databases (events, scores,
handoffs in observability DB; action_rules, approval_log in autonomy DB). Trust decay
dual implementation documented (TS dead code vs active SQL in weekly-tasks.sh). Retention
policy details captured from weekly-tasks.sh source.

### 2.6 Content Pipeline (Task #6 -- content-validator)

| Detail            | Value                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| File updated      | `memory/subsystems/content-pipeline.md`                                                                                 |
| Lines             | ~55 -> 92 (+37)                                                                                                         |
| Key findings      | Daily/weekly execution order fully documented; hour 07 dead code identified                                             |
| Issues discovered | 2 medium (hour 07 preflight unreachable via launchd, weekly-prompts.py uses hardcoded gpt-4.1-mini LLM floor violation) |

Daily automation schedule verified against launchd plist: only hours 8, 9, 10, 22, 23 are
triggered. The case 07 block in daily-tasks.sh is dead code. Weekly task execution order
documented in precise sequence (15 steps). Performance feedback and Brand Board Meeting
integration points mapped.

### 2.7 Dev Patterns & Gotchas (Task #7 -- devpatterns-validator)

| Detail            | Value                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| File updated      | `memory/subsystems/dev-patterns.md`                                                                        |
| Lines             | 48 -> 95 (+47)                                                                                             |
| Key findings      | 4 new sections: LLM Config Gotchas, API & Auth Gotchas, Database Path Gotchas, Personal CEO Schema Gotchas |
| Issues discovered | 2 medium (Brave Search env var mismatch in health skill, Codex OAuth ~60-day expiry not tracked)           |

Consolidated all gotchas from the entire validation into a single reference. Organized by
category (Platform, SQLite, Build, LLM Config, API & Auth, Database Paths, CEO Schema).
Added the tsdown circular chunk fix documentation with root cause analysis and the
plan-then-execute pattern for team vs solo work decisions.

### 2.8 Source Code Validation (Task #8 -- sourcecode-validator)

| Detail            | Value                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files reviewed    | 8 source files in `src/agents/` and `src/media-understanding/`                                                                                          |
| Key findings      | All 7 LLM config consumers verified, fallback patterns confirmed                                                                                        |
| Issues discovered | 3 critical (stale "sonnet" user override in task-classifier.ts, gemini-cli still in PROVIDER_TO_CLI, merge model doc said "Haiku" but code uses Sonnet) |

Verified that all documented routing tables, enrichment tables, and verification tables
match the actual source code. Confirmed the llm-config-reader.ts integration across all
7 consumer files. Identified 3 stale references that need code fixes.

---

## 3. Critical Issues Found & Remediated

| #   | Issue                                                                                       | Impact                                                 | Status                                              | File Reference                                                          |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | MEMORY.md exceeded 200-line limit (202 lines)                                               | Truncated in system prompt, lost context               | Fixed in docs                                       | `MEMORY.md` -> 103 lines                                                |
| 2   | google:default claimed present in auth-profiles but did NOT exist (was only in models.json) | Dual config system - unified during validation         | ✅ FIXED - Added to auth-profiles.json              | `auth-profiles.json`, `llm-config.json`, `integrations.md`, `MEMORY.md` |
| 3   | Autonomy rules documented as 129 but actual count is 196                                    | Stale metrics lead to wrong capacity assumptions       | Fixed in docs                                       | `observability.md`, `MEMORY.md`                                         |
| 4   | Autonomy approvals documented as 258 but actual count is 262                                | Minor metric drift                                     | Fixed in docs                                       | `observability.md`, `MEMORY.md`                                         |
| 5   | 4 undocumented event categories (thinking, ai_response, channel_message, content_captured)  | Missing observability coverage                         | Fixed in docs                                       | `observability.md`                                                      |
| 6   | Claude Code MCP reduced from 7 to 4 servers (undocumented)                                  | Agents referencing removed servers fail                | Fixed in docs                                       | `integrations.md`                                                       |
| 7   | Gemini MCP expanded from 9 to 11 servers (undocumented)                                     | New capabilities not discoverable                      | Fixed in docs                                       | `integrations.md`                                                       |
| 8   | "ask/use sonnet" maps to claude-sonnet-4-5 not 4-6                                          | User override routes to older model                    | Needs code fix                                      | `src/agents/task-classifier.ts`                                         |
| 9   | google-gemini-cli still in PROVIDER_TO_CLI despite Gemini CLI removal                       | Dead reference, potential runtime error                | Needs code fix                                      | `src/agents/compound-shared.ts`                                         |
| 10  | Gateway plist version (v2026.2.26) != package.json (2026.2.24)                              | Version confusion in debugging                         | Needs investigation                                 | `ai.openclaw.gateway.plist`, `package.json`                             |
| 11  | vec_articles sync gap: 670/866 (77%) embedded                                               | 196 articles without vector search support             | Needs backfill                                      | `kb.sqlite`                                                             |
| 12  | vec_entities sync gap: 2,147/2,251 (95%) embedded                                           | 104 entities without embeddings                        | Needs backfill                                      | `kb.sqlite`                                                             |
| 13  | KB cost table still references gpt-4.1-mini                                                 | Cost estimates may be wrong for floor-compliant models | Needs code fix                                      | `projects/knowledge-base/llm.js`                                        |
| 14  | Late.dev API DNS failure (api.late.dev unreachable)                                         | False alarm - tested wrong subdomain                   | ✅ RESOLVED - Service working at getlate.dev/api/v1 | `poster.py`, `social-import.py`                                         |
| 15  | Stale 0-byte placeholder SQLite files mislead agents                                        | Agents open wrong DB, get empty results                | Documented as warning                               | All subsystem docs                                                      |
| 16  | Observability merge model documented as "Haiku" but code uses Sonnet                        | Incorrect capacity/cost assumptions                    | Fixed in docs                                       | `observability.md`                                                      |

---

## 4. Medium Issues Found

| #   | Issue                                                                 | Impact                                                 | Status                  | File Reference                                |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------- | --------------------------------------------- |
| 1   | Hour 07 preflight in daily-tasks.sh not triggered by launchd          | Dead code, no actual preflight runs                    | Documented              | `content-pipeline.md`                         |
| 2   | weekly-prompts.py uses hardcoded gpt-4.1-mini (LLM floor violation)   | Below model floor, not using unified config            | Needs code fix          | `projects/content-calendar/weekly-prompts.py` |
| 3   | Brave Search env var mismatch (BRAVE_API_KEY vs BRAVE_SEARCH_API_KEY) | Health skill reports false negative                    | Needs code fix          | Health skill                                  |
| 4   | Codex OAuth token expires ~Mar 3 (not tracked)                        | Codex CLI will stop working silently                   | Needs proactive renewal | OAuth token                                   |
| 5   | Google token count estimation is approximate (prompt.length/4)        | Cost tracking slightly inaccurate for Google API calls | Documented              | `knowledge-base.md`                           |
| 6   | Trust decay implemented in both TS (dead code) and SQL (active)       | Confusion about which implementation runs              | Documented              | `observability.md`, `dev-patterns.md`         |
| 7   | Social DB last modified Feb 25 (2 days stale)                         | Social analytics may show incomplete data              | Needs investigation     | `social-history.sqlite`                       |

---

## 5. Documentation Improvements

| File                | Location                                | Before     | After       | Delta                               |
| ------------------- | --------------------------------------- | ---------- | ----------- | ----------------------------------- |
| CMDB.md             | `~/.openclaw/workspace/CMDB.md`         | 997 lines  | 1,147 lines | +150                                |
| gateway.md          | `memory/subsystems/gateway.md`          | ~100 lines | 174 lines   | +74                                 |
| knowledge-base.md   | `memory/subsystems/knowledge-base.md`   | ~80 lines  | 146 lines   | +66                                 |
| integrations.md     | `memory/subsystems/integrations.md`     | ~50 lines  | 85 lines    | +35                                 |
| observability.md    | `memory/subsystems/observability.md`    | ~60 lines  | 169 lines   | +109                                |
| content-pipeline.md | `memory/subsystems/content-pipeline.md` | ~55 lines  | 92 lines    | +37                                 |
| dev-patterns.md     | `memory/subsystems/dev-patterns.md`     | 48 lines   | 95 lines    | +47                                 |
| MEMORY.md           | `memory/MEMORY.md`                      | 202 lines  | 103 lines   | -99 (moved to subsystems + archive) |
| **Total**           |                                         |            |             | **+419 net lines**                  |

### Key Documentation Changes

- **CMDB.md**: Expanded script inventory with 33 KB scripts, 5 File Watcher, all CEO scripts. Added LLM config entries.
- **gateway.md**: Full LLM config integration documented (8 consumers, 5 tiers, 7 routing domains). Confidence scoring algorithm. Auth system. Autonomy enforcement order.
- **knowledge-base.md**: Complete 32-column article schema. Full LLM provider chain with 5 providers. Tier-specific config table. Prompt caching economics. Enrichment pipeline details.
- **integrations.md**: Corrected MCP server inventory (Claude Code 7->4, Gemini 9->11). Auth-profiles verified to 8 profiles. Late.dev DNS failure documented.
- **observability.md**: Full SQL CREATE TABLE statements for all 5 tables. 17 event categories with counts. Trust decay dual-implementation analysis. Retention policy from source.
- **content-pipeline.md**: Daily automation hour-by-hour schedule with launchd verification. Weekly 15-step execution order. Dead code (hour 07) identified. LLM floor violation flagged.
- **dev-patterns.md**: Doubled in size. 4 new gotcha categories. tsdown circular chunk fix. Plan-then-execute pattern. Team vs solo decision criteria.
- **MEMORY.md**: Trimmed from 202->103 lines. Detailed content archived to `archive/completed-projects-feb27.md`. Cross-references to all 6 subsystem files verified.

---

## 6. Validation Test Results

### System Health

| Check                   | Result      | Notes                                                                                                                                 |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Launchd services        | 6/6 running | gateway (PID 87096), embedding-server (624), emit-server (627), file-watcher (630), daily-tasks (scheduled), weekly-tasks (scheduled) |
| Gateway health endpoint | HTTP 200    | `http://localhost:18789/health`                                                                                                       |
| Gateway exit code       | 1 (warning) | Running but launchctl reports exit code 1; may indicate a previous restart issue                                                      |

### LLM Config Validation

| Check                | Result                              |
| -------------------- | ----------------------------------- |
| file_exists          | OK                                  |
| json_syntax          | OK                                  |
| required_key.version | OK                                  |
| required_key.models  | OK                                  |
| required_key.tiers   | OK                                  |
| version_value        | OK (version=1)                      |
| models_count         | OK (8 models)                       |
| model_fields         | OK (all required fields present)    |
| model_key_format     | OK (provider/model-id format)       |
| dated_model_id       | OK (no dated Anthropic 4.6 IDs)     |
| tier_model_refs      | OK (all tier models exist)          |
| routing_refs         | OK (all routing references valid)   |
| subsystem_refs       | OK (all subsystem references valid) |
| override_refs        | OK (all user phrase models valid)   |
| model_cost           | OK (all models have cost data)      |
| **Total**            | **15/15 passing**                   |

### Database Connectivity

| Database       | Location                                        | Size     | Rows (key table) | Status             |
| -------------- | ----------------------------------------------- | -------- | ---------------- | ------------------ |
| KB             | `~/.openclaw/projects/knowledge-base/kb.sqlite` | 55MB     | 867 articles     | OK                 |
| Observability  | `~/.openclaw/observability.sqlite`              | 1.8MB    | 6,963 events     | OK                 |
| Social History | `~/.openclaw/social-history.sqlite`             | 14MB     | 589 posts        | OK                 |
| Autonomy       | `~/.openclaw/autonomy.sqlite`                   | 123KB    | 196 rules        | OK                 |
| Memory         | `~/.openclaw/memory/main.sqlite`                | 13MB     | 143 chunks       | OK                 |
| Personal CEO   | `~/.openclaw/projects/personal-ceo/ceo.sqlite`  | 41KB     | 92 beliefs       | OK                 |
| **Total**      |                                                 | **84MB** |                  | **6/6 accessible** |

### Integration Tests

- **Framework**: Vitest (pnpm test)
- **Status**: Execution in progress at time of report generation
- **Previous known state**: 109/109 passing (per MEMORY.md)

---

## 7. Recommendations

### Immediate Actions (code fixes for critical issues)

1. **Fix stale "sonnet" user override** -- Update `src/agents/task-classifier.ts` to map "ask/use sonnet" to `claude-sonnet-4-6` instead of `claude-sonnet-4-5`.

2. **Remove gemini-cli from PROVIDER_TO_CLI** -- Clean up `src/agents/compound-shared.ts` to remove the `google-gemini-cli` mapping that references the removed Gemini CLI.

3. **Update KB cost table** -- Remove `gpt-4.1-mini` from the cost estimation table in `projects/knowledge-base/llm.js` and replace with floor-compliant model costs.

4. **Backfill embedding gaps** -- Run `node embed-entities.js` and `node backfill-embeddings.js` to close the vec sync gaps (77% articles, 95% entities).

5. **Investigate Late.dev DNS** -- Determine if `api.late.dev` has been renamed, decommissioned, or is temporarily down. Update poster.py and social-import.py accordingly.

6. **Renew Codex OAuth** -- Token expires around Mar 3. Proactively renew to avoid silent failure.

7. **Migrate weekly-prompts.py to unified LLM config** -- Replace hardcoded `gpt-4.1-mini` with config-driven model selection to meet the LLM floor standard.

### Documentation Maintenance

- **Monthly**: Verify MEMORY.md stays under 200 lines. Run `wc -l MEMORY.md` after any edit.
- **After model changes**: Run `~/.openclaw/scripts/validate-llm-config.sh` and verify all 15 checks pass.
- **After script additions**: Update CMDB.md script inventory.
- **After integration changes**: Re-verify auth-profiles.json and MCP server inventory.

### Validation Cadence

| Frequency | Scope                                                    | Owner                       |
| --------- | -------------------------------------------------------- | --------------------------- |
| Weekly    | LLM config validation (15 checks)                        | Automated (weekly-tasks.sh) |
| Monthly   | Database metrics snapshot (article counts, event counts) | Manual                      |
| Quarterly | Full architecture validation (all 8 subsystems)          | Multi-agent team            |
| On-change | Any subsystem doc when corresponding code changes        | Developer                   |

### Monitoring

- **LLM config drift**: Compare `validate-llm-config.sh` output against known-good baseline.
- **Embedding coverage**: Track vec_articles/vec_entities sync percentages weekly.
- **Autonomy rule growth**: Monitor rules count for unexpected growth (currently 196).
- **Observability retention**: Verify 90-day purge runs successfully each Sunday.
- **Late.dev API**: Add DNS resolution check to daily preflight.

---

## 8. Appendix

### A. Updated Files (complete paths)

| File                | Absolute Path                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| CMDB.md             | `/Users/user/.openclaw/workspace/CMDB.md`                                                                  |
| gateway.md          | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/gateway.md`          |
| knowledge-base.md   | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/knowledge-base.md`   |
| integrations.md     | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/integrations.md`     |
| observability.md    | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/observability.md`    |
| content-pipeline.md | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/content-pipeline.md` |
| dev-patterns.md     | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/dev-patterns.md`     |
| MEMORY.md           | `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/MEMORY.md`                      |
| This report         | `/Users/user/Desktop/projects/openclaw/ARCHITECTURE-VALIDATION-REPORT.md`                                  |

### B. Validation Team Roster

| Agent                   | Task | Subsystem                    |
| ----------------------- | ---- | ---------------------------- |
| cmdb-validator          | #1   | CMDB Master Registry         |
| gateway-validator       | #2   | Gateway & Infrastructure     |
| kb-validator            | #3   | Knowledge Base               |
| integrations-validator  | #4   | External Integrations        |
| observability-validator | #5   | Observability & Autonomy     |
| content-validator       | #6   | Content Pipeline             |
| devpatterns-validator   | #7   | Dev Patterns & Gotchas       |
| sourcecode-validator    | #8   | Source Code Validation       |
| memory-syncer           | #9   | MEMORY.md Consolidation      |
| report-writer           | #10  | Final Report (this document) |

### C. Timeline

- **Start**: 2026-02-27 (architecture validation session initiated)
- **Tasks 1-8**: Parallel subsystem validation by 8 specialized agents
- **Task 9**: MEMORY.md consolidation and sync (ran after subsystem docs stabilized)
- **Task 10**: Final validation tests and report generation

### D. Live System Snapshot at Validation Time

```
KB articles:         867
KB entities:       2,251
KB decisions:      2,152
KB relations:      1,484
Obs events:        6,963
Obs scores:           30
Obs handoffs:        125
Autonomy rules:      196
Autonomy approvals:  262
Social posts:        589
Memory chunks:       143
CEO beliefs:          92

Launchd services:  6/6 running
Gateway:           PID 87096, port 18789, HTTP 200
LLM config:        15/15 checks passing
Databases:         6/6 accessible, 84MB total
```
