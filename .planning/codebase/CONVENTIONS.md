# Coding Conventions

**Analysis Date:** 2026-03-01

## Naming Patterns

**Files:**

- `kebab-case.ts` for all TypeScript source files (`circuit-breaker.ts`, `retry.ts`, `home-dir.ts`)
- Test files: `<name>.test.ts` colocated with source, or `<name>.<aspect>.test.ts` for focused suites
  - Examples: `gateway-lock.test.ts`, `bash-tools.exec.pty.test.ts`, `auth-profiles.markauthprofilefailure.test.ts`
- E2E tests: `<name>.e2e.test.ts` in `test/` directory
- Live tests (require real credentials): `<name>.live.test.ts`
- Test helpers for a module: `<name>.test-utils.ts` (e.g., `heartbeat-runner.test-utils.ts`)
- Fixtures for a test group: `<name>.fixtures.ts` (e.g., `auth-profiles.resolve-auth-profile-order.fixtures.ts`)

**Functions:**

- `camelCase` for all functions: `resolveEffectiveHomeDir`, `createTrackedTempDirs`, `withTempFile`
- Constructor-style factories prefixed with `create`: `createCircuitBreaker`, `createProviderUsageFetch`, `createDedupeCache`
- Boolean predicates prefixed with `is`, `has`, `should`, `can`: `isPrivateIpAddress`, `isTruthyEnvValue`, `isPlainObject`
- Setup/teardown helpers for tests: `resetXxxForTest()` or `resetXxxForTests()` naming pattern
- State reset helpers: double-underscore prefix for internal-only test resets: `__resetDiscordChannelInfoCacheForTest`

**Variables:**

- `camelCase` throughout: `failureCount`, `lastFailureTime`, `tempHome`
- Constants: `UPPER_SNAKE_CASE` for module-level constants: `DEFAULT_OPTIONS`, `DEFAULT_RETRY_CONFIG`, `ARG_MAX_THRESHOLD`

**Types:**

- `PascalCase` interfaces and types: `CircuitBreakerOptions`, `RetryOptions`, `TempHomeEnv`, `BackoffPolicy`
- Type aliases for union types use `type`, not `interface`: `type CircuitState = "closed" | "open" | "half-open"`
- Exported schema types: `z.infer<typeof XxxSchema>` pattern with matching `XxxSchema` + `type Xxx = z.infer<...>`
- Export both schema and inferred type: `export const LlmConfigSchema = z.object({...}); export type LlmConfig = z.infer<typeof LlmConfigSchema>`

## Code Style

**Formatting:**

- Tool: `oxfmt` (v0.34.0) — run with `pnpm format` or `pnpm format:fix`
- Check: `pnpm format:check`
- No `.prettierrc` — oxfmt handles all formatting

**Linting:**

- Tool: `oxlint` (v1.49.0) with `--type-aware` flag
- Config: `.oxlintrc.json` at project root
- Plugins: `unicorn`, `typescript`, `oxc`
- Key enforced rules:
  - `typescript/no-explicit-any` — error (no `any` allowed; use `// oxlint-disable-next-line` with explanation when unavoidable)
  - `curly` — error (always use braces)
  - `correctness`, `perf`, `suspicious` categories — all error
- Inline disable syntax: `// oxlint-disable-next-line rule/name -- reason`
- Run: `pnpm lint` (check) or `pnpm lint:fix` (fix)

**Full check (pre-commit):**

```bash
pnpm check   # format:check + tsgo + lint
```

## Import Organization

**Order (enforced by oxfmt):**

1. Node built-in modules using `node:` protocol: `import fs from "node:fs"`, `import path from "node:path"`
2. Third-party packages: `import { z } from "zod"`, `import { vi } from "vitest"`
3. Internal project imports with relative paths: `import { sleep } from "../utils.js"`

**Important rules:**

- Always use `node:` protocol prefix for Node built-ins: `import fs from "node:fs"` not `import fs from "fs"`
- Always use `.js` extension in relative imports (ESM): `import { foo } from "./bar.js"` even for `.ts` source files
- Path aliases in `tsconfig.json`: `openclaw/plugin-sdk` → `src/plugin-sdk/index.ts`

**Import style:**

