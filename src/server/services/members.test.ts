import { describe, expect, it } from "vitest";
import { makeTestContext } from "../test-utils";
import {
  cleanName,
  createMember,
  createMembersBulk,
  deleteMember,
  listMemberRows,
  nameKey,
  toMemberDto,
  updateMember,
} from "./members";

describe("names", () => {
  it("cleans whitespace and normalizes Unicode", () => {
    expect(cleanName("  Ann   Lee \n")).toBe("Ann Lee");
    expect(cleanName("山田　太郎")).toBe("山田 太郎"); // full-width space
    expect(cleanName("é")).toBe("é"); // composed form
  });

  it("compares names ignoring case, width and spacing", () => {
    expect(nameKey("Ann Lee")).toBe(nameKey("ann lee"));
    expect(nameKey("Ann Lee")).toBe(nameKey("AnnLee"));
    expect(nameKey("山田 太郎")).toBe(nameKey("山田太郎"));
    expect(nameKey("ＡＢＣ")).toBe(nameKey("abc")); // full-width letters
    expect(nameKey("Ann Lee")).not.toBe(nameKey("Ann Li"));
  });
});

describe("createMember", () => {
  it("creates a candidate by default and returns it in list order", async () => {
    const ctx = await makeTestContext();
    const first = await createMember(ctx, { name: "  Ann   Lee " });
    await createMember(ctx, { name: "山田 太郎", role: "supervisor" });
    expect(toMemberDto(first)).toEqual({ id: first.id, name: "Ann Lee", role: "candidate", selfRegistered: false });
    const list = await listMemberRows(ctx.db);
    expect(list.map((m) => [m.name, m.role])).toEqual([
      ["Ann Lee", "candidate"],
      ["山田 太郎", "supervisor"],
    ]);
  });

  it("remembers that a person registered themselves", async () => {
    const ctx = await makeTestContext();
    const row = await createMember(ctx, { name: "New Person", selfRegistered: true });
    expect(toMemberDto(row).selfRegistered).toBe(true);
  });

  it("refuses a name that is already taken, however it is written", async () => {
    const ctx = await makeTestContext();
    await createMember(ctx, { name: "Ann Lee" });
    for (const again of ["Ann Lee", "ann lee", "ＡＮＮ ＬＥＥ", "AnnLee"]) {
      await expect(createMember(ctx, { name: again })).rejects.toMatchObject({
        status: 409,
        code: "memberNameExists",
      });
    }
  });

  it("refuses empty, over-long and control-character names and unknown roles", async () => {
    const ctx = await makeTestContext();
    for (const name of ["", "   ", "x".repeat(81), "bad\u0007name"]) {
      await expect(createMember(ctx, { name })).rejects.toMatchObject({ status: 400, code: "invalidName" });
    }
    await expect(createMember(ctx, { name: "Ok", role: "king" })).rejects.toMatchObject({
      status: 400,
      code: "invalidRole",
    });
    expect(await listMemberRows(ctx.db)).toEqual([]);
  });

  it("accepts an 80-character name (counting characters, not bytes)", async () => {
    const ctx = await makeTestContext();
    await expect(createMember(ctx, { name: "あ".repeat(80) })).resolves.toBeDefined();
  });
});

describe("createMembersBulk", () => {
  it("adds new names and reports the ones it skipped", async () => {
    const ctx = await makeTestContext();
    await createMember(ctx, { name: "Existing Person" });
    const result = await createMembersBulk(
      ctx,
      ["Ann", "", "Bob", "existing person", "ann", "  ", "Cy\u0007", "Dee"],
      "participant",
    );
    expect(result.created.map((m) => m.name)).toEqual(["Ann", "Bob", "Dee"]);
    expect(result.created.every((m) => m.role === "participant")).toBe(true);
    expect(result.skipped).toEqual([
      { name: "existing person", reason: "exists" },
      { name: "ann", reason: "duplicate" },
      { name: "Cy\u0007", reason: "invalid" },
    ]);
    expect(await listMemberRows(ctx.db)).toHaveLength(4);
  });

  it("refuses an unknown role and absurdly long lists", async () => {
    const ctx = await makeTestContext();
    await expect(createMembersBulk(ctx, ["a"], "king")).rejects.toMatchObject({ code: "invalidRole" });
    await expect(
      createMembersBulk(ctx, Array.from({ length: 501 }, (_, i) => `n${i}`), "candidate"),
    ).rejects.toMatchObject({ code: "tooManyNames" });
  });
});

describe("updateMember", () => {
  it("renames and changes the role, and clears the self-registered mark", async () => {
    const ctx = await makeTestContext();
    const row = await createMember(ctx, { name: "Tarou Yamada", selfRegistered: true });
    const updated = await updateMember(ctx, row.id, { name: "山田 太郎", role: "participant" });
    expect(toMemberDto(updated)).toEqual({ id: row.id, name: "山田 太郎", role: "participant", selfRegistered: false });
    const stored = await listMemberRows(ctx.db);
    expect(stored[0]?.name).toBe("山田 太郎");
  });

  it("allows keeping the own name (only the role changes)", async () => {
    const ctx = await makeTestContext();
    const row = await createMember(ctx, { name: "Ann" });
    const updated = await updateMember(ctx, row.id, { name: "Ann", role: "supervisor" });
    expect(updated.role).toBe("supervisor");
  });

  it("refuses to take another person's name", async () => {
    const ctx = await makeTestContext();
    await createMember(ctx, { name: "Ann" });
    const bob = await createMember(ctx, { name: "Bob" });
    await expect(updateMember(ctx, bob.id, { name: "ann" })).rejects.toMatchObject({ code: "memberNameExists" });
  });

  it("reports an unknown person and an unknown role", async () => {
    const ctx = await makeTestContext();
    await expect(updateMember(ctx, "missing", { role: "candidate" })).rejects.toMatchObject({
      status: 404,
      code: "memberNotFound",
    });
    const row = await createMember(ctx, { name: "Ann" });
    await expect(updateMember(ctx, row.id, { role: "king" })).rejects.toMatchObject({ code: "invalidRole" });
  });
});

describe("deleteMember", () => {
  it("removes the person and their attempts", async () => {
    const ctx = await makeTestContext();
    const row = await createMember(ctx, { name: "Ann" });
    await ctx.db.run(
      `INSERT INTO attempts (id, member_id, test_id, status, questions_json, answers_json, total, started_at)
       VALUES ('a1', ?, 'participant', 'in_progress', '[]', '[]', 0, '2030-01-01T00:00:00.000Z')`,
      [row.id],
    );
    await deleteMember(ctx, row.id);
    expect(await listMemberRows(ctx.db)).toEqual([]);
    expect(await ctx.db.all("SELECT id FROM attempts")).toEqual([]);
  });

  it("reports an unknown person", async () => {
    const ctx = await makeTestContext();
    await expect(deleteMember(ctx, "missing")).rejects.toMatchObject({ status: 404 });
  });
});
