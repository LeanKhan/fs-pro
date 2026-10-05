# Scale baselines (world pyramid)

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
