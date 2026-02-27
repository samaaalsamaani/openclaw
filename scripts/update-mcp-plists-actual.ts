#!/usr/bin/env node
/**
 * Update MCP plist files to match actual server paths
 * Run: node --import tsx scripts/update-mcp-plists-actual.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { buildLaunchAgentPlist } from "../src/daemon/launchd-plist.js";

const HOME = process.env.HOME || "/Users/user";
const CRON_DIR = path.join(HOME, ".openclaw", "cron");
const LOGS_DIR = path.join(HOME, ".openclaw", "logs");

// Update observability plist to use server.js instead of mcp-server.js
const observabilityPlist = buildLaunchAgentPlist({
  label: "ai.openclaw.mcp-observability-server",
  comment: "MCP observability server daemon",
  programArguments: [
    "/opt/homebrew/opt/node@22/bin/node",
    path.join(HOME, ".openclaw", "projects", "observability", "server.js"),
  ],
  workingDirectory: path.join(HOME, ".openclaw", "projects", "observability"),
  stdoutPath: path.join(LOGS_DIR, "ai.openclaw.mcp-observability-server-stdout.log"),
  stderrPath: path.join(LOGS_DIR, "ai.openclaw.mcp-observability-server-stderr.log"),
  environment: {
    MCP_PORT: "3002",
  },
  keepAlive: true,
});

async function main() {
  const cronPath = path.join(CRON_DIR, "ai.openclaw.mcp-observability-server.plist");
  await fs.writeFile(cronPath, observabilityPlist, "utf8");
  console.log(`✓ Updated ${cronPath} with correct server path`);

  console.log("\nNote: Google Workspace MCP server doesn't exist yet - skipping its plist");
  console.log("Only 3 MCP servers will be daemonized: KB, Observability, macOS System");
}

main().catch((error) => {
  console.error("Error updating plists:", error);
  process.exit(1);
});
