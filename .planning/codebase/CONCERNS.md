# Codebase Concerns

**Analysis Date:** 2026-03-01

## Tech Debt

**`better-sqlite3` in devDependencies but used in production code:**

- Issue: `better-sqlite3` is a native module listed only under `devDependencies` in `package.json` (line 210), but is dynamically `require()`-d in production runtime code. This works at dev time but will fail in production environments where devDependencies are not installed.
- Files: `src/infra/db-init.ts`, `src/infra/crash-logger.ts`, `src/agents/sdk-runner/mcp-servers.ts`, `src/agents/conversation-learner.ts`, `src/agents/retry-logic.ts`, `src/agents/timeout-enforcement.ts`, `src/plugins/hook-executor.ts`
- Impact: Production crash if `devDependencies` are pruned. The CLAUDE.md note says `better-sqlite3` must be `external` in `tsdown.config.ts` (native module), but the dep placement is wrong.
- Fix approach: Move `better-sqlite3` from `devDependencies` to `dependencies`, or confirm the package is always installed at runtime via a separate mechanism.

**28 extensions declare `openclaw: workspace:*` in `dependencies` (not `devDependencies`/`peerDependencies`):**

- Issue: CLAUDE.md explicitly states: "Avoid `workspace:*` in `dependencies`; put `openclaw` in `devDependencies` or `peerDependencies`." 28 extensions violate this.
- Files: `extensions/memory-lancedb/package.json`, `extensions/discord/package.json`, `extensions/telegram/package.json`, `extensions/slack/package.json`, `extensions/signal/package.json`, `extensions/matrix/package.json`, `extensions/whatsapp/package.json`, `extensions/msteams/package.json`, `extensions/voice-call/package.json`, and 19 more.
- Impact: When extensions are published to npm, the `workspace:*` reference cannot resolve, breaking installation for external users.
- Fix approach: Change `"openclaw": "workspace:*"` from `dependencies` to `devDependencies` or `peerDependencies` in each affected `package.json`.

**`process.env.HOME` used directly instead of `resolveEffectiveHomeDir`:**

- Issue: 20+ production code sites bypass the canonical `resolveEffectiveHomeDir()` from `src/infra/home-dir.ts` and use raw `process.env.HOME ?? "/tmp"`. This ignores `OPENCLAW_HOME` overrides and may silently fall back to `/tmp` on some platforms.
- Files: `src/infra/alert-dispatcher.ts` (lines 123, 167), `src/infra/crash-logger.ts` (line 29), `src/infra/status-dashboard.ts` (line 174), `src/infra/health-check.ts` (lines 190, 266-283, 364, 472), `src/agents/compound-orchestrator.ts` (lines 71, 172), `src/agents/task-decomposer.ts` (lines 106, 323), `src/agents/conversation-learner.ts` (line 16)
- Impact: `OPENCLAW_HOME` env var overrides are silently ignored for DB path resolution in these modules. On Windows or container environments without `HOME` set, paths resolve to `/tmp` instead of a valid location.
- Fix approach: Replace `process.env.HOME ?? "/tmp"` with `resolveRequiredHomeDir()` or `resolveEffectiveHomeDir()` from `src/infra/home-dir.ts`.

**CLAWDBOT legacy env vars still present in 21 production code sites:**

- Issue: Legacy `CLAWDBOT_*` env vars (from a prior product name) are still read alongside `OPENCLAW_*` vars as fallbacks. This adds ongoing maintenance surface.
- Files: `src/config/paths.ts`, `src/pairing/setup-code.ts`, `src/infra/bonjour.ts`, `src/agents/shell-utils.ts`, `src/cli/daemon-cli/install.ts`, `src/browser/extension-relay-auth.ts`, `src/commands/doctor-gateway-services.ts`, `src/commands/status.scan.ts`, `src/utils.ts`
- Impact: Low immediate risk; mostly a maintenance concern. Any new configuration code must remember to check both prefixes.
- Fix approach: After a deprecation window, remove `CLAWDBOT_*` fallbacks. Maintain a migration guide in `docs/`.

