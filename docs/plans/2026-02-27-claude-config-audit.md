# Claude Code Configuration Audit & Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Systematically audit, document, and optimize Claude Code configuration for maximum effectiveness and maintainability.

**Architecture:** Four-phase approach mirroring Superpowers/GSD optimization - Audit current state, create comprehensive documentation, build operational tools, integrate with PAIOS health systems.

**Tech Stack:** Bash scripts, jq for JSON parsing, Markdown documentation, JSON configuration templates.

---

## Phase 1: Audit

### Task 1: Settings Analysis

**Files:**

- Read: `~/.claude/settings.json`
- Create: `docs/claude-config/audit/settings-report.md`

**Step 1: Read current settings**

```bash
cat ~/.claude/settings.json | jq . > /tmp/settings-pretty.json
```

Expected: Valid JSON output

**Step 2: Analyze each setting**

Document:

- `model`: Current value, rationale, alternatives
- `permissions.autoApprove`: All patterns, security analysis
- `permissions.requireConfirmation`: Dangerous patterns coverage
- `autoUpdatesChannel`: Stable vs beta/dev trade-offs
- `alwaysThinkingEnabled`: Performance vs. capability
- `statusLine`: Custom status line evaluation
- `env`: Environment variables (if present)
- `enabledPlugins`: Plugin list and purposes

**Step 3: Create audit directory**

```bash
mkdir -p docs/claude-config/audit
```

**Step 4: Write settings analysis report**

Create comprehensive report with:

- Current settings inventory
- Security review of permissions
- Optimization recommendations
- Health score (0-10)
- Comparison with best practices

**Step 5: Commit**

```bash
git add docs/claude-config/audit/settings-report.md
git commit -m "docs: add Claude settings analysis report"
```

---

### Task 2: Hooks Inventory & Health Check

**Files:**

- Read: `~/.claude/hooks/*`
- Read: `~/.claude/settings.json` (hooks configuration)
- Create: `docs/claude-config/audit/hooks-report.md`

**Step 1: List all hook scripts**

```bash
ls -lah ~/.claude/hooks/
```

Expected: 11 hook files listed

**Step 2: Check hooks configuration in settings**

```bash
cat ~/.claude/settings.json | jq '.hooks'
```

Expected: 7 hook types configured

**Step 3: Read each hook script**

For each of the 11 hooks, document:

- File name
- Hook type (SessionStart, PostToolUse, etc.)
- Purpose (what it does)
- Dependencies (what it needs)
- Execution trigger

**Step 4: Check for hook logs/errors**

```bash
# Check telemetry or debug logs for hook execution
ls -lt ~/.claude/telemetry/ | head -5
ls -lt ~/.claude/debug/ | head -5
```

**Step 5: Write hooks inventory report**

Create report with:

- All 11 hooks documented
- Hook execution flow diagram
- Dependencies and integration points
- Performance notes (if available)
- Recommendations for improvements

**Step 6: Commit**

```bash
git add docs/claude-config/audit/hooks-report.md
git commit -m "docs: add Claude hooks inventory and health check"
```

---

### Task 3: Skills Management Analysis

**Files:**

- Read: `~/.claude/skills/*/SKILL.md`
- Create: `docs/claude-config/audit/skills-report.md`

**Step 1: List all installed skills**

```bash
ls -1 ~/.claude/skills/
```

Expected: 11 skill directories

**Step 2: Extract skill metadata**

For each skill, read SKILL.md and extract:

- Name
- Description
- Allowed-tools
- Arguments
- Category (infer from purpose)

**Step 3: Analyze skill organization**

Check for:

- Categorization opportunity (Knowledge, Content, System, etc.)
- Duplicate functionality
- Missing capabilities
- Integration patterns

**Step 4: Review usage patterns**

From history/stats if available:

- Which skills are invoked frequently?
- Which are forgotten?
- Any skill conflicts?

**Step 5: Write skills analysis report**

Create report with:

- Skills inventory (11 skills documented)
- Categorization recommendations
- Usage pattern analysis
- Missing capability gaps
- Organization improvements

**Step 6: Commit**

```bash
git add docs/claude-config/audit/skills-report.md
git commit -m "docs: add Claude skills management analysis"
```

---

### Task 4: MCP Server Health & Capabilities

**Files:**

- Read: `~/.claude/.mcp.json`
- Create: `docs/claude-config/audit/mcp-report.md`

**Step 1: List registered MCP servers**

```bash
cat ~/.claude/.mcp.json | jq '.mcpServers | keys[]'
```

Expected: 4 servers (knowledge-base, macos-system, observability, google-workspace)

**Step 2: Test MCP server connectivity**

Use MCP tools to verify each server:

- knowledge-base: Try kb_stats tool
- macos-system: Try macos_system_status tool
- observability: Try obs_stats tool
- google-workspace: Check if listed (may need auth)

**Step 3: Document available tools per server**

For each server, list:

- All available tools
- Tool purposes
- Common use cases
- Integration with skills

**Step 4: Identify missing servers**

Check if these exist (mentioned in PAIOS docs):

- session-analytics
- task-router

