# External Integrations

**Analysis Date:** 2026-03-01

## AI Model Providers

OpenClaw supports a large number of LLM providers via a unified provider/model routing system. All provider configs live in `src/agents/models-config.providers.ts` and `src/config/defaults.ts`.

**Anthropic (Primary):**

- Claude models (opus-4-6, sonnet-4-6, haiku-4-5) via Anthropic Messages API
- SDK: `@anthropic-ai/claude-agent-sdk` for in-process SDK runner (`src/agents/sdk-runner.ts`)
- Auth modes: API key (`ANTHROPIC_API_KEY`), OAuth token, or web session cookies
- Session key env vars: `CLAUDE_AI_SESSION_KEY`, `CLAUDE_WEB_SESSION_KEY`, `CLAUDE_WEB_COOKIE`
- Usage fetch: `src/infra/provider-usage.fetch.claude.ts`

**AWS Bedrock:**

- SDK: `@aws-sdk/client-bedrock` for model discovery (`src/agents/bedrock-discovery.ts`)
- Auth: AWS SDK env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
- Provider ID: `amazon-bedrock`

**Google Gemini:**

- SDK: `@google/generative-ai` ^0.24.1
- Auth: API key or OAuth JSON format (`src/infra/gemini-auth.ts`)
- Auth env var: `GEMINI_API_KEY` / OAuth JSON format with `{"token": "...", "projectId": "..."}`
- Usage fetch: `src/infra/provider-usage.fetch.gemini.ts`
- Embedding: `src/memory/embeddings-gemini.ts`, `src/memory/batch-gemini.ts`

**OpenAI / Codex:**

- OpenAI-compatible endpoint (also used for many other providers)
- Codex uses Responses API (not Chat Completions)
- Auth: `OPENAI_API_KEY`
- Usage fetch: `src/infra/provider-usage.fetch.codex.ts`
- Embedding: `src/memory/embeddings-openai.ts`, `src/memory/batch-openai.ts`

**GitHub Copilot:**

- Token exchange from VS Code extension or env (`src/providers/github-copilot-auth.ts`, `src/providers/github-copilot-token.ts`)
- Auto-injected into provider list when token detected
- Usage fetch: `src/infra/provider-usage.fetch.copilot.ts`

**Cloudflare AI Gateway:**

- Proxy gateway for Anthropic models (`src/agents/cloudflare-ai-gateway.ts`)
- Base URL: `https://gateway.ai.cloudflare.com/v1/<accountId>/<gatewayId>/anthropic`
- Config: requires `accountId` + `gatewayId` in provider metadata

**OpenRouter:**

- Base URL: `https://openrouter.ai/api/v1`
- Auth: API key via auth-profiles
- Default model: `auto`

**MiniMax:**

- Base URL: `https://api.minimax.io/anthropic`
- Auth: OAuth PKCE flow (`extensions/minimax-portal-auth/`)
- Usage fetch: `src/infra/provider-usage.fetch.minimax.ts`
- VLM: `src/agents/minimax-vlm.ts`

**Moonshot / Kimi:**

- Base URLs: `https://api.moonshot.ai/v1`, `https://api.kimi.com/coding/`
- Auth: API key via auth-profiles
- Default models: `kimi-k2.5`, `k2p5` (coding)

**Qwen / Alibaba:**

- Base URL: `https://portal.qwen.ai/v1`
- Auth: OAuth flow via `extensions/qwen-portal-auth/`
- Z.AI (VolcEngine): `src/agents/volc-models.shared.ts`, usage via `src/infra/provider-usage.fetch.zai.ts`

**BytePlus / Doubao (VolcEngine):**

- Models: `src/agents/byteplus-models.ts`, `src/agents/doubao-models.ts`
- Distinct base URLs for text and coding models

**Chutes:**

- OAuth PKCE: `src/agents/chutes-oauth.ts`
- Issuer: `https://api.chutes.ai`

**Ollama (Local):**

- Base URL: `http://localhost:11434` (configurable)
- Model discovery via local API (`src/agents/models-config.providers.ts`)

**vLLM (Local):**

- Base URL: `http://127.0.0.1:8000/v1` (configurable)

**HuggingFace:**

- Router: `https://router.huggingface.co/v1`
- Discovery: `src/agents/huggingface-models.ts`

**Together AI:**

- Base URL: `https://api.together.xyz/v1`
- Models: `src/agents/together-models.ts`

**Venice AI:**

- Base URL: `https://api.venice.ai/api/v1`
- Discovery: `src/agents/venice-models.ts`

**NVIDIA:**

- Base URL: `https://integrate.api.nvidia.com/v1`

**Qianfan (Baidu):**

- Base URL: `https://qianfan.baidubce.com/v2`
- Default model: `deepseek-v3.2`

**Xiaomi (Mimo):**

- Base URL: `https://api.xiaomimimo.com/anthropic`

**Kilocode:**

- Base URL: configured in `src/providers/kilocode-shared.ts`

**Mistral (Embeddings only):**

- `src/memory/embeddings-mistral.ts`

**Voyage AI (Embeddings only):**

