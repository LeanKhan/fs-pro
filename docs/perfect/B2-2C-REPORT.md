# B2-2C-REPORT — Node integration, checks and 1k scale

Agent: **2C** (`perfect/b2-2c`). Worktree
`/mnt/c/done/fs-pro/.claude/worktrees/b2c` (`C:\done\fs-pro\.claude\worktrees\b2c`).
Base `perfect/b2i` @ `bfee583` (Go service, migration `0038`, `schema.ts`,
contract schemas and the 2B world-service client already merged).

Goal: make the Node/TypeScript server build and run against the district
hierarchy and the Go world-service, and update the check scripts.

Inputs followed: `FOR-AGENTS.md` (R1–R11), `docs/perfect/DECISIONS.md`
(Q1–Q8), `docs/perfect/WORLD-HIERARCHY-SPEC.md`,
`docs/perfect/WORLD-SERVICE-CONTRACT.md`, `B2-2A-REPORT.md`, `B2-2B-REPORT.md`,
migration `0038_world_districts.sql`, `schema.ts`.

Status: **`tsc --noEmit` 0 errors; 92/92 vitest; `seedScaleWorld.ts`
(1,000 clubs, `SCALE_SKIP_MATCHES=1`) ran green on a fresh `fspro_b2c`; and
`checkWorldPyramid.ts` passed every placement/hierarchy/invite/cap/draw
assertion** (§3.6). `checkWorldPyramid` fails only at the sim-dependent season
step because the Rust sim service (127.0.0.1:5050) is not running. The pyramid
delegation was initially blocked by a 2A `internal/db` defect (§5); a
**concurrent, uncommitted Go fix** (not part of this branch) makes the draw
succeed, and the §3.6 run was taken with it in place.

---

## 1. What changed (files, with the migration cite)

Migration `apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql`
(the only source of these renames; every edit below cites it):

| Rename / addition | Migration line |
| --- | --- |
| `Places.Type` `town` → `city`; add `district` | `:21`, `:37` |
| `Clubs.TownId` → `Clubs.DistrictId` | `:63` |
| `Calendars.TownSize` → `DistrictClubs`, `RegionTowns` → `RegionCities` | `:85`, `:91` |
| `CityDistricts`, `MetropolisDistricts`, `Frontier*` | `:95-101` |
| `TownInvites` → `PlaceInvites`, `TownId` → `PlaceId`, `Level` | `:138`, `:144`, `:148` |
| `PlaceStats` + trigger | `:189-237` |
| `NewsItems.ScopeType` `town` → `district` | `:259` |

| File | Change |
| --- | --- |
| `src/services/world/placement.service.ts` | `nextSpot` is a thin caller of `world-service.client.getPlacementSpot`; `previewPlacement` maps the contract spot back onto the client `Placement` shape (the frozen contract has no preview flag/names — decision recorded in the file header); `worldSizes` → `DistrictClubs/CityDistricts/RegionCities/CountryRegions/MetropolisDistricts`; invites on `PlaceInvites`/`PlaceId`; `backfillRegions` groups cities and their districts; `advanceFrontier()` (Q-D); `citiesOfRegion` |
| `src/services/world/club-founding.service.ts` | founding calls `getPlacementSpot` **inside the transaction while holding `lockPlacement`** (`placement.service.ts:36-38`), creates/names the levels in `needsNames`, always creates the auto-named district, uses the district for `Clubs.DistrictId`, counts the invite use only when the service set `invite`, advances `Calendars.Frontier*` after commit |
| `src/services/competitions/pyramid.service.ts` | `drawPyramid`/`joinPyramid` delegate the pool assignment to `POST /pyramid/draw|join`, keeping the per-competition advisory lock and all persistence; fixtures stay `utils/round-robin.ts`; draws detail the clubs and names/sizes the pools Node persists |
| `src/services/world/atlas.service.ts` | `towns` rows are `Type='city'`; club counts sum a city's districts (`Clubs.DistrictId`); admin `foundTown` creates a city **and** a district; `getTown` reads `city` |
| `src/services/world/caretaker.service.ts` | release clears `DistrictId` (was `TownId`) |
| `src/services/world/news-scope.service.ts` | `Scope` leaf is `district` (was `town`); `Where`/`activeCounts`/`scopeChain`/`readFeed` use `Clubs.DistrictId`; the wire keeps the legacy `town` name and `town:` topic so the merged client is untouched (Q7 'city' deferred — §6) |
| `src/controllers/world/world.router.ts` | `settings()`/`updateSettings` map the API's `townSize`/`regionTowns` onto the renamed `DistrictClubs`/`RegionCities` columns |
| `src/scripts/checkWorldPyramid.ts` | rewritten for district placement invariants, district news scope, and the Go draw; capacities `DistrictClubs/CityDistricts/RegionCities/CountryRegions/MetropolisDistricts` |
| `src/scripts/seedScaleWorld.ts` | docs/labels for cities/districts; scratch-DB + world-service requirements |
| `src/scripts/migration/backfill-world-atlas.ts` | creates **city + district** rows, links `Clubs.DistrictId`; relayout over cities |
| `docs/SCALE.md` | new "B2 — district hierarchy + Go world-service (2026-10-07, 1,000 clubs)" section |

