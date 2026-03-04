import { describe, expect, it, vi } from "vitest";

describe("graph-context hook", () => {
  it("exports a default function", async () => {
    // Mock neo4j-driver to avoid real connection in tests
    vi.mock("neo4j-driver", () => ({
      default: {
        driver: vi.fn().mockReturnValue({
          session: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ records: [] }),
            close: vi.fn().mockResolvedValue(undefined),
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        auth: { basic: vi.fn().mockReturnValue({}) },
      },
    }));

    const mod = await import("./handler.js");
    expect(typeof mod.default).toBe("function");
  });

  it("ignores non-message events", async () => {
    const mod = await import("./handler.js");
    const fakeEvent = { type: "agent", action: "bootstrap", context: {} } as never;
    await expect(mod.default(fakeEvent)).resolves.toBeUndefined();
  });

  it("handles message:received without throwing", async () => {
    const mod = await import("./handler.js");
    const fakeEvent = {
      type: "message",
      action: "received",
      context: { content: "This is a long enough message for processing", channelId: "telegram" },
    } as never;
    await expect(mod.default(fakeEvent)).resolves.toBeUndefined();
  });

  it("skips messages shorter than 10 chars", async () => {
    const mod = await import("./handler.js");
    const fakeEvent = {
      type: "message",
      action: "received",
      context: { content: "short", channelId: "telegram" },
    } as never;
    await expect(mod.default(fakeEvent)).resolves.toBeUndefined();
  });
});
