# Phase 22: platform-foundations - Research

**Researched:** 2026-03-02
**Domain:** Security hardening, dependency declarations, environment resolution
**Confidence:** HIGH — all findings are from direct codebase inspection with zero inference

## Summary

Phase 22 closes four independent classes of technical debt before any growth investment. The research confirms the planning documents are substantially accurate but with one important correction: `better-sqlite3` is already in `dependencies` (not `devDependencies`) in the root `package.json`, so FOUND-02 may require only verification and documentation rather than a move. The extension workspace issue (FOUND-03) is confirmed at exactly 28 extensions with `openclaw: workspace:*` in `devDependencies` — not `dependencies` — which is the correct place for workspace refs, but the requirement says they should also declare a proper `peerDependencies` entry (like `memory-core` and `googlechat` already do). The SSRF gap (FOUND-01) is real but the risk profile is nuanced: only a subset of the 30+ bare `fetch()` calls represent genuine SSRF risk.

The `resolveEffectiveHomeDir()` and `resolveRequiredHomeDir()` functions exist in `src/infra/home-dir.ts` and are already used by 14+ files. The import pattern is established. The 31 production sites still using `process.env.HOME` follow a uniform pattern (`process.env.HOME ?? "/tmp"`) making mechanical replacement straightforward.

The test infrastructure (vitest, v8 coverage) is already in place. FOUND-05 (SSRF test coverage) requires adding per-file tests that verify the guard is actually called — the existing `fetch-guard.ssrf.test.ts` tests the guard itself in isolation but does not test that affected files route through it.

**Primary recommendation:** Treat the three sub-tasks as independent parallel tracks. Start with 22-02 (deps) since it is the lowest-risk and unblocks a cleaner 22-01 audit. Run 22-01 (SSRF) second since it requires the most judgment about which bare `fetch()` calls need guarding. Run 22-03 (HOME) last since it is the largest mechanical change (31 sites) but is also the most uniform.

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                              | Research Support                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FOUND-01 | `fetchWithSsrFGuard()` used in all files that make outbound requests — no direct `fetch()` bypasses (currently 9+ files) | Full call site inventory below. Risk-tiered list: 9 high-priority sites, 14 hardcoded-constant sites (lower priority), 12 CDN/internal sites (case-by-case).                                                                                                                              |
| FOUND-02 | `better-sqlite3` moved from `devDependencies` to `dependencies` in production packages                                   | Already in `dependencies: "^12.6.2"` in root `package.json`. Need to verify sub-packages and confirm tsdown `external: ["better-sqlite3"]` setting is correct and documented.                                                                                                             |
| FOUND-03 | All 28 extensions use `peerDependencies`/`devDependencies` for `openclaw` — no `workspace:*` in `dependencies`           | Confirmed 28 extensions have `openclaw: workspace:*` in `devDependencies`. The fix is adding `peerDependencies` entry (model: `memory-core` / `googlechat` pattern: `"openclaw": ">=2026.1.26"`). The devDependencies workspace:\* reference stays — it is correct for local development. |
| FOUND-04 | `resolveEffectiveHomeDir()` used everywhere instead of `process.env.HOME` (20+ sites)                                    | 31 confirmed production sites. Function is in `src/infra/home-dir.ts`. Import pattern: `import { resolveRequiredHomeDir } from "../infra/home-dir.js"`.                                                                                                                                   |
| FOUND-05 | SSRF guard test coverage confirms bypass is closed across all affected files                                             | Existing `fetch-guard.ssrf.test.ts` (151 lines) tests the guard in isolation. Need new per-module tests that mock `fetch` and assert `fetchWithSsrFGuard` is called instead.                                                                                                              |

</phase_requirements>

## Standard Stack

### Core (already in codebase — use these, do not introduce new dependencies)

| Component                 | Location                       | Purpose                                              | Why Standard                                                              |
| ------------------------- | ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `fetchWithSsrFGuard`      | `src/infra/net/fetch-guard.ts` | SSRF-safe HTTP client                                | DNS-pinning, redirect tracking, private-IP blocking                       |
| `resolveRequiredHomeDir`  | `src/infra/home-dir.ts`        | Home dir resolution                                  | Respects `OPENCLAW_HOME`, `HOME`, `USERPROFILE`, `os.homedir()`           |
| `resolveEffectiveHomeDir` | `src/infra/home-dir.ts`        | Home dir resolution (returns undefined if not found) | Use when absence is valid; `resolveRequiredHomeDir` falls back to `cwd()` |
| `expandHomePrefix`        | `src/infra/home-dir.ts`        | Tilde expansion                                      | For user-supplied paths with `~` prefix                                   |
| `better-sqlite3`          | `package.json` dependencies    | SQLite for production                                | Already declared correctly in root deps                                   |
| vitest + v8               | `vitest.config.ts`             | Test framework                                       | Project standard; 70% line/function threshold                             |

