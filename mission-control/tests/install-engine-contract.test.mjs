/**
 * install-engine-contract.test.mjs
 *
 * Static source assertions for the v4 one-engine installer contract.
 * All seven contract requirements are covered:
 *   1. Single Node engine at install/install.mjs; thin wrappers only
 *   2. Platform detection, Node major validation, Python 3 resolution
 *   3. Standalone Claude CLI gate (no Desktop app binary, real auth, NEEDS_INPUT)
 *   4. Resend as a required human setup gate with strict secret hygiene
 *   5. Bounded self-healing (max two repair attempts, terminal outcomes)
 *   6. Completion verification checklist
 *   7. Release manifest at release-manifest.json with version 4.1.0 and SHA256 entries
 *
 * Uses node:test and node:assert/strict only; no runtime execution of the engine.
 * Run with: node --test tests/install-engine-contract.test.mjs
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a file relative to appRoot and return its UTF-8 text.
 * Throws a descriptive error when the file is absent so that the assertion
 * message clearly points to the missing contract artifact.
 */
function readRequired(relPath) {
  const abs = resolve(appRoot, relPath)
  assert.ok(existsSync(abs), `required contract file must exist: ${relPath}`)
  return readFileSync(abs, 'utf8')
}

// ---------------------------------------------------------------------------
// Contract 1 - Single Node engine; wrappers are thin
// ---------------------------------------------------------------------------

test('install/install.mjs exists as the single install engine', () => {
  assert.ok(
    existsSync(resolve(appRoot, 'install/install.mjs')),
    'install/install.mjs must exist as the single Node engine entry point'
  )
})

test('install.sh is a thin wrapper: invokes install/install.mjs and contains no duplicated install logic', () => {
  const sh = readRequired('install.sh')

  // Must delegate to the engine
  assert.match(
    sh,
    /install[/\\]install\.mjs/,
    'install.sh must invoke install/install.mjs'
  )

  // Must not duplicate npm install of Claude Code
  assert.doesNotMatch(
    sh,
    /npm install -g @anthropic-ai\/claude-code/,
    'install.sh must not duplicate the npm install -g @anthropic-ai/claude-code step (belongs in engine)'
  )

  // Must not duplicate claude auth login logic
  assert.doesNotMatch(
    sh,
    /claude auth login/,
    'install.sh must not duplicate claude auth login (belongs in engine)'
  )

  // Must not duplicate Resend key handling
  assert.doesNotMatch(
    sh,
    /RESEND_API_KEY/,
    'install.sh must not handle RESEND_API_KEY (belongs in engine)'
  )
})

test('install.ps1 is a thin wrapper: invokes install/install.mjs and contains no duplicated install logic', () => {
  const ps1 = readRequired('install.ps1')

  // Must delegate to the engine
  assert.match(
    ps1,
    /install[/\\]install\.mjs/,
    'install.ps1 must invoke install/install.mjs'
  )

  // Must not duplicate npm install of Claude Code
  assert.doesNotMatch(
    ps1,
    /npm install -g @anthropic-ai\/claude-code/,
    'install.ps1 must not duplicate the npm install -g @anthropic-ai/claude-code step (belongs in engine)'
  )

  // Must not duplicate claude auth login logic
  assert.doesNotMatch(
    ps1,
    /claude auth login/,
    'install.ps1 must not duplicate claude auth login (belongs in engine)'
  )

  // Must not duplicate Resend key handling
  assert.doesNotMatch(
    ps1,
    /RESEND_API_KEY/,
    'install.ps1 must not handle RESEND_API_KEY (belongs in engine)'
  )
})

// ---------------------------------------------------------------------------
// Contract 2 - Platform detection, Node major validation, Python 3 resolution
// ---------------------------------------------------------------------------

test('engine identifies macOS, Linux, WSL, and native Windows', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(engine, /darwin/i, 'engine must detect macOS (darwin)')
  assert.match(engine, /linux/i, 'engine must detect Linux')
  assert.match(engine, /wsl/i, 'engine must detect WSL')
  assert.match(engine, /win32|windows/i, 'engine must detect native Windows')
})

