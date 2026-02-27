# Claude Code Configuration Audit & Optimization - Design Document

**Created:** 2026-02-27
**Status:** Approved
**Approach:** Mirror Superpowers/GSD optimization structure (4-phase comprehensive)

## Goal

Systematically audit, document, and optimize Claude Code configuration to maximize effectiveness, maintainability, and discoverability. Transform configuration from "working but opaque" to "fully documented, optimized, and maintainable."

## Architecture Overview

### Scope

**Configuration Areas:**

- **Settings** (`~/.claude/settings.json`) - Model, permissions, auto-updates, thinking mode, status line
- **Hooks** (`~/.claude/hooks/`) - 11 hook scripts across 7 hook types (SessionStart, PostToolUse, Stop, SessionEnd, TeammateIdle, TaskCompleted, UserPromptSubmit)
- **Skills** (`~/.claude/skills/`) - 11 custom PAIOS skills (kb, capture, post, calendar, trace, health, brand, autonomy, team, competitors, codex-review)
- **MCP Servers** (`~/.claude/.mcp.json`) - 4 registered servers (knowledge-base, macos-system, observability, google-workspace)
- **Keybindings** (`~/.claude/keybindings.json`) - Currently none (using defaults, opportunity area)
- **Project Memory** (`~/.claude/projects/`) - Per-project context preservation

### Deliverables Organization

**Hybrid approach:**

- **Documentation & Audit Reports** → `docs/claude-config/` (in openclaw repo)
  - Easy to find alongside Superpowers/GSD docs
  - Version controlled
  - Shareable across projects

- **Operational Scripts** → `~/.claude/scripts/` (co-located with configuration)
  - Direct access to config files
  - No path resolution issues
  - Standard location for Claude tools

### Four-Phase Structure

**Phase 1: Audit** (7 tasks)

- Analyze current configuration across all areas
- Identify gaps, redundancies, optimization opportunities
- Create health scores and prioritized recommendations

**Phase 2: Documentation** (7 tasks)

- Reference guides for each configuration area
- Playbooks and best practices
- Quick reference materials
- Integration documentation

**Phase 3: Optimization** (6 tasks)

- Validation and testing scripts
- Backup/restore automation
- Configuration templates
- Performance monitoring

**Phase 4: Integration** (6 tasks)

- Maintenance procedures
- Update workflows
- Setup automation
- Integration with PAIOS health checks

**Total:** 26 tasks across 4 phases

## Current State Assessment

**From initial exploration:**

✅ **Strengths:**

- Well-configured permissions (safe tools auto-approved, dangerous patterns require confirmation)
- Comprehensive hooks system (7 hook types, 11 scripts)
- Complete PAIOS skills integration (11 skills)
- Working MCP mesh (4 servers operational)
- Modern settings (always thinking enabled, Sonnet 1M)

⚠️ **Opportunities:**

- No custom keybindings (missing productivity gains)
- Hook documentation sparse (know WHAT they do, not WHY)
- Skills organization ad-hoc (no categorization)
- Configuration not version-controlled or backed up
- No validation scripts (changes could break silently)
- Missing MCP servers (session-analytics, task-router from PAIOS)

## Phase 1: Audit (Detailed)

### Task 1: Settings Analysis

**Analyze:**

- `model`: Currently "sonnet[1m]" - Is this optimal? Should we document model selection rationale?
- `permissions.autoApprove`: 9 tool types + bash patterns - Are these correct? Too permissive/restrictive?
- `permissions.requireConfirmation`: 8 dangerous patterns - Missing any? Too aggressive?
- `autoUpdatesChannel`: "stable" - Correct choice or should use beta/dev?
- `alwaysThinkingEnabled`: true - Impact on performance? User preference?
- `statusLine`: Custom GSD status line - Is it providing value? Alternatives?

**Output:** Report with:

