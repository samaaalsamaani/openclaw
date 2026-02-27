# Claude Configuration Scripts

This document describes the automation scripts included with the Claude configuration audit.

## Installation

All scripts should be installed to `~/.claude/scripts/`:

```bash
# Copy from this repository
cp scripts/* ~/.claude/scripts/
chmod +x ~/.claude/scripts/*.sh
```

## Health Check Script

**Location:** `~/.claude/scripts/claude-health-check.sh`

Comprehensive validation of your Claude CLI configuration.

### Usage

```bash
# Run health check
~/.claude/scripts/claude-health-check.sh
```

### What It Checks

1. **Core Configuration Files**
   - `~/.claude/settings.json` exists and is valid JSON
   - `~/.claude/auth-profiles.json` exists with secure permissions
   - File permissions are correct

2. **MCP Server Configuration**
   - All configured MCP servers have valid commands
   - Server executables exist and are accessible

3. **Hooks Configuration**
   - Hook files exist at configured paths
   - Hook files have valid extensions (.ts or .js)

4. **Skills Configuration**
   - Skill directories exist
   - `skill.json` files exist and are valid
   - Skill handlers are present

5. **Project Configurations**
   - All projects have valid settings.json (if present)
   - JSON syntax is correct

6. **Directory Structure**
   - Required directories exist
   - Optional directories are noted

7. **Disk Space**
   - Reports total Claude directory size
   - Warns if conversations directory is large (>1GB)

8. **Validator Scripts**
   - Checks for presence of validator scripts
   - Verifies scripts are executable

9. **Common Issues**
   - Detects API keys in settings.json (should be in auth-profiles.json)
   - Checks for duplicate project names
   - Validates MCP server configurations

### Exit Codes

- `0`: Health check passed (with or without warnings)
- `1`: Health check failed (errors found)

### Output

Health check provides colored output:

- Green (✓): Passed checks
- Yellow (⚠): Warnings
- Red (✗): Failed checks
- Blue (ℹ): Informational messages

### Example Output

```
Claude Configuration Health Check
Started: Fri Feb 27 21:06:01 +03 2026

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Core Configuration Files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Global settings.json exists
  ✓ Global settings.json is valid JSON
  ✓ Global settings.json has correct permissions (644)
  ⚠ auth-profiles.json not found (optional but recommended)

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. Health Check Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Passed:   14
Warnings: 2
Failed:   0

✓ Health check PASSED with warnings - Review warnings above
```

### Automated Monitoring

You can run this script on a schedule:

**Using cron:**

```bash
# Daily at 9am
0 9 * * * ~/.claude/scripts/claude-health-check.sh >> ~/.claude/logs/health-check.log 2>&1
```

