import type { Scope } from "@/lib/types";

interface Rule {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

// Failed logins per scope, counted over ALL clients. Direct connections cannot be
// told apart reliably (the X-Forwarded-For header can be forged), so this bounds
// password guessing no matter how many addresses an attacker uses. The cost is
// that an attacker could also lock everyone out for a few minutes.
const GLOBAL_RULES: Record<Scope, Rule> = {
  admin: { maxFailures: 10, windowMs: 10 * 60_000, lockMs: 5 * 60_000 },
  participant: { maxFailures: 40, windowMs: 10 * 60_000, lockMs: 2 * 60_000 },
};

// Stricter per-address limit, only used behind a trusted reverse proxy (TRUST_PROXY=1).
const IP_RULE: Rule = { maxFailures: 5, windowMs: 10 * 60_000, lockMs: 10 * 60_000 };

const MAX_BUCKETS = 5000;

interface Bucket {
  failures: number[];
  lockedUntil: number;
}

export type LimitDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

/** In-memory login attempt limiter (resets when the server restarts). */
export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  private keys(scope: Scope, ip: string | null): { key: string; rule: Rule }[] {
    const keys = [{ key: `global:${scope}`, rule: GLOBAL_RULES[scope] }];
    if (ip) keys.push({ key: `ip:${scope}:${ip}`, rule: IP_RULE });
    return keys;
  }

  check(scope: Scope, ip: string | null): LimitDecision {
    const now = this.now();
    let retryAfterMs = 0;
    for (const { key } of this.keys(scope, ip)) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.lockedUntil > now) retryAfterMs = Math.max(retryAfterMs, bucket.lockedUntil - now);
    }
    return retryAfterMs > 0 ? { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) } : { allowed: true };
  }

  recordFailure(scope: Scope, ip: string | null): void {
    const now = this.now();
    this.prune(now);
    for (const { key, rule } of this.keys(scope, ip)) {
      const bucket = this.buckets.get(key) ?? { failures: [], lockedUntil: 0 };
      bucket.failures = bucket.failures.filter((t) => now - t < rule.windowMs);
      bucket.failures.push(now);
      if (bucket.failures.length >= rule.maxFailures) {
        bucket.lockedUntil = now + rule.lockMs;
        bucket.failures = [];
      }
      this.buckets.set(key, bucket);
    }
  }

  recordSuccess(scope: Scope, ip: string | null): void {
    if (ip) this.buckets.delete(`ip:${scope}:${ip}`);
    const global = this.buckets.get(`global:${scope}`);
    if (global) global.failures = [];
  }

  private prune(now: number): void {
    if (this.buckets.size < MAX_BUCKETS) return;
    for (const [key, bucket] of this.buckets) {
      const recent = bucket.failures.some((t) => now - t < IP_RULE.windowMs);
      if (!recent && bucket.lockedUntil <= now) this.buckets.delete(key);
    }
  }
}
