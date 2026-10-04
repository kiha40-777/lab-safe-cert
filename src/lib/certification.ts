// The certification ladder (roles and the tests that move people up it) is
// defined as data in config/certification.json. This module describes and
// validates that data. It is shared by the server and the browser.

export interface TestConfig {
  /** Stable id, used in URLs, the database and the language files (tests.<id>.name). */
  id: string;
  /** Role a person must have to take this test. */
  requiresRole: string;
  /** Role the person receives when they pass. */
  grantsRole: string;
  /** How many questions are drawn from the question bank for one attempt. */
  questionsPerTest: number;
  /** How many questions the question bank is expected to contain (a warning, not an error, when different). */
  expectedBankSize: number;
  /** Share of correct answers needed to pass, 0 < passRate <= 1 (1 = all correct). */
  passRate: number;
  /**
   * Present only on a test that can have case-study questions. They are part of the
   * `questionsPerTest` questions of an attempt (a test of 30 with 3 case studies asks 27 ordinary
   * questions and then 3 case studies), are drawn separately from the bank and always appear last.
   * The numbers are the defaults; the admin screen can change `perTest` (and the number the
   * AI is asked to write) without editing this file.
   */
  caseStudy?: CaseStudyConfig;
}

export interface CaseStudyConfig {
  /** How many case-study questions the AI prompt asks for (0 = none). */
  bankSize: number;
  /** How many of the questions of one attempt are case studies (0 = none; at most `questionsPerTest`). */
  perTest: number;
}

