#!/usr/bin/env python3
"""
Mission Control Task Executor
Picks up cards from the AI (Auto Execute) column and runs them with Claude Code.

Run all pending cards:  python3 executor.py
Run one specific card:  python3 executor.py --card <card-id>
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DB_PATH = SCRIPT_DIR / "lib" / "db.json"
LOG_PATH = SCRIPT_DIR / "executor.log"
AI_COLUMN = "claude-code-todo"

# Only Claude models are offered on the board, so the executor maps each card's
# selection to a short CLI alias the `claude` binary accepts. Anything unexpected
# (legacy OpenRouter-style ids, blanks) falls back to the default.
ALLOWED_MODELS = {"sonnet", "haiku"}
DEFAULT_MODEL = "sonnet"

# Optional, gitignored. Used ONLY for automated (scheduled/cron) runs so they draw
# from a dedicated API quota. Interactive "Run Task Executor" button runs never use
# it and stay on your normal Claude login (subscription). Never export this key in
# your shell profile, or your everyday Claude sessions get billed to it too.
KEY_FILE = SCRIPT_DIR / ".executor-api-key"


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")


def load_db() -> dict:
    with open(DB_PATH) as f:
        return json.load(f)


def save_db(db: dict):
    with open(DB_PATH, "w") as f:
        json.dump(db, f, indent=2)


def update_card(card_id: str, updates: dict):
    db = load_db()
    for card in db["cards"]:
        if card["_id"] == card_id:
            card.update(updates)
            card["updatedAt"] = datetime.now().isoformat()
            break
    save_db(db)


def resolve_model(card: dict) -> str:
    """Map a card's stored model to a CLI alias the claude binary accepts."""
    raw = (card.get("model") or "").strip()
    alias = raw.split("/")[-1].lower()  # tolerate legacy ids like anthropic/claude-sonnet-4-5
    if alias in ALLOWED_MODELS:
        return alias
    if "haiku" in alias:
        return "haiku"
    if "sonnet" in alias:
        return "sonnet"
    if raw:
        log(f"Unknown model '{raw}', using default {DEFAULT_MODEL}")
    return DEFAULT_MODEL


def read_executor_key() -> str:
    """Read the optional scoped API key for automated runs, if configured."""
    try:
        if KEY_FILE.exists():
            return KEY_FILE.read_text().strip()
    except Exception:
        pass
    return ""


def run_claude(prompt: str, model: str, scheduled: bool = False) -> tuple:
    # Default: inherit the environment and use the normal Claude login (subscription).
    env = None
    auth = "Claude login (subscription)"

    if scheduled:
        # Automated run. If a scoped key is set, use it so the run draws from its own
        # API quota instead of the subscription. If not, keep working on the login.
        key = read_executor_key()
        if key:
            env = {**os.environ, "ANTHROPIC_API_KEY": key}
            auth = "executor API key (automated run)"
        else:
            auth = "Claude login (no executor key set)"

    log(f"Model: {model} | Auth: {auth}")
    try:
        result = subprocess.run(
            ["claude", "--dangerously-skip-permissions", "--model", model, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=300,
            cwd=Path.home(),
            env=env,
        )
        return result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return 1, "Timed out after 5 minutes"
    except FileNotFoundError:
        return 1, "claude not found. Make sure Claude Code is installed and in your PATH"
    except Exception as e:
        return 1, str(e)


def execute_card(card: dict, scheduled: bool = False) -> str:
    card_id = card["_id"]
    title = card.get("title", "Untitled")
    description = card.get("description", "").strip()
    model = resolve_model(card)

    log(f"Executing: {title} ({card_id})")

    prompt = f"""You are working from an automated task board. Execute the following task completely.

Task title: {title}

Task instructions:
{description}

Complete the task fully. When you are done, write either DONE or NEEDS_REVIEW on the very last line of your response:
- DONE if the task is fully complete and no human review is needed
- NEEDS_REVIEW if you finished but want a human to check the output before it is considered done"""

    # Record what we are about to send up front, so it survives a timeout or crash.
    ran_at = datetime.now().isoformat()
    update_card(card_id, {
        "executorStatus": "running",
        "executorModel": model,
        "executorPrompt": prompt,
        "executorRanAt": ran_at,
    })
    log(f"Prompt sent to claude:\n{prompt}")

    exit_code, output = run_claude(prompt, model, scheduled=scheduled)
    last_lines = output.strip().splitlines()[-5:] if output.strip() else []
    last_text = " ".join(last_lines).upper()

    if exit_code == 0:
        update_card(card_id, {"executorStatus": "completed", "column": "review", "executorLog": None})
        log(f"Moved to Review: {title}")
        return "review"
    else:
        error_snippet = output.strip()[:600] if output.strip() else "No output captured."
        log(f"Error on '{title}': {error_snippet[:300]}")
        update_card(card_id, {"executorStatus": "needs-attention", "executorLog": error_snippet})
        return "needs-attention"


def main():
    parser = argparse.ArgumentParser(description="Mission Control Task Executor")
    parser.add_argument("--card", help="Run a specific card by its ID")
    parser.add_argument(
        "--scheduled",
        action="store_true",
        help="Automated/cron run. Uses the scoped executor API key if one is set "
             "(.executor-api-key). Omit for human-triggered runs, which stay on your login.",
    )
    args = parser.parse_args()

    if not DB_PATH.exists():
        log(f"ERROR: {DB_PATH} not found. Make sure you are running from the mission-control directory.")
        sys.exit(1)

    db = load_db()

    if args.card:
        card = next((c for c in db["cards"] if c["_id"] == args.card), None)
        if not card:
            log(f"Card not found: {args.card}")
            sys.exit(1)
        execute_card(card, scheduled=args.scheduled)
        return

    # Run all pending cards in the AI Auto Execute column
    pending = [
        c for c in db["cards"]
        if c.get("column") == AI_COLUMN
        and c.get("executorStatus") not in ("running",)
        and c.get("title") != "About this column"
        and "guide" not in c.get("labels", [])
    ]

    if not pending:
        log("No pending cards in AI column")
        return

    log(f"Found {len(pending)} card(s) to execute")
    for card in pending:
        execute_card(card, scheduled=args.scheduled)
    log("Executor finished")


if __name__ == "__main__":
    main()
