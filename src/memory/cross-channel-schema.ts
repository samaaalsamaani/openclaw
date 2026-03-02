import type { DatabaseSync } from "node:sqlite";

/**
 * Creates the cross-channel memory index schema in the given SQLite database.
 *
 * Tables:
 *   - files: one row per indexed session file, keyed by relative session path
 *   - chunks: one row per text chunk (currently 1 chunk per file)
 *   - chunks_fts: FTS5 external content table backed by chunks, using trigram tokenizer
 *
 * FTS triggers keep chunks_fts in sync with chunks on INSERT/UPDATE/DELETE.
 */
export function ensureCrossChannelIndexSchema(db: DatabaseSync): void {
  // files table — one row per indexed session file
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
    );
  `);

  // chunks table — one row per text chunk
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      text TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // FTS5 external content table backed by chunks, trigram tokenizer for substring search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      content='chunks',
      content_rowid='rowid',
      tokenize='trigram'
    );
  `);

  // Indexes for efficient channel and agent filtering
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_channel ON chunks(channel);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_channel ON files(channel);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_agent_id ON files(agent_id);`);

  // FTS triggers to keep chunks_fts in sync with chunks
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
      INSERT INTO chunks_fts(rowid, text) VALUES (new.rowid, new.text);
    END;
  `);
}
