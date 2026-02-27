# Phase 16: Service Hardening - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make 6 existing services run reliably for 7+ days without crashes, hangs, or unexpected restarts:

- Gateway (Node.js daemon, port 18789)
- 6 launchd services (gateway, embedding-server, file-watcher, emit-server, daily-tasks, weekly-tasks)
- MCP servers (17 processes)
- Embedding server (Python)

**In scope:** Fix crashes, memory leaks, resource leaks, error handling, launchd configurations
**Out of scope:** Performance optimization, new features, architectural rewrites

</domain>

<decisions>
## Implementation Decisions

### Crash Detection & Restart Policy

- **Detection mechanism**: Both launchd KeepAlive + health check polling
  - launchd detects process exits (crashes)
  - Health monitor detects hangs (process alive but unresponsive)
- **Restart behavior**: Restart immediately (launchd default)
- **Restart loop prevention**: Both launchd ThrottleInterval + alerting
  - launchd ThrottleInterval prevents rapid restart loops
  - Alert after 3+ crashes in 5 minutes
- **Visibility**: Log every crash/restart to observability.sqlite
  - Timestamp, exit code, service name, context

### Memory Leak Diagnosis

- **Node.js leak detection**: Claude's discretion
  - Consider: automated monitoring of process.memoryUsage() + manual heap snapshots for diagnosis
- **Python leak detection**: Claude's discretion
  - Consider: tracemalloc profiling + periodic restarts as safety net
- **Testing approach**: Manual validation only
  - No heavy automated load testing
  - Fix known leaks, validate in production
- **Detection threshold**: Claude's discretion
  - Consider: alert if memory grows consistently >10MB/hour or >50% in 24h

### Resource Cleanup Strategy

- **SQLite connections**: Keep connections open
  - Connection pooling pattern
  - Open on startup, close on shutdown only
  - No per-query open/close
- **MCP connections**: Persistent connections
  - Keep connections alive
  - Reconnect on failure only
  - No request-scoped connection lifecycle
- **File handles & temp files**: Close immediately after use
  - Always close file handles in finally blocks
  - Explicit temp file deletion
  - Don't rely on OS cleanup
- **Timers & intervals**: Always clear on shutdown
  - Track all timers/intervals
  - Clear in SIGTERM handler
  - Proper cleanup before process exit

### Error Handling Philosophy

- **Exception handling**: Claude's discretion
  - Consider: catch all in MCP tools, return structured errors instead of crashing
  - Balance: visibility of bugs vs service stability
- **Tool call failures**: Claude's discretion
  - Consider: retry transient errors (network, temp), return permanent errors immediately
- **Error logging**: Claude's discretion
  - Consider: log at catch site with full context
- **Error verbosity**: Claude's discretion
  - Consider: detailed logs internally, friendly messages to external callers

### Claude's Discretion

The following areas are Claude's choice during planning/implementation:

- Specific memory leak detection mechanisms (Node.js, Python)
- Memory leak threshold values
- Error handling patterns (catch-all vs let-crash, retry policies)
- Error logging locations (throw site vs catch site)
- Error message verbosity (internal vs external)

</decisions>

<specifics>
## Specific Ideas

- launchd KeepAlive + health checks complement each other (KeepAlive for crashes, health for hangs)
- ThrottleInterval prevents restart storms but still lets services recover
- Connection pooling for SQLite/MCP avoids connection overhead
- File handle cleanup in finally blocks prevents resource exhaustion
- Timer cleanup in SIGTERM handler ensures graceful shutdown

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 16-service-hardening_
_Context gathered: 2026-02-27_
