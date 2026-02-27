# Superpowers, GSD & Skills Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform workflow tools from "aware but underutilizing" to "integrated daily practice" through comprehensive audit, documentation, optimization, and habit-building systems.

**Architecture:** Four-phase approach: (1) Audit current state to identify gaps, (2) Document everything for discoverability, (3) Optimize configuration and reduce friction, (4) Integrate tools with habit-building systems.

**Tech Stack:** Markdown documentation, shell scripts for analysis, JSON/YAML configuration files, git hooks for automation.

---

## Phase 1: Audit

### Task 1: GSD Configuration Analysis

**Files:**

- Read: `.planning/config.json`
- Create: `docs/audit/gsd-config-report.md`

**Step 1: Analyze current GSD configuration**

Read the configuration file:

```bash
cat .planning/config.json
```

Expected output:

```json
{
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "quality",
  "workflow": {
    "research": true,
    "plan_checker": true,
    "verifier": true,
    "auto_advance": true
  }
}
```

**Step 2: Create configuration analysis report**

Create report documenting:

- Current settings vs. recommended for PAIOS work
- Rationale for each setting
- Optimization recommendations

**Step 3: Commit**

```bash
git add docs/audit/gsd-config-report.md
git commit -m "docs: add GSD configuration analysis report"
```

---

### Task 2: Superpowers Skills Inventory

**Files:**

- Create: `docs/audit/superpowers-inventory.md`

**Step 1: List all available superpowers skills**

Extract from system reminder or skill directory:

- using-superpowers
- brainstorming
- writing-plans
- executing-plans
- systematic-debugging
- test-driven-development
- verification-before-completion
- dispatching-parallel-agents
- finishing-a-development-branch
- requesting-code-review
- receiving-code-review
- writing-skills
- subagent-driven-development
- using-git-worktrees

**Step 2: Document skill interdependencies**

Create dependency map:

```
brainstorming → writing-plans → executing-plans
systematic-debugging → test-driven-development
requesting-code-review ← verification-before-completion
```

**Step 3: Identify underutilized skills**

For each skill, note:

- Purpose
- When to use
- Current usage estimate (never/rarely/sometimes/often)
- Why underutilized (if applicable)

**Step 4: Commit**

```bash
git add docs/audit/superpowers-inventory.md
git commit -m "docs: add superpowers skills inventory and analysis"
```

---

### Task 3: PAIOS Skills and Integration Audit

**Files:**

- Create: `docs/audit/paios-skills-report.md`

**Step 1: List all PAIOS custom skills**

From system reminder:

- keybindings-help
- capture
- post
- calendar
- trace
- kb
- health
- brand
- autonomy
- team
- competitors
- create-mcp
- create-skill
- paios-health
- mirrors
- deploy
- codex-review

**Step 2: Validate MCP server health**

Run health check:

```bash
~/.openclaw/bin/ai status
```

Check for:

- All MCP servers running
- No connection errors
- API keys valid

**Step 3: Review hook configuration**

Check Claude Code hooks:

```bash
cat ~/.claude/settings.json | grep -A 20 hooks
```

Verify hooks are configured:

- SessionStart
- PostToolUse
- Stop
- SessionEnd
- TeammateIdle (if using agent teams)
- TaskCompleted (if using agent teams)

**Step 4: Document integration points**

Map how skills integrate:

- Hooks → Skills (e.g., SessionStart triggers /kb context injection)
- Skills → MCP servers (e.g., /kb uses knowledge-base MCP)
- Skills → External systems (e.g., /post uses social-history.sqlite)

**Step 5: Commit**

```bash
git add docs/audit/paios-skills-report.md
git commit -m "docs: add PAIOS skills and integration audit"
```

---

### Task 4: Workflow Gaps Analysis

**Files:**

- Create: `docs/audit/workflow-gaps.md`

**Step 1: Identify manual tasks that should use skills**

Review recent git history for patterns:

```bash
git log --oneline -50 --format="%s"
```

Look for commits that indicate:

- Feature work without brainstorming
- Bug fixes without systematic-debugging
- Code changes without TDD
- Commits without verification

**Step 2: Document friction points**

Common friction points:

- Forgetting to use skills
- Not knowing which skill to use
- Skills requiring too much setup
- No clear "entry point" to workflows

**Step 3: Create friction analysis**

For each friction point:

- Description
- Frequency (daily/weekly/monthly)
- Impact (high/medium/low)
- Potential solution

**Step 4: Commit**

```bash
git add docs/audit/workflow-gaps.md
git commit -m "docs: add workflow gaps and friction analysis"
```

