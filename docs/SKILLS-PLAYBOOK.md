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
