import { afterEach, describe, expect, it } from "vitest";
import type { AuthStatus } from "@/lib/types";
import {
  ADMIN_PASSWORD,
  ApiClient,
  type ApiEnvironment,
  PARTICIPANT_PASSWORD,
  setupApiEnvironment,
} from "./test-client";

let environment: ApiEnvironment | undefined;
afterEach(async () => {
  await environment?.cleanup();
  environment = undefined;
});

const status = async (client: ApiClient) => (await (await client.get("/api/auth/status")).json()) as AuthStatus;
const setCookie = (response: Response, name: string) =>
  response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? "";

describe("logging in and out", () => {
  it("refuses a wrong password without creating a session", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    const response = await client.loginAs("admin", "not the password");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "wrongPassword" } });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await status(client)).toMatchObject({ admin: false, participant: false });
  });

  it("logs in with the right password and reports it in the status", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    expect((await client.loginAs("admin", ADMIN_PASSWORD)).status).toBe(200);
    expect(await status(client)).toMatchObject({ admin: true, participant: false, member: null, participantPasswordSet: true });
    expect((await client.loginAs("participant", PARTICIPANT_PASSWORD)).status).toBe(200);
    expect(await status(client)).toMatchObject({ admin: true, participant: true });
  });

  it("accepts the password typed with full-width characters", async () => {
    environment = await setupApiEnvironment({ PARTICIPANT_PASSWORD: "quiz2030" });
    const client = new ApiClient();
    expect((await client.loginAs("participant", "ｑｕｉｚ２０３０")).status).toBe(200);
  });

  it("sets a session cookie that scripts cannot read and other sites cannot send", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    const participant = await client.loginAs("participant", PARTICIPANT_PASSWORD);
    const admin = await client.loginAs("admin", ADMIN_PASSWORD);
    const p = setCookie(participant, "lsc_participant");
    const a = setCookie(admin, "lsc_admin");
    for (const cookie of [p, a]) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/");
      expect(cookie).not.toContain("Secure"); // plain http on localhost / the local network
    }
    expect(p).toContain("Max-Age=86400"); // 24 hours
    expect(a).toContain("Max-Age=28800"); // 8 hours
    expect(p.split(";")[0]!.length).toBeGreaterThan("lsc_participant=".length + 40); // long random token
  });

  it("marks cookies Secure when configured, or when a trusted proxy says the request was https", async () => {
    environment = await setupApiEnvironment({ COOKIE_SECURE: "1" });
    expect(setCookie(await new ApiClient().loginAs("admin", ADMIN_PASSWORD), "lsc_admin")).toContain("Secure");
    await environment.cleanup();

    environment = await setupApiEnvironment({ TRUST_PROXY: "1" });
    const viaProxy = await new ApiClient().post(
      "/api/auth/login",
      { scope: "admin", password: ADMIN_PASSWORD },
      { headers: { "x-forwarded-proto": "https" } },
    );
    expect(setCookie(viaProxy, "lsc_admin")).toContain("Secure");
    await environment.cleanup();

    environment = await setupApiEnvironment({ TRUST_PROXY: null });
    const untrusted = await new ApiClient().post(
      "/api/auth/login",
      { scope: "admin", password: ADMIN_PASSWORD },
      { headers: { "x-forwarded-proto": "https" } },
    );
    expect(setCookie(untrusted, "lsc_admin")).not.toContain("Secure");
  });

  it("logs out: the cookie is cleared and the old token stops working", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    await client.loginAs("admin", ADMIN_PASSWORD);
    const stolen = client.cookieHeader();
    const response = await client.post("/api/auth/logout", { scope: "admin" });
    expect(response.status).toBe(200);
    expect(setCookie(response, "lsc_admin")).toContain("Max-Age=0");
    expect((await client.get("/api/admin/overview")).status).toBe(401);

    const replay = new ApiClient();
    expect((await replay.get("/api/admin/overview", { headers: { cookie: stolen } })).status).toBe(401);
  });

  it("logging out of one screen leaves the other login alone", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    await client.loginAs("admin", ADMIN_PASSWORD);
    await client.loginAs("participant", PARTICIPANT_PASSWORD);
    await client.post("/api/auth/logout", { scope: "participant" });
    expect(await status(client)).toMatchObject({ admin: true, participant: false });
  });

  it("logging in again replaces the previous session", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    await client.loginAs("admin", ADMIN_PASSWORD);
    const first = client.cookieHeader();
    await client.loginAs("admin", ADMIN_PASSWORD);
    expect(client.cookieHeader()).not.toBe(first);
    expect((await new ApiClient().get("/api/admin/overview", { headers: { cookie: first } })).status).toBe(401);
    expect((await client.get("/api/admin/overview")).status).toBe(200);
  });

  it("logout works without being logged in", async () => {
    environment = await setupApiEnvironment();
    expect((await new ApiClient().post("/api/auth/logout", { scope: "admin" })).status).toBe(200);
  });
});

