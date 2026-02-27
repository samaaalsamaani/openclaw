# Workflow Gaps Analysis

**Generated:** 2026-02-27
**Analysis Period:** Last 50 commits (Feb 2026)
**Focus:** Identifying manual tasks that should use skills

## Recent Commit Pattern Analysis

### Observed Commit Patterns

```
docs: add superpowers/GSD optimization design
fix: resolve 3 critical issues from architecture validation
feat: upgrade LLM floor to claude-sonnet-4-6 across all routing subsystems
fix: architecture audit — 11 fixes across 9 files
fix: filter out trivial enrichments (NO_REPLY) from follow-up delivery
feat: deliver cross-brain enrichments as follow-up messages
test: add 25 unit tests for cross-brain task decomposer
feat: add pre-reply compound orchestration for multi-brain parallel execution
```

### Pattern 1: Feature Work Without Brainstorming Evidence

**Commits indicating feature work:**

- `feat: upgrade LLM floor to claude-sonnet-4-6` (major architectural change)
- `feat: deliver cross-brain enrichments` (new capability)
- `feat: add pre-reply compound orchestration` (complex integration)
- `feat: PAIOS 7-upgrade — Auto-RAG, conv learning, enrichment`
- `feat: wire entity semantic search into kb_entities`

**Missing evidence:**

- No `docs/plans/YYYY-MM-DD-<feature>-design.md` in commits
- No brainstorming session artifacts
- Features appear to go straight from idea → implementation

**Impact:** Medium-High. Complex features (like cross-brain orchestration) benefit significantly from upfront design.

### Pattern 2: Bug Fixes Without Systematic Debugging

**Commits indicating bug fixes:**

- `fix: resolve 3 critical issues from architecture validation`
- `fix: architecture audit — 11 fixes across 9 files`
- `fix: filter out trivial enrichments (NO_REPLY)`
- `fix: unblock compound orchestration, verification, and quality scoring`
- `fix: wire decomposition into embedded agent path`

**Missing evidence:**

- No debugging session documentation
- No root cause analysis artifacts
- Fixes appear reactive rather than systematic

**Impact:** High. Multiple fixes to same subsystem (routing, enrichment) suggest band-aid fixes rather than root cause resolution.

### Pattern 3: Tests Written After Implementation

**Evidence:**

- `test: add 25 unit tests for cross-brain task decomposer` (separate commit)
- Features committed before test commits
- No "test first" pattern visible

**Missing pattern:**

- `test: add failing test for decomposer`
- `feat: implement decomposer to pass test`
- `test: verify decomposer edge cases`

**Impact:** Medium. Indicates TDD not consistently applied.

### Pattern 4: Commits Without Verification

**Large changes without verification evidence:**

- `feat: PAIOS 7-upgrade` (major upgrade, no verification artifact)
- `fix: architecture audit — 11 fixes` (11 fixes at once, risky)
- `feat: add 9 external MCP servers` (integration risk)

**Should have:**

- Verification report showing tests pass
- Integration test results
- Regression test confirmation

**Impact:** Medium. Risk of introducing regressions.

### Pattern 5: Direct Main Branch Work

**Evidence:**

- All commits directly to `main`
- No feature branch names visible
- No merge commits (except upstream syncs)

**Risk:**

- Breaking main branch during development
- Hard to abandon incomplete work
- No isolation for experimental changes

**Impact:** Low-Medium. Acceptable for small teams, but risky for complex features.

## Friction Points

### Friction Point 1: Forgetting to Use Skills

**Description:** Easy to forget skills exist when focused on coding

**Frequency:** Daily (estimated 60% of feature work starts without brainstorming)

**Impact:** High - leads to rework, missed requirements, suboptimal designs

**Symptoms:**

- "Should have thought about X earlier"
- Mid-implementation architecture changes
- Post-implementation "oh, we need to handle Y too"

**Potential Solutions:**

1. Visual reminder at session start
2. Pre-commit hook: "Did you brainstorm?"
3. Checklist in PR template
4. Weekly review: "Where did I skip skills?"

### Friction Point 2: Not Knowing Which Skill to Use

