# Codebase Structure

**Analysis Date:** 2026-03-01

## Directory Layout

```
openclaw/                           # Monorepo root
├── src/                            # Primary TypeScript source (Node.js gateway + CLI)
│   ├── index.ts                    # CLI entrypoint (main export + isMain guard)
│   ├── entry.ts                    # Alternative entry shim
│   ├── runtime.ts                  # RuntimeEnv interface + defaultRuntime
│   ├── logger.ts                   # Top-level logger re-export
│   ├── logging.ts                  # Logging re-export module
│   ├── globals.ts                  # Global flags (verbose, etc.)
│   ├── utils.ts                    # Top-level utility functions
│   ├── version.ts                  # Version constant
│   ├── polls.ts                    # Polling primitive
│   │
│   ├── acp/                        # Agent Client Protocol (ACP) integration
│   ├── agents/                     # LLM agent runners, tools, session management
│   │   ├── pi-embedded-runner/     # Primary: embedded pi-agent SDK runner
│   │   ├── cli-runner/             # Secondary: Claude CLI subprocess runner
│   │   ├── sdk-runner/             # ACP/MCP SDK runner
│   │   ├── auth-profiles/          # API key store and rotation logic
│   │   ├── pi-embedded-helpers/    # Helper utilities for embedded runner
│   │   ├── pi-extensions/          # Context pruning and pi-agent extensions
│   │   ├── sandbox/                # Sandbox policy and configuration
│   │   ├── schema/                 # Agent schema definitions
│   │   ├── skills/                 # Skills loading, refreshing, status
│   │   ├── test-helpers/           # Test fixtures for agent layer
│   │   └── tools/                  # Tool definitions (bash, web, message, sessions, discord, slack, etc.)
│   ├── auto-reply/                 # Inbound message → LLM → outbound reply orchestration
│   │   ├── reply/                  # Core reply pipeline
│   │   │   ├── get-reply.ts        # Main entry: getReplyFromConfig()
│   │   │   ├── get-reply-run.ts    # Runs prepared reply after setup
│   │   │   ├── reply-dispatcher.ts # Manages concurrent reply dispatch
│   │   │   ├── commands-subagents/ # Subagent command handling
│   │   │   ├── exec/               # Exec directive handling
│   │   │   ├── export-html/        # HTML export for replies
│   │   │   └── queue/              # Queued reply handling
│   │   ├── dispatch.ts             # dispatchInboundMessage()
│   │   ├── heartbeat.ts            # Heartbeat reply logic
│   │   └── templating.ts           # MsgContext type + template processing
│   ├── browser/                    # Playwright-based browser tool
│   ├── canvas-host/                # Canvas/A2UI host server
│   ├── channels/                   # Shared channel abstractions
│   │   ├── plugins/                # Channel plugin registry, types, adapters
│   │   ├── allowlists/             # Allowlist matching logic
│   │   ├── telegram/               # Telegram-specific channel helpers
│   │   └── web/                    # Web channel helpers
│   ├── cli/                        # CLI program builder
│   │   ├── program/                # build-program.ts, command-registry.ts
│   │   ├── browser-cli-actions-input/
│   │   ├── cron-cli/
│   │   ├── daemon-cli/
│   │   ├── gateway-cli/
│   │   ├── node-cli/
│   │   └── nodes-cli/
│   ├── commands/                   # CLI subcommand implementations (~200+ files)
│   │   ├── agent/                  # Agent command (core RPC entry)
│   │   ├── channels/               # Channel management commands
│   │   ├── models/                 # Model listing and management
│   │   ├── onboard-non-interactive/
│   │   ├── onboarding/
│   │   ├── status-all/
│   │   └── gateway-status/
│   ├── compat/                     # Backwards-compatibility shims
│   ├── config/                     # Config loading, schema, validation
│   │   └── sessions/               # Session store and path management
│   ├── cron/                       # Cron scheduler implementation
│   ├── daemon/                     # Daemon install/management
│   ├── discord/                    # Discord channel implementation
│   │   └── monitor/                # Discord message monitor
│   ├── docs/                       # Embedded docs references
│   ├── gateway/                    # Gateway server (core runtime)
│   │   ├── server.impl.ts          # startGatewayServer() — main factory
│   │   ├── server.ts               # Public exports
│   │   ├── server-http.ts          # HTTP server + Slack/Hooks/Control UI routing
│   │   ├── server-methods.ts       # Aggregate method handler registry
│   │   ├── server-channels.ts      # ChannelManager (start/stop/restart channels)
│   │   ├── server-chat.ts          # Agent event → WebSocket chat bridge
│   │   ├── server-startup.ts       # Sidecar services startup (hooks, memory, browser)
│   │   ├── server-startup-log.ts   # Startup log formatting
│   │   ├── server-methods/         # Per-domain method handlers (30+ files)
│   │   ├── protocol/               # Typed protocol schemas (AJV-validated)
│   │   └── server/                 # Health state, TLS, close-reason
│   ├── hooks/                      # Internal hooks: Gmail watcher, bundled hooks
│   ├── imessage/                   # iMessage channel (macOS-only via BlueBubbles)
│   ├── infra/                      # Platform utilities (ports, exec, TLS, fs, net, etc.)
│   │   ├── net/                    # Network utilities
│   │   ├── outbound/               # Outbound target resolution
│   │   ├── tls/                    # TLS fingerprint, certificate helpers
│   │   └── format-time/            # Time formatting utilities
│   ├── line/                       # LINE messaging channel
│   ├── link-understanding/         # URL fetch and content extraction
│   ├── logging/                    # Structured logging (logger, console capture, subsystem, redact)
│   ├── markdown/                   # Markdown processing utilities
│   ├── media/                      # Media file detection and handling
│   ├── media-understanding/        # Multimodal (image/audio/video) understanding
│   │   └── providers/              # Per-provider media understanding (anthropic, google, openai, etc.)
│   ├── memory/                     # Vector memory backend (sqlite-vec, embeddings, search)
│   ├── node-host/                  # Remote node (satellite) runner
│   ├── pairing/                    # QR pairing flow
│   ├── plugin-sdk/                 # Public plugin SDK (re-exported as package entry)
│   ├── plugins/                    # Plugin system (loader, registry, hooks, install, runtime)
│   │   └── runtime/                # Plugin runtime isolation
│   ├── process/                    # Process execution utilities
│   │   └── supervisor/             # Process supervisor (pty, exec management)
│   │       └── adapters/
│   ├── providers/                  # LLM provider utilities (Gemini, GitHub Copilot, Qwen OAuth)
│   ├── routing/                    # Message → agent routing (session keys, bindings)
│   ├── scripts/                    # Source scripts referenced by build
│   ├── security/                   # Security utilities (audit, DM policy, secret comparison)
│   ├── sessions/                   # Session-level utilities (model overrides, send policy)
│   ├── shared/                     # Shared net + text utilities
│   ├── signal/                     # Signal channel
│   │   └── monitor/
│   ├── slack/                      # Slack channel
│   │   ├── http/                   # Slack HTTP event endpoint
│   │   └── monitor/                # Slack message monitor
│   │       ├── events/
│   │       └── message-handler/
│   ├── telegram/                   # Telegram channel
│   │   └── bot/                    # Grammy bot delivery and helpers
│   ├── terminal/                   # Terminal UI utilities (progress, table, palette, colors)
│   ├── test-helpers/               # Cross-cutting test helpers
│   ├── test-utils/                 # Test utilities and mocks
│   ├── tts/                        # Text-to-speech
│   ├── tui/                        # Terminal UI (Ink-based interactive chat)
│   │   ├── components/             # TUI React components
│   │   └── theme/                  # TUI theming
│   ├── types/                      # Shared TypeScript type declarations
│   ├── utils/                      # Utility modules (directive-tags, message-channel, etc.)
│   ├── web/                        # Web channel (in-browser chat)
│   │   ├── auto-reply/             # Web channel auto-reply and monitor
│   │   └── inbound/                # Web inbound handling
│   ├── whatsapp/                   # WhatsApp channel (Baileys)
│   └── wizard/                     # Onboarding wizard
│
├── extensions/                     # Workspace package extensions (channel plugins)
│   ├── discord/                    # Discord extension
│   ├── feishu/                     # Feishu/Lark channel
│   ├── googlechat/                 # Google Chat channel
│   ├── imessage/                   # iMessage extension
│   ├── irc/                        # IRC channel
│   ├── line/                       # LINE extension
│   ├── matrix/                     # Matrix channel
│   ├── mattermost/                 # Mattermost channel
│   ├── msteams/                    # Microsoft Teams channel
│   ├── nextcloud-talk/             # Nextcloud Talk channel
│   ├── nostr/                      # Nostr protocol channel
│   ├── signal/                     # Signal channel extension
│   ├── slack/                      # Slack extension
│   ├── synology-chat/              # Synology Chat channel
│   ├── telegram/                   # Telegram extension
│   ├── tlon/                       # Tlon/Urbit channel
│   ├── twitch/                     # Twitch channel
│   ├── voice-call/                 # Voice call extension (Twilio)
│   ├── whatsapp/                   # WhatsApp extension
│   ├── zalo/                       # Zalo channel
│   └── shared/                     # Shared extension utilities
│
├── apps/                           # Native platform apps
│   ├── macos/                      # macOS menubar app (Swift/SwiftUI)
│   ├── ios/                        # iOS app (Swift/SwiftUI)
│   ├── android/                    # Android app (Kotlin)
│   └── shared/                     # Shared OpenClawKit (Swift package)
│
├── Swabble/                        # SwiftUI voice assistant component (Swift package)
│
├── ui/                             # Web control UI (Lit/TypeScript)
│   └── src/
│       ├── ui/                     # UI components and views
│       │   ├── chat/               # Chat UI components
│       │   ├── components/         # Shared UI components
│       │   ├── controllers/        # Controller logic
│       │   ├── views/              # Page-level views
│       │   └── data/               # Data layer for UI
│       ├── i18n/                   # Internationalization
│       └── styles/                 # CSS styles
│
├── vendor/                         # Vendored libraries
│   └── a2ui/                       # Agent-to-UI protocol and renderers
│       ├── specification/          # A2UI spec (0.8, 0.9)
│       └── renderers/              # Lit and Angular renderers
│
├── docs/                           # Mintlify documentation source
├── scripts/                        # Build and dev scripts (Node.js/bash)
├── test/                           # Global test fixtures, helpers, mocks
│   ├── fixtures/                   # Test fixtures (child-process-bridge, hooks-install)
│   ├── helpers/                    # Global test helpers
│   └── mocks/                      # Global test mocks
├── workspace/                      # Developer workspace config
├── .planning/                      # GSD planning documents
│   ├── codebase/                   # Codebase analysis docs (this dir)
│   ├── milestones/                 # Milestone definitions
│   └── phases/                     # Phase plans
├── .agents/                        # Agent skills and protocols
├── .github/                        # GitHub Actions, labeler, issue templates
├── package.json                    # Root package manifest
├── pnpm-workspace.yaml             # pnpm workspace config
├── tsconfig.json                   # Root TypeScript config
├── tsdown.config.ts                # tsdown (build) config
└── vitest.unit.config.ts           # Vitest unit test config
```

