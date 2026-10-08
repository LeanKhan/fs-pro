# VERIFY-B3 — independent verification of Batch 3 Agent 3A (world-service map tiles)

Verifier: independent agent (wrote none of the code under test).
Worktree: `.claude/worktrees/b3v`, branch `perfect/b3-verify`, created from
`perfect/b3-3a` @ `363bb08` (`git worktree add .claude/worktrees/b3v -b perfect/b3-verify perfect/b3-3a`).
`perfect/b3-3a` was not modified. Merge-base with `perfect/integration` is
`27fb399`; the diff vs. integration is 16 files (`git diff --stat perfect/integration...HEAD`).

Program of record: `FOR-AGENTS.md` (R1–R11), acceptance from Batch 3 Agent 3A,
spec `docs/perfect/WORLD-HIERARCHY-SPEC.md` §7. Author report:
`.claude/worktrees/b3a/docs/perfect/B3-3A-REPORT.md` (reproduced, not trusted).

Environment: Go 1.24.5 (Windows, `GOTOOLCHAIN=local` via a `.bat`), Postgres
18 client, Docker PG on `localhost:5434`. All commands below were run by this
verifier; scratch helper files were deleted before committing this report.

---

## Verdict summary

| # | Criterion | Verdict |
| --- | --- | --- |
| 1 | Go build / `vet` / `test -count=1 ./...` all green | **PASS** |
| 2 | Tile HTTP surface: `/health` 200, tile 200, ETag/304, 400s, region counts non-zero | **PASS** |
| 3 | ≤60 KB per tile response | **PASS** |
| 4 | p95 ≤50 ms on the **1M synthetic set (Go benchmark)** | **FAIL (not implemented / not measured)** |
| 5 | p95 ≤50 ms on `fspro_scale_100k` | **PASS** |
| 6 | Migration is `0040_tile_revisions_trigger.sql`; `0039_perf_indexes.sql` exists and untouched | **PASS** |
| 7 | 0038+0040 apply to a scratch clone; trigger bumps `TileRevisions` +1; backfill populated | **PASS** |
| 8 | Contract build + `tsc --noEmit` in `apps/fs-pro-server` = 0 errors | **PASS** |
| 9 | tiles ts-rest route + Node proxy controller + route-policy rule exist | **PASS** |
| 10 | Diff review vs R1–R11 and untested paths | **PARTIAL** (see defects) |

The one acceptance blocker is **D1** (criterion 4). Spec-fidelity deviations
**D2–D5** are listed too; they do not break the payload/latency budget but the
spec §7 behaviour is not fully implemented.

---

## 1. Go build / vet / test — PASS

```
$ cmd.exe /c _b3v_go.bat go build ./...          -> exit 0
$ cmd.exe /c _b3v_go.bat go vet ./...            -> exit 0
$ cmd.exe /c _b3v_go.bat go test -count=1 ./...
ok  fs-pro-world-service/cmd/world-service   0.578s
ok  fs-pro-world-service/internal/config     0.420s
ok  fs-pro-world-service/internal/db         0.931s
ok  fs-pro-world-service/internal/http       0.713s
ok  fs-pro-world-service/internal/placement  0.873s
ok  fs-pro-world-service/internal/pyramid    0.880s
ok  fs-pro-world-service/internal/ranking    0.523s
ok  fs-pro-world-service/internal/synth      0.463s
ok  fs-pro-world-service/internal/tiles      0.880s
```

**Caveat (reproducibility).** `go test ./...` is only green when
`WORLD_TEST_DATABASE_URL` is **unset**, or points at a DB that has migration
0040. If the variable is set to `fspro` (the dev DB, no 0038/0040), two
`WORLD_TEST_DATABASE_URL`-gated tests run and fail:

```
--- FAIL: TestInvitePlacementScratchDB  (column "DistrictClubs" does not exist)
--- FAIL: TestBuildIntegration          (relation "TileRevisions" does not exist)
--- FAIL: TestTileLatencyPercentiles    (relation "TileRevisions" does not exist)
```

The author's report shows `go test ./...` "ok" for the same reason (env unset).
This is documented behaviour, not a hidden failure, but the report does not say
the DB-gated tests were skipped.

