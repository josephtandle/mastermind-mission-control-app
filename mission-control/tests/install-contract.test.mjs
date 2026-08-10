/**
 * install-contract.test.mjs
 *
 * Structural contract tests for the Mission Control installer surface.
 * Tests are machine-consumable: every assertion is against deterministic
 * tokens/patterns found in source files — no prose-coupled heuristics.
 *
 * Run:  node --test mission-control/tests/install-contract.test.mjs
 *
 * Ownership: mission-control/tests  (do not edit production files here)
 *
 * v4 note: install.sh and install.ps1 are now thin delegates to
 * install/install.mjs. The engine file carries all install logic.
 * The POSIX and Windows wrapper tests have been updated to assert
 * delegation rather than inline logic.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const appRoot    = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const exists = (rel) => existsSync(resolve(appRoot, rel))
const read   = (rel) => readFileSync(resolve(appRoot, rel), 'utf8')

// ---------------------------------------------------------------------------
// LEGACY CONTRACTS — preserved intent; assertions updated for v4 delegation
// ---------------------------------------------------------------------------

test('projects table renders col elements through a JSX expression', () => {
  const source = read('app/app/tasks/projects/page.tsx')
  const colgroup = source.match(/<colgroup>[\s\S]*?<\/colgroup>/)?.[0]

  assert.ok(colgroup, 'projects table must include a colgroup')
  assert.match(colgroup, /^<colgroup>\{\[/)
  assert.match(colgroup, /\]\}<\/colgroup>$/)
  assert.doesNotMatch(colgroup, /\{\/\*/)
})

test('POSIX installer delegates to install/install.mjs and engine bootstraps standalone Claude CLI', () => {
  const installer = read('install.sh')
  const engine    = read('install/install.mjs')
  const executor  = read('executor.py')

  // Wrapper must delegate to the engine
  assert.match(installer, /install\/install\.mjs/, 'install.sh must delegate to install/install.mjs')

  // Engine (not wrapper) carries auth logic
  assert.match(engine, /claude auth status/)
  assert.match(engine, /--claudeai/)
  assert.match(engine, /Claude\.app|claude-code/)

  // Wrapper must not re-implement logic that belongs in the engine
  assert.doesNotMatch(installer, /sed .*executor\.py/)

  // executor.py must keep bare claude path
  assert.match(executor, /\["claude", "--dangerously-skip-permissions", "--model", model, "-p", prompt\]/)
})