---

### Task 5: Audit Summary Report

**Files:**

- Create: `docs/audit/AUDIT-SUMMARY.md`

**Step 1: Consolidate findings**

Combine insights from:

- GSD configuration report
- Superpowers inventory
- PAIOS skills report
- Workflow gaps analysis

**Step 2: Create executive summary**

Include:

- Overall health score (configuration, skills, integration)
- Top 5 gaps identified
- Top 5 opportunities for improvement
- Recommended priority order

**Step 3: Commit**

```bash
git add docs/audit/AUDIT-SUMMARY.md
git commit -m "docs: add audit summary report with findings"
```

---

## Phase 2: Documentation

### Task 6: Skills Playbook - Core Structure

**Files:**

- Create: `docs/SKILLS-PLAYBOOK.md`

**Step 1: Create playbook header**

```markdown
# Skills Playbook

**Purpose:** Intent-based decision tree for knowing which skill/tool to use for any task.

**How to use:** Find your intent ("I want to...") and follow the workflow.

---
```

**Step 2: Add navigation table of contents**

```markdown
## Quick Navigation

- [Building Features](#building-features)
- [Fixing Bugs](#fixing-bugs)
- [Planning Projects](#planning-projects)
- [Managing Knowledge](#managing-knowledge)
- [Creating Content](#creating-content)
- [System Tasks](#system-tasks)
- [Code Review](#code-review)
- [Team Collaboration](#team-collaboration)
```

**Step 3: Commit**

```bash
git add docs/SKILLS-PLAYBOOK.md
git commit -m "docs: create skills playbook structure"
```

---

### Task 7: Skills Playbook - Building Features Section

**Files:**

- Modify: `docs/SKILLS-PLAYBOOK.md`

**Step 1: Add "Building Features" section**

```markdown
## Building Features

**Intent:** "I want to build something new"

### Workflow

1. **Start with brainstorming**
   - Invoke: Directly (skill is loaded at session start)
   - Purpose: Explore requirements, design approaches, get approval
   - Output: Design document in `docs/plans/YYYY-MM-DD-<topic>-design.md`

2. **Create implementation plan**
   - Invoke: `@superpowers:writing-plans` (called automatically after brainstorming)
   - Purpose: Break design into bite-sized executable tasks
   - Output: Implementation plan in `docs/plans/YYYY-MM-DD-<feature>.md`

3. **Execute the plan**
   - Option A: `@superpowers:subagent-driven-development` (same session, task-by-task review)
   - Option B: `@superpowers:executing-plans` (separate session, batch execution)
   - Purpose: Implement plan with TDD and frequent commits

4. **Verify completion**
   - Invoke: `@superpowers:verification-before-completion`
   - Purpose: Run tests, verify implementation matches plan
   - Required: Before claiming work is done

5. **Request code review**
   - Invoke: `@superpowers:requesting-code-review`
   - Purpose: Get feedback before merging
   - Output: Review request with context

### When to Skip Steps

- **Small changes** (< 10 lines, obvious): Skip brainstorming, still use TDD
- **Urgent hotfixes**: Skip brainstorming, jump to systematic-debugging
- **Pure refactoring**: Skip brainstorming, create simple plan

### Common Mistakes

- ❌ Starting to code without brainstorming
- ❌ Skipping verification before claiming "done"
- ❌ Forgetting TDD during execution
- ❌ Not committing frequently enough
```

**Step 2: Commit**

```bash
git add docs/SKILLS-PLAYBOOK.md
git commit -m "docs: add building features workflow to playbook"
```

---

### Task 8: Skills Playbook - Fixing Bugs Section

**Files:**

- Modify: `docs/SKILLS-PLAYBOOK.md`

**Step 1: Add "Fixing Bugs" section**

```markdown
## Fixing Bugs

**Intent:** "I encountered a bug" or "tests are failing"

### Workflow

1. **Use systematic-debugging**
   - Invoke: `@superpowers:systematic-debugging`
   - Purpose: Structured investigation using scientific method
   - Required: Before proposing fixes

2. **Apply TDD**
   - Invoke: `@superpowers:test-driven-development`
   - Purpose: Write failing test → minimal fix → verify
   - Required: For all bug fixes

3. **Verify the fix**
   - Invoke: `@superpowers:verification-before-completion`
   - Purpose: Ensure bug is actually fixed, no regressions
   - Required: Before closing issue

### When It's Not Just a Bug

If investigation reveals:

- Architecture issue → Use brainstorming to redesign
- Missing feature → Switch to building features workflow
- Configuration problem → Check documentation, update if needed

### Common Mistakes

- ❌ Guessing at the cause without investigation
- ❌ Fixing symptoms instead of root cause
- ❌ Not adding regression tests
- ❌ Claiming "fixed" without verification
```

