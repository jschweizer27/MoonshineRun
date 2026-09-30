@echo off
rem Double-click to play SHINE on Windows. Opens the game in your browser.
cd /d "%~dp0"
set ONLINE=https://jschweizer27.github.io/Shine-Demo/

where node >nul 2>nul
if %errorlevel%==0 (
  node scripts\serve.mjs --open
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo Starting SHINE at http://localhost:8080/  ^(close this window to stop^)
  start "" http://localhost:8080/
  py -m http.server 8080
  goto :eof
)

echo To play from this folder, install Node.js (free) from https://nodejs.org
echo Opening the online version instead...
start "" %ONLINE%
pause