**R4 `-race` not run:** the Windows Go toolchain has no C compiler
(`-race requires cgo; enable cgo by setting CGO_ENABLED=1`; `where gcc` empty on
Windows; no WSL Go installed). Environmental, not a code defect.

---

## 2. Tile HTTP surface — PASS

Built the binary and ran it against `fspro_b3v` (a clone of the dev `fspro`
schema with 0038+0040 applied, 100 clubs→24 cities/24 districts; see §4).

```
$ cmd.exe /c _b3v_build.bat   -> BUILD_EXIT=0
$ cmd.exe /c _b3v_serve.bat   -> listening on 127.0.0.1:3011, database up
```

| Request | Result |
| --- | --- |
| `GET /health` | `200`, body `{"status":"ok",...,"database":"up"}` |
| `GET /tiles/2/5/7` | `200`, `{"key":{"z":2,"x":5,"y":7},"places":[{"name":"Kev North","type":"region","clubs":8}...]}` |
| `GET /tiles/3/8/14` | `200`, city `Portgregge` `clubs:1` |
| `GET /tiles/9/0/0` | `400` |
| `GET /tiles/x/0/0` | `400` |
| `GET /tiles/3/-1/0` | `400` |
| `ETag` header | `Etag: "2/5/7:2"` (format `"<z>/<x>/<y>:<rev>"`, per spec §7.5) |
| `If-None-Match: "2/5/7:2"` | `304` |
| `If-None-Match: "2/5/7:999"` (stale) | `200` |
| `Cache-Control` | `public, max-age=15, stale-while-revalidate=30` |

**Region/country traversal fix verified (non-zero counts).** The bug the author
fixed was a `ParentId`-only walk. Cross-checked tile counts against direct SQL
aggregates over `PlaceStats`:

```
region  "Kev North"  tile clubs=8   == SQL count 8
country "Kev"        tile clubs=23  == SQL count 23
country "Bellean"    tile clubs=26  == SQL count 26
```

Non-zero region counts are present where the DB has clubs. Handler tests cover
the same surface (`internal/http/server_test.go:291-336`, `TestTilesHandler`).

---

## 3. Payload budget ≤60 KB — PASS

Author's test (`internal/tiles/latency_test.go`), run by me:

```
$ WORLD_TEST_DATABASE_URL=.../fspro_pyramid_check \
    go test ./internal/tiles -run TestTileLatencyPercentiles -v -count=1
    latency_test.go:57: cells=6837 p50=2.6272ms p95=3.6644ms p99=4.8093ms max=9.5359ms maxPayload=11896 B

$ WORLD_TEST_DATABASE_URL=.../fspro_scale_100k ...
    latency_test.go:57: cells=4690 p50=2.5297ms p95=3.7218ms p99=4.8095ms max=10.5858ms maxPayload=29759 B
```

Max payload 11.9 KB (10k clubs) and 29.8 KB (20.7k clubs) — both ≤60 KB.
The report's payload figures (11.9 KB / 29.8 KB) **reproduce exactly**; the
report's latency figures (p95 12.0 / 10.7 ms) are higher than mine but the
assertion (`p95 ≤50 ms`) holds either way.

HTTP-level spot check on `fspro_scale_100k` (densest z2 cell = `34/10`, 360
clubs in the cell):

```
GET /tiles/2/34/10 -> 200 bytes=23448 (handler duration_ms=43 cold, then 5-8)
GET /tiles/2/29/15 -> 200 bytes=22949
GET /tiles/2/30/4  -> 200 bytes=22157
```

The 60 KB budget is a **count** cap (`TileMaxPlaces=400`, `TileMaxClubs=200`),
not a byte cap (`tiles.go:33-36`); every measured response is far below it.

---

## 4. p95 ≤50 ms on the 1M synthetic set (Go benchmark) — **FAIL**

**There is no tile benchmark at all, and no 1M-synthetic tile path.**
Evidence:

```
$ grep -rn "func Benchmark" services/world-service/internal/tiles/   -> (no output)
$ grep -rn "func Benchmark" services/world-service --include=*.go
    internal/placement/placement_test.go:59 BenchmarkPlacementSynth1M
    internal/pyramid/pyramid_test.go:212    BenchmarkAssignSynth1M
    internal/ranking/ranking_test.go:120    BenchmarkRankSynth1M
    internal/synth/generator_test.go:114    BenchmarkGenerate1M
$ grep -rn "synth" services/world-service/internal/tiles/            -> (no output)
$ grep -rn "1000000|1_000_000|1e6" services/world-service --include=*.go  (tiles: none)
```

