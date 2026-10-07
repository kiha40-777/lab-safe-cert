import { certification } from "@/lib/config";
import type { CertificationConfig } from "@/lib/certification";
import { LoginRateLimiter } from "./auth/rate-limit";
import { migrate } from "./db/migrations";
import { openDatabase } from "./db/open";
import type { Db } from "./db/types";
import { readEnv, type Env } from "./env";
import { cryptoRng, type Rng } from "./rng";
import { ensurePasswords, isPasswordSet } from "./services/settings";
import { printStartupNotice } from "./startup-notice";

/** Everything a service needs. Passed explicitly so tests can swap in an in-memory database and a fake clock. */
export interface AppContext {
  db: Db;
  config: CertificationConfig;
  env: Env;
  now: () => Date;
  rng: Rng;
  limiter: LoginRateLimiter;
}

export function createContext(
  parts: Pick<AppContext, "db"> & Partial<Omit<AppContext, "db">>,
): AppContext {
  const now = parts.now ?? (() => new Date());
  return {
    db: parts.db,
    config: parts.config ?? certification,
    env: parts.env ?? readEnv(),
    now,
    rng: parts.rng ?? cryptoRng,
    limiter: parts.limiter ?? new LoginRateLimiter(() => now().getTime()),
  };
}

type Store = typeof globalThis & { __labSafeCert?: Promise<AppContext> };

async function startApp(): Promise<AppContext> {
  const env = readEnv();
  const { db, location } = await openDatabase(env);
  await migrate(db);
  const ctx = createContext({ db, env });
  const { generatedAdminPassword, resetIgnored } = await ensurePasswords(ctx);
  printStartupNotice({
    generatedAdminPassword,
    resetIgnored,
    participantPasswordSet: await isPasswordSet(ctx, "participant"),
    location,
  });
  return ctx;
}

/**
 * The context of the running server. Created once per process (and kept on
 * `globalThis`, so development hot-reloads do not open the database twice).
 */
export function getAppContext(): Promise<AppContext> {
  const store = globalThis as Store;
  store.__labSafeCert ??= startApp().catch((error: unknown) => {
    store.__labSafeCert = undefined;
    throw error;
  });
  return store.__labSafeCert;
}

/** Closes the running server's context so the next call starts a fresh one (tests only). */
export async function resetAppContextForTests(): Promise<void> {
  const store = globalThis as Store;
  const pending = store.__labSafeCert;
  store.__labSafeCert = undefined;
  if (pending) (await pending.catch(() => null))?.db.close();
}
