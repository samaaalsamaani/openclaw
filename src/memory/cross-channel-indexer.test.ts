import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { isCronSessionKey, isSubagentSessionKey } from "../sessions/session-key-utils.js";
import { ensureCrossChannelIndexSchema } from "./cross-channel-schema.js";
import { requireNodeSqlite } from "./sqlite.js";

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

let tempDir = "";
let sessionFiles: string[] = [];

vi.mock("../infra/home-dir.js", () => ({
  resolveRequiredHomeDir: () => tempDir,
  resolveEffectiveHomeDir: () => tempDir,
}));

vi.mock("./session-files.js", () => ({
  listSessionFilesForAgent: async (_agentId: string) => sessionFiles,
  buildSessionEntry: async (absPath: string) => {
    // Dynamically import the real buildSessionEntry from a helper
    // We can't import it directly because of the mock, so we replicate the behavior
    const { default: fsModule } = await import("node:fs/promises");
    const { default: pathModule } = await import("node:path");
    const { default: cryptoModule } = await import("node:crypto");

    try {
      const stat = await fsModule.stat(absPath);
      const raw = await fsModule.readFile(absPath, "utf-8");
      const lines = raw.split("\n");
      const collected: string[] = [];
      const lineMap: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line?.trim()) {
          continue;
        }
        let record: unknown;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        }
        if (
          !record ||
          typeof record !== "object" ||
          (record as { type?: unknown }).type !== "message"
        ) {
          continue;
        }
        const message = (record as { message?: { role?: string; content?: unknown } }).message;
        if (!message || typeof message.role !== "string") {
          continue;
        }
        if (message.role !== "user" && message.role !== "assistant") {
          continue;
        }

        const content = message.content;
        let text: string | null = null;
        if (typeof content === "string") {
          text = content.trim() || null;
        } else if (Array.isArray(content)) {
          const parts = content
            .filter(
              (b): b is { type: string; text: string } =>
                b &&
                typeof b === "object" &&
                (b as { type?: unknown }).type === "text" &&
                typeof (b as { text?: unknown }).text === "string",
            )
            .map((b) => b.text.trim())
            .filter(Boolean);
          text = parts.join(" ") || null;
        }
        if (!text) {
          continue;
        }

        const label = message.role === "user" ? "User" : "Assistant";
        collected.push(`${label}: ${text}`);
        lineMap.push(i + 1);
      }

      const sessionContent = collected.join("\n");
      const hash = cryptoModule
        .createHash("sha256")
        .update(sessionContent + "\n" + lineMap.join(","))
        .digest("hex");

      const baseName = pathModule.basename(absPath);
      return {
        path: pathModule.join("sessions", baseName).replace(/\\/g, "/"),
        absPath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        hash,
        content: sessionContent,
        lineMap,
      };
    } catch {
      return null;
    }
  },
  sessionPathForFile: (absPath: string) => {
    return path.join("sessions", path.basename(absPath)).replace(/\\/g, "/");
  },
}));

// We must import CrossChannelIndexer AFTER the vi.mock() calls
let CrossChannelIndexer: typeof import("./cross-channel-indexer.js").CrossChannelIndexer;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonlFile(turns: Array<{ role: "user" | "assistant"; content: string }>): string {
  return turns
    .map((t) =>
      JSON.stringify({
        type: "message",
        message: { role: t.role, content: t.content },
      }),
    )
    .join("\n");
}

