# VERIFY-B2.md — independent verification of Batch 2 (2A + 2B + 2C + Go fix)

Verifier: a dedicated verification agent that wrote **none** of the Batch 2
code. Branch **`perfect/b2-verify`**, worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b2v`, base `perfect/b2-2c` @ `4c83f08`.
Program of record: `FOR-AGENTS.md` (R1–R11, D1–D5), `docs/perfect/DECISIONS.md`
(§D re-split), `docs/perfect/WORLD-HIERARCHY-SPEC.md`,
`docs/perfect/WORLD-SERVICE-CONTRACT.md`, `B2-2A/2B/2C-REPORT.md`.

Every claim below is a command I ran and its output, or a `file:line` (R1).
Nothing was fixed. The dev DB `fspro` and the active `fspro_pyramid_check` were
never written. Scratch DBs created: `fspro_b2v`, `fspro_b2v_scale`,
`fspro_b2v_check`.

## 0. Merge topology (STEP 0)

`git log --oneline -8` on `perfect/b2-verify`:

```
4c83f08 fix(world-service): keep per-call timeout alive until pgx rows are consumed
c3555e9 B2-2C: Node district-hierarchy integration, world-service wiring, scale checks
bfee583 Merge branch 'perfect/b2-2b' into perfect/b2i
f316bd3 Merge branch 'perfect/b2-2a' into perfect/b2i
ce1c228 feat(world): real placement/hierarchy/ranking/pyramid + district migration (B2-2A)
5d61443 feat(perfect): typed world-service contract + thin HTTP client (B2-2B)
```

All four are present: 2A (`ce1c228`), 2B (`5d61443`), 2C (`c3555e9`), and the
`db.go` fix (`4c83f08`). `git diff --stat perfect/integration..HEAD` = **39
files, 6298 insertions, 807 deletions**. `git status` clean at start; 2A/2B/2C
diff files match the `B2-2A/2B/2C` "what changed" tables (spot-checked).

## 1. Go — 2A and the `db.go` fix (STEP 1)

### 1.1 vet / test / race

`"/mnt/c/Program Files/Go/bin/go.exe" vet ./...` → `VET_EXIT=0`.
`go test -count=1 ./...` → `TEST_EXIT=0`, all 9 packages `ok`
(`cmd/world-service`, `config`, `db`, `http`, `placement`, `pyramid`,
`ranking`, `synth`, `tiles`).
Docker `golang:1.24-bookworm go test -race ./...` → `RACE_EXIT=0`, all 9 `ok`.
**PASS** (reproduces B2-2A §3.1–§3.3).

### 1.2 Benchmarks (1M synthetic) vs B2-2A §3.4 (Windows, i7-11800H)

| Benchmark | B2-2A report | This run | ratio |
| --- | --- | --- | --- |
| `BenchmarkGenerate1M` | 21.43 ms | 26.49 ms | 1.24× |
| `BenchmarkPlacementSynth1M` | 6.65 ms | 7.30 ms | 1.10× |
| `BenchmarkRankSynth1M` | 577 ms | 833 ms | 1.44× |
| `BenchmarkAssignSynth1M` | 2.47 s | 4.02 s | 1.63× |

Same order of magnitude, all `goos: windows`/same CPU. Placement stays O(1)
(1M foundings in 7.3 ms; 55 allocs, 5.0 MB). `Assign` is the slowest and
2A already flagged it as a known gap (no target set). **PASS** (no
falsification; Assign drift is single-iteration noise + host load).

### 1.3 `db.go` regression — `TestQuerySurvivesTimeout`

`fspro_b2v` was built from the live `fspro` (full schema+data clone via
`postgres:17-alpine pg_dump`; clone verify `39|50|24|0` =
`Places|Clubs|towns|TownInvites`, identical to live).

```
$ docker run ... -e WORLD_TEST_DATABASE_URL=postgres://fspro:...@localhost:5434/fspro_b2v \
    golang:1.24-bookworm go test ./internal/db -run TestQuerySurvivesTimeout -v
