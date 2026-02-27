# MCP Server Health & Capabilities Audit

**Audit Date**: 2026-02-27
**Configuration File**: `~/.claude/.mcp.json`

## Executive Summary

Claude Code is configured with 4 MCP servers providing 47+ tools across knowledge management, system operations, observability, and workspace integration. However, **3 out of 4 servers are currently non-functional** due to Node.js version incompatibility and OAuth configuration issues.

**Health Score**: 🔴 **25%** (1/4 servers operational)

## Configured MCP Servers

### 1. Knowledge Base (`knowledge-base`)

- **Type**: stdio
- **Command**: `node /Users/user/.openclaw/projects/knowledge-base/mcp-server.js`
- **Environment**: Requires `OPENAI_API_KEY`
- **Status**: 🔴 **BROKEN** - Node.js version mismatch
- **Error**: `NODE_MODULE_VERSION 141 vs 127` - better-sqlite3 compiled for Node 25, runtime using Node 22
- **Tools Available**: 10 tools
  - `kb_query` - Search knowledge base with semantic search
  - `kb_article` - Get full article by ID
  - `kb_recent` - List recently ingested articles
  - `kb_stats` - Get KB statistics (866 articles, 2.2K entities)
  - `kb_entities` - Search/list entities (people, orgs, tools, concepts)
  - `kb_graph` - Traverse entity-article relationships
  - `kb_decisions` - Search decision records
  - `kb_playbooks` - Search reusable procedures
  - `kb_contradictions` - Detect contradictory articles
  - `kb_communities` - List entity clusters
- **Capabilities**:
  - Semantic search with AI reranking
  - Entity extraction and graph traversal
  - Decision tracking and playbook management
  - Contradiction detection
- **Fix Required**: `pnpm rebuild better-sqlite3 --dir ~/.openclaw/projects`

### 2. macOS System (`macos-system`)

- **Type**: stdio
- **Command**: `node /Users/user/.openclaw/projects/macos-system-mcp/mcp-server.js`
- **Status**: 🔴 **BROKEN** - Same Node.js version mismatch
- **Tools Available**: 10 tools
  - `macos_system_status` - Battery, disk, uptime, memory, load
  - `macos_read_clipboard` - Read clipboard contents
  - `macos_write_clipboard` - Write to clipboard
  - `macos_send_notification` - Send native notifications
  - `macos_calendar_events` - List calendar events
  - `macos_create_reminder` - Create reminders
  - `macos_open_url` - Open URLs in browser
  - `macos_open_file` - Open files or reveal in Finder
  - `macos_run_shortcut` - Execute Siri Shortcuts
  - `macos_list_apps` - List running applications
- **Capabilities**: System integration, clipboard, notifications, shortcuts
- **Fix Required**: Same as knowledge-base

### 3. Observability (`observability`)

- **Type**: stdio
- **Command**: `node /Users/user/.openclaw/projects/observability/server.js`
- **Status**: 🔴 **BROKEN** - Same Node.js version mismatch
- **Tools Available**: 10 tools
  - `obs_query` - Query observability events with filtering
  - `obs_stats` - Aggregated statistics and error rates
  - `obs_emit` - Emit custom observability events
  - `obs_score` - Rate trace quality (1-5 scale)
  - `obs_llm_usage` - LLM token usage and cost tracking
  - `router_classify` - AI routing classification
  - `router_decisions` - Recent routing decision log
  - `router_stats` - Routing statistics summary
  - `router_handoff` - Create cross-brain handoffs
  - `router_pending` - Query pending handoffs
- **Capabilities**:
  - Event tracking (6,963 events, 30 scores, 125 handoffs)
  - LLM usage analytics and cost tracking
  - AI routing classification and handoffs
  - Quality scoring and self-reflection
- **Database**: `~/.openclaw/observability.sqlite` (1.8MB)
- **Fix Required**: Same as knowledge-base

### 4. Google Workspace (`google-workspace`)