- Named imports preferred over default for packages with multiple exports: `import { readFile } from "node:fs/promises"`
- Default imports for packages with single export: `import fs from "node:fs/promises"`
- Type-only imports use `import type`: `import type { CircuitBreakerOptions } from "./circuit-breaker.js"`

## Error Handling

**Patterns:**

- Functions that can fail return either a discriminated union (`{ ok: true, ... } | { ok: false, ... }`) or throw
- Error codes as string literals in thrown errors: `{ code: "not-file" }`, `{ code: "too-large" }`, `{ code: "symlink" }`
- `SafeOpenError` and similar typed error classes for domain errors in `src/infra/fs-safe.ts`
- Catch-all `catch { /* ignore */ }` is acceptable for cleanup paths (file deletion, etc.)
- `catch (err)` — always use `err` as the catch variable name
- `Error` with `{ cause: err }` for wrapping: `throw new Error("message", { cause: err })`
- Async path-exists check pattern: `try { await access(path); return true; } catch { return false; }`

## Logging

**Framework:** `tslog` via a subsystem logger abstraction

**Pattern:**

```typescript
import { createSubsystemLogger } from "../logging/subsystem.js";
const log = createSubsystemLogger("subsystem-name");
// then: log.info("..."), log.warn("..."), log.error("...")
```

**CLI logging helpers (`src/logger.ts`):**

- `logInfo`, `logWarn`, `logError`, `logSuccess`, `logDebug` — functional API that accepts optional `RuntimeEnv`
- `logVerbose` — only outputs when verbose mode enabled
- No `console.log` in production code; tests may use `vi.spyOn(console, ...)` to capture

**Test guard:**

```typescript
if (process.env.VITEST || process.env.NODE_ENV === "test") {
  return;
}
```

Used in modules that should silently skip logging during test runs (e.g., `src/infra/env.ts`).

## Comments

**When to Comment:**

- Block comments (`/** ... */`) for exported functions, classes, and types — especially public API surfaces
- Inline comments for tricky logic, non-obvious decisions, or guard conditions: `// Open circuit if threshold exceeded`
- Section headers with `// ── Name ──────` dashes for long files
- Test-helper comments explaining why a pattern is used: `// Creating a fresh registry before every single test was measurable overhead.`

**JSDoc usage:**

- Used for exported public API (`@throws`, `@param`, etc.) in library-style modules
- State machine descriptions in class-level JSDoc (see `CircuitBreaker` in `src/infra/circuit-breaker.ts`)
- Not required for internal/private functions

## Function Design

**Size:** Keep files under ~500 LOC; extract helpers rather than growing single files. Several files exceed this (1000-1900 LOC) and are considered tech debt.

**Parameters:**

- Options objects preferred over positional args for >2 parameters: `{ attempts, minDelayMs, maxDelayMs, jitter }`
- Dependency injection via parameters for testability: pass `env`, `homedir()`, `fetch`, `now` as overridable params
- Functions that accept both short and verbose forms: `retryAsync(fn, 3, 10)` or `retryAsync(fn, { attempts, ... })`

**Return Values:**

- Async functions always return `Promise<T>` explicitly when the return type might be ambiguous
- Avoid `null` returns in favor of `undefined` or `T | undefined`
- Result objects preferred over throwing for expected failure modes

## Module Design

**Exports:**

- Named exports only — no default exports from source modules
- `index.ts` barrel files used only at major API boundaries (`src/plugin-sdk/index.ts`)
- Do not re-export everything from barrel files; be selective

**Test-support exports:**

- Modules that need state reset for tests export `resetXxxForTest()` alongside production API
- Test utilities live in `src/test-utils/` (colocated with source) and `test/helpers/` (integration helpers)
- Test fixtures in `src/agents/<name>.fixtures.ts` pattern for complex test data

**TypeScript strict mode:**

- `"strict": true` in `tsconfig.json` — no implicit any, strict null checks, etc.
- Never use `@ts-nocheck` or disable `no-explicit-any` at file level
- `experimentalDecorators: true` is enabled but decorators are used sparingly
- Use `as unknown as T` (double cast) when unsafe cast is unavoidable — never use single `as T` from incompatible types

---

_Convention analysis: 2026-03-01_
