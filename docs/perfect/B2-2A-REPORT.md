# B2-2A-REPORT — Go world-service placement/hierarchy + district migration

Agent: **2A**. Program: `FOR-AGENTS.md` (R1–R11, D1–D5). Batch: **2 (2A — Go
service + schema)**.
Worktree: `/mnt/c/done/fs-pro/.claude/worktrees/b2a`, branch **`perfect/b2-2a`**
(off `perfect/integration` @ `0c9971f`).
Inputs followed verbatim: `docs/perfect/WORLD-HIERARCHY-SPEC.md` (approved),
`docs/perfect/WORLD-SERVICE-CONTRACT.md` (frozen), `docs/perfect/DECISIONS.md`
(Q1–Q8 binding), `docs/perfect/B1-1B-REPORT.md`.

Status: **complete for the 2A scope.** All six contract endpoints are real
(pgx/v5, per-call context timeouts), migration 0038 is applied+asserted+
idempotency-checked on a scratch DB, `schema.ts` matches, table-driven tests +
`-race` + the 1M synth benchmarks run. Two spec-wording ambiguities and one
integration boundary are in Open Questions (§7), not guessed.

---

## 1. What changed (files)

| File | Change |
| --- | --- |
| `services/world-service/internal/placement/placement.go` | real DB placement (`Spot`, `Children`), Settings, invites, frontier growth; `db.Querier`-backed |
| `services/world-service/internal/placement/geo.go` | new — `world-geo.ts` geometry port (golden-angle spot finders) |
| `services/world-service/internal/placement/sim.go` | new — pure in-memory placement simulation for the 1M benchmark |
| `services/world-service/internal/placement/placement_test.go` | table-driven `Simulate` invariants + `BenchmarkPlacementSynth1M` |
| `services/world-service/internal/placement/db_integration_test.go` | new — 200-parallel founding test against a scratch DB (env-gated) |
| `services/world-service/internal/ranking/ranking.go` | prominence §5.1 formula, §5.2 tie-breaks, `levelForXp`, DB `Get`/`Recompute` |
| `services/world-service/internal/ranking/ranking_test.go` | table-driven formula/level/tie-break + `BenchmarkRankSynth1M` |
| `services/world-service/internal/pyramid/pyramid.go` | §6.1 `Shape`, §6.2 locality, §6.5 power bands, DB `Draw`/`Join` |
| `services/world-service/internal/pyramid/pyramid_test.go` | shape parity, assignment/locality invariants + `BenchmarkAssignSynth1M` |
| `services/world-service/internal/http/server.go` | six real handlers per contract; health unchanged |
| `services/world-service/internal/http/server_test.go` | fake-service route tests (shapes, 400/404/503, empty arrays) |
| `services/world-service/internal/db/db.go` | + `Querier` interface (pool or tx; test injection) |
| `services/world-service/cmd/world-service/main.go` | wire placement/ranking/pyramid services into the server |
| `apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql` | new — §2.3 migration + backfill |
| `apps/fs-pro-server/src/db/drizzle/schema.ts` | drizzle model match: city/district, DistrictId, prominence, capacities, PlaceInvites/PlaceStats/TileRevisions |

`git status --short` shows exactly the above (11 modified, 4 new); no file
outside the 2A ownership list. No Node service, api-contract, route-policy,
script or `SCALE.md` was touched.

---

## 2. Migration 0038 and the scratch-DB test

### 2.1 Scratch DB (PROGRESS.md pg_dump recipe)

```
$ docker run --rm --network host -e PGPASSWORD=superpassword postgres:17-alpine \
    pg_dump -h localhost -p 5434 -U fspro --no-owner --no-privileges fspro > fspro_b2a_dump.sql
$ psql ... -c 'DROP DATABASE IF EXISTS fspro_b2a'; psql ... -c 'CREATE DATABASE fspro_b2a'
$ docker run --rm --network host -i ... postgres:17-alpine psql ... -d fspro_b2a -q < fspro_b2a_dump.sql
=== verify clone ===
39|50|24|0          # Places, Clubs, towns, TownInvites
```

`fspro_pyramid_check` (10k run active) and `fspro` were never opened for write.
The clone is schema **and** data so the town→city backfill has rows to migrate.

### 2.2 Apply + assertion checklist

Applied the raw file in one transaction, then ran the §2.3 checklist
(`/tmp/opencode/b2a/assert_0038.sql`):

