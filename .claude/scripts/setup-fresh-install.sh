#!/usr/bin/env bash
#
# Fresh Install Setup Automation for PAIOS Claude Configuration
# Sets up a complete Claude CLI environment with best practices
#
# Usage: ~/.claude/scripts/setup-fresh-install.sh [--dry-run]

set -uo pipefail

# Configuration
DRY_RUN=false
BACKUP_EXISTING=true
VERBOSE=true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-backup)
            BACKUP_EXISTING=false
            shift
            ;;
        --quiet)
            VERBOSE=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--dry-run] [--no-backup] [--quiet]"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

run_command() {
    local cmd="$1"
    local desc="$2"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would run: $cmd"
        return 0
    fi

    log_info "$desc"
    # Execute command directly without eval to avoid code injection
    if bash -c "$cmd"; then
        log_success "$desc - Done"
        return 0
    else
        log_error "$desc - Failed"
        return 1
    fi
}

# Banner
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PAIOS Claude Configuration Fresh Install Setup    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == true ]]; then
    log_warn "Running in DRY-RUN mode - no changes will be made"
    echo ""
fi

# 1. Create directory structure
log_info "Creating directory structure..."

DIRS=(
    "$HOME/.claude"
    "$HOME/.claude/logs"
    "$HOME/.claude/hooks"
    "$HOME/.claude/skills"
    "$HOME/.claude/projects"
    "$HOME/.claude/scripts"
    "$HOME/.claude/backups"
)

for dir in "${DIRS[@]}"; do
    if [[ ! -d "$dir" ]]; then
        run_command "mkdir -p '$dir'" "Creating directory: $dir"
    else
        log_success "Directory already exists: $dir"
    fi
done

# 2. Backup existing configuration
if [[ "$BACKUP_EXISTING" == true ]] && [[ -f "$HOME/.claude/settings.json" ]]; then
    BACKUP_FILE="$HOME/.claude/backups/settings.json.backup-$(date +%Y%m%d-%H%M%S)"
    run_command "cp '$HOME/.claude/settings.json' '$BACKUP_FILE'" "Backing up existing settings.json"
fi

# 3. Create minimal settings.json if not exists
if [[ ! -f "$HOME/.claude/settings.json" ]]; then
    log_info "Creating minimal settings.json..."

    if [[ "$DRY_RUN" == false ]]; then
        cat > "$HOME/.claude/settings.json" << 'EOF'
{
  "model": "claude-sonnet-4-6",
  "hooks": {},
  "mcpServers": {},
  "skills": {}
}
EOF
        chmod 644 "$HOME/.claude/settings.json"
        log_success "Created minimal settings.json"
    else
        log_info "[DRY-RUN] Would create minimal settings.json"
    fi
else
    log_success "settings.json already exists"
fi

# 4. Create auth-profiles.json template if not exists
if [[ ! -f "$HOME/.claude/auth-profiles.json" ]]; then
    log_info "Creating auth-profiles.json template..."

    if [[ "$DRY_RUN" == false ]]; then
        cat > "$HOME/.claude/auth-profiles.json" << 'EOF'
{
  "profiles": {
    "anthropic:default": {
      "provider": "anthropic",
      "key": "REPLACE_WITH_YOUR_API_KEY"
    }
  }
}
EOF
        chmod 600 "$HOME/.claude/auth-profiles.json"
        log_success "Created auth-profiles.json template"
        log_warn "Remember to update API key in ~/.claude/auth-profiles.json"
    else
        log_info "[DRY-RUN] Would create auth-profiles.json template"
    fi
else
    log_success "auth-profiles.json already exists"

    # Verify permissions
    PERMS=$(stat -f "%OLp" "$HOME/.claude/auth-profiles.json" 2>/dev/null || stat -c "%a" "$HOME/.claude/auth-profiles.json" 2>/dev/null)
    if [[ "$PERMS" != "600" ]]; then
        run_command "chmod 600 '$HOME/.claude/auth-profiles.json'" "Fixing auth-profiles.json permissions"
    fi
fi

# 5. Install validation scripts
log_info "Installing validation scripts..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if we're running from the openclaw repo
REPO_DIR=""
if [[ -f "$SCRIPT_DIR/../../.git/config" ]]; then
    # Running from openclaw repo worktree
    REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
elif [[ -f "$HOME/Desktop/projects/openclaw/.git/config" ]]; then
    # Default location
    REPO_DIR="$HOME/Desktop/projects/openclaw"
fi

if [[ -n "$REPO_DIR" ]] && [[ -d "$REPO_DIR/.worktrees/claude-config-audit/scripts" ]]; then
    log_info "Found validation scripts in openclaw repo"

    # Copy validation scripts
    VALIDATORS=(
        "validate-all-configs.sh"
        "validate-settings.sh"
        "validate-hooks.sh"
        "validate-skills.sh"
        "validate-mcp.sh"
    )

    for validator in "${VALIDATORS[@]}"; do
        SRC="$REPO_DIR/.worktrees/claude-config-audit/scripts/$validator"
        DST="$HOME/.claude/scripts/$validator"

        if [[ -f "$SRC" ]]; then
            run_command "cp '$SRC' '$DST' && chmod +x '$DST'" "Installing $validator"
        else
            log_warn "Validator not found: $validator"
        fi
    done
else
    log_warn "Validation scripts not found in openclaw repo"
    log_info "You can install them manually from the repository"
fi

# 6. Create example hook
log_info "Creating example hook..."

EXAMPLE_HOOK="$HOME/.claude/hooks/example-session-start.ts"
if [[ ! -f "$EXAMPLE_HOOK" ]] && [[ "$DRY_RUN" == false ]]; then
    cat > "$EXAMPLE_HOOK" << 'EOF'
