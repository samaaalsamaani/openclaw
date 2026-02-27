# Superpowers Skills Inventory

**Generated:** 2026-02-27
**Source:** System reminder and skills marketplace

## Available Skills

### Core Workflow Skills

1. **using-superpowers**
   - **Purpose:** Introduction to skill system, establishes skill invocation patterns
   - **When to use:** Session start, when learning about skills
   - **Current usage:** Often (loaded automatically)
   - **Notes:** Meta-skill that teaches how to use other skills

2. **brainstorming**
   - **Purpose:** Explore requirements, design approaches, get approval before implementation
   - **When to use:** Before ANY creative work - features, components, modifications
   - **Current usage:** ⚠️ Rarely (underutilized)
   - **Why underutilized:** Easy to skip straight to coding, not obviously "creative"
   - **Output:** Design document in `docs/plans/YYYY-MM-DD-<topic>-design.md`

3. **writing-plans**
   - **Purpose:** Break design into bite-sized executable tasks
   - **When to use:** After brainstorming, before implementation
   - **Current usage:** Sometimes
   - **Notes:** Often called automatically after brainstorming

4. **executing-plans**
   - **Purpose:** Implement plan task-by-task with batch execution and checkpoints
   - **When to use:** When you have a written implementation plan
   - **Current usage:** Sometimes
   - **Dependencies:** Requires using-git-worktrees, finishing-a-development-branch

5. **systematic-debugging**
   - **Purpose:** Structured investigation using scientific method
   - **When to use:** ANY bug, test failure, or unexpected behavior
   - **Current usage:** ⚠️ Rarely (underutilized)
   - **Why underutilized:** Temptation to guess at fixes instead of investigating

6. **test-driven-development**
   - **Purpose:** Write failing test → minimal fix → verify cycle
   - **When to use:** Implementing any feature or bugfix
   - **Current usage:** ⚠️ Sometimes (inconsistent)
   - **Why underutilized:** Feels slower initially, skipped under time pressure

7. **verification-before-completion**
   - **Purpose:** Run tests, verify implementation matches plan
   - **When to use:** Before claiming work is "done", "fixed", or "passing"
   - **Current usage:** Sometimes
   - **Notes:** REQUIRED before completion claims, evidence before assertions

### Development Branch Management

8. **using-git-worktrees**
   - **Purpose:** Create isolated git worktrees for feature work
   - **When to use:** Before starting feature work needing isolation
   - **Current usage:** ⚠️ Rarely (underutilized)
   - **Why underutilized:** Setup overhead, not always obvious when needed
   - **Notes:** Required by executing-plans skill

9. **finishing-a-development-branch**
   - **Purpose:** Structured options for merge, PR, or cleanup after work complete
   - **When to use:** After implementation complete and tests pass
   - **Current usage:** ⚠️ Rarely (underutilized)
   - **Dependencies:** Called by executing-plans

### Code Review Skills

10. **requesting-code-review**
    - **Purpose:** Get feedback before merging
    - **When to use:** Completing tasks, implementing major features
    - **Current usage:** Sometimes
    - **Notes:** Called after verification-before-completion

11. **receiving-code-review**
    - **Purpose:** Technical rigor when receiving feedback, verification before implementation
    - **When to use:** When receiving code review feedback
    - **Current usage:** ⚠️ Never (newly available)
    - **Notes:** Requires technical verification, not blind implementation

### Specialized Workflow Skills

12. **writing-skills**
    - **Purpose:** Create new skills, edit existing skills
    - **When to use:** Creating/editing skills, verifying skills work
    - **Current usage:** ⚠️ Rarely (specialized use case)

13. **subagent-driven-development**
    - **Purpose:** Execute implementation plans with independent tasks in current session
    - **When to use:** Have implementation plan, want task-by-task review same session
    - **Current usage:** ⚠️ Rarely (underutilized)
    - **Alternative:** executing-plans (separate session)

14. **dispatching-parallel-agents**
    - **Purpose:** Spawn multiple agents for independent tasks
    - **When to use:** 2+ independent tasks with no shared state or dependencies
    - **Current usage:** ⚠️ Rarely (advanced feature)

## Skill Dependency Map

### Primary Workflows

```
Feature Development:
brainstorming → writing-plans → executing-plans → verification-before-completion → requesting-code-review

Bug Fixing:
systematic-debugging → test-driven-development → verification-before-completion

Plan Execution:
using-git-worktrees → executing-plans → finishing-a-development-branch
```

### Dependencies

