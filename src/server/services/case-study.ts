import type { CertificationConfig, TestConfig } from "@/lib/certification";
import type { AppContext } from "../context";
import type { Db } from "../db/types";
import { notFound } from "../http/errors";

// Some tests (see `caseStudy` in config/certification.json) end with a few case-study questions. They are
// part of the `questionsPerTest` questions of an attempt: with 3 of 30, an attempt asks 27 ordinary
// questions and then 3 case studies. How many is set by the admin and kept in the settings table;
// until then the number from the config file applies.

const keyOf = (testId: string) => `case_study_per_test:${testId}`;

function parseCount(value: string | undefined, max: number): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** How many of the questions of one attempt are ordinary ones, when `caseStudyPerTest` of them are case studies. */
export const standardPerTest = (test: TestConfig, caseStudyPerTest: number): number =>
  test.questionsPerTest - caseStudyPerTest;

/** Number of case-study questions in one attempt of the test (0 for a test without case studies). */
export async function loadCaseStudyPerTest(db: Db, test: TestConfig): Promise<number> {
  if (!test.caseStudy) return 0;
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [keyOf(test.id)]);
  return parseCount(row?.value, test.questionsPerTest) ?? test.caseStudy.perTest;
}

/** The same for every test of the configuration. */
export async function loadCaseStudyPerTests(db: Db, config: CertificationConfig): Promise<Map<string, number>> {
  const entries = await Promise.all(
    config.tests.map(async (test) => [test.id, await loadCaseStudyPerTest(db, test)] as const),
  );
  return new Map(entries);
}

/** Stores how many of the questions of one attempt are case studies (the caller checks 0 <= perTest <= questionsPerTest). */
export async function setCaseStudyPerTest(ctx: AppContext, test: TestConfig, perTest: number): Promise<number> {
  if (!test.caseStudy) throw notFound("noCaseStudy");
  await ctx.db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [keyOf(test.id), String(perTest)],
  );
  return perTest;
}

/** Whether a stored bank holds enough ordinary and case-study questions for one attempt. */
export function isBankReady(
  test: TestConfig,
  caseStudyPerTest: number,
  counts: { total: number; caseStudy: number },
): boolean {
  return counts.total - counts.caseStudy >= standardPerTest(test, caseStudyPerTest) && counts.caseStudy >= caseStudyPerTest;
}