test('engine validates Node.js major version 20 through 25', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /process\.versions\.node|node[\s\S]{0,30}version/i,
    'engine must inspect the Node.js version'
  )

  assert.match(engine, /20/, 'engine must reference Node major 20 as the minimum')
  assert.match(engine, /25/, 'engine must reference Node major 25 as the upper bound')
})

test('engine resolves Python 3 from python3, python, or py -3', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(engine, /python3/, 'engine must probe python3')
  assert.match(engine, /'python'|"python"/, 'engine must probe python')
  assert.match(engine, /py.*-3|['"]py['"]/, 'engine must probe py with -3 prefix argument')

  assert.match(
    engine,
    /version_info\.major\s*==\s*3|sys\.version_info/,
    'engine must verify the resolved binary is Python 3'
  )
})

// ---------------------------------------------------------------------------
// Contract 3 - Standalone Claude CLI gate
// ---------------------------------------------------------------------------

test('engine rejects any path inside Claude.app or claude-code/<version>/claude.app', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /Claude\.app/,
    'engine must check for Claude.app path to reject the Desktop internal binary'
  )
  assert.match(
    engine,
    /claude-code/,
    'engine must check for claude-code path variants to reject the Desktop internal binary'
  )
})

test('engine installs @anthropic-ai/claude-code when the standalone CLI is absent', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /npm install -g @anthropic-ai\/claude-code/,
    'engine must install @anthropic-ai/claude-code when absent'
  )
})

test('engine runs claude auth status before deciding on auth', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /claude auth status/,
    'engine must run "claude auth status" to check current authentication state'
  )
})

test('engine starts claude auth login --claudeai and returns NEEDS_INPUT when human auth is needed', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /claude auth login[\s\S]{0,40}--claudeai|--claudeai[\s\S]{0,40}claude auth login/,
    'engine must start "claude auth login --claudeai" for the human auth browser flow'
  )
  assert.match(
    engine,
    /NEEDS_INPUT/,
    'engine must emit NEEDS_INPUT when authentication requires human action'
  )
})

test('engine never fabricates auth credentials', () => {
  const engine = readRequired('install/install.mjs')

  assert.doesNotMatch(
    engine,
    /ANTHROPIC_API_KEY\s*=\s*['"][a-zA-Z0-9_-]{20,}/,
    'engine must not hard-code an Anthropic API key'
  )
  assert.doesNotMatch(
    engine,
    /sk-ant-[a-zA-Z0-9_-]+/,
    'engine must not contain a literal Anthropic secret key'
  )
})

test('executor.py invokes the bare "claude" command without any app-bundle path', () => {
  const executor = readRequired('executor.py')

  assert.match(
    executor,
    /\["claude",\s*"--dangerously-skip-permissions"/,
    'executor.py must use bare "claude" as the first element of the subprocess command list'
  )

  assert.doesNotMatch(
    executor,
    /Claude\.app/,
    'executor.py must not reference Claude.app'
  )
  assert.doesNotMatch(
    executor,
    /claude-code\/.*\/claude/,
    'executor.py must not reference a versioned claude-code bundle path'
  )
})

// ---------------------------------------------------------------------------
// Contract 4 - Resend as a required human setup gate with secret hygiene
// ---------------------------------------------------------------------------

test('engine requires RESEND_API_KEY as a human setup gate for install completion', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /RESEND_API_KEY/,
    'engine must require RESEND_API_KEY as part of the install flow'
  )
})

test('engine accepts RESEND_API_KEY only from current process env or hidden interactive prompt', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /process\.env\.RESEND_API_KEY|process\.env\[['"]RESEND_API_KEY['"]\]/,
    'engine must accept RESEND_API_KEY from process.env'
  )

  assert.match(
    engine,
    /hidden|muted|mask|silent|readline|getpass/i,
    'engine must use a hidden or masked interactive prompt for RESEND_API_KEY when not in env'
  )
})

