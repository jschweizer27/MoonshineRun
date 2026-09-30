#!/bin/bash
# SessionStart hook for Claude Code on the web: installs the dev tools so
# `npm run check`, `npm run lint`, `npm run build` and `npm test` work right away.
set -euo pipefail

# Only needed in cloud sessions; local machines manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Cloud sessions ship a pre-installed Chromium (/opt/pw-browsers); never download one.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# npm install (not ci) so the cached container state is reused between sessions.
npm install --no-audit --no-fund --loglevel=error
