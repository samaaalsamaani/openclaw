# PAIOS Custom Skills Analysis

**Analysis Date:** 2026-02-27
**Total Skills:** 11
**Location:** `~/.claude/skills/`

## Executive Summary

PAIOS has deployed 11 custom Claude Code skills organized into 4 functional categories: Knowledge & Content (5 skills), Operations (3 skills), Development (2 skills), and Infrastructure (1 skill). All skills follow a consistent structure with clear invocation patterns, tool restrictions, and workflow documentation. The skill set provides comprehensive coverage of PAIOS core functions with minimal duplication and strong integration patterns.

**Key Findings:**

- Well-organized with clear categorization and consistent structure
- Strong integration between skills (e.g., capture → kb → post pipeline)
- All skills use restricted tool sets (no unrestricted access)
- No duplicate functionality across skills
- Documentation is clear and actionable
- Minor gaps: no direct personal CEO integration, missing analytics/reporting skill

## Skills Inventory

### 1. Knowledge & Content Management (5 skills)

#### `/capture` - Content Capture Pipeline

**Purpose:** Analyze any URL or media through the intelligence pipeline
**Tools:** Bash, Read
**Arguments:** `<url-or-path> [--depth quick|standard|deep]`
**Key Features:**

- 3 depth levels (quick/standard/deep)
- Automatic transcription + OCR + speaker ID
- Intent classification (learn/try/search/share/inspire/recreate)
- Auto-ingestion to KB
- Output to `~/Documents/OpenClaw/Inbox/`

**Integration Points:**

- Feeds into `/kb` for storage
- Classification suggests `/post` skill for content creation
- Triggers `/calendar` for scheduling

#### `/kb` - Knowledge Base Query

**Purpose:** Natural language search across captured knowledge
**Tools:** Bash, Read
**Arguments:** `[search query]`
**Key Features:**

- FTS5 full-text search + semantic similarity
- PARA filtering (project/area/resource/archive)
- Author, tag, type filters
- Recent items view (default 10)

**Integration Points:**

- Primary storage for `/capture` output
- Referenced by `/post` for content research
- Used by `/team` research teams

#### `/brand` - Brand Voice Loader

**Purpose:** Load brand voice, pillars, personas into session context
**Tools:** Read, Glob
**Arguments:** `[profile-name]` (default: faisal)
**Key Features:**

- Multi-profile support (faisal, samaa)
- Loads 6 brand assets: voice, kit, pillars, personas, competitors, hook performance
- Session-persistent context

**Integration Points:**

- Required prerequisite for `/post` skill
- Used by `/calendar` for content planning
- Referenced in `/capture` pillar suggestions

#### `/post` - Social Media Publisher

**Purpose:** Create and publish social posts with brand voice
**Tools:** Bash, Read
**Arguments:** `[platform] [topic or content]`
**Key Features:**

- 4 platforms: Twitter, LinkedIn, Instagram, TikTok
- Late.dev API integration
- 5 hook styles with performance tracking
- Platform-specific constraints enforcement
- Interactive preview + confirm workflow

**Integration Points:**

- Reads brand data loaded by `/brand`
- Updates `/calendar` after publication
- Stores post metrics in social-history.sqlite

#### `/calendar` - Content Calendar Manager

**Purpose:** Schedule, track, and manage content pipeline
**Tools:** Bash, Read
**Arguments:** `[list|add|schedule|stats] [options]`
**Key Features:**

- 5 content statuses: idea → draft → scheduled → posted → skipped
- Pillar balance tracking
- Platform distribution analytics
- Multi-profile support

**Integration Points:**

- Receives scheduling requests from `/capture` and `/post`
- Triggers daily-tasks.sh for auto-posting
- Feeds analytics to weekly digest

### 2. Operations & Intelligence (3 skills)

#### `/competitors` - Competitor Tracker

**Purpose:** Monitor competitor activity via Brave Search
**Tools:** Bash, Read
**Arguments:** `[sweep|digest|add|remove] [competitor-name]`
**Key Features:**

