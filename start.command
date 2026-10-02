#!/bin/sh
# Double-click this file on macOS to start lab-safe-cert (only this computer can connect).
# If macOS refuses to open it, run once in Terminal:  chmod +x start.command
cd "$(dirname "$0")" || exit 1
./start.sh "$@"
echo
echo "The server has stopped. You can close this window. / サーバーを停止しました。このウィンドウは閉じて構いません。"
