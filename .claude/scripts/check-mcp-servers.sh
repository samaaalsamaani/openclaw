#!/usr/bin/env bash
#
# Claude Code MCP Server Health Check
# Validates MCP server connectivity and configuration
#

set -euo pipefail

MCP_CONFIG="${HOME}/.config/claude/claude_desktop_config.json"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Claude Code MCP Server Health Check ===${NC}\n"

# Check if MCP config exists
if [[ ! -f "${MCP_CONFIG}" ]]; then
    echo -e "${RED}Error: MCP configuration not found${NC}"
    echo "Expected location: ${MCP_CONFIG}"
    echo ""
    echo "To create MCP configuration:"
    echo "  1. Create directory: mkdir -p ~/.config/claude"
    echo "  2. Copy template: cp ~/.claude/config-templates/mcp-paios.json ${MCP_CONFIG}"
    echo "  3. Edit configuration to add your MCP servers"
    exit 1
fi

# Validate JSON syntax
echo -e "${BLUE}Validating configuration...${NC}\n"

if ! jq empty "${MCP_CONFIG}" 2>/dev/null; then
    echo -e "${RED}✗ Invalid JSON in MCP configuration${NC}"
    exit 1
else
    echo -e "${GREEN}✓${NC} Configuration is valid JSON"
fi

# Check for mcpServers key
if ! jq -e '.mcpServers' "${MCP_CONFIG}" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} No mcpServers key found in configuration"
    exit 0
fi

# Count servers
SERVER_COUNT=$(jq '.mcpServers | length' "${MCP_CONFIG}")
echo -e "${GREEN}✓${NC} Found ${SERVER_COUNT} MCP server(s) configured"
echo ""

# Check each server
echo -e "${BLUE}MCP Server Status:${NC}\n"

jq -r '.mcpServers | keys[]' "${MCP_CONFIG}" | while read -r server; do
    echo -e "${BLUE}Server: ${server}${NC}"

    # Get server configuration
    COMMAND=$(jq -r ".mcpServers.\"${server}\".command" "${MCP_CONFIG}" 2>/dev/null)
    ARGS=$(jq -r ".mcpServers.\"${server}\".args | @json" "${MCP_CONFIG}" 2>/dev/null)

    echo "  Command: ${COMMAND}"
    echo "  Args: ${ARGS}"

    # Check if command exists
    if command -v "${COMMAND}" >/dev/null 2>&1; then
        COMMAND_PATH=$(command -v "${COMMAND}")
        echo -e "  ${GREEN}✓${NC} Command found: ${COMMAND_PATH}"
    elif [[ -x "${COMMAND}" ]]; then
        echo -e "  ${GREEN}✓${NC} Command executable: ${COMMAND}"
    else
        echo -e "  ${RED}✗${NC} Command not found: ${COMMAND}"
    fi

    # Check environment variables
    if jq -e ".mcpServers.\"${server}\".env" "${MCP_CONFIG}" >/dev/null 2>&1; then
        echo "  Environment variables:"
        jq -r ".mcpServers.\"${server}\".env | keys[]" "${MCP_CONFIG}" | while read -r env_var; do
            ENV_VALUE=$(jq -r ".mcpServers.\"${server}\".env.\"${env_var}\"" "${MCP_CONFIG}")
            # Expand ~ using parameter expansion instead of eval
            EXPANDED_VALUE="${ENV_VALUE/#\~/$HOME}"

            echo -n "    ${env_var}: ${EXPANDED_VALUE} "

            # Check if file/directory exists (for paths)
            if [[ "${EXPANDED_VALUE}" =~ ^/ ]] || [[ "${EXPANDED_VALUE}" =~ ^~ ]]; then
                if [[ -e "${EXPANDED_VALUE}" ]]; then
                    echo -e "${GREEN}✓${NC}"
                else
                    echo -e "${RED}✗ (not found)${NC}"
                fi
            else
                echo ""
            fi
        done
    fi

    # Try to ping the server (if it's a known package)
    case "${server}" in
        "google-workspace")
            echo "  Testing Google Workspace MCP..."
            if command -v npx >/dev/null 2>&1; then
                echo -e "  ${GREEN}✓${NC} npx available (required for @automatalabs/mcp-server-google-workspace)"
            else
                echo -e "  ${RED}✗${NC} npx not found"
            fi
            ;;
        "codex-cli")
            echo "  Testing Codex CLI MCP..."
            if command -v npx >/dev/null 2>&1; then
                echo -e "  ${GREEN}✓${NC} npx available (required for @openai/mcp-server-codex-cli)"
            else
                echo -e "  ${RED}✗${NC} npx not found"
            fi
            ;;
        *)
            echo "  (No specific health check for ${server})"
            ;;
    esac

    echo ""
done

# Summary and recommendations
echo -e "${BLUE}Recommendations:${NC}\n"

# Check if Claude Desktop is running
if pgrep -q "Claude"; then
    echo -e "${GREEN}✓${NC} Claude Desktop is running"
    echo "  MCP servers should be loaded"
else
    echo -e "${YELLOW}⚠${NC} Claude Desktop is not running"
    echo "  Start Claude Desktop to activate MCP servers"
fi

echo ""
echo -e "${BLUE}MCP Documentation:${NC}"
echo "  - Official docs: https://modelcontextprotocol.io"
echo "  - Claude MCP guide: https://docs.anthropic.com/claude/docs/model-context-protocol"
echo ""

echo -e "${GREEN}Health check complete!${NC}"
