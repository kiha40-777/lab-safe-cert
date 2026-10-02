import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, migrations } from "./migrations";
import { openSqlite } from "./sqlite";

describe("openSqlite", () => {
  it("runs queries with parameters and returns rows as objects", async () => {
    const db = openSqlite(":memory:");
    await db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, data BLOB)");
    const blob = new Uint8Array([0, 1, 2, 255]);
    expect(await db.run("INSERT INTO t (name, data) VALUES (?, ?)", ["日本語 ok", blob])).toEqual({ changes: 1 });
    const row = await db.get<{ name: string; data: Uint8Array }>("SELECT name, data FROM t WHERE id = ?", [1]);
    expect(row?.name).toBe("日本語 ok");
    expect([...(row?.data ?? [])]).toEqual([0, 1, 2, 255]);
    expect(await db.get("SELECT * FROM t WHERE id = ?", [99])).toBeUndefined();
    expect(await db.all("SELECT id FROM t")).toEqual([{ id: 1 }]);
    db.close();
  });

  it("persists to a file and reopens it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsc-db-"));
    try {
      const file = join(dir, "nested", "app.db");
      const first = openSqlite(file);
      await first.run("CREATE TABLE t (x TEXT)");
      await first.run("INSERT INTO t VALUES (?)", ["kept"]);
      first.close();
      const second = openSqlite(file);
      expect(await second.get("SELECT x FROM t")).toEqual({ x: "kept" });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  describe("transactions", () => {
    it("commits when the function finishes", async () => {
      const db = openSqlite(":memory:");
      await db.run("CREATE TABLE t (x INTEGER)");
      const result = await db.transaction(async (tx) => {
        await tx.run("INSERT INTO t VALUES (1)");
        await tx.run("INSERT INTO t VALUES (2)");
        return "done";
      });
      expect(result).toBe("done");
      expect(await db.all("SELECT x FROM t ORDER BY x")).toEqual([{ x: 1 }, { x: 2 }]);
    });

    it("rolls everything back when the function throws", async () => {
      const db = openSqlite(":memory:");
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

    it("keeps other requests out until the transaction is finished", async () => {
      const db = openSqlite(":memory:");
      await db.run("CREATE TABLE t (x INTEGER)");
      const log: string[] = [];
      const slow = db.transaction(async (tx) => {
        await tx.run("INSERT INTO t VALUES (1)");
        log.push("tx inserted 1");
        await new Promise((resolve) => setTimeout(resolve, 30)); // other requests arrive meanwhile
        await tx.run("INSERT INTO t VALUES (2)");
        log.push("tx inserted 2");
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const other = db.all<{ x: number }>("SELECT x FROM t ORDER BY x").then((rows) => {
        log.push(`other saw ${rows.map((r) => r.x).join(",")}`);
      });
      await Promise.all([slow, other]);
      // the reader never sees the half-finished state "1"
      expect(log).toEqual(["tx inserted 1", "tx inserted 2", "other saw 1,2"]);
    });

    it("runs concurrent transactions one after another", async () => {
      const db = openSqlite(":memory:");
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
});

describe("migrate", () => {
  it("creates the schema and can be run again without changes", async () => {
    const db = openSqlite(":memory:");
    await migrate(db);
    await migrate(db);
    const applied = await db.all<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
    expect(applied.map((m) => m.id)).toEqual(migrations.map((m) => m.id));
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(
      (t) => t.name,
    );
    expect(tables).toEqual(
      expect.arrayContaining(["members", "banks", "materials", "attempts", "sessions", "settings"]),
    );
    db.close();
  });

  it("has unique, ordered migration ids", () => {
    const ids = migrations.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });
});