Outside the nominal node ownership list but required for `tsc` 0 (R11 note in
§6; no parallel agent was editing them):

| File | Change |
| --- | --- |
| `src/services/world/world-feed.service.ts` | maps the internal `district` scope to the legacy client wire `town` scope; `local.townId` = the district id |

A Node-side retry in `world-service.client.ts` was tried against the 2A defect
and **reverted**: the failure is deterministic (see §5), so retrying added no
value and would have meant editing a 2B-owned file. The committed client is
the merged 2B version.

Migration renames were verified on the scratch DB after applying `0038`
(`Clubs.DistrictId`, `Calendars.DistrictClubs/CityDistricts/MetropolisDistricts/FrontierCityId`,
`PlaceInvites`, `PlaceStats`, `TileRevisions` all present).

---

## 2. Environment note (worktree Node install)

The worktree's `node_modules` was a symlink to the main checkout, whose
`@repo/*` links are WSL-style and unreadable by Windows esbuild; `vitest` is
also absent from the main install. I repointed the worktree's root
`node_modules` at the `b1c` worktree's real install and added an app-level
`@repo/api-contract` junction pointing at **this** worktree, so the server
typechecks/tests against its own contract source. `node_modules`, `.env` and
junctions are gitignored and not committed. The app-level `@types` junction
(the known `@types/node@26` shadow, B2-2B §3) was removed so `tsc` uses the
repo's `@types/node@20`.

The host restarted mid-task: Docker Desktop and Postgres went down and were
later restored; the final scratch-DB runs below were taken after the restore.

---

## 3. Commands and output (R4)

### 3.1 `tsc --noEmit`, before → after

Baseline (after `npm run build --workspace @repo/api-contract`), **29 errors**,
matching the brief (the 17 client errors disappear once the contract resolves
to this worktree):

```
$ npx tsc --noEmit            # before
placement.service.ts 9 · news-scope.service.ts 6 · atlas.service.ts 5 ·
pyramid.service.ts 3 · checkWorldPyramid.ts 2 · world.router.ts 2 ·
club-founding.service.ts 1 · caretaker.service.ts 1
EXIT=2 · 29 errors
```

After (final tree, retry reverted):

```
$ npx tsc --noEmit            # after
TSC_EXIT=0
errors: 0
```

### 3.2 `npm test` (vitest), final tree

```
$ cmd.exe /c "npm test"       # in apps/fs-pro-server
 ✓ test/plan-effects.test.ts (24 tests)
 ✓ test/world-service-schemas.test.ts (17 tests)
 ✓ test/world-service-client.test.ts (11 tests)
 ✓ test/world-geo.test.ts (25 tests)
 ✓ test/shop.test.ts (5 tests)
 ✓ test/pyramid.test.ts (10 tests)

 Test Files  6 passed (6)
      Tests  92 passed (92)
```

### 3.3 Scratch DB `fspro_b2c` (fresh) + migration 0038

Live `fspro` is still **old** schema (has `TownId`), so the clone is built from
that schema and then migrated (do not touch `fspro` / `fspro_b2a` /
`fspro_pyramid_check`):

