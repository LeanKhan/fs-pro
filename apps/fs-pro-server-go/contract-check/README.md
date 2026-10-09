# Contract conformance harness

Pass 1 of the conformance test design in `docs/perfect/backend-go/PLAN.md` §7:
compare the Go server's route table with the compiled `@repo/api-contract`.

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
   server is unavailable. Only implemented domains are checked
   (`meta`, `users`, `clubs`, `players`, `managers`, `fixtures`, `calendar`,
   `seasons`, `awards`, `places`); the non-contract `/healthz`, `/` and
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
