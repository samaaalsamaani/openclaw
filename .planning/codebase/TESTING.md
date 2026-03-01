# Testing Patterns

**Analysis Date:** 2026-03-01

## Test Framework

**Runner:**

- Vitest (v4.0.18)
- Config: `vitest.config.ts` (base), with separate configs per suite type

**Assertion Library:**

- Vitest built-in: `expect`, `expect.objectContaining`, `expect.stringContaining`, `rejects.toThrow`, `rejects.toMatchObject`

**Coverage:**

- Provider: V8 (`@vitest/coverage-v8`)
- Reporters: `text`, `lcov`

**Run Commands:**

```bash
pnpm test                  # parallel unit tests (node scripts/test-parallel.mjs)
pnpm test:fast             # vitest run --config vitest.unit.config.ts (fastest subset)
pnpm test:watch            # vitest watch mode
pnpm test:coverage         # vitest run with coverage
pnpm test:e2e              # vitest run --config vitest.e2e.config.ts
pnpm test:live             # live tests requiring real credentials (OPENCLAW_LIVE_TEST=1)
pnpm test:ui               # UI workspace tests (pnpm --dir ui test)
```

## Test File Organization

**Location:**

- Unit tests: colocated with source as `<source-name>.test.ts`
  - Example: `src/infra/circuit-breaker.ts` → `src/infra/circuit-breaker.test.ts`
- Focused aspect tests: `<source>.<aspect>.test.ts`
  - Example: `src/agents/bash-tools.exec.pty.test.ts`, `src/infra/heartbeat-runner.scheduler.test.ts`
- Integration/E2E tests: `test/**/*.e2e.test.ts` (separate `test/` directory)
- Live tests (real API calls): `src/**/*.live.test.ts`

**Naming:**

- Files: `<name>.test.ts` or `<name>.<aspect>.test.ts`
- Suites: `describe("module-name")` or `describe("ClassName")`
- Tests: plain English descriptions: `it("allows calls in closed state")`, `it("opens after 5 consecutive failures")`

**Structure:**

```
src/
  infra/
    circuit-breaker.ts
    circuit-breaker.test.ts
    heartbeat-runner.ts
    heartbeat-runner.scheduler.test.ts        # focused aspect
    heartbeat-runner.test-utils.ts            # shared test helpers for this module
test/
  helpers/
    gateway-e2e-harness.ts
    temp-home.ts
  mocks/
    baileys.ts
  fixtures/
    exec-allowlist-shell-parser-parity.json
src/test-utils/                               # shared utilities for unit tests
  env.ts
  temp-home.ts
  tracked-temp-dirs.ts
  channel-plugins.ts
  provider-usage-fetch.ts
  mock-http-response.ts
  fixture-suite.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyClass } from "./my-module.js";

describe("MyClass", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows calls in closed state", async () => {
    const instance = new MyClass("key");
    const result = await instance.execute(vi.fn(async () => "success"));
    expect(result).toBe("success");
  });

  it("propagates error", async () => {
    const instance = new MyClass("key");
    await expect(
      instance.execute(
        vi.fn(async () => {
          throw new Error("boom");
        }),
      ),
    ).rejects.toThrow("boom");
  });
});
```

**Nested describes for grouping:**

```typescript
describe("infra store", () => {
  describe("state migrations fs", () => {
    it("treats array session stores as invalid", async () => { ... });
  });
  describe("voicewake store", () => {
    it("returns defaults when missing", async () => { ... });
  });
});
```

**Patterns:**

- Setup: `beforeEach` for test isolation (fake timers, registry reset, env setup)
- Teardown: `afterEach` for cleanup (real timers, file removal, mock restore)
- Global setup: `test/setup.ts` runs before every test — installs isolated home dir, default plugin registry
- Suite-level fixture: `beforeAll`/`afterAll` for shared temp directories across test cases

## Mocking

**Framework:** Vitest built-in (`vi`)

**Module mocking (top-level):**

```typescript
vi.mock("../agents/auth-profiles/store.js", () => ({
  loadAuthProfileStore: vi.fn(),
  saveAuthProfileStore: vi.fn(),
}));

vi.mock("node-notifier", () => ({
  default: {
    notify: vi.fn(),
  },
}));
```

**Function mocking:**

