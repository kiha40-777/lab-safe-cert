import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/lib.mjs is plain JavaScript used by the start scripts; it is loaded by URL here.
interface Lib {
  newestInputTime(root: string): number;
  isBuildStale(root: string): boolean;
  isInstallStale(root: string): boolean;
}
const libUrl = new URL("../scripts/lib.mjs", import.meta.url).href;
const lib = (await import(/* @vite-ignore */ libUrl)) as Lib;

let root: string;

/** Creates a file with an exact modification time (seconds since 1970). */
function file(relative: string, seconds: number) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "x");
  const time = new Date(seconds * 1000);
  utimesSync(path, time, time);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lsc-launcher-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("isBuildStale (rebuild after `git pull` or a configuration change)", () => {
  it("is stale when there is no build", () => {
    file("src/app/page.tsx", 100);
    expect(lib.isBuildStale(root)).toBe(true);
  });

  it("is up to date when the build is newer than every source file", () => {
    file("src/app/page.tsx", 100);
    file("config/certification.json", 100);
    file("package.json", 100);
    file(".next/BUILD_ID", 200);
    expect(lib.isBuildStale(root)).toBe(false);
  });

  it("becomes stale when a source, the configuration or a package file changes", () => {
    for (const changed of [
      "src/lib/deep/nested/file.ts",
      "src/locales/ja.json",
      "config/certification.json",
      "package.json",
      "package-lock.json",
      "next.config.ts",
      "tsconfig.json",
    ]) {
      file("src/app/page.tsx", 100);
      file(".next/BUILD_ID", 200);
      expect(lib.isBuildStale(root), `before changing ${changed}`).toBe(false);
      file(changed, 300);
      expect(lib.isBuildStale(root), changed).toBe(true);
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
    }
  });

  it("ignores files that do not influence the build", () => {
    file("src/app/page.tsx", 100);
    file(".next/BUILD_ID", 200);
    for (const ignored of ["data/app.db", "node_modules/next/index.js", ".next/cache/x", "docs/USER_GUIDE.md", "README.md", "start.sh"]) {
      file(ignored, 900);
    }
    expect(lib.isBuildStale(root)).toBe(false);
  });

  it("reports the newest input time", () => {
    file("src/a.ts", 100);
    file("config/c.json", 700);
    file("package.json", 400);
    expect(lib.newestInputTime(root)).toBe(700_000);
  });
});

describe("isInstallStale (reinstall when the package list changed)", () => {
  it("is stale when the packages are not installed", () => {
    file("package-lock.json", 100);
    expect(lib.isInstallStale(root)).toBe(true);
  });

  it("is up to date when npm's own record of the install is newer than package-lock.json", () => {
    file("package-lock.json", 100);
    file("node_modules/next/package.json", 150);
    file("node_modules/.package-lock.json", 200);
    expect(lib.isInstallStale(root)).toBe(false);
  });

  it("is stale when package-lock.json changed after the install", () => {
    file("node_modules/next/package.json", 150);
    file("node_modules/.package-lock.json", 200);
    file("package-lock.json", 300);
    expect(lib.isInstallStale(root)).toBe(true);
  });

  it("does not guess when there is nothing to compare", () => {
    file("node_modules/next/package.json", 150);
    expect(lib.isInstallStale(root)).toBe(false); // no npm install record, no lockfile
    file("package-lock.json", 300);
    expect(lib.isInstallStale(root)).toBe(false); // lockfile but no install record
  });
});
