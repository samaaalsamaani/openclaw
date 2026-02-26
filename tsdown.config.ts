import type { Plugin } from "rolldown";
import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

/**
 * Rolldown places its runtime helpers (__exportAll, __defProp, __require) in a single
 * "host" chunk. When that host chunk (e.g. `reply`) is also a hub that imports from many
 * other chunks, any chunk that needs __exportAll AND is imported by reply creates a
 * circular ESM dependency. Node.js evaluates the dependent chunk first (before
 * __exportAll is initialized), causing `TypeError: __exportAll is not a function`.
 *
 * This plugin detects chunks that import __exportAll from another chunk and inlines the
 * helper definitions directly, removing the circular import edge.
 */
function inlineRolldownRuntime(): Plugin {
  const RUNTIME_HELPERS = `var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
\tlet target = {};
\tfor (var name in all) {
\t\t__defProp(target, name, {
\t\t\tget: all[name],
\t\t\tenumerable: true
\t\t});
\t}
\tif (!no_symbols) {
\t\t__defProp(target, Symbol.toStringTag, { value: "Module" });
\t}
\treturn target;
};`;

  return {
    name: "inline-rolldown-runtime",
    renderChunk(code, chunk) {
      // Only process non-entry chunks that import __exportAll from another chunk
      if (!code.includes("__exportAll") || chunk.isEntry) {
        return null;
      }

      // Match: import { XX as __exportAll } from "./some-chunk.js";
      const importPattern =
        /import\s*\{[^}]*\b\w+\s+as\s+__exportAll\b[^}]*\}\s*from\s*"[^"]+"\s*;?\n?/;
      const match = code.match(importPattern);
      if (!match) {
        return null;
      }

      // Check if the import ONLY brings in runtime helpers (__exportAll, __defProp, __require).
      // If it imports other application symbols too, we can't just remove the whole line.
      const importContent = match[0];
      const bindingsMatch = importContent.match(/\{([^}]+)\}/);
      if (!bindingsMatch) {
        return null;
      }

      const bindings = bindingsMatch[1].split(",").map((b) => b.trim());
      const runtimeNames = new Set(["__exportAll", "__defProp", "__require"]);
      const allRuntime = bindings.every((binding) => {
        const asMatch = binding.match(/\w+\s+as\s+(\w+)/);
        const name = asMatch ? asMatch[1] : binding;
        return runtimeNames.has(name);
      });

      if (allRuntime) {
        // Remove the entire import and prepend inline helpers
        const modified = code.replace(match[0], "");
        return { code: RUNTIME_HELPERS + "\n" + modified };
      }

      // Import mixes runtime and application bindings — extract only the runtime ones
      const runtimeBindings: string[] = [];
      const appBindings: string[] = [];
      for (const binding of bindings) {
        const asMatch = binding.match(/\w+\s+as\s+(\w+)/);
        const name = asMatch ? asMatch[1] : binding;
        if (runtimeNames.has(name)) {
          runtimeBindings.push(binding);
        } else {
          appBindings.push(binding);
        }
      }

      if (runtimeBindings.length === 0) {
        return null;
      }

      // Reconstruct the import with only application bindings
      const fromMatch = importContent.match(/from\s*("[^"]+")/);
      if (!fromMatch) {
        return null;
      }
      const newImport = `import { ${appBindings.join(", ")} } from ${fromMatch[1]};`;
      const modified = code.replace(match[0], newImport + "\n");
      return { code: RUNTIME_HELPERS + "\n" + modified };
    },
  };
}

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
    plugins: [inlineRolldownRuntime()],
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
    plugins: [inlineRolldownRuntime()],
  },
  {
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
    env,
    fixedExtension: false,
    platform: "node",
    plugins: [inlineRolldownRuntime()],
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
    plugins: [inlineRolldownRuntime()],
  },
  {
    entry: "src/plugin-sdk/account-id.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
    plugins: [inlineRolldownRuntime()],
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
