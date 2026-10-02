// Helpers for automated tests only (never imported by application code).
// The generated questions are meaningless placeholders, not real content.
import { openSqlite } from "./db/sqlite";
import { migrate } from "./db/migrations";
import type { CertificationConfig } from "@/lib/certification";
import { certification } from "@/lib/config";
import { createContext, type AppContext } from "./context";
import { readEnv } from "./env";
import type { Rng } from "./rng";
import type { Question } from "./bank/types";
import { letterOf } from "./bank/validate";

/** Deterministic random numbers (mulberry32) so tests do not flake. */
export function seededRng(seed = 1): Rng {
  let state = seed >>> 0;
  let counter = 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    token: (bytes = 32) => {
      let out = "";
      for (let i = 0; i < bytes; i++) out += Math.floor(next() * 256).toString(16).padStart(2, "0");
      return out;
    },
  };
}

/** Placeholder questions; the correct choice rotates through A, B, C, D, ... */
export function makeQuestions(count: number, choiceCount = 4): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${String(i + 1).padStart(3, "0")}`,
    text: `Placeholder question number ${i + 1}, used only by automated tests.`,
    choices: Array.from({ length: choiceCount }, (_, k) => `Placeholder value ${i + 1}.${k + 1}`),
    answerIndex: i % choiceCount,
    explanation: null,
    source: null,
  }));
}

/** A question-bank file (as JSON text) made of placeholder questions. */
export function makeBankJson(count: number, choiceCount = 4, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: 1,
    meta: { generator: "test-suite", generated_at: "2000-01-01", source: "placeholder" },
    questions: makeQuestions(count, choiceCount).map((q) => ({
      id: q.id,
      question: q.text,
      choices: q.choices,
      answer: letterOf(q.answerIndex),
    })),
    ...extra,
  });
}

/** A fresh in-memory database with all migrations applied and a controllable clock. */
export async function makeTestContext(
  options: {
    env?: Record<string, string>;
    seed?: number;
    config?: CertificationConfig;
  } = {},
): Promise<AppContext & { setNow: (date: Date) => void; advance: (ms: number) => void }> {
  const db = openSqlite(":memory:");
  let current = new Date("2030-01-01T00:00:00.000Z");
  const clock = () => current;
  await migrate(db, clock);
  const ctx = createContext({
    db,
    config: options.config ?? certification,
    env: readEnv({ DATA_DIR: "/tmp/lab-safe-cert-test-unused", ...options.env }),
    now: clock,
    rng: seededRng(options.seed ?? 42),
  });
  return Object.assign(ctx, {
    setNow: (date: Date) => {
      current = date;
    },
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  });
}

/** The correct answer index of every question of an attempt, read from the stored snapshot. */
export async function correctAnswersOf(ctx: AppContext, attemptId: string): Promise<number[]> {
  const row = await ctx.db.get<{ questions_json: string }>("SELECT questions_json FROM attempts WHERE id = ?", [
    attemptId,
  ]);
  if (!row) throw new Error(`attempt ${attemptId} not found`);
  return (JSON.parse(row.questions_json) as { answerIndex: number }[]).map((q) => q.answerIndex);
}