```
$ psql -1 -f .../0038_world_districts.sql          # APPLY_EXIT=0
$ psql -f assert_0038.sql
 check_name                        | pass | detail
-----------------------------------+------+---------
 all_district_leaf_points_city     | t    | 0
 cal_settings_preserved            | t    | 6/6 8/8
 cities_created                    | t    | 24
 clubs_preserved                   | t    | 50
 districts_count                   | t    | 24
 each_city_one_district            | t    | 24/24
 invite_counts_preserved           | t    | 3
 invites_repointed_to_town_district| t    | 0
 no_new_null_district              | t    | 0
 null_district_total_preserved     | t    | 1
 placestats_matches_group_by       | t    | 0
 prominence_in_range               | t    | 0
 towns_gone                        | t    | 0
```

`null_district_total_preserved = 1` is **not a defect**: the one club with a
null district was already a released club with a null `TownId` before the
migration (`no_new_null_district = 0`). Inventing a district for it would be
data invention; §2.3's "no null DistrictId" is asserted for clubs that had a
place.

### 2.3 Idempotency

```
$ psql -1 -f .../0038_world_districts.sql   # 2nd run
REAPPLY_EXIT=0
$ psql -f assert_0038.sql                   # identical 13-row all-pass output
```

Every rename/add/create is guarded; `grep -inE "drop (column|table|constraint)"`
→ **none** (TownId and TownInvites are renamed, never dropped).

### 2.4 PlaceStats trigger

Insert/move/delete a club and the projection follows:

```
before: d1=2 d2=2
after insert: d1=3 (want 3)
after move:   d1=2 (want 2), d2=3 (want 3)
after delete: d1=2 (want 2), d2=2 (want 2)
=== migration still matches group by === 0
```

### 2.5 Runner compatibility

`apply-sql-migrations.ts:39` globs `/^\d{4}_.+\.sql$/` with number ≥
`FIRST_UNJOURNALED=15`; `0038_world_districts.sql` matches and the file is
self-contained (no application code), so the runner will apply it once in its
own transaction and journal it in `SqlMigrations`. The runner could not be
executed here (its workspace `node_modules` is absent in the worktree and the
dev DB `fspro` is off-limits); the raw psql application is the same SQL and
transaction semantics.

---

## 3. Commands and output (R4)

`go` = `/mnt/c/Program Files/Go/bin/go.exe` (`go1.24.5 windows/amd64`) via
interop; `GOTOOLCHAIN=local`.

### 3.1 gofmt / vet / test (Windows, fresh)

```
$ go test -count=1 ./...
ok  	fs-pro-world-service/cmd/world-service	0.936s
ok  	fs-pro-world-service/internal/config	0.637s
ok  	fs-pro-world-service/internal/db	1.548s
ok  	fs-pro-world-service/internal/http	1.366s
ok  	fs-pro-world-service/internal/placement	1.588s
ok  	fs-pro-world-service/internal/pyramid	1.215s
ok  	fs-pro-world-service/internal/ranking	1.051s
ok  	fs-pro-world-service/internal/synth	1.112s
ok  	fs-pro-world-service/internal/tiles	0.870s
```

### 3.2 vet + test in `golang:1.24-bookworm`

```
$ docker run --rm -v <abs>:/w -w /w golang:1.24-bookworm sh -c 'go vet ./... && echo VET_OK && go test ./... && echo TEST_OK'
VET_OK
ok  	fs-pro-world-service/cmd/world-service	0.010s
... (all 9 packages ok) ...
TEST_OK
```

### 3.3 `go test -race ./...` in Docker (Q7)

```
$ docker run --rm -v <abs>:/w -w /w golang:1.24-bookworm go test -race ./...
ok  	fs-pro-world-service/cmd/world-service	1.028s
ok  	fs-pro-world-service/internal/config	1.025s
ok  	fs-pro-world-service/internal/db	1.077s
ok  	fs-pro-world-service/internal/http	1.031s
ok  	fs-pro-world-service/internal/placement	1.031s
ok  	fs-pro-world-service/internal/pyramid	1.036s
ok  	fs-pro-world-service/internal/ranking	1.024s
ok  	fs-pro-world-service/internal/synth	1.395s
ok  	fs-pro-world-service/internal/tiles	1.020s
```

### 3.4 1M benchmarks driven by `internal/synth` (`-bench . -benchmem`)

Windows (`goos: windows`, i7-11800H):