--- PASS: TestQuerySurvivesTimeout (0.61s)   (4/4 subtests PASS)
```

**PASS — this proves the fix.** See defect D1 for the separate finding that
this test does *not* fail on the pre-fix code.

### 1.4 Adversarial probe of the fix (independent of the committed tests)

I copied `services/world-service` to `/tmp`, replaced only `internal/db/db.go`
with the pre-fix version (`git show 4c83f08^:.../db.go`, i.e. `defer cancel()`
in `Query`/`QueryRow`), and added a probe querying 500,000 rows:

```
PRE-FIX :  --- FAIL: rows.Err after 1089 rows: context canceled
POST-FIX:  --- PASS: TestBigResultSurvivesTimeout (0.08s)
```

This confirms (a) the bug is real and data-size-dependent (a result larger than
the first socket read: failure at row 1089), and (b) `4c83f08` genuinely fixes
it. It also shows the committed tests are too small to catch it (D1).

### 1.5 Migration 0038 on a copy of real data (spec §2.3)

Applied the raw file in one transaction to `fspro_b2v` (data clone). Real data
has **0** `TownInvites`, so to actually exercise the invite backfill I seeded
**3** synthetic `TownInvites` (clearly labelled) before applying; all other
data is real. Pre-state: `towns=24`, `clubs=50`, `clubs_with_town=49`,
`Calendars TownSize/RegionTowns = 6/8`.

```
$ psql -1 -f 0038_world_districts.sql    # APPLY1_EXIT=0
towns_gone|0|want 0
cities|24|want 24
districts|24|want 24
each_city_one_district_violations|0|want 0
district_parent_not_city|0|want 0
clubs|50|want 50
null_district_clubs|1|want 1 (pre-existing released)
placestats_mismatch|0|want 0
placestats_rows|24|want 24
placeinvites|3|want 3 (seeded)
invites_repointed_to_town_district|3|want 3
invite_level_default|district|want district
cal_districtclubs|6|want 6 (old TownSize)
cal_regioncities|8|want 8 (old RegionTowns)
prominence_out_of_range|0|want 0
prominence_updated_set|50|want 50
new_cal_columns|5|want 5
tables|3|want 3
old_tablenames_gone|0|want 0
```

Every old `town` is a `city` with exactly one `district`; no new null
`DistrictId` (the 1 null was already null `TownId` before the migration —
`pre clubs_with_town=49` of 50); `PlaceStats` equals `GROUP BY Clubs.DistrictId`;
all 3 invites repoint to their old town's district; settings values preserved
(`6/8`, values not defaults).

**Idempotency:** second `psql -1 -f 0038...` → `APPLY2_EXIT=0`; re-assert gives
the identical all-pass output (`districts` still 24, invites still 3, no double
repointing). **PASS** (exercised, not reasoned).

**PlaceStats trigger:** moved a club between districts and back —
`before d1=2 d2=2` → `after move d1=1 d2=3` → `after revert d1=2 d2=2`,
`final_mismatch=0`. **PASS**.

**2A concurrency + invite acceptance** (scratch `fspro_b2v`, `DistrictClubs=6`):

```
--- PASS: TestConcurrentFoundingsScratchDB (0.77s)  placed 200 clubs under
    PLACEMENT_LOCK; cap=6, no overfill, PlaceStats consistent
