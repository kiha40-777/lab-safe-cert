import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db, Row, SqlParam } from "./types";

/** Runs tasks one after another, so statements of different requests never interleave inside a transaction. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(() => task());
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function toInputs(params: SqlParam[] | undefined): SQLInputValue[] {
  return (params ?? []) as SQLInputValue[];
}

/**
 * Opens (creating if needed) a SQLite database file, or an in-memory database
 * when `file` is ":memory:". Uses Node's built-in `node:sqlite` module, which
 * needs no compilation or extra packages (Node.js 22.13 or newer).
 */
export function openSqlite(file: string): Db {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  const mutex = new Mutex();

  const all = <T extends Row>(sql: string, params?: SqlParam[]) =>
    raw.prepare(sql).all(...toInputs(params)) as T[];
  const get = <T extends Row>(sql: string, params?: SqlParam[]) =>
    raw.prepare(sql).get(...toInputs(params)) as T | undefined;
  const run = (sql: string, params?: SqlParam[]) => ({
    changes: Number(raw.prepare(sql).run(...toInputs(params)).changes),
  });

  const db: Db = {
    all: (sql, params) => mutex.run(() => all(sql, params)) as never,
    get: (sql, params) => mutex.run(() => get(sql, params)) as never,
    run: (sql, params) => mutex.run(() => run(sql, params)),
    transaction: (fn) =>
      mutex.run(async () => {
        raw.exec("BEGIN IMMEDIATE");
        // Inside the transaction the mutex is already held: execute directly.
        const tx: Db = {
          all: async (sql, params) => all(sql, params) as never,
          get: async (sql, params) => get(sql, params) as never,
          run: async (sql, params) => run(sql, params),
          transaction: (inner) => inner(tx),
          close: () => undefined,
        };
        try {
          const result = await fn(tx);
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          try {
            raw.exec("ROLLBACK");
          } catch {
            // the transaction may already have been rolled back by SQLite
          }
          throw error;
        }
      }),
    close: () => raw.close(),
  };
  return db;
}