**Description:** 17 PAIOS skills + 14 superpowers skills = cognitive overload

**Frequency:** Weekly (estimated 2-3 times per week)

**Impact:** Medium - leads to manual work that could be automated

**Symptoms:**

- Manually querying SQLite instead of using /trace
- Writing content without /brand context
- Debugging without systematic approach

**Potential Solutions:**

1. Intent-based skill index: "I want to X" → skill Y
2. Skill autocomplete in Claude Code
3. Quick reference cheatsheet (printed, visible)
4. Skill of the week learning system

### Friction Point 3: Skills Requiring Too Much Setup

**Description:** Some skills need pre-work that creates friction

**Examples:**

- **executing-plans** requires git worktree setup
- **writing-plans** needs design document first
- **/brand** needs brand kit populated

**Frequency:** Weekly

**Impact:** Medium - discourages skill usage

**Symptoms:**

- "I'll just do it manually, faster"
- Skipping worktrees for "small" changes that grow
- Writing content without brand voice

**Potential Solutions:**

1. Reduce setup overhead (aliases, templates)
2. Make setup optional for simple cases
3. Document "minimum viable" skill invocation
4. Create composite skills (e.g., "quick-plan" skips worktree)

### Friction Point 4: No Clear "Entry Point" to Workflows

**Description:** Unclear where to start for common scenarios

**Examples:**

- "I need to build X" → where do I start?
- "Tests are failing" → debugging or TDD first?
- "Need to create content" → /brand? /kb? /post?

**Frequency:** Daily (for unfamiliar tasks)

**Impact:** High - leads to ad-hoc approaches

**Symptoms:**

- Starting over midway through task
- "Wrong tool for the job" realization
- Inconsistent workflows across tasks

**Potential Solutions:**

1. Decision tree flowchart (printed, visible)
2. Intent-based playbook
3. Session startup prompt: "What do you want to do today?"
4. Common scenario templates

### Friction Point 5: Skill Invocation Syntax

**Description:** Different invocation patterns create confusion

**Examples:**

- Superpowers: `@superpowers:skill-name`
- PAIOS skills: `/skill-name`
- GSD commands: `/gsd:command`

**Frequency:** Weekly

**Impact:** Low - minor annoyance

**Symptoms:**

- Trying `/brainstorming` instead of `@superpowers:brainstorming`
- Forgetting slash vs @ prefix
- Tab completion helps but not intuitive

**Potential Solutions:**

1. Standardize on single prefix (hard, not feasible)
2. Better error messages: "Did you mean @superpowers:X?"
3. Aliases in documentation
4. Muscle memory through repetition

### Friction Point 6: Post-Implementation Verification Skipped

**Description:** Natural tendency to claim "done" without verification

**Frequency:** Weekly (estimated 40% of implementations)

**Impact:** High - undiscovered bugs, regressions

**Symptoms:**

- "It works on my machine"
- Failed CI after push
- User-discovered bugs
- "Forgot to test edge case X"

**Potential Solutions:**

1. Pre-commit hook: "Did you run verification?"
2. PR template requires verification evidence
3. Make verification less tedious (scripts, aliases)
4. Gamify verification (streak tracking)

## Manual Tasks That Should Use Skills

### Task: "Research this topic"

**Current:** Manual web search, copy/paste notes
**Should be:** `/capture URL` → auto-ingest to KB

### Task: "What do I know about X?"

**Current:** Grep through files, check docs
**Should be:** `/kb "natural language query"`

### Task: "Something's broken"

**Current:** Read stack trace, try random fixes
**Should be:** `@superpowers:systematic-debugging`

### Task: "Build new feature"

**Current:** Jump straight to coding
**Should be:** `@superpowers:brainstorming` → `@superpowers:writing-plans` → execute

### Task: "Check system health"

**Current:** Manual ps, curl, sqlite queries
**Should be:** `/health` or `/paios-health`

### Task: "Create social post"

**Current:** Write from scratch
**Should be:** `/brand` → `/post topic`

### Task: "Schedule content"

**Current:** Manual tracking in notes
**Should be:** `/calendar add ...`

### Task: "Find why this happened"