The only tile performance evidence is `TestTileLatencyPercentiles`, which runs
against the **real scratch DBs** (10k and 20.7k clubs), not the 1M synthetic
set. The author's own report §5.1 states this is "Still open". The Batch 3A
brief and `FOR-AGENTS.md` (Batch 3, Agent 3A) require "p95 ≤50 ms on the 1M
synthetic set (Go benchmark)". This criterion is **not met / not measured**.

Risk note (not itself a measured failure): the tile cell predicate
`floor(p."MapX"/$2)=$3` is not sargable; `EXPLAIN` on `fspro_scale_100k` shows a
`Bitmap Index Scan on Places_map_idx` on `Type` only, then a filter over every
place of that type (`Rows Removed by Filter: 92`). If the same ratio holds at
~10× more places, the unmeasured 1M p95 could exceed 50 ms. The densest tile
was also **43 ms cold** at only 20.7k clubs.

---

## 5. Migration files — PASS

```
apps/fs-pro-server/src/db/drizzle/migrations/
  0038_world_districts.sql
  0039_perf_indexes.sql
  0040_tile_revisions_trigger.sql
```

- The 3A migration is **`0040_tile_revisions_trigger.sql`**, not 0039.
- `0039_perf_indexes.sql` is **untouched**: identical blob at integration and HEAD:
  ```
  $ git rev-parse perfect/integration:.../0039_perf_indexes.sql -> 7a68dc51...
  $ git rev-parse HEAD:.../0039_perf_indexes.sql               -> 7a68dc51...
  ```
- `git diff --name-status perfect/integration...HEAD -- .../migrations/` shows
  only `A 0040_tile_revisions_trigger.sql`.
- `TileRevisions` itself is created in 0038 (`0038_world_districts.sql:242-248`)
  and modelled in `schema.ts:1049`; 0040 adds the trigger + backfill.

---

## 6. Migration 0040 behaviour on a scratch clone — PASS

Created `fspro_b3v` by cloning the schema+data of `fspro` (24 towns, 50 clubs),
then applied 0038 → 0039 → 0040 (`_b3v_migrate.bat`, all `MIGRATIONS_OK`).
`fspro` itself was only read.

Backfill and trigger evidence:

```
TileRevisions backfill rows: 101   total_rev: 294
PlaceStats     backfill rows:  24  total_clubs: 49
districts per city: 24 cities / 24 districts / 0 towns left
PlaceStats mismatch vs GROUP BY Clubs.DistrictId: 0

trigger test — UPDATE Clubs SET DistrictId = DistrictId (same value):
  BEFORE  z0 4/1=18  z1 9/3=17  z2 19/7=9  z3 38/15=2  z4 76/30=2  z5 152/60=2
  AFTER   z0 4/1=19  z1 9/3=18  z2 19/7=10 z3 38/15=3  z4 76/30=3  z5 152/60=3
```

Every cell z0–z5 bumped by exactly **+1**; the backfill populated rows. Matches
spec §7.5. (Only `fspro_b2c` and `fspro_b3v` have the 0040 trigger; the latency
scratch DBs `fspro_pyramid_check`/`fspro_scale_100k` have the table but not the
trigger, so their tiles report `rev:0`. This does not affect latency/payload.)

---

## 7. Node contract + server type-check — PASS

Setup: `ln -s ../b1c/node_modules node_modules`; junction
`apps/fs-pro-server/node_modules/@repo/api-contract -> packages/api-contract`.

```
$ cmd.exe /c _b3v_tsc.bat
=== contract build ===
CONTRACT_BUILD_EXIT=0
=== server tsc --noEmit ===
SERVER_TSC_EXIT=0
```

Confirmed the compile resolved the **worktree's** files, not b1c's
(`tsc --noEmit --listFiles`, 0 lines containing `worktrees\b1c`):