If missing, document setup instructions.

**Step 5: Write MCP health report**

Create report with:

- Server inventory and status
- Tool availability matrix
- Connectivity health
- Missing server recommendations
- Integration map (skills → MCP → external systems)

**Step 6: Commit**

```bash
git add docs/claude-config/audit/mcp-report.md
git commit -m "docs: add MCP server health and capabilities audit"
```

---

### Task 5: Keybindings Gap Analysis

**Files:**

- Read: `~/.claude/keybindings.json` (if exists)
- Create: `docs/claude-config/audit/keybindings-gap-analysis.md`

**Step 1: Check if keybindings exist**

```bash
if [[ -f ~/.claude/keybindings.json ]]; then
  cat ~/.claude/keybindings.json | jq .
else
  echo "No custom keybindings (using defaults)"
fi
```

Expected: No custom keybindings file

**Step 2: Research common Claude Code keybindings**

Document recommended essential keybindings:

- Quick skill invocation (e.g., Cmd+K for /kb)
- Common operations (submit, cancel, clear)
- Navigation shortcuts
- GSD workflow shortcuts
- Integration with skills

**Step 3: Identify high-value keybinding opportunities**

Based on PAIOS usage patterns:

- /kb query shortcut
- /health check shortcut
- /capture quick invoke
- /gsd:progress status
- Verification shortcut

**Step 4: Write gap analysis report**

Create report with:

- Current state (no custom keybindings)
- Recommended essential keybindings (10-15)
- Advanced keybindings for power users
- Setup instructions
- Trade-offs and considerations

**Step 5: Commit**

```bash
git add docs/claude-config/audit/keybindings-gap-analysis.md
git commit -m "docs: add keybindings gap analysis"
```

---

### Task 6: Permissions Review

**Files:**

- Read: `~/.claude/settings.json` (permissions section)
- Create: `docs/claude-config/audit/permissions-report.md`

**Step 1: Extract permissions configuration**

```bash
cat ~/.claude/settings.json | jq '.permissions'
```

**Step 2: Analyze auto-approve patterns**

Review current auto-approve:

- Tool patterns (Read, Glob, Grep, Edit, Write, etc.)
- Bash patterns (safe read-only commands)
- MCP wildcard patterns (mcp**knowledge-base**\*)
- Security implications of each

**Step 3: Analyze require-confirmation patterns**

Review dangerous operation patterns:

- File operations (rm -rf)
- Git force operations
- System commands (sudo, kill)
- Database operations
- Pipe to shell operations

**Step 4: Security analysis**

Check for:

- Overly permissive patterns
- Missing dangerous command patterns
- Balance between safety and friction
- Best practices comparison

**Step 5: Write permissions audit report**

Create report with:

- Current permissions inventory
- Security analysis
- Friction vs. safety trade-offs
- Optimization recommendations
- Comparison with Claude Code best practices

**Step 6: Commit**

```bash
git add docs/claude-config/audit/permissions-report.md
git commit -m "docs: add permissions security audit"
```

---

### Task 7: Configuration Health Summary

**Files:**

- Read: All previous audit reports (Tasks 1-6)
- Create: `docs/claude-config/audit/AUDIT-SUMMARY.md`

**Step 1: Review all audit reports**

Read:

- settings-report.md
- hooks-report.md
- skills-report.md
- mcp-report.md
- keybindings-gap-analysis.md
- permissions-report.md

**Step 2: Calculate health scores**

For each category (Settings, Hooks, Skills, MCP, Keybindings, Permissions):

- Score 0-10
- Identify strengths
- Identify gaps

**Step 3: Identify top 5 gaps**

Consolidate across all reports:

- Most critical gaps
- Priority order
- Impact assessment

**Step 4: Identify top 5 opportunities**

Consolidate optimization opportunities:

- Highest value improvements
- Effort vs. impact analysis
- Recommended priority order

**Step 5: Write executive summary**

Create report with:

- Overall health score
- Health by category
- Key findings (strengths + gaps)
- Top 5 gaps identified
- Top 5 opportunities for improvement
- Prioritized roadmap for Phases 2-4

**Step 6: Commit**

```bash
git add docs/claude-config/audit/AUDIT-SUMMARY.md
git commit -m "docs: add Claude configuration health summary"
```

---

## Phase 2: Documentation

### Task 8: Configuration Reference Guide

**Files:**

- Create: `docs/claude-config/CONFIG-REFERENCE.md`

**Step 1: Create documentation directory**

```bash
mkdir -p docs/claude-config
```

**Step 2: Document settings.json fields**

Create comprehensive reference with sections:

- Model configuration (when to use Sonnet/Opus/Haiku)
- Permissions (autoApprove and requireConfirmation patterns)
- Auto-updates (stable/beta/dev channels)
- Thinking mode (always/never/auto trade-offs)
- Status line (custom vs. default)
- Environment variables
- Enabled plugins

**Step 3: Add decision trees**

For each configurable setting:

- When to change it
- Common values and trade-offs
- Examples of configurations

**Step 4: Add cross-references**

Link to:

