/**
 * In-process MCP servers for SDK runner sessions.
 *
 * Creates MCP servers via createSdkMcpServer() that run in the same process
 * as the Gateway — no additional stdio child processes needed.
 *
 * Servers created:
 *   • gateway-kb — KB query, article, recent, stats
 *   • gateway-system — hostname, uptime, platform info
 */

import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agent/sdk-mcp");

/**
 * Build a map of in-process MCP servers for the SDK session.
 *
 * The KB server uses the same better-sqlite3 database as the stdio MCP server
 * but reads it in-process. The system server exposes basic OS info.
 *
 * Returns undefined if the SDK or required dependencies are unavailable,
 * allowing graceful degradation.
 */
export async function buildSdkMcpServers(): Promise<Record<string, McpServerConfig> | undefined> {
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    const { createSdkMcpServer, tool } = sdk;

    // Zod for input schemas
    const { z } = await import("zod");

    const servers: Record<string, McpServerConfig> = {};

    // --- Knowledge Base MCP server ---
    const kbServer = createSdkMcpServer({
      name: "gateway-kb",
      version: "1.0.0",
      tools: [
        tool(
          "kb_query",
          "Search the knowledge base using keywords (FTS5 full-text search)",
          { query: z.string(), limit: z.number().optional() },
          async ({ query, limit }) => {
            const results = kbQuery(query, limit ?? 5);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool("kb_article", "Get full article content by ID", { id: z.number() }, async ({ id }) => {
          const article = kbGetArticle(id);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(article, null, 2) }],
          };
        }),
        tool(
          "kb_recent",
          "List recently ingested articles",
          { limit: z.number().optional() },
          async ({ limit }) => {
            const results = kbRecent(limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool("kb_stats", "Get knowledge base statistics", {}, async () => {
          const stats = kbStats();
          return {
            content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
          };
        }),
      ],
    });
    servers["gateway-kb"] = kbServer;

    // --- System info MCP server (lightweight) ---
    const os = await import("node:os");
    const systemServer = createSdkMcpServer({
      name: "gateway-system",
      version: "1.0.0",
      tools: [
        tool(
          "system_info",
          "Get basic system information (hostname, platform, uptime, memory)",
          {},
          async () => {
            const info = {
              hostname: os.hostname(),
              platform: os.platform(),
              arch: os.arch(),
              uptimeSeconds: Math.round(os.uptime()),
              totalMemoryGB: Math.round((os.totalmem() / 1073741824) * 10) / 10,
              freeMemoryGB: Math.round((os.freemem() / 1073741824) * 10) / 10,
              nodeVersion: process.version,
            };
            return {
              content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
            };
          },
        ),
      ],
    });
    servers["gateway-system"] = systemServer;

    log.info(`created ${Object.keys(servers).length} in-process MCP servers`);
    return servers;
  } catch (err) {
    log.warn(
      `failed to create in-process MCP servers: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// KB helpers — thin wrappers around better-sqlite3
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kbDb: any;

function openKbDb() {
  const path = require("node:path");
  const fs = require("node:fs");

  const DB_PATH = path.join(
    process.env.HOME ?? "/tmp",
    ".openclaw",
    "projects",
    "knowledge-base",
    "kb.sqlite",
  );

  if (!fs.existsSync(DB_PATH)) {
    throw new Error("KB database not found");
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("busy_timeout = 5000");
  return db;
}

function getKbDb() {
  if (!kbDb) {
    kbDb = openKbDb();
  }
  return kbDb;
}

function kbQuery(query: string, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safeQuery = query.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return db
    .prepare(
      `SELECT a.id, a.url, a.title, a.summary, a.type, a.platform
       FROM articles_fts fts
       JOIN articles a ON a.id = fts.rowid
       WHERE articles_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(safeQuery, safeLimit);
}

function kbGetArticle(id: number) {
  const db = getKbDb();
  return db
    .prepare("SELECT id, url, title, content, type, created_at FROM articles WHERE id = ?")
    .get(id);
}

function kbRecent(limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return db
    .prepare(
      "SELECT id, url, title, type, platform, created_at FROM articles ORDER BY created_at DESC LIMIT ?",
    )
    .all(safeLimit);
}

function kbStats() {
  const db = getKbDb();
  return {
    totalArticles: db.prepare("SELECT COUNT(*) as c FROM articles").get().c,
    withEmbeddings: db
      .prepare("SELECT COUNT(*) as c FROM articles WHERE embedding IS NOT NULL")
      .get().c,
    totalPeople: db.prepare("SELECT COUNT(*) as c FROM people").get().c,
  };
}
