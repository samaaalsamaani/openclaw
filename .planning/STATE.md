# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Three AI brains, one protocol (MCP), shared memory (KB), unified routing — so the right brain handles every task automatically, and knowledge compounds across all interactions.
**Current focus:** E2E validated, post-validation fixes applied, ready for daily use

## Current Position

Phase: v3.0 milestone — Defining requirements
Plan: —
Status: System Reliability & Hardening — stabilization milestone started
Last activity: 2026-02-27 — v3.0 milestone started, gathering requirements for system stabilization

v1 Progress: [##########] 100% (29/29 plans, 46/46 requirements)
v2 Progress: [##########] 100% (17/17 plans, 21/21 requirements)
E2E Valid.: [##########] 100% (7/7 subsystems tested, 10 bugs fixed, 3 gaps closed)

## Performance Metrics

**Velocity:**

- v1 plans completed: 29 (Phase 1: 5, Phase 2: 2, Phase 3: 5, Phase 4: 4, Phase 5: 3, Phase 6: 3, Phase 7: 3, Phase 8: 2, Phase 9: 2)
- v2 plans completed: 17 (Phase 10: 3, Phase 11: 3, Phase 12: 3, Phase 13: 2, Phase 14: 3, Phase 15: 2)
- Total execution time: ~5 hours across sessions

**By Phase:**

| Phase | Plans | Status   |
| ----- | ----- | -------- |
| 1     | 5/5   | Complete |
| 2     | 2/2   | Complete |
| 3     | 5/5   | Complete |
| 4     | 4/4   | Complete |
| 5     | 3/3   | Complete |
| 6     | 3/3   | Complete |
| 7     | 3/3   | Complete |
| 8     | 2/2   | Complete |
| 9     | 2/2   | Complete |
| 10    | 3/3   | Complete |
| 11    | 3/3   | Complete |
| 12    | 3/3   | Complete |
| 13    | 2/2   | Complete |
| 14    | 3/3   | Complete |
| 15    | 2/2   | Complete |

_v1: 29 plans, 46 requirements. v2: 17 plans, 21 requirements. Total: 46 plans, 67 requirements._
| Phase 02 P02 | 140 | 3 tasks | 3 files |
| Phase 04 P01 | 6 | 2 tasks | 3 files |
| Phase 04 P02 | 105 | 2 tasks | 2 files |
| Phase 05-okr-management-kpi-dashboard P01 | 240 | 2 tasks | 3 files |

## v1 Retrospective (Feb 22, 2026)

**Overall Grade:** 5.8/10 → improved to ~7/10 after bug fixes
**Strongest:** TypeScript files (7-8/10) — compiler catches errors, established patterns
**Weakest:** Shell scripts (3-5/10) — triple-quote injection regressed in 4 files, word-splitting, unbound variables

**Bugs fixed post-review:**

1. Triple-quote `'''$VAR'''` Python injection in 4 scripts → replaced with temp files + sys.argv
2. Unbound `$JSON` variable in pipeline.sh → initialized to `false`
3. ESM/CJS confusion in task-router/server.js → added package.json with `"type": "module"`
4. Word-splitting in dual-review.sh file iteration → `while IFS= read -r` pattern
5. `echo -e` with literal `\n` → replaced with `printf` and real newlines
6. `echo` with arbitrary content → replaced with `printf` for robustness

**Key lesson:** Speed in later phases (3 min/plan) correlated with regressing known bugs. v2 prioritized quality over velocity.

## Accumulated Context

### Decisions

- [Roadmap]: Hub-and-spoke MCP topology (Gateway as hub, not full mesh)
- [Roadmap]: Heuristic task classification (keyword/regex, no LLM call)
- [Roadmap]: Agent SDK query() as primary primitive, subprocess as fallback
- [Phase 1]: Tool names prefixed: `kb_*`, `macos_*`, `analytics_*`
- [Phase 1]: execFileSync used in macOS MCP (security fix)
- [Phase 1]: busy_timeout 5000ms in qmd-manager.ts + manager-sync-ops.ts
- [Phase 1]: Claude Code MCP servers registered via `claude mcp add -s user`
- [Phase 2]: Heartbeat IS working — quiet hours suppression (07:00-23:00 Riyadh)
- [Phase 2]: KB seeded with 59 articles, all with embeddings (text-embedding-3-small)
- [Phase 3]: SDK runner uses `bypassPermissions` + custom `canUseTool` callback
- [Phase 3]: In-process MCP servers: gateway-kb (4 tools) + gateway-system (1 tool)
- [Phase 3]: SDK uses snake_case usage fields (input_tokens, not inputTokens)
- [Phase 3]: `isSdkProvider()` routing added before `isCliProvider()` in agent.ts
- [Phase 4]: Skills stored in `~/.claude/skills/<name>/SKILL.md` (personal scope)
- [Phase 4]: /codex-review uses `disable-model-invocation: true` (user-only)
- [Phase 5]: Hooks in `~/.claude/hooks/` registered in `~/.claude/settings.json`
- [Phase 5]: SessionStart → KB context injection, PostToolUse → async KB ingest
- [Phase 5]: Stop → quality gate, SessionEnd → session learnings to KB
- [Phase 6]: Task classifier in `src/agents/task-classifier.ts` (6 domains, <50ms)
- [Phase 6]: Router MCP server at `~/.openclaw/projects/task-router/server.js`
- [Phase 6]: 4→6 MCP servers (knowledge-base, macos-system, session-analytics, task-router, observability)
- [Phase 7]: HEARTBEAT.md already had Tier 3/6/7 content automation defined
- [Phase 7]: End-to-end pipeline: `~/.openclaw/projects/content-intel/pipeline.sh`
- [Phase 8]: Codex instructions.md at `~/.codex/instructions.md`
- [Phase 8]: Cross-session retrieval via SessionEnd→KB→SessionStart hook chain
- [Phase 9]: Dual-review uses Haiku (quality) + Opus (architecture) via `dual-review.sh`
- [Phase 10]: Observability SQLite at ~/.openclaw/observability.sqlite
- [Phase 10]: 9 event categories, trace-linked, quality scoring 1-5
- [Phase 10]: MCP server + /trace skill for querying events
- [Phase 11]: fswatch daemon at ~/.openclaw/projects/file-watcher/watcher.sh
- [Phase 11]: Screenshots → Gemini Flash OCR → KB, Documents → markitdown → KB
- [Phase 11]: bash 3.2 compatible (no associative arrays, temp dir dedup)
- [Phase 12]: Autonomy SQLite at ~/.openclaw/autonomy.sqlite
- [Phase 12]: 30 rules (15 safe, 8 ask, 7 never), 5 approvals → auto-promote
- [Phase 12]: /autonomy skill for viewing/configuring trust levels
- [Phase 13]: `ai` CLI at ~/.openclaw/bin/ai, added to PATH via .zshrc
- [Phase 13]: Inline classifier (no MCP server), loads routing-weights.json if available
- [Phase 13]: Routes code→Codex, creative→Opus, analysis→Sonnet, system→Sonnet
- [Phase 14]: Agent Teams enabled via CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
- [Phase 14]: TeammateIdle hook: syntax checks on modified files, runs fast tests
- [Phase 14]: TaskCompleted hook: syntax + merge conflict + JSON validation
- [Phase 14]: 10 team agents: 4 research, 2 review, 4 build
- [Phase 14]: /team skill for spawning pre-configured teams
- [Phase 15]: reflect.js generates weekly report, saves to brain + KB
- [Phase 15]: optimize.js reads quality scores, adjusts classifier weights
- [Phase 15]: Wired to heartbeat Tier 7 (weekly Sunday)
- [Phase 04]: Energy threshold = 4.0 (not 5.0) for executive summary mode
- [Phase 04]: Cross-domain SQL for Mirrors posts (engagement rate prioritized)
- [Phase 04]: Use UNIQUE INDEX instead of ALTER TABLE for safe CRM migration
- [Phase 04]: OpenAI Function Calling strict mode for reliable contact parsing

### Pending Todos

- [ ] User must re-authenticate YouTube on Late.dev dashboard (token expired Feb 21)
- [ ] Fill content calendar with first real week of posts (Day 3-4 of shake-down)
- [ ] Let auto-post publish and score results via observability (Day 5-7)
- [ ] Review first weekly self-reflection report (Sunday)

### Blockers/Concerns

- YouTube token still expired — needs manual re-auth
- Agent Teams is experimental — may have breaking changes
- Routing weights need more quality scores to optimize (currently 2 scored traces)
- System needs real daily usage to accumulate data for self-optimization

## Phase Completion Summaries

### Phase 1: MCP Mesh Foundation

- MCP mesh wired: 4 servers in Claude Code, 4 in Codex CLI
- Codex features: sqlite, memory_tool, multi_agent enabled
- SQLite busy_timeout: 5000ms, MCP servers hardened, 240 memory tests pass

### Phase 2: Heartbeat & KB Seeding

- Heartbeat running on 2h interval during active hours
- KB: 59 articles, all with embeddings, FTS5 + semantic search verified

### Phase 3: Agent SDK Integration

- sdk-runner.ts with Agent SDK query(), canUseTool, AbortController
- In-process MCP servers (gateway-kb, gateway-system)
- 11 tests pass, 50-query stress test verified

### Phase 4: Claude Code Native Skills

- 8→12 skills at ~/.claude/skills/: kb, brand, capture, calendar, post, competitors, health, codex-review, trace, autonomy, team
- All with YAML frontmatter, argument hints, allowed-tools

### Phase 5: Hooks & Auto-Ingestion

- SessionStart: KB context injection on startup + compact
- PostToolUse: async KB auto-ingest for Write operations
- Stop: quality gate for truncated/incomplete responses
- SessionEnd: session learnings persistence to KB

### Phase 6: Task Router

- Heuristic classifier: 6 domains (code, creative, analysis, vision, system, schedule)
- User overrides: "ask Claude", "have Codex review", "use Gemini"
- Vision shortcut: images → Gemini Flash (preserves free tier)
- Router MCP server registered in Claude Code + Codex CLI

### Phase 7: Content Automation Pipeline

- Heartbeat Tier 3: auto-post via calendar.py every 4h
- Heartbeat Tier 6: competitor sweep + pillar balance + engagement sync daily
- End-to-end pipeline: capture → analyze → adapt → schedule → auto-post

### Phase 8: Cross-Session Knowledge

- Codex instructions.md with PAIOS architecture context
- Cross-session retrieval: SessionEnd→KB→SessionStart hook chain
- Task-router MCP registered in Codex config

### Phase 9: Dual-Brain Code Review

- dual-review.sh: Haiku (code quality) + Opus (architecture)
- Combined report with both perspectives
- /codex-review skill wired to pipeline script

### Phase 10: Observability Foundation

- events.js: SQLite event store with 9 categories, trace linking, quality scoring
- emit.sh: shell helper for bash scripts
- MCP server + /trace skill for querying events
- All existing scripts instrumented with traceId + event emission

### Phase 11: File Automation

- fswatch daemon monitoring ~/Screenshots + ~/Downloads
- File classifier: extension + MIME type → category
- Screenshots → Gemini Flash (OpenRouter API) → KB ingest
- Documents → markitdown → KB ingest
- Media → macOS notification (user decides)
- launchd plist for auto-start

### Phase 12: Progressive Autonomy

- autonomy.js: action classification (safe/ask/never)
- 30 default rules seeded, pattern matching with wildcards
- Trust accumulation: 5 consecutive approvals → auto-promote
- /autonomy skill for viewing and configuring trust levels

### Phase 13: Unified CLI

- `ai` command at ~/.openclaw/bin/ai, added to PATH
- Inline task classifier with keyword matching + configurable base weights
- Routes to Codex (code) or Claude (creative/analysis/system/schedule)
- `ai status` dashboard: brains, KB, observability, autonomy, file watcher, MCP
- `ai --json` stream mode, `ai --verbose` routing info
- Loads optimized weights from routing-weights.json when available

### Phase 14: Agent Teams

- CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in settings.json
- TeammateIdle hook: validates syntax on modified files, runs fast tests
- TaskCompleted hook: validates syntax, merge conflicts, JSON validity
- 10 team agent definitions: research (4), review (2), build (4)
- /team skill for spawning pre-configured teams

### Phase 15: Dashboard & Self-Reflection

- reflect.js: weekly self-reflection (routing quality, errors, autonomy, KB stats)
- Recommendations engine: confidence thresholds, error rates, domain imbalance
- Report saved to ~/Documents/OpenClaw/Areas/PAIOS Reports/ + ingested to KB
- optimize.js: reads quality scores, adjusts classifier base weights
- ai CLI loads optimized weights from routing-weights.json
- Wired to heartbeat Tier 7 (weekly Sunday)

## E2E Validation (Feb 22, 2026)

**Overall Grade:** 7.5/10 — All 7 subsystems functional after bug fixes.

### Bugs Fixed During Validation (10)

| #   | Bug                                                                              | Severity | Script                                     | Fix                        |
| --- | -------------------------------------------------------------------------------- | -------- | ------------------------------------------ | -------------------------- |
| 1   | fswatch missing `Renamed` event                                                  | High     | watcher.sh                                 | Added `--event Renamed`    |
| 2   | Screenshot/document KB ingest called deep-ingest.js with file path (expects URL) | High     | process-screenshot.sh, process-document.sh | Direct SQLite insert       |
| 3   | Direct SQLite inserts bypassed FTS5 index                                        | High     | process-screenshot.sh, process-document.sh | Added FTS5 INSERT          |
| 4   | KB context injection used FTS5 AND (all keywords must match)                     | High     | kb-context-inject.sh                       | Changed to OR              |
| 5   | Tags displayed character-by-character (JSON string not parsed)                   | Medium   | kb-context-inject.sh                       | json.loads() parsing       |
| 6   | setLevel() didn't reset consecutive_approvals                                    | Medium   | autonomy.js                                | Added reset to UPSERT      |
| 7   | Session learnings hook passed local file to deep-ingest.js                       | High     | session-learnings.sh                       | Direct SQLite + FTS        |
| 8   | Tags format inconsistency (comma vs JSON array)                                  | Low      | 3 scripts                                  | Standardized to JSON array |
| 9   | Calendar --platforms JSON split on commas                                        | Medium   | calendar.py                                | json.loads() try-first     |
| 10  | Calendar --tags same issue                                                       | Medium   | calendar.py                                | Same fix                   |

### Post-Validation Hardening (3 gaps closed)

| Gap                                        | Fix                                        |
| ------------------------------------------ | ------------------------------------------ |
| Classifier had zero Arabic keyword support | Added 30+ Arabic keywords across 5 domains |
| No-match prompts got 0% confidence         | Added "general" fallback domain at 50%     |
| Keyword lists too small → low confidence   | Expanded from ~50 to ~130 keywords (EN+AR) |

**Classifier confidence:** 46% avg → **81% avg** across 10 test prompts after hardening.

### Subsystem Verification Summary

| Subsystem        | Verified Capabilities                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| File Watcher     | Screenshot → Gemini Flash OCR → KB article #61                             |
| CLI Routing      | 10 prompts, all 5 domains correct, Arabic works                            |
| Autonomy         | Classification, trust accumulation (4→5), promotion                        |
| KB + Hooks       | FTS (EN+AR), OR queries, context injection (3 articles), session learnings |
| Content Capture  | URL → download → summary (L3/L4) → ~/Documents/OpenClaw/Inbox/             |
| Content Calendar | Add, list, week view, pillar balance, auto-post timing                     |
| Observability    | 62 events, 6 categories, 0 errors, self-reflection report + optimizer      |

## Session Continuity

Last session: 2026-02-22
Status: v1 + v2 COMPLETE. E2E validated. 10 bugs fixed, 3 gaps closed. System ready for daily use. Next milestone: first week of real-world usage to generate data for self-optimization.
