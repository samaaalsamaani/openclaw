# Keybindings Setup Guide

Complete guide to configuring custom keybindings for Claude Code workflows.

## Quick Navigation

- [Keybinding Basics](#keybinding-basics)
- [Recommended Keybindings](#recommended-keybindings)
- [Chord Sequences](#chord-sequences)
- [Context-Aware Bindings](#context-aware-bindings)
- [Custom Actions](#custom-actions)
- [Troubleshooting](#troubleshooting)

## Keybinding Basics

### What Are Keybindings?

**Keybindings** allow you to trigger Claude Code commands and skills using keyboard shortcuts instead of typing commands.

### Configuration Location

**macOS/Linux:** `~/.claude/keybindings.json`
**Windows:** `%USERPROFILE%\.claude\keybindings.json`

### Basic Structure

```json
{
  "keybindings": [
    {
      "key": "cmd+k cmd+b",
      "command": "skill:kb",
      "when": "editorFocus"
    }
  ]
}
```

### Field Reference

| Field     | Type   | Required | Purpose                                   |
| --------- | ------ | -------- | ----------------------------------------- |
| `key`     | string | Yes      | Keyboard shortcut (modifier+key or chord) |
| `command` | string | Yes      | Action to execute                         |
| `when`    | string | No       | Context condition (when to enable)        |
| `args`    | object | No       | Arguments passed to command               |

---

## Recommended Keybindings

### Essential Skills

```json
{
  "keybindings": [
    {
      "key": "cmd+k cmd+k",
      "command": "skill:kb",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+h",
      "command": "skill:health",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+c",
      "command": "skill:capture",
      "when": "editorFocus",
      "args": {
        "clipboardUrl": true
      }
    },
    {
      "key": "cmd+k cmd+t",
      "command": "skill:trace",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+p",
      "command": "skill:post",
      "when": "editorFocus"
    }
  ]
}
```

**Mnemonic:**

- `k` = Knowledge Base
- `h` = Health check
- `c` = Capture
- `t` = Trace (observability)
- `p` = Post (content creation)

---

### Development Workflows

```json
{
  "keybindings": [
    {
      "key": "cmd+k cmd+r",
      "command": "skill:codex-review",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+d",
      "command": "skill:superpowers:systematic-debugging",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+v",
      "command": "skill:superpowers:verification-before-completion",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+b",
      "command": "skill:superpowers:brainstorming",
      "when": "editorFocus"
    }
  ]
}
```

**Mnemonic:**

- `r` = Review (code)
- `d` = Debug
- `v` = Verify
- `b` = Brainstorm

---

### GSD (Get Stuff Done)

```json
{
  "keybindings": [
    {
      "key": "cmd+g cmd+n",
      "command": "skill:gsd:new-project",
      "when": "editorFocus"
    },
    {
      "key": "cmd+g cmd+p",
      "command": "skill:gsd:plan-phase",
      "when": "editorFocus"
    },
    {
      "key": "cmd+g cmd+e",
      "command": "skill:gsd:execute-phase",
      "when": "editorFocus"
    },
    {
      "key": "cmd+g cmd+v",
      "command": "skill:gsd:verify-work",
      "when": "editorFocus"
    },
    {
      "key": "cmd+g cmd+s",
      "command": "skill:gsd:progress",
      "when": "editorFocus"
    }
  ]
}
```

**Mnemonic:**

- `g` prefix = GSD namespace
- `n` = New project
- `p` = Plan phase
- `e` = Execute phase
- `v` = Verify work
- `s` = Status/progress

---

### Quick Actions

```json
{
  "keybindings": [
    {
      "key": "cmd+shift+k",
      "command": "claude.clearContext",
      "when": "editorFocus"
    },
    {
      "key": "cmd+shift+h",
      "command": "claude.showHistory",
      "when": "editorFocus"
    },
    {
      "key": "cmd+shift+p",
      "command": "claude.showSkills",
      "when": "editorFocus"
    },
    {
      "key": "cmd+shift+m",
      "command": "claude.showMcpTools",
      "when": "editorFocus"
    }
  ]
}
```

**Mnemonic:**

- `shift+k` = Clear context (kill)
- `shift+h` = History
- `shift+p` = Palette (skills)
- `shift+m` = MCP tools

---

### Navigation

```json
{
  "keybindings": [
    {
      "key": "cmd+k cmd+up",
      "command": "claude.previousMessage",
      "when": "chatFocus"
    },
    {
      "key": "cmd+k cmd+down",
      "command": "claude.nextMessage",
      "when": "chatFocus"
    },
    {
      "key": "cmd+k cmd+left",
      "command": "claude.previousSession",
      "when": "chatFocus"
    },
    {
      "key": "cmd+k cmd+right",
      "command": "claude.nextSession",
      "when": "chatFocus"
    }
  ]
}
```

---

## Chord Sequences

### What Are Chords?

**Chords** are multi-key sequences (like `cmd+k cmd+b`) that reduce conflicts with existing shortcuts.

### Syntax

```json
{
  "key": "modifier+key1 modifier+key2"
}
```

**Examples:**

- `cmd+k cmd+b` - Press `cmd+k`, release, then press `cmd+b`
- `ctrl+x ctrl+s` - Emacs-style chord
- `cmd+k h` - Press `cmd+k`, release, then press `h` (no modifier)

### Recommended Chord Prefixes

| Prefix  | Purpose         | Example                    |
| ------- | --------------- | -------------------------- |
| `cmd+k` | Claude commands | `cmd+k cmd+k` (KB search)  |
| `cmd+g` | GSD workflows   | `cmd+g cmd+p` (plan phase) |
| `cmd+t` | Task management | `cmd+t cmd+n` (new task)   |
| `cmd+m` | MCP tools       | `cmd+m cmd+k` (KB MCP)     |

### Benefits

1. **No conflicts** - Unlikely to override existing shortcuts
2. **Namespaced** - Group related commands under prefix
3. **Memorable** - Mnemonic second key (k=knowledge, h=health)
4. **Discoverable** - First key shows available commands

---

## Context-Aware Bindings

### When Clauses

**Purpose:** Enable keybinding only in specific contexts.

**Common contexts:**

- `editorFocus` - Editor has focus
- `chatFocus` - Chat window has focus
- `terminalFocus` - Terminal has focus
- `debugMode` - In debug mode
- `taskRunning` - Task is executing

### Examples

```json
{
  "keybindings": [
    {
      "key": "cmd+k cmd+k",
      "command": "skill:kb",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+k",
      "command": "skill:kb-chat",
      "when": "chatFocus"
    }
  ]
}
```

**Same key, different contexts** → Different actions.

### Advanced Conditions

**Combine with logical operators:**

```json
{
  "when": "editorFocus && !debugMode"
}
```

```json
{
  "when": "chatFocus || editorFocus"
}
```

```json
{
  "when": "editorFocus && taskRunning"
}
```

### Available Contexts

| Context               | When Active                   |
| --------------------- | ----------------------------- |
| `editorFocus`         | Editor window has focus       |
| `chatFocus`           | Chat window has focus         |
| `terminalFocus`       | Integrated terminal has focus |
| `debugMode`           | Debug session active          |
| `taskRunning`         | Background task executing     |
| `hasSelection`        | Text is selected              |
| `clipboardHasContent` | Clipboard not empty           |

---

## Custom Actions

### Skill Invocation

```json
{
  "key": "cmd+k cmd+k",
  "command": "skill:kb",
  "args": {
    "query": "recent captures"
  }
}
```

### MCP Tool Invocation

```json
{
  "key": "cmd+m cmd+s",
  "command": "mcp:knowledge-base:kb_stats"
}
```

### Command Palette

```json
{
  "key": "cmd+shift+p",
  "command": "claude.showCommandPalette"
}
```

### Insert Snippet

```json
{
  "key": "cmd+k cmd+s",
  "command": "editor.insertSnippet",
  "args": {
    "snippet": "Use mcp__knowledge-base__kb_query with query \"$1\""
  }
}
```

### Run Shell Command

```json
{
  "key": "cmd+k cmd+t",
  "command": "shell.execute",
  "args": {
    "command": "pnpm test",
    "showOutput": true
  }
}
```

---

## Complete Configuration Example

```json
{
  "keybindings": [
    // === Knowledge Base ===
    {
      "key": "cmd+k cmd+k",
      "command": "skill:kb",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+c",
      "command": "skill:capture",
      "when": "editorFocus"
    },

    // === System ===
    {
      "key": "cmd+k cmd+h",
      "command": "skill:health",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+t",
      "command": "skill:trace",
      "when": "editorFocus"
    },

    // === Development ===
    {
      "key": "cmd+k cmd+r",
      "command": "skill:codex-review",
      "when": "editorFocus && hasSelection"
    },
    {
      "key": "cmd+k cmd+d",
      "command": "skill:superpowers:systematic-debugging",
      "when": "editorFocus"
    },
    {
      "key": "cmd+k cmd+v",
      "command": "skill:superpowers:verification-before-completion",
      "when": "editorFocus"
    },

    // === GSD ===
    {
      "key": "cmd+g cmd+n",
      "command": "skill:gsd:new-project",
      "when": "editorFocus"
    },
    {
      "key": "cmd+g cmd+p",
      "command": "skill:gsd:plan-phase",
      "when": "editorFocus"
    },
    {
      "key": "cmd+g cmd+e",
      "command": "skill:gsd:execute-phase",
      "when": "editorFocus"
    },

    // === Quick Actions ===
    {
      "key": "cmd+shift+k",
      "command": "claude.clearContext",
      "when": "editorFocus"
    },
    {
      "key": "cmd+shift+h",
      "command": "claude.showHistory",
      "when": "editorFocus"
    },

    // === Navigation ===
    {
      "key": "cmd+k cmd+up",
      "command": "claude.previousMessage",
      "when": "chatFocus"
    },
    {
      "key": "cmd+k cmd+down",
      "command": "claude.nextMessage",
      "when": "chatFocus"
    }
  ]
}
```

---

## Platform-Specific Modifiers

### macOS

```json
{
  "key": "cmd+k" // Command key
}
```

### Windows/Linux

```json
{
  "key": "ctrl+k" // Control key
}
```

### Cross-Platform

Use conditional configuration:

```json
{
  "keybindings": [
    {
      "key": "cmd+k cmd+k",
      "command": "skill:kb",
      "when": "isMac"
    },
    {
      "key": "ctrl+k ctrl+k",
      "command": "skill:kb",
      "when": "isWindows || isLinux"
    }
  ]
}
```

---

## Modifier Keys

| Key        | macOS   | Windows/Linux |
| ---------- | ------- | ------------- |
| Command    | `cmd`   | N/A           |
| Control    | `ctrl`  | `ctrl`        |
| Option/Alt | `alt`   | `alt`         |
| Shift      | `shift` | `shift`       |

### Combinations

```json
{
  "key": "cmd+shift+k" // Command + Shift + K
}
```

```json
{
  "key": "ctrl+alt+t" // Control + Alt + T
}
```

---

## Troubleshooting

### Keybinding Not Working

**Symptoms:** Key pressed but nothing happens.

**Solutions:**

1. Check keybindings.json syntax:

   ```bash
   python -m json.tool ~/.claude/keybindings.json
   ```

2. Verify key format (lowercase modifiers):
   - Correct: `cmd+k`
   - Wrong: `Cmd+K` or `CMD+k`

3. Check for conflicts:
   - System shortcuts take precedence
   - Application shortcuts take precedence
   - Check macOS System Preferences → Keyboard → Shortcuts

4. Verify context (`when` clause):
   - Is editor focused?
   - Is condition met?

5. Restart Claude Code

---

### Chord Not Triggering

**Symptoms:** First key works but chord doesn't complete.

**Solutions:**

1. Check chord timeout (should be < 1 second between keys)

2. Verify chord syntax:
   - Correct: `cmd+k cmd+b`
   - Wrong: `cmd+k+b` or `cmd+k, cmd+b`

3. Test first key alone:

   ```json
   {
     "key": "cmd+k",
     "command": "claude.showChordHints"
   }
   ```

4. Check for first-key conflicts

---

### Context Not Matching

**Symptoms:** Keybinding works in some contexts but not others.

**Solutions:**

1. Verify `when` clause:

   ```json
   {
     "when": "editorFocus"
   }
   ```

2. Test without `when` clause (to isolate issue)

3. Check available contexts:
   - Use `cmd+shift+i` to inspect context
   - Check Claude Code documentation

4. Use logical operators correctly:
   - AND: `&&`
   - OR: `||`
   - NOT: `!`

---

### Skill Not Found

**Symptoms:** Keybinding triggers but shows "Skill not found" error.

**Solutions:**

1. Check skill name matches:
   - Correct: `skill:kb`
   - Wrong: `skill:knowledge-base`

2. Verify skill is installed:

   ```bash
   ls ~/.claude/skills/kb/SKILL.md
   ```

3. Test skill manually:

   ```
   /kb test query
   ```

4. Check skill name in SKILL.md frontmatter:
   ```yaml
   name: kb
   ```

---

## Best Practices

### Naming Conventions

1. **Use chord prefixes** for namespacing (cmd+k, cmd+g)
2. **Mnemonic second keys** (k=knowledge, h=health)
3. **Consistent across projects** (same shortcuts everywhere)

### Avoiding Conflicts

1. **Check system shortcuts** (macOS System Preferences)
2. **Check app shortcuts** (Claude Code defaults)
3. **Use chord sequences** (less likely to conflict)
4. **Document your choices** (comment in JSON)

### Organization

```json
{
  "keybindings": [
    // === Knowledge Base ===
    { "key": "cmd+k cmd+k", "command": "skill:kb" },

    // === System ===
    { "key": "cmd+k cmd+h", "command": "skill:health" },

    // === Development ===
    { "key": "cmd+k cmd+r", "command": "skill:codex-review" }
  ]
}
```

**Group by category, add comments.**

### Discoverability

1. **Print reference card** (see QUICK-REFERENCE.md)
2. **Add hints to skills** (mention keybinding in SKILL.md)
3. **Use command palette** (cmd+shift+p) to discover commands
4. **Document in README** (share with team)

---

## See Also

- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Full configuration reference
- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills management
- [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) - Quick reference card
- [BEST-PRACTICES.md](./BEST-PRACTICES.md) - Configuration best practices