## Directory Purposes

**`src/agents/`:**

- Purpose: Everything related to running LLM inference and managing agent sessions
- Contains: Three runner backends (pi-embedded, cli-runner, sdk-runner), tool definitions, model catalog, auth profile rotation, workspace/session file management, subagent orchestration, context compaction, skills loading
- Key files: `src/agents/pi-embedded-runner/run.ts`, `src/agents/cli-runner.ts`, `src/agents/model-auth.ts`, `src/agents/workspace.ts`, `src/agents/tools/`

**`src/auto-reply/`:**

- Purpose: The reply pipeline — turns an inbound message into an LLM call and routes the reply back
- Contains: `MsgContext` type, directive extraction (exec, queue, verbose, etc.), model selection, typing controllers, inbound debouncing, heartbeat handling
- Key files: `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/dispatch.ts`, `src/auto-reply/templating.ts`

**`src/channels/plugins/`:**

- Purpose: Runtime registry and type system for channel plugins
- Contains: `ChannelPlugin` type, adapter interfaces, plugin listing/lookup, channel registry
- Key files: `src/channels/plugins/index.ts`, `src/channels/plugins/types.ts`, `src/channels/plugins/types.adapters.ts`

**`src/config/`:**

- Purpose: All config loading, Zod schema, migrations, session stores
- Contains: `config.ts` (IO), `schema.ts`, `zod-schema.ts`, type files per feature domain (types.models.ts, types.channels.ts, etc.), legacy migrations
- Key files: `src/config/config.ts`, `src/config/zod-schema.ts`, `src/config/types.ts`