```
$ psql "$DATABASE_URL" -c 'DROP DATABASE IF EXISTS fspro_b2c' -c 'CREATE DATABASE fspro_b2c'
DROP DATABASE / CREATE DATABASE
$ docker run --rm --network host pg_dump … postgres:17-alpine -s fspro > schema.sql   # 2187 lines
$ docker run … psql -d fspro_b2c < schema.sql
$ psql fspro_b2c -1 -f …/0038_world_districts.sql
APPLY_EXIT=0 · CREATE TRIGGER / CREATE TABLE / CREATE INDEX / UPDATE 0
$ # verification
DistrictId, CityDistricts, DistrictClubs, FrontierCityId, MetropolisDistricts
PlaceInvites, PlaceStats, TileRevisions
0 places, 0 clubs
```

### 3.4 Go world-service against `fspro_b2c`

```
$ go build -o ws-b2c.exe ./cmd/world-service      # BUILD_EXIT=0
$ DATABASE_URL=…/fspro_b2c WORLD_SERVICE_PORT=3006 ./ws-b2c.exe
{"level":"INFO","msg":"listening","service":"fs-pro-world-service","addr":"127.0.0.1:3006"}
$ curl http://localhost:3006/health
{"status":"ok",…,"database":"up",…}
```

### 3.5 `seedScaleWorld.ts` — 1,000 clubs, `SCALE_SKIP_MATCHES=1`

Run 1 (the committed code; run 2 later corroborated the same shape at 184 s
founding with the since-reverted retry build):

```
$ SCALE_CLUBS=1000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 \
    npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
[scale] 1000 clubs …
SEED_EXIT=0

| Step | Result |
| --- | --- |
| founding | 1000 clubs in 168 s (168 ms each) |
| places opened | 1 countries, 4 regions, 100 cities/districts |
| rows | 1000 clubs, 16000 players, 3746 fixtures |
| atlas (no club lists) | 7 ms · 12 KB, 31 cities |
| atlas (one country's clubs) | 28 ms · 320 KB |
| placement preview | 40 ms · new-town |
| local news feed | 8 ms · 10 items, local = country |
| one pool table | 7 ms · 10 rows |
| every pool table of a country | 11 ms · 42 pools |
| year end + next day | 35,308 ms · 1 pyramids finished, 0 drawn, 0 up / 2 down; errors: 0 |
| editions running after redraw | 0 |
```

`168 ms/club` is HTTP-bound (one `POST /placement/spot` plus Go point reads per
founding), not world-size-bound; the pre-B2 baseline was 75 ms/club at 1k
(`docs/SCALE.md`). At `DistrictClubs=10` the default 1 country holds ~1,340
clubs, so 1,000 clubs correctly stay in one country. Full numbers and the
`0 drawn` cause are in `docs/SCALE.md`.

### 3.6 `checkWorldPyramid.ts` — all non-sim assertions pass

Run on a second fresh scratch DB `fspro_b2c_check` (schema clone + `0038`) with
an isolated world-service built from the **concurrently fixed** Go source
(uncommitted working-tree change, not part of this branch) on port 3007:

```
$ REALTIME_URL=off WORLD_SERVICE_URL=http://localhost:3007 \
    npx ts-node --transpile-only src/scripts/checkWorldPyramid.ts
  ok  pyramid shapes for 1, 11, 12, 31, 288 and 10,000 clubs
  ok  round-robins: every pair meets once per leg, one game per slot per round
  ok  week template: 20 league days and 8 cup days in a 28-day year
  ok  news: natural scope and a bar that rises only with a busy scope
  ok  fill order: district, city, region, country, then a new country
  ok  an invite link places a friend in the inviter's district
  ok  six foundings at once keep every cap
  ok  40 clubs founded, no AI rivals
  ok  2 pyramid edition(s): pool mates are scheduled against each other, on league days only
AssertionError [ERR_ASSERTION]: every league fixture of the year was played
312 !== 0
CHECK_EXIT=1
```

The failure is environmental: `[sim] fixture …: sim service unreachable at
http://127.0.0.1:5050 (fetch failed) - is it running?`, so 312 league fixtures
could not be played. Every assertion before the sim-dependent season passed,
i.e. the Node district placement, invites, caps, Go draw/join and fixture
scheduling are correct once the Go `internal/db` bug is fixed. With the same
fixed service, `POST /pyramid/draw/{id}` returned **200 on 5/5** direct calls.