### Supporting Types

| Type                  | Location                       | Purpose                                        |
| --------------------- | ------------------------------ | ---------------------------------------------- |
| `GuardedFetchOptions` | `src/infra/net/fetch-guard.ts` | Input type for `fetchWithSsrFGuard`            |
| `GuardedFetchResult`  | `src/infra/net/fetch-guard.ts` | Return type: `{ response, finalUrl, release }` |
| `SsrFPolicy`          | `src/infra/net/ssrf.js`        | Optional allowlist policy                      |
| `SsrFBlockedError`    | `src/infra/net/ssrf.js`        | Error thrown when SSRF block fires             |

## Architecture Patterns

### Pattern 1: fetchWithSsrFGuard Signature

```typescript
// Source: src/infra/net/fetch-guard.ts (verified by direct read)
export type GuardedFetchOptions = {
  url: string;
  fetchImpl?: FetchLike; // Optional override, defaults to globalThis.fetch
  init?: RequestInit; // Standard fetch init options
  maxRedirects?: number; // Default: 3
  timeoutMs?: number; // Optional abort timeout
  signal?: AbortSignal; // Optional external abort signal
  policy?: SsrFPolicy; // Optional hostname allowlist
  lookupFn?: LookupFn; // Optional DNS lookup override (for testing)
  pinDns?: boolean; // Default: true — DNS-pins the resolved IP
  auditContext?: string; // Label for log warnings on SSRF block
};

export type GuardedFetchResult = {
  response: Response;
  finalUrl: string; // URL after following redirects
  release: () => Promise<void>; // MUST be called to clean up dispatcher
};

// Returns GuardedFetchResult — caller MUST call result.release() in finally block
export async function fetchWithSsrFGuard(params: GuardedFetchOptions): Promise<GuardedFetchResult>;
```

### Pattern 2: Standard Call Pattern (from memory/remote-http.ts)

```typescript
// Source: src/memory/remote-http.ts (verified — canonical wrapper pattern)
import { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";

const { response, release } = await fetchWithSsrFGuard({
  url: params.url,
  init: params.init,
  policy: params.ssrfPolicy,
  auditContext: "module-name",
});
try {
  return await params.onResponse(response);
} finally {
  await release();
}
```

### Pattern 3: Inline try/finally Pattern (from web-fetch.ts)

```typescript
// Source: src/agents/tools/web-fetch.ts (verified)
import { fetchWithSsrFGuard } from "../../infra/net/fetch-guard.js";
import { SsrFBlockedError } from "../../infra/net/ssrf.js";

let release: (() => Promise<void>) | null = null;
try {
  const result = await fetchWithSsrFGuard({
    url: params.url,
    timeoutMs: params.timeoutSeconds * 1000,
    auditContext: "web-fetch",
  });
  const { response } = result;
  release = result.release;
  // use response ...
} catch (error) {
  if (error instanceof SsrFBlockedError) {
    throw error; // re-throw — don't swallow SSRF blocks
  }
  // handle other errors
} finally {
  if (release) await release();
}
```

### Pattern 4: resolveRequiredHomeDir (from config/agent-dirs.ts)

```typescript
// Source: src/config/agent-dirs.ts (verified import pattern)
import { resolveRequiredHomeDir } from "../infra/home-dir.js";

// resolveRequiredHomeDir() never returns undefined — falls back to process.cwd()
const home = resolveRequiredHomeDir();
const dbPath = path.join(home, ".openclaw", "observability.sqlite");

// For module-level constants (replacing: const OBS_DB_PATH = path.join(process.env.HOME ?? "/tmp", ...))
// Use a function instead — avoids capturing HOME at module load time:
function getObsDbPath(): string {
  return path.join(resolveRequiredHomeDir(), ".openclaw", "observability.sqlite");
}
```

