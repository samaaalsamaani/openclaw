# Integration Map

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Claude Code Session                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Superpowers  │  │     GSD      │  │ PAIOS Skills │     │
│  │   Skills     │  │   Agents     │  │  (custom)    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                  │              │
│         └─────────────────┴──────────────────┘              │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                  ┌─────────▼────────┐
                  │   Hooks System   │
                  │  (SessionStart,  │
                  │   PostToolUse,   │
                  │   Stop, etc.)    │
                  └─────────┬────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                   │
    ┌────▼────┐      ┌──────▼──────┐     ┌─────▼─────┐
    │   MCP   │      │  External   │     │   Shell   │
    │ Servers │      │   Systems   │     │  Scripts  │
    │         │      │ (KB, Obs,   │     └───────────┘
    │ - KB    │      │  Social)    │
    │ - macOS │      └─────────────┘
    │ - Obs   │
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
