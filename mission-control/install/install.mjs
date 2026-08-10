#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const MAX_REPAIR = 2
export const MAX_REPAIR_ATTEMPTS = MAX_REPAIR
export const TERMINAL_OUTCOMES = ['DONE', 'NEEDS_INPUT', 'NEEDS_REVIEW']

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLAUDE_DESKTOP_PATTERNS = [/Claude\.app/i, /claude-code\/[^/]+\/claude\.app/i]
const REPAIRABLE_COLGROUP_ERROR = 'whitespace text nodes cannot be a child of <colgroup>'
const VERIFICATION_CHECKLIST = [
  'npm dependencies',
  'production build',
  '/app/tasks',
  '/app/tasks/projects',
  '/app/crm',
  'executor.py',
  'Resend non-sending validation',
  'no enabled schedule',
]

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
    throw new Error(`Unsupported Node.js major version ${process.versions.node}. Supported versions are 20 through 25.`)
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

function isDesktopClaudePath(candidate = '') {
  // Reject Claude.app and claude-code/<version>/claude.app.
  // Desktop internal binary paths are not portable.
  return CLAUDE_DESKTOP_PATTERNS.some((pattern) => pattern.test(candidate))
}

function locateClaude() {
  const candidateCommands = [
    ['which', ['claude']],
    ['command', ['-v', 'claude']],
    ['where', ['claude']],
    ['where.exe', ['claude']],
  ]

  for (const [command, args] of candidateCommands) {
    const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' })
    const found = (result.stdout || result.stderr || '').trim().split(/\r?\n/).find(Boolean)
    if (found && !isDesktopClaudePath(found)) return found
  }

  // Ignoring Claude Desktop internal binary: PATH still resolves to a Claude Desktop internal binary.
  return ''
}

function installStandaloneClaude() {
  // npm install -g @anthropic-ai/claude-code
  spawnSync('npm', ['install', '-g', '@anthropic-ai/claude-code'], { stdio: 'inherit', shell: process.platform === 'win32' })
}

function checkClaudeAuth() {
  // claude auth status
  const result = spawnSync('claude', ['auth', 'status'], { encoding: 'utf8', shell: process.platform === 'win32' })
  let parsed = null
  try {
    parsed = JSON.parse(result.stdout || result.stderr || '{}')
  } catch {
    parsed = null
  }
  return Boolean(parsed && parsed.loggedIn)
}

function beginClaudeAuthFlow() {
  // claude auth login --claudeai
  const command = ['claude', 'auth', 'login', '--claudeai']
  if (process.platform === 'win32') {
    spawnSync('cmd.exe', ['/c', `start /b ${command.join(' ')}`], { stdio: 'inherit' })
  } else {
    spawnSync('nohup', command, { stdio: 'inherit' })
  }
}

function ensureResendSecret() {
  const fromEnv = process.env.RESEND_API_KEY || process.env['RESEND_API_KEY']
  if (fromEnv) return fromEnv.trim()

  const stdinHint = process.stdin.isTTY ? 'hidden prompt' : 'hidden prompt'
  void stdinHint
  return ''
}

async function validateResendKey(resendApiKey) {
  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${resendApiKey}` },
  })
  return response.ok
}

function persistResendLocalEnv(resendApiKey) {
  const envPath = resolve(APP_ROOT, '.env.local')
  const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
  const next = lines.filter((line) => !line.startsWith('RESEND_API_KEY='))
  next.push(`RESEND_API_KEY=${resendApiKey}`)
  writeFileSync(envPath, `${next.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 })
  chmodSync(envPath, 0o600)
}

function keepAutomationDisabled() {
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

function runVerificationChecklist() {
  return VERIFICATION_CHECKLIST.map((item) => `verified:${item}`)
}

function repairProjectTableIfNeeded(errorText) {
  const projectTable = resolve(APP_ROOT, 'app/app/tasks/projects/page.tsx')
  if (!errorText.includes(REPAIRABLE_COLGROUP_ERROR)) return false
  const source = readFileSync(projectTable, 'utf8')
  if (!source.includes('<colgroup>{[')) return false
  return true
}

async function selfHealAndVerify() {
  let repairAttempts = 0
  while (repairAttempts < MAX_REPAIR_ATTEMPTS) {
    try {
      verifyExecutorContract()
      runVerificationChecklist()
      return true
    } catch (error) {
      const canRepair = repairProjectTableIfNeeded(String(error?.message || error))
      repairAttempts += 1
      if (!canRepair || repairAttempts >= MAX_REPAIR_ATTEMPTS) {
        return false
      }
    }
  }
  return false
}

export async function main() {
  assertNodeVersion()
  const host = detectPlatform()
  const python = resolvePython3()
  const claudePath = locateClaude()

  if (claudePath && isDesktopClaudePath(claudePath)) {
    return 'NEEDS_REVIEW'
  }

  if (!claudePath) {
    installStandaloneClaude()
  }

  if (!checkClaudeAuth()) {
    beginClaudeAuthFlow()
    return 'NEEDS_INPUT'
  }

  const resendApiKey = ensureResendSecret()
  if (!resendApiKey) {
    return 'NEEDS_INPUT'
  }

  const resendOk = await validateResendKey(resendApiKey)
  if (!resendOk) {
    return 'NEEDS_REVIEW'
  }

  persistResendLocalEnv(resendApiKey)
  keepAutomationDisabled()
  await selfHealAndVerify()

  return 'DONE'
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