export interface CertificationConfig {
  schemaVersion: 1;
  roles: string[];
  defaultRole: string;
  questionBank: {
    minChoices: number;
    maxChoices: number;
    preferredChoices: number;
  };
  shuffle: {
    questions: boolean;
    choices: boolean;
  };
  tests: TestConfig[];
}

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** Upper limit of case-study questions per test (in the bank and in one attempt). */
export const MAX_CASE_STUDY = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Validates the parsed JSON and returns it typed. Throws one readable Error listing every problem. */
export function validateCertificationConfig(input: unknown): CertificationConfig {
  if (!isRecord(input)) {
    throw new Error("config/certification.json must contain a JSON object.");
  }
  const problems: string[] = [];
  const fail = (message: string) => {
    problems.push(message);
  };

  if (input.schemaVersion !== 1) fail('"schemaVersion" must be 1.');

  // roles
  const roles: string[] = [];
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    fail('"roles" must be a non-empty array of role ids.');
  } else {
    for (const role of input.roles) {
      if (typeof role !== "string" || !ID_PATTERN.test(role)) {
        fail(`Invalid role id ${JSON.stringify(role)}: use lowercase letters, digits, "-" or "_".`);
      } else if (roles.includes(role)) {
        fail(`Duplicate role id "${role}".`);
      } else {
        roles.push(role);
      }
    }
  }
  const defaultRole = typeof input.defaultRole === "string" ? input.defaultRole : "";
  if (!roles.includes(defaultRole)) fail('"defaultRole" must be one of "roles".');

  // question bank rules
  const bank = isRecord(input.questionBank) ? input.questionBank : {};
  const minChoices = bank.minChoices;
  const maxChoices = bank.maxChoices;
  const preferredChoices = bank.preferredChoices;
  if (!isIntInRange(minChoices, 2, 8)) fail('"questionBank.minChoices" must be an integer from 2 to 8.');
  if (!isIntInRange(maxChoices, 2, 8)) fail('"questionBank.maxChoices" must be an integer from 2 to 8.');
  if (!isIntInRange(preferredChoices, 2, 8)) fail('"questionBank.preferredChoices" must be an integer from 2 to 8.');
  if (
    typeof minChoices === "number" &&
    typeof maxChoices === "number" &&
    typeof preferredChoices === "number" &&
    !(minChoices <= preferredChoices && preferredChoices <= maxChoices)
  ) {
    fail('"questionBank" must satisfy minChoices <= preferredChoices <= maxChoices.');
  }

  // shuffle
  const shuffle = isRecord(input.shuffle) ? input.shuffle : {};
  if (typeof shuffle.questions !== "boolean") fail('"shuffle.questions" must be true or false.');
  if (typeof shuffle.choices !== "boolean") fail('"shuffle.choices" must be true or false.');

  // tests
  const tests: TestConfig[] = [];
  if (!Array.isArray(input.tests) || input.tests.length === 0) {
    fail('"tests" must be a non-empty array.');
  } else {
    for (const [i, raw] of input.tests.entries()) {
      const where = `tests[${i}]`;
      if (!isRecord(raw)) {
        fail(`${where} must be an object.`);
        continue;
      }
      const id = raw.id;
      if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        fail(`${where}.id must be lowercase letters, digits, "-" or "_" (starting with a letter).`);
        continue;
      }
      if (tests.some((t) => t.id === id)) fail(`Duplicate test id "${id}".`);
      const { requiresRole, grantsRole, questionsPerTest, expectedBankSize, passRate, caseStudy: rawCaseStudy } = raw;
      if (typeof requiresRole !== "string" || !roles.includes(requiresRole)) {
        fail(`${where}.requiresRole must be one of "roles".`);
        continue;
      }
      if (typeof grantsRole !== "string" || !roles.includes(grantsRole)) {
        fail(`${where}.grantsRole must be one of "roles".`);
        continue;
      }
      if (requiresRole === grantsRole) fail(`${where}: requiresRole and grantsRole must differ.`);
      if (!isIntInRange(questionsPerTest, 1, 500)) {
        fail(`${where}.questionsPerTest must be an integer from 1 to 500.`);
        continue;
      }
      if (!isIntInRange(expectedBankSize, questionsPerTest, 5000)) {
        fail(`${where}.expectedBankSize must be an integer >= questionsPerTest.`);
        continue;
      }
      if (typeof passRate !== "number" || !(passRate > 0 && passRate <= 1)) {
        fail(`${where}.passRate must be a number greater than 0 and at most 1.`);
        continue;
      }
      let caseStudy: CaseStudyConfig | undefined;
      if (rawCaseStudy !== undefined) {
        const bankSize = isRecord(rawCaseStudy) ? rawCaseStudy.bankSize : undefined;
        const perTest = isRecord(rawCaseStudy) ? rawCaseStudy.perTest : undefined;
        if (!isIntInRange(bankSize, 0, MAX_CASE_STUDY) || !isIntInRange(perTest, 0, MAX_CASE_STUDY)) {
          fail(`${where}.caseStudy must be { "bankSize": n, "perTest": n } with integers from 0 to ${MAX_CASE_STUDY}.`);
          continue;
        }
        if (perTest > bankSize) {
          fail(`${where}.caseStudy.perTest must not be larger than caseStudy.bankSize.`);
          continue;
        }
        if (perTest > questionsPerTest) {
          fail(`${where}.caseStudy.perTest must not be larger than questionsPerTest (case studies are part of the questions of a test).`);
          continue;
        }
        caseStudy = { bankSize, perTest };
      }
      tests.push({
        id,
        requiresRole,
        grantsRole,
        questionsPerTest,
        expectedBankSize,
        passRate,
        ...(caseStudy ? { caseStudy } : {}),
      });
    }

    // Each role can lead to at most one test, and the ladder must not loop.
    const seenRequires = new Set<string>();
    for (const test of tests) {
      if (seenRequires.has(test.requiresRole)) {
        fail(`More than one test requires the role "${test.requiresRole}"; a role can lead to only one test.`);
      }
      seenRequires.add(test.requiresRole);
    }
    for (const start of tests) {
      let current: TestConfig | undefined = start;
      for (let step = 0; step <= tests.length && current; step++) {
        const grants: string = current.grantsRole;
        if (grants === start.requiresRole) {
          fail(`The tests form a loop starting at role "${start.requiresRole}".`);
          break;
        }
        current = tests.find((t) => t.requiresRole === grants);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid config/certification.json:\n - ${problems.join("\n - ")}`);
  }

  return {
    schemaVersion: 1,
    roles,
    defaultRole,
    questionBank: {
      minChoices: minChoices as number,
      maxChoices: maxChoices as number,
      preferredChoices: preferredChoices as number,
    },
    shuffle: { questions: shuffle.questions as boolean, choices: shuffle.choices as boolean },
    tests,
  };
}

export function findTest(config: CertificationConfig, testId: string): TestConfig | undefined {
  return config.tests.find((t) => t.id === testId);
}

/** The test a person with this role can take next (undefined when they are at the top of the ladder). */
export function testForRole(config: CertificationConfig, role: string): TestConfig | undefined {
  return config.tests.find((t) => t.requiresRole === role);
}

export function isKnownRole(config: CertificationConfig, role: string): boolean {
  return config.roles.includes(role);
}

/**
 * Number of correct answers needed to pass a test of `total` questions:
 * ceil(passRate * total), robust against floating point error (0.7 * 10 = 7.000000000000001).
 */
export function requiredScore(total: number, passRate: number): number {
  return Math.ceil(passRate * total - 1e-9);
}