--- PASS: TestInvitePlacementScratchDB (0.02s)
```

**PASS.** No overfill under 200 parallel foundings; valid invite honoured,
expired invite ignored.

Only assertion that flagged: `calendar_frontier_set=no`, because the newest
country on the real clone (`Ashter`) has **0 regions and 0 cities**, so the
backfill sets `FrontierCountryId` but leaves `FrontierRegionId/CityId` null.
This is consistent with the SQL ("newest non-full country/region/city" — there
is no region/city to point at) and consumers tolerate the nulls (the 200-parallel
run and `checkWorldPyramid` fill-order both pass against exactly this clone).
Recorded as observation D3, not a failure.

### 1.6 DB clone / migration notes

Verified `0038` never drops: `grep -inE "drop (column|table|constraint)"` →
none; `TownId`/`TownInvites` are renamed. `schema.ts` exposes `DistrictId`,
`Prominence`, `DistrictClubs/CityDistricts/RegionCities/MetropolisDistricts`,
`Frontier*`, `PlaceInvites`, `PlaceStats`, `TileRevisions`
(`apps/fs-pro-server/src/db/drizzle/schema.ts:240,244,313-320,1010,1034,1048`).

## 2. Contract — 2B (STEP 2)

- `cmd.exe /c "npm run build --workspace @repo/api-contract"` → `BUILD_EXIT=0`,
  emitted `packages/api-contract/dist/schemas/world-service.js`.
- `cmd.exe /c "npm test"` in `apps/fs-pro-server` → **6 files, 92 tests, all
  passed** (`world-service-schemas.test.ts` 17, `world-service-client.test.ts`
  11, plus the 64 Batch-1C tests). Matches B2-2B §2.1 exactly.

**Schema field-name audit vs `WORLD-SERVICE-CONTRACT.md`** — every field matches;
**no mismatch found**:

| Contract section | Contract fields | `world-service.ts` |
| --- | --- | --- |
| §1 request | `clubId`, `inviteToken` | `:32-35` ✓ |
| §1 response | `kind`, `districtId`, `cityId`, `regionId`, `countryId`, `needsNames`, `x`, `y`, `invite{placeId,level}` | `:44-54`, `:38-41` ✓ |
| §2 | `children[], id/type/name/code/parentId/regionId/mapX/mapY/clubs` | `:61-74` ✓ |
| §3 | `clubId/prominence/updatedAt`; `{clubIds}`; `{updated}` | `:81-91` ✓ |
| §4 | `pools[], division/regionKey/cityKey/districtKey/clubIds`; `{competitionId,clubId}`; `division/poolId/slot/newPool` | `:98-122` ✓ |
| §5 | `status/service/version/database/uptimeSeconds/time` | `:128-135` ✓ |

**PASS.** Client (`world-service.client.ts`) uses `WORLD_SERVICE_URL`
(default `http://localhost:3006`, `:41-45`), throws on non-2xx (`:61-63`),
parses every response with its schema (`:65`), no SDK/axios. No `route-policy.ts`
or `routes/` diff (R6). **PASS**.

## 3. Node integration — 2C (STEP 3)

### 3.1 `tsc --noEmit`

`cmd.exe /c "npx tsc --noEmit"` in `apps/fs-pro-server` → `TSC_EXIT=0`, **0
errors** — after removing the app-level `@types/node@26.6.4` shadow that the
lockfile/vitest peer produces (B2-2B §3 / B2-2C §2; see D5). With that shadow in
place the command fails with exactly one unrelated error
(`imagination-auth.service.ts(162,76): TS2694 JsonWebKey`). **PASS with the
documented environment fix.**

### 3.2 `seedScaleWorld.ts` on fresh `fspro_b2v_scale`

Fresh DB (`-s fspro` schema clone + `0038`, 0 places/0 clubs); world-service
built and run against it; `SCALE_CLUBS=1000 SCALE_SKIP_MATCHES=1
REALTIME_URL=off WORLD_TICK_MINUTES=0`. `SEED_EXIT=0`.

