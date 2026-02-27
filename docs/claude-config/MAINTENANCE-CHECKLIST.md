# Claude Configuration Maintenance Checklist

This checklist helps maintain a healthy Claude CLI configuration over time.

## Weekly Maintenance

### Configuration Health

- [ ] Run health check script: `~/.claude/scripts/claude-health-check.sh`
- [ ] Review any warnings or errors reported
- [ ] Check disk space usage: `du -sh ~/.claude`
- [ ] Verify all launchd services are running (if applicable)

### MCP Server Status

- [ ] Test each MCP server connection:
  ```bash
  # From Claude CLI
  /settings
  # Check all MCP servers show "connected"
  ```
- [ ] Review MCP server logs for errors:
  ```bash
  tail -50 ~/.claude/logs/mcp-*.log
  ```
- [ ] Restart any failed servers:
  ```bash
  pkill -f "node.*knowledge-base-server"
  # Or restart via launchd if configured
  ```

### Skill & Hook Validation

- [ ] Verify custom skills are accessible: `/skills`
- [ ] Check hook execution logs (if logging enabled)
- [ ] Test critical workflows (KB ingestion, routing, etc.)

## Monthly Maintenance

### Configuration Review

- [ ] Review and prune unused custom skills
- [ ] Review and optimize hook configurations
- [ ] Check for deprecated settings in `settings.json`
- [ ] Review auth-profiles for expired credentials
- [ ] Audit model configurations for cost optimization

### Security Audit

- [ ] Rotate API keys if needed
- [ ] Review file permissions on sensitive configs:
  ```bash
  ls -la ~/.claude/auth-profiles.json
  ls -la ~/.claude/projects/*/credentials/
  ```
- [ ] Check for hardcoded secrets in custom scripts
- [ ] Review MCP server security settings

### Performance Review

- [ ] Analyze conversation history size: `du -sh ~/.claude/conversations/`
- [ ] Clean up old conversations if needed
- [ ] Review skill execution times (check logs)
- [ ] Optimize slow MCP server queries

### Documentation Updates

- [ ] Update custom skill documentation if changed
- [ ] Document any new workflow patterns discovered
- [ ] Update team knowledge base with configuration insights

## Quarterly Maintenance

### Deep Configuration Audit

- [ ] Run full configuration validation:
  ```bash
  ~/.claude/scripts/validate-all-configs.sh
  ```
- [ ] Compare current config against best practices
- [ ] Review all deprecated features and plan migrations
- [ ] Audit project-specific configurations

### Integration Testing

- [ ] Test all MCP server integrations end-to-end
- [ ] Verify cross-project configuration inheritance
- [ ] Test skill chaining and complex workflows
- [ ] Validate hook trigger conditions

### Backup & Recovery

- [ ] Backup entire configuration directory:
  ```bash
  tar -czf ~/.claude-backup-$(date +%Y%m%d).tar.gz ~/.claude
  ```
- [ ] Test configuration restore procedure
- [ ] Document any new backup exclusions
- [ ] Verify backup automation (if configured)

### Dependency Updates

- [ ] Check for Claude CLI updates: `claude --version`
- [ ] Update MCP server dependencies:
  ```bash
  cd ~/.claude/projects/knowledge-base && pnpm update
  ```
- [ ] Review changelog for breaking changes
- [ ] Test configuration after updates

## Post-Update Checklist

Run this checklist after updating Claude CLI or major dependencies.

### Pre-Update Preparation

- [ ] Backup current configuration (see Quarterly backup steps)
- [ ] Document current version: `claude --version > ~/.claude/pre-update-version.txt`
- [ ] Review update changelog for breaking changes
- [ ] Plan rollback strategy if needed

### Update Execution

- [ ] Update Claude CLI
- [ ] Run health check immediately: `~/.claude/scripts/claude-health-check.sh`
- [ ] Check for configuration migration warnings
- [ ] Review deprecated setting notices

### Post-Update Validation

- [ ] Verify all settings migrated correctly:
  ```bash
  jq '.' ~/.claude/settings.json
  ```
- [ ] Test MCP server connections: `/settings`
- [ ] Verify custom skills still work: `/skills`
- [ ] Test critical workflows end-to-end
- [ ] Check hook execution (trigger test events)

### Post-Update Cleanup

- [ ] Remove deprecated settings if safe
- [ ] Update custom scripts for API changes
- [ ] Update documentation for new features
- [ ] Report any issues to team/repository

## Emergency Procedures

### Configuration Corruption

1. Stop all Claude CLI processes
2. Restore from latest backup:
   ```bash
   cp -r ~/.claude ~/.claude.broken
   tar -xzf ~/.claude-backup-YYYYMMDD.tar.gz -C ~/
   ```
3. Verify restoration: `~/.claude/scripts/claude-health-check.sh`
4. Investigate corruption cause in `~/.claude.broken/`

### MCP Server Failure

1. Check server logs: `tail -100 ~/.claude/logs/mcp-*.log`
2. Restart server:
   ```bash
   pkill -f "node.*failing-server"
   launchctl start com.user.mcp.failing-server  # if launchd managed
   ```
3. If persistent, disable server temporarily in `settings.json`
4. File issue with server maintainer

### Skill Execution Failure

1. Test skill in isolation: `/skill-name test`
2. Check skill code for errors
3. Review recent changes: `git log ~/.claude/skills/skill-name/`
4. Disable skill if blocking critical work
5. Debug and fix, or rollback to working version

## Automated Monitoring

Consider setting up automated monitoring for:

- Daily health check execution (via cron/launchd)
- MCP server uptime monitoring
- Configuration file change detection
- Disk space alerts
- API quota usage tracking

Example launchd plist for daily health check:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.claude.health-check</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-l</string>
        <string>-c</string>
        <string>~/.claude/scripts/claude-health-check.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/claude-health-check.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-health-check.err</string>
</dict>
</plist>
```

## Maintenance Log

Keep a maintenance log to track activities:

```bash
# Add to ~/.claude/maintenance.log
echo "$(date -Iseconds) - Weekly health check: OK" >> ~/.claude/maintenance.log
echo "$(date -Iseconds) - Updated MCP server: knowledge-base" >> ~/.claude/maintenance.log
echo "$(date -Iseconds) - Rotated API keys" >> ~/.claude/maintenance.log
```

Review this log monthly to identify patterns and optimization opportunities.
