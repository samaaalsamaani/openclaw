# Architecture & CMDB Validation Plan

**Created:** 2026-02-27
**Status:** Ready for Execution
**Estimated Duration:** 8-12 hours

## Context

Following major system optimizations (Unified LLM Config, Phase 1 LLM Optimizations, PAIOS 7-upgrade), we need to validate that all architecture documentation accurately reflects the current system state.

**Recent Major Changes:**

- ✅ Unified LLM Config deployed (Feb 27) - single source of truth at `~/.openclaw/llm-config.json`
- ✅ Phase 1 LLM Optimizations (temperature tuning, prompt caching, max_tokens optimization)
- ✅ Native/Direct API Routing (Google/OpenAI/Anthropic direct, OpenRouter fallback)
- ✅ CMDB redesign (17→7 files, 1300→329 lines)
- ✅ PAIOS 7-upgrade (v2026.2.24)
- ✅ Personal CEO v1.0 milestone (C-Suite expansion, role identity, CXO operating model, CRM)

---

## Phase 1: CMDB Validation (2-3 hours)

### 1.1 Master CMDB Registry Review

**File:** `~/.openclaw/workspace/CMDB.md` (996 lines)
**Last Updated:** 2026-02-26

**Validation Tasks:**

- [ ] Verify all 68+ scripts exist at documented paths
- [ ] Validate 8 MCP servers are registered and functional
- [ ] Confirm 4 database schemas match actual tables
- [ ] Check 5 launchd services are running with correct configurations
- [ ] Validate workspace files are current
- [ ] Review config files for accuracy

**Key Areas:**

1. **Scripts Inventory** (Section 1)
   - Knowledge Base (25 scripts)
   - File Watcher (5 scripts)
   - Content Intelligence (7 scripts)
   - Social & Content (5 scripts)
   - Observability (3 scripts)
   - Self-Reflection (2 scripts)
   - Autonomy (1 script)
   - Media & Tools (7 scripts)
   - MCP Servers (3 servers)
   - Heartbeat & Scheduling (2 scripts)
   - Other Scripts (7 scripts)
   - CLI (1 unified command)

2. **MCP Servers** (Section 2)
   - 8 custom servers
   - 3 external servers
   - Registration matrix validation

3. **Databases** (Section 3)
   - Knowledge Base: `~/.openclaw/projects/knowledge-base/kb.sqlite`
   - Observability: `~/.openclaw/observability.sqlite`
   - Autonomy: `~/.openclaw/autonomy.sqlite`
   - Memory: `~/.openclaw/memory/main.sqlite`
   - Personal CEO: `~/.openclaw/projects/personal-ceo/ceo.sqlite` (NEW - add to CMDB)
   - Social History: `~/.openclaw/social-history.sqlite` (MISSING from CMDB - add)

4. **Launchd Services** (Section 4)
   - Validate 6 services (gateway, embedding-server, file-watcher, emit-server, daily-tasks, weekly-tasks)
   - CMDB shows 5, memory shows 6 - reconcile discrepancy

**Expected Outputs:**

- Updated CMDB.md with any missing CIs
- List of deprecated/removed CIs to prune
- Discrepancy report

---

## Phase 2: Subsystem Documentation Validation (4-5 hours)

### 2.1 Gateway & Infrastructure (`gateway.md`)

