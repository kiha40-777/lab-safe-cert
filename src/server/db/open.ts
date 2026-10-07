import { join } from "node:path";
import type { Env } from "../env";
import type { Db } from "./types";

export interface OpenedDatabase {
  db: Db;
  /** Where the data is kept, for the start-up message (never contains the access token). */
  location: string;
}

/** The address of a Turso database in the form the libSQL client takes (libsql:// is spoken over HTTPS). */
export function normalizeTursoUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^libsql:/i, "https:"));
  } catch {
    throw new Error(`TURSO_DATABASE_URL is not a valid address: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `TURSO_DATABASE_URL must start with libsql:// or https:// (it starts with ${JSON.stringify(url.protocol + "//")}).`,
    );
  }
  return url;
}

/**
 * Opens the database the settings ask for: the Turso database in TURSO_DATABASE_URL when it is set
 * (the usual choice on a hosting service whose disk is erased), otherwise the SQLite file in the data
 * folder (the usual choice on your own computer). Only the chosen one is loaded.
 */
export async function openDatabase(env: Env): Promise<OpenedDatabase> {
  if (env.tursoUrl === null) {
    const { openSqlite } = await import("./sqlite");
    return { db: openSqlite(join(env.dataDir, "app.db")), location: `Data folder: ${env.dataDir}` };
  }

  const url = normalizeTursoUrl(env.tursoUrl);
  const [{ createClient }, { openLibsql }] = await Promise.all([import("@libsql/client/http"), import("./libsql")]);
  const address = url.origin + (url.pathname === "/" ? "" : url.pathname);
  const db = openLibsql(createClient({ url: address, authToken: env.tursoAuthToken ?? undefined }));
  try {
    await db.get("SELECT 1 AS ok");
  } catch (error) {
    db.close();
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not connect to the Turso database at ${url.host}: ${reason}\n` +
        "Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
      { cause: error },
    );
  }
  return { db, location: `Turso database: ${url.host}` };
}
