# B2-FIX-REPORT.md — Batch 2 defects D1, D2, D3, D5

Fix agent (FIX b2). Branch **`perfect/b2-fix`**, worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b2f` (base `perfect/b2-verify` @
`f7a4d35`). Program: `FOR-AGENTS.md` (R1–R11, R4/R7),
`docs/perfect/VERIFY-B2.md` (defect list), `docs/perfect/DECISIONS.md`,
`docs/perfect/WORLD-SERVICE-CONTRACT.md`.

No migration SQL, `schema.ts`, contract spec or other Node service was
edited. D4 (the R11 process deviation) was not in this brief.

## 0. Result

| # | Severity | Verdict | Evidence |
| --- | --- | --- | --- |
| D1 | MEDIUM | **FIXED** — regression now fails pre-fix, passes post-fix | §1 |
| D2 | MEDIUM | **FIXED** — committed `checkWorldDistricts.ts`, 10/10 checks PASS on a migrated data clone | §2 |
| D3 | LOW | **DOCUMENTED** — null is correct and asserted; no migration edit allowed (R7) | §3 |
| D5 | LOW | **FIXED** — `tsc --noEmit` green with the hoisted `@types/node@26` shadow | §4 |

Files changed:

| File | Change |
| --- | --- |
| `services/world-service/internal/db/query_timeout_test.go` | D1 — regression consumes 500k rows and fails on the pre-fix code |
| `apps/fs-pro-server/src/scripts/checkWorldDistricts.ts` | D2 — new committed tested-backfill check (two-step capture/assert) |
| `apps/fs-pro-server/tsconfig.json` | D5 — `typeRoots` resolves `@types` from the workspace root, not the hoisted app-local shadow |

`git status --short` on `perfect/b2-fix`:

```
 M apps/fs-pro-server/tsconfig.json
 M services/world-service/internal/db/query_timeout_test.go
?? apps/fs-pro-server/src/scripts/checkWorldDistricts.ts
```

Scratch databases: a **new** `fspro_b2f` was built from the live `fspro` with
the `postgres:17-alpine pg_dump` recipe (`Places=39, towns=24, Clubs=50,
TownInvites=0, Calendars 6/8`). The dev `fspro`, `fspro_pyramid_check` and
`fspro_b2a` were never written. All other scratch DBs were left alone.

---

## 1. D1 — make the `db.go` regression actually fail on the pre-fix code

`VERIFY-B2.md` D1: `TestQuerySurvivesTimeout` and `TestDrawIntegration` both
**PASS** on the pre-fix `db.go`; the verifier's 500k probe failed at row 1089.
Cause: pgx buffers the first socket read, so a small result set (`…5`) is
consumed even though the per-call context was cancelled on return.

**Fix** (`services/world-service/internal/db/query_timeout_test.go`): the
first subtest now streams `SELECT generate_series(1, $1)` with **500,000** and
asserts the full count plus `rows.Err()`. The comment records why the failure
is data-size dependent. The `QueryRow` and in-flight subtests are unchanged.

### Before (pre-fix `db.go`) — FAIL

Pre-fix file taken from `git show 4c83f08^:services/world-service/internal/db/db.go`
into a temp copy, strengthened test run in `golang:1.24-bookworm` against
`fspro_b2f`:

```
$ cp -r services/world-service /tmp/opencode/b2f/ws-prefix
$ git show 4c83f08^:services/world-service/internal/db/db.go > /tmp/opencode/b2f/ws-prefix/internal/db/db.go
$ docker run --rm --network host -v /tmp/opencode/b2f/ws-prefix:/w -v b2fix-gomod:/go/pkg/mod \
    -w /w -e WORLD_TEST_DATABASE_URL=postgres://fspro:superpassword@localhost:5434/fspro_b2f \
    golang:1.24-bookworm go test ./internal/db -run TestQuerySurvivesTimeout -v -count=1
=== RUN   TestQuerySurvivesTimeout
=== RUN   TestQuerySurvivesTimeout/large_Query_result_is_fully_consumable_after_return
    query_timeout_test.go:59: rows.Err after 1089 rows (want 500000): context canceled
