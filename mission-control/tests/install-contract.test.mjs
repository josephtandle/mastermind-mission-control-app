import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('projects table renders col elements through a JSX expression', () => {
  const source = read('../app/app/tasks/projects/page.tsx')
  const colgroup = source.match(/<colgroup>[\s\S]*?<\/colgroup>/)?.[0]

  assert.ok(colgroup, 'projects table must include a colgroup')
  assert.match(colgroup, /^<colgroup>\{\[/)
  assert.match(colgroup, /\]\}<\/colgroup>$/)
  assert.doesNotMatch(colgroup, /\{\/\*/)
})

test('POSIX installer bootstraps only a standalone authenticated Claude CLI', () => {
  const installer = read('../install.sh')
  const executor = read('../executor.py')

  assert.match(installer, /npm install -g @anthropic-ai\/claude-code/)
  assert.match(installer, /claude auth status/)
  assert.match(installer, /nohup claude auth login --claudeai/)
  assert.match(installer, /Claude\.app|claude-code/)
  assert.doesNotMatch(installer, /sed .*executor\.py/)
  assert.match(executor, /\["claude", "--dangerously-skip-permissions", "--model", model, "-p", prompt\]/)
})

test('native Windows installer applies the same standalone CLI and auth gate', () => {
  const installer = read('../install.ps1')

  assert.match(installer, /npm install -g @anthropic-ai\/claude-code/)
  assert.match(installer, /claude auth status/)
  assert.match(installer, /Claude\.app|claude-code/)
  assert.match(installer, /Start-Process/)
  assert.match(installer, /auth.*login.*--claudeai/s)
  assert.match(installer, /Command = 'python'/)
  assert.match(installer, /Command = 'python3'/)
  assert.match(installer, /Command = 'py'; PrefixArgs = @\('-3'\)/)
  assert.match(installer, /sys\.version_info\.major == 3/)
})

test('task executor routes resolve Python 3 cross-platform and preserve PATH', () => {
  const resolver = read('../lib/python-command.ts')
  const taskExecutorRoute = read('../app/api/task-executor/route.ts')
  const cardExecutorRoute = read('../app/api/tasks/[cardId]/execute/route.ts')

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
  const rootReadme = read('../../README.md')
  const appReadme = read('../README.md')

  for (const readme of [rootReadme, appReadme]) {
    assert.match(readme, /install\.sh/)
    assert.match(readme, /install\.ps1/)
    assert.match(readme, /browser/i)
    assert.match(readme, /run the same installer again/i)
    assert.match(readme, /hourly auto-executor is off by default|hourly executor remains off by default/i)
  }

  assert.doesNotMatch(appReadme, /schedules the hourly task executor/)
})