### Pattern 5: Extension peerDependencies (from memory-core and googlechat)

```json
// Source: extensions/memory-core/package.json (verified — canonical model)
{
  "devDependencies": {
    "openclaw": "workspace:*" // Keep this — needed for local monorepo dev
  },
  "peerDependencies": {
    "openclaw": ">=2026.1.26" // Add this — semver constraint for npm publish
  }
}
```

### Anti-Patterns to Avoid

- **Swallowing SsrFBlockedError**: Always re-throw SSRF errors; logging and swallowing hides security events.
- **Using `fetchWithSsrFGuard` without `release()`**: The dispatcher holds a connection; omitting `release()` leaks resources.
- **Module-level `process.env.HOME` evaluation**: `const PATH = join(process.env.HOME ?? "/tmp", ...)` at module scope captures HOME at import time, not call time. Use a function that calls `resolveRequiredHomeDir()` lazily.
- **Removing `devDependencies: openclaw: workspace:*` from extensions**: This workspace ref is required for local monorepo development. Do not remove it — only ADD the `peerDependencies` entry alongside it.
- **Using `resolveEffectiveHomeDir()` where `resolveRequiredHomeDir()` is appropriate**: `resolveEffectiveHomeDir()` returns `string | undefined`; the caller must handle the undefined case. `resolveRequiredHomeDir()` always returns a string (falls back to `cwd()`), which is the right choice for database paths.

## Don't Hand-Roll

| Problem               | Don't Build          | Use Instead                                               | Why                                                                                                  |
| --------------------- | -------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| SSRF blocking         | Custom URL validator | `fetchWithSsrFGuard`                                      | Handles DNS rebinding, octal/hex IP literals, redirect chain tracking, cross-origin header stripping |
| Home dir resolution   | Custom env reading   | `resolveRequiredHomeDir` / `resolveEffectiveHomeDir`      | Handles `OPENCLAW_HOME` override, `USERPROFILE` on Windows, `os.homedir()` fallback                  |
| SSRF policy allowlist | Custom regex         | `SsrFPolicy { allowedHostnames }` in `fetchWithSsrFGuard` | Supports wildcard hostnames, integrates with DNS-pinning                                             |

## Common Pitfalls

### Pitfall 1: Not All Bare `fetch()` Calls Are SSRF Risks

**What goes wrong:** Treating every bare `fetch()` call as equally urgent leads to converting calls on hardcoded compile-time constants (e.g., `fetch("https://api.anthropic.com/v1/messages", ...)`) through the SSRF guard, which adds unnecessary complexity and may break in environments where the guard's DNS-pinning conflicts with local service proxies.

**Why it happens:** The blanket instruction "replace all bare fetch() with fetchWithSsrFGuard" ignores that SSRF is about attacker-controlled URLs, not all outbound requests.

**How to avoid:** Audit each call site. The risk tiers are:

- **HIGH PRIORITY** (user or config-controlled URL): `health-check.ts` localhost services, `models-config.providers.ts` (Ollama/vLLM baseUrl from config), `discord/voice-message.ts` (Discord CDN URL from API response), `discord/send.outbound.ts` (webhook URL).
- **MEDIUM PRIORITY** (hardcoded constant, but good hygiene): `credential-monitor.ts` OAUTH_TOKEN_ENDPOINTS, `opencode-zen-models.ts`, `conversation-learner.ts`, `sdk-runner/mcp-servers.ts`.
- **LOWER PRIORITY** (internal/localhost only or CDN relay): `agents/sandbox/browser.ts` (127.0.0.1 only), `browser/` CDP tools (localhost Chrome).

**Warning signs:** Converting `fetch("http://127.0.0.1:${port}/...")` through the guard will FAIL because the guard blocks private IPs by default. The `browser.ts` and CDP-related calls must either stay as bare `fetch()` or use `pinDns: false` with a custom allowlist.

### Pitfall 2: Module-Level HOME Evaluation

**What goes wrong:** Replacing `process.env.HOME ?? "/tmp"` with `resolveRequiredHomeDir()` at module scope still has the same problem: the path is resolved at import time, not call time, so test isolation that sets `process.env.HOME` after import won't work.

**Why it happens:** `const OBS_DB_PATH = path.join(resolveRequiredHomeDir(), ...)` looks like a correct fix but behaves identically to the original for tests.

