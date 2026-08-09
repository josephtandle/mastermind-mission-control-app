$ErrorActionPreference = 'Stop'

Write-Host 'Installing Mission Control...'

foreach ($Command in @('node', 'npm')) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "$Command is required and was not found on PATH."
  }
}

$PythonCommand = $null
$PythonPrefixArgs = @()
foreach ($Candidate in @(
  @{ Command = 'python'; PrefixArgs = @() },
  @{ Command = 'python3'; PrefixArgs = @() },
  @{ Command = 'py'; PrefixArgs = @('-3') }
)) {
  if (-not (Get-Command $Candidate.Command -ErrorAction SilentlyContinue)) {
    continue
  }
  $ProbeArgs = @($Candidate.PrefixArgs) + @(
    '-c',
    'import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)'
  )
  & $Candidate.Command @ProbeArgs
  if ($LASTEXITCODE -eq 0) {
    $PythonCommand = $Candidate.Command
    $PythonPrefixArgs = @($Candidate.PrefixArgs)
    break
  }
}
if (-not $PythonCommand) {
  throw 'Python 3 is required and was not found as python, python3, or py on PATH.'
}
& $PythonCommand @PythonPrefixArgs --version

Write-Host 'Installing dependencies...'
npm install --no-audit --no-fund

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeCommand = Get-Command claude -ErrorAction SilentlyContinue
$ClaudePath = if ($ClaudeCommand) { $ClaudeCommand.Source } else { '' }

if ($ClaudePath -match 'Claude\.app' -or $ClaudePath -match 'claude-code[\\/][^\\/]+[\\/]claude\.app') {
  Write-Host "Ignoring Claude Desktop internal binary: $ClaudePath"
  $ClaudePath = ''
}

if (-not $ClaudePath) {
  Write-Host 'Installing standalone Claude Code CLI...'
  npm install -g @anthropic-ai/claude-code
  $ClaudeCommand = Get-Command claude -ErrorAction SilentlyContinue
  $ClaudePath = if ($ClaudeCommand) { $ClaudeCommand.Source } else { '' }
}

if ($ClaudePath -match 'Claude\.app' -or $ClaudePath -match 'claude-code[\\/][^\\/]+[\\/]claude\.app') {
  throw "PATH still resolves to a Claude Desktop internal binary: $ClaudePath. Install the standalone CLI in a PATH location that takes precedence, then rerun."
}

if (-not $ClaudePath) {
  throw 'Standalone Claude Code CLI was not found on PATH after installation.'
}

claude --version

$AuthJson = claude auth status 2>$null
$LoggedIn = $false
try {
  $LoggedIn = ($AuthJson | ConvertFrom-Json).loggedIn -eq $true
} catch {
  $LoggedIn = $false
}

if (-not $LoggedIn) {
  $AuthLog = Join-Path $env:TEMP 'claude-auth-login.log'
  $LoginCommand = "claude auth login --claudeai > `"$AuthLog`" 2>&1"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $LoginCommand -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Host ''
  Write-Host 'A browser tab should have opened asking you to sign in to Claude and authorize this device.'
  if (Test-Path $AuthLog) {
    $AuthorizeUrl = Select-String -Path $AuthLog -Pattern 'https://claude\.com/\S+' | Select-Object -First 1
    if ($AuthorizeUrl) {
      Write-Host "If it did not open, use this link: $($AuthorizeUrl.Matches[0].Value)"
    } else {
      Write-Host "If it did not open, read the authorization link from: $AuthLog"
    }
  }
  Write-Host 'Please complete that now, then run this installer again.'
  exit 2
}

$ExecutorPath = Join-Path $ScriptDir 'executor.py'
if (-not (Select-String -Path $ExecutorPath -SimpleMatch '["claude", "--dangerously-skip-permissions"' -Quiet)) {
  throw 'executor.py must invoke the bare string "claude" through PATH.'
}

Write-Host 'Standalone Claude Code CLI is installed and authenticated.'
Write-Host 'executor.py uses PATH resolution and will survive CLI version updates.'
$PythonDisplay = (@($PythonCommand) + $PythonPrefixArgs) -join ' '
Write-Host "Python 3 is available through: $PythonDisplay"
Write-Host ''
Write-Host 'Install complete.'
Write-Host 'Start the board with: npm run dev'
Write-Host 'Then open: http://localhost:3001'
Write-Host 'The hourly auto-executor remains off by default.'
