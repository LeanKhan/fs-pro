# WORLD-HIERARCHY-SPEC.md — Batch 1A world model

Status: **design for owner approval** (the one owner gate before Batch 2).
Author: Batch 1A. Branch `perfect/b1-1a`.

This spec defines the world model that Batch 2 implements. It supersedes the
geography, placement, pyramid-shape and map parts of
`docs/WORLD-PYRAMID-SPEC.md` (which still wins on everything else) and the map
part of `docs/WORLD-VIEW-UI-PLAN.md`. Every current-behaviour claim below cites
`file:line`; anything I could not establish is in §11 Open Questions, not
guessed (R1/R2).

Owner decisions implemented: **D1** (country > region > city > district; clubs
belong to a district; no fixed city cap), **D2** (zoom by prominence; no
whole-world endpoint), **D4** (a new Go `services/world-service` owns
placement, hierarchy queries, prominence, pool assignment and tiles; Node calls
it over HTTP). D3 (cultures) and D5 (scale proof) are referenced, not designed
here.

---

## 0. Terms (extends WORLD-PYRAMID-SPEC §Terms and CLAUDE.md)

| Term | Meaning |
| --- | --- |
| **City** | A `Places` row with `Type='city'` under a country, in a region. Replaces the old "town" (`Type='town'`). A city is a small place (one district) or a large one (a metropolis). |
| **District** | A `Places` row with `Type='district'`, `ParentId` = its city, `RegionId` = its region. The leaf place. **Clubs belong to a district.** |
| **Metropolis** | A city whose district count has reached `MetropolisDistricts`. It may hold hundreds of clubs (no hard cap). |
| **Frontier city** | The most recently created city of the most recently created non-full country — the only city allowed to grow past `CityDistricts` towards `MetropolisDistricts`. |
| **Prominence** | A single 0–100 score per club, derived only from stored fields (Division, Level, Elo, Fans, Reputation), used to choose which clubs a map tile draws. |
| **Tile** | One unit of map payload, keyed by zoom + quadtree cell (§7). |

Other terms (Region, Division, Pool, Slot, Level, Rank, Tier, Caretaker,
Scope) keep their WORLD-PYRAMID-SPEC meaning. "Town" is retired for the world
model; it survives only in legacy column names the migration renames.

---

## 1. What exists today (evidence)

- `Places` has `Type` `country` | `region` | `town`, `ParentId`, `RegionId`,
  `FoundedBy`, `MapX/MapY`, `Colors`, `Terrain`, `Motto`
  (`apps/fs-pro-server/src/db/drizzle/schema.ts:44-77`; migration
  `0033_world_atlas.sql:5-20`, `0035_world_pyramid.sql:8-10`).
- A club's place is `Clubs.TownId` (`schema.ts:230-232`), and
  `Clubs.AddressCountryId` (`schema.ts:183`).
- Capacities are on `Calendars`: `TownSize` 6, `RegionTowns` 8,
  `CountryRegions` 6 (`schema.ts:293-297`; `0035_world_pyramid.sql:29-31`).
- Placement is `nextSpot` (`services/world/placement.service.ts:160-194`) with
  the advisory lock `PLACEMENT_LOCK = 0x46535050` and `lockPlacement`
  (`placement.service.ts:33-38`), called inside the founding transaction
  (`services/world/club-founding.service.ts:233-280`).
- `loadWorld` loads **every** placed row and a `GROUP BY Clubs.TownId`
  (`placement.service.ts:71-86`); `growCountry` filters/sorts the town list per
  region (`placement.service.ts:96-112`); `townSpotIn` calls `suggestTownSpot`
  up to 240 times (`placement.service.ts:90-93`; `packages/api-contract/src/world-geo.ts:87-104`).
  So a founding is **linear in the world size**: 75 ms at 1k clubs, 118 ms at
  10k clubs (`docs/SCALE.md:17`).
- The pyramid draw loads every club in the country, sorts them in JS and cuts
  into pools by `(region, town)` (`services/competitions/pyramid.service.ts:270-321`,
  `:368-380`); it runs per country under a per-competition advisory lock
  (`pyramid.service.ts:257-260`). Mid-season join takes a bottom-division open
  slot, preferring the club's region then the emptiest pool
  (`pyramid.service.ts:515-626`, `:547-556`).
- The atlas returns **every** country/region/town with club counts, and club
  lists for the whole world when `total <= 600` (`services/world/atlas.service.ts:37`,
  `:99-107`, `:124-220`). At 10k clubs that is 632–706 KB per page load
  (`docs/SCALE.md:18-19`); the client fetches it whole and reloads on every
  `world:founded` (`apps/fs-pro-client/src/views/game/world-map.vue:495-503`,
  `:529-537`).
- `levelForXp(XP)` derives Level (`services/world/level.ts:25-33`); Elo, Fans,
  Reputation, XP are columns on `Clubs` (`schema.ts:203-213`); match outcomes
  move Fans/Reputation/BoardConfidence in one seam
  (`services/world/club-standing.service.ts:167-231`, called from
  `controllers/game/functions.ts:187`).

---

## 2. Data model: district as a `Places` level (recommendation)

### 2.1 Recommendation

Add a fourth level to `Places` and rename the old town level to city:

```
country  Places.Type='country'   ParentId=null
region   Places.Type='region'    ParentId=country
city     Places.Type='city'      ParentId=country   RegionId=region   (was Type='town')
district Places.Type='district'  ParentId=city      RegionId=region
```

- **Clubs point at a district** via `Clubs.DistrictId` (a rename of the existing
  `Clubs.TownId`, so the FK and every existing row survive).
- The city of a club is `district.ParentId`; the region is `district.RegionId`
  (denormalised on the row, exactly as towns carry `RegionId` today,
  `schema.ts:63-65`). No `Clubs.CityId` — one source of truth, indexed joins.