```
C:/done/fs-pro/.claude/worktrees/b3v/packages/api-contract/src/routes/tiles.ts
C:/done/fs-pro/.claude/worktrees/b3v/packages/api-contract/src/schemas/world-service.ts
C:/done/fs-pro/.claude/worktrees/b3v/apps/fs-pro-server/src/controllers/world/tiles.router.ts
C:/done/fs-pro/.claude/worktrees/b3v/apps/fs-pro-server/src/services/world/world-service.client.ts
```

---

## 8. Node surface exists (file:line) — PASS

| Piece | Location |
| --- | --- |
| ts-rest route `GET /tiles/:z/:x/:y` | `packages/api-contract/src/routes/tiles.ts:17-26` |
| registered in contract | `packages/api-contract/src/index.ts:24,52` |
| zod shapes `TileSchema`/`TilePlaceSchema`/`TileClubSchema` | `packages/api-contract/src/schemas/world-service.ts:142-171` |
| Node proxy controller (`getTile`) | `apps/fs-pro-server/src/controllers/world/tiles.router.ts:12-22` |
| registered in router | `apps/fs-pro-server/src/routers/index.ts:29,58` |
| mounted via `createExpressEndpoints(apiContract, ...)` | `apps/fs-pro-server/src/server.ts:166` |
| Go HTTP client call | `apps/fs-pro-server/src/services/world/world-service.client.ts:136-138` |
| route-policy rule `tiles.getTile: 'public'` | `apps/fs-pro-server/src/middleware/route-policy.ts:128` |

The proxy was **not** exercised end-to-end (no full Node stack was booted);
existence and type-checking are verified, runtime proxying is not.

---

## Defect list

### D1 — MAJOR: 1M-synthetic tile benchmark missing (acceptance criterion 4)
- **Files:** `services/world-service/internal/tiles/` (no `Benchmark*`).
- **Repro:** `grep -rn "func Benchmark" services/world-service/internal/tiles/`
  → no output.
- **Expected:** a Go benchmark over the 1M synthetic set reporting/passing
  p95 ≤50 ms (Batch 3A brief; spec D5).
- **Actual:** only real-DB latency tests at 10k/20.7k clubs; report §5.1 admits
  the 1M case is open.
- **Impact:** the headline scale claim for tiling is unproven; the tile query is
  not index-sargable on the cell predicate, so 1M could breach 50 ms.

### D2 — MEDIUM: per-place club cap is applied per *district*, not per drawn place (§7.2)
- **Files:** `services/world-service/internal/tiles/service.go:193-210`
  (`capPerPlace` keys on `r.district`), called at `:59`.
- **Repro:** `GET /tiles/1/2/3` returned **11** clubs for one country place;
  `GET /tiles/1/9/3` returned **17** clubs for one country. Spec §7.2 z1 cap is
  `top 5` per place (country).
- **Expected:** at z1 a country marker draws at most its top 5 clubs by
  prominence.
- **Actual:** every distinct district contributes up to its own cap, so a
  country can draw many more than 5 clubs. (At z3 a city can draw up to 8 per
  district, etc.)
