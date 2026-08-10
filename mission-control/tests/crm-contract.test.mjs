import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. package.json manifest checks
// ---------------------------------------------------------------------------
test('package.json version is 4.0.0 and dependencies includes better-sqlite3', () => {
  const pkgPath = resolve(appRoot, 'package.json')
  assert.ok(existsSync(pkgPath), 'package.json must exist at appRoot')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

  assert.equal(pkg.version, '4.0.0', 'package.json version must be 4.0.0')
  assert.ok(
    pkg.dependencies && 'better-sqlite3' in pkg.dependencies,
    'dependencies must contain better-sqlite3'
  )
})

// ---------------------------------------------------------------------------
// 2. Required CRM file paths exist
// ---------------------------------------------------------------------------
test('CRM production file paths exist under appRoot', () => {
  const requiredPaths = [
    'app/app/crm/page.tsx',
    'app/app/crm/pipeline/page.tsx',
    'app/api/crm/route.ts',
    'app/api/crm/[contactId]/route.ts',
    'lib/crm.js',
  ]

  for (const rel of requiredPaths) {
    const abs = resolve(appRoot, rel)
    assert.ok(existsSync(abs), `required path must exist: ${rel}`)
  }
})

// ---------------------------------------------------------------------------
// 3. app/app/layout.tsx contains a navigation href to /app/crm
// ---------------------------------------------------------------------------
test('app/app/layout.tsx has a navigation link to /app/crm', () => {
  const layoutPath = resolve(appRoot, 'app/app/layout.tsx')
  assert.ok(existsSync(layoutPath), 'app/app/layout.tsx must exist')
  const source = readFileSync(layoutPath, 'utf8')
  assert.match(source, /href=["'`]\/app\/crm["'`]/, 'layout must contain an href pointing to /app/crm')
})

// ---------------------------------------------------------------------------
// 4. Scanned files must not contain obsolete CRM module tokens
// ---------------------------------------------------------------------------
test('install.sh, install.ps1, and README.md contain no obsolete CRM module tokens', () => {
  const obsoleteTokens = [
    'crm-module-v1.5',
    'allsorted-crm-module-v1.5.zip',
    'github.com/josephtandle/allsorted-web/releases/download/crm-module',
  ]

  const scannedFiles = [
    'install.sh',
    'install.ps1',
    'README.md',
  ]

  for (const rel of scannedFiles) {
    const abs = resolve(appRoot, rel)
    assert.ok(existsSync(abs), `scanned file must exist: ${rel}`)
    const content = readFileSync(abs, 'utf8')
    for (const token of obsoleteTokens) {
      assert.ok(
        !content.includes(token),
        `${rel} must not contain obsolete token: ${token}`
      )
    }
  }
})

// ---------------------------------------------------------------------------
// 5. lib/crm.js contains the machine key and its false/0 disabled default
//    (Expected to fail RED until lib/crm.js is created)
// ---------------------------------------------------------------------------
test('lib/crm.js defines crm.automation.email.live_enabled with a false/0 disabled default', () => {
  const crmLibPath = resolve(appRoot, 'lib/crm.js')
  assert.ok(existsSync(crmLibPath), 'lib/crm.js must exist')
  const source = readFileSync(crmLibPath, 'utf8')
  assert.match(
    source,
    /crm\.automation\.email\.live_enabled/,
    'lib/crm.js must contain the machine key crm.automation.email.live_enabled'
  )
  assert.match(
    source,
    /crm\.automation\.email\.live_enabled[\s\S]{0,120}(?:false|0)/,
    'lib/crm.js must establish a false/0 disabled default for crm.automation.email.live_enabled'
  )
})
