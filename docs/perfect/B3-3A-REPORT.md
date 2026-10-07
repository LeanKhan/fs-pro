# B3-3A-REPORT — world-service map tiles

Agent: **lead** (`perfect/b3-3a`, worktree `.claude/worktrees/b3a`), branched
from `perfect/b2-2c` (`4c83f08`, which includes the Go `internal/db`
context-cancel fix).

Goal: implement the zoomable-map tile API per
`docs/perfect/WORLD-HIERARCHY-SPEC.md` §7 and `FOR-AGENTS.md` Batch 3 Agent 3A.

## 1. What changed

| File | Change |
| --- | --- |
| `services/world-service/internal/tiles/tiles.go` | Quadtree `Key` (`z/x/y`, `Valid`), `CellAt`, `LevelForZoom` (0/1 country, 2 region, 3 city, 4/5 district), `ClubCapForZoom` (3/5/5/8/10/0), payload markers, `Tile` with `Overflow`/`ZoomHint`/`Rev`, and the `Builder` interface. Caps `TileMaxPlaces=400`, `TileMaxClubs=200`, `BaseCell=256`. |
| `services/world-service/internal/tiles/service.go` | DB-backed `Service`: place markers with per-type club counts, top-K clubs by prominence, per-place cap, `Overflow` when a cap is hit, `TileRevisions` read, and `BumpRevisions` (all levels, §7.5). |
| `services/world-service/internal/http/server.go` | `Deps.Tiles`, `GET /tiles/{z}/{x}/{y}` handler: key validation, `ETag "<z/x/y>:<rev>"`, `If-None-Match` → 304, `Cache-Control: public, max-age=15, stale-while-revalidate=30`, 400/503/500 mapping. |
| `services/world-service/cmd/world-service/main.go` | Wires `tiles.New(pool)`. |
| `internal/tiles/tiles_test.go`, `internal/http/server_test.go` | New coverage (see §3). |
| `packages/api-contract/src/schemas/world-service.ts` | `TilePlaceSchema`/`TileClubSchema`/`TileSchema` + types (R6). |
| `packages/api-contract/src/routes/tiles.ts`, `index.ts` | `tiles` ts-rest route (`GET /tiles/:z/:x/:y`), registered in the contract router. |
| `apps/fs-pro-server/src/services/world/world-service.client.ts` | `getTile(z,x,y)` calling the Go endpoint. |
| `apps/fs-pro-server/src/controllers/world/tiles.router.ts`, `routers/index.ts` | Node proxy `GET /api/tiles/{z}/{x}/{y}`. |
| `apps/fs-pro-server/src/middleware/route-policy.ts` | `tiles.getTile: 'public'`. |

**Place club counts follow the repository's canonical traversal**, not a
`ParentId`-only walk: a city's `ParentId` is its **country** and it links to its
region via `RegionId` (`placement.go:411,576-577`). `tiles.Service.places`
therefore computes district = own `PlaceStats`, city = its districts, region =
districts of cities whose `RegionId` is the region, country = districts of
cities whose `ParentId` is the country. A first cut that recursed on
`ParentId` alone reported `clubs:0` for regions — caught by the integration
check below.

## 2. Endpoints

- `GET /tiles/{z}/{x}/{y}` → `Tile` (bounded), ETag/304.
- `BumpRevisions(ctx, q, x, y)` — call in the same tx as a club/place change.

## 3. Commands and output (R4)

```
$ go test ./...                     # windows go1.24.5, GOTOOLCHAIN=local
ok  fs-pro-world-service/cmd/world-service
ok  fs-pro-world-service/internal/config
ok  fs-pro-world-service/internal/db
ok  fs-pro-world-service/internal/http
ok  fs-pro-world-service/internal/placement
ok  fs-pro-world-service/internal/pyramid
ok  fs-pro-world-service/internal/ranking
ok  fs-pro-world-service/internal/synth
ok  fs-pro-world-service/internal/tiles
$ go vet ./...                      # clean
```

Live against `fspro_b2c` (40 clubs, 27 places) on port 3008:

```
$ curl -s http://localhost:3008/tiles/2/12/7
{"key":{"Z":2,"X":12,"Y":7},"places":[{"id":"26cfc90a-...","name":"Region 1",
 "type":"region","x":800,"y":450,"clubs":12}], ...,"clubCount":9,...,"rev":0}

$ curl -s -o NUL -w "%{http_code}" http://localhost:3008/tiles/2/12/7          -> 200
$ curl ... -H 'If-None-Match: "2/12/7:0"'                                      -> 304
$ curl -s -o NUL -w "%{http_code}" http://localhost:3008/tiles/9/0/0           -> 400
$ curl -s -o NUL -w "%{http_code}" http://localhost:3008/tiles/x/0/0           -> 400
$ curl -s -o NUL -w "%{http_code}" http://localhost:3008/health                -> 200
```