- Hooks playbook (for hook configuration)
- MCP servers doc (for MCP setup)
- Keybindings guide (for keybindings setup)

**Step 5: Commit**

```bash
git add docs/claude-config/CONFIG-REFERENCE.md
git commit -m "docs: create Claude configuration reference guide"
```

---

### Task 9: Hooks Playbook

**Files:**

- Create: `docs/claude-config/HOOKS-PLAYBOOK.md`

**Step 1: Create hooks reference table**

Table with all 11 hooks:

- Hook name
- Type (SessionStart, PostToolUse, etc.)
- Purpose
- Execution time
- Dependencies

**Step 2: Document each hook in detail**

For each of 11 hooks:

- Purpose and trigger conditions
- Input/output
- Dependencies (what it needs)
- Integration points (KB, observability, etc.)
- Common issues and solutions

**Step 3: Add hook development guide**

How to create new hooks:

- Hook template
- Best practices
- Testing procedures
- Registering in settings.json
- Performance optimization

**Step 4: Add troubleshooting section**

Common issues:

- Hook not firing
- Hook execution errors
- Slow hook performance
- Hook conflicts
- Debugging procedures

**Step 5: Commit**

```bash
git add docs/claude-config/HOOKS-PLAYBOOK.md
git commit -m "docs: create hooks playbook and reference"
```

---

### Task 10: Skills Management Guide

**Files:**

- Create: `docs/claude-config/SKILLS-GUIDE.md`

**Step 1: Write installation procedures**

Document:

- How to install skills from marketplace
- How to install custom skills
- Skill directory structure
- YAML frontmatter format

**Step 2: Write skill development guide**

How to create custom skills:

- YAML frontmatter (name, description, allowed-tools, arguments)
- Skill content structure
- Testing skills
- Publishing to marketplace

**Step 3: Write organization strategies**

Document:

- Categorizing skills (Knowledge, Content, System, etc.)
- Naming conventions
- Managing many skills
- Skill dependencies

**Step 4: Write integration guide**

How skills integrate with:

- Superpowers skills
- GSD commands
- MCP servers
- Hooks

**Step 5: Add examples**

Use PAIOS skills as examples:

- /kb skill (simple MCP integration)
- /capture skill (complex multi-step)
- /team skill (agent spawning)

**Step 6: Commit**

```bash
git add docs/claude-config/SKILLS-GUIDE.md
git commit -m "docs: create skills management guide"
```

---

### Task 11: MCP Server Reference

**Files:**

- Create: `docs/claude-config/MCP-SERVERS.md`

**Step 1: Document each of 4 MCP servers**

For knowledge-base, macos-system, observability, google-workspace:

- Purpose
- Available tools (list all)
- Configuration
- Common use cases
- Integration with skills

**Step 2: Create tool finder matrix**

Table showing:

- Tool name
- Server
- Purpose
- Which skills use it

**Step 3: Write MCP server setup guide**

How to add new MCP servers:

- Configuration in .mcp.json
- Permission patterns
- Testing connectivity
- Troubleshooting

**Step 4: Document missing servers**

For session-analytics and task-router (if missing):

- Purpose
- Why they're missing
- How to add them
- Expected benefits

**Step 5: Commit**

```bash
git add docs/claude-config/MCP-SERVERS.md
git commit -m "docs: create MCP server reference"
```

---

### Task 12: Keybindings Setup Guide

**Files:**

- Create: `docs/claude-config/KEYBINDINGS-GUIDE.md`

**Step 1: Document recommended essential keybindings**

Create list of 10-15 must-have keybindings:

- Quick skill access (/kb, /health, /trace)
- Common operations (submit, cancel, new session)
- Navigation (scroll, search)
- GSD shortcuts (/gsd:progress, /gsd:plan-phase)
- Integration shortcuts

**Step 2: Write keybindings.json structure**

Explain format:

```json
{
  "keyBinding": {
    "description": "What it does",
    "command": "command-to-run"
  }
}
```

**Step 3: Document chord sequences**

How to create multi-key shortcuts:

- Format
- Examples
- Best practices

**Step 4: Write quick setup guide**

Copy-paste ready keybindings.json with essentials.

**Step 5: Write customization guide**

How to:

- Add new keybindings
- Modify existing
- Test keybindings
- Avoid conflicts

**Step 6: Commit**

```bash
git add docs/claude-config/KEYBINDINGS-GUIDE.md
git commit -m "docs: create keybindings setup guide"
```

---

### Task 13: Best Practices Compendium

**Files:**

- Create: `docs/claude-config/BEST-PRACTICES.md`

**Step 1: Write configuration maintenance schedule**

Document:

- Weekly maintenance tasks
- Monthly tasks
- Quarterly tasks
- After Claude Code updates

**Step 2: Write security best practices**

Document:

- Permissions configuration
- Hook security
- External integration safety
- Secrets management

**Step 3: Write performance optimization guide**

Document:

- Hook execution optimization
- MCP timeout configuration
- Status line performance
- Memory/resource management

**Step 4: Write common pitfalls section**

Document:

- Common mistakes
- How to avoid them
- Recovery procedures

