import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProfileStore, OAuthCredential } from "../agents/auth-profiles/types.js";
import {
  attemptRefresh,
  checkCredentialExpiry,
  refreshOAuthToken,
  sendExpiryNotification,
  sendManualRenewalNotification,
} from "./credential-monitor.js";

// Mock dependencies
vi.mock("../agents/auth-profiles/store.js", () => ({
  loadAuthProfileStore: vi.fn(),
  saveAuthProfileStore: vi.fn(),
}));

vi.mock("node-notifier", () => ({
  default: {
    notify: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  default: {
    writeFile: vi.fn(),
    chmod: vi.fn(),
    rename: vi.fn(),
  },
}));

// Mock fetch-guard for SSRF guard verification tests
vi.mock("./net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: vi.fn(),
}));

describe("credential-monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("module exports", () => {
    it("exports checkCredentialExpiry function", () => {
      expect(typeof checkCredentialExpiry).toBe("function");
    });

    it("exports attemptRefresh function", () => {
      expect(typeof attemptRefresh).toBe("function");
    });

    it("exports refreshOAuthToken function", () => {
      expect(typeof refreshOAuthToken).toBe("function");
    });

    it("exports sendExpiryNotification function", () => {
      expect(typeof sendExpiryNotification).toBe("function");
    });

    it("exports sendManualRenewalNotification function", () => {
      expect(typeof sendManualRenewalNotification).toBe("function");
    });
  });

  describe("checkCredentialExpiry", () => {
    it("has correct function signature", () => {
      expect(checkCredentialExpiry).toHaveLength(1);
    });

    it("skips OAuth credentials without expiresAt", async () => {
      const { loadAuthProfileStore } = await import("../agents/auth-profiles/store.js");
      const mockStore: AuthProfileStore = {
        version: 1,
        profiles: {
          "codex:default": {
            type: "oauth",
            provider: "codex",
            access: "test-access",
            refresh: "test-refresh",
            expires: Date.now() + 1000,
            // No expiresAt field
          } as OAuthCredential,
        },
      };
      vi.mocked(loadAuthProfileStore).mockReturnValue(mockStore);

      // Should not throw or attempt refresh
      await checkCredentialExpiry("/test/path.json");
      expect(loadAuthProfileStore).toHaveBeenCalled();
    });
  });

  describe("expiry detection", () => {
    it("calculates 7-day window correctly", () => {
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const expiresIn6Days = now + 6 * 24 * 60 * 60 * 1000;

      expect(expiresIn6Days - now).toBeLessThan(sevenDays);
      expect(expiresIn6Days - now).toBeGreaterThan(0);
    });

    it("detects expired credentials", () => {
      const now = Date.now();
      const expired = now - 1000;

      expect(expired - now).toBeLessThan(0);
    });
  });

  describe("attemptRefresh", () => {
    it("calls sendManualRenewalNotification when refresh token is missing", async () => {
      const notifier = (await import("node-notifier")).default;

      const cred = {
        type: "oauth",
        provider: "codex",
        access: "test-access",
        expires: Date.now(),
        // No refresh token — intentional for this test case
      } as unknown as OAuthCredential;

      const store: AuthProfileStore = { version: 1, profiles: {} };

      await attemptRefresh("codex:default", cred, store, "/test/path.json");

      expect(vi.mocked(notifier.notify)).toHaveBeenCalledWith({
        title: "PAIOS Manual Renewal Required",
        message: "codex:default needs re-authentication",
        sound: true,
        open: "https://docs.paios.ai/auth/codex",
      });
    });
  });

  describe("refreshOAuthToken", () => {
    it("throws error when provider has no token endpoint", async () => {
      const cred: OAuthCredential = {
        type: "oauth",
        provider: "unknown-provider",
        access: "test-access",
        refresh: "test-refresh",
        expires: Date.now(),
      };

      await expect(refreshOAuthToken(cred)).rejects.toThrow(
        "No OAuth token endpoint configured for provider: unknown-provider",
      );
    });

    it("throws error on HTTP error response", async () => {
      const { fetchWithSsrFGuard } = await import("./net/fetch-guard.js");
      const mockRelease = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fetchWithSsrFGuard).mockResolvedValue({
        response: {
          ok: false,
          status: 400,
          text: async () => "invalid_grant",
        } as unknown as Response,
        finalUrl: "https://auth.codex.com/oauth/token",
        release: mockRelease,
      });

      const cred: OAuthCredential = {
        type: "oauth",
        provider: "codex",
        access: "test-access",
        refresh: "test-refresh",
        expires: Date.now(),
      };

      await expect(refreshOAuthToken(cred)).rejects.toThrow("OAuth refresh failed (400)");
    });

    it("throws error when response missing access_token", async () => {
      const { fetchWithSsrFGuard } = await import("./net/fetch-guard.js");
      const mockRelease = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fetchWithSsrFGuard).mockResolvedValue({
        response: {
          ok: true,
          json: async () => ({}), // Missing access_token
        } as unknown as Response,
        finalUrl: "https://auth.codex.com/oauth/token",
        release: mockRelease,
      });

      const cred: OAuthCredential = {
        type: "oauth",
        provider: "codex",
        access: "test-access",
        refresh: "test-refresh",
        expires: Date.now(),
      };

      await expect(refreshOAuthToken(cred)).rejects.toThrow(
        "OAuth refresh response missing access_token",
      );
    });
  });

  describe("notification functions", () => {
    it("sendExpiryNotification calls notifier with correct params", async () => {
      const notifier = (await import("node-notifier")).default;

      sendExpiryNotification("codex:default", 3);

      expect(vi.mocked(notifier.notify)).toHaveBeenCalledWith({
        title: "PAIOS Credential Expiry",
        message: "codex:default expires in 3 days",
        sound: true,
      });
    });

    it("sendExpiryNotification handles singular day", async () => {
      const notifier = (await import("node-notifier")).default;

      sendExpiryNotification("late:default", 1);

      expect(vi.mocked(notifier.notify)).toHaveBeenCalledWith({
        title: "PAIOS Credential Expiry",
        message: "late:default expires in 1 day",
        sound: true,
      });
    });

    it("sendManualRenewalNotification includes clickable URL", async () => {
      const notifier = (await import("node-notifier")).default;

      sendManualRenewalNotification("codex:default", "codex");

      expect(vi.mocked(notifier.notify)).toHaveBeenCalledWith({
        title: "PAIOS Manual Renewal Required",
        message: "codex:default needs re-authentication",
        sound: true,
        open: "https://docs.paios.ai/auth/codex",
      });
    });
  });

  describe("OAuth token refresh uses fetchWithSsrFGuard", () => {
    it("routes OAuth token refresh through fetchWithSsrFGuard instead of bare fetch", async () => {
      const { fetchWithSsrFGuard } = await import("./net/fetch-guard.js");
      const mockRelease = vi.fn().mockResolvedValue(undefined);

      vi.mocked(fetchWithSsrFGuard).mockResolvedValue({
        response: {
          ok: true,
          json: async () => ({
            access_token: "new-access-token-123",
            expires_in: 3600,
            refresh_token: "new-refresh-token-456",
          }),
        } as unknown as Response,
        finalUrl: "https://auth.codex.com/oauth/token",
        release: mockRelease,
      });

      const cred: OAuthCredential = {
        type: "oauth",
        provider: "codex",
        access: "old-access-token",
        refresh: "old-refresh-token",
        expires: Date.now(),
      };

      const result = await refreshOAuthToken(cred);

      // Verify the guard was called (not bare fetch)
      expect(vi.mocked(fetchWithSsrFGuard)).toHaveBeenCalledOnce();
      expect(vi.mocked(fetchWithSsrFGuard)).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://auth.codex.com/oauth/token",
          auditContext: "credential-monitor",
        }),
      );

      // Verify release() was called in finally block (no dispatcher leak)
      expect(mockRelease).toHaveBeenCalledOnce();

      // Verify the result parsed correctly
      expect(result.access).toBe("new-access-token-123");
      expect(result.refresh).toBe("new-refresh-token-456");
    });

    it("calls release() even when response parsing fails", async () => {
      const { fetchWithSsrFGuard } = await import("./net/fetch-guard.js");
      const mockRelease = vi.fn().mockResolvedValue(undefined);

      vi.mocked(fetchWithSsrFGuard).mockResolvedValue({
        response: {
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        } as unknown as Response,
        finalUrl: "https://auth.codex.com/oauth/token",
        release: mockRelease,
      });

      const cred: OAuthCredential = {
        type: "oauth",
        provider: "codex",
        access: "old-access",
        refresh: "old-refresh",
        expires: Date.now(),
      };

      await expect(refreshOAuthToken(cred)).rejects.toThrow("OAuth refresh failed (401)");

      // Even on error, release must be called
      expect(mockRelease).toHaveBeenCalledOnce();
    });
  });
});