**How to avoid:** When the existing pattern uses a module-level constant, convert it to a function call:

```typescript
// Before (wrong pattern, even with resolveRequiredHomeDir):
const OBS_DB_PATH = path.join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

// After (correct):
function getObsDbPath(): string {
  return path.join(resolveRequiredHomeDir(), ".openclaw", "observability.sqlite");
}
```

**Warning signs:** Test isolation failures where temp home directories set in `beforeEach` are not picked up by the module.

### Pitfall 3: Extension peerDependencies Semver Choice

**What goes wrong:** Using `workspace:*` in `peerDependencies` (matching the devDependencies pattern) — this will be resolved by pnpm during publish to the literal published package version, which may or may not work, but it won't express a useful minimum version constraint.

**Why it happens:** Cargo-culting the `workspace:*` pattern from `devDependencies`.

**How to avoid:** Use a real semver range like `">=2026.1.26"` (see `memory-core` and `googlechat` as the authoritative examples). The current openclaw version is `2026.2.24`.

### Pitfall 4: better-sqlite3 is Already in dependencies

**What goes wrong:** The planning docs and CONCERNS.md say `better-sqlite3` is in `devDependencies`, but the actual root `package.json` has `"better-sqlite3": "^12.6.2"` in `dependencies`. The CONCERNS.md was written from a prior state.

**Why it happens:** The codebase was updated between when CONCERNS.md was written and now.

**How to avoid:** Before the 22-02 task starts, verify the current state. The task may reduce to: (a) confirm root has it in `dependencies` (it does), (b) confirm `tsdown.config.ts` has `external: ["better-sqlite3"]` (it does — confirmed at lines 108 and 116), (c) document this as verified rather than changed.

## Code Examples

### Complete Import Paths (verified)

```typescript
// SSRF guard:
import { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";
// (adjust relative path based on caller location)

// SSRF error type:
import { SsrFBlockedError } from "../infra/net/ssrf.js";

// Home dir:
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { resolveEffectiveHomeDir, expandHomePrefix } from "../infra/home-dir.js";

// Plugin SDK re-export (confirmed at line 247):
// fetchWithSsrFGuard is already re-exported from src/plugin-sdk/index.ts
```

### Replacing a Bare fetch() in an Infra Module

```typescript
// Before (src/infra/alert-dispatcher.ts pattern):
const dbPath = join(process.env.HOME ?? "/tmp", ".openclaw", "observability.sqlite");

// After:
import { resolveRequiredHomeDir } from "./home-dir.js";
// ...
function getObsDbPath(): string {
  return join(resolveRequiredHomeDir(), ".openclaw", "observability.sqlite");
}
```

### Adding peerDependencies to an Extension

```json
// extensions/discord/package.json — BEFORE:
{
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}

// AFTER:
{
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "peerDependencies": {
    "openclaw": ">=2026.1.26"
  }
}
```

## Full Inventory: SSRF Gaps (FOUND-01)

### High-Priority Sites (URL is config-supplied or API-response-supplied — genuine SSRF risk)

