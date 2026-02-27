# Claude Code Configuration Reference

Comprehensive reference for all Claude Code configuration options in `~/.claude/settings.json`.

## Quick Navigation

- [Core Settings](#core-settings)
- [Model Configuration](#model-configuration)
- [Environment Variables](#environment-variables)
- [Permissions System](#permissions-system)
- [Hooks Configuration](#hooks-configuration)
- [Status Line](#status-line)
- [Plugins](#plugins)
- [Decision Trees](#decision-trees)

## Core Settings

### cleanupPeriodDays

**Type:** `number`
**Default:** `14`
**Purpose:** Automatic cleanup of session history, cache files, and temporary data.

```json
{
  "cleanupPeriodDays": 14
}
```

**Decision Tree:**

- Keep large codebase with frequent sessions? → `7` (weekly cleanup)
- Normal usage? → `14` (default)
- Archive sessions for analysis? → `30` or higher
- Storage constrained? → `3` (aggressive cleanup)

**Impact:** Lower values free up disk space but lose historical context. Higher values preserve session history for debugging.

---

### model

**Type:** `string`
**Purpose:** Default model selection for Claude Code sessions.

```json
{
  "model": "sonnet[1m]"
}
```

**Available Options:**

- `"sonnet"` - Claude Sonnet (balanced performance)
- `"sonnet[1m]"` - Claude Sonnet with 1M token context
- `"opus"` - Claude Opus (highest quality)
- `"haiku"` - Claude Haiku (fastest)

**Decision Tree:**

- Working with large codebases? → `"sonnet[1m]"`
- Need highest quality reasoning? → `"opus"`
- Budget/speed constrained? → `"haiku"`
- Balanced use case? → `"sonnet"` (default)

**Cost Implications:**

- Opus: Most expensive, best quality
- Sonnet: Good balance
- Haiku: Most economical

---

### alwaysThinkingEnabled

**Type:** `boolean`
**Default:** `false`
**Purpose:** Enable extended thinking mode for complex reasoning tasks.

```json
{
  "alwaysThinkingEnabled": true
}
```

**Decision Tree:**

- Architecture/design work? → `true`
- Complex debugging? → `true`
- Simple code changes? → `false`
- Rapid iteration? → `false`

**Trade-offs:**

- **Enabled:** Better reasoning, slower responses, higher cost
- **Disabled:** Faster responses, may miss edge cases

---

### autoUpdatesChannel

**Type:** `string`
**Default:** `"stable"`
**Purpose:** Control which update channel to use for Claude Code.

```json
{
  "autoUpdatesChannel": "stable"
}
```

**Options:**

- `"stable"` - Production releases only (recommended)
- `"beta"` - Early access to new features
- `"dev"` - Bleeding edge (may be unstable)

**Decision Tree:**

- Production use? → `"stable"`
- Want new features early? → `"beta"`
- Contributing to development? → `"dev"`
- Risk averse? → `"stable"` + manual updates

---

## Environment Variables

**Location:** `settings.json` → `env` object
**Purpose:** Inject environment variables into Claude Code sessions (API keys, tokens, configuration).

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "BRAVE_API_KEY": "BSA...",
    "CUSTOM_VAR": "value"
  }
}
```

### Security Best Practices

**CRITICAL:** Never commit `settings.json` with API keys to git.

**Recommended Pattern:**

1. Use `~/.claude/settings.json` for personal config (gitignored)
2. Use project-level `settings.local.json` for team-safe overrides
3. Reference secrets via shell env vars: `"${ENV_VAR_NAME}"`

**Example (secure):**

```json
{
  "env": {
    "OPENAI_API_KEY": "${OPENAI_API_KEY}",
    "GITHUB_TOKEN": "${GITHUB_TOKEN}"
  }
}
```

### Common Environment Variables

| Variable             | Purpose             | Provider     |
| -------------------- | ------------------- | ------------ |
| `OPENAI_API_KEY`     | OpenAI API access   | OpenAI       |
| `ANTHROPIC_API_KEY`  | Anthropic API       | Anthropic    |
| `BRAVE_API_KEY`      | Web search          | Brave Search |
| `ELEVENLABS_API_KEY` | Text-to-speech      | ElevenLabs   |
| `DEEPGRAM_API_KEY`   | Speech-to-text      | Deepgram     |
| `OPENROUTER_API_KEY` | Multi-model routing | OpenRouter   |
| `GITHUB_TOKEN`       | GitHub API          | GitHub       |
| `LATE_API_KEY`       | Analytics           | Late.dev     |

### Decision Tree: API Key Management

```
Do you need API keys for external services?
├─ Yes, single user
│  └─ Store in ~/.claude/settings.json → env
├─ Yes, team project
│  └─ Use ${VAR} references → Store in shell profile
├─ CI/CD pipeline
│  └─ Use environment secrets → Inject at runtime
└─ No external services
   └─ Omit env section
```

---

## Permissions System

**Purpose:** Control automatic approval vs manual confirmation for tools and bash commands.

### Structure

```json
{
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Write", "..."],
      "bashPatterns": ["^git status", "..."]
    },
    "requireConfirmation": {
      "bashPatterns": ["\\brm\\b.*-rf", "..."]
    }
  }
}
```

### autoApprove.tools

**Type:** `string[]`
**Purpose:** Tools that execute without user confirmation.

**Common Patterns:**

```json
{
  "tools": [
    "Read", // Always safe
    "Glob", // Read-only
    "Grep", // Read-only
    "Edit", // Requires existing file read
    "Write", // CAUTION: Can overwrite
    "Bash", // CAUTION: Depends on bashPatterns
    "Skill", // Custom skill invocation
    "Task*", // Task management tools
    "mcp__*__*" // MCP server wildcard
  ]
}
```

**Decision Tree:**

```
How much do you trust Claude Code?
├─ Full trust (experienced user)
│  └─ Auto-approve: Read, Glob, Grep, Edit, Write, Skill, Task*, mcp__*
├─ Moderate trust
│  └─ Auto-approve: Read, Glob, Grep, Edit, Skill
│  └─ Confirm: Write, Bash, Task*
├─ Low trust (learning)
│  └─ Auto-approve: Read, Glob, Grep
│  └─ Confirm: Everything else
└─ Paranoid (critical systems)
   └─ Auto-approve: None
   └─ Confirm: Everything
```

### autoApprove.bashPatterns

**Type:** `string[]` (regex patterns)
**Purpose:** Bash commands that execute without confirmation.

**Safe Patterns:**

```json
{
  "bashPatterns": [
    "^(ls|cat|head|tail|grep|find|wc|echo|pwd)\\b",
    "^git (status|log|diff|show|branch)",
    "^(pnpm|npm) (?!.*uninstall)",
    "^sqlite3 .* \"SELECT",
    "^curl -s"
  ]
}
```

**Pattern Explanation:**

- `^` - Start of command (prevents `rm -rf && ls` from matching `^ls`)
- `\\b` - Word boundary (prevents false matches)
- `(?!.*uninstall)` - Negative lookahead (exclude destructive ops)

**Decision Tree:**

```
What operations are safe to auto-approve?
├─ Read-only commands (ls, cat, grep)
│  └─ Safe: Always auto-approve
├─ Version control reads (git status, diff)
│  └─ Safe: Auto-approve
├─ Package manager installs
│  └─ Risk: Medium (check for (?!.*uninstall))
├─ File writes (>, >>)
│  └─ Risk: High (require confirmation)
└─ System commands (sudo, kill)
   └─ Risk: Critical (ALWAYS require confirmation)
```

### requireConfirmation.bashPatterns

**Type:** `string[]` (regex patterns)
**Purpose:** Bash commands that ALWAYS require manual confirmation.

**Recommended Patterns:**

```json
{
  "bashPatterns": [
    "\\brm\\b.*(-rf|-fr|--recursive)",
    "\\bgit\\b.*(push.*--force|reset.*--hard|clean -f)",
    "\\b(sudo|doas)\\b",
    "\\bkill\\b.*-9",
    "\\bdropdb\\b",
    "\\btruncate\\b",
    ">(>|&)",
    "\\|\\s*sh\\b"
  ]
}
```

**Pattern Categories:**

1. **Destructive file operations:** `rm -rf`, `truncate`
2. **Destructive git operations:** `push --force`, `reset --hard`
3. **Elevated privileges:** `sudo`, `doas`
4. **Process termination:** `kill -9`
5. **Database drops:** `dropdb`, `DROP TABLE`
6. **Piped execution:** `curl | sh`, `wget | bash`

**Critical:** Always include these patterns. Removing them risks data loss.

---

## Hooks Configuration

See [HOOKS-PLAYBOOK.md](./HOOKS-PLAYBOOK.md) for detailed hook documentation.

**Quick Reference:**

| Hook Type          | When Triggered       | Typical Use                       |
| ------------------ | -------------------- | --------------------------------- |
| `SessionStart`     | New session begins   | Load context, check updates       |
| `UserPromptSubmit` | User sends message   | Log prompts, track analytics      |
| `PostToolUse`      | After tool execution | Auto-ingest files, monitor GSD    |
| `Stop`             | User hits Stop       | Quality checks, cleanup           |
| `SessionEnd`       | Session terminates   | Extract learnings, backup         |
| `TeammateIdle`     | Agent teammate idles | Notify, reassign work             |
| `TaskCompleted`    | Task marked done     | Log completion, trigger workflows |

**Example:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/startup.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

---

## Status Line

**Purpose:** Display dynamic status information at the bottom of Claude Code UI.

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/statusline.js"
  }
}
```

**Use Cases:**

- Show current GSD project + phase
- Display active timers
- Show git branch + status
- Display system metrics
- Show API quota usage

**Decision Tree:**

```
Do you use GSD for project management?
├─ Yes
│  └─ Use GSD statusline (shows project/phase/progress)
├─ No, but want git info
│  └─ Create custom statusline with git status
├─ No, but want metrics
│  └─ Create custom statusline with system info
└─ No status needed
   └─ Omit statusLine config
```

---

## Plugins

**Purpose:** Enable official and community plugins for extended functionality.

```json
{
  "enabledPlugins": {
    "swift-lsp@claude-plugins-official": true,
    "superpowers@superpowers-marketplace": true
  }
}
```

**Official Plugins:**

- `swift-lsp@claude-plugins-official` - Swift language support
- `typescript-lsp@claude-plugins-official` - TypeScript language support

**Community Plugins:**

- `superpowers@superpowers-marketplace` - Enhanced workflows (TDD, debugging, planning)

**Decision Tree:**

```
What languages/workflows do you use?
├─ Swift development
│  └─ Enable: swift-lsp@claude-plugins-official
├─ TypeScript/JavaScript
│  └─ Enable: typescript-lsp@claude-plugins-official
├─ Need structured workflows (TDD, debugging, planning)
│  └─ Enable: superpowers@superpowers-marketplace
└─ Minimal setup
   └─ Omit or disable plugins
```

---

## Decision Trees

### Complete Configuration Decision Tree

```
What's your use case?
├─ Personal AI development assistant
│  ├─ Enable: alwaysThinkingEnabled, extended hooks
│  ├─ Model: sonnet[1m] or opus
│  └─ Permissions: Full auto-approve
│
├─ Team development project
│  ├─ Use: settings.local.json (not settings.json)
│  ├─ Model: sonnet (balanced)
│  ├─ Permissions: Moderate auto-approve
│  └─ Env: Use ${VAR} references
│
├─ Learning/experimenting
│  ├─ Model: haiku or sonnet
│  ├─ Permissions: Minimal auto-approve
│  └─ Update channel: stable
│
└─ Critical production systems
   ├─ Model: opus (highest quality)
   ├─ Permissions: Almost nothing auto-approved
   ├─ Hooks: Extensive validation hooks
   └─ Update channel: stable (manual updates)
```

### Hook Configuration Decision Tree

```
When should I add hooks?
├─ Want automated workflows?
│  └─ SessionStart: Load context
│  └─ PostToolUse: Auto-ingest to KB
│  └─ SessionEnd: Extract learnings
│
├─ Need quality gates?
│  └─ Stop: Run linters, tests
│  └─ PostToolUse(Write): Validate syntax
│
├─ Team collaboration?
│  └─ TeammateIdle: Notify lead
│  └─ TaskCompleted: Update project tracker
│
└─ Minimal overhead?
   └─ Skip hooks (or only critical ones)
```

### Permission Configuration Decision Tree

```
What should I auto-approve?
├─ Read-only operations
│  └─ Always safe: Read, Glob, Grep
│  └─ Safe bash: ls, cat, git status
│
├─ Non-destructive writes
│  └─ Medium risk: Edit (requires prior read)
│  └─ Higher risk: Write (can overwrite)
│
├─ External API calls
│  └─ Risk depends on service
│  └─ Consider: Rate limits, cost
│
└─ Destructive operations
   └─ NEVER auto-approve: rm -rf, git push --force, sudo
```

---

## Configuration Examples

### Minimal Configuration

```json
{
  "model": "sonnet",
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep"]
    }
  }
}
```

### Balanced Configuration (Recommended)

```json
{
  "cleanupPeriodDays": 14,
  "model": "sonnet[1m]",
  "alwaysThinkingEnabled": false,
  "autoUpdatesChannel": "stable",
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep", "Edit", "Skill"],
      "bashPatterns": [
        "^(ls|cat|head|tail|grep|find|wc|echo|pwd)\\b",
        "^git (status|log|diff|show|branch)"
      ]
    },
    "requireConfirmation": {
      "bashPatterns": [
        "\\brm\\b.*(-rf|-fr)",
        "\\bgit\\b.*(push.*--force|reset.*--hard)",
        "\\b(sudo|doas)\\b"
      ]
    }
  }
}
```

### Power User Configuration

```json
{
  "cleanupPeriodDays": 30,
  "model": "opus",
  "alwaysThinkingEnabled": true,
  "autoUpdatesChannel": "beta",
  "env": {
    "OPENAI_API_KEY": "${OPENAI_API_KEY}",
    "BRAVE_API_KEY": "${BRAVE_API_KEY}"
  },
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep", "Edit", "Write", "Skill", "Task*", "mcp__*"],
      "bashPatterns": [
        "^(ls|cat|head|tail|grep|find|wc|echo|pwd)\\b",
        "^git (status|log|diff|show|branch|remote)",
        "^(pnpm|npm|bun|node|python) (?!.*uninstall)",
        "^sqlite3 .* \"SELECT"
      ]
    },
    "requireConfirmation": {
      "bashPatterns": [
        "\\brm\\b.*(-rf|-fr)",
        "\\bgit\\b.*(push.*--force|reset.*--hard|clean -f)",
        "\\b(sudo|doas)\\b",
        "\\bkill\\b.*-9"
      ]
    }
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/kb-context-inject.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/kb-auto-ingest.sh",
            "timeout": 15,
            "async": true
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/session-learnings.sh",
            "timeout": 15,
            "async": true
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/hooks/gsd-statusline.js"
  },
  "enabledPlugins": {
    "superpowers@superpowers-marketplace": true
  }
}
```

---

## Troubleshooting

### Configuration Not Loading

**Symptoms:** Changes to `settings.json` not taking effect.

**Solutions:**

1. Restart Claude Code completely (quit and reopen)
2. Check JSON syntax: `python -m json.tool ~/.claude/settings.json`
3. Check file permissions: `ls -la ~/.claude/settings.json`
4. Check for conflicting `settings.local.json` in project

### Hooks Not Firing

**Symptoms:** Hook scripts not executing.

**Solutions:**

1. Check hook file permissions: `chmod +x ~/.claude/hooks/*.sh`
2. Test hook script manually: `bash ~/.claude/hooks/script.sh`
3. Check hook timeout (increase if needed)
4. Check Claude Code logs for errors

### Permission Issues

**Symptoms:** Getting unexpected confirmation prompts or auto-approvals.

**Solutions:**

1. Check regex patterns: Test with https://regex101.com
2. Verify pattern order (more specific patterns first)
3. Check for conflicting patterns
4. Test pattern: `echo "git push --force" | grep -E "\\bgit\\b.*push.*--force"`

---

## See Also

- [HOOKS-PLAYBOOK.md](./HOOKS-PLAYBOOK.md) - Comprehensive hook documentation
- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills management and development
- [MCP-SERVERS.md](./MCP-SERVERS.md) - MCP server configuration
- [KEYBINDINGS-GUIDE.md](./KEYBINDINGS-GUIDE.md) - Keybinding setup
- [BEST-PRACTICES.md](./BEST-PRACTICES.md) - Configuration best practices
