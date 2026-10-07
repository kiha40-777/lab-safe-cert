import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

describe("readEnv", () => {
  it("uses the local data folder when no Turso database is set", () => {
    const env = readEnv({});
    expect(env.tursoUrl).toBeNull();
    expect(env.tursoAuthToken).toBeNull();
    expect(env.trustProxy).toBe(false);
    expect(env.cookieSecure).toBe(false);
  });

  it("reads the Turso address and token, ignoring blanks", () => {
    expect(readEnv({ TURSO_DATABASE_URL: " libsql://x-y.turso.io ", TURSO_AUTH_TOKEN: "secret" })).toMatchObject({
      tursoUrl: "libsql://x-y.turso.io",
      tursoAuthToken: "secret",
    });
    expect(readEnv({ TURSO_DATABASE_URL: "  ", TURSO_AUTH_TOKEN: "" })).toMatchObject({
      tursoUrl: null,
      tursoAuthToken: null,
    });
  });

  it("trusts the proxy and marks cookies secure on Render, unless told otherwise", () => {
    expect(readEnv({ RENDER: "true" })).toMatchObject({ trustProxy: true, cookieSecure: true });
    expect(readEnv({ RENDER: "true", TRUST_PROXY: "0", COOKIE_SECURE: "false" })).toMatchObject({
      trustProxy: false,
      cookieSecure: false,
    });
    expect(readEnv({ TRUST_PROXY: "1", COOKIE_SECURE: "yes" })).toMatchObject({ trustProxy: true, cookieSecure: true });
  });
});