| File                                    | Line(s)         | URL Source                                                               | Action                                                                                             |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/infra/health-check.ts`             | 169             | `service.url` from hardcoded list (`localhost:18789`, `localhost:11435`) | Localhost: leave as bare `fetch()` OR use `pinDns: false` allowlist; these are internal            |
| `src/infra/health-check.ts`             | 219             | `endpoint` from `apiHealthChecks` dict (hardcoded strings)               | Low risk: all values are hardcoded API endpoints                                                   |
| `src/agents/models-config.providers.ts` | 241             | Ollama `baseUrl` from user config                                        | HIGH: use guard with `policy: { allowedHostnames: [parsed.hostname] }`                             |
| `src/agents/models-config.providers.ts` | 287             | vLLM `baseUrl` from user config                                          | HIGH: same pattern as Ollama                                                                       |
| `src/discord/send.outbound.ts`          | 347             | Discord webhook execution URL                                            | MEDIUM: Discord CDN, not user-provided but externally-sourced                                      |
| `src/discord/voice-message.ts`          | 267             | `upload_url` from Discord API response                                   | MEDIUM: Discord CDN URL returned by API                                                            |
| `src/slack/monitor/media.ts`            | 64, 68, 82, 108 | Slack file URLs (auth-gated)                                             | MEDIUM: already includes manual redirect handling; guard would conflict with custom redirect logic |

### Medium-Priority Sites (Hardcoded constants — low risk but good hygiene)

| File                                   | Line(s)                       | URL                                                 | Action                                                                         |
| -------------------------------------- | ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/infra/credential-monitor.ts`      | 126                           | `OAUTH_TOKEN_ENDPOINTS[cred.provider]` (const map)  | Low risk; add guard for defense-in-depth                                       |
| `src/providers/github-copilot-auth.ts` | 46, 78                        | `DEVICE_CODE_URL`, `ACCESS_TOKEN_URL` (const)       | Low risk; add guard                                                            |
| `src/agents/opencode-zen-models.ts`    | 285                           | `OPENCODE_ZEN_API_BASE_URL` (const)                 | Low risk; add guard                                                            |
| `src/agents/conversation-learner.ts`   | 83                            | `"https://api.anthropic.com/v1/messages"` (literal) | Low risk; add guard                                                            |
| `src/agents/sdk-runner/mcp-servers.ts` | 508                           | `EMBEDDING_SERVER` (const)                          | Low risk; add guard                                                            |
| `src/commands/signal-install.ts`       | 219                           | `"https://api.github.com/repos/..."` (literal)      | Low risk; add guard                                                            |
| `src/providers/qwen-portal-oauth.ts`   | 16                            | `QWEN_OAUTH_TOKEN_ENDPOINT` (const)                 | Low risk; add guard                                                            |
| `src/agents/tools/web-fetch.ts`        | 379                           | Firecrawl endpoint (passed `apiKey` param)          | Already has guard at line 526; this path is for Firecrawl proxy, URL hardcoded |
| `src/agents/tools/web-search.ts`       | 605, 684, 807, 857, 950, 1184 | Provider API endpoints (Gemini, xAI, etc.)          | Low risk; consider guard for redirect URL at 1184                              |
| `src/channels/telegram/api.ts`         | 8                             | `api.telegram.org` URL (token in path)              | Low risk; add guard                                                            |

### Do Not Convert (Internal/special use)

| File                                  | Line(s)  | Reason                                                                      |
| ------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `src/agents/sandbox/browser.ts`       | 51       | Hardcoded `127.0.0.1:${cdpPort}` — localhost, intentional                   |
| `src/browser/extension-relay-auth.ts` | 58       | `baseUrl` from config, localhost Chrome DevTools                            |
| `src/browser/chrome.ts`               | 86       | `cdpUrl` from config, Chrome DevTools Protocol                              |
| `src/browser/pw-session.ts`           | 417      | `cdpUrl` from config, Chrome DevTools Protocol                              |
| `src/browser/cdp.helpers.ts`          | 125      | Chrome DevTools Protocol internal                                           |
| `src/browser/client-fetch.ts`         | 140      | Browser client internal                                                     |
| `src/agents/ollama-stream.ts`         | 455      | Ollama local chat stream — config URL, guard would add latency to streaming |
| `src/tts/tts-core.ts`                 | 557, 612 | Provider APIs (ElevenLabs, OpenAI TTS) — hardcoded base URLs                |
| `src/cli/nodes-camera.ts`             | 81       | URL validated by `parsed.protocol !== "https:"` check before use            |

## Full Inventory: process.env.HOME Sites (FOUND-04)

31 production sites identified. Files with module-level constant patterns need function-based replacement:

### Module-Level Constants (convert to functions)

- `src/agents/compound-orchestrator.ts:71` — `const OBS_DB_PATH = ...`
- `src/agents/task-decomposer.ts:106` — `const OBS_DB_PATH = ...`
- `src/agents/autonomy-enforcer.ts:27` — `const HOME = ...`
- `src/gateway/channel-events.ts:21` — `const DB_DIR = ...`

### Inline Uses (direct replacement in function body)

- `src/infra/alert-dispatcher.ts` (lines 123, 167)
- `src/infra/crash-logger.ts` (line 29)
- `src/infra/status-dashboard.ts` (line 174)
- `src/infra/health-check.ts` (lines 190, 266, 270, 274, 278, 283, 364, 472)
- `src/agents/compound-orchestrator.ts` (line 172)
- `src/agents/task-decomposer.ts` (line 323)
- `src/agents/conversation-learner.ts` (lines 16, 24)
- `src/agents/llm-config-reader.ts` (line 126)
- `src/agents/sdk-runner/mcp-servers.ts` (lines 419, 462)
- `src/agents/task-classifier.ts` (line 645)
- `src/agents/verification.ts` (line 197)
- `src/gateway/channel-events.ts` (line 21)

