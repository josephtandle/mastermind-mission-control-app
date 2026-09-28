# Mission Control: Personal Kanban Task Board and CRM

A lightweight personal kanban board built with Next.js, with a bundled CRM. Manage your projects across columns with a clean dark interface, keep your contacts and pipeline next to your tasks, and let an AI task executor pick up cards from the "AI (Auto Execute)" column and run them with Claude Code.

Everything runs on your own machine. The board data lives in `lib/db.json`, the CRM lives in `data/crm.db` (SQLite), and nothing is stored in the cloud.

## Quick Start

### Prerequisites

- Node.js 20 to 25 (better-sqlite3 ships prebuilt binaries for these; Node 26 is not supported yet)
- npm 9 or newer (npm 11 works; see the note on install scripts below)
- Python 3
- A Claude account for the AI Auto Execute feature

### Install and run

On macOS, Linux, or WSL:

```bash
cd mission-control
bash install.sh
```

On native Windows PowerShell:

```powershell
cd mission-control
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Both wrappers run the single install engine, `install/install.mjs`, which:

1. checks the platform, the Node.js version and finds Python 3;
2. runs `npm install`, then checks that the `better-sqlite3` native module loads and repairs it with `npm rebuild better-sqlite3` when it does not;
3. seeds the demo CRM into `mission-control/data/crm.db` (safe to re-run: existing records are never overwritten);
4. looks for an email provider in `mission-control/.env.local`, `.env` and the shell environment and prints a masked `Email sending:` summary (secrets are never printed);
5. checks for a real standalone Claude Code CLI on PATH (it ignores any Claude Desktop internal binary), installs it when missing, and runs `claude auth login --claudeai` in the foreground when you are not signed in;
6. runs the production build and a verification checklist, then prints the outcome: `DONE`, `NEEDS_INPUT` or `NEEDS_REVIEW`.

**Claude sign-in.** When the installer starts the login, a browser tab opens. Sign in, copy the code the browser shows, paste it into the same terminal and press Enter. If the sign-in did not complete, the installer reports `NEEDS_INPUT`; finish the browser step and run the same installer again.

Installer flags: `--skip-claude-login` (do not check or start the Claude sign-in), `--skip-claude` (do not touch the Claude CLI at all), `--skip-build`, `--skip-npm`, `--email-env NAME=VALUE` (repeatable) and `--email-from "<verified sender>"`.

After the installer reports success, start the app:

```bash
npm run dev
```

Or, for the production build the installer just made:

```bash
npm start
```

Open [http://localhost:3001](http://localhost:3001). Press Ctrl+C to stop.

### Validate the install

With the app running, check every page, the CRM database and the automation safety defaults:

```bash
node scripts/validate-crm-install.js . http://localhost:3001
```

It confirms that `/app/tasks`, `/app/tasks/projects`, `/app/crm`, `/app/crm/pipeline`, `/app/crm/contacts`, `/app/crm/templates`, `/app/crm/automations` and `/app/crm/settings` all return 200, that `data/crm.db` exists with sample contacts, that the CRM link is in the navigation, and that every automation channel reports `live_enabled: false`. It ends with `[validate] PASS` or `[validate] FAIL: ...`.

### npm 11 and native modules

npm 11 blocks dependency install scripts by default, which leaves `better-sqlite3` (and `sharp`) without their native binaries. `package.json` declares both under `allowScripts`, so a normal `npm install` builds them. If the CRM ever fails with "Could not locate the bindings file", run:

```bash
npm rebuild better-sqlite3
```

## CRM

The bundled CRM is All Sorted CRM 1.7.0. Open **CRM** in the sidebar, or go straight to `/app/crm/pipeline`.

- **Pipeline:** a kanban board of contacts by stage. Drag cards between stages; stages are editable per project in Settings.
- **Contacts:** the full list with filters for status, source, owner, label and project (including "all projects"), plus search and sorting.
- **Activity, Templates, Automations, Approval, Settings:** communication history, message templates, stage-change automation rules, the approval queue and channel settings.
- **Automations use live pipeline stages.** The rule editor lists the real projects and stages from your database, so a rule can only target stages that exist, and it flags rules whose stages were renamed or removed.
- **Email provider discovery.** The CRM finds the transactional email service you already use from environment variables (Resend, SendGrid, Mailgun, Postmark, Gmail app password, generic SMTP; Kit/ConvertKit is recorded for broadcasts only). The selected provider is stored under the setting `crm.automation.email.provider` and can be switched in CRM Settings.

The demo seed (`npm run seed:crm-demo`) adds a handful of sample contacts. Re-running it merges with `INSERT OR IGNORE`, so your own records are never overwritten.

### Email setup

Email credentials go in `mission-control/.env.local` (this file is git-ignored). Add one provider:

| Provider | Variables |
|----------|-----------|
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| SendGrid | `SENDGRID_API_KEY` |
| Mailgun | `MAILGUN_API_KEY` and `MAILGUN_DOMAIN` (or `MAILGUN_SMTP_LOGIN` and `MAILGUN_SMTP_PASSWORD`) |
| Postmark | `POSTMARK_SERVER_TOKEN` |
| Gmail | `GMAIL_USER` and `GMAIL_APP_PASSWORD` (an app password) |
| Any SMTP relay | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (`SMTP_SECURE=1` for port 465) |

Set the sender with `CRM_AUTOMATION_EMAIL_FROM="Name <hello@your-domain.com>"` (Resend also reads `RESEND_FROM_EMAIL`). The sender must be on a domain you have verified with that provider, or the provider rejects the message.

Restart the app after editing `.env.local`. The installer prints the same detection summary; when nothing is configured it prints `Email sending: none found` followed by the exact variables to add, and automations stay in draft-only mode.

In **CRM Settings**:

- **Verify sender (no email sent)** (Resend only) calls `GET https://api.resend.com/domains` with your key and reports whether the sender's domain is verified. Nothing is sent.
- **Send live test email via &lt;provider&gt;** sends a real email to the test recipient through the selected provider. It is a live send.
- **Email sending** stays off until you turn it on. Live sending for every channel defaults to disabled (`crm.automation.email.live_enabled` is `false`), and no cron or hourly schedule is enabled by the installer.

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

