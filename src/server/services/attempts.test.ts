import { describe, expect, it } from "vitest";
import raw from "../../../config/certification.json";
import { findTest, validateCertificationConfig } from "@/lib/certification";
import type { AttemptView } from "@/lib/types";
import type { Bank } from "../bank/types";
import { validateBankText } from "../bank/validate";
import { correctAnswersOf, makeBankJson, makeQuestions, makeTestContext } from "../test-utils";
import {
  findActiveAttempt,
  getAttemptDetail,
  getSubmittedAttemptForAdmin,
  listSubmittedAttempts,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "./attempts";
import { loadBank, rulesFor, saveBank } from "./banks";
import { createMember, listMemberRows, updateMember } from "./members";

type Ctx = Awaited<ReturnType<typeof makeTestContext>>;

const HOUR = 60 * 60_000;

/** A context with a stored 60-question bank for the participant test and one candidate. */
async function setup(ctx?: Ctx) {
  const c = ctx ?? (await makeTestContext());
  const test = findTest(c.config, "participant");
  if (!test) throw new Error("participant test missing");
  const outcome = validateBankText(makeBankJson(60), rulesFor(c.config, test));
  if (!outcome.bank) throw new Error("test bank invalid");
  await saveBank(c, "participant", outcome.bank, { kind: "import", reviewConfirmed: true });
  const member = await createMember(c, { name: "Test Person" });
  return { ctx: c, member };
}

async function roleOf(ctx: Ctx, id: string) {
  return (await listMemberRows(ctx.db)).find((m) => m.id === id)?.role;
}

describe("startAttempt", () => {
  it("draws 30 questions and never reveals answers or explanations", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    expect(view.questions).toHaveLength(30);
    expect(view.answers).toEqual(new Array(30).fill(null));
    expect(view.resumed).toBe(false);
    expect(view.status).toBe("in_progress");
    const json = JSON.stringify(view);
    for (const secret of ["answerIndex", "explanation", "correct", "source"]) {
      expect(json).not.toContain(secret);
    }
    for (const q of view.questions) expect(q.choices).toHaveLength(4);
  });

  it("gives an unfinished attempt back instead of drawing a new set", async () => {
    const { ctx, member } = await setup();
    const first = await startAttempt(ctx, member.id, "participant");
    ctx.advance(2 * HOUR);
    const again = await startAttempt(ctx, member.id, "participant");
    expect(again.id).toBe(first.id);
    expect(again.resumed).toBe(true);
    expect(again.questions).toEqual(first.questions);
    expect(await ctx.db.all("SELECT id FROM attempts")).toHaveLength(1);
  });

  it("starts a new attempt when the old one is more than a day old", async () => {
    const { ctx, member } = await setup();
    const first = await startAttempt(ctx, member.id, "participant");
    ctx.advance(25 * HOUR);
    expect(await findActiveAttempt(ctx, member.id)).toBeNull();
    const second = await startAttempt(ctx, member.id, "participant");
    expect(second.id).not.toBe(first.id);
    const old = await ctx.db.get<{ status: string }>("SELECT status FROM attempts WHERE id = ?", [first.id]);
    expect(old?.status).toBe("abandoned");
    await expect(getAttemptDetail(ctx, first.id, member.id)).rejects.toMatchObject({ code: "attemptNotFound" });
  });

  it("only lets people take the test for their own step of the ladder", async () => {
    const { ctx } = await setup();
    const participant = await createMember(ctx, { name: "Already Participant", role: "participant" });
    await expect(startAttempt(ctx, participant.id, "participant")).rejects.toMatchObject({
      status: 403,
      code: "wrongRole",
    });
    const supervisor = await createMember(ctx, { name: "Already Supervisor", role: "supervisor" });
    await expect(startAttempt(ctx, supervisor.id, "supervisor")).rejects.toMatchObject({ code: "wrongRole" });
    const candidate = await createMember(ctx, { name: "Candidate" });
    await expect(startAttempt(ctx, candidate.id, "supervisor")).rejects.toMatchObject({ code: "wrongRole" });
  });

  it("refuses when the question bank is missing or too small", async () => {
    const ctx = await makeTestContext();
    const member = await createMember(ctx, { name: "Test Person" });
    await expect(startAttempt(ctx, member.id, "participant")).rejects.toMatchObject({
      status: 409,
      code: "testNotReady",
    });
    const small: Bank = {
      info: { generator: null, generatedAt: null, source: null },
      questions: makeQuestions(29),
    };
    await saveBank(ctx, "participant", small, { kind: "import", reviewConfirmed: true });
    await expect(startAttempt(ctx, member.id, "participant")).rejects.toMatchObject({ code: "testNotReady" });
  });

  it("reports an unknown test and an unknown person", async () => {
    const { ctx, member } = await setup();
    await expect(startAttempt(ctx, member.id, "nope")).rejects.toMatchObject({ status: 404, code: "unknownTest" });
    await expect(startAttempt(ctx, "missing", "participant")).rejects.toMatchObject({ code: "memberNotFound" });
  });

  it("gives different people different questions", async () => {
    const { ctx, member } = await setup();
    const other = await createMember(ctx, { name: "Other Person" });
    const a = await startAttempt(ctx, member.id, "participant");
    const b = await startAttempt(ctx, other.id, "participant");
    expect(a.questions.map((q) => q.text)).not.toEqual(b.questions.map((q) => q.text));
  });
});