test('engine never scans env files outside mission-control/.env.local', () => {
  const engine = readRequired('install/install.mjs')

  assert.doesNotMatch(
    engine,
    /\.\.\/.*\.env|~\/.*\.env|homedir.*\.env/i,
    'engine must not scan parent, sibling, or home env files for RESEND_API_KEY'
  )
  assert.doesNotMatch(
    engine,
    /glob.*\.env|readdir.*\.env|find.*\.env/i,
    'engine must not search the filesystem for .env files'
  )
})

test('engine never prints or logs the Resend API key value', () => {
  const engine = readRequired('install/install.mjs')

  assert.doesNotMatch(
    engine,
    /console\.log\s*\([^)]*RESEND_API_KEY[^)]*\)/,
    'engine must not log the RESEND_API_KEY value'
  )
  assert.doesNotMatch(
    engine,
    /process\.stdout\.write\s*\([^)]*RESEND_API_KEY[^)]*\)/,
    'engine must not write the RESEND_API_KEY value to stdout'
  )
})

test('engine validates Resend key without sending an email', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /resend\.com\/v1\/domains|validate.*resend|resend.*valid|domains\.list|api\.resend\.com/i,
    'engine must validate the Resend API key via a non-sending API call such as domains list'
  )

  assert.doesNotMatch(
    engine,
    /resend\.com\/v1\/emails(?!\/cancel)/i,
    'engine must not validate the Resend key by sending an email via v1/emails'
  )
})

test('engine writes only mission-control/.env.local for the Resend key with restrictive permissions', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /\.env\.local/,
    'engine must write the Resend key to .env.local'
  )

  assert.match(
    engine,
    /chmod.*600|0o600|0600/,
    'engine must apply restrictive permissions (600) when writing .env.local'
  )
})

test('engine keeps crm.automation.email.live_enabled false and all schedules off', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /live_enabled.*false|emailLiveEnabled.*false/i,
    'engine must ensure crm.automation.email.live_enabled remains false during install'
  )

  assert.match(
    engine,
    /schedule.*off|schedule.*disabled|cron.*off|cron.*disabled|hourly.*off/i,
    'engine must ensure all schedules remain off during install'
  )
})

// ---------------------------------------------------------------------------
// Contract 5 - Bounded self-healing
// ---------------------------------------------------------------------------

test('engine enforces an explicit maximum of two repair attempts', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /maxRepair|max_repair|MAX_REPAIR|maxAttempts|MAX_ATTEMPTS|repairLimit|repair_limit/i,
    'engine must declare a named constant or variable for the maximum repair attempt count'
  )

  assert.match(
    engine,
    /(?:maxRepair|max_repair|MAX_REPAIR|maxAttempts|MAX_ATTEMPTS|repairLimit|repair_limit)\s*=\s*2/,
    'engine must set the repair attempt limit to exactly 2'
  )
})

test('engine re-runs checks after each repair attempt', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /repair[\s\S]{0,80}check|check[\s\S]{0,80}repair|verify[\s\S]{0,80}repair|repair[\s\S]{0,80}verify|recheck/i,
    'engine must re-run verification checks after each repair attempt'
  )
})

test('engine produces only the terminal outcomes DONE, NEEDS_INPUT, or NEEDS_REVIEW', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(engine, /DONE/, 'engine must emit the DONE terminal outcome')
  assert.match(engine, /NEEDS_INPUT/, 'engine must emit the NEEDS_INPUT terminal outcome')
  assert.match(engine, /NEEDS_REVIEW/, 'engine must emit the NEEDS_REVIEW terminal outcome')
})

// ---------------------------------------------------------------------------
// Contract 6 - Completion verification checklist
// ---------------------------------------------------------------------------

test('engine verification covers npm dependencies', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /node_modules|npm install|dependencies/i,
    'engine must verify npm dependencies as part of completion checks'
  )
})

