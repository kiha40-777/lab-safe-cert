import type { CertificationConfig, TestConfig } from "@/lib/certification";
import {
  COUNT_LIMITS,
  type TestCounts,
  checkCounts,
  defaultCounts,
  isCount,
  standardPerTest,
} from "@/lib/counts";
import type { AppContext } from "../context";
import type { Db } from "../db/types";
import { badRequest } from "../http/errors";

// How many questions the question set of a test holds and how many one attempt asks (case studies are part
// of both numbers, see lib/counts.ts) is set by the admin and kept in the settings table, one row per test.
// Until it is set, the numbers of config/certification.json apply.

const keyOf = (testId: string) => `test_counts:${testId}`;

/** The stored numbers, or null when there are none or they are unusable (a damaged value never breaks a test). */
function parseCounts(value: string | undefined, test: TestConfig): TestCounts | null {
  if (value === undefined) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const fields = Object.keys(COUNT_LIMITS) as (keyof TestCounts)[];
    if (!fields.every((field) => isCount(field, raw[field]))) return null;
    const counts = raw as unknown as TestCounts;
    return checkCounts(counts, test.caseStudy !== undefined).length === 0 ? counts : null;
  } catch {
    return null;
  }
}

export async function loadCounts(db: Db, test: TestConfig): Promise<TestCounts> {
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [keyOf(test.id)]);
  return parseCounts(row?.value, test) ?? defaultCounts(test);
}

/** The same for every test of the configuration. */
export async function loadAllCounts(db: Db, config: CertificationConfig): Promise<Map<string, TestCounts>> {
  const entries = await Promise.all(config.tests.map(async (test) => [test.id, await loadCounts(db, test)] as const));
  return new Map(entries);
}

/** Stores the numbers of a test. They must fit together (the route has already checked that each is a whole number in its range). */
export async function setCounts(ctx: AppContext, test: TestConfig, counts: TestCounts): Promise<TestCounts> {
  const [problem] = checkCounts(counts, test.caseStudy !== undefined);
  if (problem) throw badRequest("invalidCounts", { problem });
  await ctx.db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [keyOf(test.id), JSON.stringify(counts)],
  );
  return counts;
}

/** Whether a stored bank holds enough ordinary and case-study questions for one attempt. */
export function isBankReady(counts: TestCounts, bank: { total: number; caseStudy: number }): boolean {
  return bank.total - bank.caseStudy >= standardPerTest(counts) && bank.caseStudy >= counts.caseStudyPerTest;
}
