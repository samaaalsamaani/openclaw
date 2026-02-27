# Repository Guidelines

- Repo: https://github.com/openclaw/openclaw
- GitHub issues/comments/PR comments: use literal multiline strings or `-F - <<'EOF'` for real newlines; never embed "\\n".
- GitHub comment footgun: never use `gh issue/pr comment -b "..."` with backticks or shell chars. Use single-quoted heredoc.
- GitHub linking footgun: don't wrap issue/PR refs like `#24643` in backticks. Use plain `#24643`.
- Security advisory analysis: read `SECURITY.md` before triage/severity decisions.

## Project Structure & Module Organization

- Source: `src/` (CLI in `src/cli`, commands in `src/commands`, web in `src/provider-web.ts`, infra in `src/infra`, media in `src/media`).
- Tests: colocated `*.test.ts`. Docs: `docs/`. Built output: `dist/`.
- Plugins/extensions: `extensions/*` (workspace packages). Keep plugin-only deps in extension `package.json`. Avoid `workspace:*` in `dependencies`; put `openclaw` in `devDependencies` or `peerDependencies`.
- Installers: sibling repo `../openclaw.ai` (`public/install.sh`, `public/install-cli.sh`, `public/install.ps1`).
- Messaging channels: consider **all** built-in + extension channels when refactoring shared logic.
  - Core: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web`, `src/channels`, `src/routing`
  - Extensions: `extensions/*` (msteams, matrix, zalo, zalouser, voice-call)
- When adding channels/extensions/apps/docs, update `.github/labeler.yml` and create matching labels.

## Docs Linking (Mintlify)

- Hosted on Mintlify (docs.openclaw.ai). Internal links: root-relative, no `.md`/`.mdx` (e.g. `[Config](/configuration)`).
- When working with docs, read the mintlify skill. Anchors: `[Hooks](/configuration#hooks)`.
- Avoid em dashes/apostrophes in headings (breaks Mintlify anchors).
- When Peter asks for links, use full `https://docs.openclaw.ai/...` URLs.
- When you touch docs, end reply with the full URLs. README: use absolute docs URLs.
- Docs content must be generic: no personal device names/hostnames/paths.
- **i18n (zh-CN):** `docs/zh-CN/**` is generated; do not edit unless explicitly asked. See `docs/.i18n/README.md`.

## Build, Test, and Development Commands

- Runtime: Node **22+** (keep Node + Bun paths working). Install: `pnpm install`.
- If deps missing, run `pnpm install` then rerun the command once.
- Prefer Bun for TS execution: `bun <file.ts>` / `bunx <tool>`. Dev: `pnpm openclaw ...` or `pnpm dev`.
- Build: `pnpm build`. TypeScript: `pnpm tsgo`. Lint: `pnpm check`. Format: `pnpm format` / `pnpm format:fix`.
- Tests: `pnpm test` (vitest). Coverage: `pnpm test:coverage`. Low-memory: `OPENCLAW_TEST_PROFILE=low pnpm test`.
- Live tests: `CLAWDBOT_LIVE_TEST=1 pnpm test:live` or `LIVE=1 pnpm test:live`.
- Pre-commit hooks: `prek install`. Mac packaging: `scripts/package-mac-app.sh`.

## Coding Style & Naming

- TypeScript (ESM). Strict typing; avoid `any`. Run `pnpm check` before commits.
- Never add `@ts-nocheck` or disable `no-explicit-any`. Fix root causes.
- No prototype mutation for sharing class behavior. Use explicit inheritance/composition.
- Brief comments for tricky logic. Keep files under ~500 LOC. Extract helpers instead of "V2" copies.
- Naming: **OpenClaw** for product/app headings; `openclaw` for CLI/package/paths/config.
- CLI progress: `src/cli/progress.ts`. Tables: `src/terminal/table.ts`. Colors: `src/terminal/palette.ts`.

## Release Channels

- stable: tagged `vYYYY.M.D`, npm `latest`. beta: `vYYYY.M.D-beta.N`, npm `beta`. dev: `main` head.

## Testing Guidelines

- Vitest, V8 coverage (70% threshold). Match source names with `*.test.ts`; e2e: `*.e2e.test.ts`.
- Do not set test workers above 16. Changelog: user-facing changes only.
- Mobile: prefer connected real devices over simulators. Full kit: `docs/testing.md`.

## Commit & Pull Request Guidelines

- Full maintainer PR workflow: see `.agents/skills/PR_WORKFLOW.md`.
- Commits: `scripts/committer "<msg>" <file...>`. Concise, action-oriented messages.
- Group related changes; avoid bundling unrelated refactors.
- PR template: `.github/pull_request_template.md`. Issue templates: `.github/ISSUE_TEMPLATE/`.

## Shorthand Commands

- `sync`: commit dirty tree, `git pull --rebase`, `git push` (stop on conflict).

## Git & GitHub

- If `git branch -d/-D` is blocked: `git update-ref -d refs/heads/<branch>`.
- Bulk PR close/reopen: confirm with user if >5 PRs affected.
- Search: `gh search issues --repo openclaw/openclaw --match title,body --limit 50 -- "query"`.

## Security & Configuration

- Creds: `~/.openclaw/credentials/`. Sessions: `~/.openclaw/sessions/`.
- Never commit real phone numbers, videos, or live config values.
- Release flow: read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` first.
- **For GHSA, NPM publish, plugin releases, changelog, VM ops, version bumps:** see `.agents/RELEASE_OPS.md`.

## Agent-Specific Notes

- Vocabulary: "makeup" = "mac app".
- Never edit `node_modules`. When adding `AGENTS.md`, also add a `CLAUDE.md` symlink.
- Signal: "update fly" => `fly ssh console -a flawd-bot -C "bash -lc 'cd /data/clawd/openclaw && git pull --rebase origin main'"` then `fly machines restart e825232f34d058 -a flawd-bot`.
- Print full GitHub URL at end of issue/PR tasks. High-confidence answers only; verify in code.
- Never update Carbon dependency. Patched deps (`pnpm.patchedDependencies`) must use exact versions.
- Patching deps requires explicit approval. Release guardrails: no version changes without consent.
- SwiftUI: prefer `Observation` framework (`@Observable`) over `ObservableObject`/`@StateObject`.
- Connection providers: update all UI surfaces and docs when adding new connections.
- Gateway runs as menubar app only. Restart via app or `scripts/restart-mac.sh`. macOS logs: `./scripts/clawlog.sh`.
- Session files: `~/.openclaw/agents/<agentId>/sessions/*.jsonl` (not `sessions.json`).
- Do not rebuild macOS app over SSH. Never send streaming/partial replies to external messaging surfaces.
- Tool schema guardrails: no `Type.Union`/`anyOf`/`oneOf`/`allOf` in tool input schemas. No raw `format` property names.
- A2UI bundle hash: auto-generated; regenerate via `pnpm canvas:a2ui:bundle`.
- Bug investigations: read source of npm deps and local code before concluding.

## Multi-Agent Safety

- No `git stash` create/apply/drop unless requested. No branch switching unless requested. No worktree modifications unless requested.
- "push" = may `git pull --rebase` first. "commit" = scope to your changes. "commit all" = grouped chunks.
- Multiple agents OK with separate sessions. Ignore unrecognized files; commit only yours.
- Focus reports on your edits. Lint/format-only diffs: auto-resolve without asking.