=== RUN   TestQuerySurvivesTimeout/QueryRow_is_scannable_after_return
=== RUN   TestQuerySurvivesTimeout/in-flight_Query_is_not_cancelled_before_consumption
=== RUN   TestQuerySurvivesTimeout/in-flight_QueryRow_is_not_cancelled_before_Scan
--- FAIL: TestQuerySurvivesTimeout (0.63s)
    --- FAIL: TestQuerySurvivesTimeout/large_Query_result_is_fully_consumable_after_return (0.01s)
    --- PASS: TestQuerySurvivesTimeout/QueryRow_is_scannable_after_return (0.01s)
    --- PASS: TestQuerySurvivesTimeout/in-flight_Query_is_not_cancelled_before_consumption (0.30s)
    --- PASS: TestQuerySurvivesTimeout/in-flight_QueryRow_is_not_cancelled_before_Scan (0.30s)
FAIL
FAIL	fs-pro-world-service/internal/db	0.633s
```

Byte-for-byte the verifier's failure (`rows.Err after 1089 rows … context
canceled`), now inside the committed test.

### After (fixed `db.go`) — PASS

```
$ docker run --rm --network host -v "$(pwd)/services/world-service":/w -v b2fix-gomod:/go/pkg/mod \
    -w /w -e WORLD_TEST_DATABASE_URL=postgres://fspro:superpassword@localhost:5434/fspro_b2f \
    golang:1.24-bookworm go test ./internal/db -run TestQuerySurvivesTimeout -v -count=1
=== RUN   TestQuerySurvivesTimeout
=== RUN   TestQuerySurvivesTimeout/large_Query_result_is_fully_consumable_after_return
=== RUN   TestQuerySurvivesTimeout/QueryRow_is_scannable_after_return
=== RUN   TestQuerySurvivesTimeout/in-flight_Query_is_not_cancelled_before_consumption
=== RUN   TestQuerySurvivesTimeout/in-flight_QueryRow_is_not_cancelled_before_Scan
--- PASS: TestQuerySurvivesTimeout (0.71s)
    --- PASS: TestQuerySurvivesTimeout/large_Query_result_is_fully_consumable_after_return (0.11s)
    --- PASS: TestQuerySurvivesTimeout/QueryRow_is_scannable_after_return (0.00s)
    --- PASS: TestQuerySurvivesTimeout/in-flight_Query_is_not_cancelled_before_consumption (0.30s)
    --- PASS: TestQuerySurvivesTimeout/in-flight_QueryRow_is_not_cancelled_before_Scan (0.30s)
PASS
ok  	fs-pro-world-service/internal/db	0.722s
```

`draw_integration_test.go` is untouched: it exercises the real `Draw` path but
its result set is bounded by the country's club count (50 here), so it cannot
reproduce the >1089-row trigger; the strengthened `TestQuerySurvivesTimeout`
is the guard for `db.Pool.Query`, which is what the fix changed.

---

## 2. D2 (R4/R7) — commit a tested-backfill check for migration 0038

`VERIFY-B2.md` D2: 0038 shipped with no committed check under
`apps/fs-pro-server/src/scripts/`.

**Fix**: new `apps/fs-pro-server/src/scripts/checkWorldDistricts.ts`. Because
0038 renames columns/tables in place and repoints rows, the "before" values
are gone after it runs, so the check is a two-step workflow against the same
scratch clone:

```bat
:: 1. on the pre-0038 clone, snapshot the old world
set DATABASE_URL=postgres://fspro:superpassword@localhost:5434/fspro_b2f
npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts --capture

:: 2. apply 0038 (runner or psql -1 -f)

:: 3. assert the WORLD-HIERARCHY-SPEC §2.3 checklist
npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts
```

`--capture` writes three small tables into the clone
(`check_world_districts_meta/_towns/_invites`); 0038 never touches them.
The check refuses the dev DB by name (`fspro`) the way
`checkWorldPyramid.ts:157` refuses a non-scratch DB, and refuses a missing
capture / an unmigrated clone.

It asserts, per the task and spec §2.3:

- every old `town` is now a `city` with exactly one `district`, no `town` rows;
- `Clubs` count preserved; **no new null `DistrictId`** (post count == captured
  pre count) and every `DistrictId` is a district whose parent is a city;
- `PlaceStats` equals `GROUP BY Clubs.DistrictId` for every district, one row
  per district;
- `PlaceInvites` count preserved, every invite repointed to a district of its
  old town, `Level='district'`;
- `Calendars.DistrictClubs/RegionCities` keep the old `TownSize/RegionTowns`;
- supporting schema (PlaceInvites/PlaceStats/TileRevisions, news `town`→
  `district`, Prominence range) and the D3 frontier-pointer consistency.

### Evidence

Clone `fspro_b2f` from live `fspro`; 2 synthetic invites seeded (clearly
labelled) so the repoint branch is exercised (live data has 0 invites, same
as the verifier's §1.5):

```
$ psql … -c "INSERT INTO \"TownInvites\" (…) SELECT 'b2f-synthetic-'||row_number() over (), … LIMIT 2"
INSERT 0 2

$ npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts --capture
captured: 24 town(s), 50 club(s) (1 null TownId), 2 invite(s), capacities 6/8
now apply 0038, then re-run without --capture

$ psql -h localhost -p 5434 -U fspro -d fspro_b2f -1 -v ON_ERROR_STOP=1 \
    -f apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql
UPDATE 24 ; INSERT 0 24 ; … ; UPDATE 49 ; … ; UPDATE 2 ; … ; UPDATE 50 ; INSERT 0 24 ; … ; UPDATE 73
APPLY_EXIT=0

$ npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts
  ok  towns_gone: 0 (captured 24 old town(s))
  ok  each old town is a city with exactly one district (24/24)
  ok  cities 24 (>= 24), every city has a district
  ok  clubs 50, null DistrictId preserved at 1 (1 before)
  ok  every DistrictId is a district whose parent is a city
  ok  PlaceStats matches GROUP BY Clubs.DistrictId (24 district rows)
  ok  PlaceInvites 2/2 preserved, repointed to their old town's district, Level=district
  ok  Calendars DistrictClubs/RegionCities kept 6/8
  ok  PlaceInvites/PlaceStats/TileRevisions present, news scope migrated, Prominence in range
  ok  frontier pointer consistent; region/city null only when that level is empty (D3)

10 checks passed
CHECK_EXIT=0
```

Re-run on the now-migrated clone (repeatable; captures survived 0038) → same
10/10 PASS.

Guard (dirty dev DB refusal, no write performed):

```
$ DATABASE_URL=postgresql://fspro:superpassword@localhost:5434/fspro \
    npx ts-node --transpile-only src/scripts/checkWorldDistricts.ts --capture
Error: Refusing to run against the dev database "fspro"; use a scratch clone
GUARD_EXIT=1
```

---

## 3. D3 — frontier `RegionId/CityId` null on an empty newest country

`VERIFY-B2.md` D3: `0038_world_districts.sql:105-126` sets
`FrontierCountryId` to the newest country and leaves `FrontierRegionId/CityId`
null when that country has no regions/cities. The brief says "prefer a correct
backfill", but **R7 forbids editing an applied migration** and the migration is
outside this fix's ownership, so the behaviour is documented and guarded
instead of changed.

It is correct, not a bug:

```
$ psql … -d fspro_b2f -x -c 'SELECT c."FrontierCountryId", pc."Name",
    (select count(*) … regions) regions, c."FrontierRegionId", c."FrontierCityId" …'
