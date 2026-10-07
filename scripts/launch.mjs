#!/usr/bin/env node
// Starts the production server; builds the app first when there is no build yet.
//
//   node scripts/launch.mjs [options]
//
//   --lan                     let other devices on the same network connect
//   --host <address>          listen on this address (a server or hosting service: 0.0.0.0; no local addresses are shown)
//   --port <n>                port to listen on (default 3000, or $PORT)
//   --data-dir <path>         where the database and uploads are stored (default ./data)
//   --rebuild                 force a fresh build before starting
//   --no-rebuild              do not rebuild automatically when the sources are newer than the build
//   --no-install              do not run `npm ci` automatically when dependencies are missing or outdated
//   --reset-admin-password    generate a new admin password and print it (use if it was lost)
//
// On every start it checks that the installed packages and the build are up to date
// (for example after `git pull`) and fixes them first, so "pull, then start" is enough.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { PROJECT_ROOT, checkNode, childEnv, isBuildStale, isInstallStale, resolveNext, runNext } from "./lib.mjs";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  const next = i >= 0 ? args[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : fallback;
};

checkNode();
process.chdir(PROJECT_ROOT);

const hostOption = value("--host", undefined);
const lan = has("--lan");
const port = value("--port", process.env.PORT ?? "3000");
const host = hostOption ?? (lan ? "0.0.0.0" : "127.0.0.1");
const extraEnv = {};
const dataDir = value("--data-dir", undefined);
if (dataDir) extraEnv.DATA_DIR = dataDir;
if (has("--reset-admin-password")) extraEnv.LSC_RESET_ADMIN_PASSWORD = "1";

const say = (english, japanese) => console.log(`\n[lab-safe-cert] ${english}\n[lab-safe-cert] ${japanese}\n`);

// Install the packages when they are missing (first start on a fresh copy) or when
// package-lock.json changed after they were installed (for example after `git pull`).
// This needs an internet connection.
if (!has("--no-install") && isInstallStale()) {
  say(
    "Installing dependencies (needs internet, can take a few minutes)...",
    "依存パッケージをインストールします（インターネット接続が必要・数分かかります）",
  );
  const install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (install.status !== 0) {
    say(
      "`npm ci` failed. Check your internet connection and try again.",
      "`npm ci` に失敗しました。インターネット接続を確認して、もう一度お試しください。",
    );
    process.exit(install.status ?? 1);
  }
}

// Build when there is no build yet, or when the sources are newer than the build.
const nextBin = resolveNext();
const hasBuild = existsSync(join(PROJECT_ROOT, ".next", "BUILD_ID"));
if (has("--rebuild") || !hasBuild || (!has("--no-rebuild") && isBuildStale())) {
  if (hasBuild) {
    say(
      "Building the app (it was changed since the last build; takes about a minute)...",
      "アプリをビルドし直します（前回のビルド以降に更新されています・1分ほどかかります）",
    );
  } else {
    say("Building the app (first start only; takes about a minute)...", "アプリをビルドします（初回のみ・1分ほどかかります）");
  }
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: childEnv(),
  });
  if (build.status !== 0) {
    say("The build failed. See the messages above.", "ビルドに失敗しました。上のメッセージを確認してください。");
    process.exit(build.status ?? 1);
  }
}

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

console.log("\n  lab-safe-cert");
console.log("  -------------");
if (hostOption) {
  // a server or a hosting service: it has its own address, so nothing about this computer is shown
  console.log(`  Listening on ${host}:${port}   (admin screen: /admin)`);
} else {
  console.log(`  This computer:  http://localhost:${port}`);
  console.log(`  Admin screen:   http://localhost:${port}/admin`);
  if (lan) {
    for (const address of lanAddresses) {
      console.log(`  Share this URL: http://${address}:${port}   (other devices on the same network)`);
    }
    console.log("  Note: this connection is not encrypted (http). Use it on a trusted network only.");
  } else {
    console.log("  Only this computer can connect. Use `npm run start:lan` to allow other devices.");
  }
}
console.log("  Stop with Ctrl+C.\n");

runNext(["start", "-H", host, "-p", port], extraEnv);
