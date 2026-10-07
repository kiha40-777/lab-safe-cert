import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { readEnv } from "../env";
import { normalizeTursoUrl, openDatabase } from "./open";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("normalizeTursoUrl", () => {
  it("speaks libsql:// over HTTPS and keeps https:// and http:// as they are", () => {
    expect(normalizeTursoUrl("libsql://lab-safe-cert-team.turso.io").href).toBe("https://lab-safe-cert-team.turso.io/");
    expect(normalizeTursoUrl(" LIBSQL://a.turso.io ").host).toBe("a.turso.io");
    expect(normalizeTursoUrl("https://a.turso.io").protocol).toBe("https:");
    expect(normalizeTursoUrl("http://127.0.0.1:8080").host).toBe("127.0.0.1:8080");
  });

  it("explains what is wrong with other addresses", () => {
    expect(() => normalizeTursoUrl("file:app.db")).toThrow(/must start with libsql:\/\/ or https:\/\//);
    expect(() => normalizeTursoUrl("wss://a.turso.io")).toThrow(/must start with libsql:\/\/ or https:\/\//);
    expect(() => normalizeTursoUrl("not a url")).toThrow(/not a valid address/);
  });
});

describe("openDatabase", () => {
  it("opens the SQLite file in the data folder when no Turso database is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsc-open-"));
    folders.push(dir);
    const { db, location } = await openDatabase(readEnv({ DATA_DIR: dir }));
    expect(location).toBe(`Data folder: ${dir}`);
    await db.run("CREATE TABLE t (x INTEGER)");
    db.close();
  });

  it("reports a Turso database that cannot be reached, without printing the token", async () => {
    // a port nobody listens on: the connection is refused at once
    const port = await new Promise<number>((resolve) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as { port: number };
        server.close(() => resolve(port));
      });
    });
    const env = readEnv({ TURSO_DATABASE_URL: `http://127.0.0.1:${port}`, TURSO_AUTH_TOKEN: "super-secret-token" });
    const failure = await openDatabase(env).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toContain(`Could not connect to the Turso database at 127.0.0.1:${port}`);
    expect(failure?.message).toContain("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
    expect(failure?.message).not.toContain("super-secret-token");
  });

  it("refuses an address that is not a Turso address before connecting", async () => {
    await expect(openDatabase(readEnv({ TURSO_DATABASE_URL: "file:/tmp/x.db" }))).rejects.toThrow(
      /must start with libsql/,
    );
  });
});
