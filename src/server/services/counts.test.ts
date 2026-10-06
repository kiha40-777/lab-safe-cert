import { describe, expect, it } from "vitest";
import { findTest } from "@/lib/certification";
import { type TestCounts, defaultCounts } from "@/lib/counts";
import type { Bank } from "../bank/types";
import { correctAnswersOf, kindsOf, makeQuestions, makeTestContext } from "../test-utils";
import { getAttemptDetail, startAttempt, submitAttempt } from "./attempts";
import { loadBank, saveBank } from "./banks";
import { isBankReady, loadAllCounts, loadCounts, setCounts } from "./counts";
import { createMember } from "./members";
import { getAdminOverview } from "./overview";
import { getParticipantHome } from "./participant";

type Ctx = Awaited<ReturnType<typeof makeTestContext>>;

const testOf = (ctx: Ctx, id: string) => {
  const test = findTest(ctx.config, id);
  if (!test) throw new Error(`${id} test missing`);
  return test;
};

const bank = (standard: number, caseStudies: number): Bank => ({
  info: { generator: null, generatedAt: null, source: null },
  questions: [...makeQuestions(standard), ...makeQuestions(caseStudies, 4, "case_study")],
});

const counts = (extra: Partial<TestCounts> = {}): TestCounts => ({
  bankSize: 60,
  perTest: 30,
  caseStudyBankSize: 6,
  caseStudyPerTest: 3,
  ...extra,
});

/** A context with a stored supervisor bank of `standard` ordinary and `caseStudies` case-study questions, and a person who may take the test. */
async function setup(standard: number, caseStudies: number, own?: TestCounts) {
  const ctx = await makeTestContext();
  await saveBank(ctx, "supervisor", bank(standard, caseStudies), { kind: "import", reviewConfirmed: true });
  if (own) await setCounts(ctx, testOf(ctx, "supervisor"), own);
  const member = await createMember(ctx, { name: "Pat", role: "participant" });
  return { ctx, member };
}