```typescript
const mockFn = vi.fn(async () => "success");
const mockFn = vi.fn().mockResolvedValue("ok");
const mockFn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("ok");

const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
// ... test ...
spy.mockRestore();
```

**Timer mocking:**

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

vi.advanceTimersByTime(5000);
await vi.runAllTimersAsync();
vi.setSystemTime(new Date("2026-01-08T00:00:00Z"));
```

**Environment variable mocking:**

- Preferred: `vi.stubEnv("KEY", "value")` — automatically restored via `unstubEnvs: true` in config
- Alternative: `withEnv({ KEY: "value" }, () => { ... })` from `src/test-utils/env.ts`
- Async variant: `withEnvAsync({ KEY: "value" }, async () => { ... })`

**What to Mock:**

- External HTTP calls: pass custom `fetch` implementation via dependency injection
- File system: use real temp dirs (do not mock `fs`) — see Temp Directory pattern below
- Node notifier, external SDKs: `vi.mock(...)` at module level
- Timers when testing time-dependent logic: `vi.useFakeTimers()`

**What NOT to Mock:**

- The file system for unit tests — use real temp dirs instead
- Internal pure functions — test them directly
- TypeScript-visible module boundaries without a good reason

## Fixtures and Factories

**Temp Directory pattern (preferred for filesystem tests):**

```typescript
import { createTrackedTempDirs } from "../test-utils/tracked-temp-dirs.js";

const tempDirs = createTrackedTempDirs();

afterEach(async () => {
  await tempDirs.cleanup();
});

it("reads a local file safely", async () => {
  const dir = await tempDirs.make("openclaw-fs-safe-");
  const file = path.join(dir, "payload.txt");
  await fs.writeFile(file, "hello");
  // ... test
});
```

**WithTempDir pattern (callback-based):**

```typescript
import { withTempDir } from "../test-utils/temp-dir.js";

it("treats array session stores as invalid", async () => {
  await withTempDir("openclaw-session-store-", async (dir) => {
    // dir is cleaned up automatically after callback
    const storePath = path.join(dir, "sessions.json");
    await fs.writeFile(storePath, "[]");
    const result = readSessionStoreJson5(storePath);
    expect(result.ok).toBe(false);
  });
});
```

**Shared fixture root (suite-wide):**

```typescript
let fixtureRoot = "";
let caseId = 0;

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-pairing-"));
});

