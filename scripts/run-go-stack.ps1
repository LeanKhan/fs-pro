# run-go-stack.ps1 - start the Go-only stack for local testing (no Node).
#
# Starts, in order:
#   worldgen (:3004)        services/worldgen      names + faces
#   world-service (:3016)   services/world-service tiles/placement
#   realtime (:3005)        apps/fs-pro-realtime   WS gateway
#   sim-service (:5050)     services/sim-service   Rust sim-core behind HTTP
#   fs-pro-server (:3000)   apps/fs-pro-server-go  the API
#   fs-pro-client (:5173)   Vue/Vite dev server    the browser app
#
# DATABASE_URL is read from apps/fs-pro-server/.env (expected: fspro_dev - the
# CoC schema). REALTIME_SECRET is set identically on the API and the gateway, so
# the signed ticket verifies (this is the mismatch that breaks chat).
#
#   powershell -ExecutionPolicy Bypass -File scripts/run-go-stack.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/run-go-stack.ps1 -Stop
#
# Logs: .playtest-runtime/logs/go-stack/<name>.out|.err
[CmdletBinding()]
param(
    [switch]$Stop,
    [switch]$SkipBuild,
    [switch]$SkipClient,
    [int]$ApiPort = 3000,
    [int]$WorldgenPort = 3004,
    [int]$RealtimePort = 3005,
    [int]$WorldServicePort = 3016,
    [int]$SimPort = 5050,
    [int]$ClientPort = 5173,    [string]$RealtimeSecret = 'fs-pro-dev-realtime-secret'
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $repo '.playtest-runtime'
$goDir = Join-Path $repo 'apps/fs-pro-server-go'
$serverEnv = Join-Path $repo 'apps/fs-pro-server/.env'
$logDir = Join-Path $runtime 'logs/go-stack'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$ports = @($ApiPort, $WorldgenPort, $RealtimePort, $WorldServicePort, $SimPort, $ClientPort)

function Stop-Port([int]$port) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) { & taskkill /PID $c.OwningProcess /T /F 2>&1 | Out-Null }
}

if ($Stop) {
    foreach ($p in $ports) { Stop-Port $p }
    Write-Host "stopped go-stack ports: $($ports -join ', ')" -ForegroundColor Green
    return
}

# --- DATABASE_URL from the server .env ------------------------------------
$dbLine = (Select-String -Path $serverEnv -Pattern '^DATABASE_URL=' -ErrorAction SilentlyContinue | Select-Object -First 1).Line
if (-not $dbLine) { throw "DATABASE_URL not found in $serverEnv" }
$databaseUrl = ($dbLine -replace '^DATABASE_URL=', '' -replace '"', '').Trim()
$dbName = ([Uri]$databaseUrl).AbsolutePath.TrimStart('/')
if ($dbName -ne 'fspro_dev') {
    Write-Warning "DATABASE_URL points at '$dbName', not 'fspro_dev'. The CoC schema may be missing there."
}

# --- required binaries ----------------------------------------------------
$exes = @{
    worldgen      = Join-Path $runtime 'worldgen.exe'
    'world-service' = Join-Path $runtime 'world-service.exe'
    realtime      = Join-Path $runtime 'realtime.exe'
    'sim-service' = Join-Path $runtime 'fs-pro-sim-service.exe'
}
foreach ($k in $exes.Keys) {
    if (-not (Test-Path $exes[$k])) {
        throw "missing $k at $($exes[$k]). Build the Go services first: run .playtest-runtime\build-go.bat"
    }
}

# --- free the ports -------------------------------------------------------
foreach ($p in $ports) { Stop-Port $p }
Start-Sleep -Milliseconds 500

# --- build ----------------------------------------------------------------
$apiExe = Join-Path $runtime 'fspro-server.exe'
if (-not $SkipBuild) {
    Write-Host "building @repo/api-contract + fs-pro-server ..." -ForegroundColor Cyan
    & npm.cmd run build --workspace @repo/api-contract | Out-Null
    Push-Location $goDir
    & go build -o $apiExe ./cmd/server
    $goExit = $LASTEXITCODE
    Pop-Location
    if ($goExit -ne 0 -or -not (Test-Path $apiExe)) { throw "go build ./cmd/server failed" }
}

