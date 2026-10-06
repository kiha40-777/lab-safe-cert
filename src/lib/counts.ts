// The numbers a test is built with: how many questions the question set holds and how many one attempt asks,
// and in each how many are case studies. Case studies are always part of the total, never on top of it:
// a set of 60 with 10 case studies holds 50 ordinary questions, a test of 30 with 3 holds 27.
// Shared by the server and the admin screen, so both check the numbers the same way.
import type { TestConfig } from "./certification";

export interface TestCounts {
  /** Questions in the question set (case studies included). */
  bankSize: number;
  /** Questions in one attempt (case studies included). */
  perTest: number;
  /** Of the question set: case studies (0 for a test without them). */
  caseStudyBankSize: number;
  /** Of one attempt: case studies (0 for a test without them). */
  caseStudyPerTest: number;
}

/** [least, most] of each number. */
export const COUNT_LIMITS: Record<keyof TestCounts, readonly [number, number]> = {
  bankSize: [1, 5000],
  perTest: [1, 500],
  caseStudyBankSize: [0, 5000],
  caseStudyPerTest: [0, 500],
};

export const MAX_BANK_SIZE = COUNT_LIMITS.bankSize[1];
export const MAX_PER_TEST = COUNT_LIMITS.perTest[1];

export function isCount(field: keyof TestCounts, value: unknown): value is number {
  const [least, most] = COUNT_LIMITS[field];
  return typeof value === "number" && Number.isInteger(value) && value >= least && value <= most;
}

/** The numbers a test starts with: the ones written in config/certification.json. */
export function defaultCounts(test: TestConfig): TestCounts {
  return {
    bankSize: test.expectedBankSize,
    perTest: test.questionsPerTest,
    caseStudyBankSize: test.caseStudy?.bankSize ?? 0,
    caseStudyPerTest: test.caseStudy?.perTest ?? 0,
  };
}

/** Ordinary (non-case-study) questions in the question set. */
export const standardBankSize = (counts: TestCounts): number => counts.bankSize - counts.caseStudyBankSize;

/** Ordinary (non-case-study) questions in one attempt. */
export const standardPerTest = (counts: TestCounts): number => counts.perTest - counts.caseStudyPerTest;

/** What is wrong when the numbers do not fit together (each is translated in the admin screen). */
export type CountsProblem =
  | "perTestAboveBank"
  | "caseStudyBankAboveBank"
  | "caseStudyPerTestAbovePerTest"
  | "caseStudyPerTestAboveBank"
  | "ordinaryShort"
  | "noCaseStudies";

/**
 * Whether the numbers fit together (each one must already be in its range, see COUNT_LIMITS):
 * a test cannot ask more than the set holds, in total and for each kind, and a test without case
 * studies has none. Returns the problems found; an empty list means the numbers are fine.
 */
export function checkCounts(counts: TestCounts, supportsCaseStudy: boolean): CountsProblem[] {
  const problems: CountsProblem[] = [];
  if (!supportsCaseStudy && (counts.caseStudyBankSize !== 0 || counts.caseStudyPerTest !== 0)) {
    problems.push("noCaseStudies");
  }
  if (counts.perTest > counts.bankSize) problems.push("perTestAboveBank");
  if (counts.caseStudyBankSize > counts.bankSize) problems.push("caseStudyBankAboveBank");
  if (counts.caseStudyPerTest > counts.perTest) problems.push("caseStudyPerTestAbovePerTest");
  if (counts.caseStudyPerTest > counts.caseStudyBankSize) problems.push("caseStudyPerTestAboveBank");
  // Only said when nothing above explains it: the set has fewer ordinary questions than a test needs.
  if (problems.length === 0 && standardPerTest(counts) > standardBankSize(counts)) problems.push("ordinaryShort");
  return problems;
}
