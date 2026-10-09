# B2-2D-REPORT — D5 scale proof (founding / draw / year end)

Agent: **2D** (`perfect/b2-2d`). Worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b2d`. Base `perfect/integration` @
`bd1816b`.

Goal (FOR-AGENTS D5, batch brief): measure founding, draw and year end on the
**new district hierarchy** with the Go world-service, at **10,000** and
**100,000** clubs, and record the result in `docs/SCALE.md`.

Read first: `FOR-AGENTS.md` (R1–R11, D5), `docs/perfect/PROGRESS.md`,
`docs/perfect/DECISIONS.md` (§F), `docs/perfect/B2-2C-REPORT.md`,
`docs/SCALE.md`, `seedScaleWorld.ts`, `checkWorldPyramid.ts`,
`services/world-service/internal/config/config.go`.

## 0. Machine and toolchain (R1)

| Component | Version / value | Command |
| --- | --- | --- |
| Host | WSL2 on Windows, `ESLEAN` | `uname -a` |
| CPU / RAM | Intel i7-11800H (16 vCPU), 15 GiB | `nproc`, `free -h` |
| Node (Linux, nvm) | v24.21.0 | `node --version` |
| npm | 11.19.0 | `npm --version` |
| ts-node | v10.9.2 | `ts-node --version` |
| Postgres server | 17.11 (Debian) in Docker (`fs-pro-db-1`, host port 5434) | `select version()` |
| Go (world-service) | go1.24.13 linux/amd64 in `golang:1.24-bookworm` | `go version` |
| Docker | 29.7.2 | `docker --version` |

## 1. Setup

### 1.1 Scratch databases

Both scratch DBs were rebuilt from the **live `fspro` schema** with the
`postgres:17-alpine` `pg_dump` recipe from `PROGRESS.md`, then migration 0038
applied. The dev DB `fspro` was never written.

```
$ docker run --rm --network host -e PGPASSWORD=… postgres:17-alpine \
    pg_dump -h localhost -p 5434 -U fspro --no-owner --no-privileges -s fspro > schema.sql
$ psql … -c 'DROP DATABASE IF EXISTS fspro_scale_100k' -c 'CREATE DATABASE fspro_scale_100k'
$ docker run … psql -h localhost -p 5434 -U fspro -d fspro_scale_100k -q < schema.sql
$ psql … -d fspro_scale_100k -1 -f apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql
APPLY_EXIT=0
```

- `fspro_scale_100k` — the scale target (10k run, then reset, then 100k attempt).
- `fspro_scale_check` — fresh empty clone for `checkWorldPyramid.ts`.
- Verified after 0038: `Clubs.DistrictId`, `PlaceInvites`, `PlaceStats`,
  `TileRevisions` present, `Clubs` empty.

### 1.2 World-service (required by founding)

Founding calls `POST /placement/spot` (`WORLD_SERVICE_URL`, default
`http://localhost:3006`). The service was run from Linux in Docker.
`--network host` alone does **not** publish to the WSL host under Docker
Desktop, so the service is joined to the Postgres container's network
(`fs-pro_default`) with `-p 3006:3006` and reaches Postgres as `db:5432`:

```
$ docker run -d --name ws-b2d --network fs-pro_default -p 3006:3006 \
    -v "$WT/services/world-service:/w" -w /w -v ws-go-mod-cache:/go/pkg/mod \
    -e DATABASE_URL='postgresql://fspro:superpassword@db:5432/fspro_scale_100k' \
    -e WORLD_SERVICE_HOST=0.0.0.0 -e WORLD_SERVICE_PORT=3006 -e LOG_LEVEL=info \
    golang:1.24-bookworm sh -c "go build -o /tmp/ws ./cmd/world-service && exec /tmp/ws"
$ curl -s localhost:3006/health
{"status":"ok","service":"fs-pro-world-service","version":"dev","database":"up",…}
```

Env names verified in `internal/config/config.go` (`WORLD_SERVICE_HOST`,
`WORLD_SERVICE_PORT`/`PORT`, `DATABASE_URL`, `LOG_LEVEL`).