- **Type**: stdio
- **Command**: `npx -y @anthropic/claude-code-google-workspace`
- **Status**: 🟡 **DEGRADED** - OAuth callback server conflict
- **Error**: Port 8000 already in use (likely gateway using same port)
- **Tools Available**: 17+ tools across multiple services
  - **Docs**: `import_to_google_doc`, `create_doc`, `get_doc_content`, `modify_doc_text`
  - **Drive**: `create_drive_file`, `create_drive_folder`, `get_drive_file_content`, `search_drive_files`, `share_drive_file`
  - **Calendar**: `list_calendars`, `get_events`, `create_event`, `modify_event`
  - **Apps Script**: `list_script_projects`, `get_script_project`, `create_script_project`, `update_script_content`, `run_script_function`
  - **Spreadsheets**: `create_spreadsheet`, `read_sheet_values`, `modify_sheet_values`
  - **Gmail**: `search_gmail_messages`, `get_gmail_message_content`, `send_gmail_message`
  - **Contacts**: `list_contacts`, `get_contact`, `create_contact`, `search_contacts`
  - **Tasks**: `list_tasks`, `get_task`, `create_task`, `update_task`
  - **Forms**: `create_form`, `get_form`
  - **Presentations**: `create_presentation`, `get_presentation`
- **Capabilities**: Full Google Workspace integration for productivity automation
- **Fix Required**: Configure OAuth callback port or stop conflicting service

## Missing MCP Servers

Based on MEMORY.md references and PAIOS architecture, these MCP servers are mentioned but not configured:

### 1. Session Analytics (Referenced but Missing)

- **Purpose**: Analyze conversation patterns, session metrics, agent performance
- **Expected Location**: Unknown
- **Impact**: Cannot access session history or analytics programmatically
- **Priority**: Medium - Analytics useful but not critical for daily ops

### 2. Task Router (Referenced in Observability)

- **Purpose**: Task decomposition, multi-agent coordination, handoff management
- **Expected Location**: Possibly integrated with observability server
- **Impact**: Routing tools exist in observability server, so this may be satisfied
- **Priority**: Low - Functionality appears covered by observability tools

### 3. Codex CLI (System-Level Integration)

- **Purpose**: Direct Codex API access via CLI wrapper
- **Tools**: `codex`, `codex-reply`
- **Status**: Available via ToolSearch deferred loading, not as MCP server
- **Note**: Already accessible, just not via MCP protocol

## Tool Inventory Summary

| Server           | Status      | Tools   | Categories                                             |
| ---------------- | ----------- | ------- | ------------------------------------------------------ |
| knowledge-base   | 🔴 Broken   | 10      | Search, entities, decisions, playbooks, contradictions |
| macos-system     | 🔴 Broken   | 10      | System status, clipboard, notifications, shortcuts     |
| observability    | 🔴 Broken   | 10      | Events, routing, LLM usage, quality scoring            |
| google-workspace | 🟡 Degraded | 17+     | Docs, Drive, Calendar, Gmail, Contacts, Apps Script    |
| **TOTAL**        | **25%**     | **47+** | 4 core domains                                         |

## Critical Issues

### 1. Node.js Version Mismatch (Priority: 🔴 Critical)

**Impact**: 3/4 MCP servers completely broken
**Root Cause**: better-sqlite3 native module compiled for Node 25, but launchd services using Node 22
**Affected Servers**: knowledge-base, macos-system, observability
**Resolution**:

```bash
# Rebuild better-sqlite3 for Node 22
pnpm rebuild better-sqlite3 --dir ~/.openclaw/projects

# OR update launchd to use Node 25
# Edit ~/.openclaw/launchd/*.plist PATH to prioritize /opt/homebrew/bin/node
```

### 2. OAuth Callback Port Conflict (Priority: 🟡 Medium)