```
BenchmarkGenerate1M-16          55    21431456 ns/op   48005237 B/op     2 allocs/op
BenchmarkPlacementSynth1M-16   183     6653733 ns/op    4986059 B/op    55 allocs/op
BenchmarkAssignSynth1M-16        1  2473773600 ns/op  269756696 B/op   122 allocs/op
BenchmarkRankSynth1M-16          2   577305400 ns/op   88009208 B/op     5 allocs/op
```

Linux/Docker (`goos: linux`):

```
BenchmarkGenerate1M-16          50    26662349 ns/op   48005348 B/op     2 allocs/op
BenchmarkPlacementSynth1M-16   148     8290340 ns/op    4986024 B/op    55 allocs/op
BenchmarkAssignSynth1M-16        1  2974480094 ns/op  269732760 B/op   100 allocs/op
BenchmarkRankSynth1M-16          2   663390890 ns/op   88006680 B/op     3 allocs/op
```

**Placement is O(1) amortised:** 1,000,000 foundings in 6.65 ms (Windows) /
8.29 ms (Linux) = **~6.7–8.3 ns of algorithm time per founding**, 5 MB total,
55 allocs. The lock hold is therefore DB-I/O-bound, not algorithm-bound; the
Q1 ≥200 foundings/s criterion is not threatened by the algorithm (see §5).

### 3.5 200-parallel founding against the scratch DB (env-gated)

Run in Docker (Linux), so the env var reaches the process:

```
$ docker run --rm --network host -v <abs>:/w -w /w \
    -e WORLD_TEST_DATABASE_URL=postgres://fspro:superpassword@localhost:5434/fspro_b2a \
    golang:1.24-bookworm go test ./internal/placement -run Concurrent -v -count=1
=== RUN   TestConcurrentFoundingsScratchDB
    db_integration_test.go:117: placed 200 clubs under PLACEMENT_LOCK; cap=6, no overfill, PlaceStats consistent
--- PASS: TestConcurrentFoundingsScratchDB (1.14s)
PASS
```

Each founding takes `pg_advisory_xact_lock(0x46535050)` exactly as
`placement.service.ts:34-38` does, asks Go for a spot, creates the places it
opens, inserts the club and commits — the §4.3 boundary. 200 clubs, cap 6
(the clone preserves `TownSize=6`→`DistrictClubs=6`), zero overfilled
districts, `PlaceStats` matches `GROUP BY` afterwards. The same gated file
also covers the invite branch:

```
=== RUN   TestInvitePlacementScratchDB
--- PASS: TestInvitePlacementScratchDB (0.03s)
```

A valid district invite lands in the invited district with `invite` set; an
expired one is ignored and normal placement is used.

### 3.6 Live endpoint smoke test (built binary, scratch DB)

```
$ docker run -d --network host ... golang:1.24-bookworm sh -c 'go build -o /tmp/ws ./cmd/world-service && exec /tmp/ws'
{"level":"INFO","msg":"listening","service":"fs-pro-world-service","addr":"127.0.0.1:3006","version":"dev"}

GET /health -> 200 {"status":"ok","service":"fs-pro-world-service",...,"database":"up",...}
POST /placement/spot -> 200
 {"kind":"hole","districtId":"...","cityId":"...","regionId":"...","countryId":"...","needsNames":[],"x":1185,"y":720,"invite":null}
GET /places/{country}/children?type=city -> 200 {"children":[{... "type":"city","clubs":6}, ...]}
GET /places/{city}/children?type=district -> 200 {"children":[{... "name":"Feedhein Central","code":"D-<uuid>","clubs":6}]}
GET /prominence/{clubId} -> 200 {"clubId":"...","prominence":54.07,"updatedAt":"2026-10-07T07:07:56Z"}
POST /prominence/recompute -> 200 {"updated":1}
POST /pyramid/draw/{competitionId} -> 200 {"pools":[{"division":1,"regionKey":"000000",...,"clubIds":[...10...]}, {"division":2,...}]}
POST /pyramid/join -> 200 {"division":1,"poolId":"7fee98c2-...","slot":0,"newPool":false}
GET /prominence/{unknown} -> 404 {"error":"club not found"}
GET /places/{id}/children?type=moon -> 400 {"error":"type must be city, district or region"}
```

### 3.7 `schema.ts` typecheck

