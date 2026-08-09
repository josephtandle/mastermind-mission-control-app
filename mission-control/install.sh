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

# Resolve the install directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The hourly task executor (cron) is OFF by default. The board runs on demand from
# the "Run Task Executor" button using your normal Claude login, so nothing runs in
# the background and there is no surprise usage. You can turn on hourly automated runs
# later by following the "Turn on the hourly executor" step in the session guide
# (automated runs draw their own metered usage, so that step sets up an API key first).

# Install and authenticate a standalone Claude Code CLI. The Desktop app's
# internal binary is not portable and must never be wired into the executor.
echo ""
echo "Checking standalone Claude Code CLI..."
CLAUDE_PATH=$(command -v claude 2>/dev/null || true)

case "$CLAUDE_PATH" in
  *Claude.app*|*claude-code/*/claude.app*)
    echo "Ignoring Claude Desktop internal binary: $CLAUDE_PATH"
    CLAUDE_PATH=""
    ;;
esac

if [ -z "$CLAUDE_PATH" ]; then
  echo "Installing standalone Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code
  CLAUDE_PATH=$(command -v claude 2>/dev/null || true)
fi

case "$CLAUDE_PATH" in
  *Claude.app*|*claude-code/*/claude.app*)
    echo "Error: PATH still resolves to a Claude Desktop internal binary: $CLAUDE_PATH"
    echo "Install the standalone CLI in a PATH location that takes precedence, then rerun."
    exit 1
    ;;
esac

if [ -z "$CLAUDE_PATH" ]; then
  echo "Error: standalone Claude Code CLI was not found on PATH after installation."
  exit 1
fi

claude --version

AUTH_STATUS=$(claude auth status 2>/dev/null || true)
LOGGED_IN=$(printf '%s' "$AUTH_STATUS" | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try { process.stdout.write(JSON.parse(input).loggedIn === true ? "true" : "false"); }
  catch { process.stdout.write("false"); }
});
')

if [ "$LOGGED_IN" != "true" ]; then
  AUTH_LOG="/tmp/claude-auth-login.log"
  nohup claude auth login --claudeai > "$AUTH_LOG" 2>&1 &
  disown 2>/dev/null || true
  sleep 2
  echo ""
  echo "A browser tab should have opened asking you to sign in to Claude and authorize this device."
  AUTHORIZE_URL=$(grep -Eo 'https://claude\.com/[^[:space:]]+' "$AUTH_LOG" | head -1 || true)
  if [ -n "$AUTHORIZE_URL" ]; then
    echo "If it did not open, use this link: $AUTHORIZE_URL"
  else
    echo "If it did not open, read the authorization link from: $AUTH_LOG"
  fi
  echo "Please complete that now, then run this installer again."
  exit 2
fi

if ! grep -Fq '["claude", "--dangerously-skip-permissions"' "$SCRIPT_DIR/executor.py"; then
  echo "Error: executor.py must invoke the bare string \"claude\" through PATH."
  exit 1
fi

echo "Standalone Claude Code CLI is installed and authenticated."
echo "executor.py uses PATH resolution and will survive CLI version updates."

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
