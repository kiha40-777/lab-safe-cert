import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AdminOverview,
  AttemptResult,
  AttemptView,
  BankDto,
  MemberDto,
  ParticipantHome,
  ValidationResultDto,
} from "@/lib/types";
import { getAppContext } from "../context";
import { correctAnswersOf, kindsOf, makeBankJson } from "../test-utils";
import {
  ADMIN_PASSWORD,
  ApiClient,
  type ApiEnvironment,
  PARTICIPANT_PASSWORD,
  setupApiEnvironment,
  tinyPdf,
} from "./test-client";

let environment: ApiEnvironment;
beforeEach(async () => {
  environment = await setupApiEnvironment();
});
afterEach(async () => {
  await environment.cleanup();
});

async function login(scope: "admin" | "participant"): Promise<ApiClient> {
  const client = new ApiClient();
  const response = await client.loginAs(scope, scope === "admin" ? ADMIN_PASSWORD : PARTICIPANT_PASSWORD);
  expect(response.status).toBe(200);
  return client;
}

const read = async <T>(response: Response): Promise<T> => (await response.json()) as T;

async function uploadBank(admin: ApiClient, testId = "participant", count = 60) {
  const response = await admin.put(`/api/admin/tests/${testId}/bank`, { text: makeBankJson(count), reviewConfirmed: true });
  expect(response.status).toBe(200);
}

async function addMembers(admin: ApiClient, names: string[], role = "candidate") {
  const response = await admin.post("/api/admin/members/bulk", { names, role });
  expect(response.status).toBe(201);
  return (await read<{ created: MemberDto[] }>(response)).created;
}

/** Logs in as a participant and picks the given person. */
async function participantAs(memberId: string): Promise<ApiClient> {
  const client = await login("participant");
  const response = await client.post("/api/participant/identify", { memberId });
  expect(response.status).toBe(200);
  return client;
}

describe("admin: study material", () => {
  it("uploads, shows, replaces and removes a PDF", async () => {
    const admin = await login("admin");
    const upload = await admin.call("PUT", "/api/admin/tests/participant/material", {
      pdf: tinyPdf("first"),
      headers: { "x-filename": encodeURIComponent("講習資料 2026.pdf") },
    });
    expect(upload.status).toBe(200);
    expect(await read(upload)).toMatchObject({ material: { filename: "講習資料 2026.pdf", size: tinyPdf("first").length } });

    const view = await admin.get("/api/admin/tests/participant/material");
    expect(view.status).toBe(200);
    expect(view.headers.get("content-type")).toBe("application/pdf");
    expect(view.headers.get("content-disposition")).toBe(
      `inline; filename="____ 2026.pdf"; filename*=UTF-8''%E8%AC%9B%E7%BF%92%E8%B3%87%E6%96%99%202026.pdf`,
    );
    expect(Buffer.from(await view.arrayBuffer()).equals(Buffer.from(tinyPdf("first")))).toBe(true);
    expect((await admin.get("/api/admin/tests/participant/material?download=1")).headers.get("content-disposition")).toMatch(
      /^attachment;/,
    );

    await admin.call("PUT", "/api/admin/tests/participant/material", { pdf: tinyPdf("second") });
    const replaced = await admin.get("/api/admin/tests/participant/material");
    expect(new TextDecoder().decode(await replaced.arrayBuffer())).toContain("second");

    expect((await admin.delete("/api/admin/tests/participant/material")).status).toBe(200);
    const gone = await admin.get("/api/admin/tests/participant/material");
    expect(gone.status).toBe(404);
    expect(await read(gone)).toEqual({ error: { code: "materialNotFound" } });
  });

  it("refuses files that are not PDFs, empty files and unknown tests", async () => {
    const admin = await login("admin");
    const notPdf = await admin.call("PUT", "/api/admin/tests/participant/material", { pdf: new TextEncoder().encode("hello") });
    expect(notPdf.status).toBe(400);
    expect(await read(notPdf)).toEqual({ error: { code: "notPdf" } });

    const empty = await admin.call("PUT", "/api/admin/tests/participant/material", { pdf: new Uint8Array() });
    expect(empty.status).toBe(400);

    const wrongType = await admin.call("PUT", "/api/admin/tests/participant/material", {
      raw: { body: tinyPdf(), contentType: "text/html" },
    });
    expect(wrongType.status).toBe(415);

    const unknown = await admin.call("PUT", "/api/admin/tests/nope/material", { pdf: tinyPdf() });
    expect(unknown.status).toBe(404);
    expect(await read(unknown)).toEqual({ error: { code: "unknownTest" } });
  });

  it("accepts a PDF of any size", async () => {
    const admin = await login("admin");
    const big = new Uint8Array(6 * 1024 * 1024 + 7);
    big.set(tinyPdf());
    for (let i = 40; i < big.length; i++) big[i] = i % 251;
    const upload = await admin.call("PUT", "/api/admin/tests/participant/material", { pdf: big });
    expect(upload.status).toBe(200);
    expect(await read(upload)).toMatchObject({ material: { size: big.length } });
    const view = await admin.get("/api/admin/tests/participant/material");
    expect(Buffer.from(await view.arrayBuffer()).equals(Buffer.from(big))).toBe(true);
  });
});