### Tilde Expansion Sites (use `expandHomePrefix` instead)

- `src/imessage/monitor/monitor-provider.ts:65` — `cliPath.replace(/^~/, process.env.HOME ?? "")`
- `src/auto-reply/reply/commands-export-session.ts:176` — `args.outputPath.replace("~", process.env.HOME ?? "")`

### os.homedir() Fallback Sites (just switch to resolveRequiredHomeDir)

- `src/wizard/onboarding.completion.ts:22` — `process.env.HOME || os.homedir()`
- `src/cli/completion-cli.ts` (lines 164, 304) — `process.env.HOME || os.homedir()`
- `src/commands/doctor-platform-notes.ts:13` — `process.env.HOME ?? os.homedir()`

## Full Inventory: Extension Workspace Dependencies (FOUND-03)

28 extensions need a `peerDependencies` entry added. All currently have:

```json
"devDependencies": { "openclaw": "workspace:*" }
```

Extensions to update (add `"peerDependencies": { "openclaw": ">=2026.1.26" }`):
`bluebubbles`, `copilot-proxy`, `diagnostics-otel`, `discord`, `feishu`, `google-gemini-cli-auth`, `imessage`, `irc`, `line`, `matrix`, `mattermost`, `memory-lancedb`, `minimax-portal-auth`, `msteams`, `nextcloud-talk`, `nostr`, `signal`, `slack`, `synology-chat`, `telegram`, `tlon`, `twitch`, `voice-call`, `whatsapp`, `zalo`, `zalouser`.

Note: `googlechat` and `memory-core` already have the correct pattern (both `devDependencies` workspace:\* AND `peerDependencies` semver range).

Note: `llm-task`, `lobster`, `open-prose` have no `openclaw` dependency at all — they are exempt.

Note: `googlechat` also has `"dependencies": { "google-auth-library": "^10.5.0" }` (a real runtime dep). This is the correct use of `dependencies` in extensions — for third-party packages the extension actually imports.

## better-sqlite3 Status (FOUND-02)

**Current state (verified from `package.json`):**

- `dependencies: "better-sqlite3": "^12.6.2"` — CORRECT
- `devDependencies`: NOT PRESENT — CORRECT
- `tsdown.config.ts` lines 108, 116: `external: ["better-sqlite3"]` — CORRECT

**CONCERNS.md was written from a prior state.** The root package already has `better-sqlite3` in production deps. The FOUND-02 task should:

1. Confirm this is true (it is)
2. Verify any sub-packages (none appear to have their own `better-sqlite3` dep based on the investigation)
3. Verify `tsdown.config.ts` external is set correctly (confirmed)
4. Update CONCERNS.md to reflect the current state
5. Confirm that files using `require("better-sqlite3")` dynamically (e.g., `hook-executor.ts`) will continue to find the package correctly

## Validation Architecture

### Test Framework

| Property           | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| Framework          | vitest (v8 coverage)                                     |
| Config file        | `vitest.config.ts`                                       |
| Quick run command  | `pnpm test --run src/infra/net/fetch-guard.ssrf.test.ts` |
| Full suite command | `pnpm test`                                              |

### Phase Requirements → Test Map

| Req ID   | Behavior                                           | Test Type | Automated Command                                                       | File Exists?                                   |
| -------- | -------------------------------------------------- | --------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| FOUND-01 | `credential-monitor.ts` routes through guard       | unit      | `pnpm test --run src/infra/credential-monitor.test.ts`                  | Yes (weak — needs guard assertion)             |
| FOUND-01 | `health-check.ts` routes through guard             | unit      | `pnpm test --run src/infra/health-check.test.ts`                        | Yes (stub only)                                |
| FOUND-01 | `discord/send.outbound.ts` routes through guard    | unit      | `pnpm test --run src/discord/send.sends-basic-channel-messages.test.ts` | Yes                                            |
| FOUND-01 | `models-config.providers.ts` Ollama/vLLM use guard | unit      | `pnpm test --run src/agents/models-config.providers*.test.ts`           | Needs creation                                 |
| FOUND-02 | `better-sqlite3` is in production deps             | manual    | `node -e "require('better-sqlite3')"`                                   | N/A — verification only                        |
| FOUND-03 | Extensions have correct peerDeps                   | manual    | `pnpm knip` + JSON inspection                                           | N/A — structural check                         |
| FOUND-04 | `resolveRequiredHomeDir` used instead of env       | unit      | Existing tests in affected modules                                      | Needs inspection per file                      |
| FOUND-05 | SSRF guard test coverage per affected file         | unit      | `pnpm test --run src/infra/net/fetch-guard.ssrf.test.ts`                | Yes (guard tests exist; per-file tests needed) |

