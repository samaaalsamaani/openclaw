---
name: Claude Configuration Issue
about: Report issues with Claude CLI configuration, settings, hooks, skills, or MCP servers
title: "[Config] "
labels: "claude-config, needs-triage"
assignees: ""
---

## Issue Type

Please select the type of configuration issue:

- [ ] Settings not loading or being ignored
- [ ] Hook not executing or causing errors
- [ ] Skill not found or failing
- [ ] MCP server connection issues
- [ ] Auth/credential problems
- [ ] Configuration validation errors
- [ ] Documentation issue
- [ ] Other (please describe)

## Environment

**Claude CLI Version:**

```bash
claude --version
```

**Platform:**

- [ ] macOS
- [ ] Linux
- [ ] Windows

**Project Context:**

- [ ] Global configuration (`~/.claude/settings.json`)
- [ ] Project-specific configuration
- [ ] Both global and project settings

## Configuration Details

### Settings File Location

Which configuration file is affected?

```bash
# Example: ~/.claude/settings.json
# Or: ~/.claude/projects/myproject/settings.json
```

### Relevant Configuration

Please provide the relevant section of your configuration (redact any secrets):

```json
{
  "relevant": "configuration section here"
}
```

## Issue Description

### What Happened

A clear description of the issue you're experiencing.

### What You Expected

What you expected to happen instead.

### Steps to Reproduce

1. Edit configuration file X
2. Add/modify setting Y
3. Restart Claude CLI
4. Observe issue Z

### Error Messages

If applicable, include any error messages or logs:

```
Error messages here
```

## Validation Results

### Configuration Validation

Did you run configuration validation? If so, what were the results?

```bash
~/.claude/scripts/validate-all-configs.sh
```

Output:

```
Validation output here
```

### Health Check

Did you run the health check? Results:

```bash
~/.claude/scripts/claude-health-check.sh
```

Output:

```
Health check output here
```

## Attempted Solutions

What have you tried to fix this issue?

- [ ] Validated JSON syntax
- [ ] Checked file permissions
- [ ] Restarted Claude CLI
- [ ] Reviewed documentation
- [ ] Restored from backup
- [ ] Other (describe below)

Details:

## Additional Context

### Related Documentation

Which documentation did you reference?

- [ ] [Configuration Reference](../docs/claude-config/CONFIG-REFERENCE.md)
- [ ] [Best Practices](../docs/claude-config/BEST-PRACTICES.md)
- [ ] [Skills Guide](../docs/claude-config/SKILLS-GUIDE.md)
- [ ] [Hooks Playbook](../docs/claude-config/HOOKS-PLAYBOOK.md)
- [ ] [MCP Servers](../docs/claude-config/MCP-SERVERS.md)
- [ ] Other (specify)

### Hook-Specific Issues

If this is a hook issue, provide:

**Hook Type:**

- [ ] PreToolUse
- [ ] PostToolUse
- [ ] SessionStart
- [ ] SessionEnd
- [ ] Other

**Hook File:**

```typescript
// Include hook code (if not sensitive)
```

### Skill-Specific Issues

If this is a skill issue, provide:

**Skill Name:**

**Skill Configuration:**

```json
{
  "skill": "configuration"
}
```

**Skill Code:**

```typescript
// Include relevant skill code
```

### MCP Server Issues

If this is an MCP server issue, provide:

**Server Name:**

**Server Configuration:**

```json
{
  "command": "...",
  "args": []
}
```

**Server Logs:**

```
Recent logs from ~/.claude/logs/mcp-*.log
```

### Auth Profile Issues

If this is an auth/credential issue:

**Provider:**

**Auth Configuration (redact keys):**

```json
{
  "provider": "...",
  "key": "REDACTED"
}
```

**Error:**

```
Authentication error message
```

## System Information

### Configuration Files

List all configuration files in your setup:

```bash
find ~/.claude -name "settings.json" -o -name "auth-profiles.json"
```

Output:

```
File listing here
```

### File Permissions

```bash
ls -la ~/.claude/settings.json
ls -la ~/.claude/auth-profiles.json
```

Output:

```
Permission listing here
```

### Recent Changes

Did you recently change your configuration? What changed?

## Screenshots

If applicable, add screenshots to help explain the problem.

## Backup Information

Do you have a backup of your working configuration?

- [ ] Yes, from [date]
- [ ] No
- [ ] Not applicable

## Impact Assessment

How is this issue affecting your work?

- [ ] Blocking - Cannot use Claude CLI at all
- [ ] High - Major functionality broken
- [ ] Medium - Inconvenient but can work around
- [ ] Low - Minor annoyance

## Proposed Solution

If you have ideas about what might fix this issue, describe them here.

## Related Issues

Are there any related issues or pull requests?

- #issue_number
- Related to #other_issue

---

**Before submitting:**

- [ ] I have searched existing issues for duplicates
- [ ] I have validated my JSON configuration
- [ ] I have run the health check script
- [ ] I have reviewed relevant documentation
- [ ] I have redacted all sensitive information (API keys, credentials)
- [ ] I have included enough context for reproduction