- `src/memory/embeddings-voyage.ts`, `src/memory/batch-voyage.ts`

**node-llama-cpp (Local Embeddings):**

- Peer dependency; local GGUF model inference for embeddings (`src/memory/node-llama.ts`)
- Default model: `hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf`

## Messaging Channels (Built-in)

All channel integrations are managed via the plugin/extension system. Core channels are in `src/`:

**Telegram:**

- SDK: `grammy` 1.40+ + `@grammyjs/runner` + `@grammyjs/transformer-throttler`
- Source: `src/telegram/` (bot, webhooks, voice, inline buttons, draft streaming)
- Auth: Bot token via config

**Discord:**

- SDK: `@buape/carbon` (beta) + `discord-api-types`
- Voice: `@discordjs/voice` + `@discordjs/opus` (optional)
- Source: `src/discord/` (monitor, voice, thread bindings)
- Auth: Bot token via config

**Slack:**

- SDK: `@slack/bolt` 4.6.0 + `@slack/web-api` 7.14+
- Source: `src/slack/`
- Auth: Bot token + signing secret via config

**WhatsApp:**

- SDK: `@whiskeysockets/baileys` 7.0.0-rc.9 (WhatsApp Web reverse-engineered protocol)
- Source: `src/whatsapp/`
- Auth: QR code scan pairing

**iMessage (macOS):**

- Source: `src/imessage/`
- Auth: macOS system integration only

**Signal:**

- Source: `src/signal/`
- Auth: Linked device pairing

**Web Chat:**

- Source: `src/channels/web/`, `src/web/`
- Served from gateway HTTP server on port 18789

## Messaging Channels (Extensions)

Extension packages in `extensions/`:

- **Matrix** - `@openclaw/matrix` - `@vector-im/matrix-bot-sdk` + `@matrix-org/matrix-sdk-crypto-nodejs`
- **MS Teams** - `@openclaw/msteams` - `@microsoft/agents-hosting` (Bot Framework)
- **LINE** - `extensions/line/` - `@line/bot-sdk`
- **Feishu/Lark** - `extensions/feishu/` - `@larksuiteoapi/node-sdk`
- **Google Chat** - `extensions/googlechat/`
- **Nostr** - `extensions/nostr/`
- **IRC** - `extensions/irc/`
- **Twitch** - `extensions/twitch/`
- **Mattermost** - `extensions/mattermost/`
- **Nextcloud Talk** - `extensions/nextcloud-talk/`
- **Synology Chat** - `extensions/synology-chat/`
- **Tlon** - `extensions/tlon/`
- **Zalo** - `extensions/zalo/` + `extensions/zalouser/`
- **BlueBubbles (iMessage)** - `extensions/bluebubbles/`
- **Talk Voice** - `extensions/talk-voice/`
- **Voice Call** - `extensions/voice-call/` - ws-based telephony bridge

## Data Storage

**Databases:**

- SQLite (via `better-sqlite3`) - multiple databases:
  - Observability: `~/.openclaw/observability.sqlite` (`src/infra/observability-db.ts`)
  - Sessions: `~/.openclaw/agents/<agentId>/sessions/*.jsonl` (JSONL files, not SQLite)
  - Memory: `~/.openclaw/memory/main.sqlite` (via `src/memory/`)
  - Auth profiles: `~/.openclaw/agents/<agentId>/auth-profiles.json` (JSON, not SQLite)
- All SQLite connections initialized via `src/infra/db-init.ts` with WAL mode + `busy_timeout=5000`
- Vector search: `sqlite-vec` extension loaded on demand (`src/memory/sqlite-vec.ts`)

**File Storage:**

- Local filesystem only for state, sessions, workspace
- No S3/cloud object storage integration in core (R2 backup noted as in-progress but blocked)

**Caching:**

- In-memory caches (Maps) throughout codebase
- No Redis/Memcached

## Authentication & Identity

**Auth Provider:**

- Custom auth-profiles system (`src/agents/auth-profiles/`)
- Profiles stored in `~/.openclaw/agents/<agentId>/auth-profiles.json`
- Supports: `api_key`, `token`, `oauth` credential types
- OAuth PKCE flows for: Anthropic, Google/Gemini, GitHub Copilot, Chutes, MiniMax, Qwen
- Credential monitoring with cooldown/rotation: `src/infra/credential-monitor.ts`
- API key rotation: `src/agents/api-key-rotation.ts`

**Gateway Auth:**

- Token-based: `OPENCLAW_GATEWAY_TOKEN` env var for API access
- Rate limiting: `src/gateway/auth-rate-limit.ts`, `src/gateway/control-plane-rate-limit.ts`
- HTTP origin check: `src/gateway/origin-check.ts`
- Role-based access policy: `src/gateway/role-policy.ts`
- Device pairing: `src/infra/device-pairing.ts`, `src/infra/node-pairing.ts`

## Push Notifications

**Apple APNS:**

- Implementation: `src/infra/push-apns.ts`
- JWT-based auth (Team ID + Key ID + private key)
- Targets: iOS + macOS clients
- Environments: sandbox / production

## Networking & Discovery

