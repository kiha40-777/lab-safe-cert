// Shared helpers for the launcher scripts (plain Node.js, no dependencies).
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

const MIN_NODE = [22, 13];

/** Exit early with a friendly message when Node.js is too old (node:sqlite needs 22.13+). */
export function checkNode() {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const ok = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  if (ok) return;
  console.error(
    `\n[lab-safe-cert] Node.js ${process.versions.node} is too old.\n` +
      `  This app needs Node.js ${MIN_NODE.join(".")} or newer (the current LTS, 24, is recommended).\n` +
      `  Download it from https://nodejs.org/\n\n` +
      `  Node.js ${MIN_NODE.join(".")} 以上が必要です（LTS の 24 を推奨）。\n` +
      `  https://nodejs.org/ からインストールしてください。\n`,
  );
  process.exit(1);
}

/** Absolute path of the Next.js CLI, or exit with a hint when `npm ci` has not been run. */
export function resolveNext() {
  const require = createRequire(PROJECT_ROOT + "package.json");
  try {
    return require.resolve("next/dist/bin/next");
  } catch {
    console.error(
      "\n[lab-safe-cert] Dependencies are not installed. Run `npm ci` first.\n" +
        "  依存パッケージが未インストールです。先に `npm ci` を実行してください。\n",
    );
    process.exit(1);
  }
}

/**
 * Environment for child processes: Next.js telemetry off (no usage data is sent),
 * and the "SQLite is experimental" Node.js notice hidden (node:sqlite is used on
 * purpose; see README).
 */
export function childEnv(extra = {}) {
  const flag = "--disable-warning=ExperimentalWarning";
  const nodeOptions = [process.env.NODE_OPTIONS, flag].filter(Boolean).join(" ");
  return {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_OPTIONS: nodeOptions,
    ...extra,
  };
}

/** Run the Next.js CLI, forward stop signals and exit with its exit code. */
export function runNext(args, extraEnv = {}) {
  const child = spawn(process.execPath, [resolveNext(), ...args], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: childEnv(extraEnv),
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

/**
 * Newest modification time (ms) among the files the build depends on: the source and
 * configuration folders and the package/TypeScript/Next.js configuration files.
 * (Not the database, uploads, documentation or installed packages.)
 */
export function newestInputTime(root = PROJECT_ROOT) {
  let newest = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else newest = Math.max(newest, statSync(path).mtimeMs);
    }
  };
  for (const directory of ["src", "config"]) {
    if (existsSync(join(root, directory))) visit(join(root, directory));
  }
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json"]) {
    if (existsSync(join(root, file))) newest = Math.max(newest, statSync(join(root, file)).mtimeMs);
  }
  return newest;
}

/** True when there is no build yet, or a file it depends on is newer than it (for example after `git pull`). */
export function isBuildStale(root = PROJECT_ROOT) {
  const marker = join(root, ".next", "BUILD_ID");
  if (!existsSync(marker)) return true;
  return statSync(marker).mtimeMs < newestInputTime(root);
}

/**
 * True when the packages are not installed, or package-lock.json changed after they were
 * installed. (npm writes node_modules/.package-lock.json at the end of every install.)
 */
export function isInstallStale(root = PROJECT_ROOT) {
  if (!existsSync(join(root, "node_modules", "next"))) return true;
  const installed = join(root, "node_modules", ".package-lock.json");
  const lock = join(root, "package-lock.json");
  if (!existsSync(installed) || !existsSync(lock)) return false;
  return statSync(lock).mtimeMs > statSync(installed).mtimeMs;
}
