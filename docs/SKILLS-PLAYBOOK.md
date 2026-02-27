# Skills Playbook

**Purpose:** Intent-based decision tree for knowing which skill/tool to use for any task.

**How to use:** Find your intent ("I want to...") and follow the workflow.

---

## Quick Navigation

- [Building Features](#building-features)
- [Fixing Bugs](#fixing-bugs)
- [Planning Projects](#planning-projects)
- [Managing Knowledge](#managing-knowledge)
- [Creating Content](#creating-content)
- [System Tasks](#system-tasks)
- [Code Review](#code-review)
- [Team Collaboration](#team-collaboration)

---

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

---

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

---

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

---

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

---

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

---

## System Tasks

**Intent:** "I need to check/manage the system"

### Health Checks

- **Quick check**: `/health`
- **Comprehensive**: `/paios-health`
- **View events**: `/trace <query>`
- **Check autonomy**: `/autonomy`

### When to Use

- Regular system validation (weekly)
- Before starting major work
- After system changes
- When something seems off

---

## Code Review

**Intent:** "I need code review"

### Options

1. **Dual-brain review** (Codex + Claude)
   - Invoke: `/codex-review <file>`
   - Purpose: Two AI perspectives (quality + architecture)
   - When: Complex implementations, architecture-heavy

2. **Request human review**
   - Invoke: `@superpowers:requesting-code-review`
   - Purpose: Human feedback before merge
   - When: Before merging to main

3. **Receive and implement feedback**
   - Invoke: `@superpowers:receiving-code-review`
   - Purpose: Technical verification before implementing suggestions
   - Required: When receiving review feedback

---

## Team Collaboration

**Intent:** "I need to work with agents/teammates"

### Agent Teams

- **Spawn team**: `/team <type>` (research, review, build)
- **Research team**: 4 agents for parallel research
- **Review team**: 2 agents (architecture + quality)
- **Build team**: 4 agents (frontend, backend, tests, lead)

### When to Use Teams

- Complex multi-aspect research
- Large feature implementations
- Parallel independent work
- Comprehensive reviews

### Team Workflow

1. Spawn team with `/team`
2. Assign tasks via TodoWrite
3. Monitor progress
4. Review outputs
5. Shutdown team when complete

---