describe("participants cannot log in before the admin has set a password", () => {
  it("answers 503 passwordNotSet and reports it in the status", async () => {
    environment = await setupApiEnvironment({ PARTICIPANT_PASSWORD: null });
    const client = new ApiClient();
    const response = await client.loginAs("participant", "anything at all");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "passwordNotSet" } });
    expect(await status(client)).toMatchObject({ participantPasswordSet: false });
  });
});

describe("guessing passwords", () => {
  it("locks the admin login after 10 wrong attempts, even for the right password", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    for (let i = 0; i < 10; i++) expect((await client.loginAs("admin", `guess ${i}`)).status).toBe(401);

    const locked = await client.loginAs("admin", ADMIN_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBe("300");
    expect(await locked.json()).toEqual({ error: { code: "tooManyAttempts", params: { retryAfterSec: 300 } } });
    expect(locked.headers.getSetCookie()).toEqual([]);

    // participants can still log in
    expect((await client.loginAs("participant", PARTICIPANT_PASSWORD)).status).toBe(200);
  });

  it("counts wrong attempts at the participant login separately", async () => {
    environment = await setupApiEnvironment();
    const client = new ApiClient();
    for (let i = 0; i < 40; i++) await client.loginAs("participant", `guess ${i}`);
    expect((await client.loginAs("participant", PARTICIPANT_PASSWORD)).status).toBe(429);
    expect((await client.loginAs("admin", ADMIN_PASSWORD)).status).toBe(200);
  });

  it("limits each address separately behind a trusted proxy", async () => {
    environment = await setupApiEnvironment({ TRUST_PROXY: "1" });
    const attacker = { "x-forwarded-for": "203.0.113.9" };
    const client = new ApiClient();
    for (let i = 0; i < 5; i++) {
      await client.post("/api/auth/login", { scope: "admin", password: `guess ${i}` }, { headers: attacker });
    }
    const blocked = await client.post("/api/auth/login", { scope: "admin", password: ADMIN_PASSWORD }, { headers: attacker });
    expect(blocked.status).toBe(429);
    const other = await client.post(
      "/api/auth/login",
      { scope: "admin", password: ADMIN_PASSWORD },
      { headers: { "x-forwarded-for": "198.51.100.7" } },
    );
    expect(other.status).toBe(200);
  });
});

describe("first start", () => {
  it("prints a generated admin password once, and that password works", async () => {
    environment = await setupApiEnvironment({ ADMIN_PASSWORD: null, PARTICIPANT_PASSWORD: null });
    const output = environment.consoleOutput();
    const password = /^\s+([a-z2-9]{4}(?:-[a-z2-9]{4}){2})\s*$/m.exec(output)?.[1];
    expect(password, output).toBeDefined();
    expect(output).toContain("participant password is not set yet");

    const client = new ApiClient();
    expect((await client.loginAs("admin", password as string)).status).toBe(200);
    expect((await client.loginAs("admin", "something else")).status).toBe(401);
  });

  it("lets the admin change the password: the old one stops working, the own session stays, others end", async () => {
    environment = await setupApiEnvironment({ ADMIN_PASSWORD: null });
    const password = /^\s+([a-z2-9]{4}(?:-[a-z2-9]{4}){2})\s*$/m.exec(environment.consoleOutput())?.[1] as string;
    const me = new ApiClient();
    const elsewhere = new ApiClient();
    await me.loginAs("admin", password);
    await elsewhere.loginAs("admin", password);

    const wrong = await me.post("/api/admin/settings/password", {
      kind: "admin",
      currentPassword: "not my password",
      newPassword: "a much better password",
    });
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: { code: "wrongCurrentPassword" } });

    const short = await me.post("/api/admin/settings/password", { kind: "admin", currentPassword: password, newPassword: "short" });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: { code: "invalidPassword" } });

    const ok = await me.post("/api/admin/settings/password", {
      kind: "admin",
      currentPassword: password,
      newPassword: "a much better password",
    });
    expect(ok.status).toBe(200);
    expect((await me.get("/api/admin/overview")).status).toBe(200);
    expect((await elsewhere.get("/api/admin/overview")).status).toBe(401);
    expect((await new ApiClient().loginAs("admin", password)).status).toBe(401);
    expect((await new ApiClient().loginAs("admin", "a much better password")).status).toBe(200);
  });

  it("does not let the admin change a password that is managed by an environment variable", async () => {
    environment = await setupApiEnvironment();
    const admin = new ApiClient();
    await admin.loginAs("admin", ADMIN_PASSWORD);
    const response = await admin.post("/api/admin/settings/password", {
      kind: "admin",
      currentPassword: ADMIN_PASSWORD,
      newPassword: "another password!",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "passwordManagedByEnv" } });
    expect(await (await admin.get("/api/admin/settings")).json()).toEqual({
      admin: { managedByEnv: true },
      participant: { set: true, managedByEnv: true },
    });
  });
});