### 1.3 Worktree Node install

The worktree had no `node_modules` and no `.env`. `node_modules` was symlinked
to the `b1c` worktree install; the app-level `@repo/api-contract` link points at
**this** worktree, and `api-contract` was built with `tsc`. `tsc --noEmit` is
green (`TSC_EXIT=0`, no output; re-run after the §2 changes). `.env` (gitignored):

```
DATABASE_URL="postgresql://fspro:superpassword@localhost:5434/fspro_scale_100k"
REALTIME_URL=off
WORLD_SERVICE_URL=http://localhost:3006
WORLD_TICK_MINUTES=0
NODE_ENV=dev
```

## 2. Harness fix (a file this agent owns)

`seedScaleWorld.ts` §4 called `runWorldDay()` even with
`SCALE_SKIP_MATCHES=1`, so the year-end step also played the **next day's**
kickoffs: ~4,890 fixtures at 10k, each retrying the (deliberately absent) sim
service 3× — an artefact that left the step at ~1.05 fixtures/s with a ~70 min
tail. This was observed in the first 10k run (killed after ~37 min, 443
permanent failures logged, calendar parked at hour 13).

Fix: with `SCALE_SKIP_MATCHES=1`, run only the year-end hour
(`runWorldHour()`) instead of the whole next day; the step is labelled
`year end (hour 0)`. The full `runWorldDay()` path is unchanged when the flag
is unset.

```
$ git --no-pager diff -- apps/fs-pro-server/src/scripts/seedScaleWorld.ts
- * earlier run). SCALE_SKIP_MATCHES=1 skips section 3 (the sim service).
+ * earlier run). SCALE_SKIP_MATCHES=1 skips section 3 and the next-day kickoffs
+ * in section 4 (both need the sim service); the year end still runs.
…
-  await timed('year end + next day', () => runWorldDay(), (r) =>
+  const skipMatches = process.env.SCALE_SKIP_MATCHES === '1';
+  await timed(skipMatches ? 'year end (hour 0)' : 'year end + next day', () => (skipMatches ? runWorldHour() : runWorldDay()), (r) =>
```

### 2.1 Short-code generator wrapped at 17,576 (blocked 100k)

The **first** 100k attempt crashed at exactly club 17,576:

```
FoundingError: That name or code is taken
    at foundClub (…/club-founding.service.ts:287:46)
    at async main (…/seedScaleWorld.ts:82:15) { status: 409 }
```

Cause (R1): the harness's `code()` built `'Z' + three base-26 letters`, so it
is injective only for `n < 26^3`. `code(17576) === code(0) === "ZAAA"`:

```
$ node -e '…old code()…; console.log(code(0), code(17575), code(17576), code(17577))'
ZAAA ZZZZ ZAAA ZAAB
```

`codeProblem` accepts `^[A-Z][A-Z0-9]{1,3}$` (`packages/api-contract/src/world-geo.ts:170`),
so a letter + three base-36 chars gives 26·36³ = 1,213,056 unique codes. Fix:

```
+const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
 const code = (n: number) => {
-  let s = '';
-  for (let k = n; s.length < 3; k = Math.floor(k / 26)) s = String.fromCharCode(65 + (k % 26)) + s;
-  return `Z${s}`;
+  let suffix = '';
+  let k = n;
+  for (let i = 0; i < 3; i++) { suffix = CODE_ALPHABET[k % 36] + suffix; k = Math.floor(k / 36); }
+  return CODE_ALPHABET[k % 26] + suffix;
 };
```

Verified unique and format-valid for the whole target:

```
$ node -e '…new code()…'
unique codes 0..99999: 100000 | format failures: 0
samples: AAAA AAAB ANUH ANUI A999 BAAA CFF1
```

`TSC_EXIT=0` after both changes. The re-run founded **past 17,576 with no
collision** (§4).

## 3. 10,000 clubs

Command (start `2026-10-07T12:21:42Z`, end `12:46:30Z` → 24m48s, exit 0):