**Location:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/gateway.md`

**Critical Validation Points:**

- [ ] **LLM Config Integration** - NEW: Document unified LLM config system
  - Config location: `~/.openclaw/llm-config.json`
  - Feature flag: `PAIOS_LLM_CONFIG=1`
  - Config readers: TypeScript (OpenClaw), JavaScript (KB), Python (CEO)
  - Validation script: `~/.openclaw/scripts/validate-llm-config.sh`

- [ ] **Model Routing Table** - UPDATE: Verify current model assignments
  - Primary: `anthropic/claude-sonnet-4-6` (was this updated from dated variant?)
  - Premium: `anthropic/claude-opus-4-6`
  - Code tier: `openai-codex/gpt-5.3-codex`
  - Vision: `openrouter/google/gemini-2.5-flash`
  - Fallbacks: OpenAI GPT-4.1, OpenRouter models

- [ ] **Direct API Routing** - NEW: Document native routing system
  - Feature flags: `PAIOS_OPTIMIZED_ROUTING=1`, `PAIOS_CANARY_PCT=100`
  - Tier mapping: rapid→Google, pattern→OpenAI, deep/strategic→Anthropic
  - Fallback chain documentation

- [ ] **Gateway Version** - Verify current version (memory says v2026.2.25)

- [ ] **Port Configuration** - Confirm gateway port 18789, emit-server 11436, embedding-server 11435

- [ ] **Auth System** - Validate auth-profiles.json as single source of truth (NO keys in plist)

**Expected Outputs:**

- Updated gateway.md with LLM config system
- Model routing table with current assignments
- Direct API routing documentation

### 2.2 Knowledge Base (`knowledge-base.md`)

**Location:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/knowledge-base.md`

**Critical Validation Points:**

- [ ] **Database Schema** - Verify 11 tables match actual schema
  - Confirm `article_relations` table (not `relations`)
  - Validate `enrichment_status` column (complete/pending/partial)
  - Check NO `author` column exists

- [ ] **Enrichment System** - Validate current state
  - Memory shows: 865 articles, 599 complete, 4 pending
  - 3-tier system: L1-L4 enrichment levels
  - Prompt caching implementation (NEW from Phase 1 optimizations)

- [ ] **LLM Integration** - NEW: Document unified config usage
  - KB now uses llm-config.json via config reader
  - 3-tier fallback: Claude CLI → OpenAI → Anthropic
  - Files: llm.js, decisions.js, enrich.js

- [ ] **Scripts Inventory** - Verify all 11 Node scripts exist and match documentation

- [ ] **MCP Tools** - Confirm 11 tools exposed

- [ ] **Embedding System** - Validate port 11435, 768-dim vectors, nomic-embed-text

**Expected Outputs:**

- Updated knowledge-base.md with LLM config integration
- Prompt caching documentation
- Current enrichment metrics

### 2.3 External Integrations (`integrations.md`)

**Location:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/integrations.md`

**Critical Validation Points:**

- [ ] **Google Workspace** - Validate workspace-mcp version and 46 tools
  - New Google API key added: `google:default` in auth-profiles.json

- [ ] **Late.dev API** - Document known DNS failure issue
  - Current status: DNS resolution fails (service may be down)
  - Last working: (verify)

- [ ] **Social History DB** - Confirm paths and current metrics
  - Correct path: `~/.openclaw/social-history.sqlite` (NOT `~/.openclaw/projects/social-history.sqlite`)
  - Current: 589 posts, 432 with metrics

- [ ] **Cloudflare R2** - Document current status (BLOCKED on account enablement)

- [ ] **MCP Server Inventory** - Validate 7 Claude Code + 9 Gemini servers

**Expected Outputs:**

- Updated integrations.md with current API statuses
- Late.dev failure documentation
- R2 blocking issue noted

### 2.4 Observability & Autonomy (`observability.md`)

**Location:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/observability.md`

**Critical Validation Points:**

- [ ] **Observability DB** - Validate schema and current metrics
  - Correct path: `~/.openclaw/observability.sqlite` (NOT under projects/)
  - Table: `events`, column: `timestamp` (NOT `created_at`)
  - Current: 6,956 events
  - 13 event categories documented

- [ ] **Autonomy DB** - Validate schema
  - Correct path: `~/.openclaw/autonomy.sqlite`
  - Tables: `action_rules` + `approval_log` (NO `trust_score` table)
  - Uses: `consecutive_approvals` + `level` (NOT `trust_score` column)
  - Current: 129 rules, 258 approvals

- [ ] **Retention Policy** - Confirm 90-day policy in weekly-tasks.sh

- [ ] **Cross-Brain Decomposition** - Validate 7 domains

- [ ] **Compound Orchestration** - Verify timings (30s subtask, 60s total)

**Expected Outputs:**

- Updated observability.md with current metrics
- Corrected table/column names
- Retention policy documentation

### 2.5 Content Pipeline (`content-pipeline.md`)