**Step 2: Commit**

```bash
git add docs/SKILLS-PLAYBOOK.md
git commit -m "docs: add fixing bugs workflow to playbook"
```

---

### Task 9: Skills Playbook - Remaining Sections

**Files:**

- Modify: `docs/SKILLS-PLAYBOOK.md`

**Step 1: Add Planning Projects section**

```markdown
## Planning Projects

**Intent:** "I need to plan a multi-phase project"

### GSD Workflow

1. **Start new project**: `/gsd:new-project`
2. **Define requirements**: Answer questions → `PROJECT.md` and `REQUIREMENTS.md`
3. **Create roadmap**: Review generated `ROADMAP.md`
4. **Plan each phase**: `/gsd:plan-phase <N>`
5. **Execute phases**: `/gsd:execute-phase <N>`
6. **Verify work**: `/gsd:verify-work`
7. **Complete milestone**: `/gsd:complete-milestone`

### When to Use GSD vs. Superpowers

- **GSD**: Multi-phase projects (> 3 phases), needs research/planning agents
- **Superpowers**: Single features, bug fixes, one-off tasks
```

**Step 2: Add Managing Knowledge section**

```markdown
## Managing Knowledge

**Intent:** "I want to query/store knowledge"

### Skills

- **Query KB**: `/kb <natural language query>`
- **Capture content**: `/capture <URL>` (analyzes and stores)
- **Check system health**: `/health` (validates all systems)
- **View traces**: `/trace` (query observability events)

### Common Patterns

- Before starting work → `/kb` to check existing knowledge
- After completing work → Knowledge automatically stored via hooks
- Found useful content → `/capture` to analyze and store
```

**Step 3: Add Creating Content section**

```markdown
## Creating Content

**Intent:** "I want to create social content"

### Workflow

1. **Load brand context**: `/brand`
2. **Create post**: `/post <topic>`
3. **Or schedule**: `/calendar` to manage content calendar
4. **Check competitors**: `/competitors` for competitive analysis

### When to Use

- Social media posts
- Blog content
- Brand-aligned communication
```

**Step 4: Add remaining sections (System Tasks, Code Review, Team Collaboration)**

**Step 5: Commit**

```bash
git add docs/SKILLS-PLAYBOOK.md
git commit -m "docs: complete skills playbook with all workflows"
```

---

### Task 10: GSD Quick Reference

**Files:**

- Create: `docs/GSD-GUIDE.md`

**Step 1: Create GSD guide structure**

```markdown
# GSD Quick Reference

**Purpose:** Fast reference for GSD (Get Shit Done) commands and workflows.

## Command Index

- [Project Lifecycle](#project-lifecycle)
- [Phase Management](#phase-management)
- [Execution](#execution)
- [Common Commands](#common-commands)
- [Agent Selection](#agent-selection)

---
```

**Step 2: Add command reference with examples**

Document all 30+ GSD commands with:

- Command syntax
- When to use
- Real example from PAIOS project
- Common gotchas

**Step 3: Add agent selection guide**

```markdown
## Agent Selection

### Research Agents

- **gsd-phase-researcher**: Research how to implement a phase
- **gsd-project-researcher**: Research domain before roadmap creation
- **research-deep**: Deep technical analysis
- **research-web**: Web research for current info

### Build Agents

- **build-lead**: Coordinates frontend/backend/tests
- **build-frontend**: UI components, client logic
- **build-backend**: APIs, server logic, database
- **build-tests**: Unit/integration tests

### Review Agents

- **review-architecture**: Design patterns, scalability
- **review-quality**: Security, bugs, test coverage
```

**Step 4: Commit**

```bash
git add docs/GSD-GUIDE.md
git commit -m "docs: create GSD quick reference guide"
```

---

### Task 11: Configuration Reference

**Files:**

- Create: `docs/CONFIG-REFERENCE.md`

**Step 1: Document GSD configuration**

````markdown
# Configuration Reference

## GSD Settings (`.planning/config.json`)

### Model Profile

```json
"model_profile": "quality"  // or "balanced" or "budget"
```
````

- **quality**: Uses Opus for planning/research (recommended for architecture-heavy work)
- **balanced**: Mixed Sonnet/Opus (faster, good for most projects)
- **budget**: Mostly Haiku (fastest, ok for simple tasks)

**When to change:**

- Architecture-heavy → quality
- Time-sensitive → balanced
- Simple/repetitive → budget