```
$ SCALE_CLUBS=10000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 NODE_ENV=dev \
    ../../node_modules/.bin/ts-node --transpile-only src/scripts/seedScaleWorld.ts
SEED10K_EXIT=0
```

Last ~15 lines of the run (raw table):

```
[scale] 10000 clubs (105 ms each)
[scale] atlas (no club lists): 22 ms · 132 KB, 348 cities
[scale] atlas (one country's clubs): 56 ms · 546 KB
[scale] placement preview: 6 ms · new-town
[scale] local news feed: 4 ms · 10 items, local = country
[scale] one pool table: 5 ms · 10 rows
[scale] every pool table of a country: 11 ms · 134 pools
[year] Y1: last fixtures 6 ms
[year] Y1: pyramid finish 6611 ms
[year] Y1: performance and Level review 856 ms
[year] Y1: player progression 13617 ms
[year] Y1: wages 889 ms
[year] Y1: retirement 387 ms
[year] Y1: youth intake 52074 ms
[year] Y1: club ratings 333565 ms
[year] Y1: release inactive clubs 11 ms
[year] Y1: pyramid draw 17759 ms
[year] Y1: year report 644 ms
[year] Y1 ended (days -28--1); year 2 starts on day 0.
[scale] year end (hour 0): 427,005 ms · 8 pyramids finished, 8 drawn, 0 up / 16 down; errors: 0

| Step | Result |
| --- | --- |
| founding | 10000 clubs in 1051 s (105 ms each) |
| places opened | 8 countries, 44 regions, 1000 cities/districts |
| rows | 10000 clubs, 160000 players, 90000 fixtures |
| atlas (no club lists) | 22 ms · 132 KB, 348 cities |
| atlas (one country's clubs) | 56 ms · 546 KB |
| placement preview | 6 ms · new-town |
| local news feed | 4 ms · 10 items, local = country |
| one pool table | 5 ms · 10 rows |
| every pool table of a country | 11 ms · 134 pools |
| year end (hour 0) | 427,005 ms · 8 pyramids finished, 8 drawn, 0 up / 16 down; errors: 0 |
| editions running after redraw | 8 |
```

Note: **8 pyramids drawn** — the `db.go` timeout fix (landed since B2-2C)
makes the delegated `/pyramid/draw` succeed; B2-2C's 1k run reported `0 drawn`
because of the pre-fix `internal/db` bug.

## 4. 100,000 clubs — attempted, STOPPED at the 45-minute budget

Command (start `2026-10-07T13:33:17Z`; stopped `14:17:03Z`; the founding step
was still running):

```
$ SCALE_CLUBS=100000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 NODE_ENV=dev \
    ../../node_modules/.bin/ts-node --transpile-only src/scripts/seedScaleWorld.ts
… (killed by the 45-minute watchdog)
```

Last progress lines and the watchdog capture:

```
[scale] 19250 clubs (123 ms each)
[scale] 19500 clubs (124 ms each)
[scale] 19750 clubs (124 ms each)
[scale] 20000 clubs (125 ms each)
[scale] 20250 clubs (126 ms each)
[scale] 20500 clubs (126 ms each)
=== WATCHDOG at 2026-10-07T14:17:03Z ===
seed pid=15432 elapsed=2730s
clubs: 20685
last progress: [scale] 20500 clubs (126 ms each)
```

Database state at the cut:

```
 clubs | players | users | countries | districts
-------+---------+-------+-----------+-----------
 20686 |  330976 | 20686 |        16 |      2069
```

No `FoundingError` in the whole re-run: the fixed code generator passed
17,576 (the old collision point). No `[year]` / read steps ran — the process
was still founding.

**Result: 100,000 clubs did NOT complete. 20,686 clubs were founded in
2,730 s (132 ms/club average; script cumulative 126 ms/club at 20,500).**

Projection (honest; the rate degrades with size). Fitting the measured
cumulative-rate samples (48 ms @250, 105 ms @10k, 126 ms @20.5k):