**`src/gateway/`:**

- Purpose: The runtime gateway process — WebSocket server, HTTP, channel lifecycle, method dispatch
- Contains: `server.impl.ts` (startup), per-domain method handlers in `server-methods/`, protocol schemas in `protocol/`, hooks, config reload, cron, health, OpenAI-compatible HTTP API
- Key files: `src/gateway/server.impl.ts`, `src/gateway/server-http.ts`, `src/gateway/server-methods.ts`, `src/gateway/server-channels.ts`

**`src/infra/`:**

- Purpose: Platform-level utilities with no business logic
- Contains: Ports, process exec, TLS, Bonjour/Tailscale, heartbeat runner, observability DB, update checks, exec approval security, path guards
- Key files: `src/infra/exec-approvals.ts`, `src/infra/heartbeat-runner.ts`, `src/infra/ports.ts`, `src/infra/errors.ts`

**`src/plugins/`:**

- Purpose: Plugin loading, registry, hook execution, HTTP plugin endpoints
- Contains: Plugin loader (npm install + dynamic import), plugin registry (channels + hooks), hook runner (before-agent-start, after-tool-call, etc.)
- Key files: `src/plugins/loader.ts`, `src/plugins/registry.ts`, `src/plugins/hook-runner-global.ts`, `src/plugins/services.ts`

