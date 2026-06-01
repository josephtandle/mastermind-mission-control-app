# Mission Control

A personal, self-hosted task board that runs entirely on your own laptop. It has three views:

- **Task Board** — a kanban board for your work, with an AI column that executes cards for you using Claude Code.
- **Projects** — group and track your cards by project.
- **File Browser** — browse the files in your workspace.

Nothing is stored in the cloud. The board runs locally and the AI task executor uses your own Claude Code login.

## Install

The app lives in the `mission-control/` folder.

```bash
cd mission-control
bash install.sh
npm run dev
```

Then open http://localhost:3001

`install.sh` installs dependencies and wires the task executor to your local `claude` binary. The hourly auto-executor is off by default; the board runs on demand from the **Run Task Executor** button. See the workshop guide for how to turn on hourly automated runs.

## Requirements

- Node.js 20 or newer
- Python 3 (pre-installed on macOS)
- Claude Code installed and logged in