function Start-Svc([string]$name, [string]$exe, [hashtable]$env) {
    foreach ($k in $env.Keys) { Set-Item -Path "env:$k" -Value $env[$k] }
    $p = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "$name.out") `
        -RedirectStandardError (Join-Path $logDir "$name.err")
    Write-Host ("  {0,-14} pid {1}" -f $name, $p.Id)
}

function Wait-Http([string]$url, [string]$name) {
    for ($i = 0; $i -lt 60; $i++) {
        try { Invoke-WebRequest $url -TimeoutSec 2 -UseBasicParsing | Out-Null; Write-Host "  $name ok ($url)" -ForegroundColor Green; return $true }
        catch { Start-Sleep -Milliseconds 400 }
    }
    Write-Warning "  $name did not answer at $url - see $logDir\$name.*"
    return $false
}

Write-Host "starting services ..." -ForegroundColor Cyan
Start-Svc 'worldgen' $exes['worldgen'] @{ WORLDGEN_SERVICE_HOST = '127.0.0.1'; WORLDGEN_SERVICE_PORT = "$WorldgenPort" }
Start-Svc 'world-service' $exes['world-service'] @{ DATABASE_URL = $databaseUrl; WORLD_SERVICE_HOST = '127.0.0.1'; WORLD_SERVICE_PORT = "$WorldServicePort"; LOG_LEVEL = 'info' }
Start-Svc 'realtime' $exes['realtime'] @{ REALTIME_PORT = "$RealtimePort"; REALTIME_SECRET = $RealtimeSecret; REALTIME_ORIGINS = 'localhost:*,127.0.0.1:*' }
Start-Svc 'sim-service' $exes['sim-service'] @{ PORT = "$SimPort"; SIM_SERVICE_HOST = '127.0.0.1'; SIM_CORE_DLL_PATH = (Join-Path $runtime 'sim_core.dll') }
Start-Svc 'fs-pro-server' $apiExe @{
    DATABASE_URL          = $databaseUrl
    PORT                  = "$ApiPort"
    NODE_ENV              = 'dev'
    COOKIE_SECURE         = 'false'
    REALTIME_URL          = "http://localhost:$RealtimePort"
    REALTIME_SECRET       = $RealtimeSecret
    WORLD_SERVICE_URL     = "http://localhost:$WorldServicePort"
    WORLDGEN_SERVICE_URL  = "http://localhost:$WorldgenPort"
}

Write-Host "waiting for health ..." -ForegroundColor Cyan
Wait-Http "http://127.0.0.1:$ApiPort/healthz" 'api' | Out-Null
Wait-Http "http://127.0.0.1:$RealtimePort/healthz" 'realtime' | Out-Null
Wait-Http "http://127.0.0.1:$WorldgenPort/health" 'worldgen' | Out-Null

if (-not $SkipClient) {
    Write-Host "starting client (vite dev) ..." -ForegroundColor Cyan
    $cp = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev', '--workspace', 'fs-pro-client', '--', '--port', "$ClientPort", '--strictPort' `
        -WorkingDirectory $repo -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir 'client.out') `
        -RedirectStandardError (Join-Path $logDir 'client.err')
    Write-Host ("  {0,-14} pid {1}" -f 'client', $cp.Id)
    Wait-Http "http://127.0.0.1:$ClientPort/" 'client' | Out-Null
}

Write-Host ""
Write-Host "go stack up (DB: $dbName) - no Node involved." -ForegroundColor Green
Write-Host "  app        http://localhost:$ClientPort"
Write-Host "  api        http://localhost:$ApiPort"
Write-Host "  realtime   ws://localhost:$RealtimePort"
Write-Host "  logs       $logDir"
Write-Host "  stop       powershell -ExecutionPolicy Bypass -File scripts/run-go-stack.ps1 -Stop"
Write-Host ""
Write-Host "Sign in with your existing fspro username/password."
