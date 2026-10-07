# Scale baselines (world pyramid)

## B2D — district hierarchy at 10,000 clubs, 100k attempted (2026-10-07)

Batch-2 integration on the **new district hierarchy**: Node founding calls the
Go world-service `POST /placement/spot` inside the `PLACEMENT_LOCK` transaction,
and the pyramid draw/join delegate to `POST /pyramid/draw|join`. Scratch DB
`fspro_scale_100k` (schema cloned from the live `fspro`, migration
`0038_world_districts.sql` applied), Postgres 17 in Docker (host port 5434), Go
world-service (go1.24.13, `golang:1.24-bookworm`) on `localhost:3006`, one Linux
Node v24.21.0 process. Machine: Intel i7-11800H (16 vCPU), 15 GiB RAM, WSL2.

Two harness fixes were needed first (`seedScaleWorld.ts`, both in this file):
`SCALE_SKIP_MATCHES=1` now also skips the next-day kickoffs in §4 (it ran only
the year-end hour), and the short-code generator now emits 26·36³ unique codes
(the old letters-only scheme wrapped at 26³ = 17,576, where `code(17576)`
collided with `code(0)` and founding failed with a 409).

### 10,000 clubs (2026-10-07, completed)

```
SCALE_CLUBS=10000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 \
  DATABASE_URL=…/fspro_scale_100k npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
```

