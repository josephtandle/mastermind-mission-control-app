#!/bin/bash
set -e

echo "Installing Mission Control..."
echo ""

if ! command -v node &> /dev/null; then
  echo "Error: Node.js is required. Install it from https://nodejs.org"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "Error: npm is required."
  exit 1
fi

if ! command -v python3 &> /dev/null; then
  echo "Error: Python 3 is required. It comes pre-installed on Mac."
  exit 1
fi

echo "Installing dependencies..."
npm install --no-audit --no-fund

# Resolve the install directory (used below to wire the Claude path).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The hourly task executor (cron) is OFF by default. The board runs on demand from
# the "Run Task Executor" button using your normal Claude login, so nothing runs in
# the background and there is no surprise usage. You can turn on hourly automated runs
# later by following the "Turn on the hourly executor" step in the session guide
# (automated runs draw their own metered usage, so that step sets up an API key first).

# Wire up the Claude binary path in executor.py
echo ""
echo "Wiring up Claude Code path..."
CLAUDE_PATH=$(command -v claude 2>/dev/null || true)

if [ -z "$CLAUDE_PATH" ]; then
  # Common install locations on Mac and Windows Git Bash
  for CANDIDATE in \
    "$HOME/.local/bin/claude" \
    "/usr/local/bin/claude" \
    "$HOME/AppData/Roaming/npm/claude" \
    "$HOME/AppData/Local/Programs/claude/claude.exe"; do
    if [ -x "$CANDIDATE" ]; then
      CLAUDE_PATH="$CANDIDATE"
      break
    fi
  done
fi

if [ -n "$CLAUDE_PATH" ]; then
  # Replace bare "claude" string in the subprocess.run call with the full path
  sed -i.bak "s|\"claude\", \"--dangerously-skip-permissions\"|\"$CLAUDE_PATH\", \"--dangerously-skip-permissions\"|g" "$SCRIPT_DIR/executor.py"
  rm -f "$SCRIPT_DIR/executor.py.bak"
  echo "Claude found at: $CLAUDE_PATH"
else
  echo "Warning: claude not found in PATH. Open executor.py and set the path manually after install."
fi

echo ""
echo "Install complete."
echo ""
echo "Start the board with:"
echo "  npm run dev"
echo ""
echo "Then open your browser to: http://localhost:3001"
echo ""
echo "The hourly auto-executor is OFF by default. The board works on demand from the"
echo "Run Task Executor button using your normal Claude login. See the session guide to"
echo "turn on hourly runs later."
