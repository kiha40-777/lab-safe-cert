import { describe, expect, it } from "vitest";
import { LoginRateLimiter } from "./rate-limit";

function setup() {
  let now = 1_000_000;
  const limiter = new LoginRateLimiter(() => now);
  return { limiter, advance: (ms: number) => (now += ms) };
}

const MINUTE = 60_000;

describe("LoginRateLimiter (all clients together)", () => {
  it("allows a few mistakes", () => {
    const { limiter } = setup();
    for (let i = 0; i < 9; i++) limiter.recordFailure("admin", null);
    expect(limiter.check("admin", null)).toEqual({ allowed: true });
  });

  it("locks the admin login after 10 failures and tells how long to wait", () => {
    const { limiter } = setup();
    for (let i = 0; i < 10; i++) limiter.recordFailure("admin", null);
    expect(limiter.check("admin", null)).toEqual({ allowed: false, retryAfterSec: 300 });
  });

  it("unlocks after the lock time", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 10; i++) limiter.recordFailure("admin", null);
    advance(4 * MINUTE);
    expect(limiter.check("admin", null).allowed).toBe(false);
    advance(MINUTE + 1);
    expect(limiter.check("admin", null)).toEqual({ allowed: true });
  });

  it("forgets old failures", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 9; i++) limiter.recordFailure("admin", null);
    advance(11 * MINUTE);
    limiter.recordFailure("admin", null); // the 9 earlier ones are outside the 10-minute window
    expect(limiter.check("admin", null)).toEqual({ allowed: true });
  });

  it("is generous for the shared participant password", () => {
    const { limiter } = setup();
    for (let i = 0; i < 39; i++) limiter.recordFailure("participant", null);
    expect(limiter.check("participant", null).allowed).toBe(true);
    limiter.recordFailure("participant", null);
    expect(limiter.check("participant", null)).toEqual({ allowed: false, retryAfterSec: 120 });
  });

  it("keeps the two logins separate", () => {
    const { limiter } = setup();
    for (let i = 0; i < 10; i++) limiter.recordFailure("admin", null);
    expect(limiter.check("participant", null).allowed).toBe(true);
  });

  it("a successful login clears the failure count", () => {
    const { limiter } = setup();
    for (let i = 0; i < 9; i++) limiter.recordFailure("admin", null);
    limiter.recordSuccess("admin", null);
    limiter.recordFailure("admin", null);
    expect(limiter.check("admin", null)).toEqual({ allowed: true });
  });
});

describe("LoginRateLimiter (per address, behind a trusted proxy)", () => {
  it("locks one address after 5 failures without affecting others", () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure("admin", "203.0.113.5");
    expect(limiter.check("admin", "203.0.113.5")).toEqual({ allowed: false, retryAfterSec: 600 });
    expect(limiter.check("admin", "203.0.113.6")).toEqual({ allowed: true });
  });

  it("a success clears that address", () => {
    const { limiter } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure("admin", "203.0.113.5");
    limiter.recordSuccess("admin", "203.0.113.5");
    limiter.recordFailure("admin", "203.0.113.5");
    expect(limiter.check("admin", "203.0.113.5")).toEqual({ allowed: true });
  });
});
