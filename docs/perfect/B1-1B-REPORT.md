# B1-1B-REPORT — `services/world-service` Go skeleton

Agent: **1B**. Program: `FOR-AGENTS.md` (R1–R11, D4). Batch: **1B**.
Worktree: `/mnt/c/done/fs-pro/.claude/worktrees/b1b` (Windows
`C:\done\fs-pro\.claude\worktrees\b1b`), branch **`perfect/b1-1b`** (off
`perfect/integration`, HEAD `f467ea9`).

Status: **complete for the Batch 1B scope** — skeleton, health, structured
logging, pgx/v5 pool with per-call context timeouts, graceful shutdown,
deterministic 1M-club synth, Dockerfile, compose wiring, tests, race tests and
benchmarks all run. Batch 2 fills in the stubbed algorithms (R4: the stubs are
*intended* and tested to fail with `ErrNotImplemented`, so nothing half-built
can ship).

## 1. What changed

| File | Change |
| --- | --- |
| `services/world-service/go.mod` | new module `fs-pro-world-service`, `go 1.24.5`, `pgx/v5 v5.7.6` |
| `services/world-service/go.sum` | new; pinned indirect deps |
| `services/world-service/cmd/world-service/main.go` | config → slog JSON → pgx pool → HTTP server → signal-driven graceful shutdown |
| `services/world-service/cmd/world-service/main_test.go` | table test for `newLogger` levels |
| `services/world-service/internal/config/config.go` | env config, defaults, validation |
| `services/world-service/internal/config/config_test.go` | table-driven load/validate tests |
| `services/world-service/internal/db/db.go` | pgx/v5 pool + `WithTimeout` wrappers |
| `services/world-service/internal/db/db_test.go` | construction validation + timeout test |
| `services/world-service/internal/http/server.go` | net/http 1.22 routing, `GET /health`, request logging, 501 placeholders |
| `services/world-service/internal/http/server_test.go` | table-driven route/health tests |
| `services/world-service/internal/placement/placement.go` | D1 seam: country>region>city>district, invites |
| `services/world-service/internal/placement/placement_test.go` | stub test |
| `services/world-service/internal/ranking/ranking.go` | prominence seam (stored fields only) |
| `services/world-service/internal/ranking/ranking_test.go` | stub test |
| `services/world-service/internal/pyramid/pyramid.go` | pool-assignment seam |
| `services/world-service/internal/pyramid/pyramid_test.go` | stub test |
| `services/world-service/internal/tiles/tiles.go` | zoom/tile seam |
| `services/world-service/internal/tiles/tiles_test.go` | stub test |
| `services/world-service/internal/synth/generator.go` | **implemented** deterministic splitmix64 1M-club generator |
| `services/world-service/internal/synth/generator_test.go` | determinism + invariants tests, 1M benchmark |
| `deploy/world-service.Dockerfile` | new multi-stage image, follows `deploy/worldgen.Dockerfile` |
| `compose.prod.yaml` | + `world` service block, `WORLD_SERVICE_URL`, `depends_on` (additive) |
| `compose.dokploy.yaml` | + `fspro-world` service block, `WORLD_SERVICE_URL`, `depends_on` (additive) |

No file outside the 1B ownership list was touched. `git status --porcelain`
shows exactly:

```
 M compose.dokploy.yaml
 M compose.prod.yaml
?? deploy/world-service.Dockerfile
?? services/world-service/
```

## 2. Design decisions with citations (R2)

### 2.1 Routing: stdlib `net/http` 1.22 patterns, not chi

Go 1.24.5 source, `C:\Program Files\Go\src\net\http\server.go`:

- `:2469` `// Patterns can match the method, host and path of a request.`
- `:2497` `// A path can include wildcard segments of the form {NAME} or {NAME...}.`
- `:2508` `// The match for a wildcard can be obtained by calling [Request.PathValue]`

chi v5.2.1, module cache
`C:\Users\Emmanuel\go\pkg\mod\github.com\go-chi\chi\v5@v5.2.1\README.md`:

- `:31` `* **Designed for modular/composable APIs** - middlewares, inline middlewares, route groups and sub-router mounting`
- `:36` `* **No external dependencies** - plain ol' Go stdlib + net/http`

