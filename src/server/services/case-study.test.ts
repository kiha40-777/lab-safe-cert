import { describe, expect, it } from "vitest";
import { findTest } from "@/lib/certification";
import type { Bank } from "../bank/types";
import { correctAnswersOf, kindsOf, makeQuestions, makeTestContext } from "../test-utils";
import { getAttemptDetail, startAttempt, submitAttempt } from "./attempts";
import { loadBank, saveBank } from "./banks";
import { isBankReady, loadCaseStudyPerTest, loadCaseStudyPerTests, setCaseStudyPerTest } from "./case-study";
import { createMember } from "./members";
import { getAdminOverview } from "./overview";
import { getParticipantHome } from "./participant";

type Ctx = Awaited<ReturnType<typeof makeTestContext>>;

const supervisorTest = (ctx: Ctx) => {
  const test = findTest(ctx.config, "supervisor");
  if (!test) throw new Error("supervisor test missing");
  return test;
};

const bank = (standard: number, caseStudies: number): Bank => ({
  info: { generator: null, generatedAt: null, source: null },
  questions: [...makeQuestions(standard), ...makeQuestions(caseStudies, 4, "case_study")],
});

/** A context with a supervisor bank of 60 ordinary and `caseStudies` case-study questions, and a person who may take the test. */
async function setup(caseStudies: number, perTest: number | null) {
  const ctx = await makeTestContext();
  await saveBank(ctx, "supervisor", bank(60, caseStudies), { kind: "import", reviewConfirmed: true });
  if (perTest !== null) await setCaseStudyPerTest(ctx, supervisorTest(ctx), perTest);
  const member = await createMember(ctx, { name: "Pat", role: "participant" });
  return { ctx, member };
}

describe("the number of case-study questions per test", () => {
  it("starts at the number from the configuration file (0) and can be changed", async () => {
    const ctx = await makeTestContext();
    const test = supervisorTest(ctx);
    expect(await loadCaseStudyPerTest(ctx.db, test)).toBe(0);
    await setCaseStudyPerTest(ctx, test, 4);
    expect(await loadCaseStudyPerTest(ctx.db, test)).toBe(4);
    await setCaseStudyPerTest(ctx, test, 0);
    expect(await loadCaseStudyPerTest(ctx.db, test)).toBe(0);
  });

  it("falls back to the configured number when the stored one is unusable", async () => {
    const ctx = await makeTestContext();
    const test = { ...supervisorTest(ctx), caseStudy: { bankSize: 6, perTest: 2 } };
    expect(await loadCaseStudyPerTest(ctx.db, test)).toBe(2);
    await ctx.db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["case_study_per_test:supervisor", "lots"]);
    expect(await loadCaseStudyPerTest(ctx.db, test)).toBe(2);
  });

  it("is always 0 for a test without case studies, and cannot be set for it", async () => {
    const ctx = await makeTestContext();
    const participant = findTest(ctx.config, "participant")!;
    expect(await loadCaseStudyPerTest(ctx.db, participant)).toBe(0);
    await expect(setCaseStudyPerTest(ctx, participant, 3)).rejects.toMatchObject({ status: 404, code: "noCaseStudy" });
    expect([...(await loadCaseStudyPerTests(ctx.db, ctx.config))]).toEqual([
      ["participant", 0],
      ["supervisor", 0],
    ]);
  });

  it("decides whether a bank is ready from the ordinary and the case-study questions separately", () => {
    // a test of 30 questions: 3 case studies leave 27 ordinary questions
    const t = { questionsPerTest: 30 } as Parameters<typeof isBankReady>[0];
    expect(isBankReady(t, 0, { total: 30, caseStudy: 0 })).toBe(true);
    expect(isBankReady(t, 0, { total: 29, caseStudy: 0 })).toBe(false);
    expect(isBankReady(t, 3, { total: 62, caseStudy: 2 })).toBe(false); // 60 ordinary, only 2 case studies
    expect(isBankReady(t, 3, { total: 30, caseStudy: 3 })).toBe(true); // 27 ordinary + 3 case studies
    expect(isBankReady(t, 3, { total: 29, caseStudy: 3 })).toBe(false); // only 26 ordinary questions
    expect(isBankReady(t, 30, { total: 30, caseStudy: 30 })).toBe(true); // a test of case studies only
  });

  it("falls back to the configured number when the stored one is more than the questions of a test", async () => {
    const ctx = await makeTestContext();
    const test = { ...supervisorTest(ctx), caseStudy: { bankSize: 6, perTest: 2 } };
    await ctx.db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["case_study_per_test:supervisor", "31"]);
    expect(await loadCaseStudyPerTest(ctx.db, test)).toBe(2);
  });
});