describe("the numbers of a test", () => {
  it("start at the numbers of the configuration file: 60 / 30, and for the supervisor test 6 / 3 case studies", async () => {
    const ctx = await makeTestContext();
    expect(await loadCounts(ctx.db, testOf(ctx, "participant"))).toEqual({
      bankSize: 60,
      perTest: 30,
      caseStudyBankSize: 0,
      caseStudyPerTest: 0,
    });
    expect(await loadCounts(ctx.db, testOf(ctx, "supervisor"))).toEqual(counts());
    expect(defaultCounts(testOf(ctx, "supervisor"))).toEqual(counts());
  });

  it("can be changed for each test, and survive", async () => {
    const ctx = await makeTestContext();
    const supervisor = testOf(ctx, "supervisor");
    await setCounts(ctx, supervisor, counts({ bankSize: 80, perTest: 20, caseStudyBankSize: 10, caseStudyPerTest: 2 }));
    expect(await loadCounts(ctx.db, supervisor)).toEqual({ bankSize: 80, perTest: 20, caseStudyBankSize: 10, caseStudyPerTest: 2 });
    // another test is not affected
    expect(await loadCounts(ctx.db, testOf(ctx, "participant"))).toEqual(defaultCounts(testOf(ctx, "participant")));
    // 0 case studies is allowed
    await setCounts(ctx, supervisor, counts({ caseStudyBankSize: 0, caseStudyPerTest: 0 }));
    expect((await loadCounts(ctx.db, supervisor)).caseStudyPerTest).toBe(0);
  });

  it("must fit together: not more asked than the set holds, case studies part of the totals", async () => {
    const ctx = await makeTestContext();
    const supervisor = testOf(ctx, "supervisor");
    const refused = (change: Partial<TestCounts>, problem: string) =>
      expect(setCounts(ctx, supervisor, counts(change))).rejects.toMatchObject({
        status: 400,
        code: "invalidCounts",
        params: { problem },
      });
    await refused({ perTest: 61 }, "perTestAboveBank");
    await refused({ caseStudyBankSize: 61 }, "caseStudyBankAboveBank");
    await refused({ caseStudyPerTest: 31 }, "caseStudyPerTestAbovePerTest");
    await refused({ caseStudyBankSize: 2, caseStudyPerTest: 3 }, "caseStudyPerTestAboveBank");
    // 40 of the 60 questions of the set are case studies: only 20 ordinary ones, and a test needs 27 of them
    await refused({ caseStudyBankSize: 40 }, "ordinaryShort");
    expect(await loadCounts(ctx.db, supervisor)).toEqual(counts()); // nothing was stored
  });

  it("cannot have case studies for a test that has none", async () => {
    const ctx = await makeTestContext();
    const participant = testOf(ctx, "participant");
    await expect(
      setCounts(ctx, participant, { bankSize: 60, perTest: 30, caseStudyBankSize: 5, caseStudyPerTest: 0 }),
    ).rejects.toMatchObject({ code: "invalidCounts", params: { problem: "noCaseStudies" } });
    await setCounts(ctx, participant, { bankSize: 100, perTest: 25, caseStudyBankSize: 0, caseStudyPerTest: 0 });
    expect((await loadCounts(ctx.db, participant)).perTest).toBe(25);
  });

  it("fall back to the first numbers when the stored value is unusable", async () => {
    const ctx = await makeTestContext();
    const supervisor = testOf(ctx, "supervisor");
    for (const damaged of ["lots", "{}", '{"bankSize":60,"perTest":99,"caseStudyBankSize":6,"caseStudyPerTest":3}', '{"bankSize":"60"}']) {
      await ctx.db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ["test_counts:supervisor", damaged],
      );
      expect(await loadCounts(ctx.db, supervisor), damaged).toEqual(counts());
    }
    expect([...(await loadAllCounts(ctx.db, ctx.config)).keys()]).toEqual(["participant", "supervisor"]);
  });

  it("decide whether a bank is ready from the ordinary and the case-study questions separately", () => {
    // 3 case studies in a test of 30 leave 27 ordinary questions
    expect(isBankReady(counts(), { total: 60, caseStudy: 6 })).toBe(true); // 54 + 6
    expect(isBankReady(counts(), { total: 30, caseStudy: 3 })).toBe(true); // 27 + 3: just enough
    expect(isBankReady(counts(), { total: 62, caseStudy: 2 })).toBe(false); // only 2 case studies
    expect(isBankReady(counts(), { total: 29, caseStudy: 3 })).toBe(false); // only 26 ordinary questions
    const none = counts({ caseStudyBankSize: 0, caseStudyPerTest: 0 });
    expect(isBankReady(none, { total: 30, caseStudy: 0 })).toBe(true);
    expect(isBankReady(none, { total: 29, caseStudy: 0 })).toBe(false);
    // a test of case studies only
    expect(isBankReady(counts({ caseStudyBankSize: 30, caseStudyPerTest: 30 }), { total: 30, caseStudy: 30 })).toBe(true);
  });
});

