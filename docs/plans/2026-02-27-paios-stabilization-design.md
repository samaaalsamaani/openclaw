# PAIOS v3.0 Stabilization Design

**Date:** 2026-02-27
**Milestone:** v3.0 System Reliability & Hardening
**Status:** Design Approved

---

## Executive Summary

PAIOS v1/v2 shipped 15 phases with impressive capabilities (MCP mesh, task routing, content automation, observability, progressive autonomy). However, rapid development created system instability manifesting as "constant failures and crashes."

**Root Cause Discovered:** Not actual service crashes, but **zombie MCP server processes** accumulating from multiple Claude Code sessions. 18 orphaned processes cause integration chaos, stale data, and resource contention.

**Solution:** Convert MCP servers from session-scoped child processes to standalone launchd daemons — eliminating zombies permanently and establishing production-grade architecture.

---

## Audit Findings

### What We Thought Was Happening

User reported:

- Services crash/restart constantly
- Integration failures everywhere
- Config corruption
- Silent failures
- Changes break things

### What's Actually Happening

**System audit revealed (2026-02-27):**

✅ **Services are stable:**

- Gateway running (PID 9568, HTTP 200)
- All 6 launchd services running
- No crash logs in past 7 days
- Python 3.14.3, 121 packages healthy
- KB: 867 articles, 2.2K entities, 2.1K decisions

❌ **MCP server zombie crisis:**

```
3 Claude Code sessions (PIDs 9318, 12960, 13542)
Each spawned ~6 MCP servers
Servers never cleaned up when sessions ended
Result: 18 zombie processes

KB server:         3 instances (PIDs 9328, 12969, 13551)
Observability:     3 instances (PIDs 9393, 13031, 13613)
macOS-system:      3 instances (PIDs 9329, 12970, 13552)
Codex MCP:         3 instances (PIDs 9368, 13009, 13591)
```

**Failure Pattern:**

- Inconsistent data across tools (connect to different server instances)
- Stale KB queries (old server has cached data)
- Integration confusion (which instance to use?)
- Resource contention (18 servers competing)

**User Behavior Contributing Factor:**

- Mix of closing sessions explicitly and leaving them running
- No visibility into zombie accumulation
- No automated cleanup mechanism

---

## Architecture Design (Approach A)

### Standalone MCP Server Daemons

**Decision:** Run all MCP servers as independent launchd services, managed like Gateway.

**Architecture:**

```
System Layer (launchd)
├─ Gateway (existing daemon)
├─ Embedding Server (existing daemon)
├─ File Watcher (existing daemon)
├─ Emit Server (existing daemon)
├─ KB MCP Server (NEW daemon)
├─ Observability MCP Server (NEW daemon)
├─ macOS System MCP Server (NEW daemon)
└─ Google Workspace MCP Server (NEW daemon)

Client Layer
├─ Claude Code CLI → connects to MCP daemons
└─ Codex CLI → connects to MCP daemons
```

**Why This Approach:**

1. Eliminates zombie processes completely (launchd manages lifecycle)
2. Single source of truth (one instance per server)
3. Simple pattern (all infrastructure as daemons)
4. Production-grade (standard for always-on services)
5. Auto-restart on crash (launchd KeepAlive)

**Alternatives Considered:**

- Session-scoped with cleanup: Still risk of zombies if cleanup fails
- Hybrid (core as daemons, optional local): Two patterns to maintain

---

## Migration Strategy

### Step 1: Prepare (1 day)

Create 4 launchd plist files in `~/.openclaw/cron/`:

- `ai.openclaw.mcp-kb-server.plist`
- `ai.openclaw.mcp-observability-server.plist`
- `ai.openclaw.mcp-macos-system.plist`
- `ai.openclaw.mcp-google-workspace.plist`

**Plist template:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.openclaw.mcp-{name}-server</string>

  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/opt/node@22/bin/node</string>
    <string>/Users/user/.openclaw/projects/{name}/mcp-server.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/user/.openclaw/projects/{name}</string>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>ExitTimeOut</key>
  <integer>30</integer>

  <key>StandardOutPath</key>
  <string>/Users/user/Library/Logs/ai.openclaw.mcp-{name}.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/user/Library/Logs/ai.openclaw.mcp-{name}.error.log</string>

  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

### Step 2: Zombie Cleanup (1 hour)

**Safe termination script:**