test('native Windows installer delegates to install/install.mjs and engine applies the same standalone CLI and auth gate', () => {
  const installer = read('install.ps1')
  const engine    = read('install/install.mjs')

  // Wrapper must delegate to the engine
  assert.match(installer, /install\/install\.mjs/, 'install.ps1 must delegate to install/install.mjs')

  // Engine (not wrapper) carries auth and Python detection logic
  assert.match(engine, /claude auth status/)
  assert.match(engine, /Claude\.app|claude-code/)
  assert.match(engine, /auth.*login.*--claudeai/s)
  assert.match(engine, /'python'|"python"/)
  assert.match(engine, /python3/)
  assert.match(engine, /py.*-3|['"]py['"]/)
  assert.match(engine, /version_info\.major\s*==\s*3|sys\.version_info/)
})

test('task executor routes resolve Python 3 cross-platform and preserve PATH', () => {
  const resolver          = read('lib/python-command.ts')
  const taskExecutorRoute = read('app/api/task-executor/route.ts')
  const cardExecutorRoute = read('app/api/tasks/[cardId]/execute/route.ts')

  assert.match(resolver, /command: "py", prefixArgs: \["-3"\]/)
  assert.match(resolver, /sys\.version_info\.major == 3/)
  assert.match(taskExecutorRoute, /resolvePythonInvocation/)
  assert.match(cardExecutorRoute, /resolvePythonInvocation/)
  assert.doesNotMatch(taskExecutorRoute, /spawn\("python3"/)
  assert.doesNotMatch(cardExecutorRoute, /spawn\("python3"/)
  assert.doesNotMatch(taskExecutorRoute, /PATH:\s*`\/opt\/homebrew/)
  assert.doesNotMatch(cardExecutorRoute, /cleanEnv\.PATH\s*=/)
})

test('install docs describe both platforms and the human authorization gate', () => {
  const rootReadme = read('../README.md')
  const appReadme  = read('README.md')

  for (const readme of [rootReadme, appReadme]) {
    assert.match(readme, /install\.sh/)
    assert.match(readme, /install\.ps1/)
    assert.match(readme, /browser/i)
    assert.match(readme, /run the same installer again/i)
    assert.match(readme, /hourly auto-executor is off by default|hourly executor remains off by default/i)
  }

  assert.doesNotMatch(appReadme, /schedules the hourly task executor/)
})

// ---------------------------------------------------------------------------
// CONTRACT A — Shared Node installer entrypoint exists
// ---------------------------------------------------------------------------
test('[contract] shared Node installer entrypoint exists at install/install.mjs', () => {
  assert.ok(
    exists('install/install.mjs'),
    'install/install.mjs must exist as the single authoritative installer entrypoint'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT B — install.sh is a thin wrapper that delegates to install.mjs
// ---------------------------------------------------------------------------
test('[contract] install.sh delegates to the shared Node installer (install/install.mjs)', () => {
  const sh = read('install.sh')

  assert.match(
    sh,
    /install\/install\.mjs/,
    'install.sh must reference install/install.mjs as the delegate target'
  )

  // Thin wrapper must NOT re-implement the npm claude-code install
  assert.doesNotMatch(
    sh,
    /npm install -g @anthropic-ai\/claude-code/,
    'install.sh must not re-implement npm install of claude-code; that belongs in install.mjs'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT C — install.ps1 is a thin wrapper that delegates to install.mjs
// ---------------------------------------------------------------------------
test('[contract] install.ps1 delegates to the shared Node installer (install/install.mjs)', () => {
  const ps1 = read('install.ps1')

  assert.match(
    ps1,
    /install\/install\.mjs/,
    'install.ps1 must reference install/install.mjs as the delegate target'
  )

  assert.doesNotMatch(
    ps1,
    /npm install -g @anthropic-ai\/claude-code/,
    'install.ps1 must not re-implement npm install of claude-code; that belongs in install.mjs'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT D — Shared installer: standalone Claude CLI install + auth checks
// ---------------------------------------------------------------------------
test('[contract] install.mjs includes standalone Claude CLI install and auth checks', () => {
  const installer = read('install/install.mjs')

  assert.match(
    installer,
    /npm install -g @anthropic-ai\/claude-code/,
    'install.mjs must install the standalone Claude Code CLI via npm'
  )

  assert.match(
    installer,
    /claude auth status/,
    'install.mjs must check `claude auth status`'
  )

  assert.match(
    installer,
    /auth.*login.*--claudeai/s,
    'install.mjs must trigger `claude auth login --claudeai` for the browser flow'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT E — Shared installer: refuses Claude Desktop internal binaries
// ---------------------------------------------------------------------------
test('[contract] install.mjs refuses Claude Desktop internal binaries', () => {
  const installer = read('install/install.mjs')

  assert.match(
    installer,
    /Claude\.app|claude-code[/\\][^/\\]+[/\\]claude\.app/,
    'install.mjs must contain a guard pattern for the Claude Desktop internal binary path'
  )

  assert.match(
    installer,
    /Desktop internal binary|PATH still resolves to.*Claude|Ignoring Claude Desktop/i,
    'install.mjs must log or throw when a Desktop internal binary is detected'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT F — Shared installer: Resend setup without scanning parent/sibling env files
// ---------------------------------------------------------------------------
test('[contract] install.mjs handles Resend setup and does not scan parent or sibling env files', () => {
  const installer = read('install/install.mjs')

  assert.match(
    installer,
    /RESEND_API_KEY|resend/i,
    'install.mjs must include Resend API key setup'
  )

  assert.doesNotMatch(
    installer,
    /\.\.[/\\].*\.env|\.\.[/\\]\.\.[/\\].*\.env/,
    'install.mjs must not reference parent-directory .env paths'
  )

  assert.doesNotMatch(
    installer,
    /glob.*\.env|find.*\.env.*parent|scanEnv.*parent/i,
    'install.mjs must not scan parent or sibling env files for Resend config'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT G — Shared installer: writes only local .env.local guidance
// ---------------------------------------------------------------------------
test('[contract] install.mjs writes guidance only to local .env.local (not parent paths)', () => {
  const installer = read('install/install.mjs')

  assert.match(
    installer,
    /\.env\.local/,
    'install.mjs must reference .env.local as the target for local env guidance'
  )

  assert.doesNotMatch(
    installer,
    /\.\.[/\\]\.env\.local|\.\.[/\\]\.\.[/\\]\.env/,
    'install.mjs must not write .env.local to any parent directory path'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT H — Shared installer: uses explicit DONE / NEEDS_INPUT / NEEDS_REVIEW markers
// ---------------------------------------------------------------------------
test('[contract] install.mjs uses explicit DONE, NEEDS_INPUT, and NEEDS_REVIEW status markers', () => {
  const installer = read('install/install.mjs')

  assert.match(installer, /DONE/,         'install.mjs must emit the DONE status marker')
  assert.match(installer, /NEEDS_INPUT/,  'install.mjs must emit the NEEDS_INPUT status marker')
  assert.match(installer, /NEEDS_REVIEW/, 'install.mjs must emit the NEEDS_REVIEW status marker')
})

// ---------------------------------------------------------------------------
// CONTRACT I — Shared installer: self-healing retries bounded to 2
// ---------------------------------------------------------------------------
test('[contract] install.mjs bounds self-healing retries to a maximum of 2', () => {
  const installer = read('install/install.mjs')

  assert.match(
    installer,
    /MAX_RETRIES\s*=\s*2|maxRetries\s*=\s*2|MAX_REPAIR_ATTEMPTS\s*=\s*2|MAX_REPAIR\s*=\s*2|MAX_ATTEMPTS\s*=\s*2|retry.*<\s*2|retries.*<=\s*[12]/,
    'install.mjs must bound self-healing retries to 2 (MAX_REPAIR_ATTEMPTS=2 or equivalent)'
  )

  assert.doesNotMatch(
    installer,
    /MAX_RETRIES\s*=\s*[3-9]|maxRetries\s*=\s*[3-9]|MAX_REPAIR_ATTEMPTS\s*=\s*[3-9]|MAX_REPAIR\s*=\s*[3-9]|MAX_ATTEMPTS\s*=\s*[3-9]/,
    'install.mjs must not set the repair attempt limit to 3 or more'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT J — Release surface: manifest or checksum script exists
// ---------------------------------------------------------------------------
test('[contract] a release manifest or checksum script exists under install/ or release/', () => {
  const candidates = [
    'release-manifest.json',
    'install/release-manifest.json',
    'install/release-manifest.mjs',
    'install/checksum.mjs',
    'install/checksum.sh',
    'release/release-manifest.json',
    'release/release-manifest.mjs',
    'release/checksum.mjs',
    'release/checksum.sh',
  ]

  const found = candidates.filter(exists)
  assert.ok(
    found.length > 0,
    `at least one release manifest or checksum file must exist; checked: ${candidates.join(', ')}`
  )
})

// ---------------------------------------------------------------------------
// CONTRACT K — install.mjs is valid ESM (has import or export statement)
// ---------------------------------------------------------------------------
test('[contract] install.mjs is authored as ESM (contains import or export declarations)', () => {
  const installer = read('install/install.mjs')

  assert.match(
    installer,
    /^import |^export /m,
    'install/install.mjs must contain at least one top-level import or export (ESM)'
  )
})

// ---------------------------------------------------------------------------
// CONTRACT L — install.mjs does not read MyOS workspace or Gemini config paths
// ---------------------------------------------------------------------------
test('[contract] install.mjs does not reference MyOS workspace or sibling project env paths', () => {
  const installer = read('install/install.mjs')

  assert.doesNotMatch(
    installer,
    /\.myos|MYOS_|myos-sidecar|\/Users\/[^/]+\/\.gemini/i,
    'install.mjs must not read or reference MyOS workspace or Gemini config paths'
  )
})
