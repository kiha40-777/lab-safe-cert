import { describe, expect, it } from "vitest";
import { validateBankText } from "../bank/validate";
import { correctAnswersOf, makeBankJson, makeTestContext } from "../test-utils";
import { startAttempt, submitAttempt } from "./attempts";
import { rulesFor, saveBank } from "./banks";
import { attemptsCsv, csvCell, resultsCsv } from "./export";
import { createMember } from "./members";
import { getAdminOverview } from "./overview";
import { findTest } from "@/lib/certification";
import { defaultCounts } from "@/lib/counts";
import type { Bank } from "../bank/types";

type Ctx = Awaited<ReturnType<typeof makeTestContext>>;

async function withBank(ctx: Ctx) {
  const test = findTest(ctx.config, "participant");
  if (!test) throw new Error("missing test");
  const outcome = validateBankText(makeBankJson(60), rulesFor(ctx.config, test, defaultCounts(test)));
  await saveBank(ctx, "participant", outcome.bank as Bank, { kind: "import", reviewConfirmed: true });
}

async function attempt(ctx: Ctx, memberId: string, wrong: number) {
  const view = await startAttempt(ctx, memberId, "participant");
  const answers = await correctAnswersOf(ctx, view.id);
  for (let i = 0; i < wrong; i++) answers[i] = (answers[i]! + 1) % 4;
  ctx.advance(60_000);
  return submitAttempt(ctx, view.id, memberId, answers);
}

describe("getAdminOverview", () => {
  it("summarizes people, their attempts per test, and the state of each test", async () => {
    const ctx = await makeTestContext();
    await withBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    const bob = await createMember(ctx, { name: "Bob", selfRegistered: true });
    await createMember(ctx, { name: "Cy", role: "supervisor" });

    await attempt(ctx, ann.id, 5); // 25/30, fail
    await attempt(ctx, ann.id, 1); // 29/30, fail
    await attempt(ctx, ann.id, 3); // 27/30, fail (worse than the best)
    await attempt(ctx, ann.id, 0); // 30/30, pass -> participant

    const overview = await getAdminOverview(ctx);
    const ann2 = overview.members.find((m) => m.name === "Ann");
    const stats = ann2?.stats.find((s) => s.testId === "participant");
    expect(ann2?.role).toBe("participant");
    expect(stats).toMatchObject({
      attempts: 4,
      bestScore: 30,
      bestTotal: 30,
      lastScore: 30,
      lastTotal: 30,
      lastPassed: true,
    });
    expect(stats?.passedAt).toBe(stats?.lastAt);
    expect(ann2?.lastActivityAt).toBe(stats?.lastAt);

    const bob2 = overview.members.find((m) => m.id === bob.id);
    expect(bob2).toMatchObject({ selfRegistered: true, role: "candidate", lastActivityAt: null });
    expect(bob2?.stats.find((s) => s.testId === "participant")).toMatchObject({
      attempts: 0,
      bestScore: null,
      lastPassed: null,
      passedAt: null,
    });

    expect(overview.tests.map((t) => [t.testId, t.questionCount, t.bank !== null, t.material])).toEqual([
      ["participant", 60, true, null],
      ["supervisor", 0, false, null],
    ]);
    expect(overview.recentAttempts).toHaveLength(4);
    expect(overview.recentAttempts[0]).toMatchObject({ memberName: "Ann", passed: true }); // newest first
  });

  it("uses the best score by share of correct answers, latest first on ties", async () => {
    const ctx = await makeTestContext();
    await withBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    await attempt(ctx, ann.id, 2);
    await attempt(ctx, ann.id, 4);
    const stats = (await getAdminOverview(ctx)).members[0]?.stats[0];
    expect(stats).toMatchObject({ bestScore: 28, lastScore: 26 });
  });

  it("ignores unfinished attempts", async () => {
    const ctx = await makeTestContext();
    await withBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    await startAttempt(ctx, ann.id, "participant");
    const overview = await getAdminOverview(ctx);
    expect(overview.members[0]?.stats[0]?.attempts).toBe(0);
    expect(overview.recentAttempts).toEqual([]);
  });
});

describe("csvCell", () => {
  it("quotes values with commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralizes spreadsheet formulas", () => {
    for (const formula of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      expect(csvCell(formula).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
  });

  it("writes numbers and empty values plainly", () => {
    expect(csvCell(30)).toBe("30");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
  });
});

describe("CSV export", () => {
  it("writes one row per person with a BOM and CRLF line endings", async () => {
    const ctx = await makeTestContext();
    await withBank(ctx);
    const ann = await createMember(ctx, { name: "Lee, Ann" });
    await createMember(ctx, { name: "=EVIL()", role: "supervisor" });
    await attempt(ctx, ann.id, 1);

    const csv = await resultsCsv(ctx);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines.at(-1)).toBe("");
    expect(lines[0]).toBe(
      "name,role,self_registered,registered_at,last_activity_at," +
        "participant_attempts,participant_best,participant_last,participant_last_at,participant_passed_at," +
        "supervisor_attempts,supervisor_best,supervisor_last,supervisor_last_at,supervisor_passed_at",
    );
    expect(lines[1]).toContain('"Lee, Ann",candidate,no,');
    expect(lines[1]).toContain(",1,29/30,29/30,");
    expect(lines[2]?.startsWith("'=EVIL(),supervisor,no,")).toBe(true);
    expect(lines).toHaveLength(4);
  });

  it("lists every submitted attempt", async () => {
    const ctx = await makeTestContext();
    await withBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    await attempt(ctx, ann.id, 2);
    await attempt(ctx, ann.id, 0);
    const lines = (await attemptsCsv(ctx)).slice(1).split("\r\n");
    expect(lines[0]).toBe("name,test,submitted_at,score,total,passed,promoted_to");
    expect(lines[1]).toMatch(/^Ann,participant,.+,28,30,no,$/);
    expect(lines[2]).toMatch(/^Ann,participant,.+,30,30,yes,participant$/);
  });
});