Decision: the service has one real route plus four future groups and needs
nothing from chi that the stdlib does not already give (method + `{wildcard}`).
Route groups/sub-routers (`:31`) and the middleware stack are what chi adds;
`net/http` already covers what we use, and the sibling services
(`services/sim-service/server/server.go:41-45`,
`services/worldgen/server/server.go:41-45`) use the same stdlib patterns, so
this keeps the repo consistent and dependency-free. If Batch 2/3 grows a large
route tree and shared middleware, this can be revisited — recorded as a
deliberate trade-off, not an omission.

### 2.2 DB driver: pgx/v5 `pgxpool`

pgx v5.7.6, module cache
`C:\Users\Emmanuel\go\pkg\mod\github.com\jackc\pgx\v5@v5.7.6`:

- `pgxpool/doc.go:1` `// Package pgxpool is a concurrency-safe connection pool for pgx.`
- `pgxpool/pool.go:203` `// New creates a new Pool. See [ParseConfig] for information on connString format.`

`pgxpool.New` parses the URL and builds the puddle pool without dialing, so the
service can boot before Postgres and report status through `/health` (used in
the smoke test below). Every query method on `internal/db.Pool` wraps the call
in `context.WithTimeout(ctx, p.DBTimeout)` (`internal/db/db.go`), satisfying
"context timeout on every DB call".

### 2.3 pgx version pin

`pgx/v5 v5.11.0` (the newest in the module cache) declares `go 1.25.0` in its
`go.mod`; R3 fixes the backend at Go 1.24. Pinned **`v5.7.6`**, whose `go.mod`
declares `go 1.23.0` (verified with
`grep -E "^go " .../pgx/v5@v5.7.6/go.mod`). `GOTOOLCHAIN=local` is used for
every command so the 1.24.5 toolchain never auto-upgrades.

## 3. Commands and output (R4)

Working directory for every command:
`/mnt/c/done/fs-pro/.claude/worktrees/b1b/services/world-service` unless noted.
`go` is `/mnt/c/Program Files/Go/bin/go.exe` via WSL interop (BASELINE.md §0).

### 3.1 Toolchain

```
$ "C:\Program Files\Go\bin\go.exe" version
go version go1.24.5 windows/amd64

$ docker run --rm golang:1.24-bookworm go version
go version go1.24.13 linux/amd64
```

### 3.2 `go mod tidy` (GOTOOLCHAIN=local)

```
$ GOTOOLCHAIN=local go mod tidy
TIDY_EXIT=0
```

`go.mod` after tidy:

```
module fs-pro-world-service

go 1.24.5

require github.com/jackc/pgx/v5 v5.7.6

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.37.0 // indirect
	golang.org/x/sync v0.13.0 // indirect
	golang.org/x/text v0.24.0 // indirect
)
```

### 3.3 `gofmt` + `go vet` (Windows)

```
$ gofmt -l .
GOFMT_CLEAN

$ GOTOOLCHAIN=local go vet ./...
VET_EXIT=0
```

### 3.4 `go test ./...` (Windows, fresh)

```
$ GOTOOLCHAIN=local go test -count=1 ./...
ok  	fs-pro-world-service/cmd/world-service	0.946s
ok  	fs-pro-world-service/internal/config	0.691s
ok  	fs-pro-world-service/internal/db	1.406s
ok  	fs-pro-world-service/internal/http	1.121s
ok  	fs-pro-world-service/internal/placement	0.681s
ok  	fs-pro-world-service/internal/pyramid	0.693s
ok  	fs-pro-world-service/internal/ranking	0.680s
ok  	fs-pro-world-service/internal/synth	0.722s
ok  	fs-pro-world-service/internal/tiles	0.685s
EXIT=0
```

### 3.5 `go test ./...` + `go vet ./...` inside `golang:1.24-bookworm`

Exact command (also used for race, §3.6):

```
docker run --rm -v /mnt/c/done/fs-pro/.claude/worktrees/b1b/services/world-service:/w -w /w golang:1.24-bookworm <cmd>
```

```
$ docker run --rm -v <abs>:/w -w /w golang:1.24-bookworm sh -c 'go vet ./... && echo VET_OK && go test ./... && echo TEST_OK'
VET_OK
ok  	fs-pro-world-service/cmd/world-service	0.010s
ok  	fs-pro-world-service/internal/config	0.006s
ok  	fs-pro-world-service/internal/db	0.060s
ok  	fs-pro-world-service/internal/http	0.010s
ok  	fs-pro-world-service/internal/placement	0.006s
ok  	fs-pro-world-service/internal/pyramid	0.006s
ok  	fs-pro-world-service/internal/ranking	0.009s
ok  	fs-pro-world-service/internal/synth	0.071s
ok  	fs-pro-world-service/internal/tiles	0.006s
TEST_OK
EXIT=0
```

