# BASELINE.md — phase 2, Batch 0A

Branch: `p2/integration` (from `perfect/integration` @ `1cfd57a`). Date
2026-10-07. Commands run through Windows Node / WSL-interop Go, as in phase 1
(`docs/perfect/PROGRESS.md` §Environment). Failures are recorded, not fixed.

## Results

| Suite | Command | Result |
| --- | --- | --- |
| Server tsc | `npx tsc --noEmit` (apps/fs-pro-server) | **PASS** (0 errors) |
| Server vitest | `npx vitest run` | **PASS — 97/97** (8 files) |
| Go `services/world-service` | `go test ./...` | **PASS** (all packages ok) |
| Go `services/worldgen` | `go test ./...` | **PASS** (`server` ok; others no tests) |
| Go `apps/fs-pro-realtime` | `go test ./...` | **PASS** |
| Go `services/sim-service` | `go test ./...` | **PASS** (engine/server ok) |
| Client build | `npm run build` (apps/fs-pro-client) | **PASS** (`✓ built in 12.80s`) |
| Client `vue-tsc` | vue-tsc@2.0.29 in a scratch folder | **FAIL — 31 pre-existing errors** (unchanged; `docs/perfect/vue-tsc-baseline.log`) |
| Rust `cargo test` / `sim-lab` | — | not re-run this batch (phase-1 PASS, `BASELINE.md` §3) |
| Playwright core flow | — | not re-run (needs the dev stack; phase-1 1C report) |

## Notes

- The server suite grew from phase 1's 92 to **97** tests (the phase-1 Sentry
  tests, `test/error-tracking.test.ts`, plus tests added with the "starting
  cultures" commit `1cfd57a`).
- The client `vue-tsc` baseline is still **31 errors**; phase 2 must not add
  any (R4). The repo's `npx vue-tsc` is broken; use vue-tsc@2.0.29 +
  typescript@5.4.5 in a scratch folder.
- `go test -race` runs in `golang:1.24-bookworm` Docker (phase-1 Q7), not run
  here.

## Repro (exact)

```
# server
cd apps/fs-pro-server && npx tsc --noEmit && npx vitest run
# go modules
for m in services/world-service services/worldgen apps/fs-pro-realtime services/sim-service; do (cd $m && GOTOOLCHAIN=local "/mnt/c/Program Files/Go/bin/go.exe" test ./...); done
# client
cd apps/fs-pro-client && npm run build
```
