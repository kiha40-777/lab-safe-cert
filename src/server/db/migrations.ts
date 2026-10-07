import type { Db } from "./types";

interface Migration {
  /** Never change or reorder an existing migration: add a new one instead. */
  id: string;
  statements: string[];
}

export const migrations: Migration[] = [
  {
    id: "001_initial",
    statements: [
      // key/value settings (password hashes)
      `CREATE TABLE settings (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
      `CREATE TABLE members (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         name_key TEXT NOT NULL UNIQUE,
         role TEXT NOT NULL,
         self_registered INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      // one active question bank per test
      `CREATE TABLE banks (
         test_id TEXT PRIMARY KEY,
         questions_json TEXT NOT NULL,
         meta_json TEXT NOT NULL,
         question_count INTEGER NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      // one study PDF per test
      `CREATE TABLE materials (
         test_id TEXT PRIMARY KEY,
         filename TEXT NOT NULL,
         size INTEGER NOT NULL,
         sha256 TEXT NOT NULL,
         uploaded_at TEXT NOT NULL,
         data BLOB NOT NULL
       )`,
      // questions_json is a snapshot of the drawn questions (including the
      // correct answers), so results stay readable after the bank is replaced
      `CREATE TABLE attempts (
         id TEXT PRIMARY KEY,
         member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
         test_id TEXT NOT NULL,
         status TEXT NOT NULL,
         questions_json TEXT NOT NULL,
         answers_json TEXT NOT NULL,
         score INTEGER,
         total INTEGER NOT NULL,
         required_score INTEGER,
         passed INTEGER,
         promoted_to TEXT,
         started_at TEXT NOT NULL,
         submitted_at TEXT
       )`,
      `CREATE INDEX attempts_member_test ON attempts (member_id, test_id, started_at)`,
      `CREATE TABLE sessions (
         token_hash TEXT PRIMARY KEY,
         scope TEXT NOT NULL,
         member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL
       )`,
    ],
  },
  {
    id: "002_case_study_count",
    statements: [
      // how many of the bank's questions are case studies (banks saved earlier have none)
      `ALTER TABLE banks ADD COLUMN case_study_count INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "003_material_chunks",
    statements: [
      // A study PDF is stored in pieces of a few hundred KB (see services/materials.ts), so no database or
      // connection is ever asked to take one huge value, whatever the size of the PDF.
      `CREATE TABLE material_chunks (
         test_id TEXT NOT NULL,
         idx INTEGER NOT NULL,
         data BLOB NOT NULL,
         PRIMARY KEY (test_id, idx)
       )`,
      // PDFs uploaded before this change become a single piece
      `INSERT INTO material_chunks (test_id, idx, data) SELECT test_id, 0, data FROM materials`,
      `ALTER TABLE materials DROP COLUMN data`,
    ],
  },
];

/** Applies every migration that has not been applied yet (each in its own transaction). */
export async function migrate(db: Db, now: () => Date = () => new Date()): Promise<void> {
  await db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    (await db.all<{ id: string }>("SELECT id FROM schema_migrations")).map((row) => row.id),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      // Asked again inside the transaction: a second server starting at the same time may have just done it.
      if (await tx.get("SELECT id FROM schema_migrations WHERE id = ?", [migration.id])) return;
      for (const statement of migration.statements) await tx.run(statement);
      await tx.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [
        migration.id,
        now().toISOString(),
      ]);
    });
  }
}
