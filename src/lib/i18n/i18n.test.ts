import { describe, expect, it } from "vitest";
import raw from "../../../config/certification.json";
import { certification } from "../config";
import { localeFromCookieHeader, pickLocale } from "./detect";
import {
  type Locale,
  interpolate,
  keysOf,
  localeIds,
  lookup,
  makeTranslator,
  templateOf,
  translate,
} from "./messages";

const placeholders = (text: string | undefined) => [...(text ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("language files", () => {
  it("every language has exactly the same texts as English", () => {
    const english = keysOf("en");
    for (const id of localeIds) expect(keysOf(id), `language "${id}"`).toEqual(english);
  });

  it("every text uses the same {placeholders} in every language", () => {
    for (const key of keysOf("en")) {
      const expected = placeholders(templateOf("en", key));
      for (const id of localeIds) {
        expect(placeholders(templateOf(id, key)), `${id}: ${key}`).toEqual(expected);
      }
    }
  });

  it("has no empty texts", () => {
    for (const id of localeIds) {
      for (const key of keysOf(id)) expect(templateOf(id, key)?.trim(), `${id}: ${key}`).not.toBe("");
    }
  });

  it("has a name for every role and test defined in config/certification.json", () => {
    for (const id of localeIds) {
      for (const role of certification.roles) expect(lookup(id, `roles.${role}`), `${id}: role ${role}`).toBeDefined();
      for (const test of certification.tests) {
        expect(lookup(id, `tests.${test.id}.name`), `${id}: test ${test.id}`).toBeDefined();
      }
    }
    expect(raw.roles.length).toBeGreaterThan(0);
  });
});

describe("translation", () => {
  it("fills in placeholders and leaves unknown ones visible", () => {
    expect(translate("en", "result.promoted", { role: "Participant" })).toBe("Your role is now Participant.");
    expect(translate("ja", "result.promoted", { role: "実験参加者" })).toBe("実験参加者に昇格しました。");
    expect(interpolate("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
  });

  it("chooses singular and plural forms by `count`", () => {
    expect(translate("en", "common.questions", { count: 1 })).toBe("1 question");
    expect(translate("en", "common.questions", { count: 30 })).toBe("30 questions");
    expect(translate("en", "common.questions", { count: 0 })).toBe("0 questions");
    expect(translate("ja", "common.questions", { count: 1 })).toBe("1 問");
    expect(translate("ja", "common.questions", { count: 30 })).toBe("30 問");
  });

  it("falls back to English and then to the key", () => {
    expect(lookup("ja", "no.such.key")).toBeUndefined();
    expect(translate("en", "no.such.key" as never)).toBe("no.such.key");
  });

  it("looks up texts whose key depends on data, with a fallback", () => {
    const t = makeTranslator("en");
    expect(t.dynamic("roles", "supervisor")).toBe("Supervisor");
    expect(t.dynamic("roles", "a-role-added-later")).toBe("a-role-added-later");
    expect(t.dynamic("tests", "participant.name")).toBe("Participant Certification Test");
    expect(t.dynamic("errors", "wrongPassword")).toBe("The password is not correct.");
    expect(t.dynamic("errors", "nope", undefined, "fallback text")).toBe("fallback text");
    expect(makeTranslator("ja").dynamic("issues", "answer.isNumber", { value: 2 })).toContain("2");
  });

  it("has a message for every error code the server can send", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const codes = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
          const source = readFileSync(path, "utf8");
          for (const m of source.matchAll(/(?:ApiError\(\s*\d+,\s*|badRequest\(\s*|conflict\(\s*|notFound\(\s*|forbidden\(\s*|unauthorized\(\s*)"([A-Za-z]+)"/g)) {
            codes.add(m[1] as string);
          }
        }
      }
    };
    walk(join(process.cwd(), "src", "server"));
    walk(join(process.cwd(), "src", "app", "api"));
    expect(codes.size).toBeGreaterThan(20);
    const missing = [...codes].filter((code) => lookup("en", `errors.${code}`) === undefined);
    expect(missing).toEqual([]);
  });

  it("has a message for every question-bank issue code", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src", "server", "bank", "validate.ts"), "utf8");
    const codes = new Set([...source.matchAll(/code: "([A-Za-z.]+)"/g)].map((m) => m[1] as string));
    expect(codes.size).toBeGreaterThan(25);
    const missing = [...codes].filter((code) => lookup("en", `issues.${code}`) === undefined);
    expect(missing).toEqual([]);
  });
});

describe("choosing the language", () => {
  it("reads the language cookie", () => {
    expect(localeFromCookieHeader("a=1; lsc_lang=ja; b=2")).toBe("ja");
    expect(localeFromCookieHeader("lsc_lang=fr")).toBeNull();
    expect(localeFromCookieHeader(null)).toBeNull();
  });

  it("prefers the visitor's choice, then DEFAULT_LANG, then English (never the browser's language)", () => {
    expect(pickLocale({ cookie: "lsc_lang=ja", defaultLang: "en" })).toBe("ja");
    expect(pickLocale({ cookie: "lsc_lang=en", defaultLang: "ja" })).toBe("en");
    expect(pickLocale({ defaultLang: "ja" })).toBe("ja");
    expect(pickLocale({ defaultLang: "xx" })).toBe("en");
    expect(pickLocale({ cookie: "lsc_lang=fr" })).toBe("en");
    expect(pickLocale({})).toBe("en");
  });

  it("supports the languages it says it supports", () => {
    const ids: Locale[] = [...localeIds];
    expect(ids).toEqual(expect.arrayContaining(["en", "ja"]));
  });
});
