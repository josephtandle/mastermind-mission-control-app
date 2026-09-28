/**
 * resend-safety.test.mjs
 *
 * Proves that the CRM test-email path never reaches a live mail service from
 * the test suite:
 *   - lib/crm.js runs against a temporary workspace (CRM_WORKSPACE_PATH)
 *   - RESEND_API_KEY is a fake value
 *   - https.request is replaced by a recorder; http.request, https.get,
 *     http.get, global fetch, net.connect and tls.connect throw
 *   - crm.sendAutomationTestEmail() must build the expected Resend payload
 *     (POST https://api.resend.com/emails, Bearer header, from, to, subject,
 *     text, html) and touch nothing else
 *   - the SMTP transport is exercised against a throwaway local relay and the
 *     captured message is checked
 *   - no other test file imports the send path
 *
 * Run: node --test tests/resend-safety.test.mjs
 */

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, '..')
const require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Isolated workspace and environment, set before lib/crm.js is loaded
// ---------------------------------------------------------------------------
const workspace = mkdtempSync(join(os.tmpdir(), 'mc-resend-safety-'))
process.env.CRM_WORKSPACE_PATH = workspace
process.env.RESEND_API_KEY = 're_test_fake_key_for_unit_tests_only'
process.env.RESEND_FROM_EMAIL = 'Mission Control <test@example.com>'
process.env.CRM_GOOGLE_SENDER_COMMAND = ''
// No other provider may leak in from the developer's shell, and no CLI lookup
// (gog) may run: an empty PATH makes commandExists() false for everything.
for (const name of [
  'SENDGRID_API_KEY', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_SMTP_LOGIN', 'MAILGUN_SMTP_PASSWORD',
  'POSTMARK_SERVER_TOKEN', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_SECURE',
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GMAIL_CLI_ACCOUNT', 'GOG_ACCOUNT',
  'CONVERTKIT_API_KEY', 'KIT_API_KEY', 'CONVERTKIT_API_SECRET', 'CRM_AUTOMATION_EMAIL_FROM',
]) delete process.env[name]
process.env.PATH = workspace

const crm = require(join(appRoot, 'lib', 'crm.js'))

// ---------------------------------------------------------------------------
// Network guards
// ---------------------------------------------------------------------------
const original = {
  httpsRequest: https.request,
  httpsGet: https.get,
  httpRequest: http.request,
  httpGet: http.get,
  fetch: globalThis.fetch,
  netConnect: net.connect,
  netCreateConnection: net.createConnection,
  tlsConnect: tls.connect,
}

const forbidden = (label) => () => {
  throw new Error(`live network call blocked in tests: ${label}`)
}

function blockAllNetwork() {
  https.request = forbidden('https.request')
  https.get = forbidden('https.get')
  http.request = forbidden('http.request')
  http.get = forbidden('http.get')
  globalThis.fetch = forbidden('fetch')
  net.connect = forbidden('net.connect')
  net.createConnection = forbidden('net.createConnection')
  tls.connect = forbidden('tls.connect')
}

function restoreNetwork() {
  https.request = original.httpsRequest
  https.get = original.httpsGet
  http.request = original.httpRequest
  http.get = original.httpGet
  globalThis.fetch = original.fetch
  net.connect = original.netConnect
  net.createConnection = original.netCreateConnection
  tls.connect = original.tlsConnect
}

// Recording stand-in for https.request that answers like Resend without
// opening a socket.
function installHttpsRecorder(statusCode = 200, responseBody = { id: 'resend-mock-id' }) {
  const calls = []
  https.request = (options, callback) => {
    const call = { options, chunks: [] }
    calls.push(call)
    const req = new EventEmitter()
    req.setTimeout = () => req
    req.write = (chunk) => {
      call.chunks.push(String(chunk))
      return true
    }
    req.destroy = () => req
    req.end = () => {
      const res = new EventEmitter()
      res.statusCode = statusCode
      res.headers = { 'content-type': 'application/json' }
      setImmediate(() => {
        callback(res)
        res.emit('data', JSON.stringify(responseBody))
        res.emit('end')
      })
    }
    return req
  }
  return calls
}

