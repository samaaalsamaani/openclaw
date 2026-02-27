# Superpowers, GSD & Skills Optimization Design

**Date:** 2026-02-27
**Status:** Approved
**Goal:** Comprehensive audit, documentation, and optimization of workflow tools to transform from "aware but underutilizing" to "integrated daily practice"

## Problem Statement

The system has three powerful but underutilized layers:

1. **Superpowers** (10+ core workflow skills) - _how_ you work
2. **GSD** (30+ commands, 11 agents) - _structured delivery_
3. **PAIOS Skills** (12+ custom skills) - _domain capabilities_

**Current State:** Tools exist but aren't integrated into muscle memory. User forgets to use them or only remembers after already starting work.

**Desired State:** Tools are discoverable, easy to invoke, and naturally integrated into daily workflow through clear documentation, optimized configuration, and habit-building systems.

## Approach

**Foundation-first methodology:**

1. Audit everything to understand current state
2. Document clearly to make tools discoverable
3. Optimize to reduce friction
4. Integrate to build lasting habits

## Architecture & Scope

### Three-Tier Activation System

**Tier 1: Discovery Layer** - Quick reference to know what exists

- Skills inventory and capabilities map
- Command reference with examples
- Integration diagram showing connections

**Tier 2: Decision Layer** - Clear rules for when to use what

- Intent-based playbook ("I want to X → use Y")
- Decision trees for common scenarios
- Workflow templates

**Tier 3: Integration Layer** - Defaults and automations

- Contextual triggers and suggestions
- Smart defaults and presets
- Habit-building progressive rollout

### Success Criteria

- Zero configuration errors
- Complete documentation of all capabilities
- Reduced friction in common workflows
- Measurable increase in skill usage
- Lasting habit formation

## Phase 1: Audit

### Scope

**1. GSD Configuration** (`.planning/config.json`)

- Model profile validation (quality/balanced/budget)
- Workflow toggles assessment (research, plan_checker, verifier, auto_advance)
- Parallelization effectiveness
- Commit settings optimization

**2. Superpowers Skills**

- Available vs. actually used analysis
- Skill interdependencies mapping
- Missed opportunity identification

**3. PAIOS Skills & Integration**

- Custom skill configuration validation
- MCP server health check
- Hook configuration review (SessionStart, PostToolUse, Stop, SessionEnd)
- Cross-system integration validation

**4. Workflow Gaps**

- Manual tasks that should use skills
- Friction points and repetitive patterns
- Missing triggers or reminders

### Deliverables

- **Configuration Health Report** - What's optimal, what's misconfigured
- **Skills Inventory** - Available, used, underutilized, missing
- **Friction Analysis** - Where time is lost or tools forgotten
- **Integration Validation** - Are hooks/skills/GSD working together?

### Validation Criteria

- Zero configuration errors or warnings
- Complete inventory of all capabilities
- Documented gap between capability and usage

## Phase 2: Documentation

### Deliverables

#### 1. Skills Playbook (`docs/SKILLS-PLAYBOOK.md`)

Intent-based decision tree:

- **"I want to build something"** → brainstorming → writing-plans → executing-plans
- **"I hit a bug"** → systematic-debugging
- **"I need to plan a project"** → GSD (new-project → plan-phase → execute-phase)
- **"I want to query my knowledge"** → /kb skill
- **"I need to create content"** → /brand → /post

Each entry includes:

- When to use
- How to invoke
- What to expect
- Common gotchas

#### 2. GSD Quick Reference (`docs/GSD-GUIDE.md`)

- Command reference with real examples
- Agent selection guide (research-lead vs. build-lead vs. quality-reviewer)
- Phase lifecycle (discuss → research → plan → execute → verify)
- Common patterns and gotchas

#### 3. Configuration Reference (`docs/CONFIG-REFERENCE.md`)

- GSD settings explained (why quality vs. balanced, when to disable auto_advance)
- Skill configuration format (YAML frontmatter, allowed-tools)
- Hook configuration patterns
- Model selection guidance

