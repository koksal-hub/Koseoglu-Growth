# Validate Foundation PowerShell script
# Runs install, lint, typecheck, test, build and docker checks in order and writes a summary.
# Intended to be run on developer machine where Node/pnpm/git/docker are available.

param(
  [string]$ReportDir = "reports/daily",
  [switch]$SkipDocker
)

function ExitWith($code, $message) {
  Write-Host $message -ForegroundColor Red
  exit $code
}

function CheckCommand($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  return $null -ne $cmd
}

# Basic env checks
$requirements = @('node','pnpm','git','docker')
$missing = @()
foreach ($r in $requirements) {
  if (-not (CheckCommand $r)) { $missing += $r }
}

if ($missing.Count -gt 0) {
  Write-Host "Eksik araçlar: $($missing -join ', ')" -ForegroundColor Yellow
  Write-Host "Bu betik otomatik olarak Node/pnpm/git/docker kurmaz. Lütfen eksikleri giderin veya bu betiği araçların kurulu olduğu bir ortamda çalıştırın." -ForegroundColor Yellow
  Exit 2
}

# create report file
$ts = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
if (-not (Test-Path $ReportDir)) { New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null }
$reportPath = Join-Path $ReportDir "foundation-validation-$ts.txt"
"Foundation validation run: $ts`n" | Out-File -FilePath $reportPath -Encoding utf8

function RunStep($name, $cmd, $args) {
  "====================" | Out-File -FilePath $reportPath -Append
  "Step: $name" | Out-File -FilePath $reportPath -Append
  Write-Host "Running: $name" -ForegroundColor Cyan
  $start = Get-Date
  try {
    $proc = Start-Process -FilePath $cmd -ArgumentList $args -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$reportPath.stdout" -RedirectStandardError "$reportPath.stderr"
    $exit = $proc.ExitCode
  } catch {
    $exit = 1
    "Exception while running $name: $_" | Out-File -FilePath $reportPath -Append
  }
  $end = Get-Date
  "Start: $start`nEnd: $end`nExitCode: $exit`n" | Out-File -FilePath $reportPath -Append
  # append captured stdout/stderr
  if (Test-Path "$pwd\$reportPath.stdout") { Get-Content "$pwd\$reportPath.stdout" | Out-File -FilePath $reportPath -Append }
  if (Test-Path "$pwd\$reportPath.stderr") { Get-Content "$pwd\$reportPath.stderr" | Out-File -FilePath $reportPath -Append }
  Remove-Item -Force "$pwd\$reportPath.stdout" -ErrorAction SilentlyContinue
  Remove-Item -Force "$pwd\$reportPath.stderr" -ErrorAction SilentlyContinue
  return $exit
}

# Steps to execute
$results = @{}

# pnpm install
$code = RunStep 'pnpm install' 'pnpm' 'install'
$results['pnpm install'] = $code
if ($code -ne 0) { Write-Host "pnpm install failed with exit code $code" -ForegroundColor Red; "pnpm install failed with exit code $code" | Out-File -FilePath $reportPath -Append; exit 3 }

# pnpm lint
$code = RunStep 'pnpm lint' 'pnpm' 'lint'
$results['pnpm lint'] = $code
if ($code -ne 0) { Write-Host "Lint failed with exit code $code" -ForegroundColor Red; "Lint failed" | Out-File -FilePath $reportPath -Append; exit 4 }

# pnpm typecheck
$code = RunStep 'pnpm typecheck' 'pnpm' 'typecheck'
$results['pnpm typecheck'] = $code
if ($code -ne 0) { Write-Host "Typecheck failed with exit code $code" -ForegroundColor Red; "Typecheck failed" | Out-File -FilePath $reportPath -Append; exit 5 }

# pnpm test
$code = RunStep 'pnpm test' 'pnpm' 'test'
$results['pnpm test'] = $code
if ($code -ne 0) { Write-Host "Tests failed with exit code $code" -ForegroundColor Red; "Tests failed" | Out-File -FilePath $reportPath -Append; exit 6 }

# pnpm build
$code = RunStep 'pnpm build' 'pnpm' 'build'
$results['pnpm build'] = $code
if ($code -ne 0) { Write-Host "Build failed with exit code $code" -ForegroundColor Red; "Build failed" | Out-File -FilePath $reportPath -Append; exit 7 }

if (-not $SkipDocker) {
  # docker compose up
  $code = RunStep 'docker compose up -d' 'docker' 'compose -f "docker\docker-compose.yml" up -d'
  $results['docker compose up'] = $code
  if ($code -ne 0) { Write-Host "Docker compose up failed with exit code $code" -ForegroundColor Yellow; "Docker compose up failed" | Out-File -FilePath $reportPath -Append }
  else {
    # check container health for service 'db'
    Start-Sleep -Seconds 3
    try {
      $ps = docker ps --filter name=db --format "{{.ID}} {{.Names}}"
      "$ps`n" | Out-File -FilePath $reportPath -Append
      $inspect = docker inspect --format '{{json .State.Health}}' $(docker ps --filter name=db -q) 2>$null
      if ($inspect) { "DB Health: $inspect" | Out-File -FilePath $reportPath -Append }
    } catch {
      "Could not inspect docker container health: $_" | Out-File -FilePath $reportPath -Append
    }
  }
}

# Summary
"`n==== SUMMARY ====" | Out-File -FilePath $reportPath -Append
foreach ($k in $results.Keys) { "$k => $($results[$k])" | Out-File -FilePath $reportPath -Append }

Write-Host "Validation finished. Report written to $reportPath" -ForegroundColor Green
