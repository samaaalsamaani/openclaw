import type { CrossChannelSearchResult } from "../../memory/cross-channel-indexer.js";
import { CrossChannelIndexer } from "../../memory/cross-channel-indexer.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";

const CROSS_CHANNEL_TIMEOUT_MS = 400;
const CROSS_CHANNEL_CHAR_BUDGET = 4000; // ~1000 tokens
const CROSS_CHANNEL_MAX_CHUNKS = 5;

export type CrossChannelContextResult = {
  /** Ready-to-inject prompt text, or "" if nothing relevant */
  section: string;
  /** For attribution (Plan 03) */
  sources: Array<{ channel: string; mtimeMs: number }>;
};

export async function queryCrossChannelContext(params: {
  query: string;
  sessionKey: string; // current session key — used to extract current channel
  agentId: string;
  timeoutMs?: number; // default 400
}): Promise<CrossChannelContextResult> {
  const empty: CrossChannelContextResult = { section: "", sources: [] };

  // Guard: skip short queries and slash commands
  if (!params.query || params.query.length < 10 || params.query.startsWith("/")) {
    return empty;
  }

  const timeout = params.timeoutMs ?? CROSS_CHANNEL_TIMEOUT_MS;

  try {
    return await Promise.race([
      doSearch(params),
      new Promise<CrossChannelContextResult>((resolve) =>
        setTimeout(() => resolve(empty), timeout),
      ),
    ]);
  } catch {
    return empty;
  }
}

async function doSearch(params: {
  query: string;
  sessionKey: string;
  agentId: string;
}): Promise<CrossChannelContextResult> {
  const empty: CrossChannelContextResult = { section: "", sources: [] };

  // Extract current channel from sessionKey
  const currentChannel =
    parseAgentSessionKey(params.sessionKey)?.rest.split(":")[0]?.trim().toLowerCase() ?? undefined;

  // Ensure the indexer is started (idempotent — safe to call on every request)
  const indexer = CrossChannelIndexer.getInstance(params.agentId);
  indexer.start();

  const results = indexer.search({
    query: params.query,
    excludeChannel: currentChannel,
    maxResults: CROSS_CHANNEL_MAX_CHUNKS,
    charBudget: CROSS_CHANNEL_CHAR_BUDGET,
  });

  if (results.length === 0) {
    return empty;
  }

  const lines = results.map(
    (r: CrossChannelSearchResult) =>
      `[From ${capitalize(r.channel)}, ${relativeTime(r.mtimeMs)}]: ${r.snippet}`,
  );
  const section = `--- CROSS-CHANNEL CONTEXT ---\n${lines.join("\n")}`;

  return {
    section,
    sources: results.map((r: CrossChannelSearchResult) => ({
      channel: r.channel,
      mtimeMs: r.mtimeMs,
    })),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeTime(mtimeMs: number): string {
  const ageMs = Date.now() - mtimeMs;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (days < 1) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks === 1) {
    return "1 week ago";
  }
  if (weeks < 5) {
    return `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}