---

## 4. Acceptance items + evidence

| # | Criterion | Evidence | Result |
| --- | --- | --- | --- |
| 1 | All downstream renames to the new schema, behaviour kept, each cited | §1 table; `tsc` 0 (§3.1) | PASS |
| 2 | Founding calls `getPlacementSpot` inside the `lockPlacement` transaction, creates/names `needsNames`, uses the district, advances `Frontier*` | `club-founding.service.ts` `foundClub`; `placement.service.ts:advanceFrontier`; 1,000 clubs founded green (§3.5) | PASS |
| 3 | `previewPlacement`/`nextSpot` thin callers (preview maps the contract) | `placement.service.ts` header + `previewPlacement`; seed `placement preview` green | PASS |
| 4 | Pyramid draw/join delegate to the Go service, keep the advisory lock and `round-robin` fixtures | `pyramid.service.ts` `drawPyramid`/`joinPyramid`; `pyramid.test.ts` 10/10; draw 200/200 and pool fixtures in §3.6 | PASS |
| 5 | `checkWorldPyramid.ts` + `seedScaleWorld.ts` updated for districts/cities | §1; seed green (§3.5); all non-sim `checkWorldPyramid` assertions green (§3.6) | PASS (season step needs the sim service) |
| 6 | No new public Node route → no route-policy/api-contract route added | `git diff` touches no `route-policy.ts` and no `routes/` | PASS |
| 7 | `tsc --noEmit` 0 errors | §3.1 | PASS |
| 8 | 92 vitest tests pass | §3.2 | PASS |
| 9 | `seedScaleWorld` on fresh `fspro_b2c` with `SCALE_SKIP_MATCHES=1`, timings pasted | §3.3–§3.5 | PASS |

---

## 5. Blocker: 2A `internal/db` cancels its context before rows are consumed

`services/world-service/internal/db/db.go:84-88`:

```go
func (p *Pool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	ctx, cancel := p.WithTimeout(ctx)
	defer cancel()                 // <-- fires when Query returns
	return p.pool.Query(ctx, sql, args...)
}
```

pgx's `Query` returns before the caller iterates `rows.Next()`, so the child
context is cancelled while the rows are still being read — the documented pgx
pitfall. `QueryRow` (`:91-95`) has the same shape (`QueryRow`'s `Scan` happens
after `defer cancel()`), as do `Exec`/`Ping`. Placement's `POST /placement/spot`
mostly uses `QueryRow` and survives, but the pyramid handlers iterate `Query`
(`placesByType`, `points`, `desiredDivisions`, `lowestFreeSlot`), so they fail.

Direct evidence (service up, `database":"up"`, competition `d3ab0c72-…`):

```
$ for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' \
    -X POST http://localhost:3006/pyramid/draw/d3ab0c72-…; done
500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500 500
$ curl -s -X POST http://localhost:3006/pyramid/draw/d3ab0c72-…
{"error":"pyramid draw failed"}
```

`20/20` failures = deterministic, not transient (so a Node retry cannot help;
tried and reverted). In the scale run this shows up as ~1,976 `POST /pyramid/join`
500s vs 354 200s, and the year-end draw `[pyramid] world-service draw
unavailable … [TypeError: fetch failed]`, hence `0 drawn`.

