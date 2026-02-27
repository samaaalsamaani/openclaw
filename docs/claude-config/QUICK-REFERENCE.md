# Claude Code Configuration Quick Reference

One-page printable cheatsheet for essential Claude Code configuration.

## File Locations

| Config Type    | Location                      |
| -------------- | ----------------------------- |
| Main settings  | `~/.claude/settings.json`     |
| MCP servers    | `~/.claude/.mcp.json`         |
| Hooks          | `~/.claude/hooks/*.sh`        |
| Skills         | `~/.claude/skills/*/SKILL.md` |
| Keybindings    | `~/.claude/keybindings.json`  |
| Project config | `.claude/settings.json`       |

---

## Essential Settings

```json
{
  "cleanupPeriodDays": 14,
  "model": "sonnet[1m]",
  "alwaysThinkingEnabled": false,
  "autoUpdatesChannel": "stable",
  "env": {
    "API_KEY": "${API_KEY}"
  },
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep", "Edit", "Skill"],
      "bashPatterns": ["^(ls|cat|git status)\\b"]
    },
    "requireConfirmation": {
      "bashPatterns": ["\\brm\\b.*-rf", "\\bsudo\\b"]
    }
  }
}
```

---

## Hook Types

| Hook               | Trigger            | Use               |
| ------------------ | ------------------ | ----------------- |
| `SessionStart`     | Session begins     | Load context      |
| `UserPromptSubmit` | User sends message | Log prompts       |
| `PostToolUse`      | After tool runs    | Auto-ingest       |
| `Stop`             | User hits Stop     | Quality gate      |
| `SessionEnd`       | Session ends       | Extract learnings |
| `TeammateIdle`     | Agent idles        | Notify lead       |
| `TaskCompleted`    | Task done          | Log completion    |

---

## Hook Template

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/script.sh",
            "timeout": 10,
            "async": false
          }
        ]
      }
    ]
  }
}
```

---

## Skill Template

```markdown
---
name: my-skill
description: Brief description
allowed-tools: Bash, Read, Write
---

# My Skill

## Usage

The user invokes this with `/my-skill $ARGUMENTS`

## Workflow

### 1. Step One

Instructions...
```

---

## MCP Server Template

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

---

## Common Keybindings

| Keys          | Action             | Description     |
| ------------- | ------------------ | --------------- |
| `cmd+k cmd+k` | `/kb`              | Search KB       |
| `cmd+k cmd+h` | `/health`          | Health check    |
| `cmd+k cmd+c` | `/capture`         | Capture URL     |
| `cmd+k cmd+t` | `/trace`           | View events     |
| `cmd+k cmd+r` | `/codex-review`    | Code review     |
| `cmd+g cmd+n` | `/gsd:new-project` | New GSD project |
| `cmd+g cmd+p` | `/gsd:plan-phase`  | Plan phase      |
| `cmd+shift+k` | Clear context      | Reset           |

---

## Permission Patterns

### Safe (Auto-Approve)

```json
"bashPatterns": [
  "^(ls|cat|head|tail|grep|find|wc|echo|pwd)\\b",
  "^git (status|log|diff|show|branch)",
  "^(pnpm|npm) (?!.*uninstall)",
  "^sqlite3 .* \"SELECT"
]
```

### Dangerous (Require Confirmation)

```json
"bashPatterns": [
  "\\brm\\b.*(-rf|-fr|--recursive)",
  "\\bgit\\b.*(push.*--force|reset.*--hard|clean -f)",
  "\\b(sudo|doas)\\b",
  "\\bkill\\b.*-9",
  "\\bdropdb\\b",
  ">(>|&)",
  "\\|\\s*sh\\b"
]
```

---

## Hook Input Schema

### SessionStart

```json
{
  "cwd": "/path/to/project",
  "session_id": "abc123",
  "matcher": "startup"
}
```

### PostToolUse

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "..."
  },
  "tool_output": "Success"
}
```

### Stop

```json
{
  "transcript_path": "/path/to/transcript.jsonl",
  "session_id": "abc123",
  "stop_hook_active": false
}
```

---

## Hook Script Pattern

```bash
#!/bin/bash
# Hook description

# Read input
INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))")

# Validate
if [ -z "$CWD" ]; then
  exit 0  # Fail gracefully
fi

# Execute logic
RESULT=$(some_operation 2>/dev/null || echo "fallback")

# Output
if [ -n "$RESULT" ]; then
  echo "$RESULT"
fi

exit 0
```

---

## MCP Tools

### Knowledge Base

- `kb_query` - Full-text search
- `kb_smart_query` - Semantic search
- `kb_article` - Get article by ID
- `kb_stats` - Statistics

### macOS System

- `macos_send_notification` - Show notification
- `macos_read_clipboard` - Read clipboard
- `macos_calendar_events` - Get events

### Observability

- `obs_query` - Query events
- `obs_emit` - Emit event
- `obs_stats` - Statistics

---

## Troubleshooting