describe("saving answers", () => {
  it("keeps the answers so a reload does not lose them", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const answers = view.answers.map((_, i) => (i % 5 === 0 ? null : i % 4));
    await saveAnswers(ctx, view.id, member.id, answers);
    const detail = (await getAttemptDetail(ctx, view.id, member.id)) as AttemptView;
    expect(detail.status).toBe("in_progress");
    expect(detail.answers).toEqual(answers);
  });

  it("rejects malformed answer lists", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const bad: unknown[] = [
      "nope",
      [],
      new Array(29).fill(0),
      new Array(31).fill(0),
      [...new Array(29).fill(0), 4], // no fifth choice
      [...new Array(29).fill(0), -1],
      [...new Array(29).fill(0), 1.5],
      [...new Array(29).fill(0), "1"],
    ];
    for (const answers of bad) {
      await expect(saveAnswers(ctx, view.id, member.id, answers)).rejects.toMatchObject({
        status: 400,
        code: "invalidAnswers",
      });
    }
  });
});

describe("submitAttempt", () => {
  it("passes with every answer right, promotes the person and shows the whole result", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const result = await submitAttempt(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id));

    expect(result).toMatchObject({
      status: "submitted",
      score: 30,
      total: 30,
      requiredScore: 30,
      passed: true,
      promotedTo: "participant",
      memberName: "Test Person",
    });
    expect(result.questions).toHaveLength(30);
    expect(result.questions.every((q) => q.correct && q.chosenIndex === q.answerIndex)).toBe(true);
    expect(await roleOf(ctx, member.id)).toBe("participant");

    // the same result can be opened again later, by the person and by the admin
    expect(await getAttemptDetail(ctx, view.id, member.id)).toEqual(result);
    expect(await getSubmittedAttemptForAdmin(ctx, view.id)).toEqual(result);
  });

  it("fails on a single wrong answer, keeps the role, and allows another try", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const answers = await correctAnswersOf(ctx, view.id);
    answers[7] = (answers[7]! + 1) % 4;
    const result = await submitAttempt(ctx, view.id, member.id, answers);

    expect(result).toMatchObject({ score: 29, passed: false, promotedTo: null });
    expect(result.questions.filter((q) => !q.correct)).toHaveLength(1);
    expect(result.questions[7]).toMatchObject({ correct: false });
    expect(await roleOf(ctx, member.id)).toBe("candidate");

    const retry = await startAttempt(ctx, member.id, "participant");
    expect(retry.id).not.toBe(view.id);
    expect(retry.resumed).toBe(false);
    const second = await submitAttempt(ctx, retry.id, member.id, await correctAnswersOf(ctx, retry.id));
    expect(second.passed).toBe(true);
    expect(await roleOf(ctx, member.id)).toBe("participant");
  });

  it("counts unanswered questions as wrong", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const answers: (number | null)[] = await correctAnswersOf(ctx, view.id);
    answers[0] = null;
    const result = await submitAttempt(ctx, view.id, member.id, answers);
    expect(result.passed).toBe(false);
    expect(result.questions[0]).toMatchObject({ chosenIndex: null, correct: false });
  });

  it("grades the answers saved earlier when none are sent", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    await saveAnswers(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id));
    const result = await submitAttempt(ctx, view.id, member.id, undefined);
    expect(result.passed).toBe(true);
  });

  it("cannot be submitted twice, so it cannot be graded or promoted twice", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const answers = await correctAnswersOf(ctx, view.id);
    const results = await Promise.allSettled([
      submitAttempt(ctx, view.id, member.id, answers),
      submitAttempt(ctx, view.id, member.id, answers),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: "attemptClosed" });
    await expect(saveAnswers(ctx, view.id, member.id, answers)).rejects.toMatchObject({ code: "attemptClosed" });
  });

  it("rejects answers that do not fit the questions and leaves the attempt open", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    await expect(submitAttempt(ctx, view.id, member.id, [1, 2, 3])).rejects.toMatchObject({ code: "invalidAnswers" });
    expect((await getAttemptDetail(ctx, view.id, member.id)).status).toBe("in_progress");
  });

  it("does not promote someone whose role was changed meanwhile, but still records the pass", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    await updateMember(ctx, member.id, { role: "supervisor" }); // an admin promoted them by hand
    const result = await submitAttempt(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id));
    expect(result).toMatchObject({ passed: true, promotedTo: null });
    expect(await roleOf(ctx, member.id)).toBe("supervisor");
  });

  it("keeps the result readable after the question bank is replaced", async () => {
    const { ctx, member } = await setup();
    const view = await startAttempt(ctx, member.id, "participant");
    const before = await submitAttempt(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id));

    const replacement: Bank = {
      info: { generator: null, generatedAt: null, source: null },
      questions: makeQuestions(60).map((q) => ({ ...q, text: `Completely different ${q.id}` })),
    };
    await saveBank(ctx, "participant", replacement, { kind: "import", reviewConfirmed: true });

    const after = await getAttemptDetail(ctx, view.id, member.id);
    expect(after).toEqual(before);
    expect((await loadBank(ctx.db, "participant"))?.questions[0]?.text).toContain("Completely different");
  });

  it("hides attempts from other people", async () => {
    const { ctx, member } = await setup();
    const other = await createMember(ctx, { name: "Other" });
    const view = await startAttempt(ctx, member.id, "participant");
    await expect(getAttemptDetail(ctx, view.id, other.id)).rejects.toMatchObject({ status: 404 });
    await expect(saveAnswers(ctx, view.id, other.id, view.answers)).rejects.toMatchObject({ status: 404 });
    await expect(submitAttempt(ctx, view.id, other.id, view.answers)).rejects.toMatchObject({ status: 404 });
    await expect(getSubmittedAttemptForAdmin(ctx, view.id)).rejects.toMatchObject({ code: "attemptNotFinished" });
  });

  it("includes explanation and source in the result when the bank has them", async () => {
    const ctx = await makeTestContext();
    const questions = makeQuestions(60).map((q) => ({ ...q, explanation: `why ${q.id}`, source: "p. 1" }));
    await saveBank(
      ctx,
      "participant",
      { info: { generator: null, generatedAt: null, source: null }, questions },
      { kind: "import", reviewConfirmed: true },
    );
    const member = await createMember(ctx, { name: "Reader" });
    const view = await startAttempt(ctx, member.id, "participant");
    const result = await submitAttempt(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id));
    expect(result.questions.every((q) => q.explanation?.startsWith("why q") && q.source === "p. 1")).toBe(true);
  });
});

