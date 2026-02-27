/**
 * Tests for config validation with backup restore
 *
 * Validates Zod schema behavior, strict mode enforcement, and module exports.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AuthProfilesSchema,
  LlmConfigSchema,
  OpenClawConfigSchema,
  findBackups,
  loadConfigWithValidation,
} from "./config-validator.js";

describe("config-validator", () => {
  describe("module exports", () => {
    it("should export LlmConfigSchema", () => {
      expect(LlmConfigSchema).toBeDefined();
      expect(LlmConfigSchema instanceof z.ZodType).toBe(true);
    });

    it("should export AuthProfilesSchema", () => {
      expect(AuthProfilesSchema).toBeDefined();
      expect(AuthProfilesSchema instanceof z.ZodType).toBe(true);
    });

    it("should export OpenClawConfigSchema", () => {
      expect(OpenClawConfigSchema).toBeDefined();
      expect(OpenClawConfigSchema instanceof z.ZodType).toBe(true);
    });

    it("should export loadConfigWithValidation function", () => {
      expect(typeof loadConfigWithValidation).toBe("function");
    });

    it("should export findBackups function", () => {
      expect(typeof findBackups).toBe("function");
    });
  });

  describe("LlmConfigSchema validation", () => {
    it("should accept valid llm-config structure", () => {
      const validConfig = {
        version: 1,
        models: {
          "anthropic/claude-sonnet-4-6": { provider: "anthropic", apiModelId: "claude-sonnet-4-6" },
        },
        tiers: {
          fast: { primary: "anthropic/claude-sonnet-4-6" },
        },
      };

      const result = LlmConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("should reject config with missing required fields", () => {
      const invalidConfig = {
        version: 1,
        models: {},
        // Missing 'tiers' field
      };

      const result = LlmConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("should reject config with unknown keys (strict mode)", () => {
      const invalidConfig = {
        version: 1,
        models: {},
        tiers: {},
        unknownField: "should fail",
      };

      const result = LlmConfigSchema.safeParse(invalidConfig);

      // Strict mode should reject unknown keys
      expect(result.success).toBe(false);
    });
  });

  describe("AuthProfilesSchema validation", () => {
    it("should accept valid auth-profiles structure", () => {
      const validConfig = {
        version: 1,
        profiles: {
          anthropic: { type: "api_key", provider: "anthropic", key: "sk-ant-..." },
        },
      };

      const result = AuthProfilesSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("should accept auth-profiles with optional fields", () => {
      const validConfig = {
        version: 1,
        profiles: {},
        order: { agent1: ["anthropic", "openai"] },
        lastGood: { agent1: "anthropic" },
        usageStats: { anthropic: { lastUsed: 1234567890 } },
      };

      const result = AuthProfilesSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("should reject config with unknown keys (strict mode)", () => {
      const invalidConfig = {
        version: 1,
        profiles: {},
        invalidKey: true,
      };

      const result = AuthProfilesSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("OpenClawConfigSchema validation", () => {
    it("should accept any record structure", () => {
      const validConfig = {
        gateway: { mode: "app" },
        agents: [{ id: "test" }],
      };

      const result = OpenClawConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("should reject non-object values", () => {
      const invalidConfig = "not an object";

      const result = OpenClawConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("findBackups", () => {
    it("should have correct function signature", () => {
      expect(findBackups.length).toBe(2);
    });

    it("should return array", () => {
      // Call with non-existent directory should return empty array
      const result = findBackups("/nonexistent", "test.json");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("loadConfigWithValidation", () => {
    it("should have correct function signature", () => {
      expect(loadConfigWithValidation.length).toBe(3);
    });

    it("should return Promise", () => {
      const schema = z.object({ version: z.number() });
      const result = loadConfigWithValidation("/nonexistent.json", schema);
      expect(result instanceof Promise).toBe(true);

      // Clean up the promise to avoid unhandled rejection
      result.catch(() => {
        // Expected to fail for non-existent file
      });
    });
  });
});