| Model | c(100k) | Total founding time |
| --- | --- | --- |
| Linear fit of the last 12 samples (`c = 81.6 ms + 2.17 ms/1k·n`) | ≈298 ms/club | ≈19,000 s ≈ **5.3 h** |
| Concave/log fit of the same samples | ≈192 ms/club | ≈15,000 s ≈ **4.2 h** |

So a 100k world is **≈4–6 hours** of founding on this machine (−5× even the
optimistic figure vs the 45-minute budget) and the run cannot complete in one
process. The increase is per-founding row/index cost, not placement (2A: O(1)
amortised, ~8 ns/founding).

## 5. `checkWorldPyramid.ts`

Run on the fresh empty `fspro_scale_check` (schema clone + 0038) with the
world-service pointed at that DB (same build as §1.2), exit 1:

```
$ REALTIME_URL=off WORLD_SERVICE_URL=http://localhost:3006 \
    DATABASE_URL="postgresql://fspro:superpassword@localhost:5434/fspro_scale_check" \
    NODE_ENV=dev WORLD_CHECK_CLUBS=40 \
    ../../node_modules/.bin/ts-node --transpile-only src/scripts/checkWorldPyramid.ts
pure
  ok  pyramid shapes for 1, 11, 12, 31, 288 and 10,000 clubs
  ok  round-robins: every pair meets once per leg, one game per slot per round
  ok  week template: 20 league days and 8 cup days in a 28-day year
  ok  news: natural scope and a bar that rises only with a busy scope
database
  ok  fill order: district, city, region, country, then a new country
  ok  an invite link places a friend in the inviter's district
  ok  six foundings at once keep every cap
  ok  40 clubs founded, no AI rivals
  ok  2 pyramid edition(s): pool mates are scheduled against each other, on league days only
AssertionError [ERR_ASSERTION]: every league fixture of the year was played
312 !== 0
    at dbChecks (…/checkWorldPyramid.ts:257:10)
CHECK_EXIT=1
```

**9/9 non-sim assertions PASS** (placement/fill order, invites, five-way cap
under concurrency, no AI clubs, and the delegated Go `/pyramid/draw` pools
with league-day fixtures). The season step could not play any fixture because
the Rust sim service at `127.0.0.1:5050` is not running
(`[sim] fixture …: sim service unreachable …`); 312 league fixtures stayed
unplayed. Verdict for the season / promotion / year-end assertions:
**UNVERIFIED** (environmental), not a FAIL — identical to B2-2C §3.6.

## 6. Known gaps

1. **D5 100k end-to-end is not achievable** (R1): the attempt reached 20,686
   clubs in 45 min and was stopped; the projected founding time is ≈4–6 h
   (§4). The 1M synthetic Go benchmarks (D5 part 1) are 2A/2B's.
2. **`checkWorldPyramid.ts` season is UNVERIFIED** — needs the Rust sim
   service on `127.0.0.1:5050` (§5). No code change needed.
3. **Two harness bugs fixed** in `seedScaleWorld.ts` (owned): the §4
   `SCALE_SKIP_MATCHES` leak and the 17,576 short-code wrap (§2). Without the
   second fix, any `SCALE_CLUBS > 17,576` run crashes with a 409.
4. **Verbose player logging (not owned, not fixed):**
   `apps/fs-pro-server/src/utils/players.ts:530` unconditionally
   `console.log('Generated Player payload => ', obj)` for every one of the 16
   players per club (~620 lines / ~11 KB per club; ~100 MB at 10k, ~1 GB at
   100k). It slowed the runs and bloated the logs; it should be removed or
   gated. `utils/players.ts` is outside this agent's ownership (R11), so it is
   reported, not changed.
5. **`fspro_scale_100k` at the cut holds 20,686 clubs with no year-end run** —
   it was reset after the 10k run, so the 10k table (§3) and the 100k cut
   state (§4) are two separate lives of that DB. `fspro_scale_check` holds the
   §5 check world. The dev DB `fspro` was never written.
6. **Rates are single-process / one Node client.** Founding is HTTP-bound to
   one world-service; a production 100k first-run would need bulk/parallel
   founding (the per-placement algorithm itself is O(1)).