### 3.6 `go test -race ./...` inside Docker (Q7)

Exact, reproducible command:

```
docker run --rm -v /mnt/c/done/fs-pro/.claude/worktrees/b1b/services/world-service:/w -w /w golang:1.24-bookworm go test -race ./...
```

```
$ docker run --rm -v <abs>:/w -w /w golang:1.24-bookworm go test -race ./...
ok  	fs-pro-world-service/cmd/world-service	1.029s
ok  	fs-pro-world-service/internal/config	1.029s
ok  	fs-pro-world-service/internal/db	1.084s
ok  	fs-pro-world-service/internal/http	1.038s
ok  	fs-pro-world-service/internal/placement	1.028s
ok  	fs-pro-world-service/internal/pyramid	1.028s
ok  	fs-pro-world-service/internal/ranking	1.028s
ok  	fs-pro-world-service/internal/synth	1.395s
ok  	fs-pro-world-service/internal/tiles	1.028s
RACE_EXIT=0
```

### 3.7 Synth benchmark, 1M clubs

Windows (`go test -bench . -benchmem`, `./internal/synth`):

```
goos: windows
goarch: amd64
pkg: fs-pro-world-service/internal/synth
cpu: 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz
BenchmarkGenerate1M-16    	      54	  22257391 ns/op	48005234 B/op	       2 allocs/op
PASS
ok  	fs-pro-world-service/internal/synth	2.617s
```

Linux/Docker (same sources):

```
goos: linux
goarch: amd64
pkg: fs-pro-world-service/internal/synth
cpu: 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz
BenchmarkGenerate1M-16    	      42	  25680987 ns/op	48005248 B/op	       2 allocs/op
PASS
ok  	fs-pro-world-service/internal/synth	1.817s
```

**Recorded numbers:** 1,000,000 clubs in **22.3 ms/op** (Windows native) /
**25.7 ms/op** (Docker Linux), **~48.0 MB/op**, **2 allocs/op**. This is the
D5 synthetic-data generation cost, not a placement/ranking benchmark (those are
Batch 2/3).

### 3.8 Dockerfile build

```
$ docker build -f deploy/world-service.Dockerfile -t fs-pro-world-service:test .
#11 [service 4/4] RUN CGO_ENABLED=0 go build -o /out/world-service ./cmd/world-service
#11 DONE 15.8s
#14 exporting to image
#14 writing image sha256:717de77da0f75001f563cd4eb0af0998159cb4abbd90e7d849f6b08313c5129a done
BUILD_EXIT=0
```

### 3.9 Runtime smoke: /health, structured logs, graceful shutdown

```
$ docker run -d --name fspro-world-smoke -p 3006:3006 \
    -e DATABASE_URL='postgres://u:p@127.0.0.1:1/nope' fs-pro-world-service:test
$ curl -s -w '\nHTTP %{http_code}\n' http://127.0.0.1:3006/health
{"status":"degraded","service":"fs-pro-world-service","version":"dev","database":"down","uptimeSeconds":2.05,"time":"2026-10-07T06:22:34Z"}

HTTP 503
```

Container logs (structured JSON via `log/slog`):

```
{"time":"...","level":"INFO","msg":"listening","service":"fs-pro-world-service","addr":"0.0.0.0:3006","version":"dev"}
{"time":"...","level":"WARN","msg":"health: database ping failed","err":"...connection refused"}
{"time":"...","level":"INFO","msg":"http request","method":"GET","path":"/health","status":503,"duration_ms":1}
```

Graceful shutdown on `docker stop` (SIGTERM):

```
{"time":"...","level":"INFO","msg":"shutdown signal received"}
{"time":"...","level":"INFO","msg":"stopped"}
```

### 3.10 Compose validation

```
$ docker compose -f compose.prod.yaml --env-file /tmp/opencode/compose-test.env config
prod exit=0
64:      world:
93:      WORLD_SERVICE_URL: http://world:3006
136:  world:

$ docker compose -f compose.dokploy.yaml --env-file /tmp/opencode/compose-test.env config
dokploy exit=0
23:      fspro-world:
55:      WORLD_SERVICE_URL: http://fspro-world:3006
105:  fspro-world:
```

## 4. Acceptance criteria