**`any` typed `db` singletons in monitoring/infra code:**

- Issue: `crash-logger.ts`, `db-init.ts`, `mcp-servers.ts`, and `health-check.ts` all declare `let db: any` or `let Database: any` due to dynamic `require()` of `better-sqlite3`. This suppresses type checking on all DB operations in those files.
- Files: `src/infra/crash-logger.ts` (line 18), `src/infra/db-init.ts` (line 13), `src/agents/sdk-runner/mcp-servers.ts` (line 454), `src/infra/health-check.ts` (line 294)
- Impact: Type errors in DB interaction code in these files will not be caught at compile time.
- Fix approach: Import `better-sqlite3` types (`import type Database from "better-sqlite3"`) for type annotations while keeping dynamic `require()` for the actual runtime call.

**Untyped `member` field in Discord sender identity:**

- Issue: `src/discord/monitor/sender-identity.ts` declares `member?: any` (lines 32 and 78) because the Discord guild member type from the library does not match the runtime shape.
- Files: `src/discord/monitor/sender-identity.ts`
- Impact: Loss of type safety for member-based permission and display logic.
- Fix approach: Define a minimal `DiscordMemberLike` interface covering the `.nickname` field and use it instead of `any`.

**Untyped channel config index signature:**

- Issue: `src/config/types.channels.ts` uses `[key: string]: any` (line 59) to allow extension channels. This makes the entire `ChannelsConfig` type essentially untyped for unknown keys.
- Files: `src/config/types.channels.ts`
- Impact: Extension channel config is not type-checked; typos in config keys are silently accepted.
- Fix approach: Use a more constrained type like `[key: string]: ChannelConfigBase | undefined` where `ChannelConfigBase` is the minimal known shape.

## Known Bugs

**Health check and monitoring test stubs — not actually testing behavior:**

- Symptoms: `src/infra/status-dashboard.test.ts`, `src/infra/health-check.test.ts`, and `src/infra/alert-dispatcher.test.ts` each have ~6 TODO comments describing tests that should exist but are not implemented. The test files contain only a single smoke test.
- Files: `src/infra/status-dashboard.test.ts`, `src/infra/health-check.test.ts`, `src/infra/alert-dispatcher.test.ts`
- Trigger: Any change to health check logic, dashboard formatting, or alert routing will have zero test coverage.
- Workaround: None. Only integration/manual validation.

**Hook handler type-unsafety: sync hooks accidentally called with async handlers are silently dropped:**

- Symptoms: In `src/plugins/hooks.ts`, the `tool_result_persist` and `before_message_write` hooks detect Promise returns at runtime and drop them with a warning. Plugin authors can accidentally write `async` handlers for sync-only hooks, and in `catchErrors=true` mode the result is silently ignored.
- Files: `src/plugins/hooks.ts` (lines 480-511, 544-557)
- Trigger: Any plugin that implements a sync hook with an `async` function body.
- Workaround: Plugin authors must read docs carefully; no compile-time enforcement.

## Security Considerations

**Direct `fetch()` calls that bypass SSRF guard in several modules:**

- Risk: Multiple production modules call native `fetch()` directly without going through `fetchWithSsrFGuard` from `src/infra/net/fetch-guard.ts`. An SSRF attack via user-controlled URLs could reach internal services.
- Files: `src/infra/credential-monitor.ts` (line 126), `src/infra/health-check.ts` (lines 169, 219), `src/discord/send.outbound.ts` (line 347), `src/agents/tools/web-search.ts` (multiple), `src/agents/tools/web-fetch.ts` (line 379), `src/agents/models-config.providers.ts` (lines 241, 287), `src/providers/github-copilot-auth.ts` (lines 46, 78), `src/agents/opencode-zen-models.ts` (line 285)
- Current mitigation: SSRF guard is applied to the primary user-triggered web tools (`web-fetch`, `web-search`). Provider API calls use hardcoded endpoint constants which partially mitigates risk.
- Recommendations: Audit each bare `fetch()` call to determine if the URL can be influenced by user input or config. Apply `fetchWithSsrFGuard` where user-supplied URLs are possible.

