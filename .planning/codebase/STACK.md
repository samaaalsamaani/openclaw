# Technology Stack

**Analysis Date:** 2026-03-01

## Languages

**Primary:**

- TypeScript 5.9+ (strict mode, ESM) - all `src/`, `extensions/`, `ui/`, `scripts/`
- Swift - macOS app (`apps/macos/`) and iOS app (`apps/ios/`) via SwiftUI + Observation framework
- Kotlin/Java - Android app (`apps/android/`) via Gradle

**Secondary:**

- Python 3.10+ - skills scripts under `skills/`, ruff + pytest configured in `pyproject.toml`
- JavaScript (ESM) - build helper scripts (`scripts/`, `openclaw.mjs` entry shim)

## Runtime

**Environment:**

- Node.js >= 22.12.0 (enforced in `package.json` `engines` field)
- Bun also supported for local TS execution: `bun <file.ts>`, `bunx <tool>`
- Docker image: `node:22-bookworm` + Bun installed via install script (`Dockerfile`)

**Package Manager:**

- pnpm 10.23.0 (enforced via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` (present, frozen in Docker/CI via `--frozen-lockfile`)
- Workspace: `pnpm-workspace.yaml` includes `.`, `ui`, `packages/*`, `extensions/*`

## Frameworks

**Core:**

- Express 5.2.1 - HTTP server for gateway control UI and API endpoints (`src/gateway/`)
- grammy 1.40+ + `@grammyjs/runner` - Telegram bot framework (`src/telegram/`)
- `@slack/bolt` 4.6.0 - Slack app framework (`src/slack/`)
- `@buape/carbon` - Discord bot framework (`src/discord/`)
- `@whiskeysockets/baileys` 7.0.0-rc.9 - WhatsApp Web protocol (`src/whatsapp/`)
- `@larksuiteoapi/node-sdk` - Feishu/Lark channel (`extensions/feishu/`)
- `@line/bot-sdk` - LINE messaging (`src/line/`, `extensions/line/`)
- `@microsoft/agents-hosting` - MS Teams Bot Framework (`extensions/msteams/`)
- `@vector-im/matrix-bot-sdk` - Matrix protocol (`extensions/matrix/`)
- `@mariozechner/pi-agent-core` + `pi-ai` + `pi-tui` + `pi-coding-agent` - Core AI agent runner abstractions

**Web UI:**

- Lit 3.3.2 + `@lit-labs/signals` + `@lit/context` - Web component framework (`ui/`)
- Custom web UI served from gateway (`src/gateway/control-ui.ts`)

**Testing:**

- Vitest 4.0+ - all test execution
- `@vitest/coverage-v8` - V8-based coverage reporting
- Multiple vitest configs for different test scopes (unit, e2e, live, extensions, gateway)

**Build/Dev:**

- tsdown 0.20+ (rolldown-based bundler) - production builds via `pnpm build`
- `@typescript/native-preview` 7.0.0 - fast type-checking via `pnpm tsgo`
- tsx 4.21 - on-demand TS execution for scripts (`node --import tsx scripts/...`)
- oxfmt 0.34 - formatter (`pnpm format`)
- oxlint 1.49+ - linter with type-aware rules (`pnpm lint`)
- swiftformat + swiftlint - macOS/iOS Swift formatting and linting

## Key Dependencies

**Critical:**

- `@anthropic-ai/claude-agent-sdk` ^0.2.50 - In-process Claude Code SDK runner (`src/agents/sdk-runner.ts`)
- `@agentclientprotocol/sdk` 0.14.1 - ACP protocol server (`src/acp/`)
- `@sinclair/typebox` 0.34.48 (pinned) - Runtime schema validation for config and tool schemas
- `zod` ^4.3.6 - Config schema validation (`src/config/zod-schema*.ts`)
- `better-sqlite3` ^12.6.2 (devDep/external) - SQLite client, always external in bundle (`tsdown.config.ts`)
- `sqlite-vec` 0.1.7-alpha.2 - Vector search extension for SQLite (`src/memory/sqlite-vec.ts`)
- `node-llama-cpp` 3.15.1 (peer) - Local LLM / local embedding inference (`src/memory/node-llama.ts`)

**Infrastructure:**

- `ws` ^8.19.0 - WebSocket server/client for gateway protocol
- `express` ^5.2.1 - HTTP server
- `undici` ^7.22.0 - HTTP client for API calls
- `chokidar` ^5.0.0 - File system watching for config hot-reload
- `croner` ^10.1.0 - Cron scheduling for gateway heartbeat/maintenance
- `@homebridge/ciao` ^1.3.5 - mDNS/Bonjour service discovery (`src/infra/bonjour.ts`)
- `playwright-core` 1.58.2 - Browser automation for web scraping (`src/browser/`)
- `sharp` ^0.34.5 - Image processing (native module)
- `pdfjs-dist` ^5.4.624 - PDF parsing for media understanding
- `yaml` ^2.8.2 - YAML config parsing
- `json5` ^2.2.3 - Lenient JSON config parsing
- `tslog` ^4.10.2 - Structured logging
- `dotenv` ^17.3.1 - `.env` file loading

**Audio/Voice:**

- `@discordjs/voice` ^0.19.0 + `opusscript` - Discord voice support
- `node-edge-tts` ^1.2.10 - Microsoft Edge TTS for voice responses
- `@lydell/node-pty` 1.2.0-beta.3 (native) - PTY support for bash tool

**Canvas/UI:**

- `@napi-rs/canvas` ^0.1.89 (peer, native) - Canvas rendering
- `markdown-it` ^14.1.1 - Markdown rendering
- `linkedom` ^0.18.12 - DOM manipulation without browser

## Configuration

**Environment:**

- Config file: `~/.openclaw/config.yml` (YAML, loaded via `src/config/io.ts`)
- Auth profiles: `~/.openclaw/agents/<agentId>/auth-profiles.json`
- Models: `~/.openclaw/agents/<agentId>/models.json` (auto-generated from config)
- State dir: `~/.openclaw/` (or `OPENCLAW_STATE_DIR` env var)
- Workspace: `~/.openclaw/workspace/` (or `OPENCLAW_WORKSPACE_DIR` env var)
- Key env vars: `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_STATE_DIR`, `OPENCLAW_WORKSPACE_DIR`, `NODE_ENV`
- AI session env vars (optional): `CLAUDE_AI_SESSION_KEY`, `CLAUDE_WEB_SESSION_KEY`, `CLAUDE_WEB_COOKIE`

**Build:**

- `tsdown.config.ts` - bundler config (multiple entry points: `src/index.ts`, `src/entry.ts`, `src/cli/daemon-cli.ts`, `src/plugin-sdk/index.ts`)
- `tsconfig.json` - TypeScript config (strict, NodeNext modules, `es2023` target)
- `vitest.config.ts` - base test config; `vitest.unit.config.ts`, `vitest.e2e.config.ts`, `vitest.live.config.ts`, `vitest.gateway.config.ts`, `vitest.extensions.config.ts`
- `knip.json` - dead code detection
- Path aliases: `openclaw/plugin-sdk` → `src/plugin-sdk/index.ts`

## Platform Requirements

**Development:**

- Node 22+, pnpm 10+, Bun (for some scripts)
- macOS: Xcode + SwiftFormat + SwiftLint for native app development
- Android: Gradle for Android builds
- Git hooks via `prek install` (configured in `git-hooks/`)

**Production:**

- Docker (Node 22 Bookworm image) for server/gateway deployment
- Fly.io (`fly.toml`) or Render (`render.yaml`) for cloud hosting
- macOS menubar app deployment via `scripts/package-mac-app.sh`
- Gateway default port: 18789 (HTTP/WS), 18790 (bridge)

---

_Stack analysis: 2026-03-01_
