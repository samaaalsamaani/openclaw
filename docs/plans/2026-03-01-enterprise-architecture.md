# Enterprise Architecture — OpenClaw

**System:** OpenClaw — Multi-channel AI gateway bridging messaging platforms to LLM backends
**Analysis Date:** 2026-03-01
**Source:** Codebase analysis via parallel mapper agents (`.planning/codebase/`)

---

## Table of Contents

1. [View 1 — C4 Model](#view-1--c4-model)
   - [L1: System Context](#l1-system-context)
   - [L2: Containers](#l2-containers)
   - [L3: Components (Gateway)](#l3-components-gateway)
2. [View 2 — Layer Stack](#view-2--layer-stack)
   - [Layer Diagram](#layer-diagram)
   - [Layer Reference](#layer-reference)
   - [Inbound Message Data Flow](#inbound-message-data-flow)
3. [View 3 — Domain Capability Map](#view-3--domain-capability-map)
   - [Capability Domains](#capability-domains)
   - [Integration Surface](#integration-surface)
4. [Cross-Cutting Views](#cross-cutting-views)
   - [Storage Map](#storage-map)
   - [Security Model](#security-model)
   - [Deployment Topology](#deployment-topology)
   - [Known Concerns Summary](#known-concerns-summary)

---

## View 1 — C4 Model

The C4 model zooms into the system across four levels. Level 1 shows OpenClaw in its world. Level 2 breaks down the major deployable containers. Level 3 shows the internal components of the core Gateway container.

---

### L1: System Context

> Who uses OpenClaw, and what external systems does it talk to?

```mermaid
C4Context
  title OpenClaw — System Context

  Person(user, "User", "Sends and receives messages via any supported messaging platform")
  Person(admin, "Admin / Developer", "Manages config, monitors health, deploys gateway")

  System(openclaw, "OpenClaw", "Always-on AI gateway: routes messages from any channel to LLM backends and returns replies")

  System_Ext(telegram, "Telegram", "Messaging platform")
  System_Ext(discord, "Discord", "Messaging platform")
  System_Ext(slack, "Slack", "Messaging platform")
  System_Ext(whatsapp, "WhatsApp", "Messaging platform")
  System_Ext(signal, "Signal", "Messaging platform")
  System_Ext(imessage, "iMessage", "macOS/iOS messaging")
  System_Ext(more_channels, "16+ More Channels", "Matrix, MS Teams, LINE, Feishu, IRC, Twitch, Nostr, Zalo, etc.")

  System_Ext(anthropic, "Anthropic / Claude", "Primary LLM provider")
  System_Ext(openai, "OpenAI / Codex", "LLM provider")
  System_Ext(gemini, "Google Gemini", "LLM provider")
  System_Ext(more_llms, "15+ More Providers", "Bedrock, Ollama, OpenRouter, Copilot, MiniMax, Moonshot, etc.")

  System_Ext(apns, "Apple APNS", "Push notifications for iOS/macOS")
  System_Ext(cloudflare, "Cloudflare AI Gateway", "Optional proxy for Anthropic models")

  Rel(user, telegram, "Sends message")
  Rel(user, discord, "Sends message")
  Rel(user, slack, "Sends message")
  Rel(user, whatsapp, "Sends message")
  Rel(telegram, openclaw, "Webhook / polling")
  Rel(discord, openclaw, "Bot events")
  Rel(slack, openclaw, "Events API")
  Rel(whatsapp, openclaw, "WS protocol (Baileys)")
  Rel(signal, openclaw, "Linked device")
  Rel(imessage, openclaw, "macOS integration")
  Rel(more_channels, openclaw, "Various protocols")
  Rel(openclaw, anthropic, "API calls")
  Rel(openclaw, openai, "API calls")
  Rel(openclaw, gemini, "API calls")
  Rel(openclaw, more_llms, "API calls")
  Rel(openclaw, apns, "Push notifications")
  Rel(openclaw, cloudflare, "Optional proxy")
  Rel(admin, openclaw, "WebSocket / HTTP control API")
```

---

### L2: Containers

> What are the major deployable/runnable units?

```mermaid
C4Container
  title OpenClaw — Containers

  Person(user, "User", "Any messaging platform")
  Person(admin, "Admin / Developer")

  Container_Boundary(openclaw, "OpenClaw System") {
    Container(gateway, "Gateway Process", "Node.js 22 / TypeScript", "Core always-on service. WebSocket + HTTP server. Manages channels, agents, routing, plugins. Port 18789.")
    Container(cli, "CLI", "Node.js 22 / TypeScript", "openclaw CLI binary. Commands: gateway, agent, doctor, auth, models, sessions, onboard.")
    Container(macos_app, "macOS Menubar App", "Swift / SwiftUI", "Native menubar app. Connects to gateway via WebSocket. @Observable framework.")
    Container(ios_app, "iOS App", "Swift / SwiftUI", "Native iOS app. Connects to gateway via WebSocket.")
    Container(android_app, "Android App", "Kotlin", "Android app. Connects to gateway.")
    Container(web_ui, "Web Control UI", "Lit / TypeScript", "Browser-based control panel. Served by gateway at port 18789.")
    Container(extensions, "Extensions", "Node.js / TypeScript (npm workspaces)", "20+ optional channel plugins. Each is an npm workspace package: matrix, msteams, feishu, line, irc, twitch, etc.")
    Container(node_host, "Node Host", "Node.js 22 / TypeScript", "Satellite process. Executes tools locally for a remote gateway.")
  }

  ContainerDb(obs_db, "Observability DB", "SQLite", "~/.openclaw/observability.sqlite — events, metrics")
  ContainerDb(memory_db, "Memory DB", "SQLite + sqlite-vec", "~/.openclaw/memory/main.sqlite — vector search, embeddings")
  ContainerDb(sessions, "Session Files", "JSONL", "~/.openclaw/agents/<id>/sessions/*.jsonl — conversation history")
  ContainerDb(auth_profiles, "Auth Profiles", "JSON", "~/.openclaw/agents/<id>/auth-profiles.json — API keys, OAuth tokens")
  ContainerDb(config, "Config File", "YAML / JSON5", "~/.openclaw/config.yml — gateway + channel + agent configuration")

  Rel(user, gateway, "Messages via channel platform APIs")
  Rel(admin, cli, "CLI commands")
  Rel(admin, web_ui, "Browser control panel")
  Rel(macos_app, gateway, "WebSocket, port 18789")
  Rel(ios_app, gateway, "WebSocket, port 18789")
  Rel(android_app, gateway, "WebSocket, port 18789")
  Rel(web_ui, gateway, "HTTP / WebSocket")
  Rel(cli, gateway, "Spawns or connects to gateway process")
  Rel(extensions, gateway, "Registered as channel plugins at startup")
  Rel(node_host, gateway, "WebSocket, receives tool-invoke requests")
  Rel(gateway, obs_db, "Writes events and metrics")
  Rel(gateway, memory_db, "Vector search, embedding storage")
  Rel(gateway, sessions, "Reads/writes conversation history")
  Rel(gateway, auth_profiles, "Reads API keys, rotates on failure")
  Rel(gateway, config, "Loads on start, hot-reloads on change")
```

---

### L3: Components (Gateway)

> What are the internal components of the Gateway process?

```mermaid
C4Component
  title OpenClaw Gateway — Internal Components

  Container_Boundary(gateway, "Gateway Process (Node.js 22)") {
    Component(ws_server, "WebSocket Server", "ws + Express 5", "Accepts client connections (apps, TUI, nodes). Validates auth token. Routes method calls.")
    Component(http_server, "HTTP Server", "Express 5", "Serves Web UI, Slack events, Hooks endpoint, OpenAI-compatible API, Health check.")
    Component(channel_mgr, "Channel Manager", "TypeScript", "Starts, stops, and restarts channel monitors. Manages plugin lifecycle.")
    Component(auto_reply, "Auto-Reply Orchestrator", "TypeScript", "Core reply pipeline: parse → directive extract → model select → run agent → dispatch reply.")
    Component(routing, "Routing Engine", "TypeScript", "resolveAgentRoute() — maps channel + account + peer to agentId + sessionKey.")
    Component(agent_runner, "Agent Runner", "pi-embedded-runner (primary), cli-runner, sdk-runner", "Runs LLM inference. Manages tool execution, compaction, auth rotation, streaming.")
    Component(plugin_sys, "Plugin System", "TypeScript", "Loads and manages plugins. Fires lifecycle hooks. Exposes plugin HTTP endpoints.")
    Component(config_mgr, "Config Manager", "Zod + JSON5 + chokidar", "Loads, validates, migrates, and hot-reloads openclaw.yml.")
    Component(mcp_servers, "MCP Servers", "claude-agent-sdk", "In-process MCP: gateway-kb (knowledge base), gateway-system (OS info).")
    Component(cron, "Cron Scheduler", "croner", "Runs heartbeat, maintenance, and scheduled tasks.")
    Component(infra, "Infra Services", "TypeScript", "Ports, exec approvals, SSRF guard, Bonjour, Tailscale, SSH tunnel, APNS, crash logger.")
    Component(logging, "Logging", "tslog", "Structured subsystem logging with console capture and redaction.")
  }

  Rel(ws_server, channel_mgr, "Channel lifecycle calls")
  Rel(ws_server, auto_reply, "Incoming chat messages")
  Rel(ws_server, config_mgr, "Config reads")
  Rel(http_server, auto_reply, "Hooks endpoint → reply pipeline")
  Rel(channel_mgr, auto_reply, "Inbound messages from channel monitors")
  Rel(auto_reply, routing, "resolveAgentRoute()")
  Rel(auto_reply, agent_runner, "runEmbeddedPiAgent()")
  Rel(auto_reply, channel_mgr, "Outbound replies via channel senders")
  Rel(agent_runner, plugin_sys, "Hook calls (before-start, after-tool, etc.)")
  Rel(agent_runner, mcp_servers, "MCP tool calls")
  Rel(agent_runner, infra, "Exec approvals, sandbox policy")
  Rel(plugin_sys, config_mgr, "Plugin config reads")
  Rel(cron, infra, "Heartbeat, maintenance")
  Rel(infra, logging, "Structured log output")
```

---

## View 2 — Layer Stack

The code is organized as a strict dependency hierarchy. Upper layers depend on lower layers; lower layers never import from upper layers.

---

### Layer Diagram

```mermaid
graph TD
  subgraph "User-Facing"
    CLI["CLI Layer\nsrc/cli/\nCommander.js program builder"]
    CMD["Commands Layer\nsrc/commands/\n~200+ subcommands"]
  end

  subgraph "Runtime Core"
    GW["Gateway Server\nsrc/gateway/\nWebSocket + HTTP + Channel lifecycle"]
    CH["Channel Plugin Layer\nsrc/telegram/ discord/ slack/ signal/\nwhatsapp/ imessage/ web/ + extensions/*"]
    RT["Routing Layer\nsrc/routing/\nresolveAgentRoute() → SessionKey"]
    AR["Auto-Reply Layer\nsrc/auto-reply/\ngetReplyFromConfig() → dispatch"]
    AG["Agents Layer\nsrc/agents/\npi-embedded-runner | cli-runner | sdk-runner"]
    PL["Plugin System\nsrc/plugins/\nLoader, Registry, HookRunner"]
  end

  subgraph "Foundation"
    IN["Infrastructure Layer\nsrc/infra/\nPorts, exec, TLS, Bonjour, SSRF guard, APNS"]
    CF["Config Layer\nsrc/config/\nZod schema, migrations, hot-reload"]
    LG["Logging Layer\nsrc/logging/\ncreateSubsystemLogger()"]
  end

  CLI --> CMD
  CLI --> GW
  CMD --> GW
  GW --> CH
  GW --> AR
  GW --> PL
  CH --> AR
  AR --> RT
  AR --> AG
  AR --> CH
  AG --> PL
  AG --> IN
  PL --> CF
  CH --> CF
  RT --> CF
  AR --> CF
  GW --> CF
  GW --> IN
  IN --> CF
  IN --> LG
  AG --> LG
  AR --> LG
  GW --> LG
  CF --> LG
```

---

### Layer Reference

| Layer           | Directory                                                           | Purpose                                                     | Key Files                                                                          | Key Abstractions                                    |
| --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| CLI             | `src/cli/`                                                          | Parse argv, dispatch to gateway or local commands           | `src/cli/program/build-program.ts`                                                 | Commander.js program                                |
| Commands        | `src/commands/`                                                     | 200+ CLI subcommand implementations                         | `src/commands/agent/`, `src/commands/doctor-config-flow.ts`                        | Command handlers                                    |
| Gateway Server  | `src/gateway/`                                                      | Core always-on process; WebSocket + HTTP; channel lifecycle | `src/gateway/server.impl.ts`, `src/gateway/server-methods/`                        | `GatewayServer`, `startGatewayServer()`             |
| Channel Plugins | `src/telegram/`, `src/discord/`, `src/slack/`, etc. + `extensions/` | Adapters between messaging platforms and internal bus       | `src/telegram/bot/delivery.ts`, `src/discord/monitor/`                             | `ChannelPlugin`                                     |
| Routing         | `src/routing/`                                                      | Map channel + account + peer → agent + session key          | `src/routing/resolve-route.ts`, `src/routing/session-key.ts`                       | `resolveAgentRoute()`, `SessionKey`                 |
| Auto-Reply      | `src/auto-reply/`                                                   | Full inbound → LLM → outbound orchestration                 | `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/dispatch.ts`                  | `getReplyFromConfig()`, `MsgContext`                |
| Agents          | `src/agents/`                                                       | LLM inference, tool execution, session management           | `src/agents/pi-embedded-runner/run.ts`, `src/agents/tools/`                        | `runEmbeddedPiAgent()`, `ResolvedAgentRoute`        |
| Plugin System   | `src/plugins/`                                                      | Plugin loading, registry, hook execution                    | `src/plugins/loader.ts`, `src/plugins/hook-runner-global.ts`                       | `PluginHookRunner`                                  |
| Infrastructure  | `src/infra/`                                                        | Platform utilities — no business logic                      | `src/infra/exec-approvals.ts`, `src/infra/home-dir.ts`, `src/infra/fetch-guard.ts` | `resolveEffectiveHomeDir()`, `fetchWithSsrFGuard()` |
| Config          | `src/config/`                                                       | Load, validate, migrate, cache config                       | `src/config/config.ts`, `src/config/zod-schema.ts`                                 | `OpenClawConfig`, `loadConfig()`                    |
| Logging         | `src/logging/`                                                      | Structured subsystem logging                                | `src/logging/subsystem.ts`                                                         | `createSubsystemLogger()`                           |

---

### Inbound Message Data Flow

```mermaid
sequenceDiagram
  participant Platform as Messaging Platform<br/>(Telegram/Discord/Slack/etc.)
  participant Monitor as Channel Monitor<br/>(src/telegram/bot/delivery.ts)
  participant Dispatch as Auto-Reply Dispatch<br/>(src/auto-reply/dispatch.ts)
  participant Reply as Reply Orchestrator<br/>(src/auto-reply/reply/get-reply.ts)
  participant Route as Routing Engine<br/>(src/routing/resolve-route.ts)
  participant Agent as Agent Runner<br/>(src/agents/pi-embedded-runner/run.ts)
  participant LLM as LLM Provider<br/>(Anthropic/OpenAI/Gemini/etc.)
  participant Sender as Channel Sender<br/>(outbound adapter)

  Platform->>Monitor: Incoming message (webhook/poll)
  Monitor->>Dispatch: dispatchInboundMessage(MsgContext)
  Dispatch->>Reply: getReplyFromConfig(finalizedCtx)
  Reply->>Route: resolveAgentRoute(channel, accountId, peer)
  Route-->>Reply: ResolvedAgentRoute {agentId, sessionKey}
  Reply->>Reply: Extract directives, select model, check auth
  Reply->>Agent: runEmbeddedPiAgent(agentId, sessionKey, message)
  Agent->>LLM: API request (stream)
  LLM-->>Agent: Token stream
  Agent-->>Reply: Token blocks (streamed)
  Reply->>Sender: Send token block to channel
  Sender->>Platform: Deliver message chunk
  Agent-->>Reply: Final response complete
  Reply->>Sender: Clear typing indicator
```

---

## View 3 — Domain Capability Map

Organizes the system by _what it does_ rather than how the code is structured.

---

### Capability Domains

```mermaid
graph LR
  subgraph MSG["Messaging Domain"]
    M1["Built-in Channels\nTelegram · Discord · Slack\nWhatsApp · Signal · iMessage\nWeb · LINE"]
    M2["Extension Channels\nMatrix · MS Teams · Feishu\nGoogle Chat · IRC · Twitch\nNostr · Zalo · Mattermost\nNextcloud · Synology · Tlon"]
    M3["Channel Plugin Registry\nsrc/channels/plugins/"]
    M4["Routing Engine\nsrc/routing/"]
  end

  subgraph AI["AI/LLM Domain"]
    A1["Agent Runners\npi-embedded (primary)\ncli-runner · sdk-runner"]
    A2["LLM Providers\n18+ providers"]
    A3["Auth Profiles\nAPI key rotation\nOAuth PKCE"]
    A4["Tool Definitions\nbash · web-fetch · web-search\nmessage · sessions · discord · slack"]
    A5["Model Catalog\nmodel routing\nprovider discovery"]
  end

  subgraph MEM["Memory Domain"]
    ME1["Vector Search\nsqlite-vec extension"]
    ME2["Embedding Providers\nGemini · OpenAI · Mistral\nVoyage · node-llama-cpp (local)"]
    ME3["QMD Manager\nSession file scanning\nFTS5 + BM25 search"]
    ME4["Memory DB\n~/.openclaw/memory/main.sqlite"]
  end

  subgraph SEC["Security Domain"]
    S1["Exec Approval System\nsrc/infra/exec-approvals.ts"]
    S2["Safe-Bin Policy\nsrc/infra/exec-safe-bin-policy.ts"]
    S3["SSRF Guard\nsrc/infra/net/fetch-guard.ts"]
    S4["Sandbox\nsrc/agents/sandbox.ts"]
    S5["Path Guards\nsrc/infra/path-safety.ts"]
    S6["Gateway Auth\nToken · Rate limit · Origin check\nRole policy · Device pairing"]
  end

  subgraph CFG["Config & State Domain"]
    C1["Config File\n~/.openclaw/config.yml\nZod validated · Hot-reloaded"]
    C2["Session Store\nJSONL files per agentId"]
    C3["Auth Profiles\nJSON per agentId"]
    C4["Observability DB\nobservability.sqlite"]
    C5["Legacy Migrations\nconfig/legacy.migrations.*"]
  end

  subgraph OPS["Deployment & Ops Domain"]
    O1["Gateway Process\nNode.js 22 · Port 18789/18790"]
    O2["Docker\nnode:22-bookworm\nFly.io · Render"]
    O3["macOS App\nSwift/SwiftUI · Menubar"]
    O4["iOS App\nSwift/SwiftUI"]
    O5["Android App\nKotlin"]
    O6["CI/CD\nGitHub Actions\nLinux · macOS · Windows"]
    O7["Plugin System\nnpm packages loaded at runtime"]
  end

  MSG --> AI
  AI --> MEM
  AI --> SEC
  MSG --> CFG
  AI --> CFG
  MEM --> CFG
  OPS --> CFG
```

---

### Integration Surface

#### AI Model Providers

| Provider              | Type             | Auth                          | Notes                                          |
| --------------------- | ---------------- | ----------------------------- | ---------------------------------------------- |
| Anthropic (Claude)    | Primary LLM      | API key / OAuth / web session | opus-4-6, sonnet-4-6, haiku-4-5                |
| OpenAI / Codex        | LLM + Embeddings | API key                       | Codex uses Responses API, not Chat Completions |
| Google Gemini         | LLM + Embeddings | API key / OAuth JSON          | Used for fast/cheap tier                       |
| AWS Bedrock           | LLM              | AWS SDK env vars              | `amazon-bedrock` provider ID                   |
| GitHub Copilot        | LLM              | VS Code token auto-detected   | Injected when token found                      |
| Cloudflare AI Gateway | LLM proxy        | accountId + gatewayId         | Proxies Anthropic models                       |
| OpenRouter            | LLM aggregator   | API key                       | `auto` default model                           |
| Ollama                | Local LLM        | None (localhost:11434)        | Model discovery via local API                  |
| vLLM                  | Local LLM        | None (localhost:8000)         | OpenAI-compatible                              |
| HuggingFace           | LLM              | API key                       | router.huggingface.co                          |
| Together AI           | LLM              | API key                       | api.together.xyz                               |
| Venice AI             | LLM              | API key                       | api.venice.ai                                  |
| NVIDIA                | LLM              | API key                       | integrate.api.nvidia.com                       |
| MiniMax               | LLM              | OAuth PKCE                    | api.minimax.io/anthropic                       |
| Moonshot / Kimi       | LLM              | API key                       | kimi-k2.5, k2p5 coding                         |
| Qwen / Alibaba        | LLM              | OAuth                         | portal.qwen.ai                                 |
| BytePlus / Doubao     | LLM              | API key                       | VolcEngine base URLs                           |
| Qianfan (Baidu)       | LLM              | API key                       | deepseek-v3.2 default                          |
| Chutes                | LLM              | OAuth PKCE                    | api.chutes.ai                                  |
| Xiaomi (Mimo)         | LLM              | API key                       | api.xiaomimimo.com/anthropic                   |
| Mistral               | Embeddings only  | API key                       | `src/memory/embeddings-mistral.ts`             |
| Voyage AI             | Embeddings only  | API key                       | `src/memory/embeddings-voyage.ts`              |
| node-llama-cpp        | Local embeddings | None                          | GGUF model, peer dep                           |

#### Messaging Channels

| Channel         | Type      | SDK / Protocol                   | Auth                       |
| --------------- | --------- | -------------------------------- | -------------------------- |
| Telegram        | Built-in  | grammy 1.40+                     | Bot token                  |
| Discord         | Built-in  | @buape/carbon (beta)             | Bot token                  |
| Slack           | Built-in  | @slack/bolt 4.6                  | Bot token + signing secret |
| WhatsApp        | Built-in  | @whiskeysockets/baileys 7.0-rc.9 | QR code scan               |
| Signal          | Built-in  | Custom                           | Linked device pairing      |
| iMessage        | Built-in  | macOS system                     | macOS only                 |
| Web Chat        | Built-in  | Custom WS                        | Gateway token              |
| LINE            | Built-in  | @line/bot-sdk                    | Channel token              |
| Matrix          | Extension | @vector-im/matrix-bot-sdk        | Homeserver credentials     |
| MS Teams        | Extension | @microsoft/agents-hosting        | Bot Framework              |
| Feishu / Lark   | Extension | @larksuiteoapi/node-sdk          | App credentials            |
| Google Chat     | Extension | Custom                           | Service account            |
| IRC             | Extension | Custom                           | Server credentials         |
| Twitch          | Extension | Custom                           | OAuth                      |
| Mattermost      | Extension | Custom                           | Bot token                  |
| Nextcloud Talk  | Extension | Custom                           | Credentials                |
| Synology Chat   | Extension | Custom                           | Token                      |
| Tlon / Urbit    | Extension | Custom                           | Ship credentials           |
| Nostr           | Extension | Custom                           | Key pair                   |
| Zalo / Zalouser | Extension | Custom                           | Token                      |
| Voice Call      | Extension | Twilio                           | Twilio credentials         |

---

## Cross-Cutting Views

---

### Storage Map

```mermaid
graph TD
  subgraph Local["~/.openclaw/ (default state dir)"]
    CFG["config.yml\nMain config file\nZod-validated, hot-reloaded"]
    OBS["observability.sqlite\nEvents, metrics, health logs\nsrc/infra/observability-db.ts"]
    MEM["memory/main.sqlite\nVector search, embeddings\nFTS5 + sqlite-vec\nsrc/memory/"]
    CRED["credentials/\nRaw credential files"]
    subgraph Agents["agents/<agentId>/"]
      AUTH["auth-profiles.json\nAPI keys + OAuth tokens\nRotated with cooldown"]
      SESS["sessions/*.jsonl\nConversation history (JSONL)\nOne file per session key"]
      MOD["models.json\nAuto-generated model list"]
    end
  end

  subgraph Runtime["Runtime (in-memory)"]
    CACHE["Search cache\nMap — unbounded (concern)"]
    PREG["Plugin registry\nSingleton, loaded at startup"]
    CCFG["Config cache\nIn-memory, invalidated on file change"]
    QQUEUE["qmdEmbedQueueTail\nGlobal embed promise chain"]
  end
```

| Store         | Path                                         | Format              | Used for                               |
| ------------- | -------------------------------------------- | ------------------- | -------------------------------------- |
| Config        | `~/.openclaw/config.yml`                     | YAML                | All gateway + channel + agent config   |
| Observability | `~/.openclaw/observability.sqlite`           | SQLite (WAL)        | Events, metrics, health                |
| Memory        | `~/.openclaw/memory/main.sqlite`             | SQLite + sqlite-vec | Vector search, embeddings              |
| Auth profiles | `~/.openclaw/agents/<id>/auth-profiles.json` | JSON                | API keys, OAuth tokens, rotation state |
| Sessions      | `~/.openclaw/agents/<id>/sessions/*.jsonl`   | JSONL               | Conversation history per session key   |
| Credentials   | `~/.openclaw/credentials/`                   | Various             | Raw credential files                   |

---

### Security Model

```mermaid
graph TD
  subgraph External["External Boundary"]
    EXT["User / External System"]
  end

  subgraph Gateway["Gateway Auth Layer"]
    GWT["Gateway Token\nOPENCLAW_GATEWAY_TOKEN"]
    RL["Rate Limiting\nsrc/gateway/auth-rate-limit.ts"]
    OC["Origin Check\nsrc/gateway/origin-check.ts"]
    RP["Role Policy\nsrc/gateway/role-policy.ts"]
    DP["Device Pairing\nECDSA key pair"]
  end

  subgraph Channel["Channel Auth Layer"]
    CA["Per-channel auth\nBot tokens · QR · OAuth · Linked device"]
  end

  subgraph LLM["LLM Auth Layer"]
    AP["Auth Profiles\nAPI key / OAuth PKCE"]
    AR["Key Rotation\nCooldown on failure"]
  end

  subgraph Exec["Exec Security Layer"]
    EA["Exec Approval System\nsrc/infra/exec-approvals.ts"]
    SB["Safe-Bin Policy\nCommand whitelist"]
    SX["Sandbox\nFile access isolation"]
    PG["Path Guards\nTraversal prevention"]
  end

  subgraph Net["Network Security Layer"]
    SSRF["SSRF Guard\nsrc/infra/net/fetch-guard.ts"]
  end

  EXT --> GWT
  GWT --> RL
  RL --> OC
  OC --> RP
  RP --> DP
  EXT --> CA
  CA --> AP
  AP --> AR
  RP --> EA
  EA --> SB
  SB --> SX
  SX --> PG
  RP --> SSRF
```

| Layer           | Mechanism                                                    | Location                                                                           |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Gateway access  | Bearer token + rate limit + origin check + role policy       | `src/gateway/auth-rate-limit.ts`, `src/gateway/role-policy.ts`                     |
| Device identity | ECDSA key pair for device pairing                            | `src/infra/device-identity.ts`, `src/infra/device-pairing.ts`                      |
| Channel auth    | Per-channel (bot tokens, QR, OAuth, linked device)           | Per-channel `src/<channel>/`                                                       |
| LLM auth        | Auth profiles JSON, rotated with cooldown on failure         | `src/agents/auth-profiles/`, `src/infra/credential-monitor.ts`                     |
| Exec control    | Approval system + safe-bin whitelist + sandbox + path guards | `src/infra/exec-approvals.ts`, `src/agents/sandbox.ts`, `src/infra/path-safety.ts` |
| Network         | SSRF guard on outbound fetch                                 | `src/infra/net/fetch-guard.ts`                                                     |
| Hook auth       | Shared secret token in `hooks.token` config                  | `src/gateway/hooks.ts`                                                             |

---

### Deployment Topology

```mermaid
graph TD
  subgraph Cloud["Cloud / Server Deployment"]
    FLY["Fly.io\nshared-cpu-2x · 2GB RAM\nIAD region\nfly.toml"]
    RENDER["Render\nDocker web service\n1GB persistent disk at /data\nrender.yaml"]
    DOCKER["Docker Image\nnode:22-bookworm\nDockerfile"]
    FLY --> DOCKER
    RENDER --> DOCKER
  end

  subgraph Desktop["Desktop / Local Deployment"]
    MAC["macOS Menubar App\nSwift/SwiftUI\nGateway embedded\napps/macos/"]
    MACDAEMON["macOS Daemon\nlaunchd plist\nscripts/package-mac-app.sh"]
    LOCAL["Local Node.js\nopenclaw gateway\nPort 18789"]
    MAC --> MACDAEMON
    MAC --> LOCAL
  end

  subgraph Mobile["Mobile Apps"]
    IOS["iOS App\nSwift/SwiftUI\napps/ios/"]
    AND["Android App\nKotlin\napps/android/"]
  end

  subgraph Network["Network Access"]
    TAIL["Tailscale\nVPN tunnel\nsrc/infra/tailscale.ts"]
    SSH["SSH Tunnel\nPort forwarding\nsrc/infra/ssh-tunnel.ts"]
    MDNS["Bonjour/mDNS\nLocal network discovery\n@homebridge/ciao"]
  end

  IOS -->|WebSocket 18789| LOCAL
  AND -->|WebSocket 18789| LOCAL
  IOS -->|WebSocket| FLY
  AND -->|WebSocket| FLY
  LOCAL --> TAIL
  LOCAL --> SSH
  LOCAL --> MDNS
```

| Target               | How                          | Config                               |
| -------------------- | ---------------------------- | ------------------------------------ |
| Fly.io               | Docker, `flyctl deploy`      | `fly.toml` — shared-cpu-2x, 2GB, IAD |
| Render               | Docker web service           | `render.yaml` — 1GB persistent disk  |
| Docker (self-hosted) | `docker run`                 | `Dockerfile`, `Dockerfile.sandbox`   |
| Podman               | `setup-podman.sh`            | `openclaw.podman.env`                |
| macOS (menubar)      | `scripts/package-mac-app.sh` | Xcode / SwiftUI, launchd             |
| Local (dev)          | `pnpm openclaw gateway`      | `~/.openclaw/config.yml`             |

**Network access options:**

- **Bonjour/mDNS** — auto-discovery on local network (`@homebridge/ciao`)
- **Tailscale** — VPN tunnel for remote access
- **SSH tunnel** — port forwarding for remote access
- **HTTPS proxy** — outbound via `HTTPS_PROXY`

---

### Known Concerns Summary

Pulled from `.planning/codebase/CONCERNS.md` — prioritized by risk.

#### Critical (fix before scale)

| Concern                                                    | Location                                                                                                | Risk                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Direct `fetch()` bypasses SSRF guard                       | `src/infra/credential-monitor.ts`, `src/infra/health-check.ts`, `src/discord/send.outbound.ts`, 6+ more | SSRF attack via user-controlled URLs reaches internal services           |
| `better-sqlite3` in devDependencies but used in production | `src/infra/db-init.ts`, `src/infra/crash-logger.ts`, 5+ more                                            | Production crash if devDeps are pruned                                   |
| `process.env.HOME` used directly in 20+ sites              | `src/infra/alert-dispatcher.ts`, `src/agents/compound-orchestrator.ts`, 8+ more                         | Silently ignores `OPENCLAW_HOME`; falls back to `/tmp` on some platforms |

#### High (active tech debt)

| Concern                                           | Location                                                                                                     | Risk                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 28 extensions use `workspace:*` in `dependencies` | All extension `package.json` files                                                                           | Breaks external npm installation                  |
| Channel surfaces excluded from test coverage      | `src/discord/**`, `src/telegram/**`, `src/slack/**`, `src/signal/**`, `src/imessage/**`                      | Channel regressions caught only by manual testing |
| Gateway server/client excluded from coverage      | `src/gateway/server.ts`, `src/gateway/client.ts`, `src/gateway/protocol/`                                    | Core runtime not threshold-enforced               |
| Health check test stubs                           | `src/infra/status-dashboard.test.ts`, `src/infra/health-check.test.ts`, `src/infra/alert-dispatcher.test.ts` | Zero behavioral coverage for monitoring stack     |

#### Medium (maintenance burden)

| Concern                                  | Location                                                                               | Risk                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 30+ files exceed 500 LOC                 | `qmd-manager.ts` (1,900), `native-command.ts` (1,724), `doctor-config-flow.ts` (1,673) | Fragile, hard to modify safely                      |
| `let db: any` in 4 infra files           | `crash-logger.ts`, `db-init.ts`, `mcp-servers.ts`, `health-check.ts`                   | DB type errors not caught at compile time           |
| `CLAWDBOT_*` legacy env vars in 21 sites | `src/config/paths.ts`, `src/pairing/setup-code.ts`, 9+ more                            | Ongoing maintenance surface                         |
| Branch coverage threshold at 55%         | `vitest.config.ts`                                                                     | Conditional/error paths systematically under-tested |
| Unbounded `SEARCH_CACHE` Map             | `src/agents/tools/web-search.ts`                                                       | Memory exhaustion under high query load             |
| `qmdEmbedQueueTail` single global chain  | `src/memory/qmd-manager.ts`                                                            | Serialized embeds; latency spikes at scale          |

#### Dependencies at risk

| Package                   | Version                     | Risk                                                                   |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `@whiskeysockets/baileys` | `7.0.0-rc.9`                | Pre-release RC, WhatsApp protocol can change without notice            |
| `@buape/carbon`           | `0.0.0-beta-20260216184201` | Zero-semver beta — CLAUDE.md: never update                             |
| `request`                 | Cypress fork                | Deprecated (2020), CVE-patched community fork                          |
| `@mariozechner/pi-*`      | `0.54.1`                    | Third-party agent SDK — breaking change = transcript continuity broken |

---

_Enterprise Architecture document — OpenClaw — 2026-03-01_
_Generated from codebase analysis in `.planning/codebase/`_