**Impact**: Google Workspace authentication fails
**Root Cause**: Port 8000 already in use (gateway on 18789, possibly emit-server or other service)
**Affected Server**: google-workspace
**Resolution**:

- Identify service using port 8000: `lsof -i :8000`
- Configure google-workspace to use alternative port
- Or temporarily stop conflicting service during OAuth flow

### 3. No Resources Exposed (Priority: 🟢 Low)

**Impact**: No MCP resources available for context
**Note**: MCP servers provide tools but no resources (files, prompts, etc.)
**This is acceptable** - tools are the primary MCP capability

## Recommendations

### Immediate Actions (This Week)

1. **Fix Node.js version mismatch** - Rebuild better-sqlite3 for all MCP servers
2. **Resolve OAuth port conflict** - Enable Google Workspace authentication
3. **Test all tools** - Verify functionality after fixes

### Short-Term Improvements (This Month)

1. **Add MCP health checks** - Monitor server status in daily health checks
2. **Document OAuth setup** - Add google-workspace OAuth configuration guide
3. **Version lock strategy** - Prevent Node.js version drift between dev and launchd

### Long-Term Enhancements (This Quarter)

1. **Expand MCP coverage** - Add servers for:
   - Personal CEO operations (CXO dashboard, metrics)
   - Social media automation (posting, analytics)
   - Content pipeline (calendar, approvals)
2. **MCP resources** - Expose knowledge base articles, playbooks, decisions as resources
3. **Authentication management** - Centralized OAuth token management across MCP servers
4. **Performance monitoring** - Track MCP tool latency and error rates

## Tool Value Assessment

### High-Value Tools (Use Daily)

- `kb_query`, `kb_stats` - Knowledge base search and stats
- `macos_send_notification` - User alerts
- `obs_query`, `obs_stats` - System monitoring
- `router_classify` - AI task routing

### Medium-Value Tools (Use Weekly)

- `kb_entities`, `kb_graph` - Knowledge exploration
- `macos_system_status` - System health
- `obs_llm_usage` - Cost tracking
- `google-workspace` calendar/docs tools

### Low-Value Tools (Rarely Used)

- `macos_run_shortcut` - Limited use cases
- `kb_contradictions` - Infrequent needs
- `router_handoff` - Multi-agent coordination (future)

## Security Considerations

1. **API Keys in Environment** - knowledge-base requires `OPENAI_API_KEY` in MCP config
   - ✅ Good: Keys not hardcoded in config
   - ⚠️ Risk: Keys visible in process environment
   - Recommendation: Use keychain integration or credential vault

2. **OAuth Token Storage** - google-workspace stores tokens locally
   - Location: Likely `~/.anthropic/` or similar
   - Recommendation: Verify token encryption and secure storage

3. **Database Access** - Local SQLite databases accessed by MCP servers
   - No authentication required for local access
   - ✅ Acceptable: Single-user system with file permissions

## Next Steps

1. Execute Node.js rebuild: `pnpm rebuild better-sqlite3 --dir ~/.openclaw/projects`
2. Test knowledge-base: Call `kb_stats` and verify 866 articles response
3. Test observability: Call `obs_stats` and verify event counts
4. Test macos-system: Call `macos_system_status` and verify system info
5. Resolve OAuth conflict: Identify port 8000 user and reconfigure
6. Update health check script to include MCP server status
7. Document fixes in `~/.openclaw/docs/HEALTH-CHECK-REMEDIATION-REPORT.md`

## Conclusion

The MCP server infrastructure has significant potential with 47+ tools across 4 key domains, but is currently **critically degraded** with 75% of servers non-functional. The Node.js version mismatch is a straightforward fix that will immediately restore 30 high-value tools for knowledge management, system operations, and observability.

Once operational, these MCP servers will provide Claude Code with deep integration into PAIOS subsystems, enabling automated knowledge queries, system monitoring, LLM usage tracking, and productivity automation through Google Workspace.

**Estimated Time to Full Operational**: ~15 minutes (rebuild + testing)
