# Claude Configuration Update Procedures

This document provides safe procedures for updating various parts of your Claude CLI configuration.

## Table of Contents

- [General Update Principles](#general-update-principles)
- [Updating Settings](#updating-settings)
- [Updating Hooks](#updating-hooks)
- [Updating Skills](#updating-skills)
- [Updating MCP Servers](#updating-mcp-servers)
- [Updating Auth Profiles](#updating-auth-profiles)
- [Updating Project Configurations](#updating-project-configurations)
- [Rollback Procedures](#rollback-procedures)

## General Update Principles

### Pre-Update Checklist

1. Always backup before making changes
2. Test changes in a non-production project first if possible
3. Review validation results before and after
4. Document what you changed and why
5. Plan your rollback strategy

### Backup Strategy

```bash
# Quick backup before any change
cp ~/.claude/settings.json ~/.claude/settings.json.backup-$(date +%Y%m%d-%H%M%S)

# Full configuration backup
tar -czf ~/.claude-backup-$(date +%Y%m%d-%H%M%S).tar.gz ~/.claude
```

### Validation After Changes

```bash
# Run configuration validation
~/.claude/scripts/validate-all-configs.sh

# Test affected functionality
# Example: if you updated MCP settings, test MCP connections
```

## Updating Settings

### Global Settings (`~/.claude/settings.json`)

**Safe Update Procedure:**

1. **Backup current settings:**

   ```bash
   cp ~/.claude/settings.json ~/.claude/settings.json.backup
   ```

2. **Validate JSON syntax before editing:**

   ```bash
   jq '.' ~/.claude/settings.json >/dev/null && echo "Valid JSON" || echo "Invalid JSON"
   ```

3. **Edit settings:**

   ```bash
   # Use jq for safe programmatic updates
   jq '.mcpServers.newServer = {"command": "node", "args": ["server.js"]}' \
     ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json

   # Or edit manually with your editor
   $EDITOR ~/.claude/settings.json
   ```

4. **Validate JSON after editing:**

   ```bash
   jq '.' ~/.claude/settings.json >/dev/null && echo "Valid JSON" || echo "Invalid JSON"
   ```

5. **Restart Claude CLI if running:**

   ```bash
   # Settings are reloaded on next CLI start
   # If using gateway/daemon, restart it
   pkill -f "claude.*gateway"
   ```

6. **Test the changes:**
   ```bash
   # Verify new settings are active
   # Example: check MCP server connections with /settings
   ```

### Project-Specific Settings

Project settings inherit from global settings and can override them.

**Safe Update Procedure:**

1. **Backup project settings:**

   ```bash
   cp ~/.claude/projects/myproject/settings.json ~/.claude/projects/myproject/settings.json.backup
   ```

2. **Edit project settings:**

   ```bash
   $EDITOR ~/.claude/projects/myproject/settings.json
   ```

3. **Validate inheritance:**
   ```bash
   # Test that project settings correctly override global settings
   # Run validation specific to this project
   ```

## Updating Hooks

Hooks execute automatically on specific triggers, so changes require extra care.

### Adding a New Hook

**Safe Update Procedure:**

1. **Develop hook in isolation:**

   ```bash
   # Create hook file
   mkdir -p ~/.claude/hooks
   cat > ~/.claude/hooks/test-hook.ts << 'EOF'
   export async function onPreToolUse(context) {
     console.log('Hook executing:', context.toolName);
     return context;
   }
   EOF
   ```

2. **Test hook in isolated project:**

   ```bash
   # Create test project with only this hook
   mkdir -p ~/.claude/projects/hook-test
   cat > ~/.claude/projects/hook-test/settings.json << 'EOF'
   {
     "hooks": {
       "preToolUse": "~/.claude/hooks/test-hook.ts"
     }
   }
   EOF
   ```

3. **Test hook execution:**

   ```bash
   # Start Claude CLI in test project and trigger the hook
   # Verify hook executes correctly and doesn't break functionality
   ```

4. **Add to global or production project:**
   ```bash
   # Only after successful testing
   jq '.hooks.preToolUse = "~/.claude/hooks/test-hook.ts"' \
     ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json
   ```

### Modifying an Existing Hook

**Safe Update Procedure:**

1. **Backup current hook:**

   ```bash
   cp ~/.claude/hooks/existing-hook.ts ~/.claude/hooks/existing-hook.ts.backup
   ```

2. **Make changes:**

   ```bash
   $EDITOR ~/.claude/hooks/existing-hook.ts
   ```

3. **Test in isolated environment:**

   ```bash
   # Create test project with modified hook
   # Verify behavior is as expected
   ```

4. **Monitor hook execution:**

   ```bash
   # Enable hook logging if available
   # Watch for errors or unexpected behavior
   tail -f ~/.claude/logs/hooks.log
   ```

5. **Deploy to production:**
   ```bash
   # Move modified hook to production location
   # Monitor initial executions closely
   ```

### Disabling a Hook Temporarily

```bash
# Option 1: Comment out in settings.json
jq '.hooks.preToolUse = null' ~/.claude/settings.json > ~/.claude/settings.json.tmp
mv ~/.claude/settings.json.tmp ~/.claude/settings.json

# Option 2: Rename hook file (preserves it for easy re-enable)
mv ~/.claude/hooks/problematic-hook.ts ~/.claude/hooks/problematic-hook.ts.disabled
```

## Updating Skills

Skills are custom commands that extend Claude CLI functionality.

### Adding a New Skill

**Safe Update Procedure:**

1. **Create skill directory:**

   ```bash
   mkdir -p ~/.claude/skills/myskill
   ```

2. **Create skill definition:**

   ```bash
   cat > ~/.claude/skills/myskill/skill.json << 'EOF'
   {
     "name": "myskill",
     "description": "My custom skill",
     "command": "myskill",
     "handler": "handler.ts"
   }
   EOF
   ```

3. **Create skill handler:**

   ```bash
   cat > ~/.claude/skills/myskill/handler.ts << 'EOF'
   export async function execute(args: string[]) {
     console.log('Skill executing with args:', args);
     return { success: true };
   }
   EOF
   ```

4. **Register skill in settings:**

   ```bash
   jq '.skills.myskill = "~/.claude/skills/myskill"' \
     ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json
   ```

5. **Test skill:**
   ```bash
   # Restart Claude CLI and test: /myskill test args
   ```

### Updating an Existing Skill

**Safe Update Procedure:**

1. **Backup skill:**

   ```bash
   cp -r ~/.claude/skills/myskill ~/.claude/skills/myskill.backup-$(date +%Y%m%d)
   ```

2. **Make changes:**

   ```bash
   $EDITOR ~/.claude/skills/myskill/handler.ts
   ```

3. **Test changes:**

   ```bash
   # Test skill in isolated project first
   # Verify backward compatibility if other projects depend on it
   ```

4. **Deploy:**
   ```bash
   # Restart Claude CLI to load updated skill
   ```

### Removing a Skill

**Safe Update Procedure:**

1. **Verify skill is not in use:**

   ```bash
   # Check for references in hooks, other skills, or automation
   grep -r "myskill" ~/.claude/
   ```

2. **Remove from settings:**

   ```bash
   jq 'del(.skills.myskill)' ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json
   ```

3. **Archive skill (don't delete immediately):**

   ```bash
   mv ~/.claude/skills/myskill ~/.claude/skills/archived/myskill-$(date +%Y%m%d)
   ```

4. **Monitor for references:**
   ```bash
   # Watch logs for errors about missing skill
   # Keep archived version for 30 days before permanent deletion
   ```

## Updating MCP Servers

MCP servers provide external capabilities to Claude CLI.

### Adding a New MCP Server

**Safe Update Procedure:**

1. **Install MCP server:**

   ```bash
   # Example: installing a custom MCP server
   cd ~/.claude/projects/mcp-server
   pnpm install
   pnpm build
   ```

2. **Add to settings (disabled initially):**

   ```bash
   jq '.mcpServers.newserver = {
     "command": "node",
     "args": ["~/.claude/projects/mcp-server/dist/index.js"],
     "enabled": false
   }' ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json
   ```

3. **Test server standalone:**

   ```bash
   # Test MCP server responds correctly
   node ~/.claude/projects/mcp-server/dist/index.js
   ```

4. **Enable in settings:**

   ```bash
   jq '.mcpServers.newserver.enabled = true' \
     ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json
   ```

5. **Test integration:**
   ```bash
   # Restart Claude CLI and verify server connects
   # Test server tools/resources are accessible
   ```

### Updating MCP Server Configuration

**Safe Update Procedure:**

1. **Backup current config:**

   ```bash
   jq '.mcpServers.servername' ~/.claude/settings.json > /tmp/mcp-server-backup.json
   ```

2. **Update configuration:**

   ```bash
   jq '.mcpServers.servername.args = ["new", "args"]' \
     ~/.claude/settings.json > ~/.claude/settings.json.tmp
   mv ~/.claude/settings.json.tmp ~/.claude/settings.json
   ```

3. **Restart server:**

   ```bash
   # If managed by launchd:
   launchctl stop com.user.mcp.servername
   launchctl start com.user.mcp.servername

   # Otherwise restart Claude CLI
   ```

4. **Verify connection:**
   ```bash
   # Check server status in Claude CLI: /settings
   # Test server functionality
   ```

### Updating MCP Server Code

**Safe Update Procedure:**

1. **Backup current version:**

   ```bash
   cp -r ~/.claude/projects/mcp-server ~/.claude/projects/mcp-server.backup
   ```

2. **Update dependencies:**

   ```bash
   cd ~/.claude/projects/mcp-server
   pnpm update
   ```

3. **Pull latest changes:**

   ```bash
   git pull origin main
   ```

4. **Rebuild:**

   ```bash
   pnpm build
   ```

5. **Test standalone:**

   ```bash
   # Run server in test mode if available
   node dist/index.js --test
   ```

6. **Restart server:**

   ```bash
   launchctl restart com.user.mcp.servername
   ```

7. **Monitor logs:**
   ```bash
   tail -f ~/.claude/logs/mcp-servername.log
   ```

## Updating Auth Profiles

Auth profiles contain API keys and credentials.

### Adding a New Auth Profile

**Safe Update Procedure:**

1. **Backup auth profiles:**

   ```bash
   cp ~/.claude/auth-profiles.json ~/.claude/auth-profiles.json.backup
   chmod 600 ~/.claude/auth-profiles.json.backup
   ```

2. **Add new profile:**

   ```bash
   jq '.profiles.newprofile = {
     "provider": "anthropic",
     "key": "sk-ant-xxx"
   }' ~/.claude/auth-profiles.json > ~/.claude/auth-profiles.json.tmp
   mv ~/.claude/auth-profiles.json.tmp ~/.claude/auth-profiles.json
   chmod 600 ~/.claude/auth-profiles.json
   ```

3. **Test profile:**
   ```bash
   # Use profile in a test request
   # Verify authentication succeeds
   ```

### Rotating API Keys

**Safe Update Procedure:**

1. **Generate new key from provider:**
   - Go to provider's dashboard
   - Generate new API key
   - Keep old key active during transition

2. **Update auth profile with new key:**

   ```bash
   jq '.profiles.anthropic.key = "sk-ant-newkey"' \
     ~/.claude/auth-profiles.json > ~/.claude/auth-profiles.json.tmp
   mv ~/.claude/auth-profiles.json.tmp ~/.claude/auth-profiles.json
   chmod 600 ~/.claude/auth-profiles.json
   ```

3. **Test new key:**

   ```bash
   # Make test request using new key
   # Verify successful authentication
   ```

4. **Revoke old key:**
   - Only after confirming new key works
   - Revoke old key in provider's dashboard

5. **Monitor for errors:**
   ```bash
   # Watch logs for authentication failures
   # Some cached connections might still use old key
   ```

## Updating Project Configurations

Project-specific configurations inherit from global settings.

### Creating a New Project Configuration

**Safe Update Procedure:**

1. **Create project directory:**

   ```bash
   mkdir -p ~/.claude/projects/myproject
   ```

2. **Create project settings:**

   ```bash
   cat > ~/.claude/projects/myproject/settings.json << 'EOF'
   {
     "model": "claude-sonnet-4-6",
     "mcpServers": {
       "project-specific-server": {
         "command": "node",
         "args": ["server.js"]
       }
     }
   }
   EOF
   ```

3. **Test project isolation:**
   ```bash
   # Start Claude CLI in this project
   # Verify project settings override global settings correctly
   ```

### Updating Project Configuration

**Safe Update Procedure:**

1. **Backup project settings:**

   ```bash
   cp ~/.claude/projects/myproject/settings.json \
      ~/.claude/projects/myproject/settings.json.backup
   ```

2. **Make changes:**

   ```bash
   $EDITOR ~/.claude/projects/myproject/settings.json
   ```

3. **Validate JSON:**

   ```bash
   jq '.' ~/.claude/projects/myproject/settings.json >/dev/null
   ```

4. **Test in project context:**
   ```bash
   # Start Claude CLI in this project
   # Verify changes work as expected
   ```

## Rollback Procedures

### Quick Rollback from Backup

```bash
# Restore specific file
cp ~/.claude/settings.json.backup ~/.claude/settings.json

# Restore entire configuration
tar -xzf ~/.claude-backup-YYYYMMDD-HHMMSS.tar.gz -C ~/
```

### Rollback Using Git

If you track configuration in git:

```bash
cd ~/.claude
git status
git diff settings.json
git restore settings.json  # Discard changes
git restore .              # Discard all changes
git log --oneline -10      # Find commit to restore
git checkout abc123 -- settings.json  # Restore specific file from commit
```

### Partial Rollback

If only part of a change needs rollback:

```bash
# Extract specific field from backup
jq '.mcpServers' ~/.claude/settings.json.backup > /tmp/mcp-backup.json

# Merge back into current settings
jq '.mcpServers = $mcp' --slurpfile mcp /tmp/mcp-backup.json \
  ~/.claude/settings.json > ~/.claude/settings.json.tmp
mv ~/.claude/settings.json.tmp ~/.claude/settings.json
```

### Emergency Recovery

If configuration is completely broken:

1. **Stop all Claude CLI processes:**

   ```bash
   pkill -9 -f claude
   ```

2. **Move broken configuration aside:**

   ```bash
   mv ~/.claude ~/.claude.broken
   ```

3. **Restore from backup:**

   ```bash
   tar -xzf ~/.claude-backup-YYYYMMDD.tar.gz -C ~/
   ```

4. **Verify restoration:**

   ```bash
   ~/.claude/scripts/claude-health-check.sh
   ```

5. **Investigate failure:**
   ```bash
   # Compare broken vs restored configuration
   diff -r ~/.claude ~/.claude.broken
   ```

## Best Practices

1. **Always backup before changes** - Even "small" changes can have unexpected effects
2. **Test in isolation** - Use test projects to validate changes before production
3. **Make incremental changes** - One change at a time makes troubleshooting easier
4. **Document changes** - Keep a log of what you changed and why
5. **Monitor after deployment** - Watch logs closely after any configuration change
6. **Keep backups organized** - Use timestamps in backup filenames
7. **Validate JSON** - Always validate JSON syntax before and after editing
8. **Use version control** - Track configuration changes in git if possible
9. **Plan rollback strategy** - Know how you'll rollback before making changes
10. **Communicate changes** - If working in a team, notify others of configuration changes

## Troubleshooting

### Change Not Taking Effect

```bash
# Verify file was actually saved
cat ~/.claude/settings.json | jq '.changedField'

# Restart Claude CLI to reload settings
pkill -f claude

# Check for syntax errors
jq '.' ~/.claude/settings.json

# Verify file permissions
ls -la ~/.claude/settings.json
```

### Configuration Syntax Errors

```bash
# Find syntax error location
jq '.' ~/.claude/settings.json 2>&1 | head -20

# Use online JSON validator for complex issues
# Copy settings.json content to jsonlint.com

# Restore from backup and try again
cp ~/.claude/settings.json.backup ~/.claude/settings.json
```

### MCP Server Won't Start After Update

```bash
# Check server logs
tail -100 ~/.claude/logs/mcp-servername.log

# Test server standalone
node ~/.claude/projects/mcp-server/dist/index.js

# Verify dependencies installed
cd ~/.claude/projects/mcp-server && pnpm install

# Check configuration syntax
jq '.mcpServers.servername' ~/.claude/settings.json
```

### Hook Causing Errors

```bash
# Temporarily disable hook
mv ~/.claude/hooks/problematic-hook.ts ~/.claude/hooks/problematic-hook.ts.disabled

# Check hook logs
tail -100 ~/.claude/logs/hooks.log

# Test hook in isolation
node ~/.claude/hooks/problematic-hook.ts

# Fix and re-enable
mv ~/.claude/hooks/problematic-hook.ts.disabled ~/.claude/hooks/problematic-hook.ts
```
