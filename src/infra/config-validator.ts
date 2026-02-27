/**
 * Config validation with automatic backup restore
 *
 * Validates JSON config files using Zod schemas. On corruption, automatically
 * restores from most recent valid backup. Strict mode rejects unknown keys to
 * catch typos like "modles" instead of "models".
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// ── Zod Schemas (strict mode) ─────────────────────────────────────────

/**
 * LLM config schema (llm-config.json)
 *
 * Validates structure of unified model configuration with strict mode enabled.
 * Rejects unknown keys to catch typos (e.g., "modles" → validation error).
 */
export const LlmConfigSchema = z
  .object({
    version: z.number(),
    models: z.record(z.string(), z.unknown()),
    tiers: z.record(z.string(), z.unknown()),
    routing: z.record(z.string(), z.unknown()).optional(),
    subsystems: z.record(z.string(), z.unknown()).optional(),
    overrides: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type LlmConfig = z.infer<typeof LlmConfigSchema>;

/**
 * Auth profiles schema (auth-profiles.json)
 *
 * Validates authentication credential store structure with strict mode enabled.
 * Matches AuthProfileStore type from auth-profiles/types.ts.
 */
export const AuthProfilesSchema = z
  .object({
    version: z.number(),
    profiles: z.record(z.string(), z.unknown()),
    order: z.record(z.string(), z.array(z.string())).optional(),
    lastGood: z.record(z.string(), z.string()).optional(),
    usageStats: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type AuthProfiles = z.infer<typeof AuthProfilesSchema>;

/**
 * OpenClaw config schema (openclaw.json)
 *
 * Placeholder schema using passthrough object since full schema is 100+ fields.
 * Passthrough allows any keys but ensures it's an object (catches non-object corruption).
 */
export const OpenClawConfigSchema = z.object({}).passthrough();

export type OpenClawConfig = z.infer<typeof OpenClawConfigSchema>;

// ── Backup Discovery ──────────────────────────────────────────────────

/**
 * Find backup files matching a pattern.
 *
 * @param backupDir Directory containing backup files
 * @param baseName Base filename (e.g., "llm-config.json")
 * @returns Array of backup file paths sorted by modification time (newest first)
 *
 * @example
 * ```typescript
 * const backups = findBackups("/path/to/backups", "llm-config.json");
 * // Returns: ["/path/to/backups/llm-config.json.bak.1", ...]
 * ```
 */
export function findBackups(backupDir: string, baseName: string): string[] {
  const backups: Array<{ path: string; mtime: number }> = [];

  // Look for numbered backups (.bak.1, .bak.2, etc.)
  for (let i = 1; i <= 10; i += 1) {
    const backupPath = join(backupDir, `${baseName}.bak.${i}`);
    try {
      const stat = statSync(backupPath);
      backups.push({ path: backupPath, mtime: stat.mtimeMs });
    } catch {
      // Backup doesn't exist, continue
    }
  }

  // Also check for .bak without number
  const bakPath = join(backupDir, `${baseName}.bak`);
  try {
    const stat = statSync(bakPath);
    backups.push({ path: bakPath, mtime: stat.mtimeMs });
  } catch {
    // No .bak file
  }

  // Sort by modification time (newest first)
  backups.sort((a, b) => b.mtime - a.mtime);

  return backups.map((b) => b.path);
}

// ── Validation with Backup Restore ────────────────────────────────────

/**
 * Load and validate a config file with automatic backup restore (synchronous).
 *
 * On successful validation: Returns parsed config.
 * On validation failure: Tries backups (newest first) until finding a valid one.
 *   If valid backup found: Logs warning and returns it.
 *   If no valid backup: Throws error with context.
 *
 * @param path Path to config file
 * @param schema Zod schema for validation
 * @param backupDir Directory containing backup files (defaults to same dir as config)
 * @returns Validated config object
 * @throws Error if config and all backups are invalid
 *
 * @example
 * ```typescript
 * import { LlmConfigSchema } from "./config-validator.js";
 *
 * const config = loadConfigWithValidationSync(
 *   "/path/to/llm-config.json",
 *   LlmConfigSchema,
 *   "/path/to/backups"
 * );
 * ```
 */
export function loadConfigWithValidationSync<T>(
  path: string,
  schema: z.ZodType<T>,
  backupDir?: string,
): T {
  const dir = backupDir ?? join(path, "..");
  const baseName = path.split("/").pop() ?? "config.json";

  // Try loading and validating the main config file
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    const validated = schema.parse(parsed);
    return validated;
  } catch (mainError) {
    // Main config is invalid - try backups
    const backups = findBackups(dir, baseName);

    for (const backupPath of backups) {
      try {
        const raw = readFileSync(backupPath, "utf-8");
        const parsed = JSON.parse(raw);
        const validated = schema.parse(parsed);

        // Found a valid backup - log warning and restore
        console.warn(
          `[config-validator] Config ${path} invalid, restoring from backup ${backupPath}`,
        );

        // Write validated backup back to main config file
        // Note: Skip rotation in sync version to avoid async complexity
        writeFileSync(path, JSON.stringify(validated, null, 2), "utf8");

        return validated;
      } catch {
        // This backup is also invalid, try next one
        continue;
      }
    }

    // No valid backups found - throw error with context
    const errorMsg =
      mainError instanceof z.ZodError
        ? `Validation failed: ${
            // Zod errors are typed as unknown[] but we know the structure
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mainError as any).errors
              .map((e: { path: string[]; message: string }) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")
          }`
        : mainError instanceof Error
          ? mainError.message
          : String(mainError);

    throw new Error(
      `Config validation failed for ${path} and no valid backups found. ${errorMsg}`,
      { cause: mainError },
    );
  }
}

/**
 * Load and validate a config file with automatic backup restore (async).
 *
 * Same as loadConfigWithValidationSync but async version for use in async contexts.
 *
 * @param path Path to config file
 * @param schema Zod schema for validation
 * @param backupDir Directory containing backup files (defaults to same dir as config)
 * @returns Promise of validated config object
 * @throws Error if config and all backups are invalid
 */
export async function loadConfigWithValidation<T>(
  path: string,
  schema: z.ZodType<T>,
  backupDir?: string,
): Promise<T> {
  const dir = backupDir ?? join(path, "..");
  const baseName = path.split("/").pop() ?? "config.json";

  // Try loading and validating the main config file
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    const validated = schema.parse(parsed);
    return validated;
  } catch (mainError) {
    // Main config is invalid - try backups
    const backups = findBackups(dir, baseName);

    for (const backupPath of backups) {
      try {
        const raw = readFileSync(backupPath, "utf-8");
        const parsed = JSON.parse(raw);
        const validated = schema.parse(parsed);

        // Found a valid backup - log warning and restore
        console.warn(
          `[config-validator] Config ${path} invalid, restoring from backup ${backupPath}`,
        );

        // Write validated backup back to main config file
        // Note: Sync version doesn't rotate to avoid async complexity
        writeFileSync(path, JSON.stringify(validated, null, 2), "utf8");

        return validated;
      } catch {
        // This backup is also invalid, try next one
        continue;
      }
    }

    // No valid backups found - throw error with context
    const errorMsg =
      mainError instanceof z.ZodError
        ? `Validation failed: ${
            // Zod errors are typed as unknown[] but we know the structure
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (mainError as any).errors
              .map((e: { path: string[]; message: string }) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")
          }`
        : mainError instanceof Error
          ? mainError.message
          : String(mainError);

    throw new Error(
      `Config validation failed for ${path} and no valid backups found. ${errorMsg}`,
      { cause: mainError },
    );
  }
}