- **Impact:** LOD prominence semantics ("only the most prominent clubs of the
  visible places are drawn") is weaker than specced; still within the 200-club
  tile cap so the byte budget holds.

### D3 — LOW/MEDIUM: overflow rule returns a truncated subset, not the parent summary (§7.4)
- **Files:** `services/world-service/internal/tiles/service.go:44-48, 60-63`
  (truncate + set `Overflow`/`ZoomHint`).
- **Expected (spec §7.4):** exceeding the budget returns the cell's
  **parent-level summary** plus `{overflow:true, zoomHint:true}`.
- **Actual:** the bounded subset with flags; author-admitted in report §5.4.
- **Impact:** client zoom-out behaviour differs from the spec; no silent
  truncation (flag is set), so the hard budget still holds.

### D4 — LOW: `?placeId=` focused-zoom filter not implemented (§7.3, §9)
- **Repro:** `grep -rn "placeId" services/world-service/internal/tiles/` → none;
  the handler only parses `{z}/{x}/{y}` (`internal/http/server.go:477-516`).
- **Expected:** spec §7.3/§9 list `GET /tiles/*?placeId=` for "districts of city X".
- **Actual:** absent.

### D5 — LOW: z5 level + club marker fields deviate from §7.2/§7.4
- **Files:** `services/world-service/internal/tiles/tiles.go:66-77` (`LevelForZoom`
  returns `"district"` for z4 and z5; spec z5 Level = `club`),
  `tiles.go:107-115` (`ClubMarker` has no `crest reference`, which §7.4 lists).
- **Impact:** minor contract/UX drift; caps for z5 are `0` = all, which matches.

### D6 — LOW (doc): stale migration header
- **File:** `0040_tile_revisions_trigger.sql:1` still reads
  `-- 0039_tile_revisions_trigger.sql` after the renumber. No functional effect.

### D7 — LOW (doc): author report points at the wrong migration number
- **File:** `B3-3A-REPORT.md` §5.3(3) says the tile trigger is "migration `0039`",
  but the actual file is `0040` (the commit list in §5 correctly says 0040).
  Internal inconsistency only.

### D8 — INFO: `-race` cannot run here
- Windows Go has no C compiler; no WSL Go. R4's `go test -race` is unverified in
  this environment (author also did not claim it).

### D9 — INFO (prior batch, not 3A): one released club has NULL `DistrictId` after 0038
- On the clone, `count(Clubs WHERE DistrictId IS NULL)=1`, and it is the single
  **released** club (`Sunny City FZ`, `ReleasedAt` set); `null_active = 0`.
  0038 backfill is for Batch 2A, but clubs with NULL district are dropped by the
  tile `clubs` query (`service.go:124-133`, inner JOIN), so released clubs never
  appear — expected. Active clubs all resolve.

### Untested paths noted (R4)
- `Overflow`/`ZoomHint` are never asserted by any test
  (`grep Overflow|ZoomHint internal/tiles/tiles_test.go internal/http/server_test.go`
  → no output); only `capPerPlace` and the handler's ETag/304/400 are covered.
- The `places` truncation path (`>TileMaxPlaces`) and the `clubs` global
  `>TileMaxClubs` path are untested.
- No 1M tile benchmark (D1) and no HTTP load tool (report notes `wrk`/`k6` absent).

---

## Reproduction commands (all run by this verifier)

```
git worktree add .claude/worktrees/b3v -b perfect/b3-verify perfect/b3-3a
# Go
cmd.exe /c _b3v_go.bat go build ./...
cmd.exe /c _b3v_go.bat go vet ./...
cmd.exe /c _b3v_go.bat go test -count=1 ./...
# latency (bat sets WORLD_TEST_DATABASE_URL per DB)
cmd.exe /c _b3v_lat.bat fspro_pyramid_check
cmd.exe /c _b3v_lat.bat fspro_scale_100k
# HTTP surface: build + serve fspro_b3v on 3011, then curl
cmd.exe /c _b3v_build.bat ; cmd.exe /c _b3v_serve.bat
cmd.exe /c _b3v_curl.bat ; cmd.exe /c _b3v_etag.bat
# migrations on a scratch clone
cmd.exe /c _b3v_createdb.bat ; cmd.exe /c _b3v_dumpload.bat ; cmd.exe /c _b3v_migrate.bat
cmd.exe /c _b3v_psql.bat -d fspro_b3v -f _b3v_verify0040.sql
# Node
ln -s ../b1c/node_modules node_modules ; cmd.exe /c _b3v_junction.bat
cmd.exe /c _b3v_tsc.bat
cmd.exe /c _b3v_list.bat   # tsc --listFiles, grep b3v paths
```

(The `_b3v_*` helper scripts and the `fspro_b3v` scratch DB were created for
this verification; the scripts were removed before committing. `perfect/b3-3a`
was not modified.)

---

# ROUND 2 — re-verification of the D2/D3/D5/D6 fixes (`perfect/b3-3a` @ `1ff26d3`)

**This section supersedes the round-1 defect statuses for D2/D3/D5/D6 and adds a
new blocker D10.** Round-1 criteria 1–9 are re-run where the fix touched them.

## R2.0 Merge

```
$ git merge --no-edit perfect/b3-3a
Merge made by the 'ort' strategy.
 apps/.../0040_tile_revisions_trigger.sql |  2 +-
 docs/perfect/B3-3A-REPORT.md             | 33 ++++++-
 services/world-service/internal/tiles/service.go | 106 +++++++++++++-------
 services/world-service/internal/tiles/tiles.go   |   4 +-
 services/world-service/internal/tiles/tiles_test.go | 12 +--
```

Clean merge (no conflicts). New commits covered: `c85a1d2` (code),
`1ff26d3` (report). Merge commit `6ec9ebe` on `perfect/b3-verify`.

## R2.1 Go suite — PASS

```
go build ./...            -> exit 0
go vet ./...              -> exit 0
go test -count=1 ./...    -> all 9 packages ok
```

## R2.2 D2 (per-place club cap) — **FIXED**

`capPerPlace` now keys on the **drawn place** (`r.place`) instead of the district
(`service.go:229-248`), and `ancestorExpr` maps each club's district to the
country/region/city/district drawn at that zoom (`service.go:150-155`).

Reproduced live. Exact requests and the `clubs` array length:

| Request | Before (`363bb08`) | After (`1ff26d3`) | Spec cap |
| --- | --- | --- | --- |
| `GET /tiles/1/2/3` country Kev (fspro_b3v) | 11 clubs | **5** | z1 ≤5 |
| `GET /tiles/1/9/3` country Bellean (fspro_b3v) | 17 clubs | **5** | z1 ≤5 |
| `GET /tiles/2/12/7` region Scale Region 0, 540 clubs (fspro_scale_100k) | n/a | **5** | z2 ≤5 |
| `GET /tiles/3/25/14` cell holds 2 cities, 400+20 clubs (fspro_scale_100k) | n/a | **16 = 8 + 8** | z3 ≤8/place |
| `GET /tiles/4/81/27` district Ivania Central (fspro_b3v, 6 clubs) | n/a | **6** | z4 ≤10 |

`/tiles/1/2/3` previously returned >5 clubs and now returns ≤5 (5), as required.

## R2.3 D3 (parent-summary overflow) — **FIXED**

`Build` returns the parent tile when a cap is exceeded for `z>0`
(`service.go:65-75`). Triggered live on `fspro_scale_100k`:

```
GET /tiles/4/50/28 -> body key {"z":3,"x":25,"y":14} ... "overflow":true "zoomHint":true
GET /tiles/5/100/56 -> body key {"z":3,"x":25,"y":14} ... "overflow":true "zoomHint":true
GET /tiles/2/12/7   -> body key {"z":2,"x":12,"y":7}  ... "overflow":false
```

The z4/z5 dense cells overflow and return the **z3 parent summary** with the
flags set — the §7.4 behaviour. (Code-verified and live-triggered; the `places`
truncation branch at `z0` still returns the bounded subset with flags, which is
sensible as z0 has no parent.)

## R2.4 D5 (z5 = club level) — **FIXED (but see D10)**

`LevelForZoom(5)=="club"` (`tiles.go:66-78`; asserted in `TestLevelForZoom`),
and z5 draws no place markers:

```
GET /tiles/5/163/55 -> "places":null, "clubs":[...6 clubs...]
GET /tiles/5/101/56 -> "places":null, "clubs":[], "clubCount":0
```

Only clubs are returned at z5 — **but `"places":null`, not `[]`** → D10.

## R2.5 D6 (documentation) — **FIXED**

```
$ head -1 .../0040_tile_revisions_trigger.sql  ->  -- 0040_tile_revisions_trigger.sql
$ git rev-parse perfect/integration:.../0039_perf_indexes.sql -> 7a68dc51cf72d022f55c0d6d5e74f7cc55ea46ed
$ git rev-parse HEAD:.../0039_perf_indexes.sql               -> 7a68dc51cf72d022f55c0d6d5e74f7cc55ea46ed
```

`0039_perf_indexes.sql` is byte-identical to integration; only `0040…` is added.

## R2.6 Latency / payload re-run — PASS

```
fspro_pyramid_check  cells=6837 p50=1.6447ms p95=2.3665ms p99=3.0916ms max=18.0091ms maxPayload=2076 B
fspro_scale_100k     cells=4690 p50=1.9505ms p95=2.8856ms p99=5.3945ms max=11.6073ms maxPayload=4476 B
```

Both p95 ≤50 ms and max payload ≤60 KB. The sargable bounds (`service.go:88-96`)
and the per-place cap cut payload from 11.9 KB→2.1 KB (10k) and 29.8 KB→4.5 KB
(20.7k); the author's updated report figures (2.1 KB / 4.5 KB) reproduce.

## R2.7 Node contract + server tsc — PASS

```
CONTRACT_BUILD_EXIT=0
SERVER_TSC_EXIT=0
```

## R2.8 **NEW DEFECT D10 (BLOCKER): `places:null` at z5 fails the zod contract**

- **File:** `services/world-service/internal/tiles/service.go:105-108`
  (`places()` returns `nil, nil` for `level=="club"`), consumed at
  `service.go:40,80`. `encoding/json` marshals a nil slice as `null`.
- **Repro (curl):** `GET /tiles/5/101/56` →
  `{"key":{"z":5,...},"places":null,"clubs":[],...}`.
- **Contract:** `packages/api-contract/src/schemas/world-service.ts:163-171`
  declares `places: z.array(TilePlaceSchema)` (non-nullable). The Node proxy
  parses every Go tile with this schema
  (`apps/fs-pro-server/src/services/world/world-service.client.ts:55-68,136-138`).
- **Proof it breaks the boundary (run by me):**
  ```
  $ node _b3v_zod.js
  z5 places:null (actual Go output) => INVALID: [{"code":"invalid_type","expected":"array","received":"null","path":["places"],...}]
  z5 places:[]  (expected shape)    => VALID
  ```
- **Expected:** `GET /api/tiles/5/{x}/{y}` proxies a valid tile.
- **Actual:** `TileSchema.parse` throws, so the proxy catches and returns
  `400 {success:false,...}` (`controllers/world/tiles.router.ts:17-20`). Every z5
  request is unusable through Node, and Batch 3B's club zoom level would break.
- **Regression:** at `363bb08` z5 was `LevelForZoom=="district"`, so `places()`
  never early-returned nil and `places` was `[]`. The D5 fix introduced this.
- **Fix (one line):** `return []PlaceMarker{}, nil` in `places()` for z5, or
  normalise nil→empty in `Build`. No test covers z5 serialisation, so CI stayed
  green.

## R2.9 Observation (minor, not blocking): overflow ETag key

On an overflow response the handler builds the ETag from the **requested** key
(`server.go:508`, `key.String()`) while `tile.Key` is the parent. E.g. a request
for `4/50/28` returns body key `3/25/14` but `ETag: "4/50/28:<parentRev>"`.
Revalidation still works (same URL → same ETag), but the token does not describe
the payload. Low priority.

## R2.10 Defect status after round 2

| Defect | Status |
| --- | --- |
| D1 — no 1M-synthetic tile benchmark (acceptance criterion) | **OPEN** (unchanged) |
| D2 — per-place cap applied per district | **FIXED** (§R2.2) |
| D3 — overflow returned truncated subset | **FIXED** (§R2.3) |
| D4 — no `?placeId=` filter | **OPEN** (unchanged; spec §7.3/§9) |
| D5 — z5 level + marker drift | **FIXED** (§R2.4), except the `places` shape → D10 |
| D6 — 0040 header comment | **FIXED** (§R2.5) |
| D7 — report cited migration "0039" | **FIXED** (report now says 0040) |
| D8 — `-race` not runnable here | INFO (unchanged) |
| D9 — released club NULL district | INFO (unchanged) |
| **D10 — z5 `places:null` breaks zod/Node proxy** | **NEW · BLOCKER** (§R2.8) |

## R2.11 Final verdict

**FAIL — not mergeable as-is.**

The requested fixes D2, D3, D5 and D6 are **verified fixed** with live evidence,
and the Go suite, latency/payload budget and Node type-check all pass. However
`perfect/b3-3a` @ `1ff26d3` introduces **D10**, a new functional blocker: the z5
tile serialises `places:null`, which the frozen `TileSchema`
(`z.array`) rejects, so the Node proxy fails z5 with a 400. This must be fixed
(`return []PlaceMarker{}, nil`) and re-verified before merge. Separately, the
Batch 3A acceptance criterion **D1 (1M-synthetic p95)** remains unmet and **D4
(`?placeId=`)** remains a spec gap; those were open in round 1 and are still
open here.
