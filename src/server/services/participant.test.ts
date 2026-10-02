import { describe, expect, it } from "vitest";
import { createSession, findSession, hashToken } from "../auth/sessions";
import { type Bank } from "../bank/types";
import { makeQuestions, makeTestContext } from "../test-utils";
import { startAttempt, submitAttempt } from "./attempts";
import { saveBank } from "./banks";
import { createMember, listMemberRows, updateMember } from "./members";
import { saveMaterial } from "./materials";
import { getParticipantHome, identify, listRoster, requireSessionMember } from "./participant";

type Ctx = Awaited<ReturnType<typeof makeTestContext>>;

const bank = (count = 60): Bank => ({
  info: { generator: null, generatedAt: null, source: null },
  questions: makeQuestions(count),
});

async function withParticipantBank(ctx: Ctx) {
  await saveBank(ctx, "participant", bank(), { kind: "import", reviewConfirmed: true });
}

describe("listRoster", () => {
  it("lists every person with their level and no other details", async () => {
    const ctx = await makeTestContext();
    await createMember(ctx, { name: "Ann", role: "participant" });
    await createMember(ctx, { name: "Bob" });
    const roster = await listRoster(ctx);
    expect(roster.map((m) => [m.name, m.role])).toEqual([
      ["Ann", "participant"],
      ["Bob", "candidate"],
    ]);
    expect(Object.keys(roster[0] ?? {}).sort()).toEqual(["id", "name", "role", "selfRegistered"]);
  });
});

describe("identify and requireSessionMember", () => {
  it("binds an existing person to the login session", async () => {
    const ctx = await makeTestContext();
    const ann = await createMember(ctx, { name: "Ann" });
    const { token } = await createSession(ctx, "participant");
    const session = await findSession(ctx, "participant", token);
    expect(session).not.toBeNull();

    await expect(requireSessionMember(ctx, session)).rejects.toMatchObject({ status: 409, code: "memberNotSelected" });
    expect(await identify(ctx, session!, { memberId: ann.id })).toMatchObject({ id: ann.id, name: "Ann" });
    const bound = await findSession(ctx, "participant", token);
    expect((await requireSessionMember(ctx, bound)).id).toBe(ann.id);
  });

  it("registers a new candidate who typed their own name, and refuses a name that exists", async () => {
    const ctx = await makeTestContext();
    await createMember(ctx, { name: "Ann" });
    const { token } = await createSession(ctx, "participant");
    const session = (await findSession(ctx, "participant", token))!;

    const created = await identify(ctx, session, { newName: "  New   Person " });
    expect(created).toMatchObject({ name: "New Person", role: "candidate", selfRegistered: true });
    expect((await listMemberRows(ctx.db)).map((m) => m.name)).toEqual(["Ann", "New Person"]);

    await expect(identify(ctx, session, { newName: "ann" })).rejects.toMatchObject({ code: "memberNameExists" });
    await expect(identify(ctx, session, { memberId: "nobody" })).rejects.toMatchObject({ status: 404 });
  });

  it("lets a person switch or clear the choice", async () => {
    const ctx = await makeTestContext();
    const ann = await createMember(ctx, { name: "Ann" });
    const bob = await createMember(ctx, { name: "Bob" });
    const { token } = await createSession(ctx, "participant");
    const session = (await findSession(ctx, "participant", token))!;
    await identify(ctx, session, { memberId: ann.id });
    await identify(ctx, session, { memberId: bob.id });
    expect((await findSession(ctx, "participant", token))?.memberId).toBe(bob.id);
    expect(await identify(ctx, session, { clear: true })).toBeNull();
    expect((await findSession(ctx, "participant", token))?.memberId).toBeNull();
    expect(await ctx.db.get("SELECT 1 AS x FROM sessions WHERE token_hash = ?", [hashToken(token)])).toBeDefined();
  });

  it("treats a session whose person was deleted as having no person", async () => {
    const ctx = await makeTestContext();
    const ann = await createMember(ctx, { name: "Ann" });
    const { token } = await createSession(ctx, "participant");
    await identify(ctx, (await findSession(ctx, "participant", token))!, { memberId: ann.id });
    await ctx.db.run("DELETE FROM members WHERE id = ?", [ann.id]);
    await expect(requireSessionMember(ctx, await findSession(ctx, "participant", token))).rejects.toMatchObject({
      code: "memberNotSelected",
    });
  });
});

describe("getParticipantHome", () => {
  it("shows the next test for the person's level, whether it is ready, and the study PDFs", async () => {
    const ctx = await makeTestContext();
    const ann = await createMember(ctx, { name: "Ann" });
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF");

    let home = await getParticipantHome(ctx, ann);
    expect(home).toMatchObject({ nextTestId: "participant", activeAttempt: null, recentAttempts: [] });
    expect(home.tests.map((t) => [t.testId, t.ready, t.material])).toEqual([
      ["participant", false, null],
      ["supervisor", false, null],
    ]);

    await withParticipantBank(ctx);
    await saveMaterial(ctx, "participant", "study.pdf", pdf);
    home = await getParticipantHome(ctx, ann);
    expect(home.tests[0]).toMatchObject({ testId: "participant", ready: true, material: { filename: "study.pdf" } });
  });

  it("points a participant to the supervisor test and a supervisor to nothing", async () => {
    const ctx = await makeTestContext();
    const participant = await createMember(ctx, { name: "P", role: "participant" });
    const supervisor = await createMember(ctx, { name: "S", role: "supervisor" });
    expect((await getParticipantHome(ctx, participant)).nextTestId).toBe("supervisor");
    expect((await getParticipantHome(ctx, supervisor)).nextTestId).toBeNull();
  });

  it("reports the unfinished attempt and the recent results", async () => {
    const ctx = await makeTestContext();
    await withParticipantBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    const view = await startAttempt(ctx, ann.id, "participant");
    expect((await getParticipantHome(ctx, ann)).activeAttempt).toEqual({ id: view.id, testId: "participant" });

    ctx.advance(60_000);
    await submitAttempt(ctx, view.id, ann.id, view.answers);
    const home = await getParticipantHome(ctx, (await listMemberRows(ctx.db))[0]!);
    expect(home.activeAttempt).toBeNull();
    expect(home.recentAttempts).toHaveLength(1);
    expect(home.recentAttempts[0]).toMatchObject({ testId: "participant", passed: false, score: 0, total: 30 });
  });

  it("does not offer to resume a test that no longer matches the person's level", async () => {
    const ctx = await makeTestContext();
    await withParticipantBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    await startAttempt(ctx, ann.id, "participant");
    // an admin certifies Ann by hand while the test is open
    const updated = await updateMember(ctx, ann.id, { role: "participant" });
    const home = await getParticipantHome(ctx, updated);
    expect(home.nextTestId).toBe("supervisor");
    expect(home.activeAttempt).toBeNull();
  });

  it("keeps only the five most recent results", async () => {
    const ctx = await makeTestContext();
    await withParticipantBank(ctx);
    const ann = await createMember(ctx, { name: "Ann" });
    for (let i = 0; i < 7; i++) {
      const view = await startAttempt(ctx, ann.id, "participant");
      ctx.advance(60_000);
      await submitAttempt(ctx, view.id, ann.id, view.answers);
    }
    expect((await getParticipantHome(ctx, ann)).recentAttempts).toHaveLength(5);
  });
});