- `Places.Type` stays free text (`schema.ts:51`); the four values are the
  contract. The unique index `Places_town_name_unique ON (ParentId, lower(Name))`
  (`0033_world_atlas.sql:14`) already gives "unique within parent", so a
  district name is unique within its city and a city name within its country.
- New/renamed `Calendars` settings (§3): `DistrictClubs`, `CityDistricts`,
  `RegionCities`, `MetropolisDistricts`, plus the frontier pointer
  `FrontierCountryId`, `FrontierRegionId`, `FrontierCityId`.
- `Clubs.Prominence real NOT NULL DEFAULT 0` and `Clubs.ProminenceUpdatedAt
  timestamp(3)` (the §5 cache), indexed on `Prominence`.
- Invites: `TownInvites` → `PlaceInvites` with `PlaceId` (a district or a city)
  and `Level` `'district' | 'city'` (§3.6).
- A projection table `PlaceStats(PlaceId PK, Clubs int, UpdatedAt)` maintained
  by a trigger on `Clubs` insert/update/delete, so placement can find holes
  without scanning clubs (§4).
- A `TileRevisions(z int, x int, y int, rev bigint, PK(z,x,y))` table for map
  cache invalidation (§7.5).

Districts are real places, so they reuse `MapX/MapY`, `Terrain`, `FoundedBy`,
`Colors` and the name/code validators (`atlas.service.ts:261-277`,
`club-founding.service.ts:86-124`).

### 2.2 Why not the alternatives

| Alternative | Why rejected |
| --- | --- |
| **Separate `Districts` table** (not in `Places`) | Duplicates the tree, loses the shared `ParentId`/`RegionId`/`MapX`/`Terrain` machinery and the `Places` name/code validators, and forces every atlas/tile/pool query to union two tables. |
| **`Districts` jsonb array on the city** | No FK integrity, no per-district unique name/code, cannot index or `GROUP BY` a district, cannot tile it. |
| **Keep `Type='town'`, add a `District` text column on `Clubs`** | No map geometry for a district, no capacity per district, no place row to pool or name-check against. Also leaves the owner's D1 "city/district" model unimplemented. |
| **Raise the town cap instead of adding a level** | D1 requires clubs to *belong to a district*, not merely hold more clubs per town; this also gives nothing for the map's district zoom level. |
| **`ltree`/materialised path on `Places`** | Adds a Postgres extension for a fixed 4-level tree; indexed `ParentId`/`RegionId` is simpler and as fast at this depth. Revisit only if sub-district levels are ever wanted. |
| **`CLOSURE`/`nested set`** | Write amplification on every place insert; the tree is shallow and append-only in practice. |

### 2.3 Migration 0038 (specified, not written — R7)

New hand-written file **`apps/fs-pro-server/src/db/drizzle/migrations/0038_world_districts.sql`**.
`apply-sql-migrations.ts` picks it up automatically (globs `^\d{4}_.+\.sql$`
with number ≥ `FIRST_UNJOURNALED = 15`, `src/scripts/migration/apply-sql-migrations.ts:23,37-40`)
and runs it once in its own transaction. Matching edit required in
`src/db/drizzle/schema.ts` (drizzle model). Idempotent where possible.

Order (one transaction):

1. **Rename town → city:** `UPDATE "Places" SET "Type"='city' WHERE "Type"='town';`
2. **Create one district per city that has none.** `INSERT` into `Places` for
   every `Type='city'` with no `Type='district'` child:
   `ParentId` = city id, `RegionId` = city `RegionId`, `MapX/MapY` = city
   spot, `Terrain` = city terrain, `FoundedBy` = city founder, `Type='district'`,
   `Name` = a generated name (see below), `Code` = a globally-unique code
   (e.g. `'D-' || substr(city."_id"::text,1,8)`), `Fullname` = `"<Name>, <city>"`.
   Default district name = `"<City> Central"` (generated, like the region
   fallback `regionName`, `placement.service.ts:391-396`). The district is the
   only child of a one-district city, so it deliberately does *not* reuse the
   city name — the UI shows "London › London Central" rather than "London ›
   London". (Naming is a recommendation; see Q3.)
3. **Repoint clubs to districts:** `ALTER TABLE "Clubs" RENAME COLUMN "TownId" TO "DistrictId";`
   then `UPDATE "Clubs" c SET "DistrictId" = d."_id" FROM "Places" city JOIN "Places" d
   ON d."ParentId"=city."_id" AND d."Type"='district' WHERE c."DistrictId"=city."_id"`.
   Rename the index `Clubs_TownId_idx` → `Clubs_DistrictId_idx` (`0033_world_atlas.sql:19`).
4. **Calendars:** `RENAME COLUMN "TownSize" TO "DistrictClubs"` and
   `RENAME COLUMN "RegionTowns" TO "RegionCities"` (values preserved), then add
   `"CityDistricts" integer NOT NULL DEFAULT 2`,
   `"MetropolisDistricts" integer NOT NULL DEFAULT 40`, and the frontier pointer
   `"FrontierCountryId"/"FrontierRegionId"/"FrontierCityId" uuid` (nullable FKs
   to `Places`). Backfill the frontier pointer from the newest non-full
   country/region/city.
5. **Invites:** `ALTER TABLE "TownInvites" RENAME TO "PlaceInvites"`;
   `RENAME COLUMN "TownId" TO "PlaceId"`; add `"Level" text NOT NULL DEFAULT 'district'`;
   repoint each `PlaceId` from the old town to its new district; rename
   `town_invites_club_idx` → `place_invites_club_idx`
   (`0035_world_pyramid.sql:62-72`).
