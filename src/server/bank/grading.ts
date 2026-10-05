import { requiredScore } from "@/lib/certification";
import type { QuestionKind } from "@/lib/types";
import { type Rng, shuffleInPlace } from "../rng";
import type { Question } from "./types";

/** A question as drawn for one attempt: choices are in the order shown to the person. */
export interface DrawnQuestion {
  id: string;
  /** Missing in attempts stored before case studies existed (read as "standard"). */
  kind?: QuestionKind;
  text: string;
  choices: string[];
  answerIndex: number;
  explanation: string | null;
  source: string | null;
}

export interface DrawOptions {
  /** Present the drawn questions in random order (otherwise in bank order). */
  shuffleQuestions: boolean;
  /** Present each question's choices in random order. */
  shuffleChoices: boolean;
}

/**
 * Draws `count` different questions at random from the bank. The result is a
 * self-contained snapshot: it is stored with the attempt, so the attempt can
 * still be graded and displayed if the bank is edited or replaced later.
 */
export function drawQuestions(
  bank: Question[],
  count: number,
  options: DrawOptions,
  rng: Rng,
): DrawnQuestion[] {
  if (!Number.isInteger(count) || count < 1 || count > bank.length) {
    throw new RangeError(`Cannot draw ${count} questions from a bank of ${bank.length}.`);
  }
  const order = bank.map((_, index) => index);
  shuffleInPlace(order, rng);
  const picked = order.slice(0, count);
  if (!options.shuffleQuestions) picked.sort((a, b) => a - b);

  return picked.map((bankIndex) => {
    const question = bank[bankIndex] as Question;
    const permutation = question.choices.map((_, index) => index);
    if (options.shuffleChoices) shuffleInPlace(permutation, rng);
    return {
      id: question.id,
      kind: question.kind,
      text: question.text,
      choices: permutation.map((from) => question.choices[from] as string),
      answerIndex: permutation.indexOf(question.answerIndex),
      explanation: question.explanation,
      source: question.source,
    };
  });
}

export interface DrawPlan {
  /** Ordinary questions to draw. */
  standard: number;
  /** Case-study questions to draw (0 = none). */
  caseStudy: number;
}

/**
 * Draws the questions of one attempt: first the ordinary ones, then the case studies. Each kind is drawn
 * (and, if shuffling is on, ordered) at random on its own, so the case studies always come last, together.
 */
export function drawAttempt(bank: Question[], plan: DrawPlan, options: DrawOptions, rng: Rng): DrawnQuestion[] {
  const standard = bank.filter((q) => q.kind !== "case_study");
  const caseStudies = bank.filter((q) => q.kind === "case_study");
  return [
    ...(plan.standard > 0 ? drawQuestions(standard, plan.standard, options, rng) : []),
    ...(plan.caseStudy > 0 ? drawQuestions(caseStudies, plan.caseStudy, options, rng) : []),
  ];
}

export interface Grade {
  score: number;
  total: number;
  passed: boolean;
  /** Per question: was it answered correctly? */
  correct: boolean[];
}

export { requiredScore };

/** Grades answers (index of the chosen choice, or null when unanswered). */
export function gradeAnswers(
  questions: DrawnQuestion[],
  answers: (number | null)[],
  passRate: number,
): Grade {
  const correct = questions.map((question, i) => answers[i] === question.answerIndex);
  const score = correct.filter(Boolean).length;
  const total = questions.length;
  return { score, total, correct, passed: total > 0 && score >= requiredScore(total, passRate) };
}