**Location:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/content-pipeline.md`

**Critical Validation Points:**

- [ ] **Content Calendar Schema** - Verify NEW columns added Feb 26
  - New columns: `language`, `format`
  - Full schema with all columns

- [ ] **Calendar Script** - Validate calendar.py imports
  - Confirm `PROFILES_DIR` imported from config_lib (was missing, fixed Feb 26)

- [ ] **Auto-Schedule System** - Verify 8 slots/week, Riyadh TZ

- [ ] **Daily/Weekly Automation** - Confirm schedules
  - daily-tasks.sh: 8 hourly slots (07h-23h) + every-minute tasks
  - weekly-tasks.sh: Sunday 03:00 (Weekly Brand Board Meeting)

- [ ] **Posting Pipeline** - Validate flow: calendar.py → poster.py → Late.dev API

**Expected Outputs:**

- Updated content-pipeline.md with new schema columns
- Confirmed import fixes
- Current automation schedules

### 2.6 Dev Patterns & Gotchas (`dev-patterns.md`)

**Location:** `~/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/subsystems/dev-patterns.md`

**Critical Validation Points:**

- [ ] **LLM Config Gotchas** - NEW: Add unified config patterns
  - Model ID format standards
  - Tier system (parameter knobs, not model selectors)
  - Config reader usage patterns

- [ ] **Personal CEO Gotchas** - NEW: Add Personal CEO patterns
  - Table names: `habits` (NOT habit_logs), `relationships` (NOT contacts)
  - Column names: `last_contact_at`, `scored_at`, `timestamp`
  - DB paths: correct paths vs 0-byte placeholders

- [ ] **API Gotchas** - NEW: Add API patterns
  - Health check 4xx codes interpretation
  - Late.dev DNS failures
  - Codex OAuth 60-day expiry

- [ ] **SQLite Patterns** - Add LIKE escaping pattern
  - Escape `%` and `_` with `ESCAPE '\\'` when interpolating user text

**Expected Outputs:**

- Updated dev-patterns.md with all new gotchas
- LLM config patterns
- Personal CEO patterns

---

## Phase 3: Planning Documentation Validation (1-2 hours)

### 3.1 STATE.md Review

**Location:** `/Users/user/Desktop/projects/openclaw/.planning/STATE.md`

**Validation Tasks:**

- [ ] Verify "Phase 15 of 15" is accurate
- [ ] Confirm all 46 plans marked completed
- [ ] Validate performance metrics are current
- [ ] Check retrospective ratings
- [ ] Ensure bug fixes list is comprehensive

### 3.2 ROADMAP.md Review

**Location:** `/Users/user/Desktop/projects/openclaw/.planning/ROADMAP.md`

**Validation Tasks:**

- [ ] Verify all 15 phases are documented
- [ ] Check dependency chain is accurate
- [ ] Validate success criteria for each phase
- [ ] Ensure requirements mapping is complete

### 3.3 PAIOS-PROJECT.md Review

**Location:** `/Users/user/Desktop/projects/openclaw/.planning/PAIOS-PROJECT.md`

**Validation Tasks:**

- [ ] Confirm Phases C & D status
- [ ] Validate constraints (free-tier, macOS-native, bash 3.2)
- [ ] Check masterplan alignment

### 3.4 ARCHITECTURE.md Review

**Location:** `/Users/user/Desktop/projects/openclaw/.planning/ARCHITECTURE.md`

**Validation Tasks:**

- [ ] Verify 6 components map to current architecture
- [ ] Validate 6 data flows are accurate
- [ ] Check 5 integration boundaries
- [ ] Confirm 4 build phases status
- [ ] Review error handling patterns (6 patterns)
- [ ] Update risk register

---

## Phase 4: Source Code Architecture Validation (2-3 hours)

### 4.1 Gateway Server

**File:** `src/gateway/server.impl.ts`

**Validation Tasks:**

- [ ] Verify LLM config integration in gateway
- [ ] Check model routing implementation
- [ ] Validate direct API routing code
- [ ] Confirm feature flag handling

### 4.2 Agent Runtime

**File:** `src/agents/pi-embedded-runner/run.ts`

**Validation Tasks:**

- [ ] Verify LLM config reader usage
- [ ] Check model fallback chain
- [ ] Validate prompt caching implementation

### 4.3 Routing Components

**Files:**

- `src/agents/routing-middleware.ts`
- `src/agents/task-classifier.ts`
- `src/agents/compound-orchestrator.ts`
- `src/agents/task-decomposer.ts`

**Validation Tasks:**

- [ ] Verify model assignments match llm-config.json
- [ ] Check no invalid model IDs remain (e.g., `claude-sonnet-4-6-20250514`)
- [ ] Validate LLM floor compliance (no `gpt-4.1-mini`)
- [ ] Confirm temperature settings by tier

### 4.4 LLM Config Integration

**New Files:**

- `src/agents/llm-config-reader.ts`
- `src/agents/llm-config-reader.test.ts`
- `src/agents/llm-config-integration.test.ts`

**Validation Tasks:**

- [ ] Verify config reader is compiled in dist/
- [ ] Check 122 tests are passing
- [ ] Validate type definitions exist
- [ ] Confirm gateway restart with new config

---

## Phase 5: Memory & Documentation Sync (1 hour)

### 5.1 MEMORY.md Updates

**File:** `/Users/user/.claude/projects/-Users-user-Desktop-projects-openclaw/memory/MEMORY.md`

**Critical Updates Needed:**

- [ ] **TRUNCATION WARNING**: MEMORY.md is 202 lines (limit: 200)
  - Move detailed content to subsystem files
  - Keep only essential index in MEMORY.md

- [ ] **System Vitals** - Update if changed since Feb 27
  - KB metrics
  - Observability events
  - Autonomy rules
  - Social posts
  - Launchd services

- [ ] **Model Configuration** - Already current (Feb 27)

- [ ] **Completed Work** - Add any recent completions
  - Architecture validation (this work)

### 5.2 Cross-Reference Validation

**Validation Tasks:**

- [ ] Ensure MEMORY.md references subsystem files correctly
- [ ] Verify subsystem files link back to MEMORY.md
- [ ] Check CMDB references in subsystem docs
- [ ] Validate all file paths are absolute and correct

---

## Phase 6: Gap Analysis & Documentation Debt (1-2 hours)

### 6.1 Missing Documentation

**Identify and Document:**

- [ ] Personal CEO v1.0 architecture
  - C-Suite expansion (7 officers)
  - Role identity system (5 phases)
  - CXO operating model (strategy-to-execution cascade)
  - CRM completion

- [ ] Mirrors project architecture
  - Phase 0 Discovery outcomes
  - Foundation Sprint deliverables

- [ ] Phase 1 LLM Optimizations details
  - Prompt caching implementation
  - Temperature tuning strategy
  - Max tokens optimization
  - Cost impact analysis

- [ ] Build system changes
  - Rolldown/tsdown circular chunk fix
  - Compiled output structure

### 6.2 Deprecated Documentation

**Identify and Remove/Archive:**

- [ ] MiniMax references (fully removed Feb 27)
- [ ] Gemini CLI documentation (9-14s overhead, removed)
- [ ] Invalid dated model IDs documentation
- [ ] Dead code references (152 LOC removed)

### 6.3 Stale Metrics

**Update Current Values:**

- [ ] Node version (confirm Node 22 vs 25)
- [ ] Gateway version (v2026.2.25 confirmed?)
- [ ] Python venv packages (119 packages current?)
- [ ] Database sizes
- [ ] Performance benchmarks

---

## Phase 7: Validation Testing (1-2 hours)

### 7.1 System Health Check

**Run Comprehensive Health Check:**

```bash
# Use existing health skill or create validation script
~/.openclaw/scripts/system-health-check.sh
```

**Validate:**

- [ ] 6/6 launchd services running
- [ ] All databases accessible
- [ ] MCP servers responding
- [ ] API keys valid (except Late.dev)
- [ ] LLM config validation passes (17/17 checks)

### 7.2 LLM Config Validation

**Run Validation Script:**

```bash
~/.openclaw/scripts/validate-llm-config.sh
```

**Confirm:**

- [ ] All 17 validation checks pass
- [ ] No invalid model IDs
- [ ] Tier configuration correct
- [ ] Fallback chains valid

### 7.3 Integration Tests

**Run Test Suite:**

```bash
cd /Users/user/Desktop/projects/openclaw
pnpm test
```

**Validate:**

- [ ] LLM config reader tests pass (122/122)
- [ ] Agent integration tests pass
- [ ] No regressions from recent changes

---

## Phase 8: Final Documentation Updates (1 hour)

### 8.1 Update All Changed Documentation

**Apply all validated changes:**

- [ ] CMDB.md
- [ ] All 6 subsystem files (gateway, kb, integrations, obs, content, dev)
- [ ] MEMORY.md (trim to 200 lines)
- [ ] Planning docs (STATE, ROADMAP, ARCHITECTURE, PAIOS-PROJECT)

### 8.2 Create Validation Report

**File:** `ARCHITECTURE-VALIDATION-REPORT.md`

**Include:**

- Summary of findings
- List of updates made
- Identified gaps and remediation
- Discrepancies found and resolved
- Deprecated items removed
- New documentation added
- Recommendations for ongoing maintenance

### 8.3 Update MEMORY.md References

**Add to Completed Work:**

```markdown
- Architecture & CMDB Validation DONE (Feb 27): Comprehensive review post-Phase 1 optimizations
  - Validated CMDB.md (996 lines, 68+ scripts, 8 MCP servers, 6 databases)
  - Updated all 6 subsystem docs (gateway, kb, integrations, obs, content, dev)
  - Validated source code against docs (no invalid model IDs, LLM floor compliance)
  - Trimmed MEMORY.md to 200 lines, moved details to subsystems/
  - Created validation report with gap analysis