afterAll(async () => {
  if (fixtureRoot) {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function withTempStateDir<T>(fn: (stateDir: string) => Promise<T>) {
  const dir = path.join(fixtureRoot, `case-${caseId++}`);
  await fs.mkdir(dir, { recursive: true });
  return await withEnvAsync({ OPENCLAW_STATE_DIR: dir }, async () => await fn(dir));
}
```

**Mock HTTP responses:**

```typescript
import { createProviderUsageFetch, makeResponse } from "../test-utils/provider-usage-fetch.js";

const mockFetch = createProviderUsageFetch(async (url) => {
  if (url.includes("api.example.com/endpoint")) {
    return makeResponse(200, { data: "value" });
  }
  return makeResponse(404, "not found");
});
```

**Channel plugin registry (from global setup):**

- `test/setup.ts` creates a default stub plugin registry with all core channels
- Tests that need a custom registry call `setActivePluginRegistry(createTestRegistry([...]))`

**Location:**

- Shared test utilities: `src/test-utils/`
- Integration test helpers: `test/helpers/`
- Module-specific test helpers: `src/<module>/<name>.test-utils.ts`
- JSON fixture data: `test/fixtures/*.json`

## Coverage

**Requirements:**

- Lines: 70%
- Functions: 70%
- Branches: 55%
- Statements: 70%

**Scope:** Only `./src/**/*.ts` (excludes extensions, apps, ui, test files)

**Explicitly excluded from coverage:**

- Entry points and CLI wiring: `src/entry.ts`, `src/cli/**`, `src/commands/**`
- Channel surfaces (validated via integration/e2e): `src/discord/**`, `src/telegram/**`, `src/slack/**`, `src/signal/**`
- Gateway server methods: `src/gateway/server-methods/**`
- Interactive UIs: `src/tui/**`, `src/wizard/**`
- Agent integration surfaces: `src/agents/**`, `src/providers/**`, `src/plugins/**`

**View Coverage:**

```bash
pnpm test:coverage
# Output: text to terminal, lcov to coverage/lcov.info
```

## Test Types

**Unit Tests:**

- Scope: Individual module functions and classes in isolation
- Location: `src/**/*.test.ts`
- Config: `vitest.unit.config.ts`
- Use real fs (temp dirs), fake timers, vi.fn() mocks

**Integration Tests (gateway):**

- Scope: Gateway session handling and multi-component flows
- Location: `src/gateway/**/*.test.ts`
- Config: `vitest.gateway.config.ts`

**E2E Tests:**

- Scope: Full process interactions, install flows, CLI commands
- Location: `test/**/*.e2e.test.ts`
- Config: `vitest.e2e.config.ts`
- Pool: `vmForks`, max 1 worker by default (deterministic)
- Naming: `*.e2e.test.ts`

**Live Tests:**

- Scope: Real API calls requiring credentials
- Location: `src/**/*.live.test.ts`
- Trigger: `OPENCLAW_LIVE_TEST=1 pnpm test:live` or `LIVE=1 pnpm test:live`
- Max workers: 1 (serial)
- Skip in normal CI (excluded from base config via `exclude: ["**/*.live.test.ts"]`)

**Docker E2E Tests:**

- Scope: Full install, onboard, plugin lifecycle in Docker containers
- Trigger: `pnpm test:docker:all`
- Not Vitest-based — shell scripts in `scripts/e2e/`

**Browser/Screenshot Tests:**

- Location: `ui/src/ui/__screenshots__/`
- Config: `ui/vitest.node.config.ts`
- Naming: `*.browser.test.ts`

## Common Patterns

**Async Testing:**

```typescript
it("resolves after delay using fake timers", async () => {
  vi.useFakeTimers();
  const promise = sleep(1000);
  vi.advanceTimersByTime(1000);
  await expect(promise).resolves.toBeUndefined();
  vi.useRealTimers();
});

// Running fake timers to completion:
const promise = retryAsync(fn, options);
await vi.runAllTimersAsync();
await expect(promise).resolves.toBe("ok");
```

**Error Testing:**

```typescript
// Expect throw:
await expect(breaker.execute(mockFn)).rejects.toThrow("Circuit breaker open");

// Expect error shape:
await expect(readLocalFileSafely({ filePath: dir })).rejects.toMatchObject({ code: "not-file" });

// Expect regex match:
expect(() => normalizePollInput({ ... })).toThrow(/at most 2/);
```

**Parameterized Tests:**

```typescript
it.each([
  { durationHours: undefined, expected: 24 },
  { durationHours: 999, expected: 48 },
  { durationHours: 1, expected: 1 },
])("clamps poll duration for $durationHours hours", ({ durationHours, expected }) => {
  expect(normalizePollDurationHours(durationHours, { defaultHours: 24, maxHours: 48 })).toBe(
    expected,
  );
});
```

**Platform-conditional Tests:**

```typescript
it.runIf(process.platform !== "win32")("rejects symlinks", async () => {
  // Unix-only test
});
```

**Module-level state reset (test isolation):**

```typescript
beforeEach(() => {
  resetChannelActivityForTest(); // from src/infra/channel-activity.ts
  resetDiagnosticEventsForTest(); // from src/infra/diagnostic-events.ts
  vi.clearAllMocks();
});
```

**Global test isolation (from `test/setup.ts`):**

- `withIsolatedTestHome()` creates a temp home dir and redirects `HOME`, `OPENCLAW_STATE_DIR`, etc.
- Applied globally via `test/setup.ts` → `setupFiles: ["test/setup.ts"]` in `vitest.config.ts`
- `unstubEnvs: true` and `unstubGlobals: true` prevent cross-test env pollution under `vmForks`

**Worker limits:**

- Max 16 workers total (enforced in configs)
- Local: `Math.max(4, Math.min(16, os.cpus().length))`
- CI: 3 workers (non-Windows), 2 workers (Windows)
- E2E: 1 worker (default) or `OPENCLAW_E2E_WORKERS=N` (capped at 16)
- Low-memory mode: `OPENCLAW_TEST_PROFILE=low pnpm test`

---

_Testing analysis: 2026-03-01_