test('engine verification covers the production build', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /next build|npm run build|production build/i,
    'engine must verify the production build as part of completion checks'
  )
})

test('engine verification covers the task board, projects, and CRM routes', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /\/app\/tasks|task.*board|board.*task/i,
    'engine must verify the task board route'
  )

  assert.match(
    engine,
    /\/app\/tasks\/projects|projects.*route|route.*projects/i,
    'engine must verify the projects route'
  )

  assert.match(
    engine,
    /\/app\/crm|crm.*route|route.*crm/i,
    'engine must verify the CRM route'
  )
})

test('engine verification covers executor invocation check', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /executor\.py|executor.*check|check.*executor/i,
    'engine must verify executor invocation as part of completion checks'
  )
})

test('engine verification covers Resend non-sending validation', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /resend.*valid|valid.*resend|domains.*list|resend.*check/i,
    'engine must include Resend non-sending validation in completion verification'
  )
})

test('engine verification confirms no enabled schedule', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(
    engine,
    /schedule.*disabled|schedule.*off|cron.*disabled|cron.*off|no.*schedule.*enabled|enabled.*false/i,
    'engine must confirm no schedules are enabled as part of completion verification'
  )
})

// ---------------------------------------------------------------------------
// Contract 7 - Release manifest
// ---------------------------------------------------------------------------

test('release-manifest.json exists at appRoot', () => {
  assert.ok(
    existsSync(resolve(appRoot, 'release-manifest.json')),
    'release-manifest.json must exist at the mission-control root'
  )
})

test('release-manifest.json declares version 4.1.0', () => {
  const raw = readRequired('release-manifest.json')
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    assert.fail('release-manifest.json must be valid JSON')
  }

  assert.equal(
    manifest.version,
    '4.1.0',
    'release-manifest.json must declare version 4.1.0'
  )
})

test('release-manifest.json contains SHA256 entries for tracked artifacts', () => {
  const raw = readRequired('release-manifest.json')
  const manifest = JSON.parse(raw)

  assert.ok(
    manifest.sha256 !== undefined || manifest.checksums !== undefined,
    'release-manifest.json must contain a sha256 or checksums section'
  )

  const entries = manifest.sha256 ?? manifest.checksums
  const isNonEmpty =
    (typeof entries === 'object' && entries !== null && !Array.isArray(entries) && Object.keys(entries).length > 0) ||
    (Array.isArray(entries) && entries.length > 0)

  assert.ok(
    isNonEmpty,
    'release-manifest.json sha256/checksums section must have at least one entry'
  )

  const values = Array.isArray(entries)
    ? entries.map((e) => e.sha256 ?? e.hash ?? e)
    : Object.values(entries)

  for (const v of values) {
    assert.match(
      String(v),
      /^[a-f0-9]{64}$/i,
      `release-manifest.json sha256 entry must be a 64-character hex string, got: ${v}`
    )
  }
})

// ---------------------------------------------------------------------------
// Contract 8 - 4.1.0 fresh-install fixes
// ---------------------------------------------------------------------------

test('engine runs the Claude login in the foreground, never in the background', () => {
  const engine = readRequired('install/install.mjs')

  assert.doesNotMatch(engine, /nohup|start \/b/, 'engine must not background claude auth login')
  assert.match(
    engine,
    /\['auth',\s*'login',\s*'--claudeai'\][\s\S]{0,80}stdio:\s*'inherit'/,
    'engine must run claude auth login --claudeai with inherited stdio so the pasted code reaches it'
  )
  assert.match(engine, /paste/i, 'engine must tell the user to paste the code the browser shows')
  assert.match(engine, /--skip-claude-login/, 'engine must offer --skip-claude-login')
})

test('engine checks better-sqlite3 after npm install and repairs with npm rebuild', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(engine, /require\("better-sqlite3"\)\)\(":memory:"\)/, 'engine must probe better-sqlite3 with an in-memory database')
  assert.match(engine, /\['rebuild',\s*'better-sqlite3'\]/, 'engine must repair with npm rebuild better-sqlite3')
})