**`console.log` calls in `credential-monitor.ts` log OAuth profile IDs:**

- Risk: `src/infra/credential-monitor.ts` logs messages including `profileId` via `console.log` (lines 43, 51, 73, 79, 98). If logs are forwarded to external observability services, internal profile names are exposed.
- Files: `src/infra/credential-monitor.ts`
- Current mitigation: Uses plain `console.log`; no sensitive key material is logged, only profile IDs.
- Recommendations: Replace `console.log` with `createSubsystemLogger` for consistent log routing and structured output.

## Performance Bottlenecks

**Large files exceeding the 500 LOC guideline — many are well over limit:**

- Problem: 30+ files exceed the 500-line guideline defined in CLAUDE.md and enforced by `scripts/check-ts-max-loc.ts`. The largest are 1,900 lines (`src/memory/qmd-manager.ts`), 1,724 lines (`src/discord/monitor/native-command.ts`), 1,673 lines (`src/commands/doctor-config-flow.ts`), and 1,668 lines (`src/discord/monitor/agent-components.ts`).
- Files: `src/memory/qmd-manager.ts` (1,900 LOC), `src/discord/monitor/native-command.ts` (1,724 LOC), `src/commands/doctor-config-flow.ts` (1,673 LOC), `src/discord/monitor/agent-components.ts` (1,668 LOC), `src/agents/pi-embedded-runner/run/attempt.ts` (1,395 LOC), `src/agents/tools/web-search.ts` (1,348 LOC), `src/config/io.ts` (1,344 LOC)
- Cause: Complex features accumulated in single files without extraction into helpers.
- Improvement path: Extract helpers per CLAUDE.md guidance. Run `pnpm check:loc` to identify all violations.

**Sequential `await` in loops suppressed with `eslint-disable no-await-in-loop` in security module:**

- Problem: `src/security/audit-extra.async.ts` has 7 suppressed `no-await-in-loop` warnings (lines 635, 698, 743, 858, 897) and `src/security/fix.ts` has 7 more (lines 328, 352, 354, 358, 361, 367, 371, 381, 449). Security audit runs filesystem checks serially.
- Files: `src/security/audit-extra.async.ts`, `src/security/fix.ts`
- Cause: Sequential I/O needed for dependency ordering in some cases, but not all.
- Improvement path: Audit each suppressed site; convert independent checks to `Promise.all()` where ordering is not required.

## Fragile Areas

**`src/agents/pi-embedded-runner/run/attempt.ts` — 1,395 LOC central agent run loop:**

- Files: `src/agents/pi-embedded-runner/run/attempt.ts`
- Why fragile: This is the core agent execution path integrating model auth, tool policies, sandbox, compaction, memory hooks, TTS, and channel-specific behavior. Any change touches many orthogonal concerns.
- Safe modification: Always run the full test suite (`pnpm test`) after changes. Add unit tests for any new branching logic before merging.
- Test coverage: Covered by `src/auto-reply/reply/agent-runner.runreplyagent.test.ts` and `agent-runner.misc.runreplyagent.test.ts` but not at line-level granularity.

**`src/config/io.ts` — 1,344 LOC config loading with legacy migration chain:**

- Files: `src/config/io.ts`, `src/config/legacy.migrations.part-3.ts`
- Why fragile: Config loading runs multiple migration passes, legacy key detection, schema validation, and include-file resolution. Silent migration failures can produce valid-looking but wrong config.
- Safe modification: Add a regression test in `src/config/config.legacy-config-detection.*.test.ts` for any new migration. Never remove migration IDs — only add them.
- Test coverage: Good existing test coverage in `src/config/` but new config keys need explicit test cases.

**`src/memory/qmd-manager.ts` — 1,900 LOC memory sync manager:**