| Issue             | Check            | Solution                    |
| ----------------- | ---------------- | --------------------------- |
| Hook not firing   | File permissions | `chmod +x hook.sh`          |
| Skill not found   | SKILL.md exists  | `ls ~/.claude/skills/name/` |
| MCP tool missing  | Server running   | `ps aux \| grep mcp`        |
| Timeout           | Increase timeout | `"timeout": 30`             |
| Permission denied | allowed-tools    | Add tool to YAML            |
| Stop loop         | stop_hook_active | Check in hook script        |

---

## Quick Commands

```bash
# Test hook manually
echo '{"cwd":"/tmp"}' | bash ~/.claude/hooks/script.sh

# Test MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node server.js

# Validate JSON
python -m json.tool ~/.claude/settings.json

# Backup config
tar -czf backup.tar.gz ~/.claude/{settings.json,.mcp.json,hooks/,skills/}

# View hook logs
tail -f ~/.claude/hooks/debug.log

# Check MCP servers
ps aux | grep mcp-server

# Test skill
# In Claude: /skill-name test-arg
```

---

## Model Selection

| Model        | Context   | Cost   | Use Case          |
| ------------ | --------- | ------ | ----------------- |
| `haiku`      | Standard  | Low    | Fast iteration    |
| `sonnet`     | Standard  | Medium | Balanced          |
| `sonnet[1m]` | 1M tokens | Medium | Large codebases   |
| `opus`       | Standard  | High   | Complex reasoning |

---

## Environment Variables

```json
{
  "env": {
    "OPENAI_API_KEY": "${OPENAI_API_KEY}",
    "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
    "BRAVE_API_KEY": "${BRAVE_API_KEY}",
    "GITHUB_TOKEN": "${GITHUB_TOKEN}"
  }
}
```

**Security:** Use `${VAR}` references, never hardcode keys.

---

## Decision Trees

### Should I Create a Skill?

```
Is the workflow repeatable?
├─ Yes, invoke often → Create skill
├─ Yes, but rare → Consider skill
└─ No, one-off → Direct prompt
```

### Should I Auto-Approve This Tool?

```
Is it read-only (Read, Glob, Grep)?
├─ Yes → Auto-approve
└─ No
    ├─ Can it modify files? → Require confirmation
    ├─ Can it run external commands? → Require confirmation
    └─ Risk of data loss? → NEVER auto-approve
```

### Should I Add a Hook?

```
Need automated workflow?
├─ Yes, context injection → SessionStart
├─ Yes, quality gate → Stop
├─ Yes, logging → PostToolUse (async)
└─ No → Skip hook
```

---

## Configuration Hierarchy

```
User Global (~/.claude/settings.json)
    ↓ (overrides)
Project Shared (.claude/settings.json)
    ↓ (overrides)
Project Local (.claude/settings.local.json)
```

---

## Maintenance Schedule

| Task               | Frequency | Action                       |
| ------------------ | --------- | ---------------------------- |
| Backup config      | Weekly    | `tar -czf backup.tar.gz ...` |
| Review permissions | Quarterly | Audit auto-approve list      |
| Update skills      | Monthly   | `git pull` shared skills     |
| Test MCP servers   | Weekly    | Verify all tools work        |
| Clean old sessions | Daily     | Auto via `cleanupPeriodDays` |

---

## Security Checklist

- [ ] No hardcoded API keys in settings.json
- [ ] `rm -rf` requires confirmation
- [ ] `sudo` requires confirmation
- [ ] `git push --force` requires confirmation
- [ ] Hook scripts validate inputs
- [ ] MCP servers use env vars for secrets
- [ ] `.gitignore` excludes `settings.local.json`

---

## Performance Tips

1. **Use async hooks** for non-critical operations
2. **Cache expensive operations** (KB queries, API calls)
3. **Limit result sizes** (top 100, not all 10K)
4. **Increase timeouts** for slow operations
5. **Profile hook execution** (log timing)

---

## Common Gotchas

| Gotcha             | Issue                          | Fix                      |
| ------------------ | ------------------------------ | ------------------------ |
| Stop hook loop     | Returns `{"ok": false}` always | Check `stop_hook_active` |
| Regex backtracking | Pattern takes forever          | Use `\\b` boundaries     |
| Unquoted variables | `rm -rf $VAR` if `$VAR=""`     | Always quote: `"$VAR"`   |
| Hook not running   | Missing execute permission     | `chmod +x hook.sh`       |
| MCP server down    | Server process crashed         | Restart Claude Code      |

---

## References

- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Full configuration reference
- [HOOKS-PLAYBOOK.md](./HOOKS-PLAYBOOK.md) - Comprehensive hook guide
- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills development
- [MCP-SERVERS.md](./MCP-SERVERS.md) - MCP server setup
- [KEYBINDINGS-GUIDE.md](./KEYBINDINGS-GUIDE.md) - Keybinding configuration
- [BEST-PRACTICES.md](./BEST-PRACTICES.md) - Best practices compendium
