#!/usr/bin/env node
/**
 * Regenerate existing launchd plists with production hardening
 * Run: node --import tsx scripts/harden-existing-plists.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  buildLaunchAgentPlist,
  readLaunchAgentProgramArgumentsFromFile,
} from "../src/daemon/launchd-plist.js";

const HOME = process.env.HOME || "/Users/user";
const LAUNCH_AGENTS_DIR = path.join(HOME, "Library", "LaunchAgents");
const CRON_DIR = path.join(HOME, ".openclaw", "cron");

interface ServiceConfig {
  label: string;
  comment: string;
  keepAlive?: boolean;
  startCalendarInterval?: { Hour: number; Minute: number }[];
}

const services: ServiceConfig[] = [
  {
    label: "ai.openclaw.gateway",
    comment: "OpenClaw Gateway daemon",
    keepAlive: true,
  },
  {
    label: "ai.openclaw.embedding-server",
    comment: "Embedding server for KB",
    keepAlive: true,
  },
  {
    label: "ai.openclaw.file-watcher",
    comment: "File watcher for KB ingestion",
    keepAlive: true,
  },
  {
    label: "ai.openclaw.emit-server",
    comment: "Event emission server",
    keepAlive: true,
  },
  {
    label: "ai.openclaw.daily-tasks",
    comment: "Daily maintenance tasks",
    startCalendarInterval: [
      { Hour: 7, Minute: 55 },
      { Hour: 8, Minute: 0 },
      { Hour: 9, Minute: 0 },
      { Hour: 10, Minute: 0 },
      { Hour: 22, Minute: 0 },
      { Hour: 23, Minute: 0 },
    ],
  },
  {
    label: "ai.openclaw.weekly-tasks",
    comment: "Weekly maintenance tasks",
    startCalendarInterval: [{ Hour: 3, Minute: 0 }],
  },
];

async function hardenPlist(service: ServiceConfig) {
  const plistPath = path.join(LAUNCH_AGENTS_DIR, `${service.label}.plist`);

  console.log(`Reading ${plistPath}...`);
  const existing = await readLaunchAgentProgramArgumentsFromFile(plistPath);

  if (!existing) {
    console.error(`  ✗ Failed to read ${plistPath}`);
    return;
  }

  console.log(`  ✓ Read existing config`);

  // Build hardened plist
  const stdoutPath = path.join(HOME, ".openclaw", "logs", `${service.label}-stdout.log`);
  const stderrPath = path.join(HOME, ".openclaw", "logs", `${service.label}-stderr.log`);

  const newPlist = buildLaunchAgentPlist({
    label: service.label,
    comment: service.comment,
    programArguments: existing.programArguments,
    workingDirectory: existing.workingDirectory,
    stdoutPath,
    stderrPath,
    environment: existing.environment,
    keepAlive: service.keepAlive,
    startCalendarInterval: service.startCalendarInterval?.[0], // Use first interval for main config
  });

  // For services with multiple calendar intervals, we need to manually add them
  let finalPlist = newPlist;
  if (service.startCalendarInterval && service.startCalendarInterval.length > 1) {
    // Replace single StartCalendarInterval with array
    const arrayIntervals = service.startCalendarInterval
      .map(
        (interval) =>
          `\n      <dict>\n        <key>Hour</key>\n        <integer>${interval.Hour}</integer>\n        <key>Minute</key>\n        <integer>${interval.Minute}</integer>\n      </dict>`,
      )
      .join("");
    finalPlist = newPlist.replace(
      /<key>StartCalendarInterval<\/key>\s*<dict>[\s\S]*?<\/dict>/,
      `<key>StartCalendarInterval</key>\n    <array>${arrayIntervals}\n    </array>`,
    );
  }

  // Write to both locations
  const cronPath = path.join(CRON_DIR, `${service.label}.plist`);
  await fs.writeFile(cronPath, finalPlist, "utf8");
  console.log(`  ✓ Updated ${cronPath}`);

  await fs.writeFile(plistPath, finalPlist, "utf8");
  console.log(`  ✓ Updated ${plistPath}`);
}

async function main() {
  await fs.mkdir(CRON_DIR, { recursive: true });

  for (const service of services) {
    await hardenPlist(service);
  }

  console.log("\n✓ All plists hardened successfully!");
  console.log("\nTo reload services:");
  console.log("  launchctl unload ~/Library/LaunchAgents/ai.openclaw.*.plist");
  console.log("  launchctl load ~/Library/LaunchAgents/ai.openclaw.*.plist");
}

main().catch((error) => {
  console.error("Error hardening plists:", error);
  process.exit(1);
});
