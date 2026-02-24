/**
 * In-process MCP servers for SDK runner sessions.
 *
 * Creates MCP servers via createSdkMcpServer() that run in the same process
 * as the Gateway — no additional stdio child processes needed.
 *
 * Servers created:
 *   • gateway-kb — KB query, article, recent, stats, entities, graph, decisions, playbooks, contradictions, smart_query, communities
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
      version: "2.1.0",
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
        tool(
          "kb_entities",
          "Search or list entities in the knowledge graph",
          {
            query: z.string().optional(),
            type: z.string().optional(),
            limit: z.number().optional(),
          },
          async ({ query, type, limit }) => {
            const results = kbEntities(query, type, limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool(
          "kb_graph",
          "Traverse the knowledge graph — 1-2 hop relationship exploration from an entity or article",
          {
            entity_id: z.number().optional(),
            article_id: z.number().optional(),
            hops: z.number().optional(),
            limit: z.number().optional(),
          },
          async ({ entity_id, article_id, hops, limit }) => {
            const results = kbGraph(entity_id, article_id, hops ?? 1, limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool(
          "kb_decisions",
          "Search or list decisions from the decision memory",
          {
            query: z.string().optional(),
            domain: z.string().optional(),
            limit: z.number().optional(),
          },
          async ({ query, domain, limit }) => {
            const results = kbDecisions(query, domain, limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool(
          "kb_playbooks",
          "Search or list execution playbooks",
          {
            query: z.string().optional(),
            domain: z.string().optional(),
            limit: z.number().optional(),
          },
          async ({ query, domain, limit }) => {
            const results = kbPlaybooks(query, domain, limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool(
          "kb_contradictions",
          "List detected contradictions between articles",
          {
            unresolved_only: z.boolean().optional(),
            article_id: z.number().optional(),
            limit: z.number().optional(),
          },
          async ({ unresolved_only, article_id, limit }) => {
            const results = kbContradictions(unresolved_only ?? true, article_id, limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool(
          "kb_smart_query",
          "Multi-source smart query — searches articles, entities, decisions, playbooks, and contradictions",
          { query: z.string(), agent_type: z.string().optional(), limit: z.number().optional() },
          async ({ query, agent_type, limit }) => {
            const results = kbSmartQuery(query, agent_type, limit ?? 5);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
        tool(
          "kb_communities",
          "List entity communities — clusters of related knowledge",
          { community_id: z.number().optional(), limit: z.number().optional() },
          async ({ community_id, limit }) => {
            const results = kbCommunities(community_id, limit ?? 10);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
            };
          },
        ),
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

function safeCount(db: ReturnType<typeof getKbDb>, sql: string): number {
  try {
    return db.prepare(sql).get().c;
  } catch {
    return 0;
  }
}

function kbQuery(query: string, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const safeQuery = query.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return db
    .prepare(
      `SELECT a.id, a.url, a.title, a.summary, a.type, a.platform, a.language,
              a.summary_l1, a.summary_l2, a.para_type, a.para_area
       FROM articles_fts fts
       JOIN articles a ON a.id = fts.rowid
       WHERE articles_fts MATCH ?
         AND NOT (a.para_type = 'archive' AND a.para_area = 'Build Artifacts')
       ORDER BY rank
       LIMIT ?`,
    )
    .all(safeQuery, safeLimit);
}

function kbGetArticle(id: number) {
  const db = getKbDb();
  return db
    .prepare(
      `SELECT id, url, title, content, type, created_at, language,
              summary_l1, summary_l2, summary_l3, summary_l4,
              para_type, para_area, tags, enrichment_status
       FROM articles WHERE id = ?`,
    )
    .get(id);
}

function kbRecent(limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return db
    .prepare(
      `SELECT id, url, title, type, platform, created_at, language, summary_l1, summary_l2
       FROM articles
       WHERE NOT (para_type = 'archive' AND para_area = 'Build Artifacts')
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(safeLimit);
}

function kbStats() {
  const db = getKbDb();
  const total = safeCount(db, "SELECT COUNT(*) as c FROM articles");
  const searchable = safeCount(
    db,
    "SELECT COUNT(*) as c FROM articles WHERE NOT (para_type = 'archive' AND para_area = 'Build Artifacts')",
  );
  return {
    totalArticles: total,
    searchable,
    withEmbeddings: safeCount(db, "SELECT COUNT(*) as c FROM articles WHERE embedding IS NOT NULL"),
    totalPeople: safeCount(db, "SELECT COUNT(*) as c FROM people"),
    enrichment: {
      l1: safeCount(db, "SELECT COUNT(*) as c FROM articles WHERE summary_l1 IS NOT NULL"),
      l2: safeCount(db, "SELECT COUNT(*) as c FROM articles WHERE summary_l2 IS NOT NULL"),
      complete: safeCount(
        db,
        "SELECT COUNT(*) as c FROM articles WHERE enrichment_status = 'complete'",
      ),
    },
    cognitive: {
      entities: safeCount(db, "SELECT COUNT(*) as c FROM entities"),
      decisions: safeCount(db, "SELECT COUNT(*) as c FROM decisions"),
      playbooks: safeCount(db, "SELECT COUNT(*) as c FROM playbooks"),
      contradictions: safeCount(db, "SELECT COUNT(*) as c FROM contradictions"),
      relations: safeCount(db, "SELECT COUNT(*) as c FROM article_relations"),
    },
  };
}

function kbEntities(query: string | undefined, type: string | undefined, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query) {
    conditions.push("(e.name LIKE ? OR e.description LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (type) {
    conditions.push("e.type = ?");
    params.push(type);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  return db
    .prepare(
      `SELECT e.id, e.name, e.canonical_name, e.type, e.description, e.mention_count, e.confidence
       FROM entities e ${where}
       ORDER BY e.mention_count DESC LIMIT ?`,
    )
    .all(...params, safeLimit);
}

function kbGraph(
  entityId: number | undefined,
  articleId: number | undefined,
  hops: number,
  limit: number,
) {
  const db = getKbDb();
  const safeHops = Math.max(1, Math.min(hops, 2));
  const safeLimit = Math.max(1, Math.min(limit, 50));

  if (entityId) {
    // Get articles mentioning this entity
    const mentions = db
      .prepare(
        `SELECT a.id, a.title, a.summary_l1, em.context_snippet, em.confidence
         FROM entity_mentions em
         JOIN articles a ON a.id = em.article_id
         WHERE em.entity_id = ?
         ORDER BY em.confidence DESC LIMIT ?`,
      )
      .all(entityId, safeLimit);

    const entity = db.prepare("SELECT * FROM entities WHERE id = ?").get(entityId);
    const result: Record<string, unknown> = { entity, articles: mentions };

    if (safeHops >= 2) {
      // Get co-occurring entities
      const coEntities = db
        .prepare(
          `SELECT DISTINCT e.id, e.name, e.type, COUNT(*) as co_count
           FROM entity_mentions em1
           JOIN entity_mentions em2 ON em1.article_id = em2.article_id
           JOIN entities e ON e.id = em2.entity_id
           WHERE em1.entity_id = ? AND em2.entity_id != ?
           GROUP BY e.id
           ORDER BY co_count DESC LIMIT ?`,
        )
        .all(entityId, entityId, safeLimit);
      result.coEntities = coEntities;
    }
    return result;
  }

  if (articleId) {
    // Get entities in this article
    const entities = db
      .prepare(
        `SELECT e.id, e.name, e.type, em.context_snippet, em.confidence
         FROM entity_mentions em
         JOIN entities e ON e.id = em.entity_id
         WHERE em.article_id = ?
         ORDER BY em.confidence DESC LIMIT ?`,
      )
      .all(articleId, safeLimit);

    // Get related articles
    const relations = db
      .prepare(
        `SELECT ar.relation, a.id, a.title, a.summary_l1
         FROM article_relations ar
         JOIN articles a ON a.id = ar.target_id
         WHERE ar.source_id = ?
         UNION
         SELECT ar.relation, a.id, a.title, a.summary_l1
         FROM article_relations ar
         JOIN articles a ON a.id = ar.source_id
         WHERE ar.target_id = ?`,
      )
      .all(articleId, articleId);

    return { articleId, entities, relations };
  }

  return { error: "Provide entity_id or article_id" };
}

function kbDecisions(query: string | undefined, domain: string | undefined, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query) {
    conditions.push("(d.title LIKE ? OR d.context LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (domain) {
    conditions.push("d.domain = ?");
    params.push(domain);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  return db
    .prepare(
      `SELECT d.id, d.title, d.domain, d.chosen, d.rationale, d.confidence,
              d.review_date, d.outcome, d.created_at
       FROM decisions d ${where}
       ORDER BY d.created_at DESC LIMIT ?`,
    )
    .all(...params, safeLimit);
}

function kbPlaybooks(query: string | undefined, domain: string | undefined, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query) {
    conditions.push("(p.title LIKE ? OR p.trigger_condition LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (domain) {
    conditions.push("p.domain = ?");
    params.push(domain);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  return db
    .prepare(
      `SELECT p.id, p.title, p.trigger_condition, p.domain, p.steps,
              p.success_count, p.failure_count, p.created_at
       FROM playbooks p ${where}
       ORDER BY p.success_count DESC LIMIT ?`,
    )
    .all(...params, safeLimit);
}

function kbContradictions(unresolvedOnly: boolean, articleId: number | undefined, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (unresolvedOnly) {
    conditions.push("c.resolved_at IS NULL");
  }
  if (articleId) {
    conditions.push("(c.article_a_id = ? OR c.article_b_id = ?)");
    params.push(articleId, articleId);
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  params.push(safeLimit);

  return db
    .prepare(
      `SELECT c.id, c.claim_a, c.claim_b, c.severity, c.resolution, c.resolved_at,
              a1.title AS article_a_title, a2.title AS article_b_title,
              a1.id AS article_a_id, a2.id AS article_b_id,
              c.created_at
       FROM contradictions c
       JOIN articles a1 ON c.article_a_id = a1.id
       JOIN articles a2 ON c.article_b_id = a2.id
       ${where}
       ORDER BY c.created_at DESC LIMIT ?`,
    )
    .all(...params);
}

function kbCommunities(communityId: number | undefined, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 50));

  if (communityId != null) {
    return db
      .prepare(
        `SELECT id, name, type, centrality_score, mention_count
         FROM entities WHERE community_id = ?
         ORDER BY centrality_score DESC LIMIT ?`,
      )
      .all(communityId, safeLimit);
  }

  return db.prepare("SELECT * FROM communities ORDER BY entity_count DESC LIMIT ?").all(safeLimit);
}

function kbSmartQuery(query: string, agentType: string | undefined, limit: number) {
  const db = getKbDb();
  const safeLimit = Math.max(1, Math.min(limit, 10));
  const safeQuery = query.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // Domain-scoped PARA area filtering based on agent type
  let areaFilter = "";
  if (agentType === "code") {
    areaFilter = "AND a.para_area IN ('Code Reference', 'Development', 'AI Research')";
  } else if (agentType === "creative") {
    areaFilter = "AND a.para_area IN ('Content Strategy', 'Brand', 'Social Media', 'Writing')";
  }

  // Search articles
  let articles: unknown[] = [];
  try {
    articles = db
      .prepare(
        `SELECT a.id, a.title, a.summary_l2, a.para_area
         FROM articles_fts fts
         JOIN articles a ON a.id = fts.rowid
         WHERE articles_fts MATCH ?
           AND NOT (a.para_type = 'archive' AND a.para_area = 'Build Artifacts')
           ${areaFilter}
         ORDER BY rank LIMIT ?`,
      )
      .all(safeQuery, safeLimit);
  } catch {}

  // Search entities (use sanitized query for LIKE safety)
  let entities: unknown[] = [];
  try {
    entities = db
      .prepare(
        `SELECT id, name, type, description FROM entities
         WHERE name LIKE ? OR description LIKE ?
         ORDER BY mention_count DESC LIMIT ?`,
      )
      .all(`%${safeQuery}%`, `%${safeQuery}%`, safeLimit);
  } catch {}

  // Search decisions
  let decisions: unknown[] = [];
  try {
    decisions = db
      .prepare(
        `SELECT id, title, domain, chosen, rationale FROM decisions
         WHERE title LIKE ? OR context LIKE ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(`%${query}%`, `%${query}%`, safeLimit);
  } catch {}

  // Get stale articles needing review
  let staleArticles: unknown[] = [];
  try {
    staleArticles = db
      .prepare(
        `SELECT id, title, staleness_score, last_accessed FROM articles
         WHERE staleness_score >= 0.8
           AND NOT (para_type = 'archive' AND para_area = 'Build Artifacts')
         ORDER BY staleness_score DESC LIMIT 5`,
      )
      .all();
  } catch {}

  // Get unresolved contradictions
  let contradictions: unknown[] = [];
  try {
    contradictions = db
      .prepare(
        `SELECT c.id, c.claim_a, c.claim_b, c.severity,
                a1.title AS article_a, a2.title AS article_b
         FROM contradictions c
         JOIN articles a1 ON c.article_a_id = a1.id
         JOIN articles a2 ON c.article_b_id = a2.id
         WHERE c.resolved_at IS NULL
         ORDER BY c.created_at DESC LIMIT 3`,
      )
      .all();
  } catch {}

  return {
    query,
    agent_type: agentType ?? "general",
    articles,
    entities,
    decisions,
    stale_articles: staleArticles,
    contradictions,
  };
}