The worktree has no `node_modules`; symlinking the repo's (gitignored) one and
running `tsc --noEmit` gives **29 errors, 0 in `schema.ts`**. Every error is a
downstream file still naming the renamed symbols (see §7 Q-F):
`world.router.ts` (TownSize/RegionTowns), `checkWorldPyramid.ts`,
`pyramid.service.ts`, `atlas.service.ts`, `caretaker.service.ts`,
`club-founding.service.ts`, `news-scope.service.ts`, `placement.service.ts`
(`townInvites`, `TownSize`, `RegionTowns`, `TownId`).

---

## 4. Acceptance criteria

| Criterion (2A brief) | Evidence | Result |
| --- | --- | --- |
| `POST /placement/spot` exact contract shape | §3.6; `server_test.go` `TestPlacementSpot`; handler `server.go` | PASS |
| `GET /places/{id}/children` | §3.6; `TestPlaceChildren` | PASS |
| `GET /prominence/{clubId}` | §3.6; `TestProminence` | PASS |
| `POST /prominence/recompute` | §3.6; `TestProminence` | PASS |
| `POST /pyramid/draw/{competitionId}` | §3.6; `TestPyramidEndpoints` | PASS |
| `POST /pyramid/join` | §3.6; `TestPyramidEndpoints` | PASS |
| 501 stubs replaced | `server.go` route table; live 200s §3.6 | PASS |
| pgx/v5 against the real DB | `db.Querier` over `*db.Pool`; §3.5/§3.6 live DB | PASS |
| Context timeout on every DB call | `db.Pool.WithTimeout` wraps every Query/QueryRow/Exec; handler `requestTimeout`; `TestWithTimeout` | PASS |
| Placement O(1) counters + frontier (§3–4) | `sim.go` holes pointer + frontier growth; §3.4 8.3 ns/founding | PASS |
| Migration 0038 §2.3 (rename, districts, DistrictId, Calendars, PlaceInvites, prominence, PlaceStats+trigger, TileRevisions, indexes) | file section-by-section; §2.2/§2.4 | PASS |
| Idempotent-safe, no data loss | §2.3; no DROP; clubs/values preserved §2.2 | PASS |
| `schema.ts` matched | diff §1; drizzle tables/columns/indexes; typecheck §3.7 | PASS |
| Prominence formula + caps/weights (Q4) | `ranking.go` constants/`Score`; `TestScoreFormula` | PASS |
| Pyramid shape/locality/power-bands (§6) | `pyramid.go` `Shape`/`Assign`; shape-parity + locality tests; §3.6 draw | PASS |
| Table-driven unit tests | ranking/pyramid/placement/http test files | PASS |
| 1M synth benchmark, ms/op + allocs | §3.4 | PASS |
| `go test ./...` + `-race ./...` in Docker | §3.1–§3.3 | PASS |
| Migration+backfill on scratch DB; §2.3 checklist | §2.1–§2.4 | PASS |
| 200-parallel founding, no overfill | §3.5 | PASS |
| Invite honoured / expired (§3.6) | §3.5 `TestInvitePlacementScratchDB` | PASS |
| Commit on `perfect/b2-2a` | §8 | PASS |

---

## 5. Notes on the algorithm (spec fidelity)

- **Placement** (`nextSpot`): 1) oldest district with `PlaceStats.Clubs <
  DistrictClubs` (indexed, O(log n)); 2) otherwise grow the **frontier
  country** (newest `Type='country'`): the next city to open a district into
  (fewest districts, newest, below its cap), then a new city in the newest
  region with room, then a new region, then a new country. The frontier
  country/region/city pointers on `Calendars` are read as the fast path and
  recomputed from indexed queries when stale, so a read-only service can never
  be wrong on them. The per-country city scan is bounded by
  `RegionCities×CountryRegions` (a constant), so cost is O(1) in world size —
  confirmed by §3.4.
- **Prominence** = `round(100*(0.30·eloN+0.25·lvlN+0.20·fanN+0.15·repN+0.10·divN),2)`
  with caps Elo 1200–2400, Level 20, Fans 10⁶, Rep 100, DIV_MAX 14 (Q4);
  tie-breaks Prominence → Elo → XP → Fans → Reputation → smaller Division →
  ClubId (§5.2). `Recompute` is one set-based `UPDATE … FROM unnest(...)`.
