import { findTest } from "@/lib/certification";
import type { AttemptDetail, AttemptResult, AttemptSummary, AttemptView } from "@/lib/types";
import { standardPerTest } from "@/lib/counts";
import { type DrawnQuestion, drawAttempt, gradeAnswers, requiredScore } from "../bank/grading";
import type { AppContext } from "../context";
import type { Db, Row } from "../db/types";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import { loadBank } from "./banks";
import { isBankReady, loadCounts } from "./counts";
import { requireMemberRow } from "./members";

export interface AttemptRow extends Row {
  id: string;
  member_id: string;
  test_id: string;
  status: string;
  questions_json: string;
  answers_json: string;
  score: number | null;
  total: number;
  required_score: number | null;
  passed: number | null;
  promoted_to: string | null;
  started_at: string;
  submitted_at: string | null;
}

/** Row of an attempt without the (large) question snapshot, for lists and statistics. */
export interface SummaryRow extends Row {
  id: string;
  member_id: string;
  test_id: string;
  status: string;
  score: number | null;
  total: number;
  passed: number | null;
  promoted_to: string | null;
  started_at: string;
  submitted_at: string | null;
}

const COLUMNS =
  "id, member_id, test_id, status, questions_json, answers_json, score, total, required_score, passed, promoted_to, started_at, submitted_at";
export const SUMMARY_COLUMNS =
  "id, member_id, test_id, status, score, total, passed, promoted_to, started_at, submitted_at";

/** An unfinished attempt is picked up again after a reload for this long. */
const RESUME_WINDOW_MS = 24 * 60 * 60_000;

export type Actor = { kind: "member"; memberId: string } | { kind: "admin" };

export function toSummary(row: SummaryRow): AttemptSummary {
  return {
    id: row.id,
    testId: row.test_id,
    status: row.status as AttemptSummary["status"],
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    score: row.score,
    total: row.total,
    passed: row.passed === null ? null : row.passed === 1,
    promotedTo: row.promoted_to,
  };
}

const questionsOf = (row: AttemptRow) => JSON.parse(row.questions_json) as DrawnQuestion[];
const answersOf = (row: AttemptRow) => JSON.parse(row.answers_json) as (number | null)[];

function toView(row: AttemptRow, resumed: boolean): AttemptView {
  return {
    id: row.id,
    testId: row.test_id,
    status: "in_progress",
    startedAt: row.started_at,
    // the answers and explanations are deliberately left out until the attempt is submitted
    questions: questionsOf(row).map((q) => ({ text: q.text, choices: q.choices })),
    answers: answersOf(row),
    resumed,
  };
}

function toResult(row: AttemptRow, memberName: string): AttemptResult {
  const answers = answersOf(row);
  return {
    id: row.id,
    testId: row.test_id,
    memberId: row.member_id,
    memberName,
    status: "submitted",
    startedAt: row.started_at,
    submittedAt: row.submitted_at ?? row.started_at,
    score: row.score ?? 0,
    total: row.total,
    requiredScore: row.required_score ?? row.total,
    passed: row.passed === 1,
    promotedTo: row.promoted_to,
    questions: questionsOf(row).map((q, i) => ({
      text: q.text,
      choices: q.choices,
      answerIndex: q.answerIndex,
      chosenIndex: answers[i] ?? null,
      correct: answers[i] === q.answerIndex,
      explanation: q.explanation,
      source: q.source,
    })),
  };
}

/** Checks a list of answers against the drawn questions: one entry per question, an index or null. */
export function parseAnswerList(raw: unknown, questions: DrawnQuestion[]): (number | null)[] {
  if (!Array.isArray(raw) || raw.length !== questions.length) throw badRequest("invalidAnswers");
  return raw.map((value: unknown, i) => {
    if (value === null) return null;
    const question = questions[i] as DrawnQuestion;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < question.choices.length) {
      return value;
    }
    throw badRequest("invalidAnswers");
  });
}

/**
 * Starts an attempt for a person: draws the questions and stores them. When the
 * person already has an unfinished attempt for this test, that one is returned
 * instead, so reloading the page cannot be used to draw a fresh, easier set.
 */
export async function startAttempt(ctx: AppContext, memberId: string, testId: string): Promise<AttemptView> {
  const test = findTest(ctx.config, testId);
  if (!test) throw notFound("unknownTest");

  return ctx.db.transaction(async (tx) => {
    const member = await requireMemberRow(tx, memberId);
    if (member.role !== test.requiresRole) throw forbidden("wrongRole");

    const open = await tx.get<AttemptRow>(
      `SELECT ${COLUMNS} FROM attempts
       WHERE member_id = ? AND test_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
      [memberId, testId],
    );
    if (open) {
      if (ctx.now().getTime() - Date.parse(open.started_at) < RESUME_WINDOW_MS) return toView(open, true);
      await tx.run("UPDATE attempts SET status = 'abandoned' WHERE id = ?", [open.id]);
    }

    const bank = await loadBank(tx, testId);
    const counts = await loadCounts(tx, test);
    const available = {
      total: bank?.questions.length ?? 0,
      caseStudy: bank?.questions.filter((q) => q.kind === "case_study").length ?? 0,
    };
    if (!bank || !isBankReady(counts, available)) throw conflict("testNotReady");

    const drawn = drawAttempt(
      bank.questions,
      { standard: standardPerTest(counts), caseStudy: counts.caseStudyPerTest },
      { shuffleQuestions: ctx.config.shuffle.questions, shuffleChoices: ctx.config.shuffle.choices },
      ctx.rng,
    );
    const row: AttemptRow = {
      id: ctx.rng.uuid(),
      member_id: memberId,
      test_id: testId,
      status: "in_progress",
      questions_json: JSON.stringify(drawn),
      answers_json: JSON.stringify(drawn.map(() => null)),
      score: null,
      total: drawn.length,
      required_score: null,
      passed: null,
      promoted_to: null,
      started_at: ctx.now().toISOString(),
      submitted_at: null,
    };
    await tx.run(`INSERT INTO attempts (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      row.id,
      row.member_id,
      row.test_id,
      row.status,
      row.questions_json,
      row.answers_json,
      row.score,
      row.total,
      row.required_score,
      row.passed,
      row.promoted_to,
      row.started_at,
      row.submitted_at,
    ]);
    return toView(row, false);
  });
}

