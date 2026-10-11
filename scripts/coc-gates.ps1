# P10 hardening gates (docs/coc-mapping/06-ROADMAP.md "P10", Benchmarks).
#
# One command that re-runs the evidence the P10 wave claims, so a reviewer can
# reproduce every number. Nothing here is new behaviour; it only drives the
# existing gates.
#
# Usage (from anywhere):
#   pwsh scripts/coc-gates.ps1                 # fast gates + benchmarks
#   pwsh scripts/coc-gates.ps1 -Race           # + the Docker -race suite
#   pwsh scripts/coc-gates.ps1 -Contract       # + the route-manifest contract diff
#   pwsh scripts/coc-gates.ps1 -All
#
# Environment:
#   DATABASE_URL  scratch DB, e.g.
#                 postgresql://fspro:superpassword@localhost:5434/fspro_scratch
#                 (the DB-backed tests skip when it is unset)
[CmdletBinding()]
param(
    [switch]$Race,
    [switch]$Contract,
    [switch]$All,
    [int]$DeterminismRuns = 10000
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$goDir = Join-Path $repo 'apps/fs-pro-server-go'
$raceImage = 'golang:1.24-bookworm'

function Section($name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }

Section 'gofmt -l internal/ cmd/'
Push-Location $goDir
$fmt = gofmt -l internal/ cmd/
if ($fmt) { Write-Error "gofmt found unformatted files:`n$fmt" } else { Write-Host 'clean' }

Section 'go build ./...'
go build ./...
Write-Host "exit=$LASTEXITCODE"

Section 'go vet ./...'
go vet ./...
Write-Host "exit=$LASTEXITCODE"

Section "determinism harness ($DeterminismRuns runs)"
go run ./cmd/determinism-harness -runs $DeterminismRuns

Section 'go test ./internal/play ./internal/worldworker'
go test ./internal/play/... ./internal/worldworker/... -count=1
Pop-Location

Section 'sim-core determinism (200 runs byte-identical)'
Push-Location (Join-Path $repo 'crates/sim-core')
cargo test --release --test determinism determinism_harness_200_runs_byte_identical -- --nocapture
Pop-Location

Section 'grid compile + worker tick benchmarks'
Push-Location $goDir
go test ./internal/play/ -run '^$' -bench 'BenchmarkGrid' -benchmem -count=1
go test ./internal/worldworker/ -run '^$' -bench 'Benchmark' -benchmem -count=1
Pop-Location

if ($All -or $Race) {
    Section "go test -race ./... ($raceImage)"
    # TestScenarioWinRateBands shells out to a Windows sim_cli.exe; skip it in
    # the Linux container (the same 120-match bands run natively on Windows).
    docker run --rm -v "${repo}:/src" -v fspro-gomod:/go/pkg/mod -v fspro-gocache:/root/.cache/go-build `
        -w /src/apps/fs-pro-server-go $raceImage `
        sh -c "go test -race ./... -count=1 -skip 'TestScenarioWinRateBands'"
}

if ($All -or $Contract) {
    Section 'contract-check (route manifest)'
    Push-Location $repo
    npm.cmd run build --workspace @repo/api-contract
    Pop-Location
    $port = 3099
    $exe = Join-Path $env:TEMP 'fspro-p10-server.exe'
    Push-Location $goDir
    go build -o $exe ./cmd/server
    $env:ENABLE_ROUTE_MANIFEST = 'true'
    $env:PORT = "$port"
    $srv = Start-Process -FilePath $exe -PassThru -RedirectStandardOutput (Join-Path $env:TEMP 'p10srv.out') -RedirectStandardError (Join-Path $env:TEMP 'p10srv.err')
    try {
        $ready = $false
        for ($i = 0; $i -lt 40; $i++) {
            try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close(); $ready = $true; break }
            catch { Start-Sleep -Milliseconds 500 }
        }
        if (-not $ready) { throw "server did not listen on $port" }
        node contract-check/check-contract.mjs "http://localhost:$port"
    }
    finally {
        Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
        Pop-Location
    }
}

Write-Host "`nCOC GATES OK" -ForegroundColor Green