### Sampling Rate

- **Per task commit:** `pnpm test --run src/infra/net/` for SSRF changes; `pnpm tsgo` for type errors
- **Per wave merge:** `pnpm test`
- **Phase gate:** `pnpm test && pnpm check` green before marking phase complete

### Wave 0 Gaps

- [ ] `src/infra/credential-monitor.test.ts` — add guard call assertion (mocking global `fetch` and verifying it is NOT called directly)
- [ ] `src/agents/models-config.providers.test.ts` — create if missing, add Ollama/vLLM fetch interception test
- [ ] Existing `health-check.test.ts` has 6 TODO stubs — at minimum add a guard assertion for the external API check

## Open Questions

1. **Slack media.ts: fetchWithSlackAuth custom redirect handling**
   - What we know: `src/slack/monitor/media.ts` implements its own cross-origin redirect handling with manual `Authorization` header management. This is intentionally NOT using the SSRF guard because the guard's redirect handling would interfere.
   - What's unclear: Should this file be exempt from FOUND-01, or should it use `fetchWithSsrFGuard` with `pinDns: false` and manual policy?
   - Recommendation: Treat as exempt — the file has correct security posture for its specific use case (Slack CDN file fetch with auth token stripping on cross-origin redirect). Document the exemption in comments.

2. **process.env.HOME in test-adjacent files**
   - What we know: `src/gateway/test-helpers.server.ts:96` sets `process.env.HOME = tempHome` and `src/agents/models-config.e2e-harness.ts` saves/restores it. These are test infrastructure files.
   - What's unclear: Should these be changed?
   - Recommendation: Exclude from FOUND-04 scope. Test harnesses intentionally mutate `process.env.HOME` to set up temp home dirs. Changing these would break the temp-home test pattern. The 31 count above already excludes most test files; exclude these too.

3. **`sdk-runner/mcp-servers.ts:419` hardcoded fallback `/Users/user`**
   - What we know: `const home = process.env.HOME ?? "/Users/user"` — the fallback is a literal username path, not `/tmp`.
   - What's unclear: This appears to be a developer's personal path left in production code.
   - Recommendation: This is a bug independent of FOUND-04. Fix by using `resolveRequiredHomeDir()`. Flag in the commit message.

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `src/infra/net/fetch-guard.ts` — complete signature and implementation read
- `src/infra/home-dir.ts` — complete implementation read
- `src/memory/remote-http.ts` — canonical guard usage pattern
- `src/agents/tools/web-fetch.ts` — try/finally guard pattern
- `package.json` root — better-sqlite3 placement confirmed
- `tsdown.config.ts` — external: ["better-sqlite3"] confirmed at lines 108, 116
- `extensions/memory-core/package.json` — canonical extension peerDependencies model
- `extensions/googlechat/package.json` — second canonical peerDependencies model
- `vitest.config.ts` — coverage thresholds confirmed (lines: 70, functions: 70, branches: 55)
- All 28 extension `package.json` files — grep-enumerated

### Secondary (MEDIUM confidence — planning docs cross-referenced)

- `.planning/codebase/CONCERNS.md` — used as starting point; FOUND-02 state is outdated
- `.planning/STATE.md` — pre-work context confirmed by direct inspection

## Metadata

**Confidence breakdown:**

- SSRF gap inventory: HIGH — direct grep + file reads of all production src/ files
- better-sqlite3 status: HIGH — direct package.json read; correction to CONCERNS.md documented
- Extension dep status: HIGH — Python enumeration of all 33 extension package.json files
- HOME dir sites: HIGH — grep + contextual read; 31 confirmed sites
- fetchWithSsrFGuard API: HIGH — read from source
- resolveRequiredHomeDir API: HIGH — read from source

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable codebase; recheck if large refactors land)