describe("an attempt with case-study questions", () => {
  it("has 30 questions in all: the ordinary ones first, the drawn case studies last", async () => {
    const { ctx, member } = await setup(8, 3);
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(view.questions).toHaveLength(30);
    expect(await kindsOf(ctx, view.id)).toEqual([...Array(27).fill("standard"), ...Array(3).fill("case_study")]);
    expect(view.questions.slice(27).every((q) => q.text.includes("case study"))).toBe(true);
    expect(view.questions.slice(0, 27).some((q) => q.text.includes("case study"))).toBe(false);
    expect(new Set(view.questions.map((q) => q.text)).size).toBe(30);
    // nothing tells the participant which questions are case studies
    expect(JSON.stringify(view)).not.toMatch(/answerIndex|caseStudy|case_study|kind/);
  });

  it("can be made of case studies only", async () => {
    const { ctx, member } = await setup(40, 30);
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(await kindsOf(ctx, view.id)).toEqual(Array(30).fill("case_study"));
  });

  it("asks only ordinary questions when the number of case studies is 0", async () => {
    const { ctx, member } = await setup(8, 0);
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(view.questions).toHaveLength(30);
    expect(await kindsOf(ctx, view.id)).toEqual(Array(30).fill("standard"));
  });

  it("draws different case studies for different attempts, always from the case-study questions", async () => {
    const { ctx, member } = await setup(12, 3);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const view = await startAttempt(ctx, member.id, "supervisor");
      for (const q of view.questions.slice(27)) seen.add(q.text);
      ctx.advance(25 * 60 * 60_000); // the unfinished attempt is not resumed any more
    }
    expect(seen.size).toBeGreaterThan(3);
    expect([...seen].every((text) => text.includes("case study"))).toBe(true);
  });

  it("counts the case studies for the pass mark like every other question", async () => {
    const { ctx, member } = await setup(8, 3);
    const view = await startAttempt(ctx, member.id, "supervisor");
    const correct = await correctAnswersOf(ctx, view.id);

    // every ordinary question right, one case study wrong: 29 of 30, not enough (all must be right)
    const answers = [...correct];
    answers[29] = (correct[29]! + 1) % 4;
    const result = await submitAttempt(ctx, view.id, member.id, answers);
    expect(result).toMatchObject({ score: 29, total: 30, requiredScore: 30, passed: false, promotedTo: null });
    expect(await getAttemptDetail(ctx, view.id, member.id)).toMatchObject({ status: "submitted" });
  });

  it("passes and promotes when everything, case studies included, is right", async () => {
    const { ctx, member } = await setup(8, 3);
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(await submitAttempt(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id))).toMatchObject({
      score: 30,
      total: 30,
      passed: true,
      promotedTo: "supervisor",
    });
  });

  it("is not available while the bank holds fewer case studies than a test asks", async () => {
    const { ctx, member } = await setup(2, 3);
    await expect(startAttempt(ctx, member.id, "supervisor")).rejects.toMatchObject({ status: 409, code: "testNotReady" });
    await setCaseStudyPerTest(ctx, supervisorTest(ctx), 2);
    expect((await startAttempt(ctx, member.id, "supervisor")).questions).toHaveLength(30);
  });

  it("is not available while the bank holds too few ordinary questions for the rest of the test", async () => {
    const ctx = await makeTestContext();
    await saveBank(ctx, "supervisor", bank(26, 5), { kind: "import", reviewConfirmed: true });
    await setCaseStudyPerTest(ctx, supervisorTest(ctx), 3); // 27 ordinary questions are needed
    const member = await createMember(ctx, { name: "Pat", role: "participant" });
    await expect(startAttempt(ctx, member.id, "supervisor")).rejects.toMatchObject({ code: "testNotReady" });
    await setCaseStudyPerTest(ctx, supervisorTest(ctx), 4); // 26 are enough now
    expect((await startAttempt(ctx, member.id, "supervisor")).questions).toHaveLength(30);
  });

  it("keeps a started attempt as it is when the number is changed afterwards", async () => {
    const { ctx, member } = await setup(8, 3);
    const view = await startAttempt(ctx, member.id, "supervisor");
    await setCaseStudyPerTest(ctx, supervisorTest(ctx), 5);
    const resumed = await startAttempt(ctx, member.id, "supervisor");
    expect(resumed.id).toBe(view.id);
    expect(await kindsOf(ctx, view.id)).toEqual([...Array(27).fill("standard"), ...Array(3).fill("case_study")]);
  });
});

describe("what the start screen and the admin overview report", () => {
  it("tells the participant how many questions a test has and whether it can be taken", async () => {
    const { ctx, member } = await setup(8, 3);
    const home = await getParticipantHome(ctx, member);
    const info = home.tests.find((t) => t.testId === "supervisor");
    expect(info).toMatchObject({ ready: true, questionCount: 30, caseStudyCount: 3 });
    expect(home.tests.find((t) => t.testId === "participant")).toMatchObject({ ready: false, questionCount: 30, caseStudyCount: 0 });
  });

  it("reports the case-study state of each test to the admin", async () => {
    const { ctx } = await setup(8, 3);
    const overview = await getAdminOverview(ctx);
    expect(overview.tests.find((t) => t.testId === "supervisor")).toMatchObject({
      questionCount: 68,
      ready: true,
      caseStudy: { perTest: 3, available: 8 },
    });
    expect(overview.tests.find((t) => t.testId === "participant")).toMatchObject({ ready: false, caseStudy: null });

    await setCaseStudyPerTest(ctx, supervisorTest(ctx), 9);
    const short = (await getAdminOverview(ctx)).tests.find((t) => t.testId === "supervisor");
    expect(short).toMatchObject({ ready: false, caseStudy: { perTest: 9, available: 8 } });
  });
});

describe("banks stored before case studies existed", () => {
  it("are read with every question as an ordinary one", async () => {
    const ctx = await makeTestContext();
    // the stored form of that time: no "kind" on any question
    const old = makeQuestions(60).map((q) => ({
      id: q.id,
      text: q.text,
      choices: q.choices,
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      source: q.source,
    }));
    await ctx.db.run(
      "INSERT INTO banks (test_id, questions_json, meta_json, question_count, updated_at) VALUES (?, ?, ?, ?, ?)",
      ["participant", JSON.stringify(old), JSON.stringify({ importedAt: "x", updatedAt: "x", reviewConfirmedAt: "x" }), 60, "x"],
    );
    const stored = await loadBank(ctx.db, "participant");
    expect(stored?.questions).toHaveLength(60);
    expect(stored?.questions.every((q) => q.kind === "standard")).toBe(true);

    const member = await createMember(ctx, { name: "Ann" });
    expect((await startAttempt(ctx, member.id, "participant")).questions).toHaveLength(30);
  });
});