### Workflow Toggles

```json
"workflow": {
  "research": true,        // Research before planning
  "plan_checker": true,    // Verify plans before execution
  "verifier": true,        // Verify work after execution
  "auto_advance": true     // Auto-advance to next phase
}
```

**Recommendations:**

- Keep all true for quality
- Disable auto_advance if you want manual control between phases
- Only disable others if you have strong reason (faster iteration at quality cost)

````

**Step 2: Document skill configuration format**

```markdown
## Skill Configuration (YAML Frontmatter)

### Format

```yaml
---
name: skill-name
description: Brief description shown in listings
allowed-tools:
  - ToolName1
  - ToolName2
arguments:
  - name: arg_name
    description: What this argument does
    required: true|false
---
````

### Example (from /kb skill)

```yaml
---
name: kb
description: Query the knowledge base using natural language
allowed-tools:
  - mcp__knowledge-base__kb_query
  - mcp__knowledge-base__kb_smart_query
arguments:
  - name: query
    description: Natural language search query
    required: true
---
```

````

**Step 3: Document hook configuration**

**Step 4: Commit**

```bash
git add docs/CONFIG-REFERENCE.md
git commit -m "docs: create configuration reference"
````

---

### Task 12: Integration Map

**Files:**

- Create: `docs/INTEGRATION-MAP.md`

**Step 1: Create visual integration diagram**

```markdown
# Integration Map

## System Architecture
```

┌─────────────────────────────────────────────────────────────┐
│ Claude Code Session │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ Superpowers │ │ GSD │ │ PAIOS Skills │ │
│ │ Skills │ │ Agents │ │ (custom) │ │
│ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ │
│ │ │ │ │
│ └──────────────────┴──────────────────┘ │
│ │ │
└────────────────────────────┼─────────────────────────────────┘
│
┌────────▼────────┐
│ Hooks System │
│ (SessionStart, │
│ PostToolUse, │
│ Stop, etc.) │
└────────┬────────┘
│
┌────────────────────┼────────────────────┐
│ │ │
┌────▼────┐ ┌──────▼──────┐ ┌─────▼─────┐
│ MCP │ │ External │ │ Shell │
│ Servers │ │ Systems │ │ Scripts │
│ │ │ (KB, Obs, │ │ │
│ - KB │ │ Social) │ └───────────┘
│ - macOS │ │ │
│ - Obs │ └─────────────┘
└─────────┘

```

## Integration Points

### Superpowers → GSD
- brainstorming creates design docs → GSD planning consumes
- GSD execution uses TDD/verification skills from superpowers

### GSD → PAIOS Skills
- execute-phase can call /kb, /capture, /post during implementation
- verify-work can use /trace for observability validation

### Hooks → Skills
- SessionStart: Triggers /kb context injection
- PostToolUse: Auto-ingests completed work to KB
- Stop: Quality gate before closing
- SessionEnd: Stores session learnings

### Skills → MCP Servers
- /kb → knowledge-base MCP server
- /trace → observability MCP server
- /health → multiple MCP servers for validation
```

**Step 2: Document common integration patterns**

**Step 3: Commit**

```bash
git add docs/INTEGRATION-MAP.md
git commit -m "docs: create system integration map"
```

---

## Phase 3: Optimization

### Task 13: Create Configuration Validator

**Files:**

- Create: `scripts/validate-config.sh`

**Step 1: Write validation script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== GSD Configuration Validator ==="

# Check .planning/config.json exists
if [[ ! -f .planning/config.json ]]; then
    echo "❌ .planning/config.json not found"
    exit 1
fi

# Validate JSON syntax
if ! jq empty .planning/config.json 2>/dev/null; then
    echo "❌ Invalid JSON in .planning/config.json"
    exit 1
fi

# Check required fields
REQUIRED_FIELDS=(
    ".parallelization"
    ".commit_docs"
    ".model_profile"
    ".workflow.research"
    ".workflow.plan_checker"
    ".workflow.verifier"
    ".workflow.auto_advance"
)

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! jq -e "$field" .planning/config.json >/dev/null 2>&1; then
        echo "❌ Missing required field: $field"
        exit 1
    fi
done

echo "✅ Configuration valid"

# Show current settings
echo ""
echo "Current configuration:"
jq . .planning/config.json
```

**Step 2: Make executable**

```bash
chmod +x scripts/validate-config.sh
```

**Step 3: Test validation**

```bash
./scripts/validate-config.sh
```

Expected: ✅ Configuration valid

**Step 4: Commit**

