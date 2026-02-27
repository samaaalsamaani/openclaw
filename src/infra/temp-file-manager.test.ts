import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ARG_MAX_THRESHOLD, withTempFile } from "./temp-file-manager.js";

describe("temp-file-manager", () => {
  let createdFiles: string[] = [];

  beforeEach(() => {
    createdFiles = [];
  });

  afterEach(async () => {
    // Clean up any leftover temp files
    for (const file of createdFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // Ignore errors (file may already be cleaned up)
      }
    }
  });

  it("passes small content inline (no file created)", async () => {
    const smallContent = "small prompt";
    let receivedContent: string | undefined;

    const result = await withTempFile(smallContent, async (filePathOrContent) => {
      receivedContent = filePathOrContent;
      return "success";
    });

    expect(result).toBe("success");
    expect(receivedContent).toBe(smallContent);
    // Verify it's not a file path
    expect(receivedContent?.includes(path.sep)).toBe(false);
  });

  it("creates temp file for large content (>10KB)", async () => {
    const largeContent = "x".repeat(ARG_MAX_THRESHOLD + 1000);
    let receivedPath: string | undefined;

    const result = await withTempFile(largeContent, async (filePathOrContent) => {
      receivedPath = filePathOrContent;
      createdFiles.push(filePathOrContent);

      // Verify file exists and contains correct content
      const fileContent = await fs.readFile(filePathOrContent, "utf-8");
      expect(fileContent).toBe(largeContent);

      return "success";
    });

    expect(result).toBe("success");
    expect(receivedPath).toBeDefined();
    expect(receivedPath?.includes("openclaw-prompt-")).toBe(true);
  });

  it("cleans up temp file after successful operation", async () => {
    const largeContent = "x".repeat(ARG_MAX_THRESHOLD + 1000);
    let tempFilePath: string | undefined;

    await withTempFile(largeContent, async (filePathOrContent) => {
      tempFilePath = filePathOrContent;
      // File should exist during operation
      const exists = await fs.access(filePathOrContent).then(
        () => true,
        () => false,
      );
      expect(exists).toBe(true);
      return "success";
    });

    // File should be cleaned up after operation
    expect(tempFilePath).toBeDefined();
    const existsAfter = await fs.access(tempFilePath!).then(
      () => true,
      () => false,
    );
    expect(existsAfter).toBe(false);
  });

  it("cleans up temp file after failed operation", async () => {
    const largeContent = "x".repeat(ARG_MAX_THRESHOLD + 1000);
    let tempFilePath: string | undefined;

    try {
      await withTempFile(largeContent, async (filePathOrContent) => {
        tempFilePath = filePathOrContent;
        throw new Error("Operation failed");
      });
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("Operation failed");
    }

    // File should be cleaned up even after error
    expect(tempFilePath).toBeDefined();
    const existsAfter = await fs.access(tempFilePath!).then(
      () => true,
      () => false,
    );
    expect(existsAfter).toBe(false);
  });

  it("generates collision-resistant temp file names", async () => {
    const largeContent = "x".repeat(ARG_MAX_THRESHOLD + 1000);
    const paths: string[] = [];

    // Create multiple temp files in parallel
    await Promise.all([
      withTempFile(largeContent, async (path) => {
        paths.push(path);
        return "success";
      }),
      withTempFile(largeContent, async (path) => {
        paths.push(path);
        return "success";
      }),
      withTempFile(largeContent, async (path) => {
        paths.push(path);
        return "success";
      }),
    ]);

    // All paths should be unique
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(3);

    // All paths should contain timestamp and random suffix pattern
    for (const p of paths) {
      expect(p).toMatch(/openclaw-prompt-\d+-[a-z0-9]+\.txt$/);
    }
  });

  it("handles cleanup errors gracefully (logs warning, doesn't throw)", async () => {
    const largeContent = "x".repeat(ARG_MAX_THRESHOLD + 1000);
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await withTempFile(largeContent, async (filePathOrContent) => {
      // Delete file early to trigger cleanup error
      await fs.unlink(filePathOrContent);
      return "success";
    });

    // Should have logged warning about cleanup failure
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[temp-file] Failed to cleanup"),
      expect.anything(),
    );

    consoleWarnSpy.mockRestore();
  });
});
