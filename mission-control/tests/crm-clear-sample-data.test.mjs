// "Clear sample data" removes the example contacts the installer seeds
// (ids demo-contact-*) plus every row that hangs off them, leaves real
// contacts alone, and sets crm.sample_data.cleared so re-running the seed
// script (and so the installer) never brings them back.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const LIB = join(appRoot, 'lib', 'crm.js')
const SAMPLE_DB = join(appRoot, '.allsorted-crm-package', 'crm-sample.db')
const SEED_SCRIPT = join(appRoot, '.allsorted-crm-package', 'seed-crm-demo-data.js')
const Database = require(join(appRoot, 'node_modules', 'better-sqlite3'))

const quote = (name) => `"${name.replace(/"/g, '""')}"`
let unique = 0

function withWorkspace(run) {
  const workspace = mkdtempSync(join(tmpdir(), 'mc-crm-clear-'))
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

function runSeed(workspace) {
  return execFileSync(process.execPath, [SEED_SCRIPT], {
    env: { ...process.env, CRM_WORKSPACE_PATH: workspace },
    encoding: 'utf8',
  })
}

// Insert one row with every NOT NULL column filled, overriding the given ones.
function insertRow(db, table, overrides) {
  const values = {}
  for (const column of db.prepare(`PRAGMA table_info(${quote(table)})`).all()) {
    if (Object.prototype.hasOwnProperty.call(overrides, column.name)) values[column.name] = overrides[column.name]
    else if (column.pk && /INT/i.test(column.type)) continue
    else if (column.pk || (column.notnull && column.dflt_value == null)) {
      values[column.name] = /INT|REAL|NUM/i.test(column.type) ? 0 : `${table}-${column.name}-${++unique}`
    }
  }
  const names = Object.keys(values)
  const info = db
    .prepare(`INSERT INTO ${quote(table)} (${names.map(quote).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...names.map((name) => values[name]))
  return values.id !== undefined ? values.id : info.lastInsertRowid
}

// Every table/column holding a contact id, read from the schema.
function contactLinks(db) {
  const links = []
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (name === 'crm_contacts') continue
    for (const column of db.prepare(`PRAGMA table_info(${quote(name)})`).all()) {
      if (column.name === 'contact_id' || column.name.endsWith('_contact_id')) links.push({ table: name, column: column.name })
    }
  }
  return links
}

const countWhere = (db, table, column, op, value) =>
  db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)} WHERE ${quote(column)} ${op} ?`).get(value).n

test('clear sample data removes demo contacts and dependents, keeps real contacts, and the seed does not bring them back', () => {
  withWorkspace((workspace, crm) => {
    const database = join(workspace, 'data', 'crm.db')
    mkdirSync(dirname(database), { recursive: true })
    copyFileSync(SAMPLE_DB, database)
    assert.deepEqual(crm.getSampleDataStatus(), { count: 5, has_sample_data: true })

    crm.ingestLead({ full_name: 'Real Person', primary_email: 'real.person@example.invalid', source: 'manual' })
    const db = new Database(database)
    const realId = db.prepare("SELECT id FROM crm_contacts WHERE id NOT GLOB 'demo-contact-*'").get().id
    const links = contactLinks(db)
    assert.ok(links.length >= 10, `expected the full CRM schema, found ${links.length} contact-linked columns`)
    const deliveryIds = {}
    for (const { table, column } of links) {
      for (const owner of ['demo-contact-1', realId]) {
        const id = insertRow(db, table, { [column]: owner })
        if (table === 'crm_automation_delivery_queue') deliveryIds[owner] = id
      }
    }
    for (const owner of Object.keys(deliveryIds)) insertRow(db, 'crm_automation_delivery_attempts', { delivery_id: deliveryIds[owner] })
    const realBefore = Object.fromEntries(links.map(({ table, column }) => [`${table}.${column}`, countWhere(db, table, column, '=', realId)]))

    const result = crm.clearSampleData()
    assert.equal(result.removed, 5)
    assert.deepEqual(crm.getSampleDataStatus(), { count: 0, has_sample_data: false })
    for (const { table, column } of links) {
      assert.equal(countWhere(db, table, column, 'GLOB', 'demo-contact-*'), 0, `${table}.${column} still holds demo rows`)
      assert.equal(countWhere(db, table, column, '=', realId), realBefore[`${table}.${column}`], `${table}.${column} lost a real contact row`)
    }
    assert.equal(countWhere(db, 'crm_automation_delivery_attempts', 'delivery_id', '=', deliveryIds['demo-contact-1']), 0)
    assert.equal(countWhere(db, 'crm_automation_delivery_attempts', 'delivery_id', '=', deliveryIds[realId]), 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM crm_contacts WHERE id = ?').get(realId).n, 1)
    assert.equal(db.prepare("SELECT value FROM crm_settings WHERE key = 'crm.sample_data.cleared'").get().value, 'true')
    db.close()

    assert.match(runSeed(workspace), /not adding it back/)
    assert.equal(crm.getSampleDataStatus().count, 0, 're-running the seed brought the demo contacts back')
  })
})

test('the seed still merges on a database that was never cleared', () => {
  withWorkspace((workspace, crm) => {
    runSeed(workspace)
    assert.equal(crm.getSampleDataStatus().count, 5)
    crm.ingestLead({ full_name: 'Real Person', primary_email: 'real.person@example.invalid', source: 'manual' })
    const db = new Database(join(workspace, 'data', 'crm.db'))
    db.prepare("DELETE FROM crm_contacts WHERE id GLOB 'demo-contact-*'").run()
    db.close()
    assert.match(runSeed(workspace), /seed merge complete/)
    assert.equal(crm.getSampleDataStatus().count, 5)
  })
})

test('the API route and the CRM workspace wire up the clear action', () => {
  const route = readFileSync(join(appRoot, 'app', 'api', 'crm', 'route.ts'), 'utf8')
  assert.match(route, /action === "clear-sample-data"[\s\S]{0,80}crm\.clearSampleData\(\)/)
  assert.match(route, /sample_data: crm\.getSampleDataStatus\(\)/)
  const ui = readFileSync(join(appRoot, 'app', 'app', 'crm', '_components', 'CrmWorkspace.tsx'), 'utf8')
  assert.match(ui, /sampleData && sampleData\.count > 0/)
  assert.match(ui, /Clear sample data \(\{sampleData\.count\}\)/)
})