- **executing-plans** requires:
  - using-git-worktrees (isolation)
  - finishing-a-development-branch (completion)

- **verification-before-completion** leads to:
  - requesting-code-review (if tests pass)
  - systematic-debugging (if tests fail)

- **writing-plans** follows:
  - brainstorming (design first)

### Integration Points

- **brainstorming** automatically calls **writing-plans**
- **executing-plans** automatically calls **finishing-a-development-branch**
- **verification-before-completion** gates **requesting-code-review**

## Usage Analysis

### Frequently Used ✅

- using-superpowers (automatic)
- writing-plans (part of established workflows)
- executing-plans (when plans exist)
- verification-before-completion (improving)

### Sometimes Used ⚠️

- brainstorming (should be "always")
- test-driven-development (inconsistent)
- requesting-code-review (project-dependent)

### Underutilized ⚠️

| Skill                       | Should Use              | Why Underutilized                 | Impact of Gap                     |
| --------------------------- | ----------------------- | --------------------------------- | --------------------------------- |
| brainstorming               | Before ANY feature work | Skipped, jump to code             | Rework, missed requirements       |
| systematic-debugging        | Every bug               | Guessing instead of investigating | Band-aid fixes, root cause missed |
| test-driven-development     | All implementations     | Feels slower                      | Lower quality, more bugs          |
| using-git-worktrees         | Feature work            | Setup overhead                    | Risk of breaking main             |
| receiving-code-review       | When receiving feedback | New skill                         | Blind implementation              |
| subagent-driven-development | Complex multi-task work | Complexity                        | Serial execution                  |

### Never Used

- dispatching-parallel-agents (advanced, niche use case)
- writing-skills (specialized, infrequent need)

## Critical Gaps

### Gap 1: Brainstorming Avoidance

**Pattern:** Jump straight from "I need X" to implementation
**Should be:** "I need X" → invoke brainstorming → design → plan → implement
**Impact:** Medium-high. Leads to rework and missed edge cases.

### Gap 2: Debugging by Guessing

**Pattern:** See error → try fix → see if it works
**Should be:** See error → invoke systematic-debugging → root cause → test → fix
**Impact:** High. Band-aid fixes, technical debt, recurring bugs.

### Gap 3: TDD Inconsistency

**Pattern:** Write implementation → write tests (or skip tests)
**Should be:** Write test → fail → implement → pass → refactor
**Impact:** Medium. Lower test coverage, harder to maintain.

### Gap 4: No Git Isolation

**Pattern:** Work directly on main branch
**Should be:** Create worktree → implement → verify → merge
**Impact:** Low-medium. Risk of breaking main, harder to abandon work.

### Gap 5: Plan Execution Without Structure

**Pattern:** Implement plan tasks ad-hoc without tracking
**Should be:** Use executing-plans for batched execution with checkpoints
**Impact:** Low. Loss of structure and reviewability.

## Recommendations

### Priority 1: Build Brainstorming Habit

- Make brainstorming NON-NEGOTIABLE before feature work
- Create visual reminder system
- Track "should have brainstormed" incidents weekly

### Priority 2: Systematic Debugging by Default

- Any bug → immediately invoke skill
- Document debugging sessions for future reference
- Celebrate root cause discoveries

### Priority 3: TDD as Standard Practice

- Start with test (even placeholder)
- Make failing test visible before implementing
- Track TDD adherence in reviews

### Priority 4: Git Worktrees for Isolation

- Use for any multi-day feature work
- Use when plan has >5 tasks
- Default to isolation, not main branch

### Priority 5: Structured Plan Execution

- Always use executing-plans for written plans
- Prefer batched execution over ad-hoc
- Maintain checkpoint discipline

## Integration with PAIOS

PAIOS custom skills (/kb, /capture, etc.) complement superpowers:

- Superpowers = HOW to work (workflows)
- PAIOS skills = WHAT to work with (capabilities)
- GSD = WHEN to work (project structure)

**Example integration:**

1. Start feature → brainstorming
2. Need context → /kb query
3. Write plan → writing-plans
4. Execute → executing-plans (may call /capture, /post during implementation)
5. Verify → verification-before-completion (may use /trace for observability)

## Next Steps

See:

- [Workflow Gaps Analysis](workflow-gaps.md) for friction points
- [Skills Playbook](../SKILLS-PLAYBOOK.md) for usage guide (to be created)
- [Progressive Rollout](../PROGRESSIVE-ROLLOUT.md) for adoption plan (to be created)
