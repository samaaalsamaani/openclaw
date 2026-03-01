# Architecture

**Analysis Date:** 2026-03-01

## Pattern Overview

**Overall:** Multi-layer event-driven gateway with plugin-based channel extensibility

OpenClaw is a **multi-channel AI gateway**: an always-on Node.js service (the "gateway") that bridges messaging channels (Telegram, Discord, Slack, WhatsApp, Signal, iMessage, web, etc.) to LLM backends (Anthropic, OpenAI, Gemini, etc.). The architecture follows a strict layering pattern where channels produce inbound messages, the routing layer maps them to agents, the reply layer runs LLM inference, and channels receive outbound responses.

**Key Characteristics:**

- Gateway server runs as persistent process with WebSocket + HTTP interface
- All channel integrations are plugins registered at runtime
- Agent execution is delegated to either a CLI subprocess runner or an embedded SDK runner
- A typed protocol (`src/gateway/protocol/`) governs all WebSocket communication
- Config is a single JSON5/YAML file; validated by Zod schemas; hot-reloaded at runtime
- Extensions (`extensions/*`) are npm workspace packages that add new channels or capabilities

## Layers

**CLI Layer (`src/cli/`):**

- Purpose: Parse command-line arguments and dispatch to gateway or local commands
- Location: `src/cli/program/`, `src/cli/program/build-program.ts`
- Contains: Commander.js program builder, command registry, pre-action hooks
- Depends on: config, infra, commands
- Used by: CLI entrypoint `src/index.ts`

**Commands Layer (`src/commands/`):**

- Purpose: Implement individual CLI subcommands (doctor, onboard, auth, models, sessions, etc.)
- Location: `src/commands/`
- Contains: ~200+ command files covering auth setup, channel management, session management, diagnostics
- Depends on: config, agents, infra, channels
- Used by: CLI layer

**Gateway Server Layer (`src/gateway/`):**

- Purpose: The core always-on process; exposes WebSocket + HTTP API; manages channels and agents
- Location: `src/gateway/server.impl.ts`, `src/gateway/server.ts`
- Contains: WebSocket protocol handlers, HTTP endpoints, OpenAI-compatible API, Hooks HTTP endpoint, Control UI serving, channel lifecycle management, cron scheduler, config hot-reload
- Depends on: channels, agents, auto-reply, plugins, routing, infra, config
- Used by: CLI `gateway` command

**Channel Plugin Layer (`src/channels/`, `src/telegram/`, `src/discord/`, `src/slack/`, `src/signal/`, `src/whatsapp/`, `src/imessage/`, `src/web/`, `extensions/`):**

- Purpose: Adapter between external messaging platforms and the internal message bus
- Location: Per-channel directories (e.g., `src/telegram/bot/`, `src/discord/monitor/`, `src/slack/monitor/`)
- Contains: Inbound monitors (poll/webhook loops), outbound senders, authentication adapters, account management
- Depends on: auto-reply (for dispatching inbound), channels/plugins (for registration), routing
- Used by: gateway server's `ChannelManager`

**Routing Layer (`src/routing/`):**

- Purpose: Map inbound messages to the correct agent and session key
- Location: `src/routing/resolve-route.ts`, `src/routing/session-key.ts`, `src/routing/bindings.ts`
- Contains: `resolveAgentRoute()` (tiered binding matching), session key builders, account ID normalization
- Depends on: config (for bindings), agents (for agent IDs)
- Used by: auto-reply dispatch, channel monitors

**Auto-Reply Layer (`src/auto-reply/`):**

- Purpose: Orchestrate the full inbound → LLM → outbound reply flow
- Location: `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/dispatch.ts`
- Contains: Message parsing, directive extraction, model selection, command authorization, reply dispatching, typing indicators, sandbox media staging
- Depends on: agents (runner), channels/plugins (outbound), config, routing
- Used by: all channel monitors, gateway chat endpoint

**Agents Layer (`src/agents/`):**

- Purpose: Run LLM inference sessions via multiple backends
- Location: `src/agents/pi-embedded-runner/`, `src/agents/cli-runner.ts`, `src/agents/sdk-runner/`
- Contains: Embedded pi-agent runner (primary), CLI subprocess runner (claude-cli fallback), SDK runner (MCP/ACP), tool definitions, subagent orchestration, context compaction, auth profile rotation, model catalog, workspace/session management
- Depends on: config, infra (process, security), plugins (hooks)
- Used by: auto-reply layer, gateway chat

