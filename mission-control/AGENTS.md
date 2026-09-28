# Rules for AI agents working in mission-control/

Mission Control and its bundled CRM are a local application that runs on the user's own machine. Treat them as an app, not as a skill or a tool you call on the user's behalf.

## Do

- Treat Mission Control and the CRM as a local app. Read and change data through the app's own code paths (`lib/crm.js`, the API routes under `app/api/`) or the app UI. Do not reach into `data/crm.db` with ad hoc SQL unless the user asks for that specifically.
- Show CRM records before any write. Before creating, updating, merging or deleting a contact, pipeline stage, template, rule or setting, show the user the record(s) you are about to change and what will change.
- Require human approval for any outbound message. Emails, DMs, WhatsApp, SMS and anything else that reaches a real person are sent only after the user has seen the exact copy and said to send it. Drafting is fine; sending is not, until approved.
- Keep automations, cron and live sending disabled unless the user turns them on. `crm.automation.email.live_enabled` and the other channel `live_enabled` flags stay `false`, no hourly executor or cron schedule gets enabled, and the "Send live test email" button is a real send that the user triggers, not you.
- Keep secrets out of the repository. Provider keys live in `.env.local` (git-ignored). Never print a key, paste it into chat, or write it into any tracked file.
- Run `npm test` after changing installer, CRM or send-path code, and `node scripts/validate-crm-install.js . http://localhost:3001` after an install.

## Do not

- Do not enable live sending, schedules or the hourly executor to "test" something.
- Do not send a test email without the user asking for it in this session.
- Do not run `claude auth login` on the user's behalf; tell them the command and what to paste.
- Do not add personal data, real contacts or real credentials to sample data, tests or docs.