FrontierCountryId | 52acd11f-a6ef-4efc-86fa-0d48fe929aa1
country           | Ashter
regions           | 0
FrontierRegionId  |
FrontierCityId    |
```

The newest (frontier) country `Ashter` has **0 regions and 0 cities**, so
there is no region/city to point at. The pointers are a performance hint, not
the source of truth: the Go service recomputes them from indexed counts when
null or stale —

- `internal/placement/placement.go:357-374` `frontierCountry` selects the
  newest country itself and never reads `FrontierCountryId`;
- `internal/placement/placement.go:378-398` `capitalCity` reads
  `FrontierCityId` only if it belongs to the country, otherwise falls back to
  the country's oldest city (and returns `nil,nil` when the country has no
  city).

The consumers already tolerate the nulls: the verifier's 200-parallel founding
and `checkWorldPyramid` fill-order both pass against this clone. The new
`checkWorldDistricts.ts` now asserts the invariant explicitly — a region/city
pointer is null **only** when that level is empty under the frontier — so the
one legitimate null case is guarded instead of accidental.

---

## 4. D5 — hoisted `@types/node@26` breaks `tsc` on a fresh install

`VERIFY-B2.md` D5: a fresh `npm ci` hoists
`apps/fs-pro-server/node_modules/@types/node@26.6.4` (vitest 5.0.3's optional
peer, `package-lock.json:162`) which shadows the repo's `@types/node@20.19.17`
(`package-lock.json:3826`) because `tsconfig.json` had
`typeRoots: ["./node_modules/@types", …]`, producing
`imagination-auth.service.ts(162,76): TS2694 … 'JsonWebKey'`.

**Fix** (`apps/fs-pro-server/tsconfig.json`): `typeRoots` now points at the
workspace root `../../node_modules/@types` first, so the app compiles against
the same `@types/node@20` the rest of the repo uses regardless of the
app-local hoist. `package.json`/`package-lock.json` were **not** changed, so
no lockfile churn and no `overrides` that could fight vitest's peer range.

The verifier's fresh-install state was reproduced exactly by extracting the
lockfile's `@types/node@26.6.4` tarball into
`apps/fs-pro-server/node_modules/@types/node`:

### Before (shadow present, old tsconfig) — 1 error

```
$ tar xzf node-26.6.4.tgz -C apps/fs-pro-server/node_modules/@types/node --strip-components=1
$ (cd apps/fs-pro-server && npx tsc --noEmit)          # TSC_EXIT=2
src/services/auth/imagination-auth.service.ts(162,76): error TS2694: Namespace '"crypto"' has no exported member 'JsonWebKey'.
```

### After (shadow still present, `typeRoots` fixed) — 0 errors

```
$ (cd apps/fs-pro-server && npx tsc --noEmit)          # TSC_EXIT=0
(no output)
```

The shadow was then removed and a final run is green (`TSC_EXIT=0`, no
output). A real fresh `npm ci` produces the same nested 26 (per the lockfile)
and the fixed `typeRoots` ignores it, so CI `tsc` passes.

---

## 5. R4 test outputs

`go vet` + `go test ./...` and `go test -race ./...` in
`golang:1.24-bookworm` over `services/world-service`:

```
$ docker run --rm -v "$(pwd)/services/world-service":/w -v b2fix-gomod:/go/pkg/mod -w /w \
    golang:1.24-bookworm sh -c 'go vet ./... && echo VET_OK && go test ./... && echo TEST_OK'
VET_OK
ok  	fs-pro-world-service/cmd/world-service	0.011s
ok  	fs-pro-world-service/internal/config	0.013s
ok  	fs-pro-world-service/internal/db	0.065s
ok  	fs-pro-world-service/internal/http	0.015s
ok  	fs-pro-world-service/internal/placement	0.013s
ok  	fs-pro-world-service/internal/pyramid	0.014s
ok  	fs-pro-world-service/internal/ranking	0.010s
ok  	fs-pro-world-service/internal/synth	0.082s
ok  	fs-pro-world-service/internal/tiles	0.008s
TEST_OK

$ docker run --rm -v "$(pwd)/services/world-service":/w -v b2fix-gomod:/go/pkg/mod -w /w \
    golang:1.24-bookworm go test -race ./...
ok  	fs-pro-world-service/cmd/world-service	1.031s
ok  	fs-pro-world-service/internal/config	1.034s
ok  	fs-pro-world-service/internal/db	1.081s
ok  	fs-pro-world-service/internal/http	1.035s
ok  	fs-pro-world-service/internal/placement	1.033s
ok  	fs-pro-world-service/internal/pyramid	1.040s
ok  	fs-pro-world-service/internal/ranking	1.028s
ok  	fs-pro-world-service/internal/synth	1.418s
ok  	fs-pro-world-service/internal/tiles	1.024s
```

New Node check: `checkWorldDistricts.ts` 10/10 PASS (§2). Typecheck:
`npx tsc --noEmit` in `apps/fs-pro-server` → `TSC_EXIT=0` (§4). `package.json`
was not touched, so no clean-install step beyond the reproduced hoist.

## 6. Known gaps / notes

- D3 is a documentation fix by necessity: changing the applied migration would
  violate R7 and the brief's "do not edit the migration SQL". The behaviour is
  asserted by the new check.
- `checkWorldDistricts.ts` needs the two-step capture because 0038 is a
  destructive in-place data migration; this is the only way to assert
  preservation without hard-coding dev values.
- All DB work used the new scratch `fspro_b2f`; no dev/active DB was written.

Commit on `perfect/b2-fix`; message ends
`Generated-by: OpenCode sub-agent b2-fix`.
