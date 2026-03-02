---
phase: 22-platform-foundations
plan: "01"
subsystem: infra
tags: [ssrf, fetch, security, network, discord, telegram, credential-monitor, oauth]

requires: []
provides:
  - "fetchWithSsrFGuard wrapping all user/config-controlled and medium-risk external fetch() calls"
  - "Per-module tests asserting the guard is called (not just guard unit tests)"
  - "SsrFBlockedError re-thrown at all converted sites"
  - "Documented SSRF exemptions for localhost/loopback and Slack cross-origin redirect logic"
affects: [23-cross-channel-memory, 24-connect-everything-onboarding]

tech-stack:
  added: []
  patterns:
    - "fetchWithSsrFGuard with try/finally release() for all external fetch calls"
    - "allowedHostnames policy for user-supplied baseUrl (Ollama, vLLM)"
    - "Bare fetch() with exemption comment for loopback/localhost calls"

key-files:
  created:
    - src/agents/models-config.providers.test.ts
  modified:
    - src/agents/models-config.providers.ts
    - src/discord/send.outbound.ts
    - src/discord/voice-message.ts
    - src/infra/credential-monitor.ts
    - src/providers/github-copilot-auth.ts
    - src/providers/qwen-portal-oauth.ts
    - src/agents/opencode-zen-models.ts
    - src/agents/conversation-learner.ts
    - src/agents/sdk-runner/mcp-servers.ts
    - src/commands/signal-install.ts
    - src/channels/telegram/api.ts
    - src/agents/tools/web-search.ts
    - src/infra/health-check.ts
    - src/infra/credential-monitor.test.ts
    - src/discord/send.sends-basic-channel-messages.test.ts
    - src/infra/health-check.test.ts

key-decisions:
  - "mcp-servers.ts embedding server (127.0.0.1:11435) reverted to bare fetch() — loopback blocked by guard design"
  - "Redundant catch-rethrow removed from 4 files — try/finally sufficient when unconditionally rethrowing"
  - "slack/monitor/media.ts intentionally exempt — manual cross-origin auth-stripping incompatible with guard"
  - "SsrFBlockedError imports removed from files where catch was removed (unused after cleanup)"

patterns-established:
  - "SSRF guard pattern: fetchWithSsrFGuard + try/finally release() — no catch needed when unconditionally rethrowing"
  - "Loopback exemption: bare fetch() with // SSRF exemption comment citing reason"
  - "User-supplied hostname: policy: { allowedHostnames: [parsed.hostname] } to permit while blocking IP pivoting"

requirements-completed:
  - FOUND-01
  - FOUND-05

duration: ~90min
completed: 2026-03-02
---

# Phase 22-01: SSRF Guard Coverage Summary

**fetchWithSsrFGuard wrapping all genuine SSRF-risk fetch() calls with per-module tests, loopback exemption correction, and redundant catch cleanup**

## Performance

- **Duration:** ~90 min (initial execution + review fix session)
- **Completed:** 2026-03-02
- **Tasks:** 3 (high-priority sites, medium-priority sites, tests) + 1 review fix pass
- **Files modified:** 17

## Accomplishments

- Wrapped all user/config-controlled URLs (Ollama/vLLM baseUrl, Discord webhook, voice upload) in `fetchWithSsrFGuard` with `allowedHostnames` policy where applicable
- Wrapped medium-risk hardcoded-constant URLs (credential-monitor, github-copilot-auth, qwen-portal-oauth, telegram/api, web-search, signal-install, opencode-zen-models, conversation-learner)
- Added 5 test files with per-module assertions that the guard is called (not just guard unit tests)
- Review pass fixed: loopback guard bug in mcp-servers.ts, redundant catch-rethrow in 4 files, uncommitted test files committed

## Task Commits

1. **Task 1: High-priority SSRF sites** — `adb348e2b` (feat)
2. **Task 2: Medium-priority SSRF sites** — `92e41e850` (feat)
3. **Review fix: loopback + catch cleanup + commit tests** — `40cecf1c1` (fix)

## Files Created/Modified

- `src/agents/models-config.providers.ts` — Ollama/vLLM baseUrl probes wrapped with allowedHostnames policy
- `src/discord/send.outbound.ts` — webhook URL guarded; redundant catch removed
- `src/discord/voice-message.ts` — upload_url guarded
- `src/infra/credential-monitor.ts` — OAuth token endpoint guarded; redundant catch removed
- `src/providers/github-copilot-auth.ts` — device code + token poll guarded; redundant catch removed (2 sites)
- `src/providers/qwen-portal-oauth.ts` — token endpoint guarded; redundant catch removed
- `src/agents/opencode-zen-models.ts` — API base URL guarded
- `src/agents/conversation-learner.ts` — Anthropic API call guarded
- `src/agents/sdk-runner/mcp-servers.ts` — embedding server reverted to bare fetch() (loopback exemption)
- `src/commands/signal-install.ts` — GitHub API URL guarded
- `src/channels/telegram/api.ts` — telegram.org base URL guarded
- `src/agents/tools/web-search.ts` — redirect-following call guarded
- `src/infra/health-check.ts` — external API health check calls guarded
- `src/agents/models-config.providers.test.ts` — new: structural guard tests for Ollama/vLLM
- `src/infra/credential-monitor.test.ts` — added guard call assertions + release() leak tests
- `src/discord/send.sends-basic-channel-messages.test.ts` — added webhook guard assertion
- `src/infra/health-check.test.ts` — added external API guard assertion

## Decisions Made

- **Loopback exemption (mcp-servers.ts):** Guard wrapping `127.0.0.1` throws `SsrFBlockedError` at runtime — reverted to bare `fetch()` with exemption comment, matching `browser.ts`/`ollama-stream.ts` pattern
- **Redundant catch cleanup:** `catch (e) { if SsrFBlockedError throw; throw; }` is dead code when both branches throw unconditionally — removed in favour of `try/finally` only
- **slack/monitor/media.ts exempted:** Manual `Authorization` header stripping on cross-origin redirects conflicts with guard's redirect interception

## Deviations from Plan

### Auto-fixed Issues

**1. Loopback guard bug in mcp-servers.ts**

- **Found during:** Post-execution code review
- **Issue:** Plan table listed `mcp-servers.ts` as "Low risk; add guard" without noting the `127.0.0.1` target — the guard blocks private IPs by design
- **Fix:** Reverted to bare `fetch()` with exemption comment; removed unused imports
- **Committed in:** `40cecf1c1`

**2. Redundant catch-rethrow in 4 files**

- **Found during:** Post-execution code review
- **Issue:** `SsrFBlockedError` instanceof branch is dead code when unconditional `throw` follows
- **Fix:** Removed catch blocks, kept `try/finally`; removed now-unused `SsrFBlockedError` imports
- **Committed in:** `40cecf1c1`

---

**Total deviations:** 2 auto-fixed post review
**Impact:** Correctness fixes — no scope creep

## Issues Encountered

5 test files were not committed during initial execution session; committed in review fix pass.

## Next Phase Readiness

All genuine SSRF-risk fetch() calls now route through the guard. Pattern established for future modules. Ready for Phase 23.

---

_Phase: 22-platform-foundations_
_Completed: 2026-03-02_