```bash
#!/bin/bash
# Find MCP server zombies and kill safely

# Get all MCP server PIDs
MCP_PIDS=$(ps aux | grep -E "mcp-server|knowledge-base.*server|observability.*server" | grep -v grep | awk '{print $2}')

# For each PID, check if parent is alive
for pid in $MCP_PIDS; do
  ppid=$(ps -p $pid -o ppid= 2>/dev/null | xargs)
  if [ -z "$ppid" ] || ! ps -p $ppid > /dev/null 2>&1; then
    # Parent dead = zombie
    echo "Killing zombie MCP server: $pid"
    kill -TERM $pid
    sleep 1
    kill -9 $pid 2>/dev/null
  fi
done

# Verify cleanup
echo "Remaining MCP servers:"
ps aux | grep mcp-server | grep -v grep
```

### Step 3: Deploy Daemons (2 hours)

```bash
# Load all 4 MCP server plists
cd ~/Library/LaunchAgents
for plist in ai.openclaw.mcp-*.plist; do
  launchctl load $plist
done

# Verify all started
launchctl list | grep "mcp-"
# Expected: 4 services with PIDs

# Check logs for errors
tail -f ~/Library/Logs/ai.openclaw.mcp-*.log
```

### Step 4: Update MCP Configs (1 hour)

**Claude Code:** `~/.claude/mcp-config.json`

```json
{
  "mcpServers": {
    "knowledge-base": {
      "transport": "stdio",
      "command": "nc",
      "args": ["localhost", "3001"]
    }
  }
}
```

**Alternative:** If using Unix sockets, update to socket path

### Step 5: End-to-End Validation (1 day)

Run all 5 validation tests from Section 4.

---

## Success Metrics

### Before Migration

- 18 MCP server processes (3x duplication)
- Inconsistent data across sessions
- Manual restarts required
- No visibility into zombie accumulation

### After Migration (Target)

- Exactly 4 MCP server processes (one per daemon)
- Consistent data across all sessions
- 7+ days uptime without intervention
- Crash detection + auto-restart via launchd

---

## Implementation Timeline

| Phase    | Duration | Activities                  | Safety Gate               |
| -------- | -------- | --------------------------- | ------------------------- |
| Prep     | 1 day    | Create plists, test locally | plutil validation         |
| Cleanup  | 1 hour   | Kill zombies safely         | Verify Gateway unaffected |
| Deploy   | 2 hours  | Load daemons, verify start  | All 4 daemons running     |
| Config   | 1 hour   | Update MCP configs          | Backup + validate         |
| Validate | 1 day    | Run 5 validation tests      | All tests pass            |
| Soak     | 7 days   | Monitor stability           | No restarts               |

**Total:** ~2 days active work + 7 days monitoring

---

## Risk Mitigation

**Risk 1: Cleanup kills active services**

- Mitigation: Verify parent process before kill, exclude Gateway/embedding/file-watcher PIDs

**Risk 2: Daemons fail to start**

- Mitigation: Test plists locally first, check logs immediately after load

**Risk 3: Config update breaks Claude Code**

- Mitigation: Backup configs before changes, test with single session first

**Risk 4: Data loss during transition**

- Mitigation: Flush any pending writes before cleanup, SQLite uses WAL mode (atomic)

**Risk 5: Can't rollback if needed**

- Mitigation: Keep old MCP configs, unload daemons reverts to session-scoped

---

## Impact on Existing GSD Plans

### Current Plans (Created Today)

- **16-00:** Test scaffolds (still needed)
- **16-01:** Crash logging + error boundaries (still needed)
- **16-02:** Memory monitoring + circuit breakers (still needed)
- **16-03:** launchd hardening (EXPANDS - now includes 4 MCP plists)

### Plan Adjustments Needed

**16-03 scope expansion:**

- Original: Harden 6 existing launchd services
- **Updated:** Harden 6 existing + CREATE 4 new MCP daemon services
- Additional tasks: Create plists, test, load, verify

**16-00, 16-01, 16-02:** No changes needed (orthogonal to daemon architecture)

### Execution Strategy

**Option A: Execute existing plans, expand 16-03**

- Run plans 16-00, 16-01, 16-02 as designed
- When executing 16-03, add MCP daemon creation tasks
- Pros: Use existing plans, minimal rework
- Cons: 16-03 becomes larger scope

**Option B: Create new plan 16-04 for MCP daemons**

- Plans 16-00 through 16-03 unchanged
- New 16-04: "MCP Server Daemonization" (zombie cleanup + daemon deploy)
- Pros: Clean separation, focused scope
- Cons: Adds a 5th plan to the phase

**Recommendation:** Option A (expand 16-03) — MCP daemon work fits naturally with "launchd hardening"

---

Does this complete design address the stabilization crisis?