Region `clubs:12` = 4 districts × 3 clubs (the earlier `0` was the
`ParentId`-only bug in §1). Country `clubs:24`, district `clubs:3` all
correct; club lists respect the z0 cap of 3/place.

## 4. Acceptance vs. the brief

| Item | Evidence | Result |
| --- | --- | --- |
| Tile/LOD endpoint per §7 | `GET /tiles/{z}/{x}/{y}`, §3 | PASS |
| Quadtree `z/x/y`, level mapping, caps | `tiles.go`; `TestCellAtQuadtreeHalves`, `TestLevelForZoom`, `TestClubCapForZoom` | PASS |
| ≤60 KB / place + club caps | `TestBuildIntegration` cap assertions; §3 payloads <2 KB small-world | PASS (small world); 1M p95 pending §5 |
| ETag + 304 + Cache-Control | `TestTilesHandler`; §3 curl | PASS |
| `TileRevisions` read + `BumpRevisions` | `service.go` | PASS |

## 5. Known gaps / next
1. **Latency/payload budget — measured on real worlds (in-process).**
   `TestTileLatencyPercentiles` builds every populated cell of a scratch world:

   | world | cells | p50 | p95 | p99 | max | max payload |
   | --- | --- | --- | --- | --- | --- | --- |
   | `fspro_pyramid_check` (10k clubs) | 6837 | 5.9 ms | 12.0 ms | 20.6 ms | 544 ms¹ | 11.9 KB |
   | `fspro_scale_100k` (20.7k clubs) | 4690 | 5.8 ms | 10.7 ms | 16.2 ms | 50.7 ms | 29.8 KB |

   Both p95 ≤ 50 ms and every payload ≤ 60 KB (asserted). ¹ The 10k `max`
   is a cold first-query outlier (connection/dial warmup); p99 is 20.6 ms.
   Still open: the **1M synthetic** p95 and an HTTP-level `wrk`/`k6` run
   (neither tool is installed here).
2. **Node proxy + zod + route-policy (R6) — added after the first pass.**
   `packages/api-contract` now has `TileSchema` + the `tiles` ts-rest route,
   the server proxies `GET /api/tiles/{z}/{x}/{y}`, and route-policy marks it
   public. Server `tsc --noEmit` = 0 errors. `vitest` cannot start through the
   worktree's WSL symlinks (known worktree limitation), so the TS additions are
   type-checked, not unit-tested, here.
3. **Tile invalidation — done in migration `0039`.** `TileRevisions` is now
   maintained by a trigger on `Clubs` (insert/delete/`DistrictId` change),
   mirroring the `PlaceStats` trigger, plus a backfill. Verified on
   `fspro_b2c`: a district change bumped the `(z=0,x=3,y=1)` cell `42 → 43`
   and the tile ETag became `"0/3/1:43"`. The Go `BumpRevisions` helper stays
   for callers that want to bump without a club write.
4. **Overflow semantics** return the bounded subset with `overflow/zoomHint`;
   the "return the parent summary" refinement is not implemented.

Commits on `perfect/b3-3a` (rebased onto `perfect/integration` @ `27fb399`):
`d3d5d68` (Go tiles), `e878b40` (report), `790ed09`
(contract/proxy/route-policy), `714cea2` (report update), `72b13a8` (migration
`0040`), `17138b6` (renumber 0039→0040).

## 6. ANOMALY-1 reconciliation

The orchestrator flagged `perfect/b3-3a` as **ANOMALY-1** (an unexpected
branch). This branch is **owner-approved parallel Batch 3A work** (the owner
answered "are you running batches in parallel? → proceed"). Reconciled:

- **Rebased onto current `perfect/integration` (`27fb399`)**, so the diff no
  longer reverts the B2 fix (`78d5909`) or the 2D/2E work.
- **Migration renumbered `0039 → 0040`** (collision with
  `0039_perf_indexes.sql` from 2E). `0039_perf_indexes.sql` is untouched.
- Go `build`/`test ./...` and server + contract `tsc --noEmit` green after the
  rebase.

It is safe to verify and merge `perfect/b3-3a` on top of `27fb399`.
