# Mission Control — Personal Kanban Task Board

A lightweight personal kanban board built with Next.js. Manage your business projects across columns with a clean dark interface. Includes an AI task executor that picks up cards from the "AI (Auto Execute)" column and runs them automatically using Claude Code.

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Python 3 (pre-installed on Mac)
- [Claude Code](https://claude.ai/code) — required for the AI Auto Execute feature

### Install and run

```bash
bash install.sh
```

This installs dependencies, schedules the hourly task executor, and starts the app.

Or manually:

```bash
npm install
npm run dev
```

Open your browser to: [http://localhost:3001](http://localhost:3001)

Press Ctrl+C to stop.

## AI Task Executor

Move any card into the **AI (Auto Execute)** column and the executor will pick it up automatically (runs every hour). You can also trigger it manually from the board UI.

When a task completes, the card moves to **Review** so you can check the output before marking it done.

To run the executor manually:

```bash
python3 executor.py
```

Or run a single card by ID:

```bash
python3 executor.py --card <card-id>
```

The executor requires `claude` to be in your PATH. Install Claude Code from [claude.ai/code](https://claude.ai/code).

## Project Structure

```
mission-control/
├── app/              # Next.js App Router pages and API routes
├── lib/
│   └── db.json       # All board data (columns, cards, projects)
├── components/       # Reusable UI components
├── executor.py       # AI task executor (runs claude CLI)
├── install.sh        # One-command setup script
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