| Step | 10,000 clubs |
| --- | --- |
| Founding | 10,000 clubs in 1,051 s (105 ms each) |
| Places opened | 8 countries, 44 regions, 1,000 cities/districts |
| Rows | 10,000 clubs, 160,000 players, 90,000 fixtures |
| Atlas (no club lists) | 22 ms · 132 KB, 348 cities |
| Atlas (one country's clubs) | 56 ms · 546 KB |
| Placement preview (Go) | 6 ms · `new-town` |
| Local news feed | 4 ms · 10 items, local = country |
| One pool table / a country's pools | 5 ms / 11 ms (134 pools) |
| Year end (hour 0) | 427,005 ms · 8 pyramids finished, **8 drawn**, 0 up / 16 down; errors: 0 |
| Editions running after redraw | 8 |

Year-end step breakdown (`[year]` logs): last fixtures 6 ms; pyramid finish
6.6 s; performance/Level review 0.9 s; player progression 13.6 s; wages 0.9 s;
retirement 0.4 s; youth intake 52 s; **club ratings 334 s**; release 0.01 s;
pyramid draw 17.8 s; year report 0.6 s. The `8 drawn` (vs B2-2C's `0 drawn`)
is the `internal/db` timeout fix landed since Batch 2.

### 100,000 clubs (2026-10-07, attempted — STOPPED at the 45-minute budget)

```
SCALE_CLUBS=100000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 \
  DATABASE_URL=…/fspro_scale_100k npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
```

The run was stopped after **45 minutes** (the founding step was still running),
per the D5 hard budget. It had founded **20,686 clubs in 2,730 s
(≈132 ms/club average; the script's own cumulative rate was 126 ms/club at
20,500 clubs, rising ~2 ms per 1,000 clubs over the 10k–20k band)**:
16 countries, 2,069 cities/districts, 330,976 players at the cut. **100,000
clubs did not complete** and is not claimed.

Projection: fitting the measured cumulative-rate curve (48 ms at 250 clubs →
105 ms at 10k → 126 ms at 20.5k) gives a 100k founding time of **≈4–6 hours**
(≈15,000 s with a concave/log fit, ≈19,000 s with a linear fit of the last
12 samples). The degradation is driven by per-founding row counts / indexes,
not the placement algorithm (2A: O(1) amortised). Even the optimistic fit is
~5× the 45-minute budget, so the earlier B0 audit's "10k/100k" D5 target is
confirmed as out of reach for an end-to-end single-process run on this machine;
a 100k world needs a bulk/parallel founding path.

| Step | 10,000 clubs | 100,000 clubs (attempted, 20,686 / 45 min) |
| --- | --- | --- |
| Founding | 1,051 s (105 ms each) | stopped at 20,686 clubs in 2,730 s (132 ms each), still running |
| Places opened | 8 countries, 44 regions, 1,000 cities/districts | 16 countries, 2,069 cities/districts at the cut |
| Rows | 10,000 clubs, 160,000 players, 90,000 fixtures | 20,686 clubs, 330,976 players at the cut |
| Atlas (no club lists) | 22 ms · 132 KB | not reached |
| Atlas (one country's clubs) | 56 ms · 546 KB | not reached |
| Placement preview (Go) | 6 ms | not reached |
| Local news feed | 4 ms | not reached |
| One pool table / a country's pools | 5 ms / 11 ms | not reached |
| Year end (hour 0) | 427,005 ms · 8 drawn | not reached |
| Editions running after redraw | 8 | not reached |

---

## B2 — district hierarchy + Go world-service (2026-10-07, 1,000 clubs)

First run of the Batch 2 integration: Node founding calls the Go world-service
`POST /placement/spot` inside the `PLACEMENT_LOCK` transaction, and the pyramid
draw/join delegate to `POST /pyramid/draw|join`. Scratch DB `fspro_b2c`
(schema cloned from `fspro`, migration `0038_world_districts.sql` applied),
Postgres 17 (Docker), Go world-service on `localhost:3006`, one Node process.
Command (B2-2C report §Commands):

```
SCALE_CLUBS=1000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 \
  DATABASE_URL=postgres://…/fspro_b2c npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
```

| Step | Result |
| --- | --- |
| Founding | 1,000 clubs in 168 s (168 ms each, including the Go HTTP round-trip and 16 players/club) |
| Places opened | 1 country, 4 regions, 100 cities/districts |
| Rows | 1,000 clubs, 16,000 players, 3,746 fixtures |
| Atlas (no club lists) | 7 ms · 12 KB, 31 cities |
| Atlas (one country's clubs) | 28 ms · 320 KB |
| Placement preview (Go) | 40 ms · `new-town` |
| Local news feed | 8 ms · 10 items, local = country |
| One pool table / a country's pools | 7 ms / 11 ms (42 pools) |
| Year end + next day | 35,308 ms · 1 pyramid finished |
| Editions running after redraw | 0 (see caveat) |

**Founding is now HTTP-bound, not world-size-bound.** 168 ms/club at 1,000
clubs vs the 75 ms/club pre-B2 baseline (below) is the Go round-trip plus
per-call DB queries; the placement algorithm itself is O(1) amortised (2A:
~8 ns/founding). The 10k/100k end-to-end runs (D5, `fspro_scale_100k`) were
not captured here — the environment lost its Docker/Postgres after the 1k run
(see the B2-2C report's Open Questions).

**Caveat (2A defect, outside 2C's ownership).** The year-end redraw reported
`0 drawn` because the Go `pyramid/draw` and `pyramid/join` handlers fail on the
row-iterating queries. Cause (read-only inspection):
`services/world-service/internal/db/db.go:84-88` cancels the per-call timeout
context via `defer cancel()` when `Query` returns `pgx.Rows`, before the caller
consumes `rows.Next()` — a known pgx pitfall. The failure is deterministic
(`POST /pyramid/draw` returned 500 on 20/20 direct calls), so a client retry
cannot help; the Go helper is the real fix and is filed in the B2-2C report §5.

---

Measured on 2026-10-04 with `apps/fs-pro-server/src/scripts/seedScaleWorld.ts`, on a scratch database (`fspro_pyramid_check`). The setup: local Postgres 17 in Docker on the dev machine, one Node process, and QuickSim matches run 4 at a time. Clubs were founded through the real placement and founding code: 16 players per club, default sizes (6 clubs per town, 8 towns per region, 6 regions per country).

How to reproduce:

- Run `REALTIME_URL=off WORLD_TICK_MINUTES=0 SCALE_CLUBS=N DATABASE_URL=<scratch> npx ts-node --transpile-only src/scripts/seedScaleWorld.ts`.
- `timeYearEnd.ts` and `timeProgression.ts` time single steps.
- The year end logs each step's cost (`[year] <label>: <step> <ms>`).

## Results

| Step | 1,000 clubs | 10,000 clubs |
| --- | --- | --- |
| World built | 5 countries, 21 regions, 167 towns | 42 countries, 209 regions, 1,667 towns |
| Rows | 16k players, 9k fixtures | 160k players, 90k fixtures |
| Founding a club | 75 ms | 118 ms (rises slowly with size) |
| Atlas, no club lists | 12 ms, 63 KB | 143 ms, 632 KB |
| Atlas with one country's clubs | 21 ms, 137 KB | 127 ms, 706 KB |
| Placement preview | 6 ms | 27 ms |
| Local news feed | 9 ms | 16 ms |
| One pool table / a country's 24 pools | 8 / 9 ms | 9 / 10 ms |
| A day with no matches (24 hourly ticks) | under 1 s | 4.7 s |
| A league day | (none timed) | 5,000 matches in 35 min; busiest kickoff hour 268 s |

### Year end at 10,000 clubs, step by step (first run)

| Step | Time |
| --- | --- |
| Last fixtures | 0.6 s |
| Pyramid finish (42 countries) | 16 s |
| Performance and Level review | 1.9 s |
| Player progression | **failed** (see below); after the fix, 43 s for 173k players |
| Wages (one statement) | 0.7 s |
| Retirement | 0.5 s |
| Youth intake | **115 s** |
| Club ratings | **320 s** |
| Release inactive clubs | 0.01 s |
| Pyramid draw (42 countries) | 30 s |
| Year report | 0.5 s |

At 1,000 clubs, after the batching fixes, the whole year end takes 19 s.

## Fixed during the run

- **Player progression failed at 10k:** two relational reads put every player id in one `IN` list and passed Postgres's 65,534 bound-parameter limit, so nobody aged or developed. Both are fixed:
  - the signed-player load is a plain select (`player.controller.ts`);
  - the stats lookup is chunked by 10k (`player.service.ts`).
- **Earlier batching:**
  - progression writes with `UPDATE … FROM (VALUES …)` in batches of 500 (12.8 s → 5.0 s at 1k);
  - wages are one statement;
  - facility effects are read in bulk (youth intake 8.9 s → 0.2 s at 1k);
  - `ensureYearRows` only inserts missing rows.

## Still to do (measured, not fixed)

1. **Club ratings at year end (320 s at 10k):** `calculateAndUpdateClubRating` runs per club, 25 at a time. A set-based SQL over each club's best XI, or rating only clubs whose squads changed, would bring it to seconds.
2. **Youth intake at 10k (115 s):** it opens a transaction per club below squad size and generates names one club at a time. Generate in bulk and insert in one statement per batch.
3. **Match throughput:** about 0.42 s per QuickSim match at concurrency 4. A league day at 10k (5,000 matches) is spread over 11 kickoff hours; the busiest hour took 4.5 minutes, well inside the real hour.
   - At the default 24-hour day this is fine.
   - With `GAME_TIME_SCALE` above about 10, hours start to overlap.
   - Options: raise the concurrency on a worker with a bigger connection pool, or spread kickoffs over more hours.
4. **The atlas at 10k is 630–700 KB.** It's sent once per page load, and live updates are batched every 3 s. Next step: towns per country on zoom.

The whole year end runs once per 28-day Year, in the worker, at hour 0 of the first day. At 10k it currently takes about 8 minutes, inside the 10-minute clock lease. Fixing items 1 and 2 would bring it to about 2 minutes.