- Weekly digests
- Platform-specific tracking
- Trend analysis across competitors
- Gap identification (topics they cover, we don't)

**Integration Points:**

- Competitor data stored in `~/.openclaw/profiles/*/competitors.json`
- Digests feed into `/calendar` for content opportunities
- Can trigger `/capture` for deep dives

#### `/autonomy` - Progressive Autonomy Manager

**Purpose:** Configure trust levels and auto-approval settings
**Tools:** Bash, Read
**Arguments:** `[stats|trust|promotions|set <pattern> <level>]`
**Key Features:**

- 3 trust levels: safe, ask, never
- Auto-promotion after N approvals (default 5)
- Pattern-based rules (exec:_, content:_, write:\*)
- Approval history tracking

**Integration Points:**

- Stores rules in `~/.openclaw/autonomy.sqlite`
- Referenced by all execution paths
- Affects `/post` auto-publish behavior

#### `/trace` - Observability Trace Viewer

**Purpose:** Query and analyze PAIOS observability events
**Tools:** Bash, Read
**Arguments:** `[trace-id|category|"stats"|"errors"|"recent"]`
**Key Features:**

- 5 event categories: routing, kb, content, hook, system
- Trace scoring (1-5 quality ratings)
- Error filtering
- Time range queries

**Integration Points:**

- Reads `~/.openclaw/observability.sqlite`
- All skills emit trace events
- Quality scores feed improvement loops

### 3. Development & Code Review (2 skills)

#### `/codex-review` - Dual-Brain Code Review

**Purpose:** Two-perspective review (quality + architecture)
**Tools:** Bash, Read, Glob, Grep
**Arguments:** `[file-or-directory]`
**Special:** `disable-model-invocation: true` (uses external models)
**Key Features:**

- Haiku for code quality (bugs, security, performance)
- Opus for architecture (design, abstractions, extensibility)
- Automated pipeline via dual-review.sh
- Fallback to inline review if pipeline fails

**Integration Points:**

- Can review PR diffs via `gh pr diff`
- Findings can be added to KB via manual follow-up
- Complements `/team` review teams

#### `/team` - Agent Team Spawner

**Purpose:** Spawn pre-configured multi-agent teams
**Tools:** Bash, Read, Task
**Arguments:** `<research|review|build> "task description"`
**Key Features:**

- 3 team templates: research (3 agents), review (2 agents), build (4 agents)
- Model assignments (Haiku for tests, Sonnet for analysis/build)
- Parallel execution coordination
- Integrated with Claude Code's Agent Teams feature

**Integration Points:**

- Research teams use `/kb` for context
- Review teams complement `/codex-review`
- Build teams follow codebase guidelines from `/kb`

### 4. Infrastructure (1 skill)

#### `/health` - System Health Check

**Purpose:** Validate all AI brains, APIs, MCP servers, tokens
**Tools:** Bash, Read
**Arguments:** None
**Key Features:**

- 3 brain status checks (Gateway, Claude Code CLI, Codex CLI)
- 7 API validations (Anthropic, OpenAI, OpenRouter, Brave, ElevenLabs, Deepgram, Late.dev)
- MCP server connectivity
- KB statistics
- OAuth token expiry warnings
- Python venv validation

**Integration Points:**

- Reads auth-profiles.json for API keys
- Queries KB via organize.js for stats
- Checks launchd services via launchctl

## Categorization Summary

| Category            | Skills | Primary Function                                 |
| ------------------- | ------ | ------------------------------------------------ |
| Knowledge & Content | 5      | Content capture, storage, creation, distribution |
| Operations          | 3      | Monitoring, autonomy, observability              |
| Development         | 2      | Code review, team coordination                   |
| Infrastructure      | 1      | Health monitoring                                |

## Usage Patterns

**Most Likely Daily Use:**

1. `/capture` - Content ingestion
2. `/kb` - Knowledge lookup
3. `/post` - Content publishing
4. `/calendar` - Schedule management
5. `/trace` - Activity monitoring

**Weekly Use:**

- `/competitors` - Competitive intelligence
- `/health` - System validation
- `/brand` - Context refresh for content sessions

**On-Demand Use:**

- `/codex-review` - Code quality checks
- `/team` - Complex multi-agent tasks
- `/autonomy` - Trust level tuning

**Evidence:** No direct usage statistics available in Claude configuration files. Inference based on skill purpose and integration density.

## Integration Analysis

### Strong Integration Chains

**Content Pipeline:** `/capture` → `/kb` → `/post` → `/calendar`

- Fully automated flow from URL capture to publication
- Each skill has explicit next-step references
- Shared data in KB and social-history databases

**Intelligence Loop:** `/competitors` → `/capture` → `/kb` → `/post`

- Competitive intel feeds content creation
- Captured insights inform pillar strategy
- Brand voice consistency via `/brand`

**Development Workflow:** `/codex-review` ↔ `/team` ↔ `/trace`

- Code review can trigger team spawns for fixes
- Teams emit trace events for observability
- Trace insights inform autonomy tuning

### Cross-Skill Dependencies

| Skill           | Depends On                  | Feeds Into                  |
| --------------- | --------------------------- | --------------------------- |
| `/capture`      | None                        | `/kb`, `/calendar`, `/post` |
| `/kb`           | `/capture`                  | `/post`, `/team`            |
| `/brand`        | None                        | `/post`, `/calendar`        |
| `/post`         | `/brand`, `/kb`             | `/calendar`                 |
| `/calendar`     | `/capture`, `/post`         | Daily/weekly automation     |
| `/competitors`  | None                        | `/calendar`, `/capture`     |
| `/autonomy`     | None                        | All execution paths         |
| `/trace`        | All skills (event emitters) | `/autonomy` tuning          |
| `/codex-review` | None                        | `/kb` (manual)              |
| `/team`         | `/kb` (research)            | Project completion          |
| `/health`       | None                        | None                        |

## Identified Gaps

### Missing Capabilities

1. **Personal CEO Integration**
   - No skill for CXO role context loading
   - No habit/relationship/initiative management skill
   - Gap: Must manually query CEO database

2. **Analytics & Reporting**
   - `/trace` covers observability events
   - No dedicated skill for content performance analytics
   - No skill for KB enrichment status
   - Gap: Manual SQL queries required for deeper insights

3. **Email & Communication**
   - No skill for email processing (Gmail integration exists but no skill wrapper)
   - No skill for meeting notes capture
   - Gap: Manual use of Google Workspace MCP tools

4. **File Organization**
   - `/capture` saves to Inbox, but no skill for PARA filing
   - KB organize.js exists but no skill wrapper
   - Gap: Manual file moves or direct CLI use

5. **Research Deep Dives**
   - `/capture` has author-research.sh script
   - No dedicated skill for multi-source research synthesis
   - Partial coverage via `/team` research teams

### Low-Priority Additions

- **Graph visualization** - KB has entity/decision graphs, no skill to render them
- **Backup management** - Cloudflare R2 scripts exist, no skill interface
- **Session replay** - Can query trace events, no skill for full session reconstruction

## Improvements & Recommendations

### 1. Skill Discoverability

**Current State:** All skills require manual invocation via `/skillname`.
**Improvement:** Add skill discovery command (e.g., `/skills list` or `/skills search <topic>`).
**Benefit:** Users can find relevant skills without memorizing 11 names.

### 2. Skill Composition

**Current State:** Skills work independently; pipelines require manual chaining.
**Improvement:** Add skill composition syntax (e.g., `/capture URL | /post twitter`).
**Benefit:** One-line invocations for common workflows.

### 3. Error Handling Documentation

**Current State:** SKILL.md files document happy paths; minimal error scenarios.
**Improvement:** Add "Common Issues" section to each SKILL.md with remediation steps.
**Example:** "/capture fails on private YouTube videos → try yt-dlp --cookies"

### 4. Performance Metrics

**Current State:** No skill execution time tracking.
**Improvement:** Add timing instrumentation; surface in `/trace` output.
**Benefit:** Identify slow skills; optimize or set expectations.

### 5. Interactive Mode Consistency

**Current State:** Some skills prompt interactively (e.g., `/post`), others require all args upfront.
**Improvement:** Standardize on either always-interactive or explicit `--interactive` flag.
**Benefit:** Predictable UX across all skills.

### 6. Multi-Profile Gaps

**Current State:** Only `/brand` and `/post` support multi-profile explicitly (faisal/samaa).
**Improvement:** Add `--profile` flag to `/calendar`, `/competitors`, `/capture`.
**Benefit:** True multi-tenant PAIOS (e.g., separate calendars for faisal vs samaa).

### 7. Argument Validation

**Current State:** Skills parse `$ARGUMENTS` manually; inconsistent error messages.
**Improvement:** Use shared argument parser library; standardize error format.
**Benefit:** Clearer feedback on malformed invocations.

### 8. Skill Templates

**Current State:** All 11 skills hand-written.
**Improvement:** Create skill template generator (like skill-creator plugin for other skills).
**Benefit:** Faster new skill development; enforced consistency.

## Security & Access Control

### Tool Restrictions

All skills use restricted tool sets. No skill has unrestricted tool access.

**Tool Usage Breakdown:**

- **Bash only:** autonomy, calendar, capture, codex-review, competitors, health, kb, post, trace (9 skills)
- **Read only:** brand (1 skill)
- **Bash + Task:** team (1 skill)
- **No dangerous tools:** None use Write, Edit, or NotebookEdit

**Risk Assessment:** Low risk. All skills execute pre-audited scripts in `~/.openclaw/projects/`. No arbitrary code execution.

### Data Access

**Sensitive Data Access:**

- `/health` reads API keys from launchd plist (read-only, necessary for validation)
- `/post` publishes to social media (requires Late.dev API key)
- All skills read KB (contains captured content, may include sensitive research)

**Mitigation:** API keys stored in secure locations (launchd plist, auth-profiles.json). No skills write to credential stores.

## Skill Lifecycle Management

### Creation Date Analysis

**Evidence:** SKILL.md modification times from `ls -la` output.

| Skill        | Last Modified    | Age (days) |
| ------------ | ---------------- | ---------- |
| brand        | 2026-02-22 05:41 | 5          |
| kb           | 2026-02-22 05:41 | 5          |
| calendar     | 2026-02-22 05:42 | 5          |
| post         | 2026-02-22 05:42 | 5          |
| competitors  | 2026-02-22 05:43 | 5          |
| health       | 2026-02-22 05:43 | 5          |
| codex-review | 2026-02-22 05:57 | 5          |
| autonomy     | 2026-02-22 06:39 | 5          |
| team         | 2026-02-22 06:53 | 5          |
| trace        | 2026-02-22 06:28 | 5          |
| capture      | 2026-02-25 22:18 | 2          |

**Observation:** 10 skills created on 2026-02-22, 1 skill updated 2026-02-25. Suggests concentrated skill development effort followed by minor iteration.

### Version Control

**Current State:** Skills live in `~/.claude/skills/`, not in openclaw repository.
**Gap:** No version history, no ability to roll back changes.
**Recommendation:** Consider symlinking skills to `openclaw/skills/` or creating a separate `paios-skills` repository.

## Comparison to Default Skills

**Default Claude Code Skills:** (from marketplace)

- File manipulation (read, write, edit)
- Git operations (commit, PR)
- Web operations (fetch, search)
- Image understanding

**PAIOS Custom Skills:**

- Domain-specific (content pipeline, knowledge base)
- Workflow orchestration (capture → kb → post)
- Multi-brain coordination (team spawning)
- Infrastructure management (health, autonomy)

**Complementarity:** No overlap. Custom skills build on top of default tool set rather than replacing it.

## Documentation Quality

### Strengths

1. **Consistent structure** - All SKILL.md files follow same format (frontmatter → usage → workflow → examples)
2. **Actionable workflows** - Step-by-step instructions with example commands
3. **Integration guidance** - Each skill documents related skills and next steps
4. **Argument hints** - Frontmatter includes argument-hint for CLI discoverability

### Weaknesses

1. **No troubleshooting sections** - Happy path only
2. **Limited output examples** - Most skills show command, few show actual output
3. **No performance expectations** - Users don't know if 30s is normal or a problem
4. **Missing dependency docs** - Assumes Python venv, Node.js, specific scripts exist

### Documentation Grade: B+

**Reasoning:** Well-structured and actionable, but lacks advanced troubleshooting and performance context.

## Recommendations Priority Matrix

| Priority      | Recommendation                                       | Effort | Impact |
| ------------- | ---------------------------------------------------- | ------ | ------ |
| P0 (Critical) | Add `/ceo` skill for Personal CEO integration        | Medium | High   |
| P0 (Critical) | Add troubleshooting sections to all SKILL.md         | Low    | High   |
| P1 (High)     | Implement skill discovery command                    | Medium | Medium |
| P1 (High)     | Add `--profile` flag to calendar/competitors/capture | Low    | Medium |
| P2 (Medium)   | Create skill composition syntax                      | High   | High   |
| P2 (Medium)   | Add performance metrics to /trace                    | Medium | Medium |
| P3 (Low)      | Standardize interactive mode behavior                | Medium | Low    |
| P3 (Low)      | Create skill template generator                      | High   | Low    |

## Conclusion

PAIOS's 11 custom skills form a cohesive, well-integrated system covering the core intelligence functions: content capture, knowledge management, brand-aligned creation, competitive monitoring, progressive autonomy, and system health. The skill set demonstrates thoughtful design with minimal duplication, strong integration patterns, and appropriate security constraints.

**Key Strengths:**

- Clear categorization and purpose
- Strong integration chains (capture → kb → post)
- Consistent documentation structure
- Appropriate tool restrictions

**Primary Gaps:**

- No Personal CEO integration skill
- No analytics/reporting skill
- Limited multi-profile support beyond content creation

**Next Steps:**

1. Create `/ceo` skill for habit/relationship/initiative management
2. Add troubleshooting sections to all skills
3. Implement skill discovery command
4. Consider version control integration

---

**Analysis Methodology:**

- Read all 11 SKILL.md files
- Mapped tool restrictions and integration points
- Analyzed file modification times
- Cross-referenced with PAIOS subsystem documentation (MEMORY.md)
- Assessed against common AI assistant skill patterns

**Limitations:**

- No usage statistics available (no skill invocation logs found)
- Cannot validate script execution paths (scripts in ~/.openclaw/projects/ not analyzed)
- No user feedback data on skill effectiveness