**`src/routing/`:**

- Purpose: Map channel + account + peer to agent ID and session key
- Contains: `resolveAgentRoute()` with tiered binding matching, session key building, account ID normalization, binding config lookup
- Key files: `src/routing/resolve-route.ts`, `src/routing/session-key.ts`, `src/routing/bindings.ts`

**`extensions/`:**

- Purpose: Optional channel plugins as separate npm workspace packages
- Contains: One directory per channel (matrix, msteams, voice-call, etc.); each has its own `package.json`, `src/`, and tests
- Key files: `extensions/<name>/src/` (implementation), `extensions/<name>/package.json`

**`apps/macos/`:**

- Purpose: macOS menubar application (Swift/SwiftUI + @Observable)
- Contains: Swift sources, Package.swift, xcodegen project.yml, fastlane, Watch app
- Key files: `apps/macos/Sources/`, `apps/macos/Package.swift`

**`ui/`:**

- Purpose: Web control panel served by the gateway
- Contains: Lit web components, i18n, chat UI, config forms, usage views
- Key files: `ui/src/ui/`, `ui/src/styles/`

**`vendor/a2ui/`:**

- Purpose: Agent-to-UI protocol enabling AI agents to render structured UIs in chat
- Contains: JSON specification (0.8 and 0.9), Lit renderer, Angular renderer
- Generated: Bundled by `scripts/bundle-a2ui.sh`, copied to `dist/` by build

## Key File Locations

**Entry Points:**

- `src/index.ts`: CLI entry — builds Commander program, handles isMain guard
- `openclaw.mjs`: Compiled CLI binary shim (in dist, referenced by `package.json#bin`)
- `src/gateway/server.impl.ts`: `startGatewayServer()` — gateway process factory
- `src/tui/tui.ts`: Terminal UI entry
- `src/node-host/runner.ts`: Remote node runner entry

**Configuration:**

- `src/config/config.ts`: `loadConfig()`, `writeConfigFile()`, `readConfigFileSnapshot()`
- `src/config/zod-schema.ts`: Zod schema root (`OpenClawSchema`)
- `src/config/schema.ts`: JSON Schema (for AJV)
- `src/config/paths.ts`: Path resolution (`resolveStateDir()`, `CONFIG_PATH`)

**Core Logic:**

- `src/auto-reply/reply/get-reply.ts`: `getReplyFromConfig()` — central reply orchestrator
- `src/routing/resolve-route.ts`: `resolveAgentRoute()` — message routing
- `src/agents/pi-embedded-runner/run.ts`: `runEmbeddedPiAgent()` — LLM inference
- `src/gateway/server-methods.ts`: `coreGatewayHandlers` — all WS method handlers
- `src/channels/plugins/index.ts`: `listChannelPlugins()`, `getChannelPlugin()`

**Protocol / Types:**

- `src/gateway/protocol/index.ts`: AJV-validated protocol types and schemas
- `src/gateway/protocol/schema.ts`: Master protocol JSON Schema
- `src/channels/plugins/types.ts`: `ChannelPlugin` and all adapter types
- `src/config/types.ts`: `OpenClawConfig` (master config type)

**Testing:**

- `test/`: Global test fixtures and helpers
- `src/**/*.test.ts`: Colocated unit/integration tests
- `src/**/*.e2e.test.ts`: E2E tests (slower, may require running gateway)
- `src/**/*.live.test.ts`: Live tests requiring real credentials/network

**Build Outputs:**

- `dist/`: Compiled JS (tsdown output); committed in npm package
- `dist/index.js`: Main package entry
- `dist/plugin-sdk/`: Plugin SDK compiled output

## Naming Conventions

**Files:**

