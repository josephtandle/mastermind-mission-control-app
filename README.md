# Mission Control

A personal, self-hosted task board and CRM that runs entirely on your own laptop. It has four areas:

- **Task Board:** a kanban board for your work, with an AI column that executes cards for you using Claude Code.
- **Projects:** group and track your cards by project.
- **CRM:** contacts, a pipeline board, templates, automations and an approval queue (All Sorted CRM 1.7.0), stored in a local SQLite file.
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

Then open http://localhost:3001 and run `node scripts/validate-crm-install.js . http://localhost:3001` to check every page, the CRM database and the automation safety defaults.

The platform installer installs the app dependencies, checks the `better-sqlite3` native module (and repairs it, which matters on npm 11), seeds the demo CRM into `mission-control/data/crm.db`, reports which email provider it found in `mission-control/.env.local` (keys are never printed), and checks for a real standalone Claude Code CLI. It ignores any Claude Desktop internal binary, installs the standalone CLI when needed, and runs the Claude sign-in in the foreground: a browser tab opens, you paste the code it shows back into the terminal. If the sign-in did not finish, complete the browser step, then run the same installer again.

The task executor calls the bare `claude` command through PATH with `--dangerously-skip-permissions`, so it keeps working after Claude Code version updates and completes cards without approval prompts; only put cards in the AI column that you are happy to have run unattended. The hourly auto-executor is off by default. The board runs on demand from the **Run Task Executor** button. Live email sending in the CRM is also off by default.

## Requirements

- Node.js 20 to 25
- Python 3
- A Claude account. The installer handles the standalone Claude Code CLI and checks its login status.
- Optional: an email provider (Resend, SendGrid, Mailgun, Postmark, Gmail app password or SMTP) in `mission-control/.env.local` for CRM email automations. See `mission-control/README.md` for the variables.

See `mission-control/README.md` for the full guide and `mission-control/AGENTS.md` for the rules AI agents follow when working in this repository.