**Using launchd (macOS):**
See the example plist in [MAINTENANCE-CHECKLIST.md](MAINTENANCE-CHECKLIST.md#automated-monitoring)

## Fresh Install Setup Script

**Location:** `~/.claude/scripts/setup-fresh-install.sh`

Automated setup for a fresh Claude CLI installation with PAIOS best practices.

### Usage

```bash
# Dry-run (preview changes)
~/.claude/scripts/setup-fresh-install.sh --dry-run

# Actual installation
~/.claude/scripts/setup-fresh-install.sh

# Installation without backing up existing config
~/.claude/scripts/setup-fresh-install.sh --no-backup

# Quiet mode (less verbose)
~/.claude/scripts/setup-fresh-install.sh --quiet
```

### Options

- `--dry-run`: Preview changes without making them
- `--no-backup`: Don't backup existing configuration
- `--quiet`: Reduce output verbosity

### What It Does

1. **Creates Directory Structure**
   - `~/.claude/` (main directory)
   - `~/.claude/logs/` (log files)
   - `~/.claude/hooks/` (custom hooks)
   - `~/.claude/skills/` (custom skills)
   - `~/.claude/projects/` (project configurations)
   - `~/.claude/scripts/` (automation scripts)
   - `~/.claude/backups/` (configuration backups)

2. **Backs Up Existing Configuration**
   - Creates timestamped backup of `settings.json`
   - Stored in `~/.claude/backups/`

3. **Creates Minimal Configuration**
   - Creates `settings.json` with basic structure
   - Creates `auth-profiles.json` template
   - Sets secure file permissions (600 for auth-profiles)

4. **Installs Validation Scripts**
   - Attempts to copy validators from openclaw repo
   - Makes scripts executable

5. **Creates Example Hook**
   - `~/.claude/hooks/example-session-start.ts`
   - Demonstrates SessionStart hook structure
   - Includes comments and usage instructions

6. **Creates Example Skill**
   - `~/.claude/skills/hello/` directory
   - `skill.json` configuration
   - `handler.ts` implementation
   - Simple "Hello World" example

7. **Creates Maintenance Templates**
   - Cron job template (`maintenance-cron.txt`)
   - Launchd plist template (macOS only)
   - Ready to customize and install

8. **Runs Health Check**
   - Validates the fresh installation
   - Reports any issues found

### Example Output

```
╔══════════════════════════════════════════════════════╗
║  PAIOS Claude Configuration Fresh Install Setup    ║
╚══════════════════════════════════════════════════════╝

[INFO] Creating directory structure...
[OK] Directory already exists: /Users/user/.claude
[INFO] Creating directory: /Users/user/.claude/logs
[OK] Creating directory: /Users/user/.claude/logs - Done
...

╔══════════════════════════════════════════════════════╗
║  Setup Complete!                                    ║
╚══════════════════════════════════════════════════════╝

Next steps:

1. Update API key in ~/.claude/auth-profiles.json
2. Review and customize ~/.claude/settings.json
3. Install validation scripts from openclaw repo (if available)
4. Set up automated health checks (cron or launchd)
5. Review documentation:
   - docs/claude-config/README.md
   - docs/claude-config/QUICK-REFERENCE.md
   - docs/claude-config/BEST-PRACTICES.md

To validate your configuration:
  ~/.claude/scripts/claude-health-check.sh

[OK] Setup script completed successfully
```

### Post-Installation Steps

After running the setup script:

1. **Update API Key**

   ```bash
   $EDITOR ~/.claude/auth-profiles.json
   # Replace REPLACE_WITH_YOUR_API_KEY with your actual key
   ```

2. **Verify Installation**

   ```bash
   ~/.claude/scripts/claude-health-check.sh
   ```

3. **Review Configuration**

   ```bash
   jq '.' ~/.claude/settings.json
   ```

4. **Set Up Automation (Optional)**

   ```bash
   # Install cron job
   crontab -e
   # Add contents from ~/.claude/scripts/maintenance-cron.txt

   # Or install launchd (macOS)
   cp ~/.claude/scripts/com.user.claude.health-check.plist.template \
      ~/Library/LaunchAgents/com.user.claude.health-check.plist
   launchctl load ~/Library/LaunchAgents/com.user.claude.health-check.plist
   ```

## Validator Scripts

The setup script can install these validators from the openclaw repository:

- `validate-all-configs.sh` - Run all validators
- `validate-settings.sh` - Validate settings.json
- `validate-hooks.sh` - Validate hook configurations
- `validate-skills.sh` - Validate skill configurations
- `validate-mcp.sh` - Validate MCP server configurations

These scripts are located in the openclaw repository at:

```
openclaw/.worktrees/claude-config-audit/scripts/
```

## Integration with PAIOS

These scripts are designed to work with the PAIOS system:

### Daily Tasks Integration

Add to your daily tasks script:

```bash
# Run Claude health check
~/.claude/scripts/claude-health-check.sh
```

### Weekly Tasks Integration

Add to your weekly tasks script:

```bash
# Backup Claude configuration
tar -czf ~/.claude/backups/claude-backup-$(date +%Y%m%d).tar.gz ~/.claude

# Run comprehensive validation
~/.claude/scripts/validate-all-configs.sh
```

### Monthly Maintenance

See [MAINTENANCE-CHECKLIST.md](MAINTENANCE-CHECKLIST.md#monthly-maintenance) for monthly tasks.

## Troubleshooting

### Health Check Reports Failures

1. Review the specific failure messages
2. Consult [UPDATE-PROCEDURES.md](UPDATE-PROCEDURES.md#troubleshooting)
3. Fix issues one at a time
4. Re-run health check after each fix

### Setup Script Fails

1. Run with `--dry-run` to see what would be done
2. Check permissions on `~/.claude` directory
3. Verify `jq` is installed: `command -v jq`
4. Review error messages for specific issues

### Validators Not Found

The validators are optional. To install them:

1. Clone or download the openclaw repository
2. Copy validators from `.worktrees/claude-config-audit/scripts/`
3. Make them executable: `chmod +x ~/.claude/scripts/validate-*.sh`

## Script Development

### Adding New Scripts

When adding new automation scripts:

1. Place in `~/.claude/scripts/`
2. Make executable: `chmod +x script.sh`
3. Add shebang: `#!/usr/bin/env bash`
4. Set safe defaults: `set -uo pipefail`
5. Add help text and usage examples
6. Include dry-run mode if making changes
7. Document in this file

### Best Practices

- Use colored output for clarity (GREEN, YELLOW, RED)
- Provide verbose and quiet modes
- Always support `--dry-run` for destructive operations
- Exit with appropriate codes (0 = success, 1 = failure)
- Log to `~/.claude/logs/` for automated runs
- Include progress messages
- Validate inputs before processing
- Back up before modifying configuration

## See Also

- [Maintenance Checklist](MAINTENANCE-CHECKLIST.md) - Regular maintenance procedures
- [Update Procedures](UPDATE-PROCEDURES.md) - Safe update workflows
- [Best Practices](BEST-PRACTICES.md) - Configuration best practices
- [Configuration Reference](CONFIG-REFERENCE.md) - Complete settings reference