- Current settings inventory
- Rationale analysis (why each setting makes sense or doesn't)
- Optimization recommendations
- Security review of permissions
- Health score (e.g., 9/10)

### Task 2: Hooks Inventory & Health Check

**Analyze 11 hooks:**

1. `gsd-check-update.js` (SessionStart) - Check for GSD updates
2. `gsd-context-monitor.js` - Purpose unclear, investigate
3. `gsd-statusline.js` - Powers custom status line
4. `kb-auto-ingest.sh` (PostToolUse) - Auto-ingest completed work to KB
5. `kb-context-inject.sh` (SessionStart) - Inject relevant KB context
6. `prompt-journal.sh` (UserPromptSubmit) - Log user prompts
7. `quality-gate.sh` (Stop) - Reject incomplete responses
8. `session-learnings.sh` (SessionEnd) - Persist session insights
9. `session-register.sh` (SessionStart) - Register session for tracking
10. `task-completed.sh` (TaskCompleted) - Validation for team tasks
11. `teammate-idle.sh` (TeammateIdle) - Quality gates for teams

**Check:**

- Hook execution times (any slow hooks?)
- Error rates (check logs for failures)
- Hook dependencies (what breaks if one fails?)
- Redundancies (multiple hooks doing similar things?)
- Missing hooks (based on PAIOS patterns)

**Output:** Report with:

- Hook inventory and descriptions
- Performance metrics
- Health assessment
- Troubleshooting guide
- Recommendations for additions/removals

### Task 3: Skills Management Analysis

**Analyze 11 skills:**

- kb, capture, post, calendar, trace, health, brand, autonomy, team, competitors, codex-review

**Check:**

- Usage frequency (which skills are actually used?)
- Skill organization (should they be categorized?)
- Allowed-tools configuration (properly scoped?)
- Arguments validation (required vs. optional clear?)
- Integration patterns (how skills call each other)
- Missing skills (what capabilities are missing?)

**Output:** Report with:

- Skills inventory and categorization
- Usage pattern analysis
- Organization recommendations
- Missing capability gaps
- Integration opportunities

### Task 4: MCP Server Health & Capabilities

**Current servers:**

1. knowledge-base - KB queries and operations
2. macos-system - macOS integration (clipboard, notifications, calendar)
3. observability - Event tracing and analytics
4. google-workspace - Google APIs integration

**Check:**

- Connectivity (all servers reachable?)
- Tool availability (all expected tools present?)
- Missing servers (session-analytics, task-router mentioned in PAIOS docs)
- Integration health (skills → MCP → external systems)
- Version compatibility

**Output:** Report with:

- Server inventory and tool lists
- Connectivity health
- Missing server recommendations
- Integration map
- Setup instructions for missing servers

### Task 5: Keybindings Gap Analysis

**Current state:** No custom keybindings (using Claude Code defaults)

**Identify opportunities:**

- Essential keybindings every user should have
- PAIOS-specific shortcuts (e.g., quick /kb, /health)
- GSD workflow shortcuts
- Custom chord sequences
- Integration with skills

**Research:**

- Common Claude Code keybinding patterns
- VSCode-style familiarity
- Vim-mode compatibility (if relevant)

**Output:** Report with:

- Gap analysis (what's missing)
- Recommended essential keybindings (10-15 shortcuts)
- Advanced keybindings (for power users)
- Setup instructions
- Trade-offs and considerations

### Task 6: Permissions Review

**Current auto-approve:**

- Tools: Read, Glob, Grep, Edit, Write, NotebookEdit, WebFetch, WebSearch, Task, Team, MCP, Skill, Planning
- Bash: Safe read-only commands, git queries, package managers (no uninstall), sqlite SELECT

**Current require-confirmation:**

- Dangerous operations: rm -rf, git force ops, sudo, kill -9, destructive database ops, pipe to shell

**Check:**

- Are auto-approve patterns too broad? (e.g., all MCP tools)
- Missing confirmations? (e.g., network operations, file downloads)
- Bash pattern gaps (any dangerous commands not caught?)
- Balance: safety vs. friction

**Output:** Report with:

- Permissions audit
- Security analysis
- Friction vs. safety trade-offs
- Optimization recommendations
- Comparison with best practices

### Task 7: Configuration Health Summary

**Consolidate findings** from Tasks 1-6.

**Output:** Executive summary with:

- Overall health score (0-10)
- Health by category (Settings, Hooks, Skills, MCP, Keybindings, Permissions)
- Top 5 gaps identified
- Top 5 opportunities for improvement
- Prioritized roadmap for optimization

**Does this audit phase design look right?**

## Phase 2: Documentation (Detailed)

### Task 8: Configuration Reference Guide

Create comprehensive `docs/claude-config/CONFIG-REFERENCE.md` documenting every setting.

**Structure:**

- Settings.json field-by-field reference
- Model selection guide (when to use Sonnet vs. Opus)
- Permissions patterns explained
- Auto-updates channel comparison
- Status line configuration options
- Thinking mode trade-offs

**Format:**

- Each setting documented with: purpose, values, when to change, trade-offs
- Examples of common configurations
- Decision trees for choosing values

### Task 9: Hooks Playbook

Create `docs/claude-config/HOOKS-PLAYBOOK.md` as the definitive hooks reference.

**Content:**

- All 11 hooks documented (purpose, trigger, I/O, dependencies)
- Hook execution order and timing
- How to create new hooks (template, best practices)
- Common patterns (KB integration, event emission, validation)
- Troubleshooting guide (debugging hook failures)
- Performance optimization tips

**Format:**

- Reference table of all hooks
- Deep dive per hook
- Developer guide for custom hooks
- Troubleshooting decision tree

### Task 10: Skills Management Guide

Create `docs/claude-config/SKILLS-GUIDE.md` for skills lifecycle management.

**Content:**

- How to install/update/remove skills
- Skill discovery (marketplace, custom)
- Creating custom skills (YAML frontmatter, allowed-tools)
- Organization strategies (categories, naming)
- Integration with superpowers and GSD skills
- Testing and validation

**Format:**

- Quick start guide
- Detailed procedures
- Best practices
- Examples from PAIOS skills

### Task 11: MCP Server Reference

Create `docs/claude-config/MCP-SERVERS.md` documenting MCP integration.

**Content:**

- All 4 current servers (knowledge-base, macos-system, observability, google-workspace)
- Available tools per server
- Configuration and setup
- Common use cases and examples
- Integration with skills (which skills use which MCP tools)
- Adding new MCP servers
- Troubleshooting connectivity

**Format:**

- Server-by-server reference
- Quick tool finder
- Integration map
- Setup procedures

### Task 12: Keybindings Setup Guide

Create `docs/claude-config/KEYBINDINGS-GUIDE.md` for keybindings from scratch.

**Content:**

- Recommended essential keybindings (10-15 shortcuts)
- How to create keybindings.json
- Chord sequences explained
- Integration with skills (/kb, /health shortcuts)
- Common patterns (VSCode familiarity)
- Testing keybindings

**Format:**

- Quick setup (copy-paste essential keybindings)
- Detailed customization guide
- Recommended keybindings with rationale
- Advanced patterns

### Task 13: Best Practices Compendium

Create `docs/claude-config/BEST-PRACTICES.md` aggregating wisdom.

**Content:**

- Configuration maintenance schedule
- Security best practices (permissions, hooks, external integrations)
- Performance optimization (hook execution, MCP timeouts)
- Common pitfalls and how to avoid them
- When to restart Claude Code vs. reload config
- Configuration versioning strategies
- Multi-machine sync approaches

**Format:**

- Organized by topic
- Actionable recommendations
- "Do/Don't" patterns
- Troubleshooting references

### Task 14: Quick Reference Card

Create `docs/claude-config/QUICK-REFERENCE.md` as one-page cheatsheet.

**Content:**

- Essential file locations
- Quick health checks
- Common configuration tasks
- Troubleshooting first steps
- Key commands and shortcuts

**Format:**

- One page, printable
- Dense but scannable
- Cross-references to detailed docs

## Phase 3: Optimization (Detailed)

### Task 15: Configuration Validator

Create `~/.claude/scripts/validate-config.sh` for configuration health checks.

**Features:**

- Validate settings.json JSON syntax and schema
- Check required fields present
- Verify hooks exist and are executable
- Test MCP server registration syntax
- Validate skill YAML frontmatter
- Check keybindings.json if exists
- Report configuration health with exit codes

**Output:**

- ✅/❌ per validation check
- Detailed error messages
- Suggestions for fixing issues
- Exit code 0 = healthy, 1 = issues found

### Task 16: Configuration Backup & Restore

Create backup/restore tooling:

**`~/.claude/scripts/backup-config.sh`:**

- Backs up: settings.json, hooks/, skills/, .mcp.json, keybindings.json, projects/
- Creates timestamped snapshots: `~/.claude/backups/config-YYYY-MM-DD-HHMM/`
- Excludes: cache/, history.jsonl, stats-cache.json, agents/
- Generates manifest of what was backed up
- Compresses to .tar.gz for portability

**`~/.claude/scripts/restore-config.sh`:**

- Lists available backups
- Restores from snapshot with validation
- Supports selective restore (e.g., just hooks or just skills)
- Creates backup before restore (safety)
- Validates restored config before finalizing

### Task 17: Configuration Templates

Create `~/.claude/config-templates/` with reusable templates:

**Templates:**

1. `minimal-config.json` - Bare minimum Claude setup (no hooks, basic permissions)
2. `paios-config.json` - Current PAIOS-optimized setup (export current)
3. `hooks-starter-set/` - Essential hooks only (SessionStart KB context, PostToolUse ingest)
4. `keybindings-essential.json` - Must-have shortcuts (10-15 bindings)
5. `mcp-paios.json` - PAIOS MCP server set (all 4 servers)

**Documentation:**

- Each template documented with use case
- Installation instructions
- Customization guide
- Migration paths between templates

### Task 18: Hook Performance Monitor

Create `~/.claude/scripts/monitor-hooks.sh` for hook health tracking.

**Features:**

- Parse hook execution logs (where are these?)
- Measure execution time per hook
- Identify slow hooks (>1s warning, >5s critical)
- Report hook failures and error rates
- Suggest optimization opportunities
- Track hook execution frequency

**Output:**

- Performance table (hook name, avg time, p95, error rate)
- Slow hook alerts
- Optimization recommendations

### Task 19: MCP Health Check

Create `~/.claude/scripts/check-mcp-servers.sh` for MCP validation.

**Features:**

- Test connectivity to all registered servers
- Validate tool availability (expected vs. actual)
- Check for version mismatches
- Identify missing servers (session-analytics, task-router)
- Report integration health (skills → MCP)
- Suggest server additions based on PAIOS patterns

**Output:**

- ✅/❌ per MCP server
- Tool availability matrix
- Missing server recommendations
- Setup instructions for additions

### Task 20: Skills Organizer

Create `~/.claude/scripts/organize-skills.sh` for skills management.

**Features:**

- List all skills with descriptions
- Categorize skills (Knowledge, Content, System, Development, Strategic)
- Check for conflicts (duplicate names, tool overlaps)
- Validate YAML frontmatter
- Identify unused skills (never invoked)
- Suggest organization improvements

**Output:**

- Skills inventory table
- Category organization
- Conflict warnings
- Cleanup recommendations

## Phase 4: Integration & Maintenance (Detailed)

### Task 21: Configuration Maintenance Checklist

Create `docs/claude-config/MAINTENANCE-CHECKLIST.md` with schedules.

**Weekly:**

- Run hook health check (`monitor-hooks.sh`)
- Test MCP connectivity (`check-mcp-servers.sh`)
- Review skills usage (any forgotten?)

**Monthly:**

- Full backup (`backup-config.sh`)
- Settings review (any drift from best practices?)
- Skill cleanup (remove unused)
- Update check (Claude Code version, plugins)

**Quarterly:**

- Re-run full audit (Tasks 1-7)
- Update templates with learnings
- Review and update documentation
- Compare with Claude Code release notes

**After Claude Updates:**

- Compatibility verification (`validate-config.sh`)
- Test hooks still work
- Check MCP servers reconnect
- Verify skills load correctly

### Task 22: Configuration Update Procedures

Create `docs/claude-config/UPDATE-PROCEDURES.md` for safe changes.

**Procedures:**

- **Updating settings.json**: Backup first, validate after, rollback on error
- **Adding hooks**: Test hook standalone, register in settings, verify execution
- **Removing hooks**: Check dependencies, remove from settings, test impact
- **Installing skills**: Validate YAML, test invocation, document purpose
- **Adding MCP servers**: Register in .mcp.json, test connectivity, update permissions
- **Migrating config**: Export → transfer → import → validate

**Format:**

- Step-by-step procedures
- Commands to run
- Verification steps
- Rollback procedures

### Task 23: Configuration Documentation Index

Create `docs/claude-config/README.md` as master index.

**Content:**

- Navigation to all configuration docs
- Getting started guide
- Troubleshooting decision tree ("Problem X → Check doc Y")
- Quick links to common tasks
- Integration with main `docs/README.md`

**Structure:**

- Essential reading (top 3 docs)
- Reference documentation (by area)
- Audit reports (baseline health)
- Scripts and tools (operational)

### Task 24: GitHub Issue Template

Create `.github/ISSUE_TEMPLATE/claude-config-issue.md` for reporting problems.

**Template sections:**

- What were you trying to do?
- What went wrong?
- Configuration area affected (settings/hooks/skills/MCP/keybindings)
- Diagnostic info gathering checklist
- Common solutions reference

**Purpose:**

- Standardize configuration issue reporting
- Guide users to provide necessary info
- Link to troubleshooting docs

### Task 25: Integration with PAIOS Health Check

**Option A:** Update existing `~/.openclaw/projects/paios-health/health.sh`
**Option B:** Create new `~/.claude/scripts/claude-health-check.sh`

**Features:**

- Run validate-config.sh
- Check hook health
- Test MCP connectivity
- Validate skills load
- Report comprehensive status
- Integrate with `/health` and `/paios-health` skills

**Output:**

- Claude Config: ✅/❌
- Detailed breakdown (settings, hooks, skills, MCP)
- Quick fixes for common issues

### Task 26: Setup Automation Script

Create `~/.claude/scripts/setup-fresh-install.sh` for new machines.

**Features:**

- Interactive prompts for configuration choices
- Installs PAIOS skills from templates
- Sets up hooks with user preferences
- Configures MCP servers
- Creates keybindings from template
- Configures settings.json
- Validates installation when complete

**Use cases:**

- New machine setup
- Clean reinstall
- Sharing configuration with others
- Disaster recovery

**Output:**

- Fully configured Claude Code installation
- Validation report
- Customization instructions

## Success Criteria

**After Phase 1 (Audit):**

- ✅ Complete understanding of current configuration (7 audit reports)
- ✅ Health score established (baseline for improvement)
- ✅ Prioritized list of optimization opportunities

**After Phase 2 (Documentation):**

- ✅ Every configuration area has reference documentation
- ✅ Quick reference card exists and is usable
- ✅ Can answer "how do I...?" for any config task

**After Phase 3 (Optimization):**

- ✅ All operational scripts working (`validate`, `backup`, `restore`, `monitor`, `check-mcp`, `organize-skills`)
- ✅ Configuration templates available and documented
- ✅ Can validate config health in <5 seconds

**After Phase 4 (Integration):**

- ✅ Maintenance schedule defined and documented
- ✅ Update procedures clear and tested
- ✅ Setup automation working for fresh installs
- ✅ Integration with PAIOS health checks

**Overall:**

- ✅ Configuration fully documented and understood
- ✅ Operational tools reduce maintenance friction
- ✅ Templates enable easy replication/sharing
- ✅ Maintenance procedures prevent configuration drift

## Estimated Effort

**Phase 1 (Audit):** 1.5-2 hours (7 analysis tasks)
**Phase 2 (Documentation):** 2-2.5 hours (7 documentation tasks)
**Phase 3 (Optimization):** 1.5-2 hours (6 script tasks)
**Phase 4 (Integration):** 1-1.5 hours (6 integration tasks)

**Total:** 6-8 hours for complete implementation

**Note:** Similar scope to Superpowers/GSD optimization, which took ~2 hours with fast execution. Expect similar efficiency.

## Tech Stack

- **Audit:** Bash scripts, jq for JSON parsing, analysis scripts
- **Documentation:** Markdown with consistent structure
- **Optimization:** Shell scripts (bash), JSON templates, validation scripts
- **Integration:** GitHub templates, git hooks, automation scripts

## Integration Points

**With existing work:**

- Builds on Superpowers/GSD optimization patterns
- Integrates with PAIOS health check system
- Complements docs/README.md structure
- Uses same script patterns (validate-_, setup-_, etc.)

**With Claude ecosystem:**

- Hooks integrate with skills
- Skills invoke MCP servers
- MCP servers surface PAIOS capabilities
- Keybindings trigger skills
- Permissions gate dangerous operations

## Risk Mitigation

**Backup before changes:**

- Always backup current config before modifications
- Validation before committing changes
- Rollback procedures documented

**Testing:**

- Test scripts in isolation before integration
- Validate config after every change
- Verify hooks/skills still work after updates

**Documentation:**

- Document why each configuration choice was made
- Capture trade-offs and alternatives considered
- Update docs when configuration changes

---

**Design Complete:** 2026-02-27
**Next Step:** Create implementation plan with task breakdown