- `kebab-case.ts` for all TypeScript source files
- `*.test.ts` — unit/integration test (colocated with source)
- `*.e2e.test.ts` — end-to-end test
- `*.live.test.ts` — live test requiring external services
- `*.test-helpers.ts` / `*.test-utils.ts` — shared test utilities
- `*.mocks.ts` — mock implementations for tests
- Domain prefix pattern for gateway methods: `server-methods/chat.ts`, `server-methods/sessions.ts`
- Multi-word sub-features: `server-startup-log.ts`, `server-startup-memory.ts`

**Directories:**

- `kebab-case/` for all directories
- Channel directories named after the platform: `telegram/`, `discord/`, `slack/`
- Extension directories named after platform: `extensions/msteams/`, `extensions/matrix/`

**TypeScript:**

- Types: `PascalCase` (e.g., `OpenClawConfig`, `ChannelPlugin`, `ResolvedAgentRoute`)
- Functions: `camelCase` (e.g., `resolveAgentRoute`, `startGatewayServer`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_AGENT_ID`, `GATEWAY_EVENTS`)
- Zod schemas: `PascalCaseSchema` suffix (e.g., `AgentSummarySchema`)

## Where to Add New Code

**New Messaging Channel (built-in):**

- Implementation: `src/<channel-name>/` (monitor, delivery, helpers)
- Channel plugin registration: register in `src/plugins/loader.ts` or bundled plugin list
- Tests: `src/<channel-name>/*.test.ts`
- Update: `.github/labeler.yml`, create matching GitHub label

**New Messaging Channel (extension):**

- Package: `extensions/<channel-name>/` with own `package.json` and `src/`
- Main export: `extensions/<channel-name>/src/index.ts` implementing `ChannelPlugin`
- Keep channel-specific deps in extension's own `package.json`
- Do NOT use `workspace:*` in `dependencies`; use `devDependencies` or `peerDependencies`

**New Gateway Method:**

- Handler file: `src/gateway/server-methods/<domain>.ts`
- Register in: `src/gateway/server-methods.ts` (import and add to `coreGatewayHandlers`)
- Protocol schema: `src/gateway/protocol/schema.ts` + matching type file in `src/gateway/protocol/`
- Tests: colocated `src/gateway/server-methods/<domain>.test.ts`

**New Agent Tool:**

- Implementation: `src/agents/tools/<tool-name>.ts`
- Register in: `src/agents/openclaw-tools.ts` or `src/agents/pi-tools.ts`
- Tests: `src/agents/tools/<tool-name>.test.ts`

**New Config Option:**

- Schema: `src/config/zod-schema.ts` (add to Zod schema)
- Type: `src/config/types.ts` (add to appropriate `types.*.ts`)
- Tests: `src/config/config.*.test.ts`

**New CLI Command:**

- Implementation: `src/commands/<command-name>.ts`
- Register in: `src/cli/program/command-registry.ts`
- Tests: `src/commands/<command-name>.test.ts`

**Utilities:**

- Shared infra helpers: `src/infra/<utility>.ts`
- Shared non-infra helpers: `src/utils/<utility>.ts` or `src/shared/`
- Channel-agnostic auto-reply helpers: `src/auto-reply/<helper>.ts`

**New Extension Package:**

- Create `extensions/<name>/package.json` (use `openclaw` in `devDependencies`)
- Add to `pnpm-workspace.yaml` workspaces
- Add entry to `.github/labeler.yml`

## Special Directories

**`.planning/`:**

- Purpose: GSD planning documents (milestones, phases, codebase analysis)
- Generated: Partially (some files auto-generated by GSD agents)
- Committed: Yes

**`dist/`:**

- Purpose: Compiled TypeScript output (ESM)
- Generated: Yes (by `pnpm build` via tsdown)
- Committed: Yes (for npm publish; `files` in package.json)

**`extensions/*/node_modules/`:**

- Purpose: Extension-specific dependencies
- Generated: Yes (by `pnpm install`)
- Committed: No

**`vendor/a2ui/renderers/lit/dist/`:**

- Purpose: Compiled Lit renderer for A2UI
- Generated: Yes (by `scripts/bundle-a2ui.sh`)
- Committed: Yes (bundled output included in dist)

**`.wrangler/`:**

- Purpose: Cloudflare Workers build cache
- Generated: Yes
- Committed: No

**`workspace/`:**

- Purpose: Developer workspace configuration (gitignored local overrides)
- Generated: No
- Committed: Partially (template files only)

---

_Structure analysis: 2026-03-01_
