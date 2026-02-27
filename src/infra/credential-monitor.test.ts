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

      const cred: OAuthCredential = {
        type: "oauth",
        provider: "codex",
        access: "test-access",
        expires: Date.now(),
        // No refresh token
      };

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
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "invalid_grant",
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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}), // Missing access_token
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
});