**Current:** Search logs manually
**Should be:** `/trace query`

### Task: "Code review needed"

**Current:** Manual review or GitHub PR
**Should be:** `/codex-review` for dual-brain perspective

### Task: "Plan multi-phase project"

**Current:** Ad-hoc planning
**Should be:** `/gsd:new-project`

## Friction Analysis by Frequency × Impact

| Friction Point                           | Frequency | Impact | Priority |
| ---------------------------------------- | --------- | ------ | -------- |
| Forgetting to use skills                 | Daily     | High   | 🔴 P0    |
| Post-implementation verification skipped | Weekly    | High   | 🔴 P0    |
| No clear entry point to workflows        | Daily     | High   | 🔴 P0    |
| Not knowing which skill to use           | Weekly    | Medium | 🟡 P1    |
| Skills requiring too much setup          | Weekly    | Medium | 🟡 P1    |
| Skill invocation syntax                  | Weekly    | Low    | 🟢 P2    |

## Recommended Solutions (Prioritized)

### Priority 0: Critical Friction (Daily + High Impact)

1. **Visual Reminder System**
   - Session startup banner: "Before you start: brainstorming? TDD? verification?"
   - Printed cheatsheet on desk
   - Terminal prompt with reminder emoji

2. **Intent-Based Playbook**
   - "I want to..." → skill/workflow
   - Searchable by intent, not skill name
   - Examples for each scenario

3. **Verification Gate**
   - Pre-commit hook requiring verification
   - PR template with verification checklist
   - Make verification easier (scripts)

### Priority 1: Significant Friction (Weekly + Medium Impact)

4. **Skill Discovery System**
   - Quick reference card (1-page, printed)
   - Autocomplete with descriptions
   - Skill of the week rotation

5. **Reduce Setup Overhead**
   - Aliases for common patterns
   - Templates for common scenarios
   - "Quick mode" for simple cases

### Priority 2: Minor Friction (Low Impact)

6. **Better Error Messages**
   - Suggest correct skill on typos
   - Show similar skills
   - Link to documentation

## Behavioral Patterns to Build

### Pattern 1: Skills-First Mindset

**Current:** Task → Implementation → (maybe) Skills
**Target:** Task → Check playbook → Invoke skill → Implement

**Habit formation:**

- Week 1-2: Conscious effort, reminders
- Week 3-4: Becoming automatic
- Week 5+: Natural instinct

### Pattern 2: Verification Before "Done"

**Current:** Implementation → "Done!" → (maybe later) Verification
**Target:** Implementation → Verification → "Done!"

**Habit formation:**

- Make verification gate hard (can't skip)
- Celebrate verification catches
- Track verification adherence

### Pattern 3: Documentation as Code

**Current:** Code → (maybe) Docs
**Target:** Docs → Code (design first)

**Habit formation:**

- Brainstorming → always produces doc
- Commit doc before code
- Review design before implementation

## Success Metrics

Track these weekly to measure improvement:

1. **Skill Usage Frequency**
   - Brainstorming sessions per feature
   - Systematic debugging per bug
   - Verification runs per implementation

2. **"Should Have Used" Moments**
   - Track when you realize "should have used X skill"
   - Goal: Decrease over time
   - Weekly review question

3. **Rework Rate**
   - Features requiring significant changes post-implementation
   - Bugs requiring multiple fix attempts
   - Goal: Decrease over time

4. **Time to First Skill Invocation**
   - How long from "need to do X" to invoking skill?
   - Goal: Decrease as habits form
   - Track in weekly review

## Next Steps

1. **Create Skills Playbook** - Intent-based decision tree
2. **Build Reminder System** - Visual cues, startup banner
3. **Implement Verification Gate** - Pre-commit hook
4. **Start Weekly Reviews** - Track metrics, adjust approach
5. **Progressive Rollout** - Build habits gradually, not all at once

See:

- [Audit Summary](AUDIT-SUMMARY.md) for consolidated findings
- [Skills Playbook](../SKILLS-PLAYBOOK.md) for usage guide (to be created)
- [Progressive Rollout](../PROGRESSIVE-ROLLOUT.md) for adoption plan (to be created)
