# Claude Code Configuration Best Practices

Comprehensive guide to maintaining, securing, optimizing, and avoiding pitfalls in Claude Code configuration.

## Quick Navigation

- [Maintenance](#maintenance)
- [Security](#security)
- [Performance](#performance)
- [Common Pitfalls](#common-pitfalls)
- [Team Collaboration](#team-collaboration)
- [Version Control](#version-control)

---

## Maintenance

### Regular Reviews

**Quarterly review checklist:**

1. **Permissions audit**
   - Review auto-approved tools
   - Check bash patterns for security holes
   - Remove unused permissions

2. **Hook inventory**
   - Verify all hooks still needed
   - Check for performance issues
   - Update hook scripts for new features

3. **Skill cleanup**
   - Archive unused skills
   - Update outdated workflows
   - Document new skills

4. **MCP server health**
   - Test all MCP tools
   - Update server versions
   - Remove deprecated servers

**Example review script:**

```bash
#!/bin/bash
# ~/.claude/maintenance/quarterly-review.sh

echo "=== Claude Code Configuration Review ==="

echo -e "\n1. Checking hooks..."
find ~/.claude/hooks -name "*.sh" -mtime +90
echo "   ^ Hooks not modified in 90+ days (review for deprecation)"

echo -e "\n2. Checking skills..."
for skill in ~/.claude/skills/*/; do
  if [ ! -f "$skill/SKILL.md" ]; then
    echo "   WARN: $skill missing SKILL.md"
  fi
done

echo -e "\n3. Testing MCP servers..."
for server in knowledge-base macos-system observability; do
  echo -n "   $server: "
  ps aux | grep -q "mcp-server.*$server" && echo "✓ running" || echo "✗ down"
done

echo -e "\n4. Configuration backup..."
tar -czf ~/.claude/backups/config-$(date +%Y%m%d).tar.gz \
  ~/.claude/settings.json \
  ~/.claude/.mcp.json \
  ~/.claude/hooks/ \
  ~/.claude/skills/ 2>/dev/null
echo "   Backup saved to ~/.claude/backups/"
```

---

### Cleanup Strategies

#### Session History

**Default:** 14-day cleanup
**Recommendation:** Adjust based on disk space and session frequency

```json
{
  "cleanupPeriodDays": 14
}
```

**Decision tree:**

```
How much disk space do you have?
├─ Abundant (>100GB free)
│  └─ cleanupPeriodDays: 30 (keep more history)
├─ Normal (20-100GB free)
│  └─ cleanupPeriodDays: 14 (default)
├─ Constrained (<20GB free)
│  └─ cleanupPeriodDays: 7 (aggressive cleanup)
└─ Critical (<5GB free)
   └─ cleanupPeriodDays: 3 + manual cleanup
```

#### Manual cleanup:

```bash
# Remove old sessions (older than 30 days)
find ~/.claude/agents/*/sessions -name "*.jsonl" -mtime +30 -delete

# Remove cache
rm -rf ~/.claude/cache/*

# Remove old backups
find ~/.claude/backups -name "*.tar.gz" -mtime +90 -delete
```

---

### Backup Strategy

**What to backup:**

```bash
#!/bin/bash
# ~/.claude/maintenance/backup.sh

BACKUP_DIR="$HOME/.claude/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

tar -czf "$BACKUP_DIR/claude-config-$TIMESTAMP.tar.gz" \
  "$HOME/.claude/settings.json" \
  "$HOME/.claude/.mcp.json" \
  "$HOME/.claude/hooks/" \
  "$HOME/.claude/skills/" \
  "$HOME/.claude/keybindings.json" \
  2>/dev/null

echo "Backup saved: $BACKUP_DIR/claude-config-$TIMESTAMP.tar.gz"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/claude-config-*.tar.gz | tail -n +11 | xargs rm -f
```

**Schedule with cron:**

```bash
# Backup weekly (Sunday 3am)
0 3 * * 0 bash ~/.claude/maintenance/backup.sh
```

---

### Update Management

**Plugin updates:**

```json
{
  "autoUpdatesChannel": "stable"
}
```

**Recommendations:**

- Production: `"stable"` (test updates before deploying)
- Personal: `"stable"` or `"beta"` (your choice)
- Development: `"beta"` (early access to features)
- Contributor: `"dev"` (bleeding edge, may break)

**Update checklist:**

1. Backup configuration
2. Read changelog
3. Test in isolated session
4. Monitor for issues
5. Roll back if needed

**Rollback procedure:**

```bash
# Restore from backup
tar -xzf ~/.claude/backups/claude-config-YYYYMMDD-HHMMSS.tar.gz -C ~/

# Restart Claude Code
killall "Claude Code"
open -a "Claude Code"
```

---

## Security

### API Key Management

**NEVER commit API keys to git.**

**Good patterns:**

1. **Use environment references:**

   ```json
   {
     "env": {
       "OPENAI_API_KEY": "${OPENAI_API_KEY}"
     }
   }
   ```

2. **Store in shell profile:**

   ```bash
   # ~/.zshrc
   export OPENAI_API_KEY="sk-..."
   ```

3. **Use macOS Keychain:**

   ```bash
   # Store
   security add-generic-password -a "$USER" -s "openai-api-key" -w "sk-..."

   # Retrieve in hook
   KEY=$(security find-generic-password -a "$USER" -s "openai-api-key" -w)
   ```

4. **Use 1Password CLI:**
   ```bash
   # In hook
   export OPENAI_API_KEY=$(op read "op://vault/openai/credential")
   ```

**Bad patterns:**

```json
// ❌ NEVER DO THIS
{
  "env": {
    "OPENAI_API_KEY": "sk-proj-actual-key-here"
  }
}
```

---

### Permission Boundaries

**Principle of least privilege:**

Start restrictive, expand as needed.

**Example progression:**

```json
// Stage 1: Learning (very restrictive)
{
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep"]
    }
  }
}

// Stage 2: Development (moderate)
{
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep", "Edit", "Skill"],
      "bashPatterns": [
        "^(ls|cat|grep|git status)\\b"
      ]
    }
  }
}

// Stage 3: Production (full trust)
{
  "permissions": {
    "autoApprove": {
      "tools": ["Read", "Glob", "Grep", "Edit", "Write", "Skill", "Task*", "mcp__*"],
      "bashPatterns": [
        "^(ls|cat|grep|git|pnpm|node)\\b"
      ]
    },
    "requireConfirmation": {
      "bashPatterns": [
        "\\brm\\b.*-rf",
        "\\bgit\\b.*(push.*--force|reset.*--hard)",
        "\\bsudo\\b"
      ]
    }
  }
}
```

---

### Dangerous Patterns to Avoid

**❌ Never auto-approve destructive operations:**

```json
{
  "requireConfirmation": {
    "bashPatterns": [
      "\\brm\\b.*(-rf|-fr|--recursive)",
      "\\bgit\\b.*(push.*--force|reset.*--hard|clean -f)",
      "\\b(sudo|doas)\\b",
      "\\bkill\\b.*-9",
      "\\b(dropdb|drop table|truncate)\\b",
      ">(>|&)",
      "\\|\\s*sh\\b",
      "curl.*\\|.*bash"
    ]
  }
}
```

**❌ Never wildcard everything:**

```json
// Too permissive
{
  "bashPatterns": [".*"]
}
```

**❌ Never disable git safety:**

```json
// Too dangerous
{
  "bashPatterns": [
    "^git .*" // Includes push --force, reset --hard, etc.
  ]
}
```

---

### Audit Logging

**Log sensitive operations:**

```bash
#!/bin/bash
# Hook: log-sensitive-ops.sh

INPUT=$(cat)
TOOL=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))")

# Log to audit file
AUDIT_LOG="$HOME/.claude/audit.log"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Tool: $TOOL" >> "$AUDIT_LOG"

exit 0
```

**Add to settings.json:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/log-sensitive-ops.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

---

## Performance

### Hook Performance

**Measure hook execution time:**

```bash
#!/bin/bash
# Add to top of hook script

START_TIME=$(date +%s%N)

# ... hook logic ...

END_TIME=$(date +%s%N)
ELAPSED=$((($END_TIME - $START_TIME) / 1000000))  # Convert to milliseconds

if [ $ELAPSED -gt 5000 ]; then
  echo "WARN: Hook took ${ELAPSED}ms" >> ~/.claude/performance.log
fi
```

**Optimization strategies:**

1. **Use async for non-critical hooks**

   ```json
   {
     "async": true
   }
   ```

2. **Cache expensive operations**

   ```bash
   CACHE_FILE="/tmp/kb-cache-$(date +%Y%m%d).json"
   if [ -f "$CACHE_FILE" ]; then
     cat "$CACHE_FILE"
   else
     node query.js > "$CACHE_FILE"
     cat "$CACHE_FILE"
   fi
   ```

3. **Increase timeout for slow operations**

   ```json
   {
     "timeout": 30
   }
   ```

4. **Move heavy work to background**
   ```bash
   # Spawn background process
   (heavy_operation &)
   ```

---

### MCP Server Performance

**Optimize database queries:**

```javascript
// ❌ Slow: N+1 queries
for (const item of items) {
  const details = await db.get("SELECT * FROM details WHERE id = ?", item.id);
  results.push({ ...item, ...details });
}

// ✅ Fast: Single query
const results = await db.all(`
  SELECT items.*, details.*
  FROM items
  LEFT JOIN details ON items.id = details.id
`);
```

**Cache expensive operations:**

```javascript
const cache = new Map();

server.tool("expensive_operation", async (params) => {
  const cacheKey = JSON.stringify(params);

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const result = await expensiveComputation(params);
  cache.set(cacheKey, result);

  return result;
});
```

**Limit result sizes:**

```javascript
// ❌ Returns 10MB of data
const results = await db.all("SELECT * FROM articles");

// ✅ Returns top 100 with summary only
const results = await db.all(`
  SELECT id, title, summary
  FROM articles
  ORDER BY created_at DESC
  LIMIT 100
`);
```

---

### Configuration Size

**Keep settings.json manageable:**

**Good (< 500 lines):**

- Easy to read
- Fast to parse
- Simple to maintain

**Too large (> 1000 lines):**

- Hard to navigate
- Slow to load
- Error-prone

**Solution: Split into modules**

```bash
# Main config
~/.claude/settings.json

# Additional configs
~/.claude/settings.local.json
~/.claude/projects/my-project/settings.json
```

**Use includes (if supported):**

```json
{
  "includes": ["~/.claude/settings.local.json"]
}
```

---

## Common Pitfalls

### Pitfall 1: Hook Infinite Loops

**Problem:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node auto-format.js" // Triggers Write → Hook → Write → ...
          }
        ]
      }
    ]
  }
}
```

**Solution:** Add loop prevention

```bash
#!/bin/bash
# auto-format.sh

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))")

