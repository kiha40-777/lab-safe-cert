@echo off
rem Double-click to start lab-safe-cert on Windows (only this computer can connect).
rem The first start installs the dependencies and builds the app (needs internet, takes a few minutes).
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
node scripts\launch.mjs %*
echo.
echo The server has stopped. You can close this window.
pause
