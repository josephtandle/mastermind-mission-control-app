// Fresh install puts the 8 sample cards across the pipeline columns; clearing
// removes them, and "Load sample data" brings them back without duplicates.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const LIB = join(appRoot, 'lib', 'crm.js')
const SAMPLE_DB = join(appRoot, '.allsorted-crm-package', 'crm-sample.db')

function withWorkspace(run) {
  const workspace = mkdtempSync(join(tmpdir(), 'mc-crm-load-'))
  const saved = { CRM_WORKSPACE_PATH: process.env.CRM_WORKSPACE_PATH, ALLSORTED_WORKSPACE: process.env.ALLSORTED_WORKSPACE }
  process.env.CRM_WORKSPACE_PATH = workspace
  delete process.env.ALLSORTED_WORKSPACE
  delete require.cache[require.resolve(LIB)]
  try {
    return run(workspace, require(LIB))
  } finally {
    delete require.cache[require.resolve(LIB)]
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(workspace, { recursive: true, force: true })
  }
}

function assertSpread(crm) {
  const board = crm.getPipelineBoard({ project: 'pipeline' })
  const ids = Object.values(board.grouped).flat().map((contact) => contact.id).filter((id) => id.startsWith('demo-contact-'))
  assert.equal(ids.length, 8, 'expected 8 sample cards on the board')
  assert.equal(new Set(ids).size, 8, 'sample cards are duplicated')
  for (const status of board.statuses.slice(0, 5)) {
    assert.ok(board.grouped[status].length >= 1, `column ${status} has no sample card`)
  }
}

test('fresh DB: 8 sample cards across the first 5 columns; clear -> 0; load -> 8; double load does not duplicate', () => {
  withWorkspace((workspace, crm) => {
    assert.equal(crm.ensureInitialSampleData().loaded, false, 'an empty CRM (--no-seed) must stay empty')
    assert.equal(crm.getSampleDataStatus().count, 0)
    crm.loadSampleData()
    assertSpread(crm)
    assert.equal(crm.getSampleDataStatus().count, 8)
    assert.ok(crm.getContactDetail('demo-contact-3'))

    assert.equal(crm.clearSampleData().removed, 8)
    assert.equal(crm.getSampleDataStatus().count, 0)
    assert.equal(crm.ensureInitialSampleData().loaded, false, 'cleared sample data came back on its own')

    crm.loadSampleData()
    crm.loadSampleData()
    assert.equal(crm.getSampleDataStatus().count, 8)
    assertSpread(crm)
    const Database = require(join(appRoot, 'node_modules', 'better-sqlite3'))
    const db = new Database(join(workspace, 'data', 'crm.db'))
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crm_contact_communications WHERE contact_id GLOB 'demo-contact-*'").get().n, 3)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crm_settings WHERE key = 'crm.sample_data.cleared'").get().n, 0)
    db.close()
  })
})

test('the shipped seed DB places the sample cards across the columns on first load', () => {
  withWorkspace((workspace, crm) => {
    const database = join(workspace, 'data', 'crm.db')
    mkdirSync(dirname(database), { recursive: true })
    copyFileSync(SAMPLE_DB, database)
    crm.ensureInitialSampleData()
    assertSpread(crm)
  })
})

test('an older seed that put every sample card in the first column is repaired on first load', () => {
  withWorkspace((workspace, crm) => {
    crm.loadSampleData()
    const Database = require(join(appRoot, 'node_modules', 'better-sqlite3'))
    const db = new Database(join(workspace, 'data', 'crm.db'))
    db.prepare("UPDATE crm_contact_projects SET pipeline_status = 'new' WHERE contact_id GLOB 'demo-contact-*'").run()
    db.prepare("DELETE FROM crm_contacts WHERE id IN ('demo-contact-6', 'demo-contact-7', 'demo-contact-8')").run()
    db.close()
    assert.equal(crm.ensureInitialSampleData().loaded, true)
    assertSpread(crm)
  })
})

test('the API route and the CRM workspace wire up the load action', () => {
  const route = readFileSync(join(appRoot, 'app', 'api', 'crm', 'route.ts'), 'utf8')
  assert.match(route, /action === "load-sample-data"[\s\S]{0,80}crm\.loadSampleData\(\)/)
  assert.match(route, /crm\.ensureInitialSampleData\(\)/)
  const ui = readFileSync(join(appRoot, 'app', 'app', 'crm', '_components', 'CrmWorkspace.tsx'), 'utf8')
  assert.match(ui, /Load sample data/)
  assert.match(ui, /action: "load-sample-data"/)
})