# Check if file was already formatted
if grep -q "// AUTO-FORMATTED" "$FILE"; then
  exit 0  # Prevent loop
fi

# Format and mark
prettier --write "$FILE"
echo "// AUTO-FORMATTED" >> "$FILE"

exit 0
```

---

### Pitfall 2: Regex Catastrophic Backtracking

**Problem:**

```json
{
  "bashPatterns": [
    "^(ls|cat|grep|find|wc|echo|pwd|.*)+$" // Catastrophic backtracking
  ]
}
```

**Solution:** Use specific patterns

```json
{
  "bashPatterns": [
    "^(ls|cat|grep|find|wc|echo|pwd)\\b" // Specific, no backtracking
  ]
}
```

**Test regex performance:**

```bash
echo "ls -la /very/long/path/here" | grep -E "^(ls|cat|grep|find|wc|echo|pwd)\\b"
time grep -E "pattern" <<< "test string"
```

---

### Pitfall 3: Unquoted Variables in Bash

**Problem:**

```bash
#!/bin/bash
FILE_PATH=$1
rm -rf $FILE_PATH  # DANGEROUS: What if FILE_PATH="/ *"?
```

**Solution:** Always quote variables

```bash
#!/bin/bash
FILE_PATH="$1"

# Validate before use
if [ -z "$FILE_PATH" ]; then
  echo "Error: FILE_PATH is empty"
  exit 1
