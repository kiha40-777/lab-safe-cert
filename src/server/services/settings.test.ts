import { describe, expect, it } from "vitest";
import { createSession, findSession, hashToken } from "../auth/sessions";
import { makeTestContext } from "../test-utils";
import {
  checkPassword,
  ensurePasswords,
  generateAndSetPassword,
  getAdminSettings,
  isPasswordSet,
  setPassword,
} from "./settings";

describe("first start", () => {
  it("generates an admin password once and stores only its hash", async () => {
    const ctx = await makeTestContext();
    const first = await ensurePasswords(ctx);
    expect(first.generatedAdminPassword).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    const stored = await ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'admin_password_hash'");
    expect(stored?.value.startsWith("scrypt$")).toBe(true);
    expect(stored?.value).not.toContain(first.generatedAdminPassword as string);

    expect(await checkPassword(ctx, "admin", first.generatedAdminPassword as string)).toBe("ok");
    expect(await checkPassword(ctx, "admin", "wrong-password")).toBe("wrong");

    const second = await ensurePasswords(ctx);
    expect(second.generatedAdminPassword).toBeNull();
    expect(await checkPassword(ctx, "admin", first.generatedAdminPassword as string)).toBe("ok");
  });

  it("does not create a participant password: participants cannot log in until the admin sets one", async () => {
    const ctx = await makeTestContext();
    await ensurePasswords(ctx);
    expect(await isPasswordSet(ctx, "participant")).toBe(false);
    expect(await checkPassword(ctx, "participant", "anything")).toBe("not-set");
  });

  it("can reset a lost admin password, which also logs the admin out everywhere", async () => {
    const ctx = await makeTestContext({ env: { LSC_RESET_ADMIN_PASSWORD: "1" } });
    const first = await ensurePasswords(ctx);
    const { token } = await createSession(ctx, "admin");
    expect(await findSession(ctx, "admin", token)).not.toBeNull();

    const second = await ensurePasswords(ctx);
    expect(second.generatedAdminPassword).not.toBe(first.generatedAdminPassword);
    expect(await checkPassword(ctx, "admin", first.generatedAdminPassword as string)).toBe("wrong");
    expect(await checkPassword(ctx, "admin", second.generatedAdminPassword as string)).toBe("ok");
    expect(await findSession(ctx, "admin", token)).toBeNull();
  });
});

describe("passwords from environment variables", () => {
  it("uses ADMIN_PASSWORD as is, cannot be changed in the app, and generates nothing", async () => {
    const ctx = await makeTestContext({ env: { ADMIN_PASSWORD: "from-the-environment" } });
    const result = await ensurePasswords(ctx);
    expect(result.generatedAdminPassword).toBeNull();
    expect(await checkPassword(ctx, "admin", "from-the-environment")).toBe("ok");
    expect(await checkPassword(ctx, "admin", "from-the-environmen")).toBe("wrong");
    await expect(setPassword(ctx, "admin", "another-password")).rejects.toMatchObject({
      status: 409,
      code: "passwordManagedByEnv",
    });
    expect(await ctx.db.all("SELECT * FROM settings")).toEqual([]);
  });

  it("reports that a reset is ignored when the password is managed by the environment", async () => {
    const ctx = await makeTestContext({ env: { ADMIN_PASSWORD: "from-the-environment", LSC_RESET_ADMIN_PASSWORD: "1" } });
    expect((await ensurePasswords(ctx)).resetIgnored).toBe(true);
  });

  it("uses PARTICIPANT_PASSWORD", async () => {
    const ctx = await makeTestContext({ env: { PARTICIPANT_PASSWORD: "team-password" } });
    expect(await isPasswordSet(ctx, "participant")).toBe(true);
    expect(await checkPassword(ctx, "participant", "team-password")).toBe("ok");
    expect(await checkPassword(ctx, "participant", "nope")).toBe("wrong");
    expect(await getAdminSettings(ctx)).toEqual({
      admin: { managedByEnv: false },
      participant: { set: true, managedByEnv: true },
    });
  });
});

describe("setPassword", () => {
  it("checks the length", async () => {
    const ctx = await makeTestContext();
    await expect(setPassword(ctx, "participant", "short")).rejects.toMatchObject({
      status: 400,
      code: "invalidPassword",
    });
    await expect(setPassword(ctx, "participant", "x".repeat(201))).rejects.toMatchObject({ code: "invalidPassword" });
    await setPassword(ctx, "participant", "long enough");
    expect(await checkPassword(ctx, "participant", "long enough")).toBe("ok");
  });

  it("logs every participant out when the participant password changes", async () => {
    const ctx = await makeTestContext();
    const a = await createSession(ctx, "participant");
    const b = await createSession(ctx, "participant");
    const admin = await createSession(ctx, "admin");
    await setPassword(ctx, "participant", "a new password");
    expect(await findSession(ctx, "participant", a.token)).toBeNull();
    expect(await findSession(ctx, "participant", b.token)).toBeNull();
    expect(await findSession(ctx, "admin", admin.token)).not.toBeNull(); // other scope untouched
  });

  it("keeps the admin's own session when the admin password changes, and ends the others", async () => {
    const ctx = await makeTestContext();
    const mine = await createSession(ctx, "admin");
    const other = await createSession(ctx, "admin");
    await setPassword(ctx, "admin", "a brand new admin password", hashToken(mine.token));
    expect(await findSession(ctx, "admin", mine.token)).not.toBeNull();
    expect(await findSession(ctx, "admin", other.token)).toBeNull();
  });

  it("generateAndSetPassword returns the new password, which then works", async () => {
    const ctx = await makeTestContext();
    const password = await generateAndSetPassword(ctx, "participant");
    expect(await checkPassword(ctx, "participant", password)).toBe("ok");
    expect(await getAdminSettings(ctx)).toMatchObject({ participant: { set: true, managedByEnv: false } });
  });
});
