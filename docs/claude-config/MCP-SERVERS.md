# MCP Server Reference

Complete guide to Model Context Protocol (MCP) servers for Claude Code.

## Quick Navigation

- [What is MCP?](#what-is-mcp)
- [Server Configuration](#server-configuration)
- [Available Servers](#available-servers)
- [Development Guide](#development-guide)
- [Troubleshooting](#troubleshooting)

## What is MCP?

**Model Context Protocol (MCP)** is a standardized way to extend Claude with external tools and data sources.

### Key Concepts

- **MCP Server:** Background process that exposes tools to Claude
- **Tools:** Functions that Claude can call (query database, send email, etc.)
- **Resources:** Static/dynamic data sources (files, APIs, databases)
- **stdio Transport:** Communication via stdin/stdout (most common)

### Architecture

```
Claude Code
    ↓ (invokes tool)
MCP Server
    ↓ (queries/modifies)
External System (KB, APIs, Databases)
```

### When to Use MCP

| Use MCP When...          | Use Direct Tool When... |
| ------------------------ | ----------------------- |
| Complex domain logic     | Simple file operations  |
| External data source     | Read/Write local files  |
| Stateful operations      | Stateless operations    |
| Reusable across sessions | One-off task            |
| Need authentication      | No auth required        |

---

## Server Configuration

### Configuration File

**Location:** `~/.claude/.mcp.json`

**Format:**

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

### Field Reference

| Field     | Type     | Required | Purpose                                 |
| --------- | -------- | -------- | --------------------------------------- |
| `type`    | string   | Yes      | Transport type (always `"stdio"`)       |
| `command` | string   | Yes      | Executable to run (node, python3, etc.) |
| `args`    | string[] | Yes      | Command-line arguments                  |
| `env`     | object   | No       | Environment variables                   |

### Environment Variable References

**Use `${VAR_NAME}` to reference shell environment:**

```json
{
  "env": {
    "OPENAI_API_KEY": "${OPENAI_API_KEY}",
    "DB_PATH": "${HOME}/.openclaw/db.sqlite"
  }
}
```

**Variables are resolved from:**

1. Claude Code settings.json → env section
2. Shell environment (launchd for macOS apps)

---

## Available Servers

### 1. Knowledge Base Server

**Purpose:** Query and manage knowledge base articles, entities, decisions.

**Configuration:**

```json
{
  "mcpServers": {
    "knowledge-base": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/user/.openclaw/projects/knowledge-base/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

**Available Tools:**

| Tool                | Purpose               | Example                       |
| ------------------- | --------------------- | ----------------------------- |
| `kb_query`          | Full-text search      | Search for "machine learning" |
| `kb_smart_query`    | Semantic + FTS        | Intelligent search            |
| `kb_article`        | Get article by ID     | Retrieve article #42          |
| `kb_entities`       | List/search entities  | Find all people               |
| `kb_decisions`      | List decisions        | Show recent decisions         |
| `kb_stats`          | Get KB statistics     | Article counts by category    |
| `kb_graph`          | Query knowledge graph | Find related articles         |
| `kb_contradictions` | Find conflicts        | Detect contradictory info     |

**Usage Example:**

```
# In Claude Code:
Use mcp__knowledge-base__kb_smart_query with query "LLM configuration"

# Or via skill:
/kb LLM configuration
```

**Requirements:**

- Node.js 22+
- SQLite database at `~/.openclaw/projects/knowledge-base/kb.sqlite`
- OpenAI API key (for embeddings)

**Setup:**

```bash
# 1. Initialize KB database
cd ~/.openclaw/projects/knowledge-base
node migrate.js

# 2. Test MCP server
node mcp-server.js
# (Should start and listen on stdin/stdout)

# 3. Test from Claude Code
# Use mcp__knowledge-base__kb_stats
```

---

### 2. macOS System Server

**Purpose:** Interact with macOS system APIs (notifications, clipboard, calendar, etc.).

**Configuration:**

```json
{
  "mcpServers": {
    "macos-system": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/user/.openclaw/projects/macos-system-mcp/mcp-server.js"]
    }
  }
}
```

**Available Tools:**

| Tool                      | Purpose                  | Example                 |
| ------------------------- | ------------------------ | ----------------------- |
| `macos_send_notification` | Show system notification | Alert user              |
| `macos_read_clipboard`    | Read clipboard contents  | Get copied text         |
| `macos_write_clipboard`   | Write to clipboard       | Copy text               |
| `macos_open_url`          | Open URL in browser      | Open docs               |
| `macos_open_file`         | Open file in default app | Open PDF                |
| `macos_calendar_events`   | Query calendar           | Get today's events      |
| `macos_create_reminder`   | Add reminder             | Create task             |
| `macos_list_apps`         | List running apps        | Check if app is running |
| `macos_run_shortcut`      | Run macOS Shortcut       | Execute automation      |
| `macos_system_status`     | Get system stats         | CPU, memory, disk       |

**Usage Example:**

```
# Send notification
Use mcp__macos-system__macos_send_notification with title "Build Complete" and message "All tests passed"

# Read clipboard
Use mcp__macos-system__macos_read_clipboard

# Get calendar events
Use mcp__macos-system__macos_calendar_events with date "today"
```

**Requirements:**

- macOS only
- Node.js 22+
- System permissions (Notifications, Calendar, etc.)

---

### 3. Observability Server

**Purpose:** Query observability events, scores, handoffs, and autonomy rules.

**Configuration:**

```json
{
  "mcpServers": {
    "observability": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/user/.openclaw/projects/observability/server.js"]
    }
  }
}
```

**Available Tools:**

| Tool               | Purpose                | Example              |
| ------------------ | ---------------------- | -------------------- |
| `obs_query`        | Query events           | Search for errors    |
| `obs_emit`         | Emit new event         | Log custom event     |
| `obs_stats`        | Get statistics         | Event counts by type |
| `obs_score`        | Add quality score      | Rate interaction     |
| `obs_llm_usage`    | Track LLM usage        | Log model calls      |
| `router_classify`  | Classify request       | Determine routing    |
| `router_handoff`   | Initiate handoff       | Route to specialist  |
| `router_decisions` | List routing decisions | Audit routing        |
| `router_stats`     | Routing statistics     | Success rates        |

**Usage Example:**

```
# Query recent errors
Use mcp__observability__obs_query with filter "level:error" and limit 10

# Emit custom event
Use mcp__observability__obs_emit with type "deployment" and data {"status": "success"}

# Get statistics
Use mcp__observability__obs_stats
```

**Requirements:**

- Node.js 22+
- SQLite database at `~/.openclaw/observability.sqlite`

---

### 4. Google Workspace Server

**Purpose:** Interact with Google Drive, Docs, Sheets, Gmail, Calendar.

**Configuration:**

```json
{
  "mcpServers": {
    "google-workspace": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic/claude-code-google-workspace"]
    }
  }
}
```

**Available Tools:**

| Tool                    | Purpose             | Example                 |
| ----------------------- | ------------------- | ----------------------- |
| `create_doc`            | Create Google Doc   | New document            |
| `get_doc_content`       | Read Doc content    | Get document text       |
| `modify_doc_text`       | Edit Doc text       | Update document         |
| `create_spreadsheet`    | Create Sheet        | New spreadsheet         |
| `read_sheet_values`     | Read Sheet data     | Get cell values         |
| `modify_sheet_values`   | Write Sheet data    | Update cells            |
| `search_drive_files`    | Search Drive        | Find files              |
| `create_drive_folder`   | Create folder       | Organize files          |
| `send_gmail_message`    | Send email          | Email stakeholder       |
| `search_gmail_messages` | Search Gmail        | Find messages           |
| `list_calendars`        | List calendars      | Get available calendars |
| `get_events`            | Get calendar events | Today's schedule        |
| `create_event`          | Create event        | Schedule meeting        |

**Usage Example:**

```
# Create Google Doc
Use mcp__google-workspace__create_doc with title "Meeting Notes"

# Read spreadsheet
Use mcp__google-workspace__read_sheet_values with spreadsheet_id "abc123" and range "Sheet1!A1:D10"

# Send email
Use mcp__google-workspace__send_gmail_message with to "user@example.com" and subject "Report" and body "Here is the report"
```

**Requirements:**

- Node.js 22+
- Google Cloud project with OAuth credentials
- User authorization (first run will prompt)

**Setup:**

```bash
# 1. Install package
npx -y @anthropic/claude-code-google-workspace

# 2. First use will trigger OAuth flow
# Follow prompts to authorize

# 3. Test from Claude Code
# Use mcp__google-workspace__list_calendars
```

---

## Development Guide

### Creating a Custom MCP Server

#### Step 1: Choose Runtime

**Node.js:**

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk
```

**Python:**

```bash
mkdir my-mcp-server
cd my-mcp-server
python -m venv venv
source venv/bin/activate
pip install mcp
```

#### Step 2: Define Tools

**Node.js Example:**

```javascript
// server.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "my-server",
  version: "1.0.0",
});

// Register tool
server.tool(
  "my_tool",
  "Description of what this tool does",
  {
    param1: { type: "string", description: "First parameter" },
    param2: { type: "number", description: "Second parameter" },
  },
  async (params) => {
    // Tool logic
    const result = doSomething(params.param1, params.param2);

    return {
      content: [
        {
          type: "text",
          text: `Result: ${result}`,
        },
      ],
    };
  },
);

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
```

**Python Example:**

```python
# server.py
from mcp import Server, Tool

server = Server("my-server")

@server.tool()
def my_tool(param1: str, param2: int) -> str:
    """Description of what this tool does"""
    result = do_something(param1, param2)
    return f"Result: {result}"

if __name__ == "__main__":
    server.run()
```

#### Step 3: Add to Configuration

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/my-mcp-server/server.js"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

#### Step 4: Test

```bash
# Test server manually
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node server.js

# Test from Claude Code
# Use mcp__my-server__my_tool with param1 "test" and param2 42
```

---

### Best Practices

#### Error Handling

```javascript
server.tool("my_tool", "...", schema, async (params) => {
  try {
    const result = await dangerousOperation(params);
    return {
      content: [{ type: "text", text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});
```

#### Parameter Validation

```javascript
server.tool("my_tool", "...", schema, async (params) => {
  if (!params.required_param) {
    throw new Error("required_param is missing");
  }

  if (params.number_param < 0) {
    throw new Error("number_param must be positive");
  }

  // ... tool logic
});
```

#### Performance

1. **Cache expensive operations**
2. **Limit result sizes** (don't return 10MB of data)
3. **Use async operations** (don't block)
4. **Add timeouts** (prevent hanging)

#### Security

1. **Validate all inputs** (prevent injection)
2. **Use environment variables** (for secrets)
3. **Restrict file access** (don't allow path traversal)
4. **Audit external calls** (log API requests)

---

## Troubleshooting

### MCP Server Not Starting

**Symptoms:** Tools not available in Claude Code.

**Solutions:**

1. Check server process:

   ```bash
   ps aux | grep mcp-server
   ```

2. Test server manually:

   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node /path/to/server.js
   ```

3. Check configuration:

   ```bash
   cat ~/.claude/.mcp.json
   ```

4. Check logs:

   ```bash
   # Add logging to server
   console.error("Server starting...");
   ```

5. Restart Claude Code completely

---

### Tool Not Found

**Symptoms:** `mcp__server-name__tool_name` not found.

**Solutions:**

1. Verify tool is registered:

   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node server.js
   ```

2. Check tool name matches:
   - Configuration: `"tool_name"`
   - Usage: `mcp__server-name__tool_name`

3. Restart Claude Code

---

### Tool Execution Fails

**Symptoms:** Tool invoked but returns error.

**Solutions:**

1. Check tool parameters:
   - Required params provided?
   - Correct types?
   - Valid values?

2. Test tool manually:

   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tool_name","arguments":{"param":"value"}}}' | node server.js
   ```

3. Check error message in Claude's response

4. Add debug logging to tool

---

### Environment Variables Not Available

**Symptoms:** Tool can't access `process.env.API_KEY`.

**Solutions:**

1. Check MCP configuration includes env:

   ```json
   {
     "env": {
       "API_KEY": "${MY_API_KEY}"
     }
   }
   ```

2. Verify variable is in settings.json:

   ```json
   {
     "env": {
       "MY_API_KEY": "actual-key-value"
     }
   }
   ```

3. For macOS app, check launchd plist

4. Add fallback in server:
   ```javascript
   const apiKey = process.env.API_KEY || process.env.FALLBACK_KEY;
   ```

---

### Server Performance Issues

**Symptoms:** Tool calls are slow or timeout.

**Solutions:**

1. Profile tool execution:

   ```javascript
   const start = Date.now();
   const result = await operation();
   console.error(`Took ${Date.now() - start}ms`);
   ```

2. Optimize expensive operations:
   - Add caching
   - Reduce database queries
   - Limit result sizes

3. Increase timeout in Claude Code settings

4. Use async operations (don't block)

---

## See Also

- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Full configuration reference
- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills management
- [HOOKS-PLAYBOOK.md](./HOOKS-PLAYBOOK.md) - Hooks documentation
- [BEST-PRACTICES.md](./BEST-PRACTICES.md) - Configuration best practices
- [MCP Official Docs](https://modelcontextprotocol.io) - Protocol specification