fi

rm -rf "$FILE_PATH"
```

---

### Pitfall 4: Hardcoded Paths

**Problem:**

```json
{
  "command": "bash /Users/john/.claude/hooks/script.sh"
}
```

**Solution:** Use environment variables

```json
{
  "command": "bash $HOME/.claude/hooks/script.sh"
}
```

Or use `~`:

```json
{
  "command": "bash ~/.claude/hooks/script.sh"
}
```

---

### Pitfall 5: Missing Error Handling

**Problem:**

```bash
#!/bin/bash
RESULT=$(dangerous_operation)
echo "Result: $RESULT"
exit 0
```

**Solution:** Check exit codes

```bash
#!/bin/bash
set -e  # Exit on error

if ! RESULT=$(dangerous_operation 2>&1); then
  echo "Error: Operation failed"
  echo "$RESULT" >&2
  exit 0  # Fail gracefully for hooks
fi

echo "Result: $RESULT"
exit 0
```

---

### Pitfall 6: Overly Aggressive Quality Gates

**Problem:**

```bash
#!/bin/bash
# Stop hook that blocks EVERYTHING

echo '{"ok": false, "reason": "Please review your work"}'
exit 0
```

**Solution:** Be specific

```bash
#!/bin/bash
LAST_MSG=$(tail -1 "$TRANSCRIPT")

