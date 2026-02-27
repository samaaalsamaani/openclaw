/**
 * Post-conversation learning hook — extracts learnable facts from conversations
 * and stores them in the KB as "conversation-derived" articles.
 *
 * Follows the same fire-and-forget pattern as scheduleVerification() and
 * scheduleDecomposition() in routing-middleware.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitAgentEvent } from "../infra/agent-events.js";
import { defaultRuntime } from "../runtime.js";

const KB_DB_PATH = join(
  process.env.HOME ?? "/tmp",
  ".openclaw",
  "projects",
  "knowledge-base",
  "kb.sqlite",
);

const AUTH_PROFILES_PATH = join(
  process.env.HOME ?? "/tmp",
  ".openclaw",
  "agents",
  "main",
  "agent",
  "auth-profiles.json",
);

const MAX_INSERTS_PER_TURN = 3;
const MIN_MESSAGE_LENGTH = 20;

function getAnthropicKey(): string | null {
  try {
    const data = JSON.parse(readFileSync(AUTH_PROFILES_PATH, "utf-8"));
    return (data.profiles?.anthropic?.key as string) || process.env.ANTHROPIC_API_KEY || null;
  } catch {
    return process.env.ANTHROPIC_API_KEY || null;
  }
}

type ExtractedFact = { title: string; content: string; tags: string[] };

async function extractFacts(userMessage: string, agentReply: string): Promise<ExtractedFact[]> {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    return [];
  }

  const conversationSnippet = [
    `User: ${userMessage.slice(0, 1500)}`,
    `Assistant: ${agentReply.slice(0, 1500)}`,
  ].join("\n\n");

  const prompt = `Extract any factual statements, user preferences, decisions, or corrections from this conversation exchange. Focus on durable knowledge worth remembering across sessions.

${conversationSnippet}

Return a JSON array of objects with {title, content, tags} or an empty array [] if nothing is worth learning. Tags should be a JSON array of strings. Only include genuinely useful facts, not small talk or transient context.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content?.[0]?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return [];
    }

    const parsed = JSON.parse(match[0]) as ExtractedFact[];
    return Array.isArray(parsed)
      ? parsed.filter((f) => f.title && f.content).slice(0, MAX_INSERTS_PER_TURN)
      : [];
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

function storeFactsInKb(facts: ExtractedFact[], agentId: string): number {
  if (!existsSync(KB_DB_PATH)) {
    return 0;
  }

  // Dynamic require for better-sqlite3 (same pattern as mcp-servers.ts)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(KB_DB_PATH);
  db.pragma("busy_timeout = 5000");

  const now = new Date().toISOString();
  let stored = 0;

  const insertArticle = db.prepare(`
    INSERT INTO articles (url, title, content, type, platform, para_type, para_area, tags, created_at, updated_at)
    VALUES (?, ?, ?, 'note', 'conversation', 'resource', 'Conversation Insights', ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO articles_fts (rowid, title, content, summary, summary_l1, summary_l2, summary_l3, summary_l4, tags)
    VALUES (?, ?, ?, '', '', '', '', '', ?)
  `);

  try {
    for (const fact of facts) {
      const url = `conversation://${agentId}/${Date.now()}-${stored}`;
      const tags = JSON.stringify(Array.isArray(fact.tags) ? fact.tags : []);

      const result = insertArticle.run(url, fact.title, fact.content, tags, now, now);
      const articleId = result.lastInsertRowid;

      // Sync FTS (critical: SQLite inserts bypass FTS5 triggers)
      insertFts.run(articleId, fact.title, fact.content, tags);
      stored++;
    }
  } catch (err) {
    defaultRuntime.log?.("warn", `conversation-learner KB insert failed: ${String(err)}`);
  } finally {
    db.close();
  }

  return stored;
}

async function executeConversationLearning(
  userMessage: string,
  agentReply: string,
  agentId: string,
): Promise<void> {
  const facts = await extractFacts(userMessage, agentReply);
  if (facts.length === 0) {
    return;
  }

  const stored = storeFactsInKb(facts, agentId);

  emitAgentEvent({
    runId: agentId,
    stream: "conversation-learning",
    data: {
      extracted: facts.length,
      stored,
      titles: facts.map((f) => f.title),
    },
  });
}

/**
 * Fire-and-forget: extract learnable facts from a conversation turn and store in KB.
 * Safe to call from any reply path — never throws, never blocks.
 */
export function scheduleConversationLearning(
  userMessage: string,
  agentReply: string,
  agentId: string,
): void {
  // Skip short messages, commands, and empty replies
  if (
    !userMessage ||
    userMessage.length < MIN_MESSAGE_LENGTH ||
    userMessage.startsWith("/") ||
    !agentReply ||
    agentReply.length < MIN_MESSAGE_LENGTH
  ) {
    return;
  }

  executeConversationLearning(userMessage, agentReply, agentId).catch((err) => {
    defaultRuntime.log?.("warn", `conversation-learner fire-and-forget failed: ${err}`);
  });
}