```bash
git add scripts/validate-config.sh
git commit -m "feat: add GSD configuration validator script"
```

---

### Task 14: Create Shell Aliases

**Files:**

- Create: `scripts/setup-aliases.sh`
- Modify: `~/.zshrc` (or `~/.bashrc`)

**Step 1: Create aliases setup script**

```bash
#!/usr/bin/env bash

cat << 'EOF'
# Superpowers & GSD Aliases

# Quick skill access (use in Claude Code sessions)
alias skills='cat ~/Documents/SKILLS-PLAYBOOK.md'
alias gsd-help='cat ~/Documents/GSD-GUIDE.md'

# GSD shortcuts
alias gsd:progress='/gsd:progress'
alias gsd:plan='/gsd:plan-phase'
alias gsd:exec='/gsd:execute-phase'
alias gsd:verify='/gsd:verify-work'

# PAIOS skills (when in CLI)
alias kb='ai kb'
alias capture='ai capture'
alias health='ai health'

# Config validation
alias validate-gsd='./scripts/validate-config.sh'

# Documentation shortcuts
alias docs='cd docs && ls -la'
alias audit='cd docs/audit && ls -la'
alias plans='cd docs/plans && ls -la'

EOF
```

**Step 2: Add to shell config**

```bash
# Append to ~/.zshrc
cat << 'EOF' >> ~/.zshrc

# Load Superpowers/GSD aliases
if [[ -f ~/Desktop/projects/openclaw/scripts/setup-aliases.sh ]]; then
    source ~/Desktop/projects/openclaw/scripts/setup-aliases.sh
fi
EOF
```

**Step 3: Reload shell**

```bash
source ~/.zshrc
```

**Step 4: Test aliases**

```bash
validate-gsd
```

Expected: Configuration validation output

**Step 5: Commit**

```bash
git add scripts/setup-aliases.sh
git commit -m "feat: add shell aliases for quick access to tools"
```

---

### Task 15: Create Quick Reference Cheatsheet

**Files:**

- Create: `docs/QUICK-REFERENCE.md`

**Step 1: Create one-page cheatsheet**

```markdown
# Quick Reference Cheatsheet

## 🎯 Before You Start ANY Task

**Ask yourself:** "Should I be using a skill for this?"

- Building → `brainstorming`
- Bug → `systematic-debugging`
- Project → `/gsd:new-project`
- Query → `/kb`
- Content → `/brand` → `/post`

## 🚀 Common Workflows

### Feature Development
```

brainstorming → writing-plans → executing-plans → verification

```

### Bug Fix
```

systematic-debugging → TDD → verification

```

### Multi-Phase Project
```

/gsd:new-project → /gsd:plan-phase → /gsd:execute-phase → /gsd:verify-work

```

## 📚 Essential Skills

| Skill | When | Invoke |
|-------|------|--------|
| brainstorming | Before building anything | Auto at session start |
| systematic-debugging | Hit a bug | `@superpowers:systematic-debugging` |
| verification | Before claiming done | `@superpowers:verification-before-completion` |
| /kb | Query knowledge | `/kb <query>` |
| /health | Check systems | `/health` |

## ⚙️ GSD Commands

| Command | Purpose |
|---------|---------|
| `/gsd:progress` | Check project status |
| `/gsd:plan-phase N` | Plan phase N |
| `/gsd:execute-phase N` | Execute phase N |
| `/gsd:verify-work` | Verify implementation |

## 🔧 Quick Checks

- Config valid? → `validate-gsd`
- Skills list? → `skills`
- System health? → `/health`
- View docs? → `docs`, `audit`, `plans`

## 🎬 Remember

1. **Skills first, code second**
2. **TDD always** (write test → fail → implement → pass)
3. **Verify before "done"**
4. **Commit frequently**
5. **When in doubt, ask** (don't rationalize skipping workflows)
```

**Step 2: Commit**

```bash
git add docs/QUICK-REFERENCE.md
git commit -m "docs: create one-page quick reference cheatsheet"
```

---

## Phase 4: Integration & Habit Formation

### Task 16: Create Session Startup Reminder

**Files:**

- Create: `scripts/session-reminder.sh`
- Modify: Claude Code settings (optional hook)

**Step 1: Create reminder script**

```bash
#!/usr/bin/env bash

cat << 'EOF'
╔════════════════════════════════════════════════════════════╗
║              🎯 Skills & Workflows Reminder                ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Before you start:                                         ║
║  • Building? → Use brainstorming first                     ║
║  • Bug? → Use systematic-debugging                         ║
║  • Project? → Use /gsd:new-project                         ║
║                                                            ║
║  Quick access:                                             ║
║  • `skills` - View playbook                                ║
║  • `validate-gsd` - Check config                           ║
║  • `/health` - System status                               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
EOF
```