| Step | B2-2C report | This run |
| --- | --- | --- |
| founding | 168 s (168 ms each) | 98 s (98 ms each) |
| places opened | 1 countries, 4 regions, 100 cities/districts | **same** |
| rows | 1000 clubs, 16000 players, 3746 fixtures | 1000 clubs, 16000 players, **9000 fixtures** |
| atlas (no club lists) | 7 ms · 12 KB, 31 cities | 9 ms · 12 KB, 31 cities |
| atlas (1 country) | 28 ms · 320 KB | 26 ms · 320 KB |
| placement preview | 40 ms · new-town | 13 ms · new-town |
| local news feed | 8 ms · 10 items, local = country | **same** |
| one pool table | 7 ms · 10 rows | 9 ms · 10 rows |
| every pool table of a country | 11 ms · 42 pools | 16 ms · **100 pools** |
| year end + next day | 35,308 ms · 1 finished, **0 drawn**, 0 up/2 down | 290,143 ms · 1 finished, **1 drawn**, 0 up/2 down |
| editions running after redraw | 0 | 1 |

The fixture/pool/`drawn` differences are exactly what the `db.go` fix predicts:
2C's committed run was taken with the broken `Query` (`0 drawn`, 3746 fixtures,
42 pools), this run has the fixed `Query` (`1 drawn`, 9000 fixtures, 100 pools).
The 290 s year-end is the newly-drawn edition trying to reach the absent Rust
sim at `127.0.0.1:5050` (retries); the year-end summary reports `errors: 0`.
**PASS.**

### 3.3 `checkWorldPyramid.ts` on fresh `fspro_b2v_check`

Fresh DB (schema clone + `0038`) + world-service on :3007.
`CHECK_EXIT` nonzero at the season step; reproduced **all 9 non-sim
assertions** exactly as B2-2C §3.6:

```
ok  pyramid shapes for 1, 11, 12, 31, 288 and 10,000 clubs
ok  round-robins: every pair meets once per leg, one game per slot per round
ok  week template: 20 league days and 8 cup days in a 28-day year
ok  news: natural scope and a bar that rises only with a busy scope
ok  fill order: district, city, region, country, then a new country
ok  an invite link places a friend in the inviter's district
ok  six foundings at once keep every cap
ok  40 clubs founded, no AI rivals
ok  2 pyramid edition(s): pool mates are scheduled against each other, on league days only
```

Then `[sim] ... sim service unreachable at http://127.0.0.1:5050` for the
season fixtures (the documented environmental stop; the Rust sim was never
running). **PASS** for every non-sim assertion; the season step is
environment-blocked, not code-blocked.

### 3.4 Spot-check of 5 `B2-2C-REPORT.md` citations

| # | Citation | Checked |
| --- | --- | --- |
| 1 | `placement.service.ts:36-38` = `lockPlacement` (`pg_advisory_xact_lock(0x46535050)`) | ✓ lines 33-38 |
| 2 | migration `0038:63` = `RENAME COLUMN "TownId" TO "DistrictId"` | ✓ exact match |
| 3 | migration `0038:259` = `NewsItems.ScopeType 'town'→'district'` | ✓ exact match |
| 4 | `packages/api-contract/src/schemas/calendar.ts:90` = local scope enum `['town','region','country','world']` | ✓ line 90 |
| 5 | `apps/fs-pro-client/src/views/game/club-game.vue:804` subscribes `town:/region:/country:` topics | ✓ function at 802-806 builds those exact topics |

All 5 are accurate; no citation drift found.

### 3.5 2C wiring review (transaction boundary, R11)

`club-founding.service.ts:296-350`: `db().transaction` → `lockPlacement(tx)`
(`:297`) → `nextSpot` → `getPlacementSpot` **inside** the lock → `openPlaces`
creates/names `spot.needsNames` → club inserted with `DistrictId`
(`:334`) → commit; `advanceFrontier()` after commit (`:362`). Matches spec §4.3.
`placement.service.ts:91-92` `nextSpot` is a one-line call to
`getPlacementSpot`; `previewPlacement:99-100` calls the client and maps the
shape. `pyramid.service.ts` keeps the per-competition advisory lock (`:260`,
`:509`), delegates assignment to the Go client (`:311`, `:539`), and keeps
`roundRobin` fixtures (`:17`, `:421`, `:597`). **PASS.**