async function requireOwnedAttempt(db: Db, attemptId: string, memberId: string): Promise<AttemptRow> {
  const row = await db.get<AttemptRow>(`SELECT ${COLUMNS} FROM attempts WHERE id = ? AND member_id = ?`, [
    attemptId,
    memberId,
  ]);
  if (!row) throw notFound("attemptNotFound");
  return row;
}

/** An attempt as seen by the person who took it: the questions while open, the full result once submitted. */
export async function getAttemptDetail(ctx: AppContext, attemptId: string, memberId: string): Promise<AttemptDetail> {
  const row = await requireOwnedAttempt(ctx.db, attemptId, memberId);
  if (row.status === "in_progress") return toView(row, false);
  if (row.status === "submitted") {
    const member = await requireMemberRow(ctx.db, row.member_id);
    return toResult(row, member.name);
  }
  throw notFound("attemptNotFound");
}

/** A submitted attempt with everything, for the admin. */
export async function getSubmittedAttemptForAdmin(ctx: AppContext, attemptId: string): Promise<AttemptResult> {
  const row = await ctx.db.get<AttemptRow>(`SELECT ${COLUMNS} FROM attempts WHERE id = ?`, [attemptId]);
  if (!row) throw notFound("attemptNotFound");
  if (row.status !== "submitted") throw conflict("attemptNotFinished");
  const member = await requireMemberRow(ctx.db, row.member_id);
  return toResult(row, member.name);
}

/** Saves the answers given so far, so a reload does not lose them. */
export async function saveAnswers(
  ctx: AppContext,
  attemptId: string,
  memberId: string,
  rawAnswers: unknown,
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const row = await requireOwnedAttempt(tx, attemptId, memberId);
    if (row.status !== "in_progress") throw conflict("attemptClosed");
    const answers = parseAnswerList(rawAnswers, questionsOf(row));
    await tx.run("UPDATE attempts SET answers_json = ? WHERE id = ?", [JSON.stringify(answers), attemptId]);
  });
}

/**
 * Grades the attempt. Passing moves the person up the ladder (candidate ->
 * participant -> supervisor) when their role still matches the test. Runs as one
 * transaction, so submitting twice cannot grade or promote twice.
 */
export async function submitAttempt(
  ctx: AppContext,
  attemptId: string,
  memberId: string,
  rawAnswers: unknown,
): Promise<AttemptResult> {
  return ctx.db.transaction(async (tx) => {
    const row = await requireOwnedAttempt(tx, attemptId, memberId);
    if (row.status !== "in_progress") throw conflict("attemptClosed");
    const test = findTest(ctx.config, row.test_id);
    if (!test) throw conflict("unknownTest");

    const questions = questionsOf(row);
    const answers = rawAnswers === undefined ? answersOf(row) : parseAnswerList(rawAnswers, questions);
    const grade = gradeAnswers(questions, answers, test.passRate);
    const member = await requireMemberRow(tx, memberId);
    const now = ctx.now().toISOString();

    let promotedTo: string | null = null;
    if (grade.passed && member.role === test.requiresRole) {
      promotedTo = test.grantsRole;
      await tx.run("UPDATE members SET role = ?, updated_at = ? WHERE id = ?", [promotedTo, now, memberId]);
    }

    const updated: AttemptRow = {
      ...row,
      status: "submitted",
      answers_json: JSON.stringify(answers),
      score: grade.score,
      required_score: requiredScore(grade.total, test.passRate),
      passed: grade.passed ? 1 : 0,
      promoted_to: promotedTo,
      submitted_at: now,
    };
    const { changes } = await tx.run(
      `UPDATE attempts SET status = 'submitted', answers_json = ?, score = ?, required_score = ?,
         passed = ?, promoted_to = ?, submitted_at = ?
       WHERE id = ? AND status = 'in_progress'`,
      [
        updated.answers_json,
        updated.score,
        updated.required_score,
        updated.passed,
        updated.promoted_to,
        updated.submitted_at,
        attemptId,
      ],
    );
    if (changes !== 1) throw conflict("attemptClosed");
    return toResult(updated, member.name);
  });
}

/** The person's unfinished attempt (still within the resume window), if any. */
export async function findActiveAttempt(
  ctx: AppContext,
  memberId: string,
): Promise<{ id: string; testId: string } | null> {
  const row = await ctx.db.get<SummaryRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM attempts WHERE member_id = ? AND status = 'in_progress'
     ORDER BY started_at DESC LIMIT 1`,
    [memberId],
  );
  if (!row || ctx.now().getTime() - Date.parse(row.started_at) >= RESUME_WINDOW_MS) return null;
  return { id: row.id, testId: row.test_id };
}

/** Submitted attempts of a person, newest first. */
export async function listSubmittedAttempts(db: Db, memberId: string, limit = 50): Promise<AttemptSummary[]> {
  const rows = await db.all<SummaryRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM attempts WHERE member_id = ? AND status = 'submitted'
     ORDER BY submitted_at DESC, id LIMIT ?`,
    [memberId, limit],
  );
  return rows.map(toSummary);
}
