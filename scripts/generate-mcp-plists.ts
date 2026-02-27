#!/usr/bin/env node
/**
 * Generate launchd plist files for MCP server daemons
 * Run: bun scripts/generate-mcp-plists.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { buildLaunchAgentPlist } from "../src/daemon/launchd-plist.js";

const HOME = process.env.HOME || "/Users/user";
const CRON_DIR = path.join(HOME, ".openclaw", "cron");
const LOGS_DIR = path.join(HOME, ".openclaw", "logs");

interface McpServerConfig {
  name: string;
  label: string;
  serverPath: string;
  workingDirectory: string;
  port: number;
}

const mcpServers: McpServerConfig[] = [
  {
    name: "kb",
    label: "ai.openclaw.mcp-kb-server",
    serverPath: path.join(HOME, ".openclaw", "projects", "knowledge-base", "mcp-server.js"),
    workingDirectory: path.join(HOME, ".openclaw", "projects", "knowledge-base"),
    port: 3001,
  },
  {
    name: "observability",
    label: "ai.openclaw.mcp-observability-server",
    serverPath: path.join(HOME, ".openclaw", "projects", "observability", "mcp-server.js"),
    workingDirectory: path.join(HOME, ".openclaw", "projects", "observability"),
    port: 3002,
  },
  {
    name: "macos-system",
    label: "ai.openclaw.mcp-macos-system",
    serverPath: path.join(HOME, ".openclaw", "projects", "macos-system-mcp", "mcp-server.js"),
    workingDirectory: path.join(HOME, ".openclaw", "projects", "macos-system-mcp"),
    port: 3003,
  },
  {
    name: "google-workspace",
    label: "ai.openclaw.mcp-google-workspace",
    serverPath: path.join(HOME, ".openclaw", "projects", "google-workspace", "mcp-server.js"),
    workingDirectory: path.join(HOME, ".openclaw", "projects", "google-workspace"),
    port: 3004,
  },
];

async function main() {
  await fs.mkdir(CRON_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });

  for (const server of mcpServers) {
    const plistContent = buildLaunchAgentPlist({
      label: server.label,
      comment: `MCP ${server.name} server daemon`,
      programArguments: ["/opt/homebrew/opt/node@22/bin/node", server.serverPath],
      workingDirectory: server.workingDirectory,
      stdoutPath: path.join(LOGS_DIR, `${server.label}-stdout.log`),
      stderrPath: path.join(LOGS_DIR, `${server.label}-stderr.log`),
      environment: {
        MCP_PORT: server.port.toString(),
      },
      keepAlive: true,
    });

    const plistPath = path.join(CRON_DIR, `${server.label}.plist`);
    await fs.writeFile(plistPath, plistContent, "utf8");
    console.log(`✓ Created ${plistPath}`);
  }

  console.log("\nMCP daemon plists generated successfully!");
  console.log("\nTo load the daemons:");
  console.log("  cd ~/Library/LaunchAgents");
  console.log("  for plist in ~/.openclaw/cron/ai.openclaw.mcp-*.plist; do");
  console.log('    ln -sf "$plist" . && launchctl load "$(basename $plist)"');
  console.log("  done");
}

main().catch((error) => {
  console.error("Error generating plists:", error);
  process.exit(1);
});