**Step 2: Make executable**

```bash
chmod +x scripts/session-reminder.sh
```

**Step 3: Add to shell startup**

```bash
# Add to ~/.zshrc
echo './scripts/session-reminder.sh' >> ~/.zshrc
```

**Step 4: Test**

```bash
./scripts/session-reminder.sh
```

Expected: Display reminder box

**Step 5: Commit**

```bash
git add scripts/session-reminder.sh
git commit -m "feat: add session startup reminder for skills"
```

---

### Task 17: Create Weekly Review Template

**Files:**

- Create: `docs/templates/WEEKLY-REVIEW.md`

**Step 1: Create review template**

```markdown
# Weekly Review - [Date]

## Skills Usage

### This Week

| Skill                | Used? | Times | Notes |
| -------------------- | ----- | ----- | ----- |
| brainstorming        | ☐     | 0     |       |
| systematic-debugging | ☐     | 0     |       |
| TDD                  | ☐     | 0     |       |
| verification         | ☐     | 0     |       |
| /kb                  | ☐     | 0     |       |
| /capture             | ☐     | 0     |       |
| /post                | ☐     | 0     |       |
| GSD commands         | ☐     | 0     |       |

### Missed Opportunities

Tasks where I should have used a skill but didn't:

1. [Task description] → Should have used [skill]
2. [Task description] → Should have used [skill]

## Friction Points

What made it hard to use skills this week?

1. [Friction description]
2. [Friction description]

## Improvements

What worked well? What should I change?

- ✅ [What worked]
- 🔧 [What to improve]

## Next Week Goals

Focus skills for next week:

1. [Skill to practice]
2. [Skill to practice]
3. [Skill to practice]

## Playbook Updates

Any learnings to add to playbook?

- [ ] [Update needed]
- [ ] [Update needed]
```

**Step 2: Create script to generate weekly review**

Create `scripts/start-weekly-review.sh`:

```bash
#!/usr/bin/env bash

WEEK_DATE=$(date +%Y-%m-%d)
TEMPLATE="docs/templates/WEEKLY-REVIEW.md"
OUTPUT="docs/reviews/weekly-review-$WEEK_DATE.md"

mkdir -p docs/reviews
cp "$TEMPLATE" "$OUTPUT"

echo "Weekly review created: $OUTPUT"
echo "Fill it out and commit when done!"
```

**Step 3: Make executable and test**

```bash
chmod +x scripts/start-weekly-review.sh
./scripts/start-weekly-review.sh
```

**Step 4: Commit**

```bash
git add docs/templates/WEEKLY-REVIEW.md scripts/start-weekly-review.sh
git commit -m "feat: add weekly review template and generator"
```

---

### Task 18: Create Progressive Rollout Plan

**Files:**

- Create: `docs/PROGRESSIVE-ROLLOUT.md`

**Step 1: Document rollout schedule**

```markdown
# Progressive Skills Rollout

## Purpose

Build habits gradually rather than trying to use everything at once.

## Week 1-2: Core Skills

**Focus:** Essential workflow skills

### Skills to Practice

1. **brainstorming** - Use before starting ANY feature work
2. **/kb** - Query knowledge before and after tasks
3. **systematic-debugging** - Use for ANY bug encountered

### Daily Checklist

- [ ] Starting feature work? → Used brainstorming first?
- [ ] Hit a bug? → Used systematic-debugging?
- [ ] Checked /kb for relevant knowledge?

### Success Metric

Used each skill at least 3 times this week.

---

## Week 3-4: GSD Basics

**Focus:** Structured project planning

### Skills to Add

4. **GSD planning** - `/gsd:new-project`, `/gsd:plan-phase`
5. **GSD execution** - `/gsd:execute-phase`
6. **verification-before-completion** - Never skip this!

### Daily Checklist

- [ ] Multi-phase work? → Using GSD?
- [ ] Claiming "done"? → Ran verification first?

### Success Metric

- Core skills from Week 1-2 becoming automatic
- Started at least one GSD project

---

## Week 5-6: PAIOS Skills

**Focus:** Domain-specific capabilities

### Skills to Add

7. **/capture** - Save useful content to KB
8. **/post** - Create social content
9. **/trace** - Query system events
10. **/health** - Regular system checks

### Daily Checklist

- [ ] Found useful content? → Used /capture?
- [ ] Need to create content? → Used /brand + /post?
- [ ] Ran /health check at least once this week?

### Success Metric

- All previous skills now habitual
- Actively using PAIOS skills

---

## Week 7+: Full Integration

**Focus:** All tools working together seamlessly

### Skills to Master

- All superpowers skills
- Full GSD workflow
- All PAIOS capabilities
- Cross-system workflows

### Monthly Review

- Skills usage frequency trending up?
- Time saved per task increasing?
- Quality improvements visible?
- Playbook staying up-to-date?

---

## Tips for Success

1. **Don't skip ahead** - Master each week before moving on
2. **Use the checklist** - Make it visible during work
3. **Review weekly** - Use weekly review template
4. **Update playbook** - Add learnings as you go
5. **Be patient** - Habits take time to form
```