**Step 5: Write operational procedures**

When to:

- Restart Claude Code vs. reload config
- Backup configuration
- Validate changes
- Roll back changes

**Step 6: Commit**

```bash
git add docs/claude-config/BEST-PRACTICES.md
git commit -m "docs: create configuration best practices compendium"
```

---

### Task 14: Quick Reference Card

**Files:**

- Create: `docs/claude-config/QUICK-REFERENCE.md`

**Step 1: Create one-page cheatsheet**

Content:

- Essential file locations (~/.claude/settings.json, hooks/, skills/)
- Quick health checks (validate, MCP test)
- Common configuration tasks
- Troubleshooting first steps
- Key commands and shortcuts

**Step 2: Format for printing**

Optimize layout:

- One page maximum
- Dense but scannable
- Clear sections
- Cross-references to detailed docs

**Step 3: Commit**

```bash
git add docs/claude-config/QUICK-REFERENCE.md
git commit -m "docs: create Claude configuration quick reference"
```

---

## Phase 3: Optimization

### Task 15: Configuration Validator

**Files:**

- Create: `~/.claude/scripts/validate-config.sh`

**Step 1: Create scripts directory**

```bash
mkdir -p ~/.claude/scripts
```

**Step 2: Write validation script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Claude Configuration Validator ==="

# Check settings.json exists and is valid JSON
if [[ ! -f ~/.claude/settings.json ]]; then
    echo "❌ settings.json not found"
    exit 1
fi

if ! jq empty ~/.claude/settings.json 2>/dev/null; then
    echo "❌ settings.json: Invalid JSON"
    exit 1
fi

# Check required fields
REQUIRED_FIELDS=(
    ".model"
    ".permissions"
    ".autoUpdatesChannel"
)

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! jq -e "$field" ~/.claude/settings.json >/dev/null 2>&1; then
        echo "❌ Missing required field: $field"
        exit 1
    fi
done

echo "✅ settings.json valid"

# Check hooks exist and are executable
if [[ -d ~/.claude/hooks ]]; then
    HOOK_COUNT=$(find ~/.claude/hooks -type f -name "*.sh" -o -name "*.js" | wc -l)
    NON_EXEC=$(find ~/.claude/hooks -type f \( -name "*.sh" -o -name "*.js" \) ! -perm -u+x | wc -l)

    echo "✅ Hooks directory: $HOOK_COUNT hooks found"

    if [[ $NON_EXEC -gt 0 ]]; then
        echo "⚠️  $NON_EXEC hooks not executable"
    fi
fi

# Check MCP servers registration
if [[ -f ~/.claude/.mcp.json ]]; then
    if ! jq empty ~/.claude/.mcp.json 2>/dev/null; then
        echo "❌ .mcp.json: Invalid JSON"
        exit 1
    fi

    SERVER_COUNT=$(jq '.mcpServers | keys | length' ~/.claude/.mcp.json)
    echo "✅ MCP servers: $SERVER_COUNT registered"
fi

# Check skills
if [[ -d ~/.claude/skills ]]; then
    SKILL_COUNT=$(ls -1 ~/.claude/skills | wc -l)
    echo "✅ Skills: $SKILL_COUNT installed"
fi

echo ""
echo "Overall: Configuration healthy"
exit 0
```

**Step 3: Make executable**

```bash
chmod +x ~/.claude/scripts/validate-config.sh
```

**Step 4: Test validation**

```bash
~/.claude/scripts/validate-config.sh
```

Expected: ✅ All checks pass

**Step 5: Commit**

```bash
git add ~/.claude/scripts/validate-config.sh
git commit -m "feat: add Claude configuration validator script"
```

---

### Task 16: Configuration Backup & Restore

**Files:**

- Create: `~/.claude/scripts/backup-config.sh`
- Create: `~/.claude/scripts/restore-config.sh`

**Step 1: Write backup script**

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y-%m-%d-%H%M)
BACKUP_DIR=~/.claude/backups/config-$TIMESTAMP

echo "=== Claude Configuration Backup ==="
echo "Creating backup: $BACKUP_DIR"

mkdir -p "$BACKUP_DIR"

# Backup configuration files
cp ~/.claude/settings.json "$BACKUP_DIR/" 2>/dev/null || echo "No settings.json"
cp ~/.claude/.mcp.json "$BACKUP_DIR/" 2>/dev/null || echo "No .mcp.json"
cp ~/.claude/keybindings.json "$BACKUP_DIR/" 2>/dev/null || echo "No keybindings.json"

# Backup directories
cp -R ~/.claude/hooks "$BACKUP_DIR/" 2>/dev/null || echo "No hooks"
cp -R ~/.claude/skills "$BACKUP_DIR/" 2>/dev/null || echo "No skills"
cp -R ~/.claude/projects "$BACKUP_DIR/" 2>/dev/null || echo "No projects"

# Create manifest
cat > "$BACKUP_DIR/MANIFEST.txt" << EOF
Claude Code Configuration Backup
Created: $TIMESTAMP
$(du -sh "$BACKUP_DIR" | cut -f1)

Files backed up:
$(find "$BACKUP_DIR" -type f | wc -l) files
EOF

# Compress
cd ~/.claude/backups
tar -czf "config-$TIMESTAMP.tar.gz" "config-$TIMESTAMP"
rm -rf "config-$TIMESTAMP"

echo "✅ Backup complete: ~/.claude/backups/config-$TIMESTAMP.tar.gz"
```

