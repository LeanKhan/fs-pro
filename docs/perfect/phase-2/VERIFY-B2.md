# VERIFY-B2.md — phase 2, Batch 2 (2A + 2B + 2C)

Verifier: the lead orchestrator (wrote none of the batch's code). Branch
`p2/integration`, containing `59615d8` (2A), `f71939f` (2B), `3833701` (2C)
merged. Method: re-ran the batch's own commands on the merged tree where
feasible, and read the reports for the DB-heavy checks.

## Re-run on `p2/integration` (independent)

```
server tsc (npx tsc --noEmit)            -> 0 errors
server vitest (npx vitest run)           -> 15 files / 151 tests passed
client build (npm run build)             -> built in 11.59 s
money-symbol grep [$€£][0-9] (client+server+contract) -> count=0
```

## Agent evidence, read and judged

| Check | Command | Result |
| --- | --- | --- |
| 2A Go program + sim | `go test ./...` (world-service) | all packages ok; `-race` ok in Docker; 0 soft-locks |
| 2B migration backfill | `checkProgramMigrations.ts` | 9/9 (row counts unchanged, 50 clubs `done`, idempotent) |
| 2B level concurrency | `checkProgramConcurrency.ts` | 5/5 (50 racers → exactly 50 entries) |
| 2B pyramid | `checkWorldPyramid.ts` | 14/14 |
| 2C world seed | run twice | exactly 5000 players / 1000 managers; second run adds nothing |
| 2C signing race | race test | one winner, one debit |
| 2C bounded pool | 10000 restocks | pool 5000 → 8000 (≤ cap) |
| 2C founding rate | `fspro_p2c_scale` copy | 14 ms/club (≤ 34.1 ms = 1.1× B2-2E 31) |

## Defects / notes

1. **L7 not strictly met (carried from 2A, for the tuning batch):**
   `balanced_expert@V1M` ties `random@V5M` on the median; the naive strategies
   are still 1.3–1.7× slower and 0 soft-lock. Knobs are named in
   `internal/program/sim`. Batch 4A owns the tuning.
2. **2C benchmark DB caveat:** used a migrated copy (`fspro_p2c_scale`) because
   `fspro_scale_100k` predates 0042/0043; per-club path identical. Accepted.
3. **No new Go endpoints in 2C** (culture cache reads `Places.CultureId`),
   accepted.

## Verdict: **PASS** — Batch 3 build agents may start.
