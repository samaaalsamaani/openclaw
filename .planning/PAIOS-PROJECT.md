# PAIOS v3 — Close the Loop & Go Proactive

## Overview

This project covers Phases C and D of the PAIOS (Personal AI Operating System) ecosystem masterplan. The system has 4 AI brains (Claude, Codex, Gemini CLI, OpenRouter overflow) connected via MCP into a unified OS with shared memory (KB SQLite).

## Master Reference

See: `~/.openclaw/workspace/memory/ECOSYSTEM-MASTERPLAN.md`

## What's Already Done (Phases A-B)

- **Phase A**: Fixed broken data flows (process-screenshot.sh, ai CLI, optimize.js, analytics.py, autonomy enforcement, handler.sh, notify-media.sh)
- **Phase B**: Wired the brain mesh (Gemini MCP mesh, task-router, compound detection, async verification scaffolding, docs)
- **Phase C1**: Verification loop closed (executeVerification calls verifier brain, quality scores stored in observability)
- **Phase C2**: Proactive intelligence (heartbeat tasks on launchd: daily competitor/pillar/engagement, weekly reflect/optimize)
- **Phase C3**: GSD activated (this config, /gsd:paios skill, MCP access for GSD agents)

## Current Focus — Phases C-D

### Phase C: Close the Loop (Completed)

- C1: Verification actually calls verifier brain, stores quality scores
- C2: Heartbeat tier 6/7 tasks wired to launchd
- C3: GSD activated for PAIOS workflow

### Phase D: Full Integration (Next)

- D1: Compound task execution (run followup brain after primary)
- D2: Cross-brain context sharing (KB context injection for all brains)
- D3: Unified dashboard (ai status shows all brain health + routing stats)
- D4: Self-healing (auto-restart failed services, auto-fix routing misclassifications)

## Key Architecture

- **Gateway**: `/Users/user/Desktop/projects/openclaw` — Node.js monorepo, port 18789
- **Workspace**: `~/.openclaw/workspace/` — agent brain files (IDENTITY, SOUL, USER, TOOLS, AGENTS, HEARTBEAT)
- **Projects**: `~/.openclaw/projects/` — 20+ project directories with scripts
- **KB**: `~/.openclaw/knowledge-base.sqlite` — PARA-organized, FTS5 + embeddings
- **Observability**: `~/.openclaw/observability.sqlite` — event tracing, quality scores
- **Autonomy**: `~/.openclaw/autonomy.sqlite` — trust levels, action classification

## Constraints

- All LLM calls must use free-tier brains (Claude via Max sub, Codex via ChatGPT Pro, Gemini via Google One AI Pro)
- OpenRouter is emergency overflow only ($110 remaining)
- macOS-native (launchd, Siri Shortcuts, Finder integration)
- Bash scripts must be compatible with macOS bash 3.2 (no associative arrays)
