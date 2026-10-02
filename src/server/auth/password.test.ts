import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, safeEqual, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batter", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("uses a random salt: the same password hashes differently each time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("stores no plain text and names its algorithm and parameters", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain("hunter2");
  });

  it("treats full-width and half-width characters alike (Japanese input method left on)", async () => {
    const hash = await hashPassword("abc12345");
    expect(await verifyPassword("ａｂｃ１２３４５", hash)).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "plain")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$AAAA$")).toBe(false);
  });
});

describe("generatePassword", () => {
  it("produces three groups of four easy-to-read characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{4}(-[abcdefghjkmnpqrstuvwxyz23456789]{4}){2}$/);
    }
  });

  it("does not repeat", () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(passwords.size).toBe(200);
  });
});

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
