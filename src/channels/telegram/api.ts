import { fetchWithSsrFGuard } from "../../infra/net/fetch-guard.js";
import { SsrFBlockedError } from "../../infra/net/ssrf.js";

export async function fetchTelegramChatId(params: {
  token: string;
  chatId: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const url = `https://api.telegram.org/bot${params.token}/getChat?chat_id=${encodeURIComponent(params.chatId)}`;
  let telegramRelease: (() => Promise<void>) | null = null;
  try {
    const guardResult = await fetchWithSsrFGuard({
      url,
      init: params.signal ? { signal: params.signal } : undefined,
      auditContext: "telegram-api",
    });
    telegramRelease = guardResult.release;
    const res = guardResult.response;
    if (!res.ok) {
      return null;
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { id?: number | string };
    } | null;
    const id = data?.ok ? data?.result?.id : undefined;
    if (typeof id === "number" || typeof id === "string") {
      return String(id);
    }
    return null;
  } catch (error) {
    if (error instanceof SsrFBlockedError) {
      throw error;
    }
    return null;
  } finally {
    if (telegramRelease) {
      await telegramRelease();
    }
  }
}