**Plugin System (`src/plugins/`):**

- Purpose: Extensibility points for hooks, custom tools, and channel providers
- Location: `src/plugins/loader.ts`, `src/plugins/registry.ts`, `src/plugins/services.ts`
- Contains: Plugin discovery, loading, lifecycle management, hook runner, HTTP endpoints for plugins
- Depends on: config, infra
- Used by: gateway server (loaded at startup), agents (hooks)

**Infrastructure Layer (`src/infra/`):**

- Purpose: Platform utilities — process management, networking, security, filesystem, update checks
- Location: `src/infra/`
- Contains: Port management, process exec wrappers, exec approval/security policy, credential monitor, Bonjour/Tailscale discovery, heartbeat runner, observability DB, update checking, memory monitor, TLS, SSH
- Depends on: config (for policy), logging
- Used by: all upper layers

**Config Layer (`src/config/`):**

- Purpose: Load, validate, migrate, and cache OpenClaw configuration
- Location: `src/config/config.ts`, `src/config/schema.ts`, `src/config/zod-schema.ts`
- Contains: Zod schema definitions, JSON5 IO, legacy migrations, runtime overrides, session store management, path resolution
- Depends on: nothing above itself
- Used by: every other layer

**Logging Layer (`src/logging/`):**

- Purpose: Structured file logging + console capture with subsystem filtering
- Location: `src/logging/logger.ts`, `src/logging/subsystem.ts`, `src/logging/console.ts`
- Contains: `createSubsystemLogger()` factory, pino-like logger, console capture, redaction
- Depends on: nothing
- Used by: every other layer

## Data Flow

**Inbound Message Flow:**

1. Channel monitor (e.g., `src/telegram/bot/delivery.ts`) receives message from external platform
2. Monitor constructs `MsgContext` with channel, accountId, peer (sender), attachments, text
3. `dispatchInboundMessage()` in `src/auto-reply/dispatch.ts` finalizes context and creates dispatcher
4. `getReplyFromConfig()` in `src/auto-reply/reply/get-reply.ts` orchestrates the full reply:
   - Resolves agent route via `resolveAgentRoute()` in `src/routing/resolve-route.ts`
   - Applies model/directive overrides, link/media understanding
   - Runs LLM inference via `runEmbeddedPiAgent()` in `src/agents/pi-embedded-runner/run.ts`
5. Agent streams token blocks; each block is sent to outbound adapter (channel-specific sender)
6. Final response is delivered to channel; typing indicator cleared

**Gateway WebSocket Protocol Flow:**

1. Client (macOS app, iOS app, web UI, node client) connects via WebSocket to gateway
2. Client sends `connect` frame with auth token and role
3. Gateway validates auth, responds with `hello.ok`
4. Client sends method calls (e.g., `chat.send`, `sessions.list`, `models.list`)
5. Gateway routes to handler in `src/gateway/server-methods/` and returns response frames
6. Agent events (token streams, tool calls) are broadcast to subscribed clients via `server-broadcast.ts`

**Hooks (Webhook Inbound) Flow:**

1. External system POSTs to `<gateway>/hooks/<path>` with token auth
2. `src/gateway/hooks.ts` validates token, maps to channel/agent via hook mappings
3. Constructs synthetic `MsgContext` and runs through standard reply flow

**State Management:**

- Config: loaded from `~/.openclaw/openclaw.json` (or profile variant), cached in memory, hot-reloaded on file change
- Sessions: JSONL files in `~/.openclaw/agents/<agentId>/sessions/`, keyed by session key
- Auth profiles: `~/.openclaw/agents/<agentId>/auth-profiles.json` (rotated per-call with cooldown)
- Plugin registry: in-memory singleton initialized at gateway start
- Observability: `~/.openclaw/observability.sqlite`

## Key Abstractions

**ChannelPlugin:**

- Purpose: The adapter contract between a messaging platform and OpenClaw
- Examples: `src/telegram/`, `src/discord/`, `extensions/matrix/`, `extensions/msteams/`
- Pattern: Object implementing adapters for messaging, auth, setup, status, directory, heartbeat, outbound. Registered via plugin loader at startup.