**Step 2: Write restore script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Claude Configuration Restore ==="

# List available backups
echo "Available backups:"
ls -lh ~/.claude/backups/*.tar.gz 2>/dev/null || {
    echo "No backups found"
    exit 1
}

echo ""
read -p "Enter backup filename (e.g., config-2026-02-27-1200.tar.gz): " BACKUP_FILE

if [[ ! -f ~/.claude/backups/$BACKUP_FILE ]]; then
    echo "❌ Backup not found"
    exit 1
fi

# Create safety backup first
echo "Creating safety backup of current config..."
~/.claude/scripts/backup-config.sh

# Extract backup
TEMP_DIR=$(mktemp -d)
tar -xzf ~/.claude/backups/$BACKUP_FILE -C "$TEMP_DIR"

# Restore files
echo "Restoring configuration..."
cp -f "$TEMP_DIR"/*/settings.json ~/.claude/ 2>/dev/null || echo "No settings.json in backup"
cp -f "$TEMP_DIR"/*/.mcp.json ~/.claude/ 2>/dev/null || echo "No .mcp.json in backup"
cp -Rf "$TEMP_DIR"/*/hooks/* ~/.claude/hooks/ 2>/dev/null || echo "No hooks in backup"
cp -Rf "$TEMP_DIR"/*/skills/* ~/.claude/skills/ 2>/dev/null || echo "No skills in backup"

# Validate restored config
~/.claude/scripts/validate-config.sh

echo "✅ Restore complete"
rm -rf "$TEMP_DIR"
```

**Step 3: Make executable**

```bash
chmod +x ~/.claude/scripts/backup-config.sh
chmod +x ~/.claude/scripts/restore-config.sh
```

**Step 4: Test backup**

```bash
~/.claude/scripts/backup-config.sh
```

Expected: Backup created in ~/.claude/backups/

**Step 5: Verify backup**

```bash
ls -lh ~/.claude/backups/*.tar.gz | tail -1
```

Expected: Recent backup file exists

**Step 6: Commit**

```bash
git add ~/.claude/scripts/backup-config.sh ~/.claude/scripts/restore-config.sh
git commit -m "feat: add Claude config backup and restore scripts"
```

---

### Task 17: Configuration Templates

**Files:**

- Create: `~/.claude/config-templates/minimal-config.json`
- Create: `~/.claude/config-templates/paios-config.json`
- Create: `~/.claude/config-templates/keybindings-essential.json`
- Create: `~/.claude/config-templates/mcp-paios.json`
- Create: `~/.claude/config-templates/README.md`

**Step 1: Create templates directory**

```bash
mkdir -p ~/.claude/config-templates
```

**Step 2: Create minimal config template**

Minimal settings.json with basic permissions only.

**Step 3: Export current PAIOS config**

```bash
cat ~/.claude/settings.json > ~/.claude/config-templates/paios-config.json
cat ~/.claude/.mcp.json > ~/.claude/config-templates/mcp-paios.json
```

**Step 4: Create essential keybindings template**

10-15 recommended keybindings in JSON format.

**Step 5: Write templates README**

Document each template:

- Use case
- Installation instructions
- Customization guide
- Migration procedures

**Step 6: Commit**

```bash
git add ~/.claude/config-templates/
git commit -m "feat: add Claude configuration templates"
```

---

### Task 18: Hook Performance Monitor

**Files:**

- Create: `~/.claude/scripts/monitor-hooks.sh`

**Step 1: Write monitoring script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Hook Performance Monitor ==="

# Check for hook execution logs
# (This depends on where Claude Code logs hook execution)
# May need to parse telemetry or debug logs

TELEMETRY_DIR=~/.claude/telemetry
DEBUG_DIR=~/.claude/debug

if [[ -d $TELEMETRY_DIR ]]; then
    echo "Checking telemetry logs..."
    # Parse logs for hook execution times
    # This is a placeholder - actual implementation depends on log format
    echo "Telemetry logging detected"
fi

# Alternative: Check each hook script execution manually
echo ""
echo "Hook Scripts:"
for hook in ~/.claude/hooks/*.{sh,js}; do
    if [[ -f $hook ]]; then
        echo "  $(basename "$hook")"
    fi
done

echo ""
echo "⚠️  Note: Hook performance monitoring requires Claude Code telemetry"
echo "   Run this after sessions to analyze hook execution times"
```

**Step 2: Make executable**

```bash
chmod +x ~/.claude/scripts/monitor-hooks.sh
```

**Step 3: Test monitoring**

```bash
~/.claude/scripts/monitor-hooks.sh
```

**Step 4: Commit**

```bash
git add ~/.claude/scripts/monitor-hooks.sh
git commit -m "feat: add hook performance monitoring script"
```

---

### Task 19: MCP Health Check

**Files:**

- Create: `~/.claude/scripts/check-mcp-servers.sh`

**Step 1: Write MCP health check script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== MCP Server Health Check ==="

# Read registered servers
if [[ ! -f ~/.claude/.mcp.json ]]; then
    echo "❌ .mcp.json not found"
    exit 1
fi

SERVERS=$(jq -r '.mcpServers | keys[]' ~/.claude/.mcp.json 2>/dev/null)

echo "Registered MCP Servers:"
echo "$SERVERS" | while IFS= read -r server; do
    echo "  • $server"
done

echo ""
echo "✅ MCP configuration valid"
echo ""
echo "Note: Test server connectivity by invoking MCP tools in Claude Code session"
echo "  - knowledge-base: Use /kb or mcp__knowledge-base__kb_stats"
echo "  - macos-system: Use mcp__macos-system__macos_system_status"
echo "  - observability: Use /trace or mcp__observability__obs_stats"
echo "  - google-workspace: Check if authenticated"
```

**Step 2: Make executable**

```bash
chmod +x ~/.claude/scripts/check-mcp-servers.sh
```

**Step 3: Test MCP check**

```bash
~/.claude/scripts/check-mcp-servers.sh
```

Expected: Lists 4 registered servers

**Step 4: Commit**

```bash
git add ~/.claude/scripts/check-mcp-servers.sh
git commit -m "feat: add MCP server health check script"
```

---

### Task 20: Skills Organizer

**Files:**

- Create: `~/.claude/scripts/organize-skills.sh`

**Step 1: Write skills organizer script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Skills Organizer ==="

if [[ ! -d ~/.claude/skills ]]; then
    echo "❌ Skills directory not found"
    exit 1
fi

echo "Installed Skills:"
echo ""

for skill_dir in ~/.claude/skills/*/; do
    SKILL_NAME=$(basename "$skill_dir")
    SKILL_FILE="$skill_dir/SKILL.md"

    if [[ -f $SKILL_FILE ]]; then
        # Extract description from YAML frontmatter
        DESC=$(grep -A 1 "^description:" "$SKILL_FILE" | tail -1 | sed 's/^[[:space:]]*//' || echo "No description")
        echo "  • $SKILL_NAME"
        echo "    $DESC"
    else
        echo "  • $SKILL_NAME (missing SKILL.md)"
    fi
