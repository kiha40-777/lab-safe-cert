/**
 * Minimal async database interface. All data access in src/server goes through
 * this, and the SQL used by the services sticks to a portable subset (text ids,
 * ISO-8601 timestamps as text, 0/1 integers as booleans, `?` placeholders,
 * ON CONFLICT upserts). That keeps the storage layer replaceable: today it is
 * SQLite (node:sqlite); a Postgres adapter would only need to implement this
 * interface and its own migrations.
 */
export type SqlParam = string | number | bigint | null | Uint8Array;
export type Row = Record<string, unknown>;

export interface Db {
  all<T extends Row = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T extends Row = Row>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  /**
   * Runs `fn` atomically. Inside `fn`, use ONLY the `tx` argument for queries
   * (using the outer `db` would wait for the transaction to finish and deadlock).
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): void;
}