describe("admin: question bank", () => {
  it("checks a file without saving it", async () => {
    const admin = await login("admin");
    const good = await admin.post("/api/admin/tests/participant/bank/validate", { text: makeBankJson(60) });
    const result = await read<ValidationResultDto>(good);
    expect(result).toMatchObject({ ok: true, errors: [], summary: { questionCount: 60 } });
    expect(result.preview).toHaveLength(60);
    expect(result.meta).toEqual({ generator: "test-suite", generatedAt: "2000-01-01", source: "placeholder" });
    expect((await read<{ bank: BankDto | null }>(await admin.get("/api/admin/tests/participant/bank"))).bank).toBeNull();

    const bad = await read<ValidationResultDto>(
      await admin.post("/api/admin/tests/participant/bank/validate", { text: makeBankJson(10) }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContainEqual({ code: "bank.tooFew", params: { count: 10, required: 30 } });
    expect(bad.preview).toBeNull();
  });

  it("saves a bank only after the admin confirms that it was reviewed", async () => {
    const admin = await login("admin");
    const unconfirmed = await admin.put("/api/admin/tests/participant/bank", { text: makeBankJson(60) });
    expect(unconfirmed.status).toBe(400);
    expect(await read(unconfirmed)).toEqual({ error: { code: "reviewNotConfirmed" } });

    const saved = await admin.put("/api/admin/tests/participant/bank", { text: makeBankJson(60), reviewConfirmed: true });
    expect(saved.status).toBe(200);
    expect(await read(saved)).toMatchObject({ meta: { generator: "test-suite", reviewConfirmedAt: expect.any(String) }, warnings: [] });

    const stored = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    expect(stored.bank.questions).toHaveLength(60);
    expect(stored.bank.questions[0]).toMatchObject({ id: "q001", answerIndex: 0, explanation: "", source: "" });
  });

  it("answers 422 with the list of problems when the bank is invalid, and keeps the old bank", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const broken = JSON.parse(makeBankJson(60)) as { questions: { answer: unknown }[] };
    broken.questions[3]!.answer = 2;
    const response = await admin.put("/api/admin/tests/participant/bank", { text: JSON.stringify(broken), reviewConfirmed: true });
    expect(response.status).toBe(422);
    const body = await read<{ error: { code: string }; validation: ValidationResultDto }>(response);
    expect(body.error.code).toBe("bankInvalid");
    expect(body.validation.errors).toContainEqual({ code: "answer.isNumber", question: 4, params: { value: 2 } });
    const stored = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    expect(stored.bank.questions).toHaveLength(60);
  });

  it("stores edits made in the editor, with the same checks, once the review is confirmed", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const { bank } = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    const questions = bank.questions.map((q) => ({ ...q }));
    questions[0]!.text = "Edited question text";
    questions[0]!.explanation = "Added while editing";
    questions.push({ id: "", kind: "standard", text: "A brand new question", choices: ["a1", "b1", "c1", "d1"], answerIndex: 2, explanation: "", source: "" });
    const meta = { generator: "test-suite, edited by hand" };

    const unconfirmed = await admin.put("/api/admin/tests/participant/bank", { questions, meta });
    expect(unconfirmed.status).toBe(400);
    expect(await read(unconfirmed)).toEqual({ error: { code: "reviewNotConfirmed" } });
    const untouched = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    expect(untouched.bank.questions).toHaveLength(60);

    const saved = await admin.put("/api/admin/tests/participant/bank", { questions, meta, reviewConfirmed: true });
    expect(saved.status).toBe(200);
    const savedMeta = (await read<{ meta: BankDto["meta"] }>(saved)).meta;
    expect(savedMeta).toMatchObject({
      generator: "test-suite, edited by hand",
      importedAt: bank.meta?.importedAt,
      reviewConfirmedAt: expect.any(String),
    });

    const again = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    expect(again.bank.questions).toHaveLength(61);
    expect(again.bank.questions[0]).toMatchObject({ text: "Edited question text", explanation: "Added while editing" });
    expect(again.bank.questions[60]).toMatchObject({ id: "q061", answerIndex: 2 });
  });

  it("saves questions that were checked from a file, edited in the editor and confirmed (no bank stored before)", async () => {
    const admin = await login("admin");
    const checked = await read<ValidationResultDto>(
      await admin.post("/api/admin/tests/participant/bank/validate", { text: makeBankJson(60) }),
    );
    expect(checked.ok).toBe(true);
    expect(await read(await admin.get("/api/admin/tests/participant/bank"))).toEqual({ bank: null });

    const questions = checked.preview!.map((q) => ({ ...q }));
    questions[1]!.text = "Corrected before saving";
    const response = await admin.put("/api/admin/tests/participant/bank", {
      questions,
      meta: checked.meta,
      imported: true,
      reviewConfirmed: true,
    });
    expect(response.status).toBe(200);

    const stored = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    expect(stored.bank.questions).toHaveLength(60);
    expect(stored.bank.questions[1]).toMatchObject({ text: "Corrected before saving" });
    expect(stored.bank.meta).toMatchObject({ generator: "test-suite", reviewConfirmedAt: expect.any(String) });
  });

  it("refuses edited questions that do not have exactly 4 choices", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const { bank } = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/participant/bank"));
    const questions = bank.questions.map((q) => ({ ...q }));
    questions[2]!.choices = [...questions[2]!.choices, "a fifth choice"];

    const response = await admin.put("/api/admin/tests/participant/bank", { questions, reviewConfirmed: true });
    expect(response.status).toBe(422);
    const body = await read<{ validation: ValidationResultDto }>(response);
    expect(body.validation.errors).toContainEqual({ code: "question.choicesNotExact", question: 3, params: { expected: 4, count: 5 } });
  });

  it("exports the stored bank as a file in the documented format", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const response = await admin.get("/api/admin/tests/participant/bank/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain('filename="question-bank-participant.json"');
    const file = JSON.parse(await response.text()) as { schema_version: number; questions: { answer: string }[] };
    expect(file.schema_version).toBe(1);
    expect(file.questions).toHaveLength(60);
    expect(file.questions[1]!.answer).toBe("B");

    // and the exported file can be uploaded again
    const check = await read<ValidationResultDto>(
      await admin.post("/api/admin/tests/participant/bank/validate", { text: JSON.stringify(file) }),
    );
    expect(check.ok).toBe(true);

    expect((await admin.get("/api/admin/tests/supervisor/bank/export")).status).toBe(404);
  });

  it("rejects a body that is neither a file text nor a list of questions", async () => {
    const admin = await login("admin");
    const response = await admin.put("/api/admin/tests/participant/bank", { nothing: true });
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: { code: "invalidInput", params: { field: "questions" } } });
  });
});