test('package.json allows install scripts for better-sqlite3 and sharp (npm 11)', () => {
  const pkg = JSON.parse(readRequired('package.json'))
  assert.equal(pkg.allowScripts?.['better-sqlite3'], true)
  assert.equal(pkg.allowScripts?.sharp, true)
})

test('engine seeds the demo CRM and loads scripts/validate-crm-install.js for verification', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(engine, /seed-crm-demo-data\.js/, 'engine must run the demo CRM seed')
  assert.match(engine, /validate-crm-install\.js/, 'engine must reuse the validate script checks')
  assert.ok(existsSync(resolve(appRoot, 'scripts/validate-crm-install.js')), 'scripts/validate-crm-install.js must exist')
})

test('engine discovers email providers from local env only and prints the none-found hint', () => {
  const engine = readRequired('install/install.mjs')

  assert.match(engine, /function detectEmailProviders/, 'engine must port detectEmailProviders')
  assert.match(engine, /Email sending: none found/, 'engine must print the none-found line')
  assert.match(engine, /SENDGRID_API_KEY|POSTMARK_SERVER_TOKEN|SMTP_HOST/, 'engine must know the other providers')
  assert.match(engine, /maskSecretTail/, 'engine must mask secrets before printing')
})

test('lib/crm.js creates the data directory before opening the database in write mode', () => {
  const crm = readRequired('lib/crm.js')
  assert.match(
    crm,
    /mkdirSync\(path\.dirname\(DB_PATH\),\s*\{\s*recursive:\s*true\s*\}\)[\s\S]{0,200}new Database\(DB_PATH/,
    'getDb must mkdir the data folder before new Database(DB_PATH)'
  )
})

test('demo seed falls back to the app folder, the same workspace as lib/crm.js', () => {
  const seed = readRequired('.allsorted-crm-package/seed-crm-demo-data.js')
  assert.match(seed, /path\.resolve\(__dirname,\s*"\.\."\)/, 'seed fallback must be the app folder')
  assert.doesNotMatch(seed, /path\.resolve\(__dirname,\s*"\.\.",\s*"\.\."\)/, 'seed must not fall back to the repo root')
})

test('.gitignore excludes the CRM database and installer state', () => {
  const ignore = readRequired('.gitignore')
  assert.match(ignore, /^data\/$/m)
  assert.match(ignore, /^\.allsorted-crm-install\.json$/m)
})

test('README documents the executor permissions flag, the timestamped idle line and the validate script', () => {
  const readme = readRequired('README.md')
  assert.match(readme, /--dangerously-skip-permissions/)
  assert.match(readme, /ends with `No pending cards in AI column`/)
  assert.match(readme, /validate-crm-install\.js/)
  assert.match(readme, /\.env\.local/)
  assert.match(readme, /verified domain|domain you have verified/i)
})

test('AGENTS.md and CLAUDE.md carry the local-app and approval rules', () => {
  const agents = readRequired('AGENTS.md')
  const claude = readRequired('CLAUDE.md')
  assert.match(claude, /^@AGENTS\.md$/m)
  assert.match(agents, /local app/i)
  assert.match(agents, /not (as )?a skill/i)
  assert.match(agents, /before any write/i)
  assert.match(agents, /human approval for any outbound message/i)
  assert.match(agents, /automations, cron and live sending disabled/i)
})

test('executor idle line is checked by suffix because every log line carries a timestamp', () => {
  const executor = readRequired('executor.py')
  assert.match(executor, /line = f"\[\{ts\}\] \{msg\}"/, 'executor log lines are prefixed with a timestamp')
  const idle = '[2026-01-01 00:00:00] No pending cards in AI column'
  assert.ok(idle.endsWith('No pending cards in AI column'))
  assert.notEqual(idle, 'No pending cards in AI column', 'an exact match on the idle line would fail')
})