**Step 2: Commit**

```bash
git add docs/PROGRESSIVE-ROLLOUT.md
git commit -m "docs: create progressive skills rollout plan"
```

---

### Task 19: Create Habit-Building Checklist Script

**Files:**

- Create: `scripts/daily-checklist.sh`

**Step 1: Create interactive checklist**

```bash
#!/usr/bin/env bash

# Determine which week we're in based on a start date
START_DATE="2026-02-27"  # Adjust to actual start date
CURRENT_DATE=$(date +%s)
START_TIMESTAMP=$(date -j -f "%Y-%m-%d" "$START_DATE" +%s)
DAYS_SINCE_START=$(( ($CURRENT_DATE - $START_TIMESTAMP) / 86400 ))
WEEK=$(( ($DAYS_SINCE_START / 7) + 1 ))

echo "════════════════════════════════════════"
echo "   Daily Skills Checklist - Week $WEEK"
echo "════════════════════════════════════════"
echo ""

if [[ $WEEK -le 2 ]]; then
    echo "🎯 Focus: Core Skills"
    echo ""
    echo "[ ] Starting feature work? Used brainstorming?"
    echo "[ ] Hit a bug? Used systematic-debugging?"
    echo "[ ] Checked /kb for relevant knowledge?"
elif [[ $WEEK -le 4 ]]; then
    echo "🎯 Focus: GSD Basics + Core Skills"
    echo ""
    echo "[ ] Multi-phase work? Using GSD?"
    echo "[ ] Claiming 'done'? Ran verification?"
    echo "[ ] Still using core skills from Week 1-2?"
elif [[ $WEEK -le 6 ]]; then
    echo "🎯 Focus: PAIOS Skills + Previous"
    echo ""
    echo "[ ] Found useful content? Used /capture?"
    echo "[ ] Creating content? Used /brand + /post?"
    echo "[ ] Ran /health check this week?"
else
    echo "🎯 Focus: Full Integration"
    echo ""
    echo "[ ] All skills becoming automatic?"
    echo "[ ] Cross-system workflows smooth?"
    echo "[ ] Time saved increasing?"
fi

echo ""
echo "Quick access: \`skills\`, \`gsd-help\`, \`validate-gsd\`"
echo "════════════════════════════════════════"
```

**Step 2: Make executable**

```bash
chmod +x scripts/daily-checklist.sh
```

**Step 3: Test**

```bash
./scripts/daily-checklist.sh
```

**Step 4: Commit**

```bash
git add scripts/daily-checklist.sh
git commit -m "feat: add progressive daily checklist script"
```

---

### Task 20: Final Integration & Documentation Index

**Files:**

- Create: `docs/README.md`

**Step 1: Create documentation index**

