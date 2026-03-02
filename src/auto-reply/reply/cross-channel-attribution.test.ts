import { describe, expect, it } from "vitest";
import { buildAttributionFooter } from "./cross-channel-attribution.js";

describe("buildAttributionFooter", () => {
  it("returns empty string for empty sources array", () => {
    expect(buildAttributionFooter([])).toBe("");
  });

  it("returns footer for a single source", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "telegram", mtimeMs: threeDaysAgo }]);
    expect(result).toBe("\n\n— drawing on context from Telegram (3 days ago)");
  });

  it("returns footer listing all sources for multiple sources", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([
      { channel: "telegram", mtimeMs: threeDaysAgo },
      { channel: "slack", mtimeMs: oneWeekAgo },
    ]);
    expect(result).toBe("\n\n— drawing on context from Telegram (3 days ago), Slack (1 week ago)");
  });

  it("capitalizes channel names (telegram → Telegram)", () => {
    const now = Date.now();
    const result = buildAttributionFooter([{ channel: "telegram", mtimeMs: now }]);
    expect(result).toContain("Telegram");
  });

  it("capitalizes discord channel name", () => {
    const now = Date.now();
    const result = buildAttributionFooter([{ channel: "discord", mtimeMs: now }]);
    expect(result).toContain("Discord");
  });

  it("formats single source with relative time — today", () => {
    const now = Date.now() - 1000; // 1 second ago
    const result = buildAttributionFooter([{ channel: "slack", mtimeMs: now }]);
    expect(result).toBe("\n\n— drawing on context from Slack (today)");
  });

  it("formats single source with relative time — yesterday", () => {
    const yesterday = Date.now() - 1 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "slack", mtimeMs: yesterday }]);
    expect(result).toBe("\n\n— drawing on context from Slack (yesterday)");
  });

  it("formats single source with relative time — N days ago", () => {
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "discord", mtimeMs: fiveDaysAgo }]);
    expect(result).toBe("\n\n— drawing on context from Discord (5 days ago)");
  });

  it("formats single source with relative time — N weeks ago", () => {
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "telegram", mtimeMs: twoWeeksAgo }]);
    expect(result).toBe("\n\n— drawing on context from Telegram (2 weeks ago)");
  });

  it("formats single source with relative time — 1 week ago", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "telegram", mtimeMs: eightDaysAgo }]);
    expect(result).toBe("\n\n— drawing on context from Telegram (1 week ago)");
  });

  it("formats single source with relative time — N months ago", () => {
    const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "slack", mtimeMs: twoMonthsAgo }]);
    expect(result).toBe("\n\n— drawing on context from Slack (2 months ago)");
  });

  it("formats single source with relative time — 1 month ago", () => {
    const oneMonthAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "slack", mtimeMs: oneMonthAgo }]);
    expect(result).toBe("\n\n— drawing on context from Slack (1 month ago)");
  });

  it("footer starts with newline-newline separator", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const result = buildAttributionFooter([{ channel: "telegram", mtimeMs: threeDaysAgo }]);
    expect(result.startsWith("\n\n")).toBe(true);
  });
});
