# Phase 17: Integration Reliability - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make all cross-system integrations work reliably with proper error handling and automatic recovery:

- Gateway ↔ Claude SDK communication
- MCP cross-calls between CLIs
- Hook execution (PreToolUse, PostToolUse, SessionStart)
- Long prompt handling (Agent SDK)
- Codex subprocess calls

**In scope:** Retry logic, timeout handling, error boundaries, logging, automatic recovery
**Out of scope:** New integrations, performance optimization, architectural rewrites

</domain>

<decisions>
## Implementation Decisions

### Retry & Backoff Strategy

- **Max retries**: 3 retries (initial + 3 retries = 4 total attempts)
- **Backoff strategy**: Exponential backoff (1s, 2s, 4s, 8s...)
- **Circuit breakers**: Yes, implement circuit breakers to prevent retry storms
- **Circuit breaker threshold**: 5 consecutive failures opens circuit
- **Circuit breaker timeout**: 60 seconds (from Phase 16 circuit-breaker.ts)

### Timeout Policy

- **MCP tool calls**: 30 seconds timeout (standard for local calls)
- **Agent SDK calls**: 120 seconds timeout (LLM calls need longer wait)
- **Configuration**: Hard-coded timeouts (reasonable defaults, no config needed)
- **On timeout**: Log to observability.sqlite and return error to caller

### Error Classification & Handling

- **Retryable errors**: Network/temp errors only (ECONNRESET, ETIMEDOUT, 503, 429)
- **Permanent errors**: Return immediately (don't retry client errors like 400, 401, 404)
- **Crash policy**: Never crash - return structured errors, let caller decide
- **Hook error handling**: Catch and log, don't block main operation (hook failures shouldn't prevent main action)

### Failure Visibility & Logging

- **Log destination**: observability.sqlite (structured events - queryable, persistent)
- **Log detail**: Context + stack (timestamp, integration type, error message, stack trace, retry count)
- **Retry logging**: Final result only (log once after retries exhausted - reduce noise)
- **Alerting policy**: Repeated failures only (alert after 5+ failures in 10 minutes - avoid alert fatigue)

</decisions>

<specifics>
## Specific Ideas

- Reuse circuit-breaker.ts from Phase 16 (already implements 5-failure threshold, 60s timeout)
- Integration errors should include trace IDs for cross-referencing in observability DB
- Hook failures get logged to observability with `category: 'hook', action: 'error'`
- Timeout errors should indicate which integration timed out and after how long

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 17-integration-reliability_
_Context gathered: 2026-02-27_
