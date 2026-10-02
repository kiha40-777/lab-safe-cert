#!/bin/sh
# Double-click this file on macOS to start lab-safe-cert so that OTHER devices on the same
# network can connect too (the address to share is printed in this window).
# If macOS refuses to open it, run once in Terminal:  chmod +x start-lan.command
cd "$(dirname "$0")" || exit 1
./start.sh --lan "$@"
echo
echo "The server has stopped. You can close this window. / サーバーを停止しました。このウィンドウは閉じて構いません。"
