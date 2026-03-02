import { afterEach, describe, expect, it, test, vi } from "vitest";

// Mock the fetch guard before importing health-check
vi.mock("./net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: vi.fn(),
}));

// Mock config-validator to avoid file I/O in tests
vi.mock("./config-validator.js", () => ({
  AuthProfilesSchema: {},
  LlmConfigSchema: {},
  OpenClawConfigSchema: {},
  loadConfigWithValidationSync: vi.fn().mockReturnValue({ profiles: {} }),
}));

// Mock home-dir to avoid HOME resolution issues
vi.mock("./home-dir.js", () => ({
  resolveRequiredHomeDir: vi.fn().mockReturnValue("/tmp"),
}));

import { checkSystemHealth } from "./health-check.js";

describe("health-check", () => {
  test("checkSystemHealth returns HealthReport structure", async () => {
    const report = await checkSystemHealth();

    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("services");
    expect(report).toHaveProperty("apis");
    expect(report).toHaveProperty("databases");
    expect(report).toHaveProperty("configs");
    expect(report).toHaveProperty("overall");
    expect(["healthy", "degraded", "critical"]).toContain(report.overall);
  });

  // TODO: Test service status detection (mock launchctl output)
  // TODO: Test database accessibility (mock better-sqlite3)
  // TODO: Test config validation (mock file reads)
  // TODO: Test overall status derivation (critical/degraded/healthy)
  // TODO: Test observability logging (verify events table INSERT)
});

describe("health-check — external API SSRF guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes external API health checks through fetchWithSsrFGuard", async () => {
    const { fetchWithSsrFGuard } = await import("./net/fetch-guard.js");
    const { loadConfigWithValidationSync } = await import("./config-validator.js");
    const mockRelease = vi.fn().mockResolvedValue(undefined);

    // Provide a profile that maps to a known external API endpoint
    vi.mocked(loadConfigWithValidationSync).mockReturnValue({
      profiles: {
        "anthropic:default": {
          provider: "anthropic",
          key: "test-api-key",
        },
      },
    } as ReturnType<typeof loadConfigWithValidationSync>);

    vi.mocked(fetchWithSsrFGuard).mockResolvedValue({
      response: {
        ok: false,
        status: 401,
      } as unknown as Response,
      finalUrl: "https://api.anthropic.com/v1/messages",
      release: mockRelease,
    });

    // Stub local service fetch (localhost — not guarded, uses bare fetch)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const report = await checkSystemHealth();

    // Guard must have been called for the external (anthropic) API check
    expect(vi.mocked(fetchWithSsrFGuard)).toHaveBeenCalled();
    expect(vi.mocked(fetchWithSsrFGuard)).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.anthropic.com/v1/messages",
        auditContext: "health-check",
        init: expect.objectContaining({
          method: "GET",
        }),
      }),
    );

    // release() must be called (no dispatcher leak)
    expect(mockRelease).toHaveBeenCalled();

    // Report should include the anthropic api status
    const anthropicStatus = report.apis.find((a) => a.name === "anthropic");
    expect(anthropicStatus).toBeDefined();
    expect(typeof anthropicStatus?.available).toBe("boolean");

    vi.unstubAllGlobals();
  });
});