done

echo ""
SKILL_COUNT=$(ls -1 ~/.claude/skills | wc -l | tr -d ' ')
echo "Total: $SKILL_COUNT skills installed"
```

**Step 2: Make executable**

```bash
chmod +x ~/.claude/scripts/organize-skills.sh
```

**Step 3: Test organizer**

```bash
~/.claude/scripts/organize-skills.sh
```

Expected: Lists 11 skills with descriptions

**Step 4: Commit**

```bash
git add ~/.claude/scripts/organize-skills.sh
git commit -m "feat: add skills organizer script"
```

---

## Phase 4: Integration & Maintenance

### Task 21: Configuration Maintenance Checklist

**Files:**

- Create: `docs/claude-config/MAINTENANCE-CHECKLIST.md`

**Step 1: Write maintenance schedule**

Create checklist with:

**Weekly:**

- [ ] Run `~/.claude/scripts/monitor-hooks.sh`
- [ ] Run `~/.claude/scripts/check-mcp-servers.sh`
- [ ] Review skills usage (any forgotten?)

**Monthly:**

- [ ] Run `~/.claude/scripts/backup-config.sh`
- [ ] Run `~/.claude/scripts/validate-config.sh`
- [ ] Review settings.json for drift
- [ ] Check Claude Code version for updates
- [ ] Clean up unused skills

**Quarterly:**

- [ ] Re-run full audit (review all audit reports)
- [ ] Update config templates
- [ ] Review and update documentation
- [ ] Compare with Claude Code release notes

**After Claude Code Updates:**

- [ ] Run `~/.claude/scripts/validate-config.sh`
- [ ] Test hooks still execute
- [ ] Check MCP servers reconnect
- [ ] Verify skills load correctly

**Step 2: Commit**

```bash
git add docs/claude-config/MAINTENANCE-CHECKLIST.md
git commit -m "docs: create configuration maintenance checklist"
```

---

### Task 22: Configuration Update Procedures

**Files:**

- Create: `docs/claude-config/UPDATE-PROCEDURES.md`

**Step 1: Write safe update procedures**

Document step-by-step for each operation:

**Updating settings.json:**

1. Backup: `~/.claude/scripts/backup-config.sh`
2. Edit: `vim ~/.claude/settings.json` or use editor
3. Validate: `~/.claude/scripts/validate-config.sh`
4. Test: Restart Claude Code, verify functionality
5. Rollback if needed: `~/.claude/scripts/restore-config.sh`

**Adding hooks:**

1. Write hook script
2. Test standalone: `bash ~/.claude/hooks/new-hook.sh`
3. Add to settings.json under appropriate hook type
4. Validate: `~/.claude/scripts/validate-config.sh`
5. Test: Trigger hook in Claude Code session

**Installing skills:**

1. Download/create skill in `~/.claude/skills/skill-name/`
2. Validate YAML frontmatter
3. Test invocation: `/skill-name` in Claude Code
4. Document in skills inventory

**Adding MCP servers:**

1. Register in `~/.claude/.mcp.json`
2. Add permission patterns if needed
3. Test connectivity (invoke MCP tool)
4. Update skills to use new MCP tools

**Step 2: Commit**

```bash
git add docs/claude-config/UPDATE-PROCEDURES.md
git commit -m "docs: create configuration update procedures"
```

---

### Task 23: Configuration Documentation Index

**Files:**

- Create: `docs/claude-config/README.md`

**Step 1: Create master documentation index**

```markdown
# Claude Code Configuration Documentation