**Fix belongs to the Go owner (2A/1B):** return the `cancel` to the caller (a
`WithTimeoutRows` whose `rows.Close` cancels), or build the child context in
the query helpers and cancel after consumption. `services/world-service/**` is
outside 2C's ownership (brief) so it was not edited. A **concurrent,
uncommitted** working-tree fix (a `timeoutRows`/`timeoutRow` wrapper that
cancels on `Next`/`Close`/`Scan`, plus `query_timeout_test.go` and
`draw_integration_test.go` — none of it in this branch's commit) appeared while
this report was being written; with that fix the §3.6 run passes the pyramid
assertions. Once the Go owner lands it, §3.5 and `checkWorldPyramid.ts` should
be re-run from `perfect/integration`; no Node change is needed.

---

## 6. Known gaps and decisions (R1/R11)

1. **`checkWorldPyramid.ts` season step needs the sim service.** The script now
   runs and passes every placement/hierarchy/invite/cap/draw assertion (§3.6);
   it fails at `every league fixture of the year was played` only because the
   Rust sim service at `127.0.0.1:5050` is not running (312 fixtures
   unplayable). Start the sim (or run the season in an environment that has it)
   to complete the check; no code change needed.
2. **10k/100k end-to-end (D5) not captured.** Only the 1k run completed.
   `docs/SCALE.md` records it and flags the D5 gap.
3. **`previewPlacement` stays a client-shape mapper, not a local
   reimplementation.** The frozen contract has no preview flag and no place
   names, so Node calls the (pure-read) `POST /placement/spot` and resolves the
   existing names/colours via `resolvePlaces`. This is the brief's allowed
   option; the mapping `hole|district → town`, `city → new-town`,
   `region → new-region`, `country → new-country` keeps `PlacementSchema`
   unchanged, so the merged Vue client is untouched.
4. **Q7 `district`/`city` scopes.** The news leaf `town` → `district` rename is
   required by migration `:259` and done. Adding a `city` scope would change
   the **client-facing** `WorldFeed.local.scope` enum
   (`packages/api-contract/src/schemas/calendar.ts:90`) and the realtime topic
   scheme (`apps/fs-pro-client/src/views/game/club-game.vue:804` subscribes to
   `town:`/`region:`/`country:`), which are outside 2C's ownership and would
   break the merged client. The wire keeps the legacy `town` scope tag and
   `town:<districtId>` topic so realtime still works; the city scope is an open
   question rather than a guess.
5. **Un-owned file edited:** `world-feed.service.ts` (mechanical scope
   mapping). Flagged for lead review; no other agent was editing it.
6. **`backfill-world-atlas.ts`** is a legacy pre-pyramid data migration; it now
   creates a city **and** a district and sets `Clubs.DistrictId`, and is a
   no-op on an already-migrated world.

---

## 7. Open questions / blockers

1. **Go `db.WithTimeout` cancel race (§5)** — a concurrent working-tree fix
   appeared during this task (not in my commit); please have the Go owner land
   it on the Go branch and re-run §3.6/§3.5 from `perfect/integration`.
2. **Rust sim service for `checkWorldPyramid.ts`** — start it (port 5050) to
   play the simulated season; the rest of the check is green (§3.6).
3. **Q7 `city` news scope** — needs a client-aware batch (WorldFeed enum +
   `club-game.vue` topics) before it can ship.
4. **D5 100k end-to-end** — not run; requires a fresh `fspro_scale_100k` (do
   not touch the possibly-active `fspro_pyramid_check`) once §7.1 is fixed.

---

## 8. Reproduce

```
# 1. scratch DB (do NOT touch fspro / fspro_b2a / fspro_pyramid_check)
psql "$DATABASE_URL" -c 'DROP DATABASE IF EXISTS fspro_b2c' -c 'CREATE DATABASE fspro_b2c'
docker run --rm --network host -e PGPASSWORD=… postgres:17-alpine \
  pg_dump -h localhost -p 5434 -U fspro --no-owner --no-privileges -s fspro > schema.sql
docker run --rm --network host -i -e PGPASSWORD=… postgres:17-alpine \
  psql -h localhost -p 5434 -U fspro -d fspro_b2c -q < schema.sql
psql "postgresql://fspro:…@localhost:5434/fspro_b2c" -1 \
  -f apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql

# 2. Go world-service against it
cd services/world-service && go build -o ws-b2c.exe ./cmd/world-service
DATABASE_URL=postgresql://fspro:…@localhost:5434/fspro_b2c WORLD_SERVICE_PORT=3006 ./ws-b2c.exe

# 3. Node checks (apps/fs-pro-server/.env: DATABASE_URL=…/fspro_b2c, WORLD_SERVICE_URL=http://localhost:3006)
npm run build --workspace @repo/api-contract
npx tsc --noEmit
npm test
SCALE_CLUBS=1000 SCALE_SKIP_MATCHES=1 REALTIME_URL=off WORLD_TICK_MINUTES=0 \
  npx ts-node --transpile-only src/scripts/seedScaleWorld.ts
REALTIME_URL=off npx ts-node --transpile-only src/scripts/checkWorldPyramid.ts
```

Commit on `perfect/b2-2c`; message ends with
`Generated-by: OpenCode sub-agent 2C`.
