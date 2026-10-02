import { randomBytes, randomInt, randomUUID } from "node:crypto";

/** Source of randomness. Injected so tests can be deterministic. */
export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  uuid(): string;
  /** URL-safe random token with the given number of random bytes. */
  token(bytes?: number): string;
}

export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
  uuid: () => randomUUID(),
  token: (bytes = 32) => randomBytes(bytes).toString("base64url"),
};

/** In-place Fisher-Yates shuffle with a uniform result. */
export function shuffleInPlace<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
}