describe("admin: number of questions", () => {
  const putCounts = (admin: ApiClient, testId: string, body: unknown) =>
    admin.put(`/api/admin/tests/${testId}/counts`, body);
  const overviewOf = async (admin: ApiClient, testId: string) =>
    (await read<AdminOverview>(await admin.get("/api/admin/overview"))).tests.find((t) => t.testId === testId);
  // the first numbers of the supervisor test: 60 questions in the set (6 case studies), 30 in a test (3 case studies)
  const first = { bankSize: 60, perTest: 30, caseStudyBankSize: 6, caseStudyPerTest: 3 };
  const bankJson = (standard: number, caseStudies: number) => makeBankJson(standard, 4, {}, caseStudies);
  const putBank = (admin: ApiClient, testId: string, text: string) =>
    admin.put(`/api/admin/tests/${testId}/bank`, { text, reviewConfirmed: true });

  it("is for the admin only", async () => {
    const anonymous = new ApiClient();
    expect((await putCounts(anonymous, "supervisor", first)).status).toBe(401);
    const participant = await login("participant");
    expect((await putCounts(participant, "supervisor", first)).status).toBe(401);
  });

  it("starts at 60 / 30, and for the supervisor test 6 / 3 case studies", async () => {
    const admin = await login("admin");
    expect(await overviewOf(admin, "participant")).toMatchObject({
      counts: { bankSize: 60, perTest: 30, caseStudyBankSize: 0, caseStudyPerTest: 0 },
      caseStudyAvailable: null,
    });
    expect(await overviewOf(admin, "supervisor")).toMatchObject({ counts: first, caseStudyAvailable: 0, ready: false });
  });

  it("saves the numbers of a test and shows them in the overview", async () => {
    const admin = await login("admin");
    const numbers = { bankSize: 100, perTest: 20, caseStudyBankSize: 10, caseStudyPerTest: 2 };
    const saved = await putCounts(admin, "supervisor", numbers);
    expect(saved.status).toBe(200);
    expect(await read(saved)).toEqual({ counts: numbers });
    expect(await overviewOf(admin, "supervisor")).toMatchObject({ counts: numbers });
    expect(await overviewOf(admin, "participant")).toMatchObject({ counts: { bankSize: 60, perTest: 30 } }); // not affected

    // a test without case studies: the numbers for them may be left out
    const plain = await putCounts(admin, "participant", { bankSize: 40, perTest: 10 });
    expect(plain.status).toBe(200);
    expect(await overviewOf(admin, "participant")).toMatchObject({
      counts: { bankSize: 40, perTest: 10, caseStudyBankSize: 0, caseStudyPerTest: 0 },
    });
  });

  it("refuses numbers that do not fit together, case studies for a test without them, and numbers that make no sense", async () => {
    const admin = await login("admin");
    const refused = async (testId: string, change: Record<string, unknown>, problem: string) => {
      const response = await putCounts(admin, testId, { ...first, ...change });
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(await read(response)).toEqual({ error: { code: "invalidCounts", params: { problem } } });
    };
    await refused("supervisor", { perTest: 61 }, "perTestAboveBank");
    await refused("supervisor", { caseStudyBankSize: 61 }, "caseStudyBankAboveBank");
    await refused("supervisor", { caseStudyPerTest: 31 }, "caseStudyPerTestAbovePerTest");
    await refused("supervisor", { caseStudyBankSize: 2 }, "caseStudyPerTestAboveBank");
    await refused("supervisor", { caseStudyBankSize: 40 }, "ordinaryShort"); // 20 ordinary questions, 27 needed
    await refused("participant", { caseStudyBankSize: 6, caseStudyPerTest: 3 }, "noCaseStudies");
    expect(await overviewOf(admin, "supervisor")).toMatchObject({ counts: first }); // nothing was stored

    for (const bad of [0, -1, 1.5, "60", null, 5001]) {
      const response = await putCounts(admin, "supervisor", { ...first, bankSize: bad });
      expect(response.status, `bankSize ${String(bad)}`).toBe(400);
      expect(await read(response)).toEqual({ error: { code: "invalidInput", params: { field: "bankSize" } } });
    }
    const noTest = await putCounts(admin, "nope", first);
    expect(noTest.status).toBe(404);
    expect((await putCounts(admin, "supervisor", { perTest: 30 })).status).toBe(400); // bankSize missing
  });

  it("checks a file against the numbers: too few case studies is refused, a file with enough is saved", async () => {
    const admin = await login("admin");
    const short = await admin.post("/api/admin/tests/supervisor/bank/validate", { text: bankJson(54, 2) });
    expect(await read<ValidationResultDto>(short)).toMatchObject({
      ok: false,
      errors: [{ code: "bank.caseStudyTooFew", params: { count: 2, required: 3 } }],
    });
    expect((await putBank(admin, "supervisor", bankJson(54, 2))).status).toBe(422);

    const good = await admin.post("/api/admin/tests/supervisor/bank/validate", { text: bankJson(54, 6) });
    const result = await read<ValidationResultDto>(good);
    expect(result).toMatchObject({ ok: true, warnings: [], summary: { questionCount: 60, caseStudyCount: 6 } });
    expect(result.preview?.filter((q) => q.kind === "case_study")).toHaveLength(6);

    expect((await putBank(admin, "supervisor", bankJson(54, 6))).status).toBe(200);
    expect(await overviewOf(admin, "supervisor")).toMatchObject({ questionCount: 60, ready: true, caseStudyAvailable: 6, counts: first });
    const stored = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/supervisor/bank"));
    expect(stored.bank.questions.filter((q) => q.kind === "case_study").map((q) => q.id)).toEqual([
      "c001",
      "c002",
      "c003",
      "c004",
      "c005",
      "c006",
    ]);
  });

  it("checks a file against the numbers that were set, not the first ones", async () => {
    const admin = await login("admin");
    await putCounts(admin, "participant", { bankSize: 40, perTest: 10 });
    const result = await read<ValidationResultDto>(
      await admin.post("/api/admin/tests/participant/bank/validate", { text: makeBankJson(12) }),
    );
    // 12 questions are enough for a test of 10; the set was meant to hold 40
    expect(result).toMatchObject({ ok: true, warnings: [{ code: "bank.sizeDiffers", params: { count: 12, expected: 40 } }] });
    const tooFew = await read<ValidationResultDto>(
      await admin.post("/api/admin/tests/participant/bank/validate", { text: makeBankJson(9) }),
    );
    expect(tooFew.errors).toContainEqual({ code: "bank.tooFew", params: { count: 9, required: 10 } });
  });

  it("keeps the type of a question edited in the editor, and refuses an unknown one", async () => {
    const admin = await login("admin");
    expect((await putBank(admin, "supervisor", bankJson(54, 6))).status).toBe(200);
    const { bank } = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/supervisor/bank"));
    const questions = bank.questions.map((q) => ({ ...q }));
    questions[0]!.kind = "case_study";
    questions[59]!.kind = "standard"; // the numbers stay what they are: 6 case studies, 54 ordinary questions

    const ok = await admin.put("/api/admin/tests/supervisor/bank", { questions, reviewConfirmed: true });
    expect(ok.status).toBe(200);
    const again = await read<{ bank: BankDto }>(await admin.get("/api/admin/tests/supervisor/bank"));
    expect(again.bank.questions[0]?.kind).toBe("case_study");
    expect(again.bank.questions[1]?.kind).toBe("standard");

    const bad = await admin.put("/api/admin/tests/supervisor/bank", {
      questions: questions.map((q, i) => (i === 0 ? { ...q, kind: "essay" } : q)),
      reviewConfirmed: true,
    });
    expect(bad.status).toBe(400);
    expect(await read(bad)).toEqual({ error: { code: "invalidInput", params: { field: "kind" } } });
  });

  it("downloads the bank with the type of the case studies", async () => {
    const admin = await login("admin");
    await putBank(admin, "supervisor", bankJson(54, 6));
    const file = (await read<{ questions: { id: string; type?: string }[] }>(
      await admin.get("/api/admin/tests/supervisor/bank/export"),
    )).questions;
    expect(file.filter((q) => q.type === "case_study")).toHaveLength(6);
    expect(file.filter((q) => q.type === undefined)).toHaveLength(54);
  });

  it("lets a participant take the test with the case studies last", async () => {
    const admin = await login("admin");
    await putBank(admin, "supervisor", bankJson(54, 6));
    const [pat] = await addMembers(admin, ["Pat"], "participant");
    const client = await participantAs(pat!.id);

    const home = await read<ParticipantHome>(await client.get("/api/participant/home"));
    expect(home.tests.find((t) => t.testId === "supervisor")).toMatchObject({ ready: true, questionCount: 30, caseStudyCount: 3 });

    const started = await client.post("/api/participant/attempts", { testId: "supervisor" });
    expect(started.status).toBe(201);
    const attempt = await read<AttemptView>(started);
    expect(attempt.questions).toHaveLength(30);
    expect(JSON.stringify(attempt)).not.toMatch(/answerIndex|caseStudy|case_study|kind/);

    const ctx = await getAppContext();
    expect(await kindsOf(ctx, attempt.id)).toEqual([...Array(27).fill("standard"), ...Array(3).fill("case_study")]);
    const result = await read<AttemptResult>(
      await client.post(`/api/participant/attempts/${attempt.id}/submit`, { answers: await correctAnswersOf(ctx, attempt.id) }),
    );
    expect(result).toMatchObject({ score: 30, total: 30, passed: true, promotedTo: "supervisor" });
  });

  it("lets a small test be written entirely by hand: numbers first, then the questions one by one", async () => {
    const admin = await login("admin");
    // a set of 4 questions (1 case study), a test of 2 questions (1 case study)
    const numbers = { bankSize: 4, perTest: 2, caseStudyBankSize: 1, caseStudyPerTest: 1 };
    expect((await putCounts(admin, "supervisor", numbers)).status).toBe(200);

    const question = (text: string, kind: "standard" | "case_study") => ({
      id: "",
      kind,
      text,
      choices: ["first", "second", "third", "fourth"],
      answerIndex: 1,
      explanation: "",
      source: "",
    });
    // nothing is written yet: an empty list is refused
    const empty = await admin.put("/api/admin/tests/supervisor/bank", { questions: [], reviewConfirmed: true });
    expect(empty.status).toBe(422);
    // the case study is still missing
    const noCase = await admin.put("/api/admin/tests/supervisor/bank", {
      questions: [question("one", "standard"), question("two", "standard"), question("three", "standard")],
      reviewConfirmed: true,
    });
    expect(noCase.status).toBe(422);
    expect((await read<{ validation: ValidationResultDto }>(noCase)).validation.errors).toContainEqual({
      code: "bank.caseStudyTooFew",
      params: { count: 0, required: 1 },
    });

    const written = [question("one", "standard"), question("two", "standard"), question("three", "standard"), question("a situation", "case_study")];
    const saved = await admin.put("/api/admin/tests/supervisor/bank", { questions: written, imported: true, reviewConfirmed: true });
    expect(saved.status).toBe(200);
    expect(await overviewOf(admin, "supervisor")).toMatchObject({ questionCount: 4, ready: true, caseStudyAvailable: 1 });

    const [pat] = await addMembers(admin, ["Pat"], "participant");
    const client = await participantAs(pat!.id);
    const attempt = await read<AttemptView>(await client.post("/api/participant/attempts", { testId: "supervisor" }));
    expect(attempt.questions).toHaveLength(2);
    expect(attempt.questions[1]!.text).toBe("a situation"); // the case study is always last
  });
});