/**
 * Example SessionStart hook
 * This hook runs when a Claude CLI session starts
 */

export async function onSessionStart(context: any) {
  console.log('Session started!');
  console.log('Project:', context.project);
  console.log('Timestamp:', new Date().toISOString());

  // You can inject context, load data, etc.
  // Return modified context or null
  return context;
}
EOF
    chmod 644 "$EXAMPLE_HOOK"
    log_success "Created example hook: $EXAMPLE_HOOK"
    log_info "To enable, add to settings.json: {\"hooks\": {\"SessionStart\": \"$EXAMPLE_HOOK\"}}"
else
    log_success "Example hook already exists or skipped (dry-run)"
fi

# 7. Create example skill
log_info "Creating example skill..."

EXAMPLE_SKILL_DIR="$HOME/.claude/skills/hello"
if [[ ! -d "$EXAMPLE_SKILL_DIR" ]] && [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$EXAMPLE_SKILL_DIR"

    # skill.json
    cat > "$EXAMPLE_SKILL_DIR/skill.json" << 'EOF'
{
  "name": "hello",
  "description": "Example skill that says hello",
  "command": "hello",
  "handler": "handler.ts"
}
EOF

    # handler.ts
    cat > "$EXAMPLE_SKILL_DIR/handler.ts" << 'EOF'
/**
 * Example skill handler
 */

export async function execute(args: string[]) {
  const name = args[0] || 'World';
  console.log(`Hello, ${name}!`);
  return { success: true, message: `Greeted ${name}` };
}
EOF

    chmod 644 "$EXAMPLE_SKILL_DIR/skill.json"
    chmod 644 "$EXAMPLE_SKILL_DIR/handler.ts"

    log_success "Created example skill: $EXAMPLE_SKILL_DIR"
    log_info "To enable, add to settings.json: {\"skills\": {\"hello\": \"$EXAMPLE_SKILL_DIR\"}}"
else
    log_success "Example skill already exists or skipped (dry-run)"
fi

# 8. Create maintenance cron job template
log_info "Creating maintenance cron template..."

CRON_TEMPLATE="$HOME/.claude/scripts/maintenance-cron.txt"
if [[ ! -f "$CRON_TEMPLATE" ]] && [[ "$DRY_RUN" == false ]]; then
    cat > "$CRON_TEMPLATE" << 'EOF'
# Claude Configuration Maintenance Cron Jobs
# Install with: crontab -e
# Or on macOS, create a launchd plist

# Daily health check at 9am
0 9 * * * ~/.claude/scripts/claude-health-check.sh >> ~/.claude/logs/health-check.log 2>&1

# Weekly backup on Sunday at 3am
0 3 * * 0 tar -czf ~/.claude/backups/claude-backup-$(date +\%Y\%m\%d).tar.gz ~/.claude

# Monthly cleanup of old backups (keep last 3 months)
0 4 1 * * find ~/.claude/backups -name "claude-backup-*.tar.gz" -mtime +90 -delete
EOF
    chmod 644 "$CRON_TEMPLATE"
    log_success "Created cron template: $CRON_TEMPLATE"
    log_info "Review and install cron jobs as needed"
else
    log_success "Cron template already exists or skipped (dry-run)"
fi

# 9. Create launchd plist template (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    log_info "Creating launchd plist template (macOS)..."

    PLIST_TEMPLATE="$HOME/.claude/scripts/com.user.claude.health-check.plist.template"
    if [[ ! -f "$PLIST_TEMPLATE" ]] && [[ "$DRY_RUN" == false ]]; then
        cat > "$PLIST_TEMPLATE" << EOF
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
        <string>$HOME/.claude/scripts/claude-health-check.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$HOME/.claude/logs/health-check.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.claude/logs/health-check.err</string>
</dict>
</plist>
EOF
        chmod 644 "$PLIST_TEMPLATE"
        log_success "Created launchd plist template: $PLIST_TEMPLATE"
        log_info "To install: cp $PLIST_TEMPLATE ~/Library/LaunchAgents/com.user.claude.health-check.plist"
        log_info "Then: launchctl load ~/Library/LaunchAgents/com.user.claude.health-check.plist"
    else
        log_success "Launchd plist template already exists or skipped (dry-run)"
    fi
fi

# 10. Run validation
echo ""
log_info "Running configuration validation..."

if [[ -x "$HOME/.claude/scripts/claude-health-check.sh" ]]; then
    if [[ "$DRY_RUN" == false ]]; then
        "$HOME/.claude/scripts/claude-health-check.sh" || true
    else
        log_info "[DRY-RUN] Would run health check"
    fi
else
    log_warn "Health check script not found or not executable"
fi

# 11. Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup Complete!                                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ "$DRY_RUN" == false ]]; then
    echo "Next steps:"
    echo ""
    echo "1. Update API key in ~/.claude/auth-profiles.json"
    echo "2. Review and customize ~/.claude/settings.json"
    echo "3. Install validation scripts from openclaw repo (if available)"
    echo "4. Set up automated health checks (cron or launchd)"
    echo "5. Review documentation:"
    echo "   - docs/claude-config/README.md"
    echo "   - docs/claude-config/QUICK-REFERENCE.md"
    echo "   - docs/claude-config/BEST-PRACTICES.md"
    echo ""
    echo "To validate your configuration:"
    echo "  ~/.claude/scripts/claude-health-check.sh"
    echo ""
else
    echo "Dry-run complete. No changes were made."
    echo "Run without --dry-run to apply changes."
    echo ""
fi

log_success "Setup script completed successfully"