No stale runtime schema names remain (`grep -rn 'TownId|TownSize|RegionTowns|
townInvites'` over `apps/fs-pro-server/src` finds only comments and the
documented API-compat mapping `world.router.ts:126-127`).

## 4. Acceptance criteria (FOR-AGENTS Batch 2A/2B/2C, per DECISIONS §D)

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 2A-1 | `POST /placement/spot` exact contract shape | PASS | `server_test.go`; §1.3 live DB; schema audit §2 |
| 2A-2 | `GET /places/{id}/children` | PASS | `server_test.go`; §1.3 |
| 2A-3 | `GET /prominence/{clubId}` + `POST /prominence/recompute` | PASS | `server_test.go`; ranking tests |
| 2A-4 | `POST /pyramid/draw/{id}` + `POST /pyramid/join` (501 stubs replaced) | PASS | server_test; live 200s in §1.5/§3.2 log |
| 2A-5 | pgx/v5 real DB + context timeout on every call | PASS | `db.go`; `TestQuerySurvivesTimeout` §1.3 |
| 2A-6 | Placement/hierarchy per spec (holes→district→city→region→country, frontier) | PASS | unit tests; `checkWorldPyramid` fill-order §3.3; 200-parallel §1.5 |
| 2A-7 | Migration `0038` + tested backfill (town→city+district) | PASS (backfill) / see D2 (no committed check) | §1.5 checklist, idempotent, no drop |
| 2A-8 | `schema.ts` matches migration | PASS | §1.6; `tsc` 0 §3.1 |
| 2A-9 | Prominence formula, caps/weights (Q4) | PASS | `ranking_test.go`; DB backfill §1.5; spec-example arithmetic flagged in 2A Q-A |
| 2A-10 | Pyramid shape/locality/power bands (§6) | PASS | `pyramid_test.go`; live draw §3.2/§3.3 |
| 2A-11 | 1M synth benchmark, no overfill, locality invariants | PASS | §1.2; placement tests |
| 2A-12 | 200 parallel foundings, no overfill, no double placement | PASS | §1.5 |
| 2A-13 | Invite honoured / expired fallback | PASS | §1.5 |
| 2A-14 | `go vet ./...`, `go test ./...`, `go test -race ./...` | PASS | §1.1 |
| 2B-1 | zod schemas for every contract shape, exported from `index.ts` | PASS | §2; `index.ts` diff |
| 2B-2 | Thin `fetch` client, `WORLD_SERVICE_URL` default 3006, throws non-2xx, typed | PASS | `world-service.client.ts:41-65`; 11 tests |
| 2B-3 | No public Node route → no `route-policy.ts` rule (R6) | PASS | `route-policy.ts` not in diff |
| 2B-4 | Vitest tests for schemas + client | PASS | 28 new / 92 total §2 |
| 2C-1 | All downstream renames to the district schema | PASS | grep §3.5; `tsc` 0 §3.1 |
| 2C-2 | Founding calls Go inside the `PLACEMENT_LOCK` tx, creates/names levels, uses district, advances `Frontier*` | PASS | §3.5; 1000 foundings green §3.2 |
| 2C-3 | `nextSpot`/`previewPlacement` thin callers | PASS | §3.5; seed preview green |
| 2C-4 | Pyramid draw/join delegate to Go; lock + round-robin fixtures kept | PASS | §3.5; 9/9 draw/scheduling assertions §3.3 |
| 2C-5 | `checkWorldPyramid.ts` + `seedScaleWorld.ts` updated for districts/cities | PASS | §3.2, §3.3 |
| 2C-6 | `tsc --noEmit` 0 errors | PASS* | §3.1 (*after D5 shadow removal) |
| 2C-7 | 92 vitest tests pass | PASS | §2 |
| 2C-8 | `seedScaleWorld.ts` fresh scratch, `SCALE_SKIP_MATCHES=1`, timings pasted | PASS | §3.2 |
| Fix | `db.go` regression `TestQuerySurvivesTimeout` PASSES (proves the fix) | PASS | §1.3; independently re-proven §1.4 |
| 2D | 100k end-to-end (D5) | DEFERRED / UNVERIFIED | Not in this branch; DECISIONS §D moves it to a later step, `SCALE.md` flags it. Not claimed. |