describe("admin: members", () => {
  it("registers people one by one and in bulk, edits and removes them", async () => {
    const admin = await login("admin");
    const single = await admin.post("/api/admin/members", { name: "  Ann   Lee " });
    expect(single.status).toBe(201);
    const ann = (await read<{ member: MemberDto }>(single)).member;
    expect(ann).toMatchObject({ name: "Ann Lee", role: "candidate", selfRegistered: false });

    expect((await admin.post("/api/admin/members", { name: "ann lee" })).status).toBe(409);
    expect((await admin.post("/api/admin/members", { name: "Bob", role: "king" })).status).toBe(400);

    const bulk = await admin.post("/api/admin/members/bulk", { names: ["Bob", "ann lee", "", "Cy"], role: "participant" });
    const bulkBody = await read<{ created: MemberDto[]; skipped: { name: string; reason: string }[] }>(bulk);
    expect(bulkBody.created.map((m) => [m.name, m.role])).toEqual([
      ["Bob", "participant"],
      ["Cy", "participant"],
    ]);
    expect(bulkBody.skipped).toEqual([{ name: "ann lee", reason: "exists" }]);

    const patched = await admin.patch(`/api/admin/members/${ann.id}`, { name: "Ann Lee-Smith", role: "supervisor" });
    expect(await read(patched)).toMatchObject({ member: { name: "Ann Lee-Smith", role: "supervisor" } });
    expect((await admin.patch("/api/admin/members/nobody", { role: "candidate" })).status).toBe(404);

    expect((await admin.delete(`/api/admin/members/${ann.id}`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/members/${ann.id}`)).status).toBe(404);
    const overview = await read<AdminOverview>(await admin.get("/api/admin/overview"));
    expect(overview.members.map((m) => m.name).sort()).toEqual(["Bob", "Cy"]);
  });
});

describe("participant: choosing a name", () => {
  it("shows the roster, lets the person pick their name, and lets them switch", async () => {
    const admin = await login("admin");
    const [ann, bob] = await addMembers(admin, ["Ann", "Bob"]);
    const client = await login("participant");

    const roster = await read<{ members: MemberDto[] }>(await client.get("/api/participant/members"));
    expect(roster.members.map((m) => m.name).sort()).toEqual(["Ann", "Bob"]);

    expect((await client.get("/api/participant/home")).status).toBe(409); // nobody chosen yet
    expect(await read(await client.get("/api/participant/home"))).toEqual({ error: { code: "memberNotSelected" } });

    const picked = await client.post("/api/participant/identify", { memberId: ann!.id });
    expect(await read(picked)).toEqual({ member: { id: ann!.id, name: "Ann", role: "candidate", selfRegistered: false } });
    expect(await read<{ member: MemberDto }>(await client.get("/api/auth/status"))).toMatchObject({ member: { name: "Ann" } });
    expect((await read<ParticipantHome>(await client.get("/api/participant/home"))).member.name).toBe("Ann");

    await client.post("/api/participant/identify", { memberId: bob!.id });
    expect((await read<ParticipantHome>(await client.get("/api/participant/home"))).member.name).toBe("Bob");

    expect(await read(await client.post("/api/participant/identify", { clear: true }))).toEqual({ member: null });
    expect((await client.get("/api/participant/home")).status).toBe(409);

    const unknown = await client.post("/api/participant/identify", { memberId: "nobody" });
    expect(unknown.status).toBe(404);
  });

  it("registers a new candidate who types their own name via \"Other\"", async () => {
    const admin = await login("admin");
    await addMembers(admin, ["Ann"]);
    const client = await login("participant");

    const created = await client.post("/api/participant/identify", { newName: "  Newcomer  Nakamura " });
    expect(created.status).toBe(200);
    expect(await read(created)).toMatchObject({ member: { name: "Newcomer Nakamura", role: "candidate", selfRegistered: true } });

    const taken = await client.post("/api/participant/identify", { newName: "ann" });
    expect(taken.status).toBe(409);
    expect(await read(taken)).toEqual({ error: { code: "memberNameExists" } });
    expect((await client.post("/api/participant/identify", { newName: "   " })).status).toBe(400);

    const overview = await read<AdminOverview>(await admin.get("/api/admin/overview"));
    expect(overview.members.find((m) => m.name === "Newcomer Nakamura")).toMatchObject({ selfRegistered: true });
    // the admin can approve (any edit clears the mark)
    const id = overview.members.find((m) => m.name === "Newcomer Nakamura")!.id;
    await admin.patch(`/api/admin/members/${id}`, { role: "candidate" });
    const after = await read<AdminOverview>(await admin.get("/api/admin/overview"));
    expect(after.members.find((m) => m.id === id)).toMatchObject({ selfRegistered: false });
  });
});

describe("participant: taking the test", () => {
  it("shows what is available before the admin has prepared anything", async () => {
    const admin = await login("admin");
    const [ann] = await addMembers(admin, ["Ann"]);
    const client = await participantAs(ann!.id);
    const home = await read<ParticipantHome>(await client.get("/api/participant/home"));
    expect(home).toMatchObject({
      nextTestId: "participant",
      activeAttempt: null,
      recentAttempts: [],
      tests: [
        { testId: "participant", ready: false, material: null },
        { testId: "supervisor", ready: false, material: null },
      ],
    });
    const start = await client.post("/api/participant/attempts", { testId: "participant" });
    expect(start.status).toBe(409);
    expect(await read(start)).toEqual({ error: { code: "testNotReady" } });
    expect((await client.get("/api/participant/materials/participant")).status).toBe(404);
  });

  it("candidate: study PDF -> test -> fail -> retake -> pass -> promoted", async () => {
    const admin = await login("admin");
    await admin.call("PUT", "/api/admin/tests/participant/material", { pdf: tinyPdf("study"), headers: { "x-filename": "study.pdf" } });
    await uploadBank(admin);
    const [ann] = await addMembers(admin, ["Ann"]);
    const client = await participantAs(ann!.id);

    // the start screen
    const home = await read<ParticipantHome>(await client.get("/api/participant/home"));
    expect(home.nextTestId).toBe("participant");
    expect(home.tests[0]).toMatchObject({ ready: true, material: { filename: "study.pdf" } });
    const pdf = await client.get("/api/participant/materials/participant");
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode(await pdf.arrayBuffer())).toContain("study");

    // start: 30 questions, no answers revealed anywhere
    const started = await client.post("/api/participant/attempts", { testId: "participant" });
    expect(started.status).toBe(201);
    const startedText = await started.text();
    for (const secret of ["answerIndex", "explanation", "correct", "\"source\""]) expect(startedText).not.toContain(secret);
    const attempt = JSON.parse(startedText) as AttemptView;
    expect(attempt.questions).toHaveLength(30);

    // reload in the middle: same questions, saved answers come back
    const ctx = await getAppContext();
    const correct = await correctAnswersOf(ctx, attempt.id);
    const partial = correct.map((c, i): number | null => (i < 10 ? c : null));
    expect((await client.put(`/api/participant/attempts/${attempt.id}/answers`, { answers: partial })).status).toBe(200);
    const resumed = await client.post("/api/participant/attempts", { testId: "participant" });
    expect(await read<AttemptView>(resumed)).toMatchObject({ id: attempt.id, resumed: true, answers: partial });
    const detail = await client.get(`/api/participant/attempts/${attempt.id}`);
    const detailText = await detail.text();
    expect(detailText).not.toContain("answerIndex");
    expect(JSON.parse(detailText)).toMatchObject({ status: "in_progress", answers: partial });
    expect((await read<ParticipantHome>(await client.get("/api/participant/home"))).activeAttempt).toEqual({
      id: attempt.id,
      testId: "participant",
    });

    // hand in with one answer wrong
    const wrong = [...correct];
    wrong[0] = (wrong[0]! + 1) % 4;
    const failed = await client.post(`/api/participant/attempts/${attempt.id}/submit`, { answers: wrong });
    expect(failed.status).toBe(200);
    const failedResult = await read<AttemptResult>(failed);
    expect(failedResult).toMatchObject({ status: "submitted", score: 29, total: 30, requiredScore: 30, passed: false, promotedTo: null });
    expect(failedResult.questions[0]).toMatchObject({ correct: false, chosenIndex: wrong[0], answerIndex: correct[0] });
    expect(failedResult.questions).toHaveLength(30);
    expect((await read<ParticipantHome>(await client.get("/api/participant/home"))).member.role).toBe("candidate");

    // it cannot be handed in twice
    const twice = await client.post(`/api/participant/attempts/${attempt.id}/submit`, { answers: correct });
    expect(twice.status).toBe(409);
    expect(await read(twice)).toEqual({ error: { code: "attemptClosed" } });

    // the result can be opened again
    expect(await read(await client.get(`/api/participant/attempts/${attempt.id}`))).toEqual(failedResult);

    // retake with all answers right
    const retry = await read<AttemptView>(await client.post("/api/participant/attempts", { testId: "participant" }));
    expect(retry.id).not.toBe(attempt.id);
    const passed = await read<AttemptResult>(
      await client.post(`/api/participant/attempts/${retry.id}/submit`, { answers: await correctAnswersOf(ctx, retry.id) }),
    );
    expect(passed).toMatchObject({ passed: true, score: 30, promotedTo: "participant" });

    // now a participant: the supervisor test is next
    const after = await read<ParticipantHome>(await client.get("/api/participant/home"));
    expect(after).toMatchObject({ member: { role: "participant" }, nextTestId: "supervisor", activeAttempt: null });
    expect(after.recentAttempts.map((a) => a.passed)).toEqual([true, false]);
    const notAgain = await client.post("/api/participant/attempts", { testId: "participant" });
    expect(notAgain.status).toBe(403);
    expect(await read(notAgain)).toEqual({ error: { code: "wrongRole" } });
    expect((await client.post("/api/participant/attempts", { testId: "supervisor" })).status).toBe(409); // no bank yet
  });

  it("cannot read or hand in somebody else's attempt", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const [ann, bob] = await addMembers(admin, ["Ann", "Bob"]);
    const annClient = await participantAs(ann!.id);
    const bobClient = await participantAs(bob!.id);
    const attempt = await read<AttemptView>(await annClient.post("/api/participant/attempts", { testId: "participant" }));

    for (const response of [
      await bobClient.get(`/api/participant/attempts/${attempt.id}`),
      await bobClient.put(`/api/participant/attempts/${attempt.id}/answers`, { answers: attempt.answers }),
      await bobClient.post(`/api/participant/attempts/${attempt.id}/submit`, { answers: attempt.answers }),
    ]) {
      expect(response.status).toBe(404);
    }
  });

  it("validates what it is sent", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const [ann] = await addMembers(admin, ["Ann"]);
    const client = await participantAs(ann!.id);
    expect((await client.post("/api/participant/attempts", {})).status).toBe(400);
    expect((await client.post("/api/participant/attempts", { testId: "nope" })).status).toBe(404);
    const attempt = await read<AttemptView>(await client.post("/api/participant/attempts", { testId: "participant" }));
    const bad = await client.post(`/api/participant/attempts/${attempt.id}/submit`, { answers: [1, 2, 3] });
    expect(bad.status).toBe(400);
    expect(await read(bad)).toEqual({ error: { code: "invalidAnswers" } });
    expect((await client.get("/api/participant/attempts/does-not-exist")).status).toBe(404);
  });
});

describe("admin: progress and export", () => {
  it("shows results on the dashboard and in a member's history, and exports CSV", async () => {
    const admin = await login("admin");
    await uploadBank(admin);
    const [ann, bob] = await addMembers(admin, ["Ann", "Bob"]);
    const ctx = await getAppContext();
    const annClient = await participantAs(ann!.id);
    const attempt = await read<AttemptView>(await annClient.post("/api/participant/attempts", { testId: "participant" }));
    await annClient.post(`/api/participant/attempts/${attempt.id}/submit`, { answers: await correctAnswersOf(ctx, attempt.id) });

    const overview = await read<AdminOverview>(await admin.get("/api/admin/overview"));
    const annRow = overview.members.find((m) => m.id === ann!.id);
    expect(annRow).toMatchObject({ role: "participant" });
    expect(annRow!.stats[0]).toMatchObject({ testId: "participant", attempts: 1, bestScore: 30, bestTotal: 30, lastPassed: true });
    expect(overview.members.find((m) => m.id === bob!.id)!.stats[0]).toMatchObject({ attempts: 0, lastAt: null });
    expect(overview.tests[0]).toMatchObject({ testId: "participant", questionCount: 60, material: null });
    expect(overview.recentAttempts[0]).toMatchObject({ memberName: "Ann", passed: true, score: 30 });

    const history = await read<{ member: MemberDto; attempts: { id: string }[] }>(
      await admin.get(`/api/admin/members/${ann!.id}/attempts`),
    );
    expect(history.attempts.map((a) => a.id)).toEqual([attempt.id]);
    const detail = await read<AttemptResult>(await admin.get(`/api/admin/attempts/${attempt.id}`));
    expect(detail).toMatchObject({ memberName: "Ann", passed: true });
    expect(detail.questions).toHaveLength(30);

    const results = await admin.get("/api/admin/export?type=results");
    expect(results.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(results.headers.get("content-disposition")).toMatch(/^attachment; filename="results-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = Buffer.from(await results.arrayBuffer()); // (Response.text() would drop the BOM)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM, so Excel reads Japanese correctly
    const csv = bytes.toString("utf8");
    expect(csv.startsWith("﻿name,role,")).toBe(true);
    expect(csv).toContain("Ann,participant,no,");
    expect(await (await admin.get("/api/admin/export?type=attempts")).text()).toContain("Ann,participant,");
    expect((await admin.get("/api/admin/export?type=secrets")).status).toBe(400);
  });
});

describe("admin: participant password", () => {
  it("generates a new participant password and logs the old participants out", async () => {
    await environment.cleanup();
    environment = await setupApiEnvironment({ PARTICIPANT_PASSWORD: null });
    const admin = await login("admin");
    expect(await read(await admin.get("/api/admin/settings"))).toEqual({
      admin: { managedByEnv: true },
      participant: { set: false, managedByEnv: false },
    });

    const generated = await read<{ password: string }>(
      await admin.post("/api/admin/settings/password", { kind: "participant", generate: true }),
    );
    expect(generated.password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){2}$/);
    expect((await read<{ participant: { set: boolean } }>(await admin.get("/api/admin/settings"))).participant.set).toBe(true);

    const student = new ApiClient();
    expect((await student.loginAs("participant", generated.password)).status).toBe(200);
    expect((await student.get("/api/participant/members")).status).toBe(200);

    const chosen = await admin.post("/api/admin/settings/password", { kind: "participant", newPassword: "our team password" });
    expect(chosen.status).toBe(200);
    expect(await read(chosen)).toEqual({ password: null });
    expect((await student.get("/api/participant/members")).status).toBe(401); // logged out by the change
    expect((await new ApiClient().loginAs("participant", generated.password)).status).toBe(401);
    expect((await new ApiClient().loginAs("participant", "our team password")).status).toBe(200);
    expect((await admin.get("/api/admin/overview")).status).toBe(200); // the admin stays logged in
  });

  it("is managed by the environment when PARTICIPANT_PASSWORD is set", async () => {
    const admin = await login("admin");
    const response = await admin.post("/api/admin/settings/password", { kind: "participant", generate: true });
    expect(response.status).toBe(409);
    expect(await read(response)).toEqual({ error: { code: "passwordManagedByEnv" } });
  });
});

describe("health check", () => {
  it("answers without a login", async () => {
    const response = await new ApiClient().get("/api/health");
    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ ok: true });
  });
});
