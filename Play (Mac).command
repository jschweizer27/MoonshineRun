#!/bin/bash
# Double-click to play SHINE on a Mac. Opens the game in your browser.
# (First time only: if macOS blocks it, right-click this file -> Open -> Open.)
cd "$(dirname "$0")" || exit 1
ONLINE="https://jschweizer27.github.io/MoonshineRun/"

if command -v node >/dev/null 2>&1; then
  exec node scripts/serve.mjs --open
elif command -v python3 >/dev/null 2>&1; then
  echo "Starting SHINE at http://localhost:8080/  (close this window to stop)"
  (sleep 1 && open "http://localhost:8080/") &
  exec python3 -m http.server 8080
else
  echo "To play from this folder, install Node.js (free) from https://nodejs.org"
  echo "Opening the online version instead..."
  open "$ONLINE"
  read -r -p "Press Enter to close."
fi
