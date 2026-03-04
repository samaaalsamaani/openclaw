import { createSubsystemLogger } from "../../../logging/subsystem.js";
import type { HookHandler } from "../../hooks.js";
import { isMessageReceivedEvent } from "../../internal-hooks.js";

const log = createSubsystemLogger("hooks/graph-context");

const BOLT_URI = "bolt://localhost:7687";
const MIN_QUERY_LENGTH = 10;

/**
 * Query Memgraph for entities and decisions related to the message text.
 * Returns formatted context string or "" if Memgraph is unreachable or no results.
 * Latency-bounded — caller should wrap in Promise.race with 3s timeout.
 */
export async function queryGraphContext(messageBody: string): Promise<string> {
  if (!messageBody || messageBody.trim().length < MIN_QUERY_LENGTH) {
    return "";
  }
  try {
    // Dynamic import — neo4j-driver is a runtime dep, not always available in test env
    const neo4j = (await import("neo4j-driver")).default;
    // Memgraph runs without auth by default; use basic with empty credentials
    const driver = neo4j.driver(BOLT_URI, neo4j.auth.basic("", ""));
    const session = driver.session();
    try {
      // Extract top entities/decisions relevant to this message
      // Use keyword CONTAINS match on name field
      const words = messageBody
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 5);

      if (words.length === 0) {
        return "";
      }

      const wordConditions = words
        .map((_, i) => `toLower(n.name) CONTAINS toLower($w${i})`)
        .join(" OR ");
      const params: Record<string, string> = {};
      words.forEach((w, i) => {
        params[`w${i}`] = w;
      });

      const result = await session.run(
        `MATCH (n)
         WHERE (n:Entity OR n:Decision OR n:Episodic)
           AND (${wordConditions})
         RETURN n.name AS name, n.type AS type, n.description AS description,
                labels(n) AS labels
         LIMIT 5`,
        params,
      );

      if (result.records.length === 0) {
        return "";
      }

      const lines = result.records.map((r) => {
        const name = r.get("name") as string;
        const desc = (r.get("description") as string | null) ?? "";
        const label = ((r.get("labels") as string[]) ?? [])[0] ?? "Entity";
        return `- [${label}] **${name}**: ${desc.slice(0, 200)}`;
      });

      return `--- GRAPH CONTEXT ---\n${lines.join("\n")}`;
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (err) {
    log.debug(`graph context unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

const handler: HookHandler = async (event) => {
  if (!isMessageReceivedEvent(event)) {
    return;
  }
  const { content } = event.context;
  if (!content || content.length < MIN_QUERY_LENGTH || content.startsWith("/")) {
    return;
  }
  // Hook fires for future extensibility; graph context injection is in get-reply-run.ts
  log.debug(`graph-context hook fired for message (${content.length} chars)`);
};

export default handler;
