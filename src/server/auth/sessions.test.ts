import { describe, expect, it } from "vitest";
import { makeTestContext } from "../test-utils";
import { createMember } from "../services/members";
import {
  SESSION_TTL_MS,
  createSession,
  destroySession,
  destroySessions,
  findSession,
  hashToken,
  setSessionMember,
} from "./sessions";

describe("sessions", () => {
  it("creates a session that is found by its token", async () => {
    const ctx = await makeTestContext();
    const { token, maxAgeSec } = await createSession(ctx, "participant");
    expect(maxAgeSec).toBe(SESSION_TTL_MS.participant / 1000);
    const session = await findSession(ctx, "participant", token);
    expect(session).toMatchObject({ scope: "participant", memberId: null });
  });

  it("stores only a hash of the token", async () => {
    const ctx = await makeTestContext();
    const { token } = await createSession(ctx, "admin");
    const rows = await ctx.db.all<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows).toEqual([{ token_hash: hashToken(token) }]);
    expect(rows[0]?.token_hash).not.toContain(token);
  });

  it("does not accept a token for the other scope, an unknown token, or no token", async () => {
    const ctx = await makeTestContext();
    const { token } = await createSession(ctx, "participant");
    expect(await findSession(ctx, "admin", token)).toBeNull();
    expect(await findSession(ctx, "participant", "not-a-token")).toBeNull();
    expect(await findSession(ctx, "participant", undefined)).toBeNull();
    expect(await findSession(ctx, "participant", "")).toBeNull();
  });

  it("expires: admin sessions after 8 hours, participant sessions after 24", async () => {
    const ctx = await makeTestContext();
    const admin = await createSession(ctx, "admin");
    const participant = await createSession(ctx, "participant");
    ctx.advance(8 * 60 * 60_000 - 1000);
    expect(await findSession(ctx, "admin", admin.token)).not.toBeNull();
    ctx.advance(2000);
    expect(await findSession(ctx, "admin", admin.token)).toBeNull();
    expect(await findSession(ctx, "participant", participant.token)).not.toBeNull();
    ctx.advance(16 * 60 * 60_000);
    expect(await findSession(ctx, "participant", participant.token)).toBeNull();
  });

  it("removes expired sessions from the table when a new one is created", async () => {
    const ctx = await makeTestContext();
    await createSession(ctx, "admin");
    ctx.advance(9 * 60 * 60_000);
    await createSession(ctx, "admin");
    expect(await ctx.db.all("SELECT token_hash FROM sessions")).toHaveLength(1);
  });

  it("can be ended", async () => {
    const ctx = await makeTestContext();
    const a = await createSession(ctx, "participant");
    const b = await createSession(ctx, "participant");
    await destroySession(ctx, a.token);
    expect(await findSession(ctx, "participant", a.token)).toBeNull();
    expect(await findSession(ctx, "participant", b.token)).not.toBeNull();
    await destroySessions(ctx, "participant");
    expect(await findSession(ctx, "participant", b.token)).toBeNull();
  });

  it("remembers which person a session acts as, and forgets it when the person is deleted", async () => {
    const ctx = await makeTestContext();
    const member = await createMember(ctx, { name: "Ann" });
    const { token } = await createSession(ctx, "participant");
    await setSessionMember(ctx, hashToken(token), member.id);
    expect((await findSession(ctx, "participant", token))?.memberId).toBe(member.id);
    await ctx.db.run("DELETE FROM members WHERE id = ?", [member.id]);
    expect((await findSession(ctx, "participant", token))?.memberId).toBeNull();
    await setSessionMember(ctx, hashToken(token), null);
    expect((await findSession(ctx, "participant", token))?.memberId).toBeNull();
  });
});
