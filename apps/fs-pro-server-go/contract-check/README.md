# Contract conformance harness

Pass 1 of the conformance test design in `docs/perfect/backend-go/PLAN.md` §7:
compare the Go server's route table with the compiled `@repo/api-contract`.

## One-command gate (route coverage)

`route-coverage-gate.mjs` builds the contract, builds and starts the Go server
(no database needed) and runs Pass 1 against it — all in one command:

```powershell
# from the repo root; cross-platform
node apps/fs-pro-server-go/contract-check/route-coverage-gate.mjs
```

It exits `0` only when every contract route is served by Go. Flags:
`--skip-contract-build`, `--skip-go-build` (+ `GATE_SERVER_BIN`), `--port <n>`.
See `docs/go-server-rewrite/04-CUTOVER-READINESS.md` §1 for the recorded PASS
and the cutover runbook.

## Pass 1 — route manifest diff (DB-free)

1. Build the contract:

   ```powershell
   npm run build --workspace @repo/api-contract
   ```

2. Start the Go server with the manifest enabled:

   ```powershell
   cd apps/fs-pro-server-go
   $env:ENABLE_ROUTE_MANIFEST = "true"
   go run ./cmd/server
   ```

3. In another shell, diff the manifest:

   ```powershell
   node contract-check/check-contract.mjs http://localhost:3000
   ```

   It exits `0` on no diffs, `1` on any mismatch, `2` when the contract or the
   server is unavailable. All 32 contract domains are checked (every route falls
   under a checked prefix; a future domain with no prefix fails the run rather
   than being skipped). The non-contract `/healthz`, `/`, `/metrics` and
   `/__routes` manifest entries are ignored.

## Pass 2 — live zod response validation (needs a database)

Validates live responses against the compiled contract's `responses[status]`
zod schemas:

```powershell
$env:LIVE_IDS = '{"user":"<id>","club":"<id>","fixture":"<id>","season":"<id>","place":"<id>"}'
node contract-check/validate-live.mjs http://localhost:3000
```

It runs one read per domain (fixtures, calendar, seasons, places, awards, users,
clubs, managers, players, facilities, play). Seeded-data cases that Node also
fails are reported as `WARN` (issued contract/data drift): nullable
`AttackingClass`/`DefensiveClass`, NULL `FixtureCode`, and `Award.Type='club'`.