**mDNS/Bonjour:**

- SDK: `@homebridge/ciao` ^1.3.5
- Source: `src/infra/bonjour.ts`, `src/infra/bonjour-ciao.ts`
- Advertises gateway presence on local network for auto-discovery

**Tailscale:**

- Integration: `src/infra/tailscale.ts`, `src/gateway/server-tailscale.ts`
- Binary detection and VPN tunneling support

**SSH Tunneling:**

- Source: `src/infra/ssh-tunnel.ts`
- Allows exposing gateway over SSH port forwarding

**Outbound HTTP Proxy:**

- `https-proxy-agent` ^7.0.6 for HTTPS_PROXY support

## Observability

**Error Tracking:**

- Custom crash logger: `src/infra/crash-logger.ts`
- No Sentry/Datadog integration in core

**OpenTelemetry (Extension):**

- `extensions/diagnostics-otel/` - optional OTLP exporter extension
- Exports traces, metrics, and logs via OTLP HTTP endpoints
- SDK: `@opentelemetry/sdk-node` 0.212+

**Logs:**

- `tslog` 4.10.2 for structured logging (`src/logger.ts`, `src/logging/`)
- Crash logs written locally; no remote aggregation in core

## CI/CD & Deployment

**Hosting:**

- Fly.io: `fly.toml` - Docker-based deployment, `shared-cpu-2x` 2GB RAM, IAD region
- Render: `render.yaml` - Docker web service, 1GB persistent disk at `/data`
- Docker: `Dockerfile` (Node 22 Bookworm), `Dockerfile.sandbox`, `Dockerfile.sandbox-browser`
- Podman: `openclaw.podman.env`, `setup-podman.sh`

**CI Pipeline:**

- GitHub Actions: `.github/workflows/ci.yml`
- Runners: `blacksmith-16vcpu-ubuntu-2404` (Linux), macOS, Windows
- Docker release: `.github/workflows/docker-release.yml`
- Install smoke tests: `.github/workflows/install-smoke.yml`

**Release:**

- npm publish (`openclaw` package, `clawdbot` shim in `packages/`)
- Version format: `YYYY.M.D` (calendar versioning)
- macOS app packaging: `scripts/package-mac-app.sh`
- Docker image: published to registry on release

## ACP (Agent Client Protocol)

**ACP Server:**

- SDK: `@agentclientprotocol/sdk` 0.14.1
- Source: `src/acp/` - protocol server, session mapper, translator
- Exposes gateway agent capabilities via standardized ACP protocol

## MCP (Model Context Protocol)

**In-process MCP Servers:**

- Created via `@anthropic-ai/claude-agent-sdk` `createSdkMcpServer`
- Source: `src/agents/sdk-runner/mcp-servers.ts`
- Servers: `gateway-kb` (knowledge base query), `gateway-system` (OS info)
- No external MCP processes; all run in-process

## Browser Automation

**Playwright:**

- `playwright-core` 1.58.2 (no full Playwright install; core only)
- Source: `src/browser/`
- Chromium downloaded on demand via `playwright-core/cli.js install`
- Optional pre-install in Docker via `OPENCLAW_INSTALL_BROWSER=1` build arg

## Webhooks & Callbacks

**Incoming:**

- Telegram webhook: `src/telegram/webhook.ts` - configurable endpoint on gateway HTTP server
- Slack Events API: via `@slack/bolt` HTTP mode
- MS Teams Bot Framework webhooks: `extensions/msteams/`
- LINE webhook: `extensions/line/` + `@line/bot-sdk`
- Feishu webhook: `extensions/feishu/`

**Outgoing:**

- Heartbeat/alert dispatching: `src/infra/alert-dispatcher.ts`
- Outbound session routing to messaging channels: `src/infra/outbound/outbound-session.ts`

## Environment Configuration

**Required for gateway operation:**

- `OPENCLAW_GATEWAY_TOKEN` - gateway API authentication token

**AI provider auth (at least one required):**

- `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN` - Anthropic/Claude
- `OPENAI_API_KEY` - OpenAI/Codex
- `GEMINI_API_KEY` - Google Gemini
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` - AWS Bedrock
- `GITHUB_COPILOT_TOKEN` or auto-discovery from VS Code - GitHub Copilot

**Optional:**

- `OPENCLAW_STATE_DIR` - override default `~/.openclaw/` state directory
- `OPENCLAW_WORKSPACE_DIR` - override default workspace directory
- `CLAUDE_AI_SESSION_KEY` / `CLAUDE_WEB_SESSION_KEY` / `CLAUDE_WEB_COOKIE` - Claude web session
- `OPENCLAW_SKIP_CHANNELS` / `CLAWDBOT_SKIP_CHANNELS` - skip channel startup in dev
- `OPENCLAW_TEST_PROFILE` - test profile override (`low`, `serial`)

**Secrets location:**

- Auth profiles: `~/.openclaw/agents/<agentId>/auth-profiles.json` (NOT environment variables for production keys; gateway reads directly)
- Credentials dir: `~/.openclaw/credentials/`

---

_Integration audit: 2026-03-01_
