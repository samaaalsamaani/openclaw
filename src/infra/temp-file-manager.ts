/**
 * Temp file manager for ARG_MAX mitigation.
 *
 * Use this to avoid ARG_MAX errors when passing large prompts to subprocess commands.
 * If content is < 10KB, pass inline. If >= 10KB, write to temp file and pass file path.
 *
 * @example
 * ```typescript
 * const result = await withTempFile(largePrompt, async (promptOrPath) => {
 *   const args = promptOrPath.length > ARG_MAX_THRESHOLD
 *     ? ["--prompt-file", promptOrPath]
 *     : ["--prompt", promptOrPath];
 *   return execCommand(args);
 * });
 * ```
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/** Conservative threshold for ARG_MAX (10KB) */
export const ARG_MAX_THRESHOLD = 10_000;

/**
 * Execute an operation with temp file fallback for large content.
 *
 * If content < 10KB, passes content directly to operation.
 * If content >= 10KB, writes to temp file, passes file path to operation, and cleans up in finally.
 *
 * @param content - String content to pass to operation
 * @param operation - Async function that receives either content string or file path
 * @returns Result of operation
 */
export async function withTempFile<T>(
  content: string,
  operation: (filePathOrContent: string) => Promise<T>,
): Promise<T> {
  if (content.length < ARG_MAX_THRESHOLD) {
    // Small content—pass inline
    return operation(content);
  }

  // Large content—use temp file
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `openclaw-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );

  try {
    await fs.writeFile(tmpFile, content, "utf-8");
    console.info(`[temp-file] Created ${tmpFile} for ${content.length} byte prompt`);
    return await operation(tmpFile);
  } finally {
    // Always cleanup
    try {
      await fs.unlink(tmpFile);
    } catch (cleanupError) {
      console.warn(`[temp-file] Failed to cleanup ${tmpFile}:`, cleanupError);
    }
  }
}
