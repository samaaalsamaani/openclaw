#!/usr/bin/env bash
#
# Claude Code Configuration Restore
# Restores a previously created backup
#

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
BACKUP_DIR="${CLAUDE_DIR}/backups"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <backup-name>"
    echo ""
    echo "Available backups:"
    if [[ -d "${BACKUP_DIR}" ]]; then
        ls -1 "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | xargs -n1 basename | sed 's/.tar.gz$//' || echo "  (none)"
    else
        echo "  (none)"
    fi
    exit 1
}

if [[ $# -eq 0 ]]; then
    usage
fi

BACKUP_NAME="$1"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

echo -e "${BLUE}=== Claude Code Configuration Restore ===${NC}\n"

# Validate backup exists
if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo -e "${RED}Error: Backup not found: ${BACKUP_FILE}${NC}"
    echo ""
    usage
fi

# Show manifest
echo "Backup information:"
echo ""
TEMP_DIR=$(mktemp -d)
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"
if [[ -f "${TEMP_DIR}/${BACKUP_NAME}/MANIFEST.txt" ]]; then
    cat "${TEMP_DIR}/${BACKUP_NAME}/MANIFEST.txt"
fi
echo ""

# Confirm restore
echo -e "${YELLOW}WARNING: This will overwrite your current configuration!${NC}"
read -p "Continue with restore? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled."
    rm -rf "${TEMP_DIR}"
    exit 0
fi

echo "Restoring configuration..."
echo ""

# Restore settings.json
if [[ -f "${TEMP_DIR}/${BACKUP_NAME}/settings.json" ]]; then
    cp "${TEMP_DIR}/${BACKUP_NAME}/settings.json" "${CLAUDE_DIR}/"
    echo -e "${GREEN}✓${NC} Restored settings.json"
fi

# Restore hooks directory
if [[ -d "${TEMP_DIR}/${BACKUP_NAME}/hooks" ]]; then
    # Validate hooks directory exists and is within CLAUDE_DIR before removing
    if [[ -d "${CLAUDE_DIR}/hooks" ]] && [[ "${CLAUDE_DIR}/hooks" == "${CLAUDE_DIR}"/* ]]; then
        rm -rf "${CLAUDE_DIR}/hooks"
    fi
    cp -R "${TEMP_DIR}/${BACKUP_NAME}/hooks" "${CLAUDE_DIR}/"
    # Ensure hooks are executable
    chmod +x "${CLAUDE_DIR}/hooks"/*.sh 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Restored hooks directory"
fi

# Restore skills directory
if [[ -d "${TEMP_DIR}/${BACKUP_NAME}/skills" ]]; then
    # Validate skills directory exists and is within CLAUDE_DIR before removing
    if [[ -d "${CLAUDE_DIR}/skills" ]] && [[ "${CLAUDE_DIR}/skills" == "${CLAUDE_DIR}"/* ]]; then
        rm -rf "${CLAUDE_DIR}/skills"
    fi
    cp -R "${TEMP_DIR}/${BACKUP_NAME}/skills" "${CLAUDE_DIR}/"
    echo -e "${GREEN}✓${NC} Restored skills directory"
fi

# Restore project metadata
if [[ -d "${TEMP_DIR}/${BACKUP_NAME}/projects" ]]; then
    # Only restore metadata, don't overwrite project data
    echo -e "${YELLOW}⚠${NC} Project metadata restore skipped (manual merge recommended)"
fi

# Restore MCP configuration
if [[ -d "${TEMP_DIR}/${BACKUP_NAME}/mcp" ]]; then
    mkdir -p "${HOME}/.config/claude"
    cp "${TEMP_DIR}/${BACKUP_NAME}/mcp/claude_desktop_config.json" "${HOME}/.config/claude/"
    echo -e "${GREEN}✓${NC} Restored MCP configuration"
fi

# Cleanup
rm -rf "${TEMP_DIR}"

echo ""
echo -e "${GREEN}✓ Restore complete!${NC}"
echo ""
echo "Configuration restored from: ${BACKUP_NAME}"
echo ""
echo "You may need to restart Claude Code for changes to take effect."