**MsgContext / FinalizedMsgContext:**

- Purpose: Normalized inbound message representation passed through auto-reply
- Examples: Used in `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/dispatch.ts`
- Pattern: Plain object with channel, accountId, peer, text, attachments, session metadata

**ResolvedAgentRoute:**

- Purpose: Result of routing an inbound message to an agent and session key
- Examples: `src/routing/resolve-route.ts` returns `ResolvedAgentRoute`
- Pattern: `{ agentId, channel, accountId, sessionKey, mainSessionKey, matchedBy }`

**GatewayServer:**

- Purpose: The running gateway process handle with `close()` method
- Examples: `src/gateway/server.impl.ts` → `startGatewayServer()`
- Pattern: Async factory that wires up all subsystems and returns close handle

**PluginHookRunner:**

- Purpose: Fire lifecycle hooks (before-agent-start, after-tool-call, etc.) to loaded plugins
- Examples: `src/plugins/hook-runner-global.ts`
- Pattern: Global singleton, called at integration points throughout agent execution

**SessionKey:**

- Purpose: Deterministic string key that scopes LLM conversation history per channel/peer/agent
- Examples: `src/routing/session-key.ts` builds keys like `main:agentId:channel:accountId:peer`
- Pattern: Lowercase colon-delimited string; controls session isolation and continuity

## Entry Points

**CLI Entrypoint (`src/index.ts`):**

- Location: `src/index.ts`
- Triggers: `node openclaw.mjs` / `pnpm openclaw`
- Responsibilities: Load dotenv, normalize env, capture console logs, assert runtime, build Commander program, parse argv

**Gateway Server (`src/gateway/server.impl.ts`):**

- Location: `src/gateway/server.impl.ts` → `startGatewayServer()`
- Triggers: `openclaw gateway` CLI command
- Responsibilities: Load config, initialize plugin registry, start channel monitors, bind HTTP/WS server, register method handlers, start heartbeat and cron

**Node Host (`src/node-host/runner.ts`):**

- Location: `src/node-host/runner.ts`
- Triggers: `openclaw node` CLI command; remote gateway invokes via WS
- Responsibilities: Connect to gateway as a "node", receive tool-invoke requests, execute locally, return results

**TUI (`src/tui/tui.ts`):**

- Location: `src/tui/tui.ts`
- Triggers: `openclaw tui` command
- Responsibilities: Terminal UI chat client connecting to local gateway over WebSocket

## Error Handling

**Strategy:** Errors propagate as thrown exceptions within async flows; channel monitors catch and log at boundaries; gateway method handlers return typed error frames to clients.

**Patterns:**

- `formatUncaughtError()` in `src/infra/errors.ts` — sanitizes and redacts stack traces for display
- `FailoverError` in `src/agents/failover-error.ts` — signals model auth failure → rotate auth profile and retry
- Gateway protocol uses `errorShape(ErrorCodes.X, msg)` for typed error responses
- Channel monitors use exponential backoff (`src/infra/backoff.ts`) on restart after failure
- `installUnhandledRejectionHandler()` in `src/infra/unhandled-rejections.ts` — global catch at process level

## Cross-Cutting Concerns

**Logging:** `createSubsystemLogger(name)` from `src/logging/subsystem.ts` — every subsystem creates a named logger; console capture routes all `console.*` to structured logs while preserving stdout/stderr behavior.

**Validation:** Config validated by Zod at load time (`src/config/validation.ts`); gateway method payloads validated by AJV using JSON Schema (`src/gateway/protocol/index.ts`).

**Authentication:**

- Gateway HTTP/WS: token-based (`gateway.token` config) + optional device auth (ECDSA key pair in `src/infra/device-identity.ts`)
- LLM providers: API keys in `auth-profiles.json`, rotated with cooldown on failure (`src/agents/auth-profiles.ts`)
- Hooks: shared secret token in `hooks.token` config
- Channel-specific: per-channel auth adapters (QR pairing, OAuth, API keys)

**Security:** Exec approval system (`src/infra/exec-approvals.ts`) gates shell command execution; safe-bin policy (`src/infra/exec-safe-bin-policy.ts`) whitelists commands; sandbox (`src/agents/sandbox.ts`) isolates agent file access; path guards (`src/infra/path-safety.ts`) prevent traversal.

---

_Architecture analysis: 2026-03-01_