function openTestDb(dbPath: string) {
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  ensureCrossChannelIndexSchema(db);
  return db;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("cross-channel-indexer", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "cross-channel-test-"));
    sessionFiles = [];
    // Dynamically import after mock setup
    const mod = await import("./cross-channel-indexer.js");
    CrossChannelIndexer = mod.CrossChannelIndexer;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
    sessionFiles = [];
    vi.resetModules();
  });

  // ── Schema tests ─────────────────────────────────────────────────────────

  describe("ensureCrossChannelIndexSchema", () => {
    it("creates files, chunks, and chunks_fts tables", () => {
      const { DatabaseSync } = requireNodeSqlite();
      const dbPath = path.join(tempDir, "schema-test.sqlite");
      const db = new DatabaseSync(dbPath);

      ensureCrossChannelIndexSchema(db);

      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' OR type='shadow' ORDER BY name`)
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("files");
      expect(tableNames).toContain("chunks");
      // FTS5 creates shadow tables including chunks_fts_data, chunks_fts_content etc.
      const hasFts = tableNames.some((n) => n.startsWith("chunks_fts"));
      expect(hasFts).toBe(true);

      db.close();
    });

    it("is idempotent — second call does not throw", () => {
      const { DatabaseSync } = requireNodeSqlite();
      const dbPath = path.join(tempDir, "schema-idempotent.sqlite");
      const db = new DatabaseSync(dbPath);

      expect(() => ensureCrossChannelIndexSchema(db)).not.toThrow();
      expect(() => ensureCrossChannelIndexSchema(db)).not.toThrow();

      db.close();
    });
  });

  // ── Channel extraction tests ──────────────────────────────────────────────

  describe("channel extraction from session key", () => {
    it("extracts 'telegram' from 'agent:main:telegram:direct:123'", () => {
      const parsed = parseAgentSessionKey("agent:main:telegram:direct:123");
      expect(parsed).not.toBeNull();
      const channel = parsed!.rest.split(":")[0]?.trim().toLowerCase();
      expect(channel).toBe("telegram");
    });

    it("extracts 'slack' from 'agent:main:slack:channel:C123'", () => {
      const parsed = parseAgentSessionKey("agent:main:slack:channel:C123");
      expect(parsed).not.toBeNull();
      const channel = parsed!.rest.split(":")[0]?.trim().toLowerCase();
      expect(channel).toBe("slack");
    });

    it("returns true for cron session keys (should be excluded from indexing)", () => {
      expect(isCronSessionKey("agent:main:cron:daily")).toBe(true);
    });

    it("returns true for subagent session keys (should be excluded from indexing)", () => {
      expect(isSubagentSessionKey("agent:main:subagent:child:1")).toBe(true);
    });

    it("returns 'unknown' channel token for unknown channel keys", () => {
      const parsed = parseAgentSessionKey("agent:main:unknown:direct:123");
      const channel = parsed?.rest.split(":")[0]?.trim().toLowerCase() ?? null;
      // The indexer skips keys where channel === "unknown"
      expect(channel).toBe("unknown");
    });
  });

  // ── CrossChannelIndexer integration tests ────────────────────────────────

  describe("CrossChannelIndexer", () => {
    const agentId = "test-agent-01";
    let indexer: import("./cross-channel-indexer.js").CrossChannelIndexer;

    function getDbPath() {
      return path.join(tempDir, ".openclaw", "agents", agentId, "cross-channel-memory.sqlite");
    }

    beforeEach(async () => {
      // Create agent dir
      await mkdir(path.join(tempDir, ".openclaw", "agents", agentId), { recursive: true });
      indexer = CrossChannelIndexer.getInstance(agentId);
    });

    afterEach(() => {
      indexer.stop();
    });

    it("indexes a session file and stores it in the files table", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionKey = "agent:main:telegram:direct:123456";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(
        filePath,
        makeJsonlFile([
          { role: "user", content: "What's our timeline?" },
          { role: "assistant", content: "Q2 2026 is the target." },
        ]),
      );
      sessionFiles = [filePath];

      await indexer.sync();

      const db = openTestDb(getDbPath());
      const fileRow = db.prepare("SELECT * FROM files WHERE agent_id = ?").get(agentId) as
        | { path: string; channel: string }
        | undefined;
      const chunkRow = db.prepare("SELECT * FROM chunks WHERE agent_id = ?").get(agentId) as
        | { text: string }
        | undefined;
      db.close();

      expect(fileRow).toBeDefined();
      expect(fileRow?.channel).toBe("telegram");
      expect(chunkRow).toBeDefined();
      expect(chunkRow?.text).toContain("timeline");
    });

    it("skips re-indexing unchanged files (hash matches)", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionKey = "agent:main:discord:channel:C999";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(filePath, makeJsonlFile([{ role: "user", content: "Hello from Discord" }]));
      sessionFiles = [filePath];

      // First sync — should index
      await indexer.sync();

      const db = openTestDb(getDbPath());
      const beforeCount = (db.prepare("SELECT count(*) AS cnt FROM files").get() as { cnt: number })
        .cnt;
      const hashBefore = (
        db.prepare("SELECT hash FROM files WHERE agent_id = ?").get(agentId) as
          | {
              hash: string;
            }
          | undefined
      )?.hash;
      db.close();

      // Second sync — file unchanged, should skip
      await indexer.sync();

      const db2 = openTestDb(getDbPath());
      const afterCount = (db2.prepare("SELECT count(*) AS cnt FROM files").get() as { cnt: number })
        .cnt;
      const hashAfter = (
        db2.prepare("SELECT hash FROM files WHERE agent_id = ?").get(agentId) as
          | {
              hash: string;
            }
          | undefined
      )?.hash;
      db2.close();

      expect(beforeCount).toBe(1);
      expect(afterCount).toBe(1);
      expect(hashBefore).toBe(hashAfter);
    });

    it("excludes lines starting with 'User: /' (slash commands)", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionKey = "agent:main:slack:channel:S111";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(
        filePath,
        makeJsonlFile([
          { role: "user", content: "/help" },
          { role: "user", content: "What is the weather?" },
          { role: "assistant", content: "It's sunny today." },
        ]),
      );
      sessionFiles = [filePath];

      await indexer.sync();

      const db = openTestDb(getDbPath());
      const chunk = db.prepare("SELECT text FROM chunks WHERE agent_id = ?").get(agentId) as
        | { text: string }
        | undefined;
      db.close();

      expect(chunk).toBeDefined();
      expect(chunk?.text).not.toContain("/help");
      expect(chunk?.text).toContain("weather");
    });

    it("purges stale entries when a session file is removed", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionKey = "agent:main:telegram:direct:purge-me";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(filePath, makeJsonlFile([{ role: "user", content: "This will be removed" }]));
      sessionFiles = [filePath];

      // Index the file
      await indexer.sync();

      const db = openTestDb(getDbPath());
      const beforeFile = db.prepare("SELECT count(*) AS cnt FROM files").get() as { cnt: number };
      db.close();
      expect(beforeFile.cnt).toBe(1);

      // Remove from active files list (simulates file deletion)
      sessionFiles = [];

      await indexer.sync();

      const db2 = openTestDb(getDbPath());
      const afterFile = db2.prepare("SELECT count(*) AS cnt FROM files").get() as { cnt: number };
      const afterChunk = db2.prepare("SELECT count(*) AS cnt FROM chunks").get() as { cnt: number };
      db2.close();

      expect(afterFile.cnt).toBe(0);
      expect(afterChunk.cnt).toBe(0);
    });

    it("search returns results matching query text, excluding current channel", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      // Index a telegram session with "project timeline" content
      const sessionKey = "agent:main:telegram:direct:789";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(
        filePath,
        makeJsonlFile([
          { role: "user", content: "What is the project timeline?" },
          { role: "assistant", content: "The project timeline is Q3 2026." },
        ]),
      );
      sessionFiles = [filePath];

      await indexer.sync();

      // Search from "slack" channel — telegram results should be included
      const results = indexer.search({
        query: "timeline",
        excludeChannel: "slack",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.channel).toBe("telegram");
      expect(results[0]?.snippet).toContain("timeline");
    });

    it("search respects charBudget truncation", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      // Index two different channels with similar content
      const files = [
        {
          key: "agent:main:telegram:direct:aaa",
          content: [{ role: "user" as const, content: "The budget meeting is scheduled" }],
        },
        {
          key: "agent:main:discord:channel:bbb",
          content: [{ role: "user" as const, content: "The budget review happened yesterday" }],
        },
      ];

      const filePaths: string[] = [];
      for (const f of files) {
        const fp = path.join(sessionsDir, `${f.key}.jsonl`);
        await writeFile(fp, makeJsonlFile(f.content));
        filePaths.push(fp);
      }
      sessionFiles = filePaths;

      await indexer.sync();

      // charBudget = 1 means we get at most 1 char of snippets → 0 results
      const results = indexer.search({
        query: "budget",
        excludeChannel: "",
        charBudget: 1,
      });

      expect(results.length).toBe(0);
    });

    it("search returns empty array when no relevant results", async () => {
      sessionFiles = [];
      await indexer.sync();

      const results = indexer.search({
        query: "xyzzy-nonexistent-term-12345",
        excludeChannel: "",
      });

      expect(results).toEqual([]);
    });

    it("search sanitizes FTS5 special syntax: 'NOT ...' does not throw", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionKey = "agent:main:telegram:direct:fts-safety";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(
        filePath,
        makeJsonlFile([{ role: "user", content: "valid indexable content here" }]),
      );
      sessionFiles = [filePath];
      await indexer.sync();

      // FTS5 would throw "fts5: syntax error near 'NOT'" without sanitization
      expect(() => indexer.search({ query: "NOT valid query", excludeChannel: "" })).not.toThrow();
      const results = indexer.search({ query: "NOT valid query", excludeChannel: "" });
      expect(results).toEqual([]);
    });

    it("search sanitizes FTS5 special syntax: '{column} match' does not throw", async () => {
      const sessionsDir = path.join(tempDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionKey = "agent:main:telegram:direct:fts-col";
      const filePath = path.join(sessionsDir, `${sessionKey}.jsonl`);
      await writeFile(
        filePath,
        makeJsonlFile([{ role: "user", content: "some discussion content" }]),
      );
      sessionFiles = [filePath];
      await indexer.sync();

      // FTS5 would throw "no such column: hello" without sanitization
      expect(() => indexer.search({ query: "{hello} world", excludeChannel: "" })).not.toThrow();
      const results = indexer.search({ query: "{hello} world", excludeChannel: "" });
      expect(results).toEqual([]);
    });

    it("search returns empty array when query tokenizes to nothing", async () => {
      sessionFiles = [];
      await indexer.sync();

      // buildFtsQuery("!!!") → null → early return []
      const results = indexer.search({ query: "!!!", excludeChannel: "" });
      expect(results).toEqual([]);
    });

    it("start() interval is unref'd so it does not keep Node process alive", () => {
      // start() should call .unref?.() on the interval so tests and short-lived processes exit cleanly.
      // Node's setInterval returns a Timeout object; after .unref() the hasRef() method returns false.
      indexer.start();

      // Access the private interval via type cast to verify unref was called
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interval = (indexer as any)._interval as ReturnType<typeof setInterval> | null;
      expect(interval).not.toBeNull();
      // hasRef() returns false after .unref() is called
      expect((interval as { hasRef?: () => boolean }).hasRef?.()).toBe(false);
    });
  });
});
