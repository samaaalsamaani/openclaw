import fs from "node:fs/promises";
import notifier from "node-notifier";
import { loadAuthProfileStore } from "../agents/auth-profiles/store.js";
import type { AuthProfileStore, OAuthCredential } from "../agents/auth-profiles/types.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Provider-specific OAuth token endpoints for refresh flow.
 * Maps provider name to token endpoint URL.
 */
const OAUTH_TOKEN_ENDPOINTS: Record<string, string> = {
  codex: "https://auth.codex.com/oauth/token",
  late: "https://getlate.dev/api/v1/oauth/token",
  // Add more providers as needed
};

/**
 * Check all OAuth credentials in auth-profiles.json for expiry.
 * Sends notifications 7 days before expiry and attempts auto-refresh.
 */
export async function checkCredentialExpiry(storePath: string): Promise<void> {
  try {
    const store = loadAuthProfileStore();
    const now = Date.now();

    for (const [profileId, cred] of Object.entries(store.profiles)) {
      if (cred.type !== "oauth") {
        continue;
      }

      const oauthCred = cred;

      // Skip if expiresAt is undefined (unknown expiry)
      if (typeof oauthCred.expiresAt !== "number") {
        continue;
      }

      const timeUntilExpiry = oauthCred.expiresAt - now;

      // Already expired - attempt refresh immediately
      if (timeUntilExpiry <= 0) {
        console.log(`[credential-monitor] Credential expired: ${profileId}`);
        await attemptRefresh(profileId, oauthCred, store, storePath);
        continue;
      }

      // Expiring within 7 days - notify and attempt refresh
      if (timeUntilExpiry <= SEVEN_DAYS_MS) {
        const daysLeft = Math.ceil(timeUntilExpiry / (24 * 60 * 60 * 1000));
        console.log(`[credential-monitor] Credential expiring in ${daysLeft} days: ${profileId}`);
        sendExpiryNotification(profileId, daysLeft);
        await attemptRefresh(profileId, oauthCred, store, storePath);
      }
    }
  } catch (err) {
    console.error("[credential-monitor] Failed to check credential expiry:", err);
  }
}

/**
 * Attempt to refresh an OAuth credential using its refresh token.
 * Updates auth-profiles.json atomically on success.
 */
export async function attemptRefresh(
  profileId: string,
  cred: OAuthCredential,
  store: AuthProfileStore,
  storePath: string,
): Promise<void> {
  // Check if refresh token exists
  if (!cred.refresh) {
    console.log(`[credential-monitor] No refresh token for ${profileId}, manual renewal required`);
    sendManualRenewalNotification(profileId, cred.provider);
    return;
  }

  try {
    console.log(`[credential-monitor] Attempting to refresh ${profileId}...`);
    const refreshed = await refreshOAuthToken(cred);

    // Update credentials in store
    const updatedCred: OAuthCredential = {
      ...cred,
      access: refreshed.access,
      expiresAt: refreshed.expiresAt,
      refresh: refreshed.refresh ?? cred.refresh, // Use new refresh token if rotated
    };

    store.profiles[profileId] = updatedCred;

    // Atomic save: write to temp file, then rename
    const tempPath = `${storePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", "utf8");
    await fs.chmod(tempPath, 0o600);
    await fs.rename(tempPath, storePath);

    console.log(`[credential-monitor] Successfully refreshed ${profileId}`);
  } catch (err) {
    console.error(`[credential-monitor] Failed to refresh ${profileId}:`, err);
    sendManualRenewalNotification(profileId, cred.provider);
  }
}

/**
 * Refresh an OAuth token using the refresh token flow (RFC 6749 Section 6).
 * Returns updated credentials with new access token and expiry.
 */
export async function refreshOAuthToken(cred: OAuthCredential): Promise<{
  access: string;
  refresh?: string;
  expiresAt: number;
}> {
  const tokenEndpoint = OAUTH_TOKEN_ENDPOINTS[cred.provider];

  if (!tokenEndpoint) {
    throw new Error(`No OAuth token endpoint configured for provider: ${cred.provider}`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cred.refresh ?? "",
    ...(cred.clientId ? { client_id: cred.clientId } : {}),
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OAuth refresh failed (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };

  if (!data.access_token) {
    throw new Error("OAuth refresh response missing access_token");
  }

  const expiresIn = data.expires_in ?? 3600; // Default to 1 hour if not specified
  const expiresAt = Date.now() + expiresIn * 1000;

  return {
    access: data.access_token,
    refresh: data.refresh_token, // May be undefined if not rotated
    expiresAt,
  };
}

/**
 * Send macOS notification about upcoming credential expiry.
 */
export function sendExpiryNotification(profileId: string, daysLeft: number): void {
  notifier.notify({
    title: "PAIOS Credential Expiry",
    message: `${profileId} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    sound: true,
  });
}

/**
 * Send macOS notification about manual renewal requirement.
 * Opens documentation URL on click.
 */
export function sendManualRenewalNotification(profileId: string, provider: string): void {
  notifier.notify({
    title: "PAIOS Manual Renewal Required",
    message: `${profileId} needs re-authentication`,
    sound: true,
    open: `https://docs.paios.ai/auth/${provider}`,
  });
}