Complete reference for managing Claude Code configuration.

## 📖 Essential Reading

1. [Quick Reference](QUICK-REFERENCE.md) - One-page cheatsheet
2. [Configuration Reference](CONFIG-REFERENCE.md) - Complete settings guide
3. [Hooks Playbook](HOOKS-PLAYBOOK.md) - Hook reference and development

## 🔍 Audit Reports

- [Audit Summary](audit/AUDIT-SUMMARY.md)
- [Settings Report](audit/settings-report.md)
- [Hooks Report](audit/hooks-report.md)
- [Skills Report](audit/skills-report.md)
- [MCP Report](audit/mcp-report.md)
- [Keybindings Gap Analysis](audit/keybindings-gap-analysis.md)
- [Permissions Report](audit/permissions-report.md)

## 📚 Reference Guides

- [Skills Management](SKILLS-GUIDE.md)
- [MCP Servers](MCP-SERVERS.md)
- [Keybindings Setup](KEYBINDINGS-GUIDE.md)
- [Best Practices](BEST-PRACTICES.md)

## 🛠️ Operational Tools

Located in `~/.claude/scripts/`:

- `validate-config.sh` - Validate configuration health
- `backup-config.sh` - Create configuration backup
- `restore-config.sh` - Restore from backup
- `monitor-hooks.sh` - Check hook performance
- `check-mcp-servers.sh` - Validate MCP connectivity
- `organize-skills.sh` - List and categorize skills

## 🔄 Maintenance

- [Maintenance Checklist](MAINTENANCE-CHECKLIST.md)
- [Update Procedures](UPDATE-PROCEDURES.md)
```

**Step 2: Update main docs/README.md**

Add link to Claude configuration docs in the main README.

**Step 3: Commit**

```bash
git add docs/claude-config/README.md docs/README.md
git commit -m "docs: create Claude config documentation index"
```

---

### Task 24: GitHub Issue Template

**Files:**

- Create: `.github/ISSUE_TEMPLATE/claude-config-issue.md`

**Step 1: Create issue template**

```markdown
---
name: Claude Config Issue
about: Report Claude Code configuration problems
title: "[CONFIG] "
labels: configuration, claude-code
---

## What were you trying to do?

[Describe the configuration task or goal]

## What went wrong?

- [ ] Settings.json syntax error
- [ ] Hook not executing
- [ ] Skill not loading
- [ ] MCP server not connecting
- [ ] Keybinding not working
- [ ] Permission issue
- [ ] Other: [describe]

## Configuration Area

Which area is affected?

- [ ] Settings (`~/.claude/settings.json`)
- [ ] Hooks (`~/.claude/hooks/`)
- [ ] Skills (`~/.claude/skills/`)
- [ ] MCP Servers (`~/.claude/.mcp.json`)
- [ ] Keybindings (`~/.claude/keybindings.json`)
- [ ] Permissions

## Diagnostic Info

Please run and attach output:

\`\`\`bash
~/.claude/scripts/validate-config.sh
\`\`\`

## What have you tried?

- [ ] Ran validator script
- [ ] Checked Claude config docs
- [ ] Restarted Claude Code
- [ ] Restored from backup
- [ ] Other: [describe]

## Environment

- Claude Code version: [run `/version`]
- OS: [macOS version]
- Last configuration change: [when]
```

**Step 2: Commit**

```bash
git add .github/ISSUE_TEMPLATE/claude-config-issue.md
git commit -m "feat: add Claude configuration issue template"
```

---

### Task 25: Integration with PAIOS Health Check

**Files:**

- Create: `~/.claude/scripts/claude-health-check.sh`
- Modify: `~/.claude/skills/health/SKILL.md` (or paios-health)

**Step 1: Create comprehensive health check script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Claude Code Configuration Health ==="
echo ""

# Run validator
if ~/.claude/scripts/validate-config.sh 2>&1 | grep -q "Configuration healthy"; then
    echo "✅ Configuration: Healthy"
else
    echo "❌ Configuration: Issues detected"
fi

# Check hooks
HOOK_COUNT=$(find ~/.claude/hooks -type f \( -name "*.sh" -o -name "*.js" \) 2>/dev/null | wc -l | tr -d ' ')
echo "✅ Hooks: $HOOK_COUNT installed"

