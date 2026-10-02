import type { Issue, ValidationSummary } from "@/lib/types";

/** A question in its stored form. `answerIndex` is 0-based; the JSON file uses letters (A, B, ...). */
export interface Question {
  id: string;
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
  /** Fewer questions than this is an error (one attempt could not be drawn). */
  minQuestions: number;
  /** A different number is only a warning. */
  expectedQuestions: number;
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
