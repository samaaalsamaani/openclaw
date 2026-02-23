import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetForTesting, enforceAutonomy, extractCommandPattern } from "./autonomy-enforcer.js";

// ── Pattern Extraction ──

describe("extractCommandPattern", () => {
  it("extracts binary + first arg", () => {
    expect(extractCommandPattern("git push origin main")).toBe("exec:git:push");
  });

  it("handles rm -rf", () => {
    expect(extractCommandPattern("rm -rf /tmp/foo")).toBe("exec:rm:-rf");
  });

  it("handles sudo", () => {
    expect(extractCommandPattern("sudo apt update")).toBe("exec:sudo:apt");
  });

  it("uses wildcard for URLs", () => {
    expect(extractCommandPattern("curl https://example.com")).toBe("exec:curl:*");
  });

  it("strips leading env vars", () => {
    expect(extractCommandPattern("LIVE=1 pnpm test")).toBe("exec:pnpm:test");
  });

  it("strips multiple env vars", () => {
    expect(extractCommandPattern("FOO=bar BAZ=1 npm run lint")).toBe("exec:npm:run");
  });

  it("unwraps bash -c wrapper", () => {
    expect(extractCommandPattern("bash -c 'git push'")).toBe("exec:git:push");
  });

  it("unwraps sh -c with double quotes", () => {
    expect(extractCommandPattern('sh -c "npm install"')).toBe("exec:npm:install");
  });

  it("handles single-token commands", () => {
    expect(extractCommandPattern("ls")).toBe("exec:ls");
  });

  it("handles ls with flags", () => {
    expect(extractCommandPattern("ls -la")).toBe("exec:ls:-la");
  });

  it("handles empty/whitespace", () => {
    expect(extractCommandPattern("   ")).toBe("exec:unknown");
  });

  it("strips env vars inside bash -c wrapper", () => {
    expect(extractCommandPattern("bash -c 'LIVE=1 pnpm test'")).toBe("exec:pnpm:test");
  });
});

// ── Enforcement (integration with in-memory DB) ──

describe("enforceAutonomy", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  afterEach(() => {
    _resetForTesting();
  });

  it("allows commands when DB is unavailable (fail open)", () => {
    // Mock requireNodeSqlite to throw
    vi.mock("../memory/sqlite.js", () => ({
      requireNodeSqlite: () => {
        throw new Error("node:sqlite not available");
      },
    }));

    // Re-import to pick up mock — but since the module caches the DB singleton,
    // we reset first and the next call will try to init
    const result = enforceAutonomy("git status");
    expect(result.action).toBe("allow");

    vi.restoreAllMocks();
  });

  it("returns a valid decision shape", () => {
    const result = enforceAutonomy("echo hello");
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("pattern");
    expect(result).toHaveProperty("action");
    expect(["allow", "deny"]).toContain(result.action);
    expect(["safe", "ask", "never"]).toContain(result.level);
  });

  it("extracts pattern correctly in decision", () => {
    const result = enforceAutonomy("git push origin main");
    expect(result.pattern).toBe("exec:git:push");
  });
});
