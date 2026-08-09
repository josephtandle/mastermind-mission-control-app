# Mission Control

A personal, self-hosted task board that runs entirely on your own laptop. It has three views:

- **Task Board:** a kanban board for your work, with an AI column that executes cards for you using Claude Code.
- **Projects:** group and track your cards by project.
- **File Browser:** browse the files in your workspace.

Nothing is stored in the cloud. The board runs locally and the AI task executor uses your own Claude Code login.

## Install

The app lives in the `mission-control/` folder.

On macOS, Linux, or WSL:

```bash
cd mission-control
bash install.sh
npm run dev
```

On native Windows PowerShell:

```powershell
cd mission-control
powershell -ExecutionPolicy Bypass -File .\install.ps1
npm run dev
```

Then open http://localhost:3001

The platform installer installs the app dependencies and checks for a real standalone Claude Code CLI. It ignores any Claude Desktop internal binary, installs the standalone CLI when needed, and pauses if you need to authorize the device in your browser. Complete the browser step, then run the same installer again.

The task executor calls the bare `claude` command through PATH, so it keeps working after Claude Code version updates. The hourly auto-executor is off by default. The board runs on demand from the **Run Task Executor** button.

## Requirements

- Node.js 20 or newer
- Python 3
- A Claude account. The installer handles the standalone Claude Code CLI and checks its login status.
