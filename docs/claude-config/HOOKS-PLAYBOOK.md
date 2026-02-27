# Claude Code Hooks Playbook

Comprehensive guide to Claude Code's hook system for automated workflows and quality gates.

## Quick Navigation

- [Hook Types Reference](#hook-types-reference)
- [Hook Anatomy](#hook-anatomy)
- [Development Guide](#development-guide)
- [Real-World Examples](#real-world-examples)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Hook Types Reference

### Quick Reference Table

| Hook Type          | When Triggered       | Common Use Cases                                    | Receives                                            |
| ------------------ | -------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `SessionStart`     | New session begins   | Load context, check updates, inject KB articles     | `cwd`, `session_id`, `matcher`                      |
| `UserPromptSubmit` | User sends message   | Log prompts, track analytics, trigger workflows     | `prompt`, `session_id`, `timestamp`                 |
| `PostToolUse`      | After tool execution | Auto-ingest files, monitor changes, validate output | `tool_name`, `tool_input`, `tool_output`, `cwd`     |
| `Stop`             | User hits Stop       | Quality checks, validate completeness, cleanup      | `transcript_path`, `session_id`, `stop_hook_active` |
| `SessionEnd`       | Session terminates   | Extract learnings, backup, sync to KB               | `transcript_path`, `session_id`, `cwd`              |
| `TeammateIdle`     | Agent teammate idles | Notify lead, reassign work, log idle time           | `teammate_id`, `last_activity`, `task_id`           |
| `TaskCompleted`    | Task marked done     | Log completion, trigger next task, update tracker   | `task_id`, `task_data`, `assignee`                  |

---

## SessionStart Hooks

### Lifecycle

```
User starts Claude Code
    ↓
Claude Code reads ~/.claude/settings.json
    ↓
SessionStart hooks execute in order
    ↓
Hook output injected into Claude's initial context
    ↓
Session begins
```

### Input Schema

```json
{
  "cwd": "/Users/user/projects/my-project",
  "session_id": "abc123...",
  "matcher": "startup"
}
```

### Common Use Cases

1. **Context Injection** - Load relevant KB articles
2. **Environment Validation** - Check for required tools/deps
3. **Project Detection** - Identify GSD project and load state
4. **Update Checks** - Notify about available updates

### Example: KB Context Injection

**Purpose:** Query knowledge base for articles relevant to current working directory, inject into Claude's context.

**Configuration:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/kb-context-inject.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern:**

```bash
#!/bin/bash
# Read hook input from stdin
INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))")

# Query KB based on CWD
RESULTS=$(node ~/kb/query.js "$CWD")

# Output context for Claude
if [ -n "$RESULTS" ]; then
  echo "=== KB Context ==="
  echo "$RESULTS"
fi

exit 0
```

**Decision Tree:**

```
Do you have a knowledge base?
├─ Yes, want automatic context
│  └─ Use SessionStart → kb-context-inject
├─ Yes, but manual queries only
│  └─ Skip SessionStart hook, use /kb skill
├─ No knowledge base yet
│  └─ Skip hook
└─ Want to build one
   └─ See MCP-SERVERS.md for KB setup
```

---

## UserPromptSubmit Hooks

### Lifecycle

```
User types message and hits Enter
    ↓
UserPromptSubmit hooks execute
    ↓
Hook logs/processes prompt (async)
    ↓
Claude receives and processes prompt
```

### Input Schema

```json
{
  "prompt": "User's message text",
  "session_id": "abc123...",
  "timestamp": "2024-02-27T18:30:00Z",
  "cwd": "/path/to/project"
}
```

### Common Use Cases

1. **Prompt Logging** - Archive user prompts for analysis
2. **Analytics** - Track prompt patterns, session metrics
3. **Trigger Detection** - Detect special commands/keywords
4. **Context Augmentation** - Add metadata based on prompt content

### Example: Prompt Journaling

**Purpose:** Log all user prompts to a JSONL file for analytics and audit trail.

**Configuration:**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/prompt-journal.sh",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('prompt',''))")
SESSION_ID=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id',''))")

JOURNAL="$HOME/.openclaw/workspace/memory/prompt-journal.jsonl"
mkdir -p "$(dirname "$JOURNAL")"

# Append to journal (JSONL format)
python3 -c "
import json, sys
from datetime import datetime, timezone
entry = {
  'timestamp': datetime.now(timezone.utc).isoformat(),
  'session_id': sys.argv[1],
  'prompt': sys.argv[2][:500]  # Truncate long prompts
}
print(json.dumps(entry))
" "$SESSION_ID" "$PROMPT" >> "$JOURNAL"

exit 0
```

**Key Insight:** Use `async: true` to avoid blocking the user's prompt submission.

---

## PostToolUse Hooks

### Lifecycle

```
Claude executes tool (Write, Edit, Bash, etc.)
    ↓
Tool completes successfully
    ↓
PostToolUse hooks execute (matched by tool name)
    ↓
Hook processes tool output
    ↓
Session continues
```

### Input Schema

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "..."
  },
  "tool_output": "File written successfully",
  "cwd": "/path/to/project",
  "session_id": "abc123..."
}
```

### Matcher Patterns

**Exact match:**

```json
{
  "matcher": "Write",
  "hooks": [...]
}
```

**Multiple tools (OR):**

```json
{
  "matcher": "Write|Edit",
  "hooks": [...]
}
```

**Wildcard (all tools):**

```json
{
  "matcher": "*",
  "hooks": [...]
}
```

### Common Use Cases

1. **Auto-Ingest to KB** - When Claude writes docs, auto-ingest to knowledge base
2. **Code Quality Checks** - Run linters after file edits
3. **GSD Context Monitoring** - Track files modified in GSD projects
4. **Observability** - Log tool usage patterns

### Example: Auto-Ingest to Knowledge Base

**Purpose:** Automatically ingest markdown files written by Claude into the knowledge base.

**Configuration:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/kb-auto-ingest.sh",
            "timeout": 15,
            "async": true
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "
import json,sys
data = json.load(sys.stdin)
print(data.get('tool_input', {}).get('file_path', ''))
")

# Only ingest markdown files in docs directories
if [[ "$FILE_PATH" == *.md ]] && [[ "$FILE_PATH" == */docs/* ]]; then
  # Extract title from first heading
  TITLE=$(grep -m1 '^# ' "$FILE_PATH" | sed 's/^# //' || basename "$FILE_PATH" .md)

  # Ingest to KB
  node ~/.openclaw/projects/knowledge-base/deep-ingest.js \
    --local \
    --title "$TITLE" \
    --content-file "$FILE_PATH" \
    --tags '["auto-ingested","docs"]' \
    --para inbox 2>/dev/null
fi

exit 0
```

**Decision Tree:**

```
When should I auto-ingest files?
├─ Documentation files (*.md in /docs)
│  └─ Yes: High value, low noise
├─ Architecture Decision Records (ADRs)
│  └─ Yes: Critical knowledge
├─ Source code
│  └─ Maybe: High volume, consider selective ingestion
├─ Test files
│  └─ Usually no: Low value for KB
└─ Generated files
   └─ No: Will create noise
```

---

## Stop Hooks

### Lifecycle

```
User hits Stop button (or Claude finishes response)
    ↓
Stop hooks execute
    ↓
Hook validates response quality
    ↓
Hook returns {"ok": true} → Accept response
    or {"ok": false, "reason": "..."} → Block response, show reason
```

### Input Schema

```json
{
  "transcript_path": "/path/to/session/transcript.jsonl",
  "session_id": "abc123...",
  "stop_hook_active": false,
  "cwd": "/path/to/project"
}
```

**CRITICAL:** Check `stop_hook_active` to prevent infinite loops. If `true`, always return success.

### Common Use Cases

1. **Quality Gates** - Block incomplete responses
2. **Validation** - Check for TODO markers, truncation
3. **Linting** - Verify code quality before accepting
4. **Test Execution** - Run tests before accepting changes

### Example: Quality Gate

**Purpose:** Prevent Claude from submitting incomplete responses with TODO markers or truncation.

**Configuration:**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/quality-gate.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)

# Prevent infinite loops
HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('stop_hook_active', False))")
if [ "$HOOK_ACTIVE" = "True" ]; then
  exit 0  # Allow through
fi

TRANSCRIPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('transcript_path',''))")
LAST_MSG=$(tail -1 "$TRANSCRIPT")

# Check for incomplete patterns
RESULT=$(echo "$LAST_MSG" | python3 -c "
import json, sys
entry = json.loads(sys.stdin.read())
content = entry.get('content', '')

if 'TODO:' in content and 'implement' in content.lower():
    print('todo_left')
elif content.strip().endswith('...') and len(content) < 100:
    print('truncated')
else:
    print('ok')
")

case "$RESULT" in
  todo_left)
    echo '{"ok": false, "reason": "Response contains unresolved TODO items"}'
    ;;
  truncated)
    echo '{"ok": false, "reason": "Response appears truncated"}'
    ;;
  *)
    exit 0  # OK
    ;;
esac
```

**Key Insight:** Use Stop hooks sparingly. Over-aggressive quality gates can frustrate users.

**Decision Tree:**

```
Should I add a Stop hook?
├─ Common pattern: Claude leaves TODOs
│  └─ Yes: Add quality gate
├─ Working on critical systems
│  └─ Yes: Add validation (tests, lints)
├─ Rapid prototyping
│  └─ No: Will slow iteration
└─ Learning/experimenting
   └─ No: Will be annoying
```

---

## SessionEnd Hooks

### Lifecycle

```
User quits Claude Code (or session times out)
    ↓
SessionEnd hooks execute
    ↓
Hook extracts learnings from transcript
    ↓
Hook persists data (KB, logs, backups)
    ↓
Session terminates
```

### Input Schema

```json
{
  "transcript_path": "/path/to/session/transcript.jsonl",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "timestamp": "2024-02-27T18:30:00Z"
}
```

### Common Use Cases

1. **Learning Extraction** - Summarize session, ingest to KB
2. **Analytics** - Log session metrics (duration, turns, tools used)
3. **Backup** - Save session state for recovery
4. **Cleanup** - Remove temporary files

### Example: Session Learnings

**Purpose:** Extract key decisions, files modified, and patterns from the session transcript. Ingest summary into KB.

**Configuration:**

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/session-learnings.sh",
            "timeout": 15,
            "async": true
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('transcript_path',''))")
SESSION_ID=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id',''))")

# Extract summary from transcript
SUMMARY=$(python3 - "$TRANSCRIPT" << 'PYEOF'
import json, sys

entries = []
with open(sys.argv[1]) as f:
    for line in f:
        if line.strip():
            entries.append(json.loads(line))

# Collect user messages
user_messages = []
files_modified = set()
for entry in entries:
    if entry['role'] == 'user':
        user_messages.append(entry['content'][:200])
    elif entry['role'] == 'assistant':
        for block in entry.get('content', []):
            if block.get('type') == 'tool_use' and block.get('name') == 'Write':
                fp = block.get('input', {}).get('file_path', '')
                if fp:
                    files_modified.add(fp)

print(f"Session: {len(user_messages)} turns")
print(f"Topic: {user_messages[0] if user_messages else 'Unknown'}")
print(f"Files modified: {len(files_modified)}")
for f in sorted(files_modified)[:10]:
    print(f"  - {f}")
PYEOF
)

# Ingest to KB
if [ -n "$SUMMARY" ]; then
  echo "$SUMMARY" | node ~/.openclaw/projects/knowledge-base/deep-ingest.js \
    --local \
    --title "Session: $SESSION_ID" \
    --tags '["session-learnings"]' \
    --para inbox
fi

exit 0
```

**Key Insight:** Use `async: true` to avoid blocking session shutdown.

---

## TeammateIdle Hooks

### Lifecycle

```
Agent teammate completes turn
    ↓
Teammate enters idle state
    ↓
TeammateIdle hooks execute
    ↓
Hook notifies lead or reassigns work
    ↓
Teammate remains idle until assigned new work
```

### Input Schema

```json
{
  "teammate_id": "agent-abc123",
  "teammate_name": "researcher",
  "last_activity": "2024-02-27T18:30:00Z",
  "task_id": "task-42",
  "session_id": "abc123..."
}
```

### Common Use Cases

1. **Notification** - Alert team lead of idle agent
2. **Work Assignment** - Auto-assign next task from queue
3. **Analytics** - Track idle time patterns
4. **Cleanup** - Terminate idle agents after timeout

### Example: Teammate Idle Notification

**Configuration:**

```json
{
  "hooks": {
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/teammate-idle.sh",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)
TEAMMATE=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('teammate_name',''))")
TASK_ID=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('task_id',''))")

# Log idle event
echo "Teammate $TEAMMATE idle after completing task $TASK_ID"

# Check for next task in queue (example)
NEXT_TASK=$(sqlite3 ~/.openclaw/autonomy.sqlite \
  "SELECT id FROM action_rules WHERE status='pending' LIMIT 1")

if [ -n "$NEXT_TASK" ]; then
  echo "Next task available: $NEXT_TASK"
  # Could auto-assign here
fi

exit 0
```

---

## TaskCompleted Hooks

### Lifecycle

```
Agent marks task as completed (TaskUpdate)
    ↓
TaskCompleted hooks execute
    ↓
Hook logs completion, triggers next workflow
    ↓
Session continues
```

### Input Schema

```json
{
  "task_id": "task-42",
  "task_data": {
    "subject": "Implement feature X",
    "status": "completed",
    "assignee": "agent-abc123"
  },
  "session_id": "abc123...",
  "timestamp": "2024-02-27T18:30:00Z"
}
```

### Common Use Cases

1. **Workflow Automation** - Trigger next phase
2. **Analytics** - Log completion metrics
3. **Notification** - Alert stakeholders
4. **Validation** - Verify task meets acceptance criteria

### Example: Task Completion Logger

**Configuration:**

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/task-completed.sh",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

---

## Hook Anatomy

### Configuration Structure

```json
{
  "hooks": {
    "HookType": [
      {
        "matcher": "optional-matcher",
        "hooks": [
          {
            "type": "command",
            "command": "bash /path/to/script.sh",
            "timeout": 10,
            "async": false
          }
        ]
      }
    ]
  }
}
```

### Field Reference

| Field     | Type    | Required | Purpose                                  |
| --------- | ------- | -------- | ---------------------------------------- |
| `type`    | string  | Yes      | Always `"command"`                       |
| `command` | string  | Yes      | Shell command to execute                 |
| `timeout` | number  | No       | Max execution time (seconds), default 30 |
| `async`   | boolean | No       | Run in background, default `false`       |
| `matcher` | string  | No       | Pattern to match (PostToolUse only)      |

### Timeout Guidelines

| Hook Type        | Recommended Timeout | Reason                             |
| ---------------- | ------------------- | ---------------------------------- |
| SessionStart     | 10s                 | User is waiting to start           |
| UserPromptSubmit | 5s                  | User is waiting for response       |
| PostToolUse      | 15s                 | Async OK, but don't block too long |
| Stop             | 5s                  | User wants to stop NOW             |
| SessionEnd       | 30s                 | No rush, session is ending         |
| TeammateIdle     | 15s                 | Moderate urgency                   |
| TaskCompleted    | 15s                 | Moderate urgency                   |

### Async vs Sync

**Async (`"async": true`):**

- Hook runs in background
- Does NOT block Claude Code
- Output not visible to Claude
- Use for: logging, analytics, side effects

**Sync (`"async": false`, default):**

- Hook blocks until complete
- Output injected into Claude's context
- Use for: context injection, validation, quality gates

**Decision Tree:**

```
Does Claude need the hook output?
├─ Yes (context injection, validation)
│  └─ Use sync (async: false)
├─ No (logging, analytics)
│  └─ Use async (async: true)
└─ Unsure
   └─ Default to sync (safer)
```

---

## Development Guide

### Step 1: Choose Hook Type

**Question:** When do I need this to run?

- Start of session? → `SessionStart`
- After tool execution? → `PostToolUse`
- End of session? → `SessionEnd`
- User submits prompt? → `UserPromptSubmit`
- User hits Stop? → `Stop`
- Agent idles? → `TeammateIdle`
- Task completes? → `TaskCompleted`

### Step 2: Read Input Schema

**All hooks receive JSON on stdin:**

```bash
#!/bin/bash
INPUT=$(cat)  # Read JSON from stdin
```

**Extract fields with Python:**

```bash
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))")
```

**Common fields:**

- `session_id` - Unique session identifier
- `cwd` - Current working directory
- `transcript_path` - Path to session transcript (JSONL)
- `timestamp` - ISO8601 timestamp

### Step 3: Write Hook Logic

**Best Practices:**

1. **Fail gracefully** - Always `exit 0` unless you want to block
2. **Validate inputs** - Check for missing/invalid data
3. **Handle errors** - Wrap risky operations in try/catch
4. **Keep it fast** - Respect timeout limits
5. **Log errors** - Don't fail silently

**Error Handling Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)

CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

if [ -z "$CWD" ]; then
  exit 0  # Fail gracefully
fi

# ... hook logic ...

exit 0
```

### Step 4: Test Hook

**Test manually:**

```bash
# Create test input
echo '{"cwd":"/tmp","session_id":"test123"}' | bash ~/.claude/hooks/my-hook.sh
```

**Test with real session:**

```bash
# Add hook to settings.json
# Start Claude Code
# Monitor logs for errors
```

**Debug with logging:**

```bash
#!/bin/bash
INPUT=$(cat)

# Log to file for debugging
echo "[$(date)] Hook fired: $INPUT" >> ~/.claude/hooks/debug.log

# ... hook logic ...

exit 0
```

### Step 5: Add to Configuration

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/my-hook.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### Step 6: Verify

1. Restart Claude Code
2. Check hook fires at expected time
3. Verify output (sync) or side effects (async)
4. Monitor performance (timeout issues?)

---

## Real-World Examples

### Example 1: GSD Status Line

**Purpose:** Display current GSD project + phase in status line.

**Hook Type:** `statusLine` (special hook)

**Configuration:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/hooks/gsd-statusline.js"
  }
}
```

**Script:**

```javascript
// ~/.claude/hooks/gsd-statusline.js
import fs from "fs";
import path from "path";

const gsdDir = path.join(process.env.HOME, ".claude", "get-shit-done");
const activeProject = path.join(gsdDir, "active-project.txt");

try {
  if (fs.existsSync(activeProject)) {
    const project = fs.readFileSync(activeProject, "utf8").trim();
    const projectFile = path.join(gsdDir, project, "PROJECT.md");

    if (fs.existsSync(projectFile)) {
      const content = fs.readFileSync(projectFile, "utf8");
      const phaseMatch = content.match(/Current Phase: (\d+)/);
      const phase = phaseMatch ? phaseMatch[1] : "?";

      console.log(`GSD: ${project} (Phase ${phase})`);
      process.exit(0);
    }
  }

  console.log("GSD: No active project");
} catch (err) {
  process.exit(0);
}
```

---

### Example 2: GSD Context Monitor

**Purpose:** Track files modified during GSD execution, update context.

**Hook Type:** `PostToolUse`

**Configuration:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/gsd-context-monitor.js",
            "async": true
          }
        ]
      }
    ]
  }
}
```

**Script Pattern:**

```javascript
// Read hook input
const input = JSON.parse(fs.readFileSync(0, "utf8"));
const filePath = input.tool_input?.file_path;

// Check if in GSD project
const gsdDir = path.join(process.env.HOME, ".claude", "get-shit-done");
const activeProject = fs.readFileSync(path.join(gsdDir, "active-project.txt"), "utf8").trim();

// Update file manifest
const manifestPath = path.join(gsdDir, activeProject, "file-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (!manifest.files.includes(filePath)) {
  manifest.files.push(filePath);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
```

---

### Example 3: Session Registration

**Purpose:** Register new session in observability DB.

**Hook Type:** `SessionStart`

**Script Pattern:**

```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id',''))")
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))")

# Insert into observability DB
sqlite3 ~/.openclaw/observability.sqlite << SQL
INSERT OR IGNORE INTO sessions (session_id, cwd, started_at)
VALUES ('$SESSION_ID', '$CWD', datetime('now'));
SQL

exit 0
```

---

## Troubleshooting

### Hook Not Firing

**Symptoms:** Hook script never executes.

**Checklist:**

1. Check hook type spelling (case-sensitive)
2. Verify JSON syntax in settings.json
3. Check file permissions: `chmod +x ~/.claude/hooks/script.sh`
4. Check file path (use absolute paths)
5. Restart Claude Code completely

**Debug:**

```bash
# Add logging to hook
echo "[$(date)] Hook fired" >> ~/.claude/hooks/debug.log
```

---

### Hook Timeout

**Symptoms:** Hook takes too long, gets killed.

**Solutions:**

1. Increase `timeout` value
2. Use `async: true` if output not needed
3. Optimize hook script (remove slow operations)
4. Move heavy work to background job

**Debug:**

```bash
# Time your hook
time bash ~/.claude/hooks/my-hook.sh <<< '{"cwd":"/tmp"}'
```

---

### Hook Output Not Visible

**Symptoms:** Hook runs but output not in Claude's context.

**Checklist:**

1. Check `async: false` (sync mode)
2. Verify hook prints to stdout (not stderr)
3. Check timeout sufficient
4. Verify JSON output format (for Stop hooks)

**Debug:**

```bash
# Test hook output
bash ~/.claude/hooks/my-hook.sh <<< '{"cwd":"/tmp"}'
```

---

### Hook Causing Errors

**Symptoms:** Hook crashes Claude Code or shows errors.

**Solutions:**

1. Add error handling: `2>/dev/null || true`
2. Always `exit 0` (even on errors)
3. Validate inputs before use
4. Test hook in isolation first

**Safe Error Handling:**

```bash
#!/bin/bash
set +e  # Don't exit on error

INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

if [ -z "$CWD" ]; then
  exit 0  # Fail gracefully
fi

# Risky operation
RESULT=$(dangerous_command 2>/dev/null || echo "fallback")

echo "$RESULT"
exit 0
```

---

### Stop Hook Loop

**Symptoms:** Stop hook fires repeatedly, blocking all responses.

**Cause:** Hook returns `{"ok": false}` without checking `stop_hook_active`.

**Solution:**

```bash
#!/bin/bash
INPUT=$(cat)

# CRITICAL: Check for infinite loop prevention
HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('stop_hook_active', False))")
if [ "$HOOK_ACTIVE" = "True" ]; then
  exit 0  # Always allow through on second attempt
fi

# ... validation logic ...
```

---

## Best Practices

### Security

1. **Never log sensitive data** (API keys, passwords)
2. **Validate all inputs** (prevent injection attacks)
3. **Use absolute paths** (avoid relative path exploits)
4. **Restrict permissions** (`chmod 700` for sensitive hooks)

### Performance

1. **Keep hooks fast** (< 5s for sync, < 15s for async)
2. **Use async when possible** (don't block user)
3. **Cache expensive operations** (KB queries, API calls)
4. **Offload heavy work** (spawn background jobs)

### Reliability

1. **Always exit 0** (fail gracefully)
2. **Handle missing inputs** (check for null/empty)
3. **Add timeouts** (prevent hanging)
4. **Log errors** (for debugging)

### Maintainability

1. **Document hook purpose** (comment at top of script)
2. **Use consistent naming** (`hooktype-purpose.sh`)
3. **Keep hooks focused** (one responsibility per hook)
4. **Version control** (commit hooks to repo)

---

## See Also

- [CONFIG-REFERENCE.md](./CONFIG-REFERENCE.md) - Full configuration reference
- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills management
- [MCP-SERVERS.md](./MCP-SERVERS.md) - MCP server setup
- [BEST-PRACTICES.md](./BEST-PRACTICES.md) - Configuration best practices
