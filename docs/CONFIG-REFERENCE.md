# Configuration Reference

## GSD Settings (`.planning/config.json`)

### Model Profile

```json
"model_profile": "quality"  // or "balanced" or "budget"
```

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
```

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

## Hook Configuration

**Location:** `~/.claude/settings.json`

### Available Hook Types

- SessionStart
- PostToolUse
- Stop
- SessionEnd
- TeammateIdle
- TaskCompleted
- UserPromptSubmit

### Example Hook

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "bash /path/to/hook.sh",
      "timeout": 10,
      "async": false
    }
  ]
}
```