- **Pyramid** `Shape` is a direct port of `pyramidShape` (verified against the
  spec's 100-club worked example: D1 10·D2 20·D3 40·D4 8/8/7/7). Locality key
  is `(regionKey, cityKey, districtKey)`; the bottom division is power-banded
  first (§6.5), which reduces to the old whole-division locality cut when the
  bottom fits in one band (≤288 clubs parity).

---

## 6. Known gaps

1. **Tiles** (`internal/tiles`) still the Batch-1 `ErrNotImplemented` seam —
   Batch 3.
2. **Pyramid Assign 1M takes ~2.5–3.0 s** in-memory (270 MB, ~100 allocs).
   That is a once-a-year draw over one 1M-club country, not a hot path; no
   target was set. If it matters, the next win is sorting indices instead of
   120-byte `Club` structs.
3. **`PlaceStats` has no trigger for `Places` deletion**; deleting a district
   must delete its `PlaceStats` row first (the 2A integration test does this).
   Placement never deletes places.
4. **Join locality is region-level** — `Pools` has `RegionId` only, so the
   district/city preference of §6.3 needs new `Pools` columns (not in 0038).

---

## 7. Open questions / integration boundary (R1 — not guessed)

**Q-A. Prominence worked example.** Spec §5.1 says a new club (Elo 1500,
Level 0, Fans 150, Rep 5, no division) scores "≈11.9", but its own formula
gives **16.23** (elo .075 + fan .0726 + rep .0075 + div .0071 = .1623 → 16.23;
`TestScoreFormula` pins it). I implemented the **formula** (binding) and flag
the example as inconsistent.

**Q-B. Frontier-city wording vs the worked sizes.** §3.3 says the frontier
city is "the most recently created city" and may grow to
`MetropolisDistricts`, but that reading makes every new city a metropolis and
contradicts §3.1's ~960 clubs/country. I implemented **one capital per frontier
country** (its oldest city) at the metropolis cap, all other cities at
`CityDistricts`. Needs an owner confirm if "frontier" was meant to rotate.

**Q-C. `PlacementSpot` has a single `x,y`.** For `kind ∈ {city, region,
country}` Node must create several levels. I return `x,y` as the anchor point
of the whole new subtree (all new levels share it; a runtime district uses
`geo.go`'s spiral around the city). `kind=hole|district` returns the leaf
district point. 2B must place parent levels at this anchor (or derive them);
the frozen contract cannot carry per-level points.

**Q-D. `Frontier*` pointer maintenance.** The contract makes
`POST /placement/spot` pure-read, so the pointer is a validated hint the Go
service recomputes from counts when stale. If 2B wants the O(1) pointer path
exactly as §4.2 describes, Node should advance `Calendars.Frontier*` when it
creates a new country; otherwise placement is still correct via recompute.

**Q-E. Downstream Node renames (handoff to 2B/2C).** `schema.ts` now exposes
`clubs.DistrictId`, `calendars.DistrictClubs/RegionCities/CityDistricts/
MetropolisDistricts`, `placeInvites` and the new tables, and no longer
`TownId`/`TownSize`/`RegionTowns`/`townInvites`. Ten files compile against the
old names (29 `tsc` errors, §3.7); 2B owns most, but `atlas.service.ts`,
`caretaker.service.ts`, `news-scope.service.ts`, `world.router.ts`,
`backfill-world-atlas.ts` are outside the contract's 2B list and need an owner.
The integration branch will not typecheck until these land.

---

## 8. Reproduce

```
cd /mnt/c/done/fs-pro/.claude/worktrees/b2a/services/world-service
export GOTOOLCHAIN=local
"/mnt/c/Program Files/Go/bin/go.exe" test -count=1 ./...
"/mnt/c/Program Files/Go/bin/go.exe" test -run '^$' -bench . -benchmem ./internal/placement ./internal/pyramid ./internal/ranking ./internal/synth
docker run --rm -v <abs>:/w -w /w golang:1.24-bookworm go test -race ./...
docker run --rm --network host -v <abs>:/w -w /w \
  -e WORLD_TEST_DATABASE_URL=postgres://fspro:superpassword@localhost:5434/fspro_b2a \
  golang:1.24-bookworm go test ./internal/placement -run Concurrent -v -count=1
# migration (scratch DB only), after rebuilding fspro_b2a with the PROGRESS recipe:
psql -h localhost -p 5434 -U fspro -d fspro_b2a -1 -f ../../apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql
psql -h localhost -p 5434 -U fspro -d fspro_b2a -f /tmp/opencode/b2a/assert_0038.sql
```

Commit on `perfect/b2-2a` (HEAD; see `git log --oneline -1` on the branch);
message ends with `Generated-by: OpenCode sub-agent 2A`.