describe("climbing the whole ladder", () => {
  it("candidate -> participant -> supervisor", async () => {
    const { ctx, member } = await setup();
    const supervisorTest = findTest(ctx.config, "supervisor");
    if (!supervisorTest) throw new Error("supervisor test missing");
    const outcome = validateBankText(makeBankJson(60), rulesFor(ctx.config, supervisorTest));
    await saveBank(ctx, "supervisor", outcome.bank as Bank, { kind: "import", reviewConfirmed: true });

    const first = await startAttempt(ctx, member.id, "participant");
    await submitAttempt(ctx, first.id, member.id, await correctAnswersOf(ctx, first.id));
    expect(await roleOf(ctx, member.id)).toBe("participant");

    ctx.advance(60_000);
    const second = await startAttempt(ctx, member.id, "supervisor");
    const result = await submitAttempt(ctx, second.id, member.id, await correctAnswersOf(ctx, second.id));
    expect(result.promotedTo).toBe("supervisor");
    expect(await roleOf(ctx, member.id)).toBe("supervisor");

    const history = await listSubmittedAttempts(ctx.db, member.id);
    expect(history.map((a) => [a.testId, a.passed])).toEqual([
      ["supervisor", true],
      ["participant", true],
    ]);
  });
});

describe("a different pass rate in the configuration", () => {
  it("passes with 27 of 30 correct when the pass rate is 90%", async () => {
    const config = validateCertificationConfig({
      ...raw,
      tests: raw.tests.map((t) => (t.id === "participant" ? { ...t, passRate: 0.9 } : t)),
    });
    const { ctx, member } = await setup(await makeTestContext({ config }));
    const view = await startAttempt(ctx, member.id, "participant");
    const answers = await correctAnswersOf(ctx, view.id);
    for (const i of [0, 1, 2]) answers[i] = (answers[i]! + 1) % 4;
    const result = await submitAttempt(ctx, view.id, member.id, answers);
    expect(result).toMatchObject({ score: 27, requiredScore: 27, passed: true });

    const retry = await startAttempt(ctx, member.id, "supervisor").catch((e: unknown) => e);
    expect(retry).toMatchObject({ code: "testNotReady" }); // promoted; supervisor bank not uploaded yet
  });

  it("uses fewer questions when the configuration says so", async () => {
    const config = validateCertificationConfig({
      ...raw,
      tests: raw.tests.map((t) => (t.id === "participant" ? { ...t, questionsPerTest: 10 } : t)),
    });
    const { ctx, member } = await setup(await makeTestContext({ config }));
    const view = await startAttempt(ctx, member.id, "participant");
    expect(view.questions).toHaveLength(10);
  });
});
