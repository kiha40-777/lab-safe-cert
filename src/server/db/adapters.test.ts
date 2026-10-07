import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLibsql } from "./libsql";
import { migrate, migrations } from "./migrations";
import { openSqlite } from "./sqlite";
import type { Db } from "./types";

// The same checks run on both adapters: the SQLite file used on a computer, and the libSQL client used
// for a Turso database. (Here libSQL works on a local file: the library's own network code is not run.)
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function temporaryFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), "lsc-db-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const adapters: { name: string; open: () => Promise<Db> }[] = [
  { name: "SQLite (node:sqlite)", open: async () => openSqlite(":memory:") },
  {
    name: "libSQL (Turso client)",
    open: async () => {
      const { createClient } = await import("@libsql/client");
      const db = openLibsql(createClient({ url: `file:${join(temporaryFolder(), "test.db")}` }));
      cleanups.push(() => db.close());
      return db;
    },
  },
];

describe.each(adapters)("$name", ({ name, open }) => {
  const isLibsql = name.startsWith("libSQL");

  it("runs queries with parameters and returns rows as objects", async () => {
    const db = await open();
    await db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, data BLOB)");
    const blob = new Uint8Array([0, 1, 2, 255]);
    expect(await db.run("INSERT INTO t (name, data) VALUES (?, ?)", ["日本語 ok", blob])).toEqual({ changes: 1 });
    const row = await db.get<{ name: string; data: Uint8Array }>("SELECT name, data FROM t WHERE id = ?", [1]);
    expect(row?.name).toBe("日本語 ok");
    expect(row?.data).toBeInstanceOf(Uint8Array);
    expect([...(row?.data ?? [])]).toEqual([0, 1, 2, 255]);
    expect(await db.get("SELECT * FROM t WHERE id = ?", [99])).toBeUndefined();
    expect(await db.all("SELECT id FROM t")).toEqual([{ id: 1 }]);
  });

  it("handles NULL, numbers, empty results and the number of changed rows", async () => {
    const db = await open();
    await db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER, s TEXT)");
    await db.run("INSERT INTO t (n, s) VALUES (?, ?)", [7, null]);
    await db.run("INSERT INTO t (n, s) VALUES (?, ?)", [8, "x"]);
    expect(await db.all("SELECT n, s FROM t ORDER BY n")).toEqual([
      { n: 7, s: null },
      { n: 8, s: "x" },
    ]);
    expect(await db.run("UPDATE t SET s = ? WHERE n > ?", ["y", 0])).toEqual({ changes: 2 });
    expect(await db.run("UPDATE t SET s = ? WHERE n > ?", ["z", 100])).toEqual({ changes: 0 });
    expect(await db.run("DELETE FROM t WHERE n = ?", [7])).toEqual({ changes: 1 });
    expect(await db.all("SELECT * FROM t WHERE n = ?", [7])).toEqual([]);
  });

  it("reports an error for a wrong statement and works afterwards", async () => {
    const db = await open();
    await expect(db.run("INSERT INTO missing VALUES (1)")).rejects.toThrow();
    await db.run("CREATE TABLE t (x TEXT PRIMARY KEY)");
    await db.run("INSERT INTO t VALUES ('a')");
    await expect(db.run("INSERT INTO t VALUES ('a')")).rejects.toThrow(); // unique
    expect(await db.all("SELECT x FROM t")).toEqual([{ x: "a" }]);
  });

  it("supports upserts and DROP COLUMN, which the migrations use", async () => {
    const db = await open();
    await db.run("CREATE TABLE t (k TEXT PRIMARY KEY, v TEXT NOT NULL, extra BLOB)");
    await db.run("INSERT INTO t (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", ["a", "1"]);
    await db.run("INSERT INTO t (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", ["a", "2"]);
    expect(await db.all("SELECT k, v FROM t")).toEqual([{ k: "a", v: "2" }]);
    await db.run("ALTER TABLE t DROP COLUMN extra");
    expect(await db.all("SELECT * FROM t")).toEqual([{ k: "a", v: "2" }]);
  });

  describe("transactions", () => {
    it("commits when the function finishes", async () => {
      const db = await open();
      await db.run("CREATE TABLE t (x INTEGER)");
      const result = await db.transaction(async (tx) => {
        await tx.run("INSERT INTO t VALUES (1)");
        await tx.run("INSERT INTO t VALUES (2)");
        expect(await tx.all("SELECT x FROM t ORDER BY x")).toEqual([{ x: 1 }, { x: 2 }]); // sees its own writes
        return "done";
      });
      expect(result).toBe("done");
      expect(await db.all("SELECT x FROM t ORDER BY x")).toEqual([{ x: 1 }, { x: 2 }]);
    });

    it("rolls everything back when the function throws", async () => {
      const db = await open();
      await db.run("CREATE TABLE t (x INTEGER)");
      await expect(
        db.transaction(async (tx) => {
          await tx.run("INSERT INTO t VALUES (1)");
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await db.all("SELECT x FROM t")).toEqual([]);
      // and the database is usable afterwards
      await db.run("INSERT INTO t VALUES (3)");
      expect(await db.all("SELECT x FROM t")).toEqual([{ x: 3 }]);
    });

    it("rolls back when a statement inside fails", async () => {
      const db = await open();
      await db.run("CREATE TABLE t (x INTEGER PRIMARY KEY)");
      await expect(
        db.transaction(async (tx) => {
          await tx.run("INSERT INTO t VALUES (1)");
          await tx.run("INSERT INTO t VALUES (1)");
        }),
      ).rejects.toThrow();
      expect(await db.all("SELECT x FROM t")).toEqual([]);
    });

    it("lets a transaction function use a nested transaction call", async () => {
      const db = await open();
      await db.run("CREATE TABLE t (x INTEGER)");
      await db.transaction((tx) => tx.transaction((inner) => inner.run("INSERT INTO t VALUES (5)")));
      expect(await db.all("SELECT x FROM t")).toEqual([{ x: 5 }]);
    });

    it("never shows another request the half-finished state", async () => {
      const db = await open();
      await db.run("CREATE TABLE t (x INTEGER)");
      const slow = db.transaction(async (tx) => {
        await tx.run("INSERT INTO t VALUES (1)");
        await new Promise((resolve) => setTimeout(resolve, 30)); // other requests arrive meanwhile
        await tx.run("INSERT INTO t VALUES (2)");
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const seen = (await db.all<{ x: number }>("SELECT x FROM t ORDER BY x")).map((r) => r.x);
      await slow;
      // SQLite makes the reader wait; libSQL lets it read the data from before the transaction
      expect([[], [1, 2]]).toContainEqual(seen);
      if (!isLibsql) expect(seen).toEqual([1, 2]);
    });

    it("runs a write that arrives during a transaction after it", async () => {
      const db = await open();
      await db.run("CREATE TABLE t (x INTEGER)");
      const slow = db.transaction(async (tx) => {
        await tx.run("INSERT INTO t VALUES (1)");
        await new Promise((resolve) => setTimeout(resolve, 30));
        await tx.run("INSERT INTO t VALUES (2)");
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db.run("INSERT INTO t VALUES (3)");
      await slow;
      expect(await db.all("SELECT x FROM t ORDER BY rowid")).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
    });

    it("runs concurrent transactions one after another", async () => {
      const db = await open();
      await db.run("CREATE TABLE counter (n INTEGER)");
      await db.run("INSERT INTO counter VALUES (0)");
      const bump = () =>
        db.transaction(async (tx) => {
          const row = await tx.get<{ n: number }>("SELECT n FROM counter");
          await new Promise((resolve) => setTimeout(resolve, 2));
          await tx.run("UPDATE counter SET n = ?", [(row?.n ?? 0) + 1]);
        });
      await Promise.all(Array.from({ length: 20 }, bump));
      expect(await db.get("SELECT n FROM counter")).toEqual({ n: 20 }); // no lost updates
    });
  });

  describe("migrate", () => {
    it("creates the schema and can be run again without changes", async () => {
      const db = await open();
      await migrate(db);
      await migrate(db);
      const applied = await db.all<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
      expect(applied.map((m) => m.id)).toEqual(migrations.map((m) => m.id));
      const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(
        (t) => t.name,
      );
      expect(tables).toEqual(
        expect.arrayContaining(["members", "banks", "materials", "material_chunks", "attempts", "sessions", "settings"]),
      );
    });

    it("can be run by two servers at the same time", async () => {
      const db = await open();
      await Promise.all([migrate(db), migrate(db)]);
      const applied = await db.all("SELECT id FROM schema_migrations");
      expect(applied).toHaveLength(migrations.length);
    });

    it("moves a study PDF saved by an older version into the pieces table", async () => {
      const db = await open();
      // the database as the first two migrations left it, with a PDF in it
      for (const migration of migrations.slice(0, 2)) {
        await db.run("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
        for (const statement of migration.statements) await db.run(statement);
        await db.run("INSERT INTO schema_migrations VALUES (?, ?)", [migration.id, "2030-01-01T00:00:00.000Z"]);
      }
      const pdf = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3, 255]);
      await db.run(
        "INSERT INTO materials (test_id, filename, size, sha256, uploaded_at, data) VALUES (?, ?, ?, ?, ?, ?)",
        ["participant", "old.pdf", pdf.length, "abc", "2030-01-01T00:00:00.000Z", pdf],
      );

      await migrate(db);

      const chunk = await db.get<{ idx: number; data: Uint8Array }>(
        "SELECT idx, data FROM material_chunks WHERE test_id = ?",
        ["participant"],
      );
      expect(chunk?.idx).toBe(0);
      expect([...(chunk?.data ?? [])]).toEqual([...pdf]);
      expect(await db.get("SELECT test_id, filename, size FROM materials")).toEqual({
        test_id: "participant",
        filename: "old.pdf",
        size: pdf.length,
      });
    });
  });
});

describe("openSqlite", () => {
  it("persists to a file and reopens it", async () => {
    const file = join(temporaryFolder(), "nested", "app.db");
    const first = openSqlite(file);
    await first.run("CREATE TABLE t (x TEXT)");
    await first.run("INSERT INTO t VALUES (?)", ["kept"]);
    first.close();
    const second = openSqlite(file);
    expect(await second.get("SELECT x FROM t")).toEqual({ x: "kept" });
    second.close();
  });

  it("enforces foreign keys (cascade delete)", async () => {
    const db = openSqlite(":memory:");
    await db.run("CREATE TABLE a (id TEXT PRIMARY KEY)");
    await db.run("CREATE TABLE b (id TEXT PRIMARY KEY, a_id TEXT REFERENCES a(id) ON DELETE CASCADE)");
    await db.run("INSERT INTO a VALUES ('1')");
    await db.run("INSERT INTO b VALUES ('x', '1')");
    await expect(db.run("INSERT INTO b VALUES ('y', 'missing')")).rejects.toThrow();
    await db.run("DELETE FROM a WHERE id = '1'");
    expect(await db.all("SELECT * FROM b")).toEqual([]);
    db.close();
  });
});

describe("migrations", () => {
  it("have unique, ordered ids", () => {
    const ids = migrations.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });
});
