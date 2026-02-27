# Claude Code Operational Scripts

Operational scripts for managing Claude Code configuration, located in `~/.claude/scripts/`.

## Configuration Management

### validate-config.sh

Validates Claude Code configuration integrity.

**Location:** `~/.claude/scripts/validate-config.sh`

**Features:**

- Validates `settings.json` JSON syntax and structure
- Checks hook scripts for executability
- Validates MCP server configurations
- Checks skills directory and files
- Validates projects directory
- Color-coded output with errors and warnings

**Usage:**

```bash
~/.claude/scripts/validate-config.sh
```

**Exit codes:**

- `0` - All validations passed (or warnings only)
- `1` - Validation errors found

### backup-config.sh

Creates timestamped backups of Claude Code configuration.

**Location:** `~/.claude/scripts/backup-config.sh`

**What's backed up:**

- `settings.json`
- `hooks/` directory
- `skills/` directory
- Project metadata (`.json` and `.md` files only)
- MCP configuration (if present)

**Usage:**

```bash
~/.claude/scripts/backup-config.sh
```

**Output:**

- Creates `~/.claude/backups/claude-config-YYYYMMDD-HHMMSS.tar.gz`
- Includes manifest file with backup metadata
- Shows backup size and restore command

### restore-config.sh

Restores Claude Code configuration from a backup.

**Location:** `~/.claude/scripts/restore-config.sh`

**Features:**

- Lists available backups
- Shows backup manifest before restore
- Requires confirmation before overwriting
- Restores all backed-up components
- Makes hooks executable after restore

**Usage:**

```bash
~/.claude/scripts/restore-config.sh <backup-name>
```

**Example:**

```bash
~/.claude/scripts/restore-config.sh claude-config-20260227-205009
```

**Safety:**

- Warns before overwriting current configuration
- Requires explicit "yes" confirmation
- Skips project data restore (metadata only)

## Installation

The operational scripts are installed in `~/.claude/scripts/` and are not tracked in the repository. They are designed to be standalone utilities for managing Claude Code configuration.

To ensure scripts are executable:

```bash
chmod +x ~/.claude/scripts/*.sh
```

## Best Practices

1. **Regular Backups:** Run `backup-config.sh` before major configuration changes
2. **Validation:** Run `validate-config.sh` after editing configuration files
3. **Version Control:** Keep backup tarballs in `~/.claude/backups/` for rollback capability
4. **Testing:** Test configuration changes in a backup before applying to production

## Script Dependencies

All scripts require:

- Bash 4.0+
- `jq` (for JSON validation)
- Standard Unix utilities (`tar`, `cp`, `find`)

## Configuration Templates

Configuration templates are available in `~/.claude/config-templates/`:

- `paios-config.json` - Complete PAIOS configuration snapshot
- `minimal-config.json` - Minimal working configuration
- `keybindings-essential.json` - Recommended keybindings
- `mcp-paios.json` - MCP server configurations
- `README.md` - Template usage guide

See the templates README for usage instructions and best practices.

### monitor-hooks.sh

Monitors hook execution and performance.

**Location:** `~/.claude/scripts/monitor-hooks.sh`

**Features:**

- Analyzes hook execution from logs and configuration
- Checks hook scripts for error handling
- Detects blocking operations (sleep, HTTP without timeout)
- Shows configured hooks from settings.json
- Reports background execution usage
- Provides performance recommendations

**Usage:**

```bash
~/.claude/scripts/monitor-hooks.sh
```

**Checks performed:**

- Hook script modification times
- Error handling presence (`set -e`)
- Blocking operations (sleep, curl without timeout)
- Background execution patterns
- Hook count and consolidation opportunities

### check-mcp-servers.sh

Validates MCP server connectivity and configuration.

**Location:** `~/.claude/scripts/check-mcp-servers.sh`

**Features:**

- Validates MCP configuration JSON syntax
- Lists all configured MCP servers
- Checks if server commands are available
- Validates environment variables and paths
- Tests server-specific requirements (npx, credentials)
- Shows Claude Desktop running status

**Usage:**

```bash
~/.claude/scripts/check-mcp-servers.sh
```

**Checks performed:**

- MCP config file exists at `~/.config/claude/claude_desktop_config.json`
- JSON syntax validation
- Command availability (npx, node, python, etc.)
- Environment variable resolution
- Credential file paths
- Claude Desktop process status

## Future Enhancements

Planned operational tools (not yet implemented):

- `organize-skills.sh` - Skills organization and categorization
