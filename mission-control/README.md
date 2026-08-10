# Mission Control: Personal Kanban Task Board

A lightweight personal kanban board built with Next.js. Manage your business projects across columns with a clean dark interface. Includes an AI task executor that picks up cards from the "AI (Auto Execute)" column and runs them automatically using Claude Code.

## Quick Start

### Prerequisites
- Node.js 20+
- npm 9+
- Python 3
- A Claude account for the AI Auto Execute feature

### Install and run

On macOS, Linux, or WSL:

```bash
bash install.sh
```

On native Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The platform installer is a thin wrapper around `install/install.mjs`. That engine installs the app dependencies, checks for a real standalone Claude Code CLI, and verifies the known projects-table hydration guard before it declares success. It never wires a binary from inside Claude Desktop. If the CLI is missing, the installer installs it. If Claude needs authorization, a browser tab should open. Complete that human step, then run the same installer again. If you ever see the known colgroup hydration warning, the installer will point you back to the safe table fix and rerun path.

After the installer reports success, start the app:

```bash
npm run dev
```

Or manually:

```bash
npm install
npm run dev
```

Open your browser to: [http://localhost:3001](http://localhost:3001)

Press Ctrl+C to stop.

## AI Task Executor

Move a card into the **AI (Auto Execute)** column, then trigger the executor from the board UI. The hourly executor remains off by default.

When a task completes, the card moves to **Review** so you can check the output before marking it done.

To run the executor manually:

```bash
python3 executor.py
```

Or run a single card by ID:

```bash
python3 executor.py --card <card-id>
```

On native Windows, use `python executor.py` or `py -3 executor.py`, depending on the Python command your installer reports.

The executor uses the bare `claude` command through PATH. The installer verifies the standalone CLI and its login before completing. It does not hardcode a versioned executable path.

## Project Structure

```
mission-control/
├── app/              # Next.js App Router pages and API routes
├── lib/
│   └── db.json       # All board data (columns, cards, projects)
├── components/       # Reusable UI components
├── executor.py       # AI task executor (runs claude CLI)
├── install.sh        # macOS, Linux, and WSL setup
├── install.ps1       # native Windows PowerShell setup
├── tests/            # installer and hydration regression checks
└── package.json
```

## Customizing Your Board

Edit `lib/db.json` to set up your own columns and projects. The sample data includes 7 columns and 5 business projects as a starting point. Cards tagged `"sample"` can be cleared from the board UI with the "Clear Sample Cards" button.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Lucide React (icons)
- Python 3 (executor)

## License

MIT
