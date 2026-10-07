import type { Client, InValue, ResultSet } from "@libsql/client";
import type { Db, Row, SqlParam } from "./types";

/** Runs tasks one after another. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => task());
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** libSQL hands blobs out as ArrayBuffer; the rest of the app (like node:sqlite) works with Uint8Array. */
function toValue(value: unknown): unknown {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

function toRows<T extends Row>(result: ResultSet): T[] {
  return result.rows.map((row) => {
    const out: Row = {};
    result.columns.forEach((column, index) => {
      out[column] = toValue(row[index]);
    });
    return out as T;
  });
}

/** The three query methods, on top of anything that has `execute` (the client itself or one of its transactions). */
function queries(runner: Pick<Client, "execute">): Pick<Db, "all" | "get" | "run"> {
  const execute = (sql: string, params?: SqlParam[]) =>
    runner.execute({ sql, args: (params ?? []) as InValue[] });

  async function all<T extends Row = Row>(sql: string, params?: SqlParam[]): Promise<T[]> {
    return toRows<T>(await execute(sql, params));
  }
  async function get<T extends Row = Row>(sql: string, params?: SqlParam[]): Promise<T | undefined> {
    return (await all<T>(sql, params))[0];
  }
  async function run(sql: string, params?: SqlParam[]): Promise<{ changes: number }> {
    return { changes: (await execute(sql, params)).rowsAffected };
  }
  return { all, get, run };
}

/**
 * A `Db` on top of a libSQL client: a Turso database over HTTP in production, a local file in the tests.
 * (The client is passed in so that it is created, and the library loaded, only when it is needed.)
 *
 * Unlike the SQLite adapter, reads do not wait for a transaction: the database lives on another
 * machine and handles several connections itself. Writes and transactions of this server still go
 * one at a time, so they do not get in each other's way.
 */
export function openLibsql(client: Client): Db {
  const writes = new Mutex();
  const direct = queries(client);

  const db: Db = {
    all: direct.all,
    get: direct.get,
    run: (sql, params) => writes.run(() => direct.run(sql, params)),
    transaction: (fn) =>
      writes.run(async () => {
        const transaction = await client.transaction("write");
        const inner: Db = {
          ...queries(transaction),
          transaction: (nested) => nested(inner),
          close: () => undefined,
        };
        try {
          const result = await fn(inner);
          await transaction.commit();
          return result;
        } catch (error) {
          try {
            await transaction.rollback();
          } catch {
            // the transaction may already be over (for example when the commit itself failed)
          }
          throw error;
        } finally {
          transaction.close();
        }
      }),
    close: () => client.close(),
  };
  return db;
}