6. **Prominence cache:** add `"Prominence" real NOT NULL DEFAULT 0` and
   `"ProminenceUpdatedAt" timestamp(3)` to `Clubs`, with an index on
   `"Prominence"`; backfill `Prominence` with the §5.1 formula (SQL can read
   `XP`, `Elo`, `Fans`, `Reputation` and the running edition's `Division`).
7. **`PlaceStats` projection + trigger.** Create the table, backfill
   `Clubs = count(clubs in district)` per district, and add a trigger on
   `Clubs` (`INSERT`/`DELETE`, and `UPDATE OF "DistrictId"`) that keeps the
   district's count correct. Index `PlaceStats("Clubs")`.
8. **`TileRevisions` table** (§7.5).
9. **Map geometry index:** `CREATE INDEX "Places_map_idx" ON "Places"("Type","MapX","MapY") WHERE "MapX" IS NOT NULL`.
10. **No data loss, no dropped columns.** `Clubs.TownId` is renamed, not dropped;
    `TownInvites` is renamed. Nothing else in the current schema is dropped.

**Tested backfill (R7).** The migration is a data migration, so it ships with a
check in the style of `src/scripts/checkWorldPyramid.ts` (which refuses a dirty
DB, `:145-147`): apply 0038 to a copy of a real database, then assert:
- every old `Type='town'` row is now `Type='city'` and has exactly one
  `Type='district'` child;
- `count(Clubs where DistrictId is null) = 0` and every `DistrictId` points at a
  `Type='district'` row whose `ParentId` is a city;
- `PlaceStats` equals `GROUP BY Clubs.DistrictId` for every district;
- `count(TownInvites) = count(PlaceInvites)` and every `PlaceId` is a district
  of the invite's old town;
- `Calendars.DistrictClubs/RegionCities` keep the old `TownSize/RegionTowns`
  values.

The data-migration runner pattern to follow is
`src/scripts/migration/backfill-world-atlas.ts` and
`start-world-pyramid.ts` (referenced in `0035_world_pyramid.sql:1-5`).

---

## 3. Capacity and growth rules

### 3.1 Settings (recommended defaults, all world settings)

| Setting | Default | Replaces | Meaning |
| --- | --- | --- | --- |
| `DistrictClubs` | **10** | `TownSize` (6) | Clubs per district. Recommended equal to the pyramid `poolSize` so one district is one pool. |
| `CityDistricts` | **2** | role of `RegionTowns` | Districts an ordinary city grows to. Most cities are small (1 district), like the old "town". |
| `RegionCities` | **8** | `RegionTowns` (8) | Cities per region. |
| `CountryRegions` | **6** | unchanged | Regions per country. |
| `MetropolisDistricts` | **40** | new | Districts the frontier city may grow to → ~400 clubs at `DistrictClubs=10`. |

A full ordinary country is `DistrictClubs × CityDistricts × RegionCities ×
CountryRegions = 10×2×8×6 = 960` clubs, plus the frontier metropolis's extra
districts. 10k clubs need ~11 countries, 100k ~105. These are tuning values
(Q2); the *rules* below do not depend on them.

### 3.2 When a district opens

A new district opens in a city when:

1. **Growth:** every existing district of that city is full
   (`PlaceStats.Clubs >= DistrictClubs`), and the city's district count is below
   its limit. The limit is `CityDistricts` for ordinary cities and
   `MetropolisDistricts` for the **frontier city** (§3.3).
2. **Invite:** a valid district/city invite needs a slot and the city is already
   at its limit. One over-limit district is allowed, mirroring the current
   "invites may push a region past `RegionTowns` by one town"
   (`docs/WORLD-PYRAMID-SPEC.md:94`).

A district never opens for any other reason. A new city opens when the filling
city is at its limit and the region has fewer than `RegionCities` cities. A new
region opens when the filling region is full and the country has fewer than
`CountryRegions` regions. A new country opens when no country has room. The
frontier pointer is advanced as each level opens.

### 3.3 When a city is a metropolis

- An **ordinary city** grows to `CityDistricts` districts.
- The **frontier city** — the most recently created city of the most recently
  created non-full country — is allowed to grow past `CityDistricts` up to
  `MetropolisDistricts`, because the world's newest country needs one growing
  capital. It is the **only** city that may exceed `CityDistricts` without an
  invite.
- A city is called a **metropolis** once its district count reaches
  `MetropolisDistricts` (or, for the UI, once it reaches `CityDistricts` — a
  "large city"). A metropolis has **no club cap**: it holds
  `districts × DistrictClubs` clubs. There is no `TOWN_MAX_CLUBS` check
  (`packages/api-contract/src/world-geo.ts:33`); the check is per district.

The frontier advancing is a single-row update (`Calendars.FrontierCountryId`,
`FrontierRegionId`, `FrontierCityId`), so seeding is O(1) (§4.3).

### 3.4 Fill order (no invite) — honours WORLD-PYRAMID-SPEC §"Fill order"

Mirrors `nextSpot` (`placement.service.ts:160-194`) with one new level:

1. **A hole:** the oldest district in the world with
   `PlaceStats.Clubs < DistrictClubs` (oldest by `createdAt`, then id, as
   today `placement.service.ts:79`). Holes appear when a club is released
   (`caretaker.service.ts:76-100`, which clears the place at `:81`).
2. **A new district** in the filling city (the city with the fewest open
   districts, newest first), if the city is below its limit.
3. **A new city** in the filling region, if it has fewer than `RegionCities`
   cities.
4. **A new region** in the filling country, if it has fewer than
   `CountryRegions` regions.
5. **A new country.**

The "filling" country is the most recently created non-full country; older
countries receive only holes — exactly today's rule
(`placement.service.ts:186-193`). The world grows from one place, and early
players share districts and cities.

### 3.5 Naming the new place

- **New country:** the founder names it (name, code, colours, motto) — unchanged
  (`club-founding.service.ts:131-152`; `docs/WORLD-PYRAMID-SPEC.md:80`).
- **New region:** the founder names it — unchanged.
- **New city:** the founder names it (replaces "new town",
  `club-founding.service.ts:177-195`).
- **New district:** **auto-named** `"<City> <Compass word>"` using the existing
  `regionName` word list (`placement.service.ts:391-396`), so the founding form
  does not grow a fourth name field. (Rejected: asking the founder to name a
  district — a UX cost with no gameplay value; see Q3.)

Validation keeps `nameProblem`/`codeProblem` and per-parent uniqueness
(`atlas.service.ts:261-277`, `world-geo.ts:160-172`); `checkName` gains the
`city` and `district` kinds.

### 3.6 Invites (city and district level) — honours WORLD-PYRAMID-SPEC §"Invites"

`PlaceInvites` keeps `Token` (random, unique), `ExpiresAt`, `MaxUses` (5),
`Uses`, `ByClubId`, and at most 5 live per club (`placement.service.ts:264-338`);
it gains `Level` and a `PlaceId` that is a district or a city.

- **A club creates invites for its own district** (district level) — the common
  case, replacing "its own town".
- **A club with a metropolis city may create a city-level invite** for any open
  district of its city (optional; recommended when its own district is full).
- A founding with a district invite: the district if it has room; else another
  open district of the same city; else a new district in that city (the +1
  over-limit rule, §3.2). Else fall back to normal placement and say so in the
  response (`placement.service.ts:138-154`, `:170-173`).
- A founding with a city invite: any open district of that city; else a new
  district; else fall back.
- `/start?invite=TOKEN` and the `Placement` preview keep working; the response
  schema renames `town` → `city` and adds `district`
  (`packages/api-contract/src/schemas/atlas.ts:120-139`).

---

## 4. Placement algorithm

### 4.1 Current locking (cited)

- `PLACEMENT_LOCK = 0x46535050` and
  `lockPlacement(tx)` → `select pg_advisory_xact_lock(0x46535050)`
  (`apps/fs-pro-server/src/services/world/placement.service.ts:33-38`).
- It is taken **inside the founding transaction**, before `nextSpot` and before
  the club insert (`services/world/club-founding.service.ts:233-235`, `:257-280`),
  so two foundings cannot overfill a place
  (`docs/WORLD-PYRAMID-SPEC.md:63`; tested at
  `src/scripts/checkWorldPyramid.ts:197-200`).
- The pyramid has its own per-competition lock
  `pg_advisory_xact_lock(hashtext('pyramid:<id>'))`
  (`services/competitions/pyramid.service.ts:257-260`, `:519`).

### 4.2 Recommendation: counters + a frontier pointer, O(1) amortised

The Go world-service (D4) replaces the O(world) scan with maintained state:

1. **Holes** come from `PlaceStats`: `SELECT "PlaceId" FROM "PlaceStats" WHERE
   "Clubs" < $districtClubs ORDER BY ...` backed by the `PlaceStats("Clubs")`
   index and the district's `createdAt`. O(log n). No `GROUP BY Clubs` per
   founding (removes the O(C) term in `placement.service.ts:73-78`).
2. **The frontier pointer** (`Calendars.FrontierCountryId/RegionId/CityId`)
   and per-city district counts let the service open the next district/city/
   region/country with point queries instead of filtering every place
   (replaces `growCountry`, `placement.service.ts:96-112`).
3. Geometry for a new district/city uses the existing golden-angle spot
   finders (`world-geo.ts:87-142`) against only the siblings (`towns`/cities in
   the same parent), not the whole world; a `suggestDistrictSpot` is added
   next to `suggestTownSpot` (`world-geo.ts:87-104`).

**Complexity: O(1) amortised per founding** (a bounded number of indexed point
reads + one insert, plus O(log n) for the hole query), versus O(P + C) today.
The 1M benchmark (D5, Batch 2A) must confirm no overfill and the locality
invariants. `suggest*Spot` keeps its 240-iteration bound as a safety net
(`world-geo.ts:96`).

### 4.3 Transaction boundary (documented, Batch 2A implements)

Node keeps the founding transaction (squad, manager, crest, inbox, news live
there). The boundary is:

1. Node opens `db().transaction(...)` and calls `lockPlacement(tx)` first — the
   same `PLACEMENT_LOCK` (`placement.service.ts:33-38`), held for the whole
   founding.
2. Node then calls the world-service `POST /placement/spot` over HTTP **while
   holding the lock**. That request is a pure read (it must **not** take
   `PLACEMENT_LOCK` itself, or it would block behind the caller); it returns
   `{ kind, cityId, districtId, needsNames, x, y, invite }`.
3. Node inserts the places the spot opens and the club, commits, and the lock is
   released.

Correctness: every founder takes the global lock before reading, so reads are
serialised with writes; the world-service's own connection sees the previous
founder's committed state (READ COMMITTED), so no two founders pick the same
slot. The club insert stays in the same transaction as the lock
(`club-founding.service.ts:233-280`, unchanged shape). If founding ever moves
wholly into Go, the world-service takes the lock itself and the HTTP `spot`
call goes away; the spec assumes the Node-owns-transaction form because that is
what Batch 2A describes.

### 4.4 Fairness rules

1. **One global order** for uninvited foundings (§3.4); ties by `createdAt` then
   id (`placement.service.ts:79`). Two founders at the same instant are
   serialised by the lock and get successive spots.
2. **No overfill, ever** — enforced by the lock plus `PlaceStats`, tested with
   200 parallel foundings (Batch 2A) and the existing 6-at-once check
   (`checkWorldPyramid.ts:197-200`).
3. **Holes first, oldest first**, so released slots are reused before the world
   expands (`docs/WORLD-PYRAMID-SPEC.md:65`).
4. **Invites override the order by at most one district** over `CityDistricts`
   (`docs/WORLD-PYRAMID-SPEC.md:94`), never more.
5. **No starvation across countries:** the frontier fills before a new country
   opens (`placement.service.ts:186-193`).
6. **Known throughput bound (not a defect):** the single global advisory lock
   serialises foundings, so peak founding rate is one at a time. At 118 ms per
   founding (`docs/SCALE.md:17`) that is ~8/s; with the O(1) algorithm it should
   fall to low single-digit ms, so the lock is held for a fraction of the
   current time. Sharding the lock by country/region is out of scope and is
   listed in Q1.

---

## 5. Prominence score

### 5.1 Definition (stored fields only)

For a club, with `level = levelForXp(XP)` (`services/world/level.ts:25-33`) and
`div` = the club's `Division` in its country's running pyramid edition (else the
last finished edition, else `DIV_MAX`):

```
eloN = clamp((Elo        - 1200) / (2400 - 1200), 0, 1)
lvlN = clamp(Level           / 20,                0, 1)
fanN = clamp(log10(1 + Fans) / 6,                 0, 1)   // 10^6 fans -> 1
repN = clamp(Reputation      / 100,               0, 1)
divN = clamp(1 - (div - 1)   / 14,                0, 1)   // D1 = 1, D15+ = 0

Prominence = round(100 * (0.30*eloN + 0.25*lvlN + 0.20*fanN
                          + 0.15*repN + 0.10*divN), 2)
```

Inputs are all stored (`Clubs.Elo/Fans/Reputation/XP`, `schema.ts:203-213`;
`Entries.Division`, `schema.ts:409`). Elo is the global strength signal, Level/
XP the progression axis, Fans the crowd signal, Reputation the prestige signal,
and Division is a small local bonus so a top-flight club edges an equal-Elo
lower-division club. Weights sum to 1. A new club (Elo 1500, Level 0, Fans 150,
Rep 5, no division; `club-founding.service.ts:37-39`) scores ≈ 11.9; a world
power scores 100. The normalisation caps (1200–2400 Elo, Level 20, 10^6 fans,
Rep 100, `DIV_MAX` 14) are tuning values (Q4).

### 5.2 Tie-breaks

Descending, applied in order: **Prominence, Elo, XP, Fans, Reputation, smaller
Division, ClubId** (the last for a stable order). All raw fields are stored, so
a tie-break never depends on a cached value.

### 5.3 When it is recomputed

Prominence is a **cache**; the raw fields stay authoritative.

1. **Batched after results.** `applyMatchOutcome`
   (`club-standing.service.ts:167-231`, called from
   `controllers/game/functions.ts:187`) moves Fans/Reputation, and the result
   writer moves Elo/XP. The world-service recomputes the prominence of the
   affected clubs in one batch per hour of matches (the existing "live updates
   batched every 3 s" precedent, `docs/SCALE.md:63`), not per match.
2. **At the pyramid draw and finish**, when `Division` changes
   (`pyramid.service.ts:239-463`, `:698-792`).
3. **At founding**, when the club is created.
4. **A full recount at year end** as a safety net (`year.service.ts:63-143`).
5. **Lazily** by a tile handler if a club's `ProminenceUpdatedAt` is older than
   its inputs' newest mutation (cheap point check).

Stored on `Clubs.Prominence real NOT NULL DEFAULT 0` and
`Clubs.ProminenceUpdatedAt timestamp`, with an index on `Prominence`. This is
what makes "top-K clubs per place" a single indexed read per tile (§7).

---

## 6. Pyramid at scale

### 6.1 Pools of 10 mapped onto divisions

Keep the current shape function (`pyramid.service.ts:104-128`): division `d`
holds `2^(d-1)` pools of `poolSize` (10), and the bottom division absorbs the
rest spread over enough pools to fill ~`bottomFill` (0.8) of their slots. This
already matches WORLD-PYRAMID-SPEC §"Shape" (`docs/WORLD-PYRAMID-SPEC.md:202-204`).
The world-service reimplements it in Go; `pyramidShape` stays the reference and
the parity test (Batch 2B, ≤288 clubs per country) pins it.

Worked sizes (computed from the function above):

| Clubs | Divisions | Shape (clubs per division) |
| --- | --- | --- |
| **100** | 4 | D1 10 · D2 20 · D3 40 · D4 30 into 4 pools (8,8,7,7) |
| **10,000** | 10 | D1 10 · D2 20 · … · D9 2,560 · D10 4,890 into 612 pools (~8 each) |
| **100,000** | 14 | … · D13 40,960 · D14 18,090 into 2,262 pools (~8 each) |

Two consequences the world-service must handle:
- **Division 1 is one pool of 10** (`docs/WORLD-PYRAMID-SPEC.md:208`), so the
  national title is always a 10-club pool. Keep it.
- **The bottom division is huge** at 100k (2,262 pools). The draw must assign
  and insert entries/pools/fixtures **set-based in bulk**, not row by row
  (today entries/rankings are chunked at 1000 and fixtures at 500,
  `pyramid.service.ts:447-452`). Fixture count is `N × (poolSize−1) × legs`
  ≈ 1.8M for one 100k country, once a year; the Go benchmark (`go test -bench`,
  D5) must include it.

### 6.2 Locality: pool by region > city > district

Today the draw orders a division by `(region, town)` and cuts into pools
(`pyramid.service.ts:372-374`), with `regionKey`/`townKey` from the places'
`createdAt` order (`pyramid.service.ts:289-299`). Extend the key to
**`(regionKey, cityKey, districtKey)`** computed from
`district.RegionId`, `district.ParentId`, `district._id` ordering. Lower
divisions then stay local district-by-district; division 1 is a single national
pool. The sort must be done in SQL (`ORDER BY`) or streamed in Go, not loaded
and sorted in JS (replaces `pyramid.service.ts:270-321`).

### 6.3 Mid-season joins

`joinPyramid` (`pyramid.service.ts:515-626`) keeps its shape under the
per-competition advisory lock (`:519`):

1. Find the bottom division's pools with an open slot
   (`:541-556`), preferring the club's **district**, then **city**, then
   **region**, then the emptiest pool (extends the current region-then-emptiest
   order to the new hierarchy).
2. Take the lowest open `PoolSlot`; insert `Entries` + `Rankings` (`:584-600`).
3. Insert that slot's remaining-round fixtures (`:602-623`).
4. If no open slot, add a new bottom-division pool (`:556-582`); division 1
   stays one pool and opens D2 if needed (`:559-561`).

The first club in a country still draws a one-division edition on the spot
(`world-competitions.service.ts:135-141`).

### 6.4 Promotion and relegation

Unchanged. `finishPyramid` ranks each pool with its rules, writes
`FinalPosition`/`FinishScore`/`Movement`, pays division-scaled prizes, and
promotes the top `stage.promote` / relegates the bottom `stage.relegate` with a
Level change (`pyramid.service.ts:698-792`, `:729-732`; `docs/WORLD-PYRAMID-SPEC.md:245-257`).
The next draw reads `Entries.Movement` via `desiredDivisions`
(`pyramid.service.ts:174-187`). Bottom-division tables rank by `ppg` with
`minGamesToRank = 4` (`pyramid.service.ts:49-50`), and an unranked late joiner
cannot be promoted or relegated (`docs/WORLD-PYRAMID-SPEC.md:236`) — keep.
The only change is the locality key (§6.2) and the power-band rule (§6.5).

### 6.5 Making a new club's first pool winnable (power bands)

**Problem.** A new club (Level 0, Elo 1500) takes an open bottom-division slot
(`pyramid.service.ts:547-556`). That slot can belong to a pool of established
clubs — e.g. teams just relegated — so the new club faces an unwinnable first
season. Nothing today bands by power.

**Recommendation.** Inside the bottom division, band by power before locality:

1. Order the bottom division's clubs by the draw order — desired, then Level,
   then XP, then Elo, then id (`pyramid.service.ts:302-321`). New clubs already
   sort **last** because `desired = +∞` (`:312`).
2. Split the ordered list into consecutive **bands** of `poolSize × ceil(1/(1−bottomFill))`
   clubs (with `bottomFill=0.8`, ~5 pools per band) and cut each band into local
   pools by the §6.2 key.
3. A mid-season joiner takes an open slot in the **last (weakest) band** that
   has one, still preferring its district/city/region. The spare slots already
   exist because `bottomFill=0.8` opens ~20% headroom
   (`pyramid.service.ts:121`).

A new club therefore meets mostly other new/weak clubs in its first season, and
promotion (§6.4) moves the winners up naturally. `bottomFill` becomes the knob
for "how many rookie seats exist". This changes the current rule that cuts the
*whole* bottom division by locality (`pyramid.service.ts:368-380`); the
world-service implements bands and the parity test documents the intentional
difference where a country has enough clubs for a band boundary.

---

## 7. Map tiling

### 7.1 Goal and constraint

**D2:** zoom by prominence: world → country → region → city → district → club;
only the most prominent clubs of the visible places are drawn; **no endpoint
may return the whole world**. Today `getAtlas` returns every place and (small
world) every club (`atlas.service.ts:124-220`), 632–706 KB at 10k
(`docs/SCALE.md:18-19`). This section replaces it.

### 7.2 Zoom-level table

| z | Level | Tile draws | Per-place club cap |
| --- | --- | --- | --- |
| 0 | world | country clusters (a quadtree cell holds several countries' markers) | top 3 |
| 1 | country | countries + their top clubs | top 5 |
| 2 | region | regions + top clubs | top 5 |
| 3 | city | cities + top clubs | top 8 |
| 4 | district | districts + top clubs | top 10 |
| 5 | club | every club in the district, in prominence order | all (≤ `DistrictClubs`) |

Each tile answers "which places at this level fall in this cell, and how many
clubs do they hold", plus the top-K clubs by prominence (§5). A place's level
is its `Places.Type`; z selects the level.

### 7.3 Tile key scheme: quadtree `z/x/y` (recommendation)

**Recommend a quadtree over atlas units.** Base cell `TILE_BASE = 256` atlas
units at z0; each level halves (`z+1` splits a cell into four). A place is
assigned to the cell that contains its `(MapX, MapY)` at every level
(`Places.MapX/MapY`, `schema.ts:69-70`). A tile request is
`GET /api/tiles/{z}/{x}/{y}` (proxied by Node to the world-service), returning
the places at level z whose cell is `(x,y)` and their top-K clubs.

Why quadtree:

- **Viewport-native.** The client asks for exactly the cells it can see; even
  z0 never returns the whole world because the world is split across cells
  (D2 satisfied at every zoom).
- **Cheap, stable cache keys.** `z/x/y` is an integer key; the tile can be
  stored and revalidated with an `ETag` and served from CDN/LRU.
- **Local invalidation.** A place's cell and its ancestors (`x/2`, `y/2`, …)
  are O(levels) rows to bump (§7.5); a club change does not dirty the world.
- **Composes with the place tree.** A focused zoom ("districts of city X") is a
  `?placeId=` filter on the same cells; no second scheme.

Rejected:

| Alternative | Why rejected |
| --- | --- |
| **Geohash** string keys | Same geometry as a quadtree but with encode/decode and prefix-neighbour arithmetic at cell borders; no advantage, and neighbour queries are fiddlier than integer `±1`. |
| **Place-tree tiles only** (`/tiles/city/:id`) | A viewport spanning several places needs fan-out requests; zoom transitions are discontinuous at place borders; and the world level still returns every country (violates D2) unless it is itself clustered — which is a quadtree again. |
| **Bounding-box `/region?bbox=`** with no cells | Tile size varies with viewport; no stable cache key; hard to invalidate. |

The existing unbounded sea (`atlasSize` grows right/down,
`world-geo.ts:145-153`) is fine for integer quadtree coordinates. Q5 asks
whether to keep it unbounded.

### 7.4 Per-tile payload budget

- **Hard cap: ≤ 60 KB per tile response** (Batch 3A). Enforced server-side:
  `TILE_MAX_PLACES = 400`, `TILE_MAX_CLUBS = 200`; top-K is
  deterministic by (Prominence, ties §5.2).
- **Overflow rule.** If a cell at level z would exceed the budget, the service
  returns the cell's **parent-level summary** plus `{ overflow: true,
  zoomHint: true }`, and the client zooms in. A tile never silently truncates
  a place it promised.
- The club list carries only what a marker needs: id, name, code, crest
  reference, `x`, `y`, `Prominence`, `human`. The heavy card fields (XP, Elo,
  Fans, Division) are fetched per club on selection, not in the tile.

### 7.5 Caching and invalidation

- **Table `TileRevisions(z, x, y, rev bigint, PRIMARY KEY(z,x,y))`.**
- **On any change** (club founded, released, prominence recomputed, place
  created, division changed), compute the place's cell at each level 0–5 from
  its `MapX/MapY` and bump those cells' `rev` (upsert `rev = rev + 1`), O(levels)
  writes in the same transaction as the change.
- **Server cache:** an in-process LRU keyed `(z,x,y)`, value `(rev, payload)`,
  size-bounded; a request with `If-None-Match: "<rev>"` returns `304` when
  unchanged.
- **HTTP:** `Cache-Control: public, max-age=15, stale-while-revalidate=30` and
  `ETag: "<z>/<x>/<y>:<rev>"`.
- **Realtime:** replace the current whole-atlas reload
  (`world-map.vue:529-537`) with a `world:map-patch` event carrying the changed
  `(z,x,y)` cells; the client (`store/world-tiles.ts`) refetches only those
  cells. The existing `world:founded` patch event is the precedent
  (`atlas.router.ts:95-112`).
- Founding previews: the pre-placement spot is already a small point query
  (`previewPlacement`, `placement.service.ts:197-254`); it stays, and the client
  invalidates the one district/city tile it touches.

### 7.6 What happens to `getAtlas`

`getAtlas` is retired as a whole-world payload (Batch 3C grep every caller).
- `views/game/world-map.vue` and `views/game/found-club.vue` are its only
  callers (`world-map.vue:499`, `found-club.vue:332`).
- The data they need is per-place: the world-map's country headers and the
  founding form's place names come from the tile API; the founding form's
  `me`/limits come from a small `/atlas/me` endpoint (keeps the data, drops the
  whole map).
- `GET /atlas` may remain temporarily as a compatibility shim for the founding
  preview until Batch 3C removes it; D2 forbids shipping it as the map source.

---

## 8. Every section of `WORLD-PYRAMID-SPEC.md` this spec changes

| Section (WORLD-PYRAMID-SPEC.md) | Change |
| --- | --- |
| **Terms** (`:28-39`) | Add City, District, Metropolis, Prominence, Tile; redefine Town → City; Scope may gain `city`/`district`. |
| **Geography and placement → Shape** (`:43-59`) | Add the city and district levels; `TownSize`/`RegionTowns` → `DistrictClubs`/`CityDistricts`/`RegionCities`; "full country = 288" and "10k → ~35 countries" are replaced by §3.1. |
| **Geography and placement → Fill order** (`:61-72`) | Insert "new district in the filling city" before "new city in the region"; frontier pointer. |
| **Geography and placement → Naming the new place** (`:74-86`) | "New town" → "New city" (founder-named); new districts are auto-named. |
| **Geography and placement → Invites** (`:88-95`) | `TownInvites` → `PlaceInvites`; district- and city-level invites; +1 district over `CityDistricts` (was +1 town over `RegionTowns`). |
| **Geography and placement → Map** (`:97-107`) | `getAtlas` no longer returns all places (D2); tiles per §7; district geometry added to `world-geo.ts`. |
| **Geography and placement → What goes away** (`:109-113`) | `TOWN_MAX_CLUBS` (`world-geo.ts:33`) is dead; the 6-per-town cap and its readers go. |
| **Calendar** (`:115-165`) | No change to the clock/week template; only the placement settings on `Calendars` move (§2.3). |
| **Pyramid league → Definition** (`:167-191`) | No schema change; `poolSize` is now aligned with `DistrictClubs` by default. |
| **Pyramid league → The draw** (`:192-225`) | Locality key becomes (region, city, district); bottom division is power-banded (§6.5). |
| **Pyramid league → Joining mid-season** (`:227-238`) | Locality preference becomes district → city → region; weakest band; otherwise unchanged. |
| **Pyramid league → Finish** (`:245-257`) | Unchanged, except division/level of a metropolis country. |
| **Caretaker and release** (`:265-276`) | Release clears `Clubs.DistrictId` (was `TownId`, `caretaker.service.ts:81`). |
| **News scopes → Items / Where an item goes / Reading / Realtime** (`:278-336`) | `Scope` should gain `district` and `city` so natural scope escalates the four-level tree; `TARGET`/topics likewise. (Flagged, designed in Batch 2.) |
| **Data model changes** (`:338-357`) | Replace the table with §2.3: `Places.Type` city/district, `Clubs.DistrictId`, new `Calendars` settings, `PlaceInvites`, `PlaceStats`, `TileRevisions`; migration `0038_world_districts.sql` replaces the 0035 town-level backfill. |
| **Removed** (`:359-365`) | Add: the 6-club town cap, `TownSize`/`RegionTowns` names, whole-world `getAtlas`. |
| **Testing** (`:367-378`) | Add district placement/holes/overfill, city/metropolis growth, prominence ordering, band winnability, tile budget and invalidation; keep the pyramid suite. |

### 8.1 Other docs this spec changes

| Doc | Change |
| --- | --- |
| `CLAUDE.md` (`:48-50`) | "Placement" bullet: town → district (district → city → region → country); "Clubs belong to a district". |
| `docs/SCALE.md` | Re-targets: the 100k end-to-end and the tile/placement/tiling numbers (Batch 2C/3A record them). Already flags "towns per country on zoom" (`:63`). |
| `docs/WORLD-VIEW-UI-PLAN.md` | The "World map" and "Tech" sections (single painted scene, hash-placed clubs, one whole atlas) are superseded by the LOD tile renderer (§7). The campus parts stand. |
| `docs/OPEN-PLAY-COMPETITIONS-SPEC.md` | No rule change; its `Entry.countryIds` filter and `data migration` steps still hold. Note: the district is the new leaf for any place-based filter (Batch 2 keeps `AddressCountryId`). |
| `docs/CORE-LOOP.md` (`:21`, `:29`) | No rule change; "your pyramid division and rank" still holds. |
| `docs/GAME-PHILOSOPHY.md` | No change (AI clubs, async PvP, world persistence are unaffected). |
| `AGENTS.md` | No change. |
| `docs/IMAGINATION-INTEGRATION-PLAN.md` | No change to the integration (D4: `../imagination` is untouched); note that `Places.entity_id` still maps only the country place. |
| `FOR-AGENTS.md` | No change; D1/D2/D4 are implemented by this spec. |
| `docs/perfect/BASELINE.md` §2 F3 / F2 | F3 (whole-world atlas) is superseded by §7; F2 (6/town, 288/country) is superseded by §3. |

---

## 9. Go world-service surface this implies (proposed, Batch 1B/2/3)

Not existing code; listed so Batch 1B builds the right modules. The service is
`services/world-service` (D4), Go 1.24, pgx/v5, `log/slog`, context timeouts on
every DB call.
- `POST /placement/spot` — the binding/preview spot (§4.3).
- `POST /placement/reserve` / release — if founding moves fully into Go later.
- `GET /prominence/{clubId}`, `POST /prominence/recompute` (batch, §5.3).
- `POST /pyramid/draw/{competitionId}`, `POST /pyramid/join` — pool assignment
  (§6).
- `GET /tiles/{z}/{x}/{y}` and `GET /tiles/*?placeId=` — map tiles (§7).
- Every request/response shape gets a zod schema in `packages/api-contract`
  (R6) and a rule in `apps/fs-pro-server/src/middleware/route-policy.ts`
  (public tiles; signed-in placement; admin recompute).

---

## 10. Acceptance mapping (B1-1A brief → this spec)

| Brief item | Where |
| --- | --- |
| 1. District data model vs alternatives; exact migration + backfill | §2 |
| 2. Capacity/growth: when a district opens, when a city is a metropolis, invites at city/district, honouring Fill order/Invites | §3 |
| 3. Placement algorithm with complexity, locking (cite `placement.service.ts:34-38`), fairness | §4 |
| 4. Prominence from stored fields: formula, tie-breaks, recompute | §5 |
| 5. Pyramid at scale 100 / 10k / 100k, locality, mid-season, promotion/relegation, winnable first pool | §6 |
| 6. Map tiling: zoom table, key scheme, budget, caching, invalidation, no whole-world (D2) | §7 |
| 7. Sections of WORLD-PYRAMID-SPEC.md and other docs changed | §8 |

---

## 11. Open Questions (R1 — must not be guessed; owner input)

**Q1 — Founding throughput at 1M.** The single global advisory lock
(`placement.service.ts:34`) serialises foundings. Is one-at-a-time acceptable
for the 1M synthetic test and the 100k scratch run, or must the lock be sharded
by country/region? (Blocks: Batch 2A's 200-parallel test target and the 1M
benchmark's pass criteria.)

**Q2 — Capacity defaults.** Confirm the §3.1 values (`DistrictClubs=10`,
`CityDistricts=2`, `RegionCities=8`, `CountryRegions=6`,
`MetropolisDistricts=40`) or give the owner's numbers. They decide how many
countries the world opens at 10k/100k.

**Q3 — District naming.** Auto-name new districts (`"<City> Central"`, §3.5) or
let the founder name them? Also: do you want "town"/"city" fully renamed in the
UI, or only in the data model? (Blocks: the migration's name defaults and the
founding-form fields.)

**Q4 — Prominence normalisation.** Confirm the caps (Elo 1200–2400, Level 20,
Fans 10^6, Reputation 100, `DIV_MAX` 14) and the weights (0.30/0.25/0.20/
0.15/0.10). These are shape decisions, not code facts.

**Q5 — Unbounded sea.** `atlasSize` grows without bound (`world-geo.ts:145-153`)
and integer tiles handle that, but the client's viewport maths and a maximum
zoom extent are simpler with a cap. Keep it unbounded or set a world bound?
(Blocks: Batch 3A tile extents.)

**Q6 — `PlaceStats` maintenance.** Trigger (recommended, correct for both Node
and Go writers, §2.3) or world-service-maintained? A trigger is DDL the owner
should sign off on. (Blocks: migration 0038.)

**Q7 — News scopes.** §8 lists `district`/`city` scopes as a change; is that in
scope for Batch 2, or keep `town`/`region`/`country`/`world` with `town` mapped
to district for now? (Blocks: news-scope migration and the gateway topics.)

**Q8 — Culture naming (D3, Batch 4).** Does a district's generated name use the
country's culture banks (Batch 4), or the existing `regionName`
compass-word fallback (`placement.service.ts:391-396`) until Batch 4 lands? My
§3.5 assumes the latter. (Blocks: only the naming source, not the schema.)

---

## 12. Explicit non-goals

- No AI clubs on founding (unchanged, `club-founding.service.ts`; tested
  `checkWorldPyramid.ts:206-208`).
- No mode flags or dual code paths (CLAUDE.md:53-55).
- Culture naming/look (D3) and the 1M/100k proof execution (D5) are Batch 4 /
  Batch 2C, not designed here.
- `../imagination` is not modified (D4); this spec only changes fs-pro.
