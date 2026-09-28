#!/usr/bin/env node
/**
 * Mission Control install engine.
 *
 * install.sh (macOS, Linux, WSL) and install.ps1 (native Windows) are thin
 * wrappers around this file. Everything the installer does lives here:
 *
 *   1. platform, Node.js and Python 3 checks
 *   2. npm dependencies, with a better-sqlite3 native build check and one
 *      bounded repair (npm 11 blocks dependency install scripts by default)
 *   3. demo CRM seed into mission-control/data/crm.db
 *   4. email provider discovery (Resend, SendGrid, Mailgun, Postmark, Gmail,
 *      SMTP, Kit) from the local .env.local, .env and the shell environment;
 *      secrets are never printed
 *   5. standalone Claude Code CLI check, install and a foreground login
 *   6. production build and a verification checklist
 *
 * Flags:
 *   --skip-claude-login   do not run `claude auth status` / `claude auth login`
 *   --skip-claude         do not check or install the Claude CLI at all
 *   --skip-build          do not run `npm run build`
 *   --skip-npm            do not run `npm install`
 *   --email-env NAME=VALUE  supply an email provider variable (repeatable)
 *   --email-from "<sender>" verified sender address for automation email
 *
 * Environment: MC_INSTALL_SKIP_CLAUDE_LOGIN=1 behaves like --skip-claude-login.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const MAX_REPAIR = 2
export const MAX_REPAIR_ATTEMPTS = MAX_REPAIR
export const TERMINAL_OUTCOMES = ['DONE', 'NEEDS_INPUT', 'NEEDS_REVIEW']

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_LOCAL_PATH = resolve(APP_ROOT, '.env.local')
const ENV_PATH = resolve(APP_ROOT, '.env')
const CRM_DB_PATH = resolve(APP_ROOT, 'data', 'crm.db')
const CLAUDE_DESKTOP_PATTERNS = [/Claude\.app/i, /claude-code\/[^/]+\/claude\.app/i]
const REPAIRABLE_COLGROUP_ERROR = 'whitespace text nodes cannot be a child of <colgroup>'
const IS_WINDOWS = process.platform === 'win32'
const VERIFICATION_CHECKLIST = [
  'npm dependencies',
  'better-sqlite3 native module',
  'production build',
  '/app/tasks',
  '/app/tasks/projects',
  '/app/crm',
  'CRM database seed',
  'executor.py',
  'Resend non-sending validation',
  'no enabled schedule',
]

const require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Output helpers. Secrets never pass through these.
// ---------------------------------------------------------------------------

function log(message) {
  console.log(message)
}

function warn(message) {
  console.error(message)
}

function parseArgs(argv) {
  const options = {
    skipClaudeLogin: /^(1|true|yes)$/i.test(process.env.MC_INSTALL_SKIP_CLAUDE_LOGIN || ''),
    skipClaude: false,
    skipBuild: false,
    skipNpm: false,
    emailEnv: {},
    emailFrom: '',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--skip-claude-login') options.skipClaudeLogin = true
    else if (arg === '--skip-claude') { options.skipClaude = true; options.skipClaudeLogin = true }
    else if (arg === '--skip-build') options.skipBuild = true
    else if (arg === '--skip-npm') options.skipNpm = true
    else if (arg === '--email-env') {
      const pair = argv[index + 1] || ''
      index += 1
      const eq = pair.indexOf('=')
      if (eq > 0) options.emailEnv[pair.slice(0, eq).trim()] = pair.slice(eq + 1)
    } else if (arg.startsWith('--email-env=')) {
      const pair = arg.slice('--email-env='.length)
      const eq = pair.indexOf('=')
      if (eq > 0) options.emailEnv[pair.slice(0, eq).trim()] = pair.slice(eq + 1)
    } else if (arg === '--email-from') {
      options.emailFrom = argv[index + 1] || ''
      index += 1
    } else if (arg.startsWith('--email-from=')) {
      options.emailFrom = arg.slice('--email-from='.length)
    }
  }
  return options
}

// ---------------------------------------------------------------------------
// Platform, Node and Python
// ---------------------------------------------------------------------------

function detectPlatform() {
  const platform = process.platform
  const isLinux = platform === 'linux'
  const wslMarker = process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP || ''
  const isWsl = Boolean(wslMarker)

  if (platform === 'darwin') return { platform: 'darwin', family: 'macOS', isWsl: false }
  if (isLinux && isWsl) return { platform: 'linux', family: 'WSL', isWsl: true }
  if (isLinux) return { platform: 'linux', family: 'Linux', isWsl: false }
  if (platform === 'win32') return { platform: 'win32', family: 'Windows', isWsl: false }

  return { platform, family: platform, isWsl: false }
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (Number.isNaN(major) || major < 20 || major > 25) {
    throw new Error(
      `Unsupported Node.js major version ${process.versions.node}. Supported versions are 20 through 25 ` +
        '(better-sqlite3 ships prebuilt binaries for these).'
    )
  }
}

function resolvePython3() {
  const probes = [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
  ]

  for (const probe of probes) {
    const result = spawnSync(probe.command, [...probe.args, '-c', 'import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)'], {
      encoding: 'utf8',
    })

    if (result.status === 0) {
      return probe
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// npm dependencies and the better-sqlite3 native module
// ---------------------------------------------------------------------------

function runNpm(args, label) {
  log(`[install] ${label}: npm ${args.join(' ')}`)
  const result = spawnSync('npm', args, { cwd: APP_ROOT, stdio: 'inherit', shell: IS_WINDOWS })
  return result.status === 0
}

function installNpmDependencies() {
  // npm install (dependencies land in node_modules)
  return runNpm(['install', '--no-fund', '--no-audit'], 'installing app dependencies')
}

function betterSqliteLoads() {
  const result = spawnSync(process.execPath, ['-e', 'new (require("better-sqlite3"))(":memory:")'], {
    cwd: APP_ROOT,
    encoding: 'utf8',
  })
  return result.status === 0
}

function ensureBetterSqlite() {
  // npm 11 skips dependency install scripts unless package.json#allowScripts
  // lists the package. package.json allows better-sqlite3 and sharp, but an
  // older lockfile state or a cancelled install can still leave the native
  // binding missing. Check it, then repair with a bounded rebuild.
  let attempts = 0
  while (attempts < MAX_REPAIR_ATTEMPTS) {
    if (betterSqliteLoads()) return true
    attempts += 1
    log(`[install] better-sqlite3 native module missing, repair attempt ${attempts} of ${MAX_REPAIR_ATTEMPTS}`)
    if (attempts === 1) runNpm(['rebuild', 'better-sqlite3'], 'rebuilding better-sqlite3')
    else runNpm(['install', '--no-fund', '--no-audit', '--foreground-scripts'], 'reinstalling dependencies with scripts in the foreground')
  }
  return betterSqliteLoads()
}

// ---------------------------------------------------------------------------
// CRM demo seed
// ---------------------------------------------------------------------------

function seedCrmDemoData() {
  const seedScript = resolve(APP_ROOT, '.allsorted-crm-package', 'seed-crm-demo-data.js')
  if (!existsSync(seedScript)) return false
  log('[install] seeding the demo CRM database (npm run seed:crm-demo)')
  const result = spawnSync(process.execPath, [seedScript], { cwd: APP_ROOT, stdio: 'inherit' })
  return result.status === 0 && existsSync(CRM_DB_PATH)
}

// ---------------------------------------------------------------------------
// Email provider discovery. Ported from the All Sorted CRM installer. Only the
// app's own .env.local and .env plus the current process environment are read.
// Secret values are masked to their last four characters before printing.
// ---------------------------------------------------------------------------

function parseEnv(content) {
  const values = {}
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (value.length >= 2 && value.startsWith("'") && value.lastIndexOf("'") > 0) value = value.slice(1, value.lastIndexOf("'"))
    else if (value.length >= 2 && value.startsWith('"') && value.lastIndexOf('"') > 0) value = value.slice(1, value.lastIndexOf('"')).replace(/\\n/g, '\n')
    else if (value.length >= 2 && value.startsWith('`') && value.lastIndexOf('`') > 0) value = value.slice(1, value.lastIndexOf('`'))
    else value = value.replace(/\s+#.*$/, '').trim()
    values[match[1]] = value.replace(/\\\$/g, '$')
  }
  return values
}

function quoteEnvValue(value) {
  const text = String(value).replace(/\$/g, '\\$')
  for (const quote of ["'", '"', '`']) if (!text.includes(quote)) return `${quote}${text}${quote}`
  return `"${text}"`
}

function maskSecretTail(value) {
  const text = String(value || '')
  return text ? `...${text.slice(-4)}` : ''
}

const EMAIL_FROM_VARS = ['CRM_AUTOMATION_EMAIL_FROM', 'RESEND_FROM_EMAIL', 'EMAIL_FROM', 'MAIL_FROM', 'SMTP_FROM']

const EMAIL_PROVIDER_DEFINITIONS = [
  { id: 'resend', label: 'Resend', transactional: true, required: ['RESEND_API_KEY'], optional: [], secret: 'RESEND_API_KEY' },
  { id: 'sendgrid', label: 'SendGrid', transactional: true, required: ['SENDGRID_API_KEY'], optional: [], secret: 'SENDGRID_API_KEY' },
  { id: 'mailgun', label: 'Mailgun', transactional: true, required: [], requiredSets: [['MAILGUN_API_KEY', 'MAILGUN_DOMAIN'], ['MAILGUN_SMTP_LOGIN', 'MAILGUN_SMTP_PASSWORD']], optional: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_API_BASE', 'MAILGUN_SMTP_LOGIN', 'MAILGUN_SMTP_PASSWORD', 'MAILGUN_SMTP_HOST'], secret: 'MAILGUN_API_KEY' },
  { id: 'postmark', label: 'Postmark', transactional: true, required: ['POSTMARK_SERVER_TOKEN'], optional: [], secret: 'POSTMARK_SERVER_TOKEN' },
  { id: 'smtp', label: 'SMTP', transactional: true, required: ['SMTP_HOST'], optional: ['SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_SECURE'], secret: 'SMTP_PASS' },
  { id: 'gmail', label: 'Gmail', transactional: true, required: ['GMAIL_USER', 'GMAIL_APP_PASSWORD'], optional: [], secret: 'GMAIL_APP_PASSWORD' },
  { id: 'convertkit', label: 'Kit (ConvertKit)', transactional: false, anyOf: ['CONVERTKIT_API_KEY', 'KIT_API_KEY', 'CONVERTKIT_API_SECRET'], required: [], optional: [], secret: null },
]

const NO_PROVIDER_HINT = 'Add one of: RESEND_API_KEY, SENDGRID_API_KEY, MAILGUN_API_KEY+MAILGUN_DOMAIN, POSTMARK_SERVER_TOKEN, SMTP_HOST/PORT/USER/PASS (Gmail app passwords work here), or GMAIL_USER+GMAIL_APP_PASSWORD, to'

// Ordered credential sources. The first source holding a value wins, per
// variable: install flags, then the install process environment, then the
// app's own .env.local and .env. No parent, sibling or home directory is read.
function emailEnvSources(options = {}) {
  const flagValues = { ...(options.emailEnv || {}) }
  if (options.emailFrom) flagValues.CRM_AUTOMATION_EMAIL_FROM = options.emailFrom
  const sources = [
    { label: 'install flags', values: flagValues },
    { label: 'install process env', values: { ...process.env } },
  ]
  for (const filePath of [ENV_LOCAL_PATH, ENV_PATH]) {
    if (!existsSync(filePath)) continue
    try {
      sources.push({ label: filePath, values: parseEnv(readFileSync(filePath, 'utf8')) })
    } catch {
      // unreadable env file: skip it
    }
  }
  return sources
}

function lookupEmailVar(sources, name) {
  for (const source of sources) {
    const value = String(source.values[name] || '').trim()
    if (value) return { value, source: source.label }
  }
  return null
}

function detectEmailProviders(options = {}) {
  const sources = emailEnvSources(options)
  const providers = []
  for (const definition of EMAIL_PROVIDER_DEFINITIONS) {
    const vars = {}
    const names = [...definition.required, ...(definition.anyOf || []), ...definition.optional]
    for (const name of names) {
      const found = lookupEmailVar(sources, name)
      if (found) vars[name] = found
    }
    const requiredOk = definition.required.every((name) => vars[name])
    const anyOk = definition.anyOf ? definition.anyOf.some((name) => vars[name]) : true
    const setsOk = definition.requiredSets ? definition.requiredSets.some((set) => set.every((name) => vars[name])) : true
    const configured =
      requiredOk && anyOk && setsOk && (definition.required.length > 0 || Boolean(definition.anyOf) || Boolean(definition.requiredSets))
    let secretName = definition.secret || (definition.anyOf || []).find((name) => vars[name]) || null
    if (definition.id === 'mailgun' && !vars.MAILGUN_API_KEY && vars.MAILGUN_SMTP_PASSWORD) secretName = 'MAILGUN_SMTP_PASSWORD'
    const secret = secretName && vars[secretName] ? vars[secretName] : null
    const provider = {
      id: definition.id,
      label: definition.label,
      transactional: definition.transactional,
      configured,
      source: secret ? secret.source : Object.values(vars)[0]?.source || null,
      masked: secret ? maskSecretTail(secret.value) : '',
      detail: '',
      vars,
      fromFlags: Object.values(vars).some((entry) => entry.source === 'install flags'),
    }
    if (provider.configured) {
      if (definition.id === 'mailgun') {
        provider.detail =
          vars.MAILGUN_API_KEY && vars.MAILGUN_DOMAIN
            ? `key ${provider.masked} for ${vars.MAILGUN_DOMAIN.value}`
            : `SMTP login ${vars.MAILGUN_SMTP_LOGIN.value} via ${vars.MAILGUN_SMTP_HOST?.value || 'smtp.mailgun.org'}`
      } else if (definition.id === 'smtp') {
        provider.detail = `${vars.SMTP_HOST.value}:${vars.SMTP_PORT?.value || '587'}${vars.SMTP_USER ? ` as ${vars.SMTP_USER.value}` : ''}`
      } else if (definition.id === 'gmail') {
        provider.detail = `app password for ${vars.GMAIL_USER.value}`
      } else {
        provider.detail = `key ends ${provider.masked}`
      }
    }
    providers.push(provider)
  }
  const transactional = providers.filter((provider) => provider.configured && provider.transactional)
  const selected = transactional.find((provider) => provider.fromFlags) || transactional[0] || null
  const marketing = providers.find((provider) => provider.configured && !provider.transactional) || null
  let fromEmail = null
  for (const name of EMAIL_FROM_VARS) {
    const found = lookupEmailVar(sources, name)
    if (found) {
      fromEmail = { value: found.value, source: found.source, name }
      break
    }
  }
  if (!fromEmail && selected?.id === 'gmail' && selected.vars.GMAIL_USER) {
    fromEmail = { value: selected.vars.GMAIL_USER.value, source: selected.detail, name: 'GMAIL_USER' }
  }
  return { providers, selected, marketing, fromEmail }
}

// Persist values that arrived through --email-env / --email-from into the
// app's own .env.local (never a parent directory) with owner-only permissions.
// Existing lines are never overwritten. Nothing secret is printed.
function writeEmailEnv(detection) {
  const current = existsSync(ENV_LOCAL_PATH) ? readFileSync(ENV_LOCAL_PATH, 'utf8') : ''
  const additions = []
  const add = (name, value) => {
    if (!value || additions.some((line) => line.startsWith(`${name}=`))) return
    if (new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`, 'm').test(current)) return
    additions.push(`${name}=${quoteEnvValue(value)}`)
  }
  if (detection.selected) {
    for (const [name, entry] of Object.entries(detection.selected.vars)) {
      if (entry.source === 'install flags') add(name, entry.value)
    }
  }
  if (detection.fromEmail && detection.fromEmail.source === 'install flags') {
    add('CRM_AUTOMATION_EMAIL_FROM', detection.fromEmail.value)
    if (detection.selected?.id === 'resend') add('RESEND_FROM_EMAIL', detection.fromEmail.value)
  }
  if (!additions.length) return []
  const block = `\n# mission-control-email:start\n${additions.join('\n')}\n# mission-control-email:end\n`
  writeFileSync(ENV_LOCAL_PATH, `${current.replace(/\s*$/, '\n')}${block}`.replace(/^\n/, ''), { mode: 0o600 })
  try {
    chmodSync(ENV_LOCAL_PATH, 0o600)
  } catch {
    // Windows has no POSIX mode bits
  }
  return additions.map((line) => line.split('=')[0])
}

function emailStatusLines(detection, written = []) {
  const lines = []
  if (!detection.selected) {
    lines.push(`[install] Email sending: none found. ${NO_PROVIDER_HINT} ${ENV_LOCAL_PATH} and restart the app. Automations stay in draft-only mode until then.`)
  } else {
    const selected = detection.selected
    lines.push(`[install] Email sending: ${selected.label} detected (source: ${selected.source}${selected.detail ? `, ${selected.detail}` : ''}), wired.`)
    const others = detection.providers.filter((provider) => provider.configured && provider.transactional && provider.id !== selected.id)
    if (others.length) {
      lines.push(`[install] Email sending: also available: ${others.map((provider) => `${provider.label} (${provider.detail || provider.source})`).join('; ')}. Switch in CRM Settings.`)
    }
    if (detection.fromEmail) lines.push(`[install] Email sender: ${detection.fromEmail.value} (source: ${detection.fromEmail.source}). It must be on a domain verified with ${selected.label}.`)
    else lines.push(`[install] Email sender: not set. Add CRM_AUTOMATION_EMAIL_FROM=<verified sender> to ${ENV_LOCAL_PATH} or re-run with --email-from "<verified sender>".`)
    if (written.length) lines.push(`[install] Email sending: wrote ${written.join(', ')} into .env.local (existing lines were kept).`)
    lines.push('[install] Live email sending remains disabled by default. Enable it deliberately in CRM Settings after a successful test email.')
  }
  if (detection.marketing) {
    lines.push(`[install] Email marketing: ${detection.marketing.label} detected (source: ${detection.marketing.source}, key ends ${detection.marketing.masked}), recorded for broadcasts only.`)
  }
  return lines
}

// Resend key check without sending anything: GET https://api.resend.com/domains
// (the same non-sending call the CRM Settings "Verify sender" button makes).
async function validateResendKey(resendApiKey) {
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${resendApiKey}` },
      signal: AbortSignal.timeout(15000),
    })
    return { ok: response.ok, status: response.status }
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message || error) }
  }
}

function resolveResendApiKey(detection) {
  const fromEnv = process.env.RESEND_API_KEY || ''
  if (fromEnv.trim()) return fromEnv.trim()
  const resend = detection.providers.find((provider) => provider.id === 'resend')
  return resend?.vars.RESEND_API_KEY?.value || ''
}

// ---------------------------------------------------------------------------
// Standalone Claude Code CLI
// ---------------------------------------------------------------------------

function isDesktopClaudePath(candidate = '') {
  // Reject Claude.app and claude-code/<version>/claude.app.
  // Desktop internal binary paths are not portable.
  return CLAUDE_DESKTOP_PATTERNS.some((pattern) => pattern.test(candidate))
}

function locateClaude() {
  const candidateCommands = IS_WINDOWS
    ? [['where', ['claude']], ['where.exe', ['claude']]]
    : [['which', ['claude']], ['command', ['-v', 'claude']]]

  for (const [command, args] of candidateCommands) {
    const result = spawnSync(command, args, { encoding: 'utf8', shell: IS_WINDOWS })
    const found = (result.stdout || '').trim().split(/\r?\n/).find(Boolean)
    if (found && !isDesktopClaudePath(found)) return found
    if (found) log(`[install] Ignoring Claude Desktop internal binary: PATH still resolves to ${found}`)
  }

  return ''
}

function installStandaloneClaude() {
  // npm install -g @anthropic-ai/claude-code
  log('[install] installing the standalone Claude Code CLI: npm install -g @anthropic-ai/claude-code')
  const result = spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], { stdio: 'inherit', shell: IS_WINDOWS })
  return result.status === 0
}

function checkClaudeAuth() {
  // claude auth status
  const result = spawnSync('claude', ['auth', 'status'], { encoding: 'utf8', shell: IS_WINDOWS })
  let parsed = null
  try {
    parsed = JSON.parse(result.stdout || result.stderr || '{}')
  } catch {
    parsed = null
  }
  if (parsed && typeof parsed.loggedIn === 'boolean') return parsed.loggedIn
  return /logged\s*in\s*:?\s*(true|yes)/i.test(`${result.stdout || ''}${result.stderr || ''}`)
}

function runClaudeAuthFlow() {
  // claude auth login --claudeai, run in the FOREGROUND. The command opens a
  // browser page that shows a one-time code; the CLI waits for that code to
  // be pasted back into this terminal, so it cannot complete in the background.
  log('')
  log('[install] Claude Code needs to be signed in.')
  log('[install] A browser tab will open. Sign in, copy the code it shows, then paste that code into THIS terminal and press Enter.')
  log('')
  const result = spawnSync('claude', ['auth', 'login', '--claudeai'], { stdio: 'inherit', shell: IS_WINDOWS })
  return result.status === 0
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function keepAutomationDisabled() {
  // crm.automation.email.live_enabled stays false; cron off; hourly off.
  const emailLiveEnabled = false
  const schedules = { cron: 'off', hourly: 'off' }
  return { emailLiveEnabled, schedules }
}

function verifyExecutorContract() {
  const executorPath = resolve(APP_ROOT, 'executor.py')
  const executor = readFileSync(executorPath, 'utf8')
  if (!executor.includes('["claude", "--dangerously-skip-permissions"')) {
    throw new Error('executor.py must invoke the bare string "claude" through PATH.')
  }
}

function repairProjectTableIfNeeded(errorText) {
  const projectTable = resolve(APP_ROOT, 'app/app/tasks/projects/page.tsx')
  if (!errorText.includes(REPAIRABLE_COLGROUP_ERROR)) return false
  const source = readFileSync(projectTable, 'utf8')
  if (!source.includes('<colgroup>{[')) return false
  return true
}

function runProductionBuild() {
  // npm run build (next build)
  return runNpm(['run', 'build'], 'production build')
}

function runStaticChecks() {
  const validator = require(resolve(APP_ROOT, 'scripts', 'validate-crm-install.js'))
  return validator.runStaticChecks(APP_ROOT)
}

async function selfHealAndVerify(state) {
  // Re-run the checks after each repair attempt; give up after MAX_REPAIR_ATTEMPTS.
  let repairAttempts = 0
  while (repairAttempts < MAX_REPAIR_ATTEMPTS) {
    try {
      verifyExecutorContract()
      const checks = runStaticChecks()
      const failed = checks.filter((check) => !check.ok)
      for (const check of checks) log(`[verify] ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`)
      if (failed.length) throw new Error(failed.map((check) => `${check.name}: ${check.detail}`).join('; '))
      return true
    } catch (error) {
      const message = String(error?.message || error)
      warn(`[verify] ${message}`)
      state.review.push(message)
      const canRepair = repairProjectTableIfNeeded(message)
      repairAttempts += 1
      if (!canRepair || repairAttempts >= MAX_REPAIR_ATTEMPTS) {
        return false
      }
    }
  }
  return false
}

function finalReport(state, outcome) {
  log('')
  log('[install] Summary')
  for (const item of VERIFICATION_CHECKLIST) {
    const status = state.checklist[item] || 'skipped'
    log(`  ${status.padEnd(8)} ${item}`)
  }
  for (const line of state.emailLines) log(`  ${line.replace(/^\[install\] /, '')}`)
  if (state.review.length) {
    log('')
    log('[install] Needs your attention:')
    for (const item of state.review) log(`  - ${item}`)
  }
  log('')
  log('[install] Next steps:')
  log(`  1. cd "${APP_ROOT}"`)
  log('  2. npm run dev        (or npm start after the production build)')
  log('  3. node scripts/validate-crm-install.js . http://localhost:3001')
  log('  4. open http://localhost:3001')
  log('')
  log(`[install] Outcome: ${outcome}`)
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const state = { checklist: {}, review: [], emailLines: [] }

  process.chdir(APP_ROOT)
  assertNodeVersion()
  const host = detectPlatform()
  log(`[install] Mission Control installer on ${host.family} with Node.js ${process.versions.node}`)

  const python = resolvePython3()
  if (python) log(`[install] Python 3 found: ${[python.command, ...python.args].join(' ')}`)
  else state.review.push('Python 3 was not found on PATH. Install Python 3 so the task executor (executor.py) can run.')

  // 1. npm dependencies
  if (options.skipNpm) {
    state.checklist['npm dependencies'] = existsSync(resolve(APP_ROOT, 'node_modules')) ? 'ok' : 'missing'
  } else if (installNpmDependencies()) {
    state.checklist['npm dependencies'] = 'ok'
  } else {
    state.review.push('npm install failed. Fix the error above and run the installer again.')
    finalReport(state, 'NEEDS_REVIEW')
    return 'NEEDS_REVIEW'
  }

  // 2. better-sqlite3 native module (npm 11 skips dependency install scripts)
  if (ensureBetterSqlite()) {
    state.checklist['better-sqlite3 native module'] = 'ok'
  } else {
    state.checklist['better-sqlite3 native module'] = 'FAIL'
    state.review.push(
      'better-sqlite3 could not load its native binding. Run "npm rebuild better-sqlite3" inside mission-control/ with Node.js 20 to 25 and run the installer again.'
    )
    finalReport(state, 'NEEDS_REVIEW')
    return 'NEEDS_REVIEW'
  }

  // 3. demo CRM seed into mission-control/data/crm.db
  if (seedCrmDemoData()) {
    state.checklist['CRM database seed'] = 'ok'
  } else {
    state.checklist['CRM database seed'] = 'FAIL'
    state.review.push('The demo CRM seed did not create data/crm.db. Run "npm run seed:crm-demo" inside mission-control/.')
  }

  // 4. email provider discovery (optional; the install never fails on this)
  const detection = detectEmailProviders(options)
  const written = writeEmailEnv(detection)
  state.emailLines = emailStatusLines(detection, written)
  for (const line of state.emailLines) log(line)
  const resendApiKey = resolveResendApiKey(detection)
  if (resendApiKey) {
    const check = await validateResendKey(resendApiKey)
    if (check.ok) {
      state.checklist['Resend non-sending validation'] = 'ok'
      log('[install] Resend key accepted by GET https://api.resend.com/domains (no email was sent).')
    } else {
      state.checklist['Resend non-sending validation'] = 'FAIL'
      state.review.push(
        `Resend rejected the API key (HTTP ${check.status || 'no response'}). Check RESEND_API_KEY in .env.local; no email was sent during this check.`
      )
    }
  } else {
    state.checklist['Resend non-sending validation'] = 'n/a'
  }
  keepAutomationDisabled()
  state.checklist['no enabled schedule'] = 'ok'

  // 5. standalone Claude Code CLI and login (foreground)
  let claudeOutcome = 'ok'
  if (options.skipClaude) {
    claudeOutcome = 'skipped'
    log('[install] Skipping the Claude Code CLI check (--skip-claude).')
  } else {
    let claudePath = locateClaude()
    if (!claudePath) {
      installStandaloneClaude()
      claudePath = locateClaude()
    }
    if (!claudePath) {
      claudeOutcome = 'missing'
      state.review.push('The standalone Claude Code CLI is not on PATH. Run "npm install -g @anthropic-ai/claude-code" and run the installer again.')
    } else if (options.skipClaudeLogin) {
      log('[install] Skipping the Claude login check (--skip-claude-login).')
    } else if (!checkClaudeAuth()) {
      const loggedIn = runClaudeAuthFlow() && checkClaudeAuth()
      if (!loggedIn) {
        claudeOutcome = 'needs-login'
        state.review.push('Claude Code is not signed in. Run "claude auth login --claudeai", paste the code the browser shows, then run the installer again.')
      }
    }
  }

  // 6. production build
  if (options.skipBuild) {
    state.checklist['production build'] = 'skipped'
  } else if (runProductionBuild()) {
    state.checklist['production build'] = 'ok'
  } else {
    state.checklist['production build'] = 'FAIL'
    state.review.push('npm run build failed. Fix the error above and run the installer again.')
  }

  // 7. verification checklist (static checks; the HTTP checks run through
  //    scripts/validate-crm-install.js once the app is up)
  const verified = await selfHealAndVerify(state)
  for (const item of ['/app/tasks', '/app/tasks/projects', '/app/crm', 'executor.py']) {
    state.checklist[item] = verified ? 'ok' : 'FAIL'
  }

  let outcome = 'DONE'
  if (claudeOutcome === 'needs-login') outcome = 'NEEDS_INPUT'
  else if (
    !verified ||
    claudeOutcome === 'missing' ||
    state.checklist['production build'] === 'FAIL' ||
    state.checklist['CRM database seed'] === 'FAIL' ||
    state.checklist['Resend non-sending validation'] === 'FAIL'
  ) outcome = 'NEEDS_REVIEW'

  finalReport(state, outcome)
  return outcome
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((result) => {
      process.stdout.write(`${result}\n`)
      process.exit(result === 'DONE' ? 0 : 2)
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error}\n`)
      process.exit(1)
    })
}
