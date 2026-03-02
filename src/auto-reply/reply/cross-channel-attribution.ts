export type AttributionSource = {
  channel: string; // "telegram", "discord", "slack", etc.
  mtimeMs: number; // file mtime for relative time
};

/**
 * Builds a footer attribution string for cross-channel context.
 * Returns "" when no sources are provided.
 * Format: "\n\n— drawing on context from Telegram (3 days ago)"
 * Multi-source: "\n\n— drawing on context from Telegram (3 days ago), Slack (1 week ago)"
 */
export function buildAttributionFooter(sources: AttributionSource[]): string {
  if (sources.length === 0) {
    return "";
  }
  const parts = sources.map((s) => `${capitalize(s.channel)} (${relativeTime(s.mtimeMs)})`);
  return `\n\n— drawing on context from ${parts.join(", ")}`;
}

function capitalize(s: string): string {
  if (!s) {
    return s;
  }
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