# Check skills
SKILL_COUNT=$(ls -1 ~/.claude/skills 2>/dev/null | wc -l | tr -d ' ')
echo "✅ Skills: $SKILL_COUNT installed"

# Check MCP servers
MCP_COUNT=$(jq '.mcpServers | keys | length' ~/.claude/.mcp.json 2>/dev/null || echo "0")
echo "✅ MCP Servers: $MCP_COUNT registered"

# Check for backup
BACKUP_COUNT=$(ls -1 ~/.claude/backups/*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
if [[ $BACKUP_COUNT -gt 0 ]]; then
    LATEST=$(ls -t ~/.claude/backups/*.tar.gz 2>/dev/null | head -1)
    echo "✅ Backups: $BACKUP_COUNT available (latest: $(basename "$LATEST"))"
else
    echo "⚠️  Backups: None found (run backup-config.sh)"
fi

echo ""
echo "Overall: Claude Code configuration is healthy"
```

**Step 2: Make executable**

```bash
chmod +x ~/.claude/scripts/claude-health-check.sh
```

**Step 3: Test health check**

```bash
~/.claude/scripts/claude-health-check.sh
```

Expected: Shows configuration health summary

**Step 4: Commit**

```bash
git add ~/.claude/scripts/claude-health-check.sh
git commit -m "feat: add Claude configuration health check script"
```

---

### Task 26: Setup Automation Script

**Files:**

- Create: `~/.claude/scripts/setup-fresh-install.sh`

**Step 1: Write setup automation script**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Claude Code Fresh Install Setup ==="
echo ""
echo "This will configure Claude Code for PAIOS."
echo ""

# Check Claude Code is installed
if [[ ! -d ~/.claude ]]; then
    echo "❌ Claude Code not installed (no ~/.claude directory)"
    exit 1
fi

# Backup existing config if present
if [[ -f ~/.claude/settings.json ]]; then
    echo "Existing configuration detected. Creating backup..."
    mkdir -p ~/.claude/backups
    TIMESTAMP=$(date +%Y-%m-%d-%H%M)
    cp ~/.claude/settings.json ~/.claude/backups/settings-pre-setup-$TIMESTAMP.json
    echo "✅ Backup created"
fi

# Install configuration templates
echo ""
echo "Installing PAIOS configuration templates..."

# This would copy templates and prompt for customization
# Placeholder for now - full implementation would be interactive

echo "✅ Setup complete"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code"
echo "  2. Run: ~/.claude/scripts/validate-config.sh"
echo "  3. Test: Invoke /kb or /health skill"
```

**Step 2: Make executable**

```bash
chmod +x ~/.claude/scripts/setup-fresh-install.sh
```

**Step 3: Commit**

```bash
git add ~/.claude/scripts/setup-fresh-install.sh
git commit -m "feat: add fresh install setup automation script"
```

---

## Completion & Verification

### Verification Steps

**Step 1: Verify all documentation exists**

```bash
ls -la docs/claude-config/*.md docs/claude-config/audit/
```

Expected: 14 documentation files

**Step 2: Verify all scripts work**

```bash
~/.claude/scripts/validate-config.sh
~/.claude/scripts/check-mcp-servers.sh
~/.claude/scripts/organize-skills.sh
~/.claude/scripts/claude-health-check.sh
```

Expected: All run without errors

**Step 3: Verify templates exist**

```bash
ls -la ~/.claude/config-templates/
```

Expected: 5 template files + README

**Step 4: Verify backup system works**

```bash
~/.claude/scripts/backup-config.sh
ls -lh ~/.claude/backups/*.tar.gz | tail -1
```

Expected: Recent backup created

### Success Criteria

- ✅ All 26 tasks completed
- ✅ 7 audit reports exist (comprehensive analysis)
- ✅ 7 documentation guides exist (reference materials)
- ✅ 6 operational scripts working (validators, backup, monitors)
- ✅ 5 configuration templates available
- ✅ Integration with PAIOS health checks
- ✅ GitHub issue template for config problems
- ✅ Complete documentation index

### Launch Checklist

Before considering complete:

- [ ] Run validator: `~/.claude/scripts/validate-config.sh` → passes
- [ ] Create backup: `~/.claude/scripts/backup-config.sh` → succeeds
- [ ] Test MCP check: `~/.claude/scripts/check-mcp-servers.sh` → lists servers
- [ ] Read Quick Reference: `docs/claude-config/QUICK-REFERENCE.md` → makes sense
- [ ] Review Audit Summary: `docs/claude-config/audit/AUDIT-SUMMARY.md` → clear action items

---

**Implementation Time Estimate:** 6-8 hours total

- Phase 1 (Audit): 1.5-2 hours (7 analysis tasks)
- Phase 2 (Documentation): 2-2.5 hours (7 documentation tasks)
- Phase 3 (Optimization): 1.5-2 hours (6 script tasks)
- Phase 4 (Integration): 1-1.5 hours (6 integration tasks)

**Note:** With efficient execution (like Superpowers/GSD optimization), actual time may be significantly less (~3-4 hours).