**Permissions note.** `executor.py` runs `claude --dangerously-skip-permissions` so a card can complete without interactive approval prompts. That flag lets Claude Code edit files and run commands on your machine without asking. Only put cards in the AI column that you are happy to have executed unattended, and review the output in the Review column.

The executor uses the bare `claude` command through PATH. The installer verifies the standalone CLI and its login before completing. It does not hardcode a versioned executable path.

Every executor log line carries a timestamp prefix (for example `[2026-01-01 09:00:00] No pending cards in AI column`), so when checking the log for the idle case, test that the last line ends with `No pending cards in AI column` rather than matching the whole line.

## Project Structure

```
mission-control/
├── app/                      # Next.js App Router pages and API routes
│   ├── app/tasks/            # task board and projects
│   ├── app/crm/              # CRM pages (pipeline, contacts, automations, settings, ...)
│   └── api/crm/              # CRM API routes
├── lib/
│   ├── db.json               # board data (columns, cards, projects)
│   ├── crm.js                # CRM data layer (SQLite via better-sqlite3)
│   └── crm-enrichment.js     # optional contact enrichment
├── data/crm.db               # CRM database (created by the seed; git-ignored)
├── .allsorted-crm-package/   # demo seed and sample database
├── scripts/validate-crm-install.js  # post-install checks
├── components/               # reusable UI components
├── executor.py               # AI task executor (runs claude CLI)
├── install/install.mjs       # the install engine
├── install.sh                # macOS, Linux, and WSL wrapper
├── install.ps1               # native Windows PowerShell wrapper
├── tests/                    # installer, CRM and send-safety checks
├── AGENTS.md                 # rules for AI agents working in this folder
└── package.json
```

## Customizing Your Board

Edit `lib/db.json` to set up your own columns and projects. The sample data includes 7 columns and 5 sample projects as a starting point. Cards tagged `"sample"` can be cleared from the board UI with the "Clear Sample Cards" button.

## Tests

```bash
npm test
```

Runs the installer contract suites, the CRM contract suite and `tests/resend-safety.test.mjs`, which proves the test-email path never opens a live socket (https, http, fetch, TCP and TLS are all blocked while the Resend payload is checked and an SMTP send goes to a throwaway local relay).

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- better-sqlite3 (CRM storage)
- Lucide React (icons)
- Python 3 (executor)

## License

MIT