- Files: `src/memory/qmd-manager.ts`
- Why fragile: Manages QMD embedding process lifecycle, SQLite FTS indexes, embedding backoff, session-file scanning, and BM25/vector search. Spawns child processes and manages a global embed queue (`qmdEmbedQueueTail`).
- Safe modification: The global `qmdEmbedQueueTail` promise chain must not be bypassed. Any new embed path must chain onto it. FTS5 external content tables need `fts(fts) VALUES('rebuild')` after bulk changes.
- Test coverage: Covered by `src/memory/qmd-manager.test.ts` (2,333 LOC) but concurrency edge cases are hard to cover.

**`src/plugins/hook-executor.ts` — dynamic `require()` for hook loading:**

- Files: `src/plugins/hook-executor.ts`
- Why fragile: Uses `require.resolve("better-sqlite3")` to gate hook persistence features, with three separate `eslint-disable-next-line @typescript-eslint/no-require-imports` suppressions. Fails silently if `better-sqlite3` native bindings are not rebuilt after Node version changes.
- Safe modification: After any Node version bump, run `pnpm rebuild better-sqlite3 --dir ~/.openclaw/projects` (per CLAUDE.md gotcha).
- Test coverage: Partially covered; native binding absence path is not unit-tested.

**MCP zombie server leak on abnormal exit:**

- Files: Gateway MCP server management (see `~/.openclaw/scripts/cleanup-mcp-zombies.sh`)
- Why fragile: Per CLAUDE.md, abnormal MCP server exits do not clean up. Zombie processes accumulate silently and consume ports/memory.
- Safe modification: Use the cleanup script after unexpected gateway crashes. Do not rely on process cleanup from within the gateway on signal exit.
- Test coverage: Not unit-tested. Manual verification only.

## Scaling Limits

**In-memory search caches not bounded:**

- Problem: `src/agents/tools/web-search.ts` uses a `Map<string, CacheEntry>` named `SEARCH_CACHE` at module scope (line 42) with no maximum size or LRU eviction. Under high load with diverse queries, this grows unboundedly.
- Current capacity: Unbounded (process memory).
- Limit: Node.js heap limit (~1.5GB default). High request volume with diverse queries will exhaust memory.
- Scaling path: Add an LRU cache with a configurable max size (e.g., 1,000 entries). Use the `lru-cache` package or implement a simple max-size Map.

**`qmdEmbedQueueTail` is a single global promise chain:**

- Problem: `src/memory/qmd-manager.ts` serializes all embedding operations through a single global promise chain. Concurrent embed requests queue linearly.
- Current capacity: Sequential — one embed at a time.
- Limit: High-volume memory sync with many files will queue deeply, causing latency spikes.
- Scaling path: Add a bounded concurrency pool (e.g., `p-limit(3)`) while preserving ordering guarantees for the same file.

## Dependencies at Risk

**`@whiskeysockets/baileys` at release candidate version:**

- Risk: `"@whiskeysockets/baileys": "7.0.0-rc.9"` is a pre-release RC. WhatsApp Web protocol can change without notice, and RC packages may have breaking API changes between minor versions.
- Impact: WhatsApp channel (`src/whatsapp/`) and any extension depending on it.
- Migration plan: Monitor upstream for stable `7.0.0` release. Test WhatsApp session restoration after any bump.

**`@buape/carbon` at beta version:**

- Risk: `"@buape/carbon": "0.0.0-beta-20260216184201"` is a zero-semver beta. CLAUDE.md explicitly states "Never update Carbon dependency." The beta version string suggests unstable API surface.
- Impact: `src/discord/monitor/native-command.ts` and `src/discord/monitor/agent-components.ts` (both ~1,700 LOC) deeply depend on Carbon APIs.
- Migration plan: Do not update. If Carbon API breaks, a targeted patch is required with explicit approval.

**`request` / `request-promise` overridden with Cypress forks:**