describe("an attempt with case-study questions", () => {
  it("has 30 questions in all by default: 27 ordinary ones first, the 3 drawn case studies last", async () => {
    const { ctx, member } = await setup(54, 6);
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(view.questions).toHaveLength(30);
    expect(await kindsOf(ctx, view.id)).toEqual([...Array(27).fill("standard"), ...Array(3).fill("case_study")]);
    expect(view.questions.slice(27).every((q) => q.text.includes("case study"))).toBe(true);
    expect(view.questions.slice(0, 27).some((q) => q.text.includes("case study"))).toBe(false);
    expect(new Set(view.questions.map((q) => q.text)).size).toBe(30);
    // nothing tells the participant which questions are case studies
    expect(JSON.stringify(view)).not.toMatch(/answerIndex|caseStudy|case_study|kind/);
  });

  it("follows the numbers set for the test", async () => {
    const { ctx, member } = await setup(54, 6, counts({ perTest: 10, caseStudyPerTest: 2 }));
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(view.questions).toHaveLength(10);
    expect(await kindsOf(ctx, view.id)).toEqual([...Array(8).fill("standard"), ...Array(2).fill("case_study")]);
  });

  it("can be made of case studies only", async () => {
    const { ctx, member } = await setup(40, 30, counts({ bankSize: 70, caseStudyBankSize: 30, caseStudyPerTest: 30 }));
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(await kindsOf(ctx, view.id)).toEqual(Array(30).fill("case_study"));
  });

  it("asks only ordinary questions when the number of case studies is 0", async () => {
    const { ctx, member } = await setup(54, 6, counts({ caseStudyBankSize: 0, caseStudyPerTest: 0 }));
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(view.questions).toHaveLength(30);
    expect(await kindsOf(ctx, view.id)).toEqual(Array(30).fill("standard"));
  });

  it("draws different case studies for different attempts, always from the case-study questions", async () => {
    const { ctx, member } = await setup(54, 12);
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
    const { ctx, member } = await setup(54, 6);
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
    const { ctx, member } = await setup(54, 6);
    const view = await startAttempt(ctx, member.id, "supervisor");
    expect(await submitAttempt(ctx, view.id, member.id, await correctAnswersOf(ctx, view.id))).toMatchObject({
      score: 30,
      total: 30,
      passed: true,
      promotedTo: "supervisor",
    });
  });

  it("is not available while the bank holds fewer case studies than a test asks", async () => {
    const { ctx, member } = await setup(54, 2);
    await expect(startAttempt(ctx, member.id, "supervisor")).rejects.toMatchObject({ status: 409, code: "testNotReady" });
    await setCounts(ctx, testOf(ctx, "supervisor"), counts({ caseStudyBankSize: 2, caseStudyPerTest: 2 }));
    expect((await startAttempt(ctx, member.id, "supervisor")).questions).toHaveLength(30);
  });

  it("is not available while the bank holds too few ordinary questions for the rest of the test", async () => {
    const { ctx, member } = await setup(26, 5);
    // 3 case studies leave 27 ordinary questions to draw, and there are 26
    await expect(startAttempt(ctx, member.id, "supervisor")).rejects.toMatchObject({ code: "testNotReady" });
    await setCounts(ctx, testOf(ctx, "supervisor"), counts({ caseStudyBankSize: 5, caseStudyPerTest: 4 })); // 26 are enough now
    expect((await startAttempt(ctx, member.id, "supervisor")).questions).toHaveLength(30);
  });

  it("keeps a started attempt as it is when the numbers are changed afterwards", async () => {
    const { ctx, member } = await setup(54, 6);
    const view = await startAttempt(ctx, member.id, "supervisor");
    await setCounts(ctx, testOf(ctx, "supervisor"), counts({ perTest: 20, caseStudyPerTest: 5 }));
    const resumed = await startAttempt(ctx, member.id, "supervisor");
    expect(resumed.id).toBe(view.id);
    expect(resumed.questions).toHaveLength(30);
    expect(await kindsOf(ctx, view.id)).toEqual([...Array(27).fill("standard"), ...Array(3).fill("case_study")]);
  });
});

describe("what the start screen and the admin overview report", () => {
  it("tells the participant how many questions a test has and whether it can be taken", async () => {
    const { ctx, member } = await setup(54, 6);
    const info = (await getParticipantHome(ctx, member)).tests;
    expect(info.find((t) => t.testId === "supervisor")).toMatchObject({ ready: true, questionCount: 30, caseStudyCount: 3 });
    expect(info.find((t) => t.testId === "participant")).toMatchObject({ ready: false, questionCount: 30, caseStudyCount: 0 });

    await setCounts(ctx, testOf(ctx, "supervisor"), counts({ perTest: 12, caseStudyPerTest: 4 }));
    expect((await getParticipantHome(ctx, member)).tests.find((t) => t.testId === "supervisor")).toMatchObject({
      ready: true,
      questionCount: 12,
      caseStudyCount: 4,
    });
  });

  it("reports the numbers and the case studies of each test to the admin", async () => {
    const { ctx } = await setup(54, 6);
    const overview = await getAdminOverview(ctx);
    expect(overview.tests.find((t) => t.testId === "supervisor")).toMatchObject({
      questionCount: 60,
      ready: true,
      counts: counts(),
      caseStudyAvailable: 6,
    });
    expect(overview.tests.find((t) => t.testId === "participant")).toMatchObject({
      ready: false,
      counts: defaultCounts(testOf(ctx, "participant")),
      caseStudyAvailable: null,
    });

    await setCounts(ctx, testOf(ctx, "supervisor"), counts({ caseStudyBankSize: 9, caseStudyPerTest: 7 }));
    const short = (await getAdminOverview(ctx)).tests.find((t) => t.testId === "supervisor");
    expect(short).toMatchObject({ ready: false, counts: counts({ caseStudyBankSize: 9, caseStudyPerTest: 7 }) });
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