```

---

## Success Criteria

**Phase Complete When:**

- [ ] All CMDB entries validated against actual system
- [ ] All 6 subsystem docs updated with recent changes
- [ ] All planning docs reflect current state
- [ ] Source code matches documented architecture
- [ ] MEMORY.md under 200 lines
- [ ] No invalid model IDs in codebase
- [ ] LLM config validation passes 17/17 checks
- [ ] All tests passing (122/122 LLM config tests)
- [ ] Validation report created
- [ ] No documentation debt identified

---

## Execution Strategy

**Recommended Approach:**

1. **Phase 1 (CMDB)** - Start here, most comprehensive
2. **Phase 2 (Subsystems)** - Can parallelize 6 subsystems
3. **Phase 4 (Source Code)** - Can run in parallel with Phase 2
4. **Phase 3 (Planning Docs)** - Quick pass
5. **Phase 6 (Gap Analysis)** - Aggregate findings from 1-4
6. **Phase 5 (Memory Sync)** - After gap analysis
7. **Phase 7 (Testing)** - Validate everything works
8. **Phase 8 (Final Updates)** - Apply all changes

**Parallelization:**

- Phases 2 & 4 can run concurrently (different team members or agents)
- Each subsystem in Phase 2 can be validated independently
- Testing in Phase 7 can start as soon as any doc is updated

**Estimated Timeline:**

- Sequential: 12-15 hours
- With parallelization: 8-10 hours
- With agent team: 4-6 hours

---

## Risk Mitigation

**Potential Issues:**

1. **Documentation divergence** - If docs haven't been updated since Phase 1 optimizations
   - Mitigation: Use git history to track changes
2. **Source code changes** - If code has evolved since last doc update
   - Mitigation: Compare against git commits since Feb 27
3. **MEMORY.md truncation** - Already at 202 lines (over limit)
   - Mitigation: Immediate triage and move to subsystem files
4. **Test failures** - If recent changes broke tests
   - Mitigation: Run tests first to establish baseline

---

## Next Steps

**To Begin Execution:**

1. Review and approve this plan
2. Choose execution strategy (sequential, parallel, or team-based)
3. Start with Phase 1 (CMDB validation) - most critical
4. Create tracking issue or project board
5. Set up validation report template
6. Begin systematic validation

**Questions Before Starting:**

- Should we use a team approach (multiple agents) for parallelization?
- Do you want a quick-pass first (identify major issues) or deep-dive (comprehensive)?
- Are there specific subsystems that are higher priority?
- Should we create a tracking dashboard for this validation work?