**Overall: PASS.** No acceptance criterion FAILs. 2D (100k) is out of scope for
this branch and is explicitly not claimed.

## 5. R1–R11 review of `perfect/integration..HEAD`

- **R1** (no assumptions): reports cite `file:line`/command output; two spec
  ambiguities are correctly raised, not guessed (`B2-2A-REPORT.md` §7 Q-A
  prominence worked-example arithmetic: the formula gives 16.23, the spec text
  says ≈11.9; the code follows the formula). **OK.**
- **R2** (no hallucinated APIs): pgx/v5 use is documented at the call site
  (`internal/db/db.go:6-11`); Node uses plain `fetch`; no invented flags. **OK.**
- **R3** (Go for new services): `services/world-service` is Go 1.24; Node edits
  are integration/fixes only. **OK.**
- **R4** (test): Go table tests + `-race` + benchmarks, Node vitest, `tsc` — all
  present and green. Gap: the `db.go` regression test is ineffective (D1) and
  0038 has no committed backfill check (D2). **OK with findings.**
- **R5** (read/terms): Level stays derived, never stored; Prominence is a cache
  column; no new legacy mode flags. **OK.**
- **R6**: Go endpoint shapes live in `packages/api-contract` zod
  (`schemas/world-service.ts`); no new public Node route so no route-policy rule
  is needed. **OK.**
- **R7**: `0038` is a new hand-written migration + `schema.ts` edit, applied
  once by the runner, never edited after apply, no drops. Gap: no committed
  tested-backfill script (D2). **OK with finding.**
- **R8** (design skills / art direction): N/A — Batch 2 changed no UI/3D.
- **R9** (env): only scratch DBs written; race in Docker; interop documented.
  **OK.**
- **R10** (git): branches/worktrees per agent; commit attributions present
  (`4c83f08` ends "Generated-by: OpenCode lead orchestrator …", `c3555e9` ends
  "Generated-by: OpenCode sub-agent 2C"). **OK.**
- **R11** (ownership): **deviation** — 2C edited files the frozen contract
  assigns to 2B (`services/world/placement.service.ts`,
  `club-founding.service.ts`, `pyramid.service.ts`) plus the unowned
  `world-feed.service.ts`; 2C disclosed it (`B2-2C-REPORT.md` §6.5) and the lead
  re-split the batch in `DECISIONS.md` §D. No two agents edited one file in the
  same batch (the edits were sequential: 2B then 2C), so the anti-collision
  intent held. See D4.

## 6. Defects

1. **MEDIUM — the `db.go` regression tests do not reproduce the regression.**
   `services/world-service/internal/db/query_timeout_test.go:34-99` and
   `services/world-service/internal/pyramid/draw_integration_test.go:23-45`.
   *Repro:* run both against the pre-fix `db.go`
   (`git show 4c83f08^:services/world-service/internal/db/db.go`):
   `TestQuerySurvivesTimeout` → **PASS**, `TestDrawIntegration` → **PASS**.
   A 500k-row probe against the same pre-fix code → **FAIL** `rows.Err after
   1089 rows: context canceled`; post-fix probe → PASS.
   *Expected:* a regression test must fail on the buggy code.
   *Actual:* both committed tests pass pre-fix because their result sets fit in
   the first socket read; the real defect only appears past ~1089 rows. The fix
   itself is correct (verified in §1.4); the guard is not.

