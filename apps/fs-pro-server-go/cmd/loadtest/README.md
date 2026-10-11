# cmd/loadtest — defense load test (P10)

Queues N raids durably and drains them through the **real** worker path
(`play.ResolvePendingRaids`, the same function the `world-worker` "defenses"
ticker runs) with parallel workers, each claiming a batch in its own transaction
(`FOR UPDATE SKIP LOCKED`). It measures **matches/second**, asserts **no
double-apply**, and is run under `go run -race` to assert **no data races**.

It clones a throwaway database (default `fspro_loadtest`) from `DATABASE_URL`
(default the scratch DB) and drops it on exit — the template is never mutated.

```
# full run (auto: uses the real sim-service when reachable, else a deterministic fake)
go run ./cmd/loadtest -raids 500 -workers 16

# DB/worker only, real engine, or forced fake
go run ./cmd/loadtest -sim real
go run ./cmd/loadtest -sim fake

# race check (needs cgo; the repo's P10 image is golang:1.24-bookworm)
docker run --rm -v "C:\done\fs-pro:/work" -w /work/apps/fs-pro-server-go \
  -e CGO_ENABLED=1 \
  -e "DATABASE_URL=postgresql://fspro:superpassword@host.docker.internal:5434/fspro_scratch" \
  golang:1.24-bookworm sh -c "go run -race ./cmd/loadtest -raids 400 -workers 8 -sim fake"
```

## What it asserts

1. Every raid resolves exactly once (`RaidResults` PK = one row per raid;
   `RaidResults.RaidId` distinct = N; no pending/failed rows).
2. No double-apply — the attacker/defender `StandingPoints` movement equals the
   sum of the recorded `StandingAttacker`/`StandingDefender` deltas, and the
   `raid_loot` ledger rows match the results (one per currency stolen each side).
3. The second sweep resolves nothing (idempotency guard).
4. No data races (`-race`).

## Clubs and contention

By default each raid uses its **own attacker and defender** (0 means "one per
raid"), so two live worker batches share no club row. With fewer clubs than
raids, several batches lock the same club rows in different orders and Postgres
raises a lock-order-inversion deadlock, which `play.ResolvePendingRaids` records
as a permanently `failed` raid (the per-batch transaction holds club locks until
it commits). Pass small `-attackers`/`-defenders` to reproduce it; the command
reports the failed count instead of hiding it.