```markdown
# PAIOS Workflow Documentation

Complete guide to Superpowers, GSD, and PAIOS Skills optimization.

## 📖 Essential Reading

### Start Here

1. **[Quick Reference](QUICK-REFERENCE.md)** - One-page cheatsheet (print/bookmark this!)
2. **[Skills Playbook](SKILLS-PLAYBOOK.md)** - Intent-based guide ("I want to X → use Y")
3. **[Progressive Rollout](PROGRESSIVE-ROLLOUT.md)** - Week-by-week habit building plan

### Deep Dives

- **[GSD Guide](GSD-GUIDE.md)** - Complete GSD command reference
- **[Configuration Reference](CONFIG-REFERENCE.md)** - All settings explained
- **[Integration Map](INTEGRATION-MAP.md)** - How everything connects

## 🔍 Audit Reports

Results from comprehensive system audit:

- [Audit Summary](audit/AUDIT-SUMMARY.md) - Executive summary and findings
- [GSD Config Report](audit/gsd-config-report.md)
- [Superpowers Inventory](audit/superpowers-inventory.md)
- [PAIOS Skills Report](audit/paios-skills-report.md)
- [Workflow Gaps](audit/workflow-gaps.md)

## 📋 Plans & Design

- [Optimization Design](plans/2026-02-27-superpowers-gsd-optimization-design.md) - Original design document
- [Implementation Plan](plans/2026-02-27-superpowers-gsd-optimization.md) - This plan

## 🛠️ Scripts & Tools

Located in `scripts/`:

- `validate-config.sh` - Validate GSD configuration
- `setup-aliases.sh` - Install shell aliases
- `session-reminder.sh` - Display reminder at session start
- `daily-checklist.sh` - Progressive daily checklist
- `start-weekly-review.sh` - Generate weekly review

## 📅 Weekly Reviews

Track your progress in `docs/reviews/`:

- Use `./scripts/start-weekly-review.sh` to create new review
- Review template: [WEEKLY-REVIEW.md](templates/WEEKLY-REVIEW.md)

## 🎯 Getting Started

1. **Read** [Quick Reference](QUICK-REFERENCE.md)
2. **Review** [Week 1-2 focus](PROGRESSIVE-ROLLOUT.md#week-1-2-core-skills)
3. **Run** `./scripts/daily-checklist.sh` each morning
4. **Practice** using skills this week
5. **Review** progress at end of week

## 📊 Success Metrics

Track these monthly:

- Skills usage frequency
- Time saved per task
- Quality improvements (bugs, reviews)
- "Should have used X" moments (decreasing)

## 🔄 Maintenance

- **Weekly**: Review progress, update playbook learnings
- **Monthly**: Review all documentation accuracy
- **Quarterly**: Re-audit system, update optimization plan
```

**Step 2: Commit**

```bash
git add docs/README.md
git commit -m "docs: create documentation index and getting started guide"
```

---

### Task 21: Create GitHub Issue Templates

**Files:**

- Create: `.github/ISSUE_TEMPLATE/skill-usage-feedback.md`

**Step 1: Create feedback template**

```markdown
---
name: Skill Usage Feedback
about: Report friction, missed opportunities, or improvements for workflow tools
title: "[FEEDBACK] "
labels: documentation, workflow
---

## What were you trying to do?

[Describe the task or goal]

## What happened?

- [ ] Forgot to use a skill
- [ ] Didn't know which skill to use
- [ ] Skill was too hard to invoke
- [ ] Documentation was unclear
- [ ] Other: [describe]

## What would have helped?

[How could the documentation, tools, or workflows be improved?]

## Context

- Which skill(s) involved? [e.g., brainstorming, /kb, GSD]
- When did this happen? [date/time]
- Which documentation did you check? [e.g., playbook, quick ref]
```

**Step 2: Commit**

```bash
git add .github/ISSUE_TEMPLATE/skill-usage-feedback.md
git commit -m "feat: add skill usage feedback issue template"
```

---

## Completion & Next Steps

### Verification

After completing all tasks, verify:

1. **Documentation complete**

```bash
ls -la docs/*.md docs/audit/ docs/plans/ docs/templates/
```

Expected: All documentation files exist

2. **Scripts working**

```bash
./scripts/validate-config.sh
./scripts/daily-checklist.sh
```

Expected: Both run without errors

3. **Aliases installed**

```bash
validate-gsd
skills
```

Expected: Commands work

### Success Criteria

- ✅ Zero configuration errors (validate-gsd passes)
- ✅ Complete documentation (all 7 docs exist)
- ✅ Scripts operational (all 5 scripts work)
- ✅ Habit-building system ready (checklist, reviews, rollout plan)
- ✅ Quick reference accessible (skills, gsd-help aliases)

### Launch Checklist

Before beginning Week 1:

- [ ] Read Quick Reference
- [ ] Bookmark Skills Playbook
- [ ] Run daily-checklist.sh to verify week tracking
- [ ] Set reminder to run weekly review at end of week
- [ ] Commit to using core 3 skills this week

### Maintenance Schedule

**Weekly:**

- Run `./scripts/start-weekly-review.sh`
- Update playbook with learnings
- Check skills usage tracking

**Monthly:**

- Review all documentation accuracy
- Update configuration if needed
- Check scripts still working

**Quarterly:**

- Full system re-audit (run Phase 1 again)
- Evaluate new skills/capabilities
- Update optimization plan

---

**Implementation Time Estimate:** 4-6 hours total

- Phase 1 (Audit): 1-1.5 hours
- Phase 2 (Documentation): 2-2.5 hours
- Phase 3 (Optimization): 0.5-1 hour
- Phase 4 (Integration): 1-1.5 hours