- Risk: The deprecated `request` npm package (unmaintained since 2020) is overridden with `npm:@cypress/request@3.0.10` to resolve transitive dependency CVEs. This is a community fork, not an official fix.
- Impact: Any transitive dep that `require("request")` will get the Cypress fork. Behavior differences possible.
- Migration plan: Identify which transitive deps pull in `request` and upgrade them to use `undici`/native `fetch` directly. Remove the override once those deps are updated.

**`@mariozechner/pi-*` packages at `0.54.1` — third-party agent SDK:**

- Risk: `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui` are all locked to `0.54.1`. These are third-party packages tightly integrated into the agent runner (`src/agents/pi-embedded-runner/`). Any upstream breaking change requires coordinated updates across the 1,395-LOC attempt runner.
- Impact: Agent session transcripts use a `parentId` DAG format specific to this SDK — any schema change in the SDK breaks transcript continuity (see `src/gateway/server-methods/CLAUDE.md`).
- Migration plan: Pin exact versions. Read `CLAUDE.md` `RELEASING.md` before any bump. Never update casually.

## Missing Critical Features

**Health check test coverage is stub-only:**

- Problem: Three monitoring infrastructure files (`status-dashboard.ts`, `health-check.ts`, `alert-dispatcher.ts`) each have test files that contain only a minimal smoke test and 5-6 commented-out TODO test cases. Core behavior (service status detection, WAL checks, API latency display, alert routing) is untested.
- Blocks: Confident refactoring of the monitoring stack. Any health check regression will go undetected until production.

**No type-safe hook handler enforcement for sync-only hooks:**

- Problem: The plugin hook system has no compile-time way to prevent async handlers from being registered for sync-only hooks (`tool_result_persist`, `before_message_write`). The check is runtime-only and silent in `catchErrors=true` mode.
- Blocks: Plugin authors cannot get IDE or build-time errors for this mistake. The SDK would need a separate `SyncHookHandler<T>` vs `AsyncHookHandler<T>` type split.

## Test Coverage Gaps

**Discord, Telegram, Slack, Signal channel surfaces excluded from coverage:**

- What's not tested: Per `vitest.config.ts`, `src/discord/**`, `src/telegram/**`, `src/slack/**`, `src/signal/**`, `src/imessage/**`, `src/browser/**`, and `src/webchat/**` are all excluded from coverage thresholds.
- Files: Entire channel surface directories under `src/discord/`, `src/telegram/`, `src/slack/`, `src/signal/`, `src/imessage/`
- Risk: Channel-level regressions (message parsing, chunking, webhook handling) are only caught by manual testing or live tests.
- Priority: High — channels are the primary user-facing surface.

**TUI and wizard flows excluded from coverage:**

- What's not tested: `src/tui/**` and `src/wizard/**` are explicitly excluded from coverage.
- Files: All files under `src/tui/` and `src/wizard/`
- Risk: CLI interactive onboarding flows can regress silently.
- Priority: Medium — flows are documented as "validated via manual/e2e runs" but lack automation.

**Gateway server and client excluded from coverage:**

- What's not tested: `src/gateway/server.ts`, `src/gateway/client.ts`, `src/gateway/protocol/**` are excluded from coverage thresholds.
- Files: `src/gateway/server.ts`, `src/gateway/client.ts`, `src/gateway/protocol/`
- Risk: Gateway auth, connection handling, and protocol negotiation are not covered by the threshold requirement. Auth tests exist (`src/gateway/server.auth.test.ts`, 1,576 LOC) but are outside the threshold enforcement.
- Priority: High — the gateway is the core runtime.

**Branch coverage threshold is low (55%):**

- What's not tested: The `branches` coverage threshold is 55%, significantly lower than `lines`/`functions`/`statements` at 70%. Conditional logic paths (error branches, fallbacks) are systematically under-tested.
- Files: Global coverage config in `vitest.config.ts` (line 63).
- Risk: Untested branches include error handling paths, fallback behaviors, and edge cases in critical modules.
- Priority: Medium — raise to 65% as a target, focusing first on `src/config/`, `src/agents/`, and `src/routing/`.

---

_Concerns audit: 2026-03-01_
