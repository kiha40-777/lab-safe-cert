import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_PASSWORD,
  ApiClient,
  type ApiEnvironment,
  PARTICIPANT_PASSWORD,
  routes,
  setupApiEnvironment,
} from "./test-client";

/** The only routes that may be called without logging in. */
const PUBLIC_ROUTES = new Set(["/api/health", "/api/auth/status", "/api/auth/login", "/api/auth/logout"]);

const fill = (template: string) => template.replace(/\[[^\]]+\]/g, "x");

describe("login is required", () => {
  let environment: ApiEnvironment;
  beforeEach(async () => {
    environment = await setupApiEnvironment();
  });
  afterEach(async () => {
    await environment.cleanup();
  });

  it("finds all the API routes", () => {
    const templates = routes.map((r) => r.template);
    expect(templates.length).toBeGreaterThanOrEqual(24);
    for (const known of ["/api/health", "/api/admin/overview", "/api/participant/attempts/[id]/submit"]) {
      expect(templates).toContain(known);
    }
  });

  it("every route except the four public ones rejects a visitor who is not logged in", async () => {
    const visitor = new ApiClient();
    const problems: string[] = [];
    for (const route of routes) {
      for (const method of Object.keys(route.handlers)) {
        const path = fill(route.template);
        const options =
          method === "GET" || method === "DELETE"
            ? {}
            : path.endsWith("/material")
              ? { pdf: new Uint8Array([1]) }
              : { json: {} };
        const response = await visitor.call(method, path, options);
        const mustBeProtected = !PUBLIC_ROUTES.has(route.template);
        if (mustBeProtected && response.status !== 401) problems.push(`${method} ${route.template} -> ${response.status}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("a participant login does not open any admin route", async () => {
    const participant = new ApiClient();
    expect((await participant.loginAs("participant", PARTICIPANT_PASSWORD)).status).toBe(200);
    const problems: string[] = [];
    for (const route of routes.filter((r) => r.template.startsWith("/api/admin/"))) {
      for (const method of Object.keys(route.handlers)) {
        const path = fill(route.template);
        const options =
          method === "GET" || method === "DELETE" ? {} : path.endsWith("/material") ? { pdf: new Uint8Array([1]) } : { json: {} };
        const response = await participant.call(method, path, options);
        if (response.status !== 401) problems.push(`${method} ${route.template} -> ${response.status}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("an admin login does not act as a participant (except for viewing study PDFs)", async () => {
    const admin = new ApiClient();
    expect((await admin.loginAs("admin", ADMIN_PASSWORD)).status).toBe(200);
    const problems: string[] = [];
    for (const route of routes.filter((r) => r.template.startsWith("/api/participant/"))) {
      for (const method of Object.keys(route.handlers)) {
        const path = fill(route.template);
        const response = await admin.call(method, path, method === "GET" ? {} : { json: {} });
        const viewsPdf = route.template === "/api/participant/materials/[testId]";
        if (viewsPdf ? response.status === 401 : response.status !== 401) {
          problems.push(`${method} ${route.template} -> ${response.status}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("does not accept a made-up or empty session cookie", async () => {
    const visitor = new ApiClient();
    visitor.cookies.set("lsc_admin", "made-up-token");
    visitor.cookies.set("lsc_participant", "");
    expect((await visitor.get("/api/admin/overview")).status).toBe(401);
    expect((await visitor.get("/api/participant/members")).status).toBe(401);
    expect(await (await visitor.get("/api/auth/status")).json()).toMatchObject({ admin: false, participant: false });
  });
});

describe("requests from other sites are refused", () => {
  let environment: ApiEnvironment;
  beforeEach(async () => {
    environment = await setupApiEnvironment();
  });
  afterEach(async () => {
    await environment.cleanup();
  });

  const login = (client: ApiClient, headers: Record<string, string>) =>
    client.post("/api/auth/login", { scope: "admin", password: ADMIN_PASSWORD }, { headers });

  it("rejects a foreign Origin, an opaque Origin and cross-site fetch metadata", async () => {
    const forged: Record<string, string>[] = [
      { origin: "http://evil.example" },
      { origin: "http://localhost:3001" }, // same host name, other port
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
    ];
    for (const headers of forged) {
      const client = new ApiClient();
      const response = await login(client, headers);
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "crossSite" } });
      expect(client.cookies.size).toBe(0); // no session was created
    }
  });

  it("accepts the same origin, direct navigation and non-browser clients", async () => {
    const cases: [Record<string, string>, boolean][] = [
      [{ origin: "http://localhost:3000" }, false],
      [{ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }, false],
      [{ "sec-fetch-site": "none" }, true],
      [{}, true], // e.g. curl: no Origin header at all
    ];
    for (const [headers, noOrigin] of cases) {
      const client = new ApiClient();
      const response = await client.post(
        "/api/auth/login",
        { scope: "admin", password: ADMIN_PASSWORD },
        { headers, noOrigin },
      );
      expect(response.status, JSON.stringify(headers)).toBe(200);
    }
  });

  it("insists on JSON bodies, which a plain HTML form cannot send", async () => {
    const client = new ApiClient();
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      const response = await client.call("POST", "/api/auth/login", {
        raw: { body: JSON.stringify({ scope: "admin", password: ADMIN_PASSWORD }), contentType },
      });
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: { code: "unsupportedContentType" } });
    }
  });

  it("refuses oversized JSON bodies", async () => {
    const client = new ApiClient();
    const response = await client.call("POST", "/api/auth/login", {
      raw: { body: `{"scope":"admin","password":"${"x".repeat(3 * 1024 * 1024)}"}`, contentType: "application/json" },
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payloadTooLarge" } });
  });

  it("rejects malformed JSON and wrong field types", async () => {
    const client = new ApiClient();
    const broken = await client.call("POST", "/api/auth/login", { raw: { body: "{nope", contentType: "application/json" } });
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: { code: "badJson" } });
    const wrongType = await client.post("/api/auth/login", { scope: "root", password: 1 });
    expect(wrongType.status).toBe(400);
    expect(await wrongType.json()).toEqual({ error: { code: "invalidInput", params: { field: "scope" } } });
  });
});

describe("behind a reverse proxy", () => {
  it("compares the Origin with X-Forwarded-Host only when TRUST_PROXY is on", async () => {
    const behindProxy = { host: "app:3000", "x-forwarded-host": "quiz.example.org", origin: "https://quiz.example.org" };

    let environment = await setupApiEnvironment({ TRUST_PROXY: "1" });
    let response = await new ApiClient().post("/api/auth/login", { scope: "admin", password: ADMIN_PASSWORD }, { headers: behindProxy });
    expect(response.status).toBe(200);
    await environment.cleanup();

    environment = await setupApiEnvironment({ TRUST_PROXY: null });
    response = await new ApiClient().post("/api/auth/login", { scope: "admin", password: ADMIN_PASSWORD }, { headers: behindProxy });
    expect(response.status).toBe(403); // a forged X-Forwarded-Host must not be believed
    await environment.cleanup();
  });
});