#### 4. Integration Map (`docs/INTEGRATION-MAP.md`)

Visual diagram and narrative showing:

- Superpowers → GSD integration
- GSD → PAIOS skills usage
- Hooks → Skills triggering
- Cross-system workflows

### Format Standards

- Markdown with clear sections
- Searchable structure (grep-friendly)
- Living documents (update as learning occurs)
- Version controlled in git

## Phase 3: Optimization

### Configuration Tuning

**1. GSD Settings**

- Validate quality profile for PAIOS work
- Review workflow toggle necessity
- Verify parallelization effectiveness
- Tune commit settings

**2. Skill Enhancements**

- Add missing argument hints
- Validate allowed-tools restrictions
- Complete YAML frontmatter
- Clarify when-to-use descriptions

**3. Hook Optimization**

- Review performance impact
- Validate triggering correctness
- Add missing hooks for common patterns
- Remove redundant/conflicting hooks

### Friction Reduction

**1. Command Shortcuts**

- Shell aliases for common invocations
- Tab-completion for frequent patterns
- Document keyboard shortcuts

**2. Default Behaviors**

- Sensible defaults requiring minimal configuration
- Pre-populated common arguments
- Templates for repetitive tasks

**3. Discovery Improvements**

- Skill suggestions in shell prompt/Claude Code startup
- Daily workflow checklist
- Quick-reference cheatsheet (1-page PDF)

### Success Criteria

- Common tasks require fewer steps
- Configuration validated and optimized
- No unnecessary friction
- Clear "before X, use Y" patterns

## Phase 4: Integration & Habit Formation

### Automation Layer

**1. Smart Defaults**

- Claude Code suggests relevant skills based on message content
- GSD auto-invokes brainstorming for "build/implement" requests
- Workflow presets for common project types

**2. Contextual Triggers**

- Pre-commit: "Did you run verification?"
- Session start: "Available skills for this project: [list]"
- Before long responses: "Should this use a planning skill?"
- Error detection: "This looks like a bug - consider systematic-debugging"

**3. Workflow Templates**

- **New feature**: brainstorming → writing-plans → verification
- **Bug fix**: systematic-debugging → TDD → verification
- **Content creation**: /brand → /capture → /post
- **Research project**: GSD new-project → phase planning
- **Knowledge query**: /kb with smart search patterns

### Habit Building

**1. Progressive Rollout**

- Week 1-2: Core skills (brainstorming, /kb, systematic-debugging)
- Week 3-4: GSD basics (planning workflow)
- Week 5-6: PAIOS skills (/capture, /post, /trace)
- Week 7+: Full integration

**2. Weekly Review Checklist**

- Skills used this week
- Skills that should have been used
- Friction encountered
- Playbook updates

**3. Success Metrics**

- Skill usage frequency
- Time saved per task
- Quality improvements
- Reduced "should have used X" moments

### Maintenance

**Monthly:**

- Review playbook accuracy
- Update configuration
- Archive outdated patterns

**Quarterly:**

- Full system re-audit
- Evaluate new capabilities
- Refine integration patterns

## Implementation Plan

Next step: Create detailed implementation plan using the `writing-plans` skill to break this design into concrete, executable tasks with clear acceptance criteria.

## Key Principles

1. **Foundation first** - Audit and validate before building
2. **Document everything** - Knowledge should be searchable and clear
3. **Reduce friction** - Make the right thing easy
4. **Build habits** - Progressive adoption, not all-at-once
5. **Measure success** - Track usage and improvements
6. **Iterate continuously** - Monthly reviews and quarterly audits

## Success Vision

**3 months from now:**

- You naturally reach for the right skill/tool for each task
- Documentation is your go-to reference, not trial-and-error
- Configuration is optimized and understood
- Workflows are smooth with minimal friction
- Habits are established and reinforced
- The system feels like an extension of your thinking, not a separate toolset

---

**Next Step:** Invoke `writing-plans` skill to create detailed implementation plan.