if echo "$LAST_MSG" | grep -q "TODO.*implement"; then
  echo '{"ok": false, "reason": "Please complete TODOs"}'
  exit 0
fi

# Allow through
exit 0
```

---

## Team Collaboration

### Shared Configuration

**Use project-level config:**

```bash
# Repository structure
.claude/
├── settings.json         # Team-wide settings
├── skills/               # Shared skills
└── hooks/                # Shared hooks
```

**Gitignore pattern:**

```gitignore
# Exclude personal config
.claude/settings.local.json

# Include shared config
!.claude/settings.json
!.claude/skills/
!.claude/hooks/
```

---

### Configuration Layers

**Layer 1: User global** (`~/.claude/settings.json`)

- Personal preferences
- API keys
- Personal skills

**Layer 2: Project shared** (`.claude/settings.json`)

- Team permissions
- Shared skills
- Project hooks

**Layer 3: Project local** (`.claude/settings.local.json`)

- Personal overrides
- Local API keys
- Experimental features

**Merge order:**

```
User global → Project shared → Project local
```

---

### Documentation Standards

**README.md template:**

````markdown
# Claude Code Configuration

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
````

2. Configure API keys:

   ```bash
   cp .env.example .env
   # Edit .env with your keys
   ```

3. Initialize Claude config:
   ```bash
   bash scripts/setup-claude.sh
   ```

## Available Skills

- `/kb` - Search knowledge base
- `/health` - System health check
- `/capture` - Capture web content

## Hooks

- `SessionStart` - Load project context
- `PostToolUse(Write)` - Auto-format code

## Maintenance

- Update skills: `git pull origin main`
- Backup config: `bash scripts/backup-config.sh`

```

---

## Version Control

### Git Best Practices

**Commit message format:**

```

feat(claude): add KB context injection hook

- Queries knowledge base on session start
- Injects up to 3 relevant articles
- Limits to 16K chars to avoid context bloat

````

**Conventional commits:**
- `feat(claude):` - New feature
- `fix(claude):` - Bug fix
- `docs(claude):` - Documentation
- `refactor(claude):` - Refactoring
- `chore(claude):` - Maintenance

---

### Branching Strategy

**Feature branches:**

```bash
# Create feature branch
git checkout -b feature/add-capture-skill

# Make changes
vim .claude/skills/capture/SKILL.md

# Commit
git add .claude/skills/capture/
git commit -m "feat(claude): add capture skill for web content"

# Merge to main
git checkout main
git merge feature/add-capture-skill
````

**Hotfix branches:**

```bash
git checkout -b hotfix/fix-kb-hook-timeout
# Fix issue
git commit -m "fix(claude): increase KB hook timeout to 15s"
git checkout main
git merge hotfix/fix-kb-hook-timeout
```

---

### Code Review Checklist

**For configuration changes:**

- [ ] No hardcoded API keys
- [ ] No destructive operations auto-approved
- [ ] Regex patterns tested for performance
- [ ] Hook scripts have error handling
- [ ] Timeout values reasonable
- [ ] Documentation updated
- [ ] Team notified of breaking changes

**For hook changes:**

- [ ] Tested manually
- [ ] No infinite loops
- [ ] Proper input validation
- [ ] Graceful error handling
- [ ] Performance acceptable (< 5s for sync)
- [ ] Logs errors appropriately

**For skill changes:**

- [ ] YAML frontmatter valid
- [ ] Workflow documented
- [ ] Examples provided
- [ ] Tool permissions appropriate
- [ ] Tested with real data

---

## See Also

- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Full configuration reference
- [HOOKS-PLAYBOOK.md](./HOOKS-PLAYBOOK.md) - Hooks documentation
- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills management
- [MCP-SERVERS.md](./MCP-SERVERS.md) - MCP server configuration
- [KEYBINDINGS-GUIDE.md](./KEYBINDINGS-GUIDE.md) - Keybinding setup
- [QUICK-REFERENCE.md](./QUICK-REFERENCE.md) - Quick reference card
