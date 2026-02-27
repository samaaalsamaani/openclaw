# GSD Quick Reference

**Purpose:** Fast reference for GSD (Get Shit Done) commands and workflows.

## Command Index

- [Project Lifecycle](#project-lifecycle)
- [Phase Management](#phase-management)
- [Execution](#execution)
- [Common Commands](#common-commands)
- [Agent Selection](#agent-selection)

---

## Project Lifecycle

### `/gsd:new-project`

**When to use:** Starting a new multi-phase project

**What it does:**

- Spawns research agents to analyze domain/ecosystem
- Generates `PROJECT.md` with core value proposition
- Creates `REQUIREMENTS.md` from requirements gathering
- Produces `ROADMAP.md` with phase breakdown
- Sets up `.planning/` directory structure

**Example from PAIOS:**

```bash
/gsd:new-project
# Result: 15 phases planned, 46 requirements captured
```

### `/gsd:complete-milestone`

**When to use:** All phases in milestone are complete and verified

**What it does:**

- Archives completed milestone to `archive/`
- Updates `PROJECT.md` for next version
- Prompts for next milestone planning
- Cleans up phase artifacts

**Example:**

```bash
/gsd:complete-milestone
# Archives v1.0 (Phases 1-9)
# Ready to plan v2.0
```

---

## Phase Management

### `/gsd:plan-phase <N>`

**When to use:** Ready to plan next phase in roadmap

**What it does:**

- Spawns phase researcher to analyze implementation approach
- Creates detailed `PLAN.md` with task breakdown
- Verifies plan will achieve phase goal
- Maps requirements to tasks

**Example:**

```bash
/gsd:plan-phase 3
# Creates `.planning/phases/03/PLAN.md`
# 5 tasks, 7 requirements, 12 files affected
```

### `/gsd:add-phase`

**When to use:** Need to add phase to end of current milestone

**What it does:**

- Adds new phase to `ROADMAP.md`
- Updates phase numbering
- Prompts for goal and requirements

**Example:**

```bash
/gsd:add-phase
# Adds Phase 16 after Phase 15
```

### `/gsd:insert-phase`

**When to use:** Urgent work needed between existing phases

**What it does:**

- Inserts decimal phase (e.g., 5.1) between phases
- Doesn't renumber existing phases
- Marked as INSERTED in roadmap

**Example:**

```bash
/gsd:insert-phase 5
# Creates Phase 5.1 between Phase 5 and Phase 6
```

### `/gsd:remove-phase <N>`

**When to use:** Phase no longer needed, remove from roadmap

**What it does:**

- Removes phase from `ROADMAP.md`
- Renumbers subsequent phases
- Archives phase planning if exists

---

## Execution

### `/gsd:execute-phase <N>`

**When to use:** Phase planned and ready to implement

**What it does:**

- Spawns executor agent to implement `PLAN.md`
- Creates atomic commits per task
- Handles deviations with user approval
- Maintains checkpoint state
- Executes tasks in waves (parallel where possible)

**Example:**

```bash
/gsd:execute-phase 3
# Wave 1: Tasks 1-2 (parallel)
# Wave 2: Task 3 (depends on 1-2)
# Wave 3: Tasks 4-5 (parallel)
```

### `/gsd:verify-work`

**When to use:** Phase execution complete, need verification

**What it does:**

- Runs goal-backward analysis
- Checks codebase delivers what phase promised
- Creates `VERIFICATION.md` report
- Identifies gaps between goal and implementation

**Example:**

```bash
/gsd:verify-work
# Verification: 5/5 requirements met
# 0 gaps found
# Phase goal achieved ✅
```

### `/gsd:quick <description>`

**When to use:** Small task with GSD guarantees but skip optional agents

**What it does:**

- Executes task with atomic commits
- Skips research/plan-checker/verifier
- Still maintains state tracking
- Faster than full GSD workflow

**Example:**

```bash
/gsd:quick "Add error handling to API endpoint"
```

---

## Common Commands

### `/gsd:progress`

**When to use:** Check project status and next action

**What it does:**

- Shows current milestone and phase
- Displays plans completed vs remaining
- Routes to next action (plan or execute)
- Shows blockers if any

**Example:**

```bash
/gsd:progress
# Phase 3 of 15
# Plan: Complete (5 tasks)
# Next: /gsd:execute-phase 3
```

### `/gsd:help`

**When to use:** Forgot a command or need syntax help

**What it does:**

- Lists all GSD commands
- Shows usage patterns
- Links to documentation

### `/gsd:settings`

**When to use:** Change GSD configuration

**What it does:**

- Toggles workflow flags (research, plan_checker, verifier, auto_advance)
- Changes model profile (quality/balanced/budget)
- Updates `.planning/config.json`

**Examples:**

```bash
/gsd:settings --no-auto-advance
/gsd:settings --profile balanced
/gsd:settings --no-research
```

### `/gsd:update`

**When to use:** Update GSD to latest version

**What it does:**

- Fetches latest GSD code
- Shows changelog
- Preserves local configuration

### `/gsd:health`

**When to use:** Diagnose planning directory issues

**What it does:**

- Validates `.planning/` structure
- Checks for orphaned files
- Verifies phase numbering
- Offers repair if issues found

---

## Advanced Commands

### `/gsd:pause-work`

**When to use:** Need to stop mid-phase and resume later

**What it does:**

- Creates context handoff document
- Saves current state
- Documents what's done/pending
- Enables clean resumption

### `/gsd:resume-work`

**When to use:** Continue work from previous session

**What it does:**

- Loads context handoff
- Restores state
- Shows what was done
- Routes to next task

### `/gsd:map-codebase`

**When to use:** Need to understand codebase before planning

**What it does:**

- Spawns mapper agents (tech, arch, quality, concerns)
- Analyzes codebase in parallel
- Creates `.planning/codebase/` documents
- Used by phase researchers

**Example:**

```bash
/gsd:map-codebase
# Creates: tech-stack.md, architecture.md, quality.md, concerns.md
```

### `/gsd:debug`

**When to use:** Investigating bugs systematically

**What it does:**

- Manages debug session state
- Uses scientific method
- Creates checkpoints
- Persists findings

### `/gsd:add-todo <description>`

**When to use:** Capture idea/task from current conversation

**What it does:**

- Creates todo in `.planning/todos/`
- Tags with context
- Available for later planning

### `/gsd:check-todos`

**When to use:** Review pending todos and select one to work on

**What it does:**

- Lists all pending todos
- Shows context for each
- Prompts for selection
- Routes to appropriate workflow

---

## Agent Selection

GSD uses specialized agents for different tasks. Understanding which agent does what helps set expectations.

### Research Agents

**gsd-phase-researcher**

- Research how to implement a phase
- Produces `RESEARCH.md`
- Consumed by gsd-planner
- Spawned by `/gsd:plan-phase`

**gsd-project-researcher**

- Research domain ecosystem before roadmap
- Produces files in `.planning/research/`
- Spawned by `/gsd:new-project` (4 parallel researchers)
- Focus areas: stack, architecture, pitfalls, features

**research-deep**

- Deep technical analysis
- Codebase exploration
- API documentation review
- Can be spawned manually for deep dives

**research-web**

- Web research for current information
- Searches for best practices
- Finds recent examples
- Validates technology choices

**research-critic**

- Finds counter-arguments
- Validates claims
- Stress-tests conclusions
- Devil's advocate

### Build Agents

**build-lead**

- Coordinates frontend/backend/tests
- Assigns work to specialized agents
- Integrates outputs
- Can spawn teammates

**build-frontend**

- UI components
- Client logic
- Styling
- Has: Read, Write, Edit, Glob, Grep, Bash

**build-backend**

- APIs
- Server logic
- Database
- Scripts
- Has: Read, Write, Edit, Glob, Grep, Bash

**build-tests**

- Unit tests
- Integration tests
- Validation scripts
- Has: Read, Write, Edit, Glob, Grep, Bash

### Review Agents

**review-architecture**

- Design patterns
- Scalability analysis
- Maintainability review
- Has: Read, Glob, Grep, Bash, WebSearch

**review-quality**

- Security review
- Bug detection
- Test coverage analysis
- Code quality
- Has: Read, Glob, Grep, Bash

### Planning Agents

**gsd-planner**

- Creates executable phase plans
- Task breakdown
- Dependency analysis
- Goal-backward verification
- Creates `PLAN.md`

**gsd-plan-checker**

- Verifies plans before execution
- Goal-backward analysis
- Identifies gaps
- Spawned by `/gsd:plan-phase` if enabled

**gsd-roadmapper**

- Creates project roadmaps
- Phase breakdown
- Requirement mapping
- Success criteria derivation
- Spawned by `/gsd:new-project`

### Execution Agents

**gsd-executor**

- Executes GSD plans
- Atomic commits per task
- Deviation handling
- Checkpoint protocols
- State management

**gsd-verifier**

- Verifies phase goal achievement
- Goal-backward analysis
- Creates `VERIFICATION.md`
- Checks codebase delivers what promised

**gsd-debugger**

- Investigates bugs
- Scientific method
- Manages debug sessions
- Handles checkpoints

### Specialized Agents

**gsd-codebase-mapper**

- Analyzes codebase
- Writes structured documents
- Spawned by `/gsd:map-codebase`
- Focus areas provided as parameter

**gsd-integration-checker**

- Verifies cross-phase integration
- E2E flow validation
- Checks phases connect properly

**gsd-research-synthesizer**

- Synthesizes parallel research outputs
- Creates `SUMMARY.md`
- Spawned after 4 researcher agents complete

---

## Configuration

**Location:** `.planning/config.json`

### Model Profiles

- **quality**: Uses Opus for planning/research (recommended for PAIOS)
- **balanced**: Mixed Sonnet/Opus (faster, good for most projects)
- **budget**: Mostly Haiku (fastest, ok for simple tasks)

### Workflow Toggles

- **research**: Research before planning (default: true)
- **plan_checker**: Verify plans before execution (default: true)
- **verifier**: Verify work after execution (default: true)
- **auto_advance**: Auto-advance to next phase (default: true)

### Other Settings

- **parallelization**: Enable parallel task execution (default: true)
- **commit_docs**: Commit planning docs (default: true)

---

## Troubleshooting

### "Phase not found"

- Run `/gsd:progress` to see current state
- Check `.planning/ROADMAP.md` for phase numbers
- Use `/gsd:health` to diagnose issues

### "Plan already exists"

- Phase already planned
- Use `/gsd:execute-phase` instead
- Or delete plan and re-plan if needed

### "No active phase"

- Need to plan a phase first
- Run `/gsd:plan-phase <N>`
- Or check `/gsd:progress` for status

### "Agent stalled"

- Check agent has necessary tools
- Verify agent type matches task
- Review agent description for limitations

---

## Tips & Best Practices

### When to Use Quality vs Balanced

- **Quality**: Architecture-heavy, complex integrations, foundational work
- **Balanced**: Feature additions, bug fixes, well-understood domains
- **Budget**: Documentation, simple refactors, repetitive tasks

### When to Disable auto_advance

- Building foundational capabilities
- Major architecture changes
- Integration with external systems
- Want manual review between phases

### When to Skip Research

- Very familiar domain
- Simple implementation
- Time-sensitive work
- (But research usually pays off!)

### When to Use Quick vs Full GSD

- **Quick**: Single file changes, obvious implementations, < 30 min work
- **Full GSD**: Multi-file changes, architecture decisions, > 1 hour work

---

## Real Examples from PAIOS

### Phase 1: MCP Mesh Foundation

```bash
/gsd:plan-phase 1
# Result: 5 plans created
# - Register mutual MCP servers
# - Wire shared MCP servers
# - Enable Codex experimental features
# - Fix SQLite busy_timeout
# - Refresh Late.dev tokens

/gsd:execute-phase 1
# Wave-based execution, 5 tasks completed
# All atomic commits

/gsd:verify-work
# Verification: All 5 requirements met
# Success criteria achieved ✅
```

### Phase 10: Observability Foundation

```bash
/gsd:settings --profile quality
# Architecture-heavy phase, need max reasoning

/gsd:plan-phase 10
# 3 plans: schema, instrumentation, MCP+skill

/gsd:execute-phase 10
# Parallel execution where possible

/gsd:verify-work
# Verified: Event tracing operational
```

### Urgent Hotfix Between Phases

```bash
/gsd:insert-phase 5
# Creates Phase 5.1
# Goal: Fix critical authentication bug
# Marked as INSERTED

/gsd:quick "Fix auth token expiry handling"
# Fast execution, still atomic commit
```

---

**Last Updated:** 2026-02-27
**GSD Version:** Compatible with latest superpowers marketplace