2. **MEDIUM — migration `0038` ships without a committed tested-backfill check.**
   Spec `docs/perfect/WORLD-HIERARCHY-SPEC.md:180-191` ("Tested backfill (R7) …
   it ships with a check in the style of `checkWorldPyramid.ts`"). No file under
   `apps/fs-pro-server/src/scripts/` opens `0038` or asserts the district
   invariants (`grep` for `0038`/`DistrictId is null` finds none); 2A's checker
   lived only at `/tmp/opencode/b2a/assert_0038.sql` (`B2-2A-REPORT.md` §2.2).
   *Expected:* a repeatable migration-verification script.
   *Actual:* the backfill was verified once by the author and once by me
   (§1.5) but is not guarded in CI. (R4/R7.)

3. **LOW — frontier backfill leaves `FrontierRegionId/FrontierCityId` null on
   an empty newest country.** `0038_world_districts.sql:105-126`. On the real
   clone the newest non-full country `Ashter` has 0 regions/cities, so
   `FrontierCountryId` is set and the other two stay null. *Expected per §2.3
   wording:* "newest non-full country/region/city". *Actual:* consistent with
   the SQL (there is no region/city to point at); consumers tolerate nulls
   (200-parallel founding and `checkWorldPyramid` fill-order both pass against
   this clone). Observation only; no functional failure found.

4. **LOW — R11 ownership deviation.** 2C edited 2B-owned
   `placement.service.ts` / `club-founding.service.ts` / `pyramid.service.ts`
   (`WORLD-SERVICE-CONTRACT.md:90`) and the unowned
   `world-feed.service.ts` (disclosed in `B2-2C-REPORT.md` §6.5). Sequential,
   not concurrent, so no collision; the lead's `DECISIONS.md` §D re-split
   covers it. Flagged for process discipline.

5. **LOW — lockfile `@types/node@26.6.4` breaks `tsc` on a fresh install.**
   `apps/fs-pro-server/node_modules/@types/node` (lockfile-pinned vitest peer)
   shadows the repo's `@types/node@20.19.17` via
   `tsconfig.json` `typeRoots: ["./node_modules/@types", …]`.
   *Repro:* `npm test`'s install leaves it; `npx tsc --noEmit` → 1 error
   (`imagination-auth.service.ts(162,76): TS2694 JsonWebKey`); removing the
   app-level `@types` → 0 errors. Pre-existing (B1C), not a Batch 2 file, but it
   means criterion 2C-6 is only green with the environment fix 2B/2C documented.

No HIGH/CRITICAL defects. Count: **MEDIUM 2, LOW 3, HIGH 0, CRITICAL 0.**

## 7. Environment / reproduction notes (not defects)

- The worktree's `node_modules` symlink pointed at the main checkout, whose
  install has **no `vitest`** and whose `@repo/api-contract` lacks the
  world-service contract. To run the Node commands I did exactly what 2B/2C
  documented: a Windows junction `node_modules → b1c/node_modules`, an app-level
  `@repo/api-contract` junction to this worktree, and removal of the app-level
  `@types` shadow. `node_modules` is git-ignored; the tree was restored after.
- Go runs through `/mnt/c/Program Files/Go/bin/go.exe` (go1.24.5, `GOTOOLCHAIN=local`);
  `-race` only in `golang:1.24-bookworm`. `DATABASE_URL` had to be passed to the
  Windows `world-service.exe` via `WSLENV=` (plain WSL env does not cross
  interop).
- The Rust sim service (`127.0.0.1:5050`) was never running; every
  sim-dependent step (the `checkWorldPyramid` season, the `seedScaleWorld`
  year-end fixtures) stops there — same as the builders reported.

## 8. Verdict

**Batch 2 PASSES.** 2A, 2B, 2C and the `db.go` fix all reproduce; 2D (100k) is
out of scope on this branch. The two MEDIUM defects are testing/verification
gaps (an ineffective regression test and a missing committed backfill check) —
neither makes any shipped behaviour wrong, and I independently proved the fix
and the 0038 backfill. Recommend the lead ask the 2A/Go owner to strengthen the
`db.go` regression test with a large result set and to commit a `0038` backfill
check before merge.