test.after(() => {
  restoreNetwork()
  rmSync(workspace, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Resend transport
// ---------------------------------------------------------------------------
test('sendAutomationTestEmail() posts the expected Resend payload and touches no live socket', async () => {
  blockAllNetwork()
  const calls = installHttpsRecorder()
  try {
    const result = await crm.sendAutomationTestEmail({
      to: 'recipient@example.org',
      subject: 'Unit test subject',
      body: 'First paragraph.\n\nSecond paragraph.',
    })

    assert.equal(calls.length, 1, 'exactly one https.request must be issued')
    const [call] = calls
    assert.equal(call.options.method, 'POST')
    assert.equal(call.options.hostname, 'api.resend.com')
    assert.equal(call.options.path, '/emails')
    assert.equal(call.options.protocol, 'https:')
    assert.equal(call.options.headers.Authorization, `Bearer ${process.env.RESEND_API_KEY}`)
    assert.equal(call.options.headers['Content-Type'], 'application/json')

    const payload = JSON.parse(call.chunks.join(''))
    assert.equal(payload.from, 'Mission Control <test@example.com>')
    assert.deepEqual(payload.to, ['recipient@example.org'])
    assert.equal(payload.subject, 'Unit test subject')
    assert.equal(payload.text, 'First paragraph.\n\nSecond paragraph.')
    assert.equal(payload.html, '<p>First paragraph.</p><p>Second paragraph.</p>')

    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.equal(result.data.provider, 'resend')
    assert.equal(result.data.id, 'resend-mock-id')
  } finally {
    restoreNetwork()
  }
})

test('sendAutomationTestEmail() surfaces a provider rejection without retrying elsewhere', async () => {
  blockAllNetwork()
  const calls = installHttpsRecorder(403, { message: 'Domain not verified' })
  try {
    const result = await crm.sendAutomationTestEmail({ to: 'recipient@example.org' })
    assert.equal(calls.length, 1)
    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(result.data.message, 'Domain not verified')
  } finally {
    restoreNetwork()
  }
})

test('sendAutomationTestEmail() requires a recipient before any request is built', async () => {
  blockAllNetwork()
  try {
    await assert.rejects(() => crm.sendAutomationTestEmail({ to: '' }), /recipient is required/i)
  } finally {
    restoreNetwork()
  }
})

// ---------------------------------------------------------------------------
// SMTP transport against a throwaway local relay
// ---------------------------------------------------------------------------
function startFakeSmtpRelay() {
  const captured = { commands: [], data: '' }
  const server = net.createServer((socket) => {
    let buffer = ''
    let inData = false
    socket.write('220 fake-relay ESMTP ready\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            socket.write('250 OK queued as FAKE123\r\n')
          } else {
            captured.data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`
          }
          continue
        }
        captured.commands.push(line)
        const verb = line.split(/[\s:]/)[0].toUpperCase()
        if (verb === 'EHLO' || verb === 'HELO') socket.write('250-fake-relay\r\n250 SIZE 1000000\r\n')
        else if (verb === 'MAIL' || verb === 'RCPT') socket.write('250 OK\r\n')
        else if (verb === 'DATA') {
          inData = true
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        } else if (verb === 'QUIT') {
          socket.write('221 Bye\r\n')
          socket.end()
        } else socket.write('500 Unknown command\r\n')
      }
    })
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port, captured }))
  })
}

test('SMTP transport delivers through a local relay only, with https and fetch blocked', async () => {
  const relay = await startFakeSmtpRelay()
  const savedResendKey = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(relay.port)
  blockAllNetwork()
  // The relay is the only allowed destination: plain TCP to 127.0.0.1 on the
  // ephemeral port above. Anything else stays blocked.
  net.connect = (options, ...rest) => {
    const host = typeof options === 'object' ? options.host : undefined
    const port = typeof options === 'object' ? Number(options.port) : Number(options)
    if (host !== '127.0.0.1' || port !== relay.port) throw new Error(`live network call blocked in tests: net.connect ${host}:${port}`)
    return original.netConnect(options, ...rest)
  }
  try {
    crm.setAutomationSettings({ email_provider: 'smtp' })
    const result = await crm.sendAutomationTestEmail({
      to: 'smtp-recipient@example.org',
      subject: 'SMTP unit test',
      body: 'Hello over SMTP.',
    })
    assert.equal(result.ok, true)
    assert.equal(result.data.provider, 'smtp')
    assert.equal(result.data.host, '127.0.0.1')
    assert.equal(result.data.id, 'FAKE123')
    assert.ok(relay.captured.commands.some((line) => /^MAIL FROM:<test@example\.com>$/i.test(line)), 'MAIL FROM must use the configured sender')
    assert.ok(relay.captured.commands.some((line) => /^RCPT TO:<smtp-recipient@example\.org>$/i.test(line)), 'RCPT TO must use the recipient')
    assert.match(relay.captured.data, /^Subject: SMTP unit test$/m)
    // Body parts are base64 encoded one line each; decode every base64-looking line.
    const decoded = relay.captured.data
      .split(/\r\n/)
      .filter((line) => line.length >= 8 && /^[A-Za-z0-9+/]+=*$/.test(line))
      .map((line) => Buffer.from(line, 'base64').toString('utf8'))
      .join('\n')
    assert.match(decoded, /Hello over SMTP\./)
    assert.ok(!relay.captured.commands.some((line) => /^AUTH/i.test(line)), 'no credentials may be sent to an unauthenticated relay')
  } finally {
    restoreNetwork()
    process.env.RESEND_API_KEY = savedResendKey
    delete process.env.SMTP_HOST
    delete process.env.SMTP_PORT
    crm.setAutomationSettings({ email_provider: '' })
    await new Promise((resolvePromise) => relay.server.close(() => resolvePromise()))
  }
})

// ---------------------------------------------------------------------------
// Suite hygiene: the send path is only ever imported here
// ---------------------------------------------------------------------------
test('no other test file imports lib/crm or the email send path', () => {
  const testsDir = join(appRoot, 'tests')
  const offenders = []
  for (const file of readdirSync(testsDir)) {
    if (!/\.(mjs|js|ts)$/.test(file) || file === 'resend-safety.test.mjs') continue
    const source = readFileSync(join(testsDir, file), 'utf8')
    if (/require\([^)]*lib\/crm|from\s+['"][^'"]*lib\/crm|sendAutomationTestEmail\(|api\.resend\.com\/emails/.test(source)) {
      offenders.push(file)
    }
  }
  assert.deepEqual(offenders, [], `these test files touch the send path: ${offenders.join(', ')}`)
})