| Criterion (from the brief) | Evidence | Result |
| --- | --- | --- |
| New module `services/world-service` (e.g. `fs-pro-world-service`) | `go.mod:1`; §3.2 | PASS |
| Go 1.24 | `go.mod` `go 1.24.5`; toolchain 1.24.5/1.24.13 §3.1 | PASS (R3) |
| `cmd/world-service/main.go` | file exists; builds §3.8 | PASS |
| `internal/{config,db,http,placement,ranking,pyramid,tiles,synth}` | file tree §1 | PASS |
| `internal/db` pgx/v5 pool | `internal/db/db.go`; §2.2; build §3.8 | PASS |
| `internal/http` routing justified vs chi (R2) | §2.1 quotes | PASS |
| `GET /health` | §3.4 http tests; §3.9 live 503 + JSON | PASS |
| Structured `log/slog` logging | `main.go` JSON handler; §3.9 logs | PASS |
| Context timeout on every DB call | `internal/db.Pool.{Ping,Query,QueryRow,Exec}` wrap `WithTimeout`; `TestWithTimeout` §3.4 | PASS |
| Graceful shutdown | `main.go` signal.NotifyContext + `Shutdown`; §3.9 logs | PASS |
| Deterministic 1M-club synth, fixed seed | `internal/synth`; `TestGenerateIsDeterministic` (same seed equal, different seed differs); `TestGeneratePrefixIsStable` | PASS |
| Table-driven tests for config/health/synth | `config_test.go`, `server_test.go`, `generator_test.go` | PASS |
| `go test ./...` | §3.4, §3.5 | PASS |
| `go test -race ./...` in Docker | §3.6, exit 0 | PASS |
| Benchmark 1M clubs + numbers | §3.7 | PASS (22.3/25.7 ms, ~48 MB, 2 allocs) |
| Dockerfile following `deploy/sim.Dockerfile` patterns | `deploy/world-service.Dockerfile`; builds §3.8 | PASS |
| Add to `compose.prod.yaml` | additive block + env + depends_on; §3.10 | PASS |
| Add to `compose.dokploy.yaml` | additive block + env + depends_on; §3.10 | PASS |
| R11: only owned files | `git status` §1 | PASS |

## 5. Gaps and known limitations (for Batch 2/3, not defects)

1. `placement`, `ranking`, `pyramid`, `tiles` are **seams**: exported types +
   `ErrNotImplemented` + 501 routes. They intentionally contain no algorithm;
   `docs/perfect/WORLD-HIERARCHY-SPEC.md` (Agent 1A, owner gate) defines those.
   Each has a test asserting it is unimplemented.
2. The placeholder route paths (`POST /placement/found`,
   `GET /places/{id}/children`, `GET /ranking/prominence`,
   `POST /pyramid/pools`, `GET /tiles/{z}/{x}/{y}`) are a reasonable shape but
   **not** a contract. Batch 2/3 must reconcile them with the approved spec and
   add zod schemas in `packages/api-contract` (R6). If the spec picks different
   paths, the stubs are cheap to rename.
3. `internal/ranking.Prominence` weights are deliberately absent (R1: no
   guessing). Batch 2 implements from the spec.
4. `synth` spreads clubs round-robin over all districts rather than modelling
   fill order — it is benchmark input, not a placement simulation.
5. `Depends on`: the compose `world` service depends on `db` healthy; the Node
   `server` now depends on `world` started. No Node HTTP client is wired yet —
   that is Batch 2A/2C (`services/world/club-founding.service.ts`). The
   `WORLD_SERVICE_URL` env is pre-plumbed.
6. `.env.production.example` was **not** edited (not in the 1B ownership list).
   `WORLD_SERVICE_URL` has a compose default, so no new required variable.

## 6. Open questions

None blocking. The one decision that needed a citation (pgx version vs R3) is
resolved in §2.3: pin `pgx/v5 v5.7.6` until the repo moves to Go 1.25.

## 7. Reproduce everything

```
cd /mnt/c/done/fs-pro/.claude/worktrees/b1b/services/world-service
export GOTOOLCHAIN=local
"/mnt/c/Program Files/Go/bin/go.exe" mod tidy
"/mnt/c/Program Files/Go/bin/go.exe" test -count=1 ./...
"/mnt/c/Program Files/Go/bin/go.exe" test -run '^$' -bench . -benchmem ./internal/synth

docker run --rm -v /mnt/c/done/fs-pro/.claude/worktrees/b1b/services/world-service:/w -w /w golang:1.24-bookworm go test -race ./...
```
