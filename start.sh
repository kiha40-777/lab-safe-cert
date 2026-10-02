#!/bin/sh
# Starts lab-safe-cert on macOS / Linux.
#   ./start.sh            only this computer can connect
#   ./start.sh --lan      other devices on the same network can connect too
# The first start installs the dependencies and builds the app (needs internet, takes a few minutes).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org/ and try again."
  echo "Node.js が見つかりません。https://nodejs.org/ から LTS 版をインストールしてからやり直してください。"
  exit 1
fi

exec node scripts/launch.mjs "$@"
