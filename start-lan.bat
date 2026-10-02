@echo off
rem Double-click to start lab-safe-cert on Windows so that OTHER devices on the same network
rem can connect too (the address to share is printed in this window).
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
node scripts\launch.mjs --lan %*
echo.
echo The server has stopped. You can close this window.
pause
