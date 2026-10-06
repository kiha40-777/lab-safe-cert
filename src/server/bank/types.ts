import type { Issue, QuestionKind, ValidationSummary } from "@/lib/types";

/** A question in its stored form. `answerIndex` is 0-based; the JSON file uses letters (A, B, ...). */
export interface Question {
  id: string;
  /** Banks stored before case studies existed have no kind; they are read as "standard". */
  kind: QuestionKind;
  text: string;
  choices: string[];
  answerIndex: number;
  explanation: string | null;
  source: string | null;
}

/** Descriptive info about where the questions came from (all optional in the JSON file). */
export interface BankInfo {
  generator: string | null;
  generatedAt: string | null;
  source: string | null;
}

export interface Bank {
  info: BankInfo;
  questions: Question[];
}

/** Limits the question bank of one test is checked against (derived from config/certification.json). */
export interface BankRules {
  /** Fewer standard questions than this is an error (one attempt could not be drawn). */
  minQuestions: number;
  /** A different number of standard questions is only a warning. */
  expectedQuestions: number;
  /**
   * Case-study questions of the test: fewer than `perTest` in the bank is an error, a number other than
   * `expected` only a warning. null for a test that does not use case studies (such questions in a file are
   * then only reported, never asked).
   */
  caseStudy: { perTest: number; expected: number } | null;
  minChoices: number;
  maxChoices: number;
  preferredChoices: number;
}

export interface ValidationOutcome {
  errors: Issue[];
  warnings: Issue[];
  infos: Issue[];
  /** The normalized bank; null when there are errors. */
  bank: Bank | null;
  summary: ValidationSummary | null;
}
