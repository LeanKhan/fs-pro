# Future Plans

Running log of ideas raised during development that were deliberately **not**
built yet, why, and roughly how each would be implemented when its time
comes. Add to this whenever something gets deferred instead of just dropped
from conversation. Each entry should have enough context that work can start
cold, without re-deriving the reasoning.

Entries are grouped by area. Within a group, newest first.

---

## DB migration (Mongo → Postgres)

### Phase B, entity 4: Player - the big aggregate-pipeline rewrite

**Status:** Done - fourth entity of Phase B (see the "Goal shift" entry
below for the full plan). This is the one this whole migration's per-entity
FUTURE-PLANS entries kept pointing at as "no Drizzle equivalent without a
raw-SQL rewrite" - turned out to be very doable once actually attempted.

**Removed dead code.** `fetchOneById` and `findOnePlayer` had no callers
left anywhere (confirmed by grep) - deleted.

**Converted `getPlayerStats`/`allPlayerStats`** (the two aggregate
pipelines with a *fixed* shape - filter by a single calendar/season id,
not an arbitrary matcher). Both rewritten as a Drizzle `select` with
`sum()`/`avg()`/`count()` and a `GROUP BY`, joining `playerMatchDetails` →
`fixtures` (→ `seasons`, for `getPlayerStats`'s calendar filter) - direct
FK joins, no `$lookup`-on-an-array-of-ids needed since these are all
single-value FKs. The old pipelines' final `$lookup`-into-`Players`
(and, for `allPlayerStats`, `Fixtures`) steps became a new shared
`attachPlayersAndFixtures()` helper: batch-fetch every distinct
player/fixture id the grouped rows reference in one `IN (...)` query each,
then merge in JS - same idea as Club's `Players`/`Manager` populate, just
applied to a computed result set instead of a table read. One real
Postgres-specific fix needed: `min()` has no built-in overload for `uuid`
(used to pick an arbitrary representative Fixture per group, mirroring
Mongo's `$first` after `$unwind`) - cast to `::text` for the comparison,
which is fine since the picked fixture is provably unused by the only
consumer (`awards.controller.ts` fetches it but never reads a field off
it).

Verified against the same live data on both backends: **`getPlayerStats`
returned the identical row count (220) and the identical top-ranked
player with identical stats** (same goals/saves/points/etc, not just the
same count) - as strong a confirmation as Club's ratings-calc parity
check that the SQL rewrite is a faithful port. `allPlayerStats` matched on
row count (110) but not on which player appears first, which is expected
and fine - neither the original Mongo pipeline nor this rewrite has an
explicit sort, so unordered-group iteration order is implementation-defined
on both databases; nothing depends on it.

**`getSpecificPlayerStats` stays raw** - unlike the other two, it takes a
genuinely arbitrary Mongo `$match`/`$sort` object built from
`GET /players/stats`'s query params (can match on dot-paths into the
joined `fixture`/`season` sub-documents), not a single fixed id. Same
"arbitrary query, not a fixed shape" exclusion used throughout this
migration.

**Converted `incrementAllPlayersAge`** (was inline
`updatePlayers({}, { $inc: { Age: 1 } })` in `player.controller.ts`'s
`increaseAllPeoplesAge`, called alongside Manager's now-converted
analogous bump) - same reasoning as Manager's: unconditional, fixed `+1`,
one SQL statement. Verified the same before/after/revert cycle used for
Manager's version, on both backends.

**Converted `createMany`** (bulk player creation, used by the
`/generate-players` dev tool) to a Drizzle bulk `insert().values([...])`
under `backend=drizzle`. **Found, not fixed:** `utils/players.ts`'s
`generatePlayer()` hardcodes `Nationality` to literal Mongo ObjectId
strings (`'611fe72fb69949fd0152a092'` for "kev", etc.) - these aren't
valid Postgres UUIDs and don't correspond to any real `Places` row there,
so `/generate-players` will fail on the `Nationality` FK constraint under
`backend=drizzle` today. Out of scope for this pass (it's in a separate
utility file, not `player.service.ts`, and is a data-generation concern,
not a query/write-path one) - flagging for whoever picks up
`utils/players.ts` next. Verified the bulk-insert mechanism itself works
correctly on both backends using a payload with `Nationality` omitted.

**Left raw, unchanged:** `GET /all` (arbitrary query), `PATCH
/update-many` (arbitrary query+update), `getSpecificPlayerStats` (above),
and `updateById`/the rating-progression half of `updatePlayersDetails`
(per-player, per-row-different `$set`/`$push` operator writes - genuinely
not a fixed-shape bulk operation the way the age bump was).

**Files:** `controllers/players/{player.service,player.controller}.ts`.

---

### Phase B, entity 3: Manager cleanup + age-progression conversion

**Status:** Done - third entity of Phase B (see the "Goal shift" entry
below for the full plan). Manager was already the most-converted entity
going into this pass (fetch/create/update/delete/`populate=Club` were all
done earlier), so this was a small, mostly-cleanup pass.

**Removed dead code.** `fetchAll`, `fetchOneById`, `updateById`, `update`,
`deleteById`, and `create` in `manager.service.ts` had no callers left
anywhere in the codebase (confirmed by grep) - every real consumer had
already migrated to the repository-backed functions in earlier passes.
Deleted rather than left as unused exports.

**Converted `incrementAllManagersAge`** (was `updateManagers({}, { $inc:
{ Age: 1 } })`, called from `player.controller.ts`'s
`increaseAllPeoplesAge` alongside Player's own analogous age bump). Unlike
most operator updates left raw elsewhere in this migration, this one was
genuinely easy: no filter (applies to every row) and the same fixed `+1`
for every manager, so it's one SQL statement under `backend=drizzle`
(`UPDATE "Managers" SET "Age" = "Age" + 1`, via Drizzle's `sql` template
in a `.set()`) - no per-row read-modify-write needed, unlike
`appendManagerRecord`. Verified by sampling three real managers' `Age`
before/after on both backends and reverting the whole-table bump
afterward (`$inc: -2` on Mongo after two verification runs, `Age - 1` on
Postgres after one) - confirmed the sampled managers landed back on their
exact original ages on both backends.

**Left raw, deliberately not touched:** `fetchOne` (used by
`awards.controller.ts` to find a club's currently-employed manager via
`{ isEmployed, Club }`, e.g. to award them "Season Title") - this is
Award's territory, not Manager's, and Award hasn't had its own Phase B
pass yet. Revisit when Award comes up rather than reaching into it now.

**Files:** `controllers/managers/manager.service.ts`,
`controllers/players/player.controller.ts` (`incrementAllManagersAge`
swapped in for the old direct `updateManagers` call).

---

### Phase B, entity 2: Competition full conversion

**Status:** Done - second entity of Phase B (see the "Goal shift" entry
below for the full plan). `delete()` already existed on this repository
from its original conversion pass, so this closed the remaining two gaps:
`populate=true` and the Club/Season membership routes.

**`populate=true` (`GET /competitions/:id`'s default).** `Competition.Clubs`/
`Seasons` don't exist on Postgres - added
`getCompetitionWithClubsAndSeasons()` (`competition.service.ts`), which
composes the base repository read with two reverse lookups already
available for free: `getClubs({ League: id })` and
`getSeasons({ Competition: id })`. `GET /:id` is now **fully**
repository-backed on both branches (`populate=false` and the default) -
no raw fallback left for this route at all.

**`addClubToCompetition`.** Turned out simpler than the original Club-
conversion writeup assumed: despite `ICompetitionRepository`'s doc comment
speculating a competition's `Type` (league vs. cup/tournament) would
decide between `Clubs.League` and the `competitionClubs` join table, the
*live* code only ever does one thing - unconditionally sets
`Club.League`/`Club.LeagueCode`, regardless of `Type`. Checked: nothing in
the app reads or writes `competitionClubs` anywhere except the one-time
migration script - it's schema/relations infrastructure for a
cup/tournament-multi-membership feature that was never actually wired up,
not a live design decision this conversion needed to resolve. So
`addClubToCompetition` just calls `updateClubFields` under
`backend=drizzle`, no branching needed. (If cup/tournament multi-membership
ever becomes a real live feature, revisit then - the join table is ready
for it.)

**`addSeasonToCompetition`.** A genuine no-op under `backend=drizzle`,
same shape as Club's array-vs-FK pattern: `Seasons.Competition` is already
set at season-creation time (`middleware/seasons.ts`'s `create` sets
`data.Competition = competitionID` directly), so `Competition.Seasons`
(which doesn't exist on Postgres anyway) was only ever a redundant
Mongo-side forward array. Nothing left to write.

Verified `populate=true`/`false`, `add-club` (moving a real club between
two real leagues and back), and create/delete against real data on both
Mongo and Postgres - identical club/season counts on both backends for the
same competition. `addSeasonToCompetition`'s no-op branch is trivial
(no DB interaction at all) and wasn't separately exercised live - the
season-creation flow it's chained after is deep game-loop territory
reserved for Season's own dedicated Phase B pass.

**Left raw, unchanged:** `GET /all` (arbitrary query/select).

**Files:** `controllers/competitions/{competition.service,
competition.router,competition.controller}.ts`.

---

### Phase B, entity 1: Club full conversion

**Status:** Done - first entity of Phase B (see "Goal shift" entry below
for the full plan). Closes almost all of Club's remaining gaps in one
pass, since add/remove-player, the ratings recalculation, and delete were
all tightly coupled to each other through the same middleware chain.

**Added `delete()`** to `IClubRepository`/both implementations - same
mechanical fix already applied to Manager/Fixture/Season/Competition.

**`GET /clubs/all`** now goes through the repository too (`getClubs`, no
longer `fetchAllClubs`) - it turned out to take no query at all, so unlike
`/clubs/fetch` it was never actually "arbitrary query," just never wired
up. Added `IClubReadOptions.withPlayersAndManager` (mirrors Manager's
`withClub`) so it still comes back with `Players`/`Manager` populated,
via the `players`/`manager` relations already on `clubsRelations`. One
deliberate, documented simplification: Mongoose's `.populate('Players
Manager')` re-triggers those models' own `pre('find')` hooks, so a
populated Player/Manager's own `Nationality` comes back populated too on
Mongo - the Drizzle version doesn't nest that one level deeper (Nationality
stays a bare id on the nested objects). Low-stakes: this is an
overview/admin endpoint, not on any critical path.

**Add/remove-player, the real fix.** `Club.Players` doesn't exist on
Postgres (dropped in favor of the reverse `players.Club` FK) - so "add a
player to a club" isn't a Club-side write at all there, it's a *Player*-side
write. `toggleSigned` (`player.service.ts`) is now backend-aware: Mongo
keeps doing the `$set` update it always did; Drizzle calls the existing
`updatePlayerFields` (plain fields - `Club`/`ClubCode`/`isSigned` are
direct columns). Added `signManyPlayersToClub` + a new
`IPlayerRepository.updateManyByIds()` for the bulk case
(`PUT /clubs/:id/add-many-players`). `middleware/club.ts`'s
`addPlayerToClubMiddleware`/`addManyPlayersToClub` (the actual
`Club.Players` array push) become a no-op under `backend=drizzle` - by the
time they'd run, `toggleSigned`/`signManyPlayersToClub` (earlier in the
same middleware chain) has already made the real write; the array push
was only ever a Mongo-side redundant-storage optimization.

**Ratings recalculation.** `calculateClubsTotalRatings` (the
`$lookup`/`$unwind`/`$group` aggregate) got a Drizzle branch: group
`players` directly by `Club = clubId` (no `$lookup` needed - `players.Club`
is a direct FK, unlike Mongo's array-based lookup) and compute
`avg`/`count` per `Position` via a plain SQL `GROUP BY`. Verified this
produces numerically identical results to the Mongo aggregate on the same
live roster (`62.70875` both ways, just fewer trailing decimals from
Postgres's `real` type) - confirms the SQL rewrite is a faithful port, not
just "close enough."

Verified the full flow end-to-end on both backends: add a player to a
club, confirm the rating recalculates and the player's ownership fields
are set correctly; remove a player, confirm both revert; bulk add two
players in one call; create and delete a throwaway club. All identical
results on Mongo and Postgres.

**Left raw, unchanged:** `/clubs/fetch` (arbitrary Mongo query + select),
the CSV bulk import (`createManyClubsFromCSV`) - both still need
capabilities the repository deliberately doesn't have.

**Files:** `repositories/ClubRepository.ts` (added `delete`,
`IClubReadOptions`), `repositories/{mongo,drizzle}/ClubRepository.ts`,
`repositories/PlayerRepository.ts` (added `updateManyByIds`),
`repositories/{mongo,drizzle}/PlayerRepository.ts`,
`controllers/clubs/{club.service,club.router}.ts`,
`controllers/players/player.service.ts` (`toggleSigned` made
backend-aware, added `signManyPlayersToClub`), `middleware/club.ts`,
`middleware/player.ts`.

---

### Goal shift: make `USE_DRIZZLE=true` mean zero live Mongo connections

**Status:** In progress - Phase A (of a multi-phase plan) done. Every
entity conversion up to now has been deliberately partial, leaving
anything unconverted to transparently fall back to a live Mongo connection
(`DrizzleDatabase.mongoFallback`). The user asked to go all the way: full
independence from Mongo under `USE_DRIZZLE=true`, without changing the
existing Drizzle schema (`db/drizzle/schema.ts`) - everything needed
(reverse FKs, the `competitionClubs` join table, etc.) is already there
from the original schema-design pass.

Two research passes confirmed the shape of the remaining work: the
match-simulation core (`Game.ts`, `classes/Match.ts`,
`state/ImmutableState/**`, `matchQueue.ts`) is already Mongo-agnostic -
plain objects throughout, `matchQueue.ts` explicitly strips Mongoose/BSON
before crossing the worker-thread boundary. All the real coupling is one
layer down, in each entity's `*.service.ts` file - exactly the layer this
whole migration has already been targeting. The one non-entity-specific
risk found: a handful of unguarded `new Types.ObjectId(...)` calls
(`middleware/player.ts`, `awards.controller.ts`, `player.router.ts`) that
will throw or silently no-op against a Postgres UUID - these disappear
naturally once the arbitrary-Mongo-query call sites that build them get
replaced with typed filters, not a separate fix.

Full roadmap: Phase A (below) closes the two pieces of infrastructure that
sit outside any entity and block every entity's create/login routes
equally. Phase B is per-entity full conversion (not just identity/CRUD) -
arbitrary queries to typed filters, operator updates to plain-field/
read-modify-write, aggregation pipelines to SQL, new repositories for Day/
ClubMatch/PlayerMatch/Award/MatchReplay. Phase C removes the Mongo fallback
entirely once no code path calls `DB.Models.X` raw. Phase D is a full
create-calendar → generate-season → play-matches → end-year run under
`USE_DRIZZLE=true` with Mongo made deliberately unreachable, the first
true full-lifecycle proof. See the full plan for per-entity detail.

**Phase A - done:**

1. **Counter system** (`utils/counter.ts`) used to be a hard Mongo
   dependency independent of any entity/model - `incrementCounter` read
   `DB.db` directly (which resolves to the *Drizzle* object under
   `backend=drizzle`, not a Mongo driver handle - this is the exact crash
   already documented two entries below), and `getCurrentCounter`/
   `getCurrentCounter2` called `mongoose.connection.db` directly, bypassing
   `DB.Models` entirely. Replaced with **raw Postgres `SEQUENCE`s** (one
   per counter: `player_counter_seq`, `manager_counter_seq`,
   `competition_counter_seq`, `season_counter_seq`), created by a
   plain, re-runnable setup script
   (`scripts/migration/setup-counter-sequences.ts`, `npm run
   setup:counter-sequences`) - deliberately **not** a Drizzle schema
   migration, so `schema.ts` doesn't change. `utils/counter.ts` now
   branches on `DB.ormType`: the Mongo branch is untouched byte-for-byte,
   the new Drizzle branch calls `nextval()` on the matching sequence.
   `incrementCounter` becomes a no-op under `backend=drizzle`, since
   `nextval()` already atomically reserves the id in one step - which also
   **fixes the race condition** the old two-step read-then-increment-later
   design had (this is what caused the pre-existing Manager
   `MG-000026` duplicate-key collision documented earlier).
   Sequence starting values were derived from the actual max existing id
   suffix already in each Postgres table (not from Mongo's `sequence_value`,
   which was confirmed out of sync with reality for Manager) - this
   incidentally fixes that collision risk for Player/Manager/Competition
   too. `season_counter` is the exception: `SeasonCode` doesn't follow a
   parseable `S-NNNNNN` pattern, and `season.model.ts` has no `SeasonID`
   field for the generated id to even land in - it looks functionally
   unused today; carried its Mongo value over as a safe starting point
   without chasing this further.
2. **Session store** (`sessionStore.ts`) was a second, fully independent
   live Mongo connection (`connect-mongodb-session`), entirely outside the
   `DB.Models`/`DrizzleDatabase` fallback path. Replaced with a small
   hand-rolled `express-session` `Store` (`PgSessionStore`, in the same
   file) backed by the existing `postgres` driver already in
   `package.json` - deliberately not `connect-pg-simple`, to avoid adding
   `pg` as a second Postgres client. Backed by a new `Sessions` table
   (`sid` text primary key, `session` jsonb, `expires` timestamptz),
   created by `scripts/migration/setup-sessions-table.ts` (`npm run
   setup:sessions-table`) - same "plain setup script, not a schema
   migration" reasoning as the counter sequences. Picks Mongo vs Postgres
   via `db/backendChoice.ts`'s `resolveBackend()` - deliberately **not**
   `db/index.ts` or `db/drizzle/index.ts`, both of which import
   `db/mongodb.ts` and would recreate the exact circular-import problem
   `sessionStore.ts`'s own file comment already documents (`db/mongodb.ts`
   → `user.model.ts` → historically `server.ts` → the db layer again) -
   `backendChoice.ts` is a leaf module (just `fs`/`path`), safe to import
   directly.

Verified both live end-to-end under `backend=drizzle`: created a
Player/Manager/Competition and confirmed sequential, correctly-prefixed,
collision-free ids (including two rapid-fire creates in a row, proving the
race is actually closed); logged in, confirmed a real row landed in the
new `Sessions` table, logged out, confirmed the row was removed. Re-ran
the equivalent checks under `backend=mongo` to confirm zero regression -
both branches are untouched code paths, just gated by an `if` that wasn't
there before.

**Files:** `utils/counter.ts`, `sessionStore.ts`,
`scripts/migration/setup-counter-sequences.ts` (new),
`scripts/migration/setup-sessions-table.ts` (new), `package.json` (two new
`setup:*` scripts).

---

### Season conversion is partial - ninth entity, same identity-only pattern

**Status:** Done, deliberately partial - ninth entity converted after
Place, User, Manager, Club, Competition, Calendar, Player, and Fixture.

**Context:** No auto-populate hook on `season.model.ts`, but
`season.service.ts`'s raw `fetchOneById` defaults its `populate` argument
to `'Fixtures'` - and `season.router.ts`'s `GET /:id` calls it passing
`p` (`undefined` whenever no explicit `?populate=` is given), which still
triggers that default (JS default parameters apply to an explicitly-passed
`undefined`, not just an omitted argument). So in practice every plain
`GET /:id` already came back with the full `Fixtures` array populated -
`findById` replicates that via the `fixtures` relation from
`relations.ts` (`many(fixtures)`, the reverse of `fixtures.Season`), proving
the nested-populate pattern used for Manager/Club/Competition/Fixture
extends cleanly to a one-to-many array relation too, not just one-to-one.

Converted: `GET /:id` (only when no extra `?populate=` is requested - an
explicit one stays on the raw arbitrary-populate path),
`PATCH /:id/start` (`{ isStarted, StartDate }`, and `DELETE /:id`.
`delete()` uses a plain `findByIdAndDelete` on Mongo (not `.remove()`) -
unlike Player/Fixture, Season's `post('remove')` hook is commented out in
the schema, so there's no active cascade to preserve.

**Left raw, and why:** `GET /` (arbitrary query/populate/select/sort
combo - also has a pre-existing, unrelated bug: the hardcoded
`{field: 'CompetitionCode', dir: 1}` sort spec throws
`TypeError: Invalid sort value` in Mongoose, since `.sort()` expects
`{CompetitionCode: 1}`, not `{field, dir}` - hit this directly while
looking for test data; not fixed, out of scope, and it affects every
caller of this exact sort spec, not just Season's route). Also raw:
`POST /` (Competition-coupled, via `addSeasonToCompetition`),
`/:id/:code/generate-fixtures`, `/:id/finish` (Award-coupled), the
`/:id/fixtures`/`/:id/standings`/`/:year/current` reads, and the entire
fixture-generation/standings/prolegation game loop in
`middleware/seasons.ts` and `season.controller.ts`. Every one of those
`findByIdAndUpdate` calls is already plain-field (no Mongo operators - the
codebase is consistent about that for Season), so they're *mechanically*
convertible, but they're deep, sequential, tightly-coupled game-loop
internals - not worth the risk of touching untested for this pass, unlike
the one isolated `/:id/start` call that had no such coupling.

Verified the converted surface (including `Fixtures` populate, `start`,
and `delete`) against real data on both Mongo and Postgres. One test-data
wrinkle worth noting: Postgres's `Seasons` table has real `NOT NULL`
constraints (`StartDate`, `EndDate`, `CompetitionCode`) that the Mongo
schema doesn't enforce - a `create()` payload missing those fails loudly
on Postgres and silently succeeds on Mongo. Not a bug, just something to
remember when constructing test/seed data for this entity going forward.

**Files:** `repositories/SeasonRepository.ts`,
`repositories/{mongo,drizzle}/SeasonRepository.ts`,
`repositories/SeasonRepositoryFactory.ts`,
`controllers/seasons/{season.service,season.router}.ts`.

---

### Season Phase B follow-up - game-loop plain-field writes, fifth Phase B entity

**Status:** Done. Fifth entity in the "make `USE_DRIZZLE=true` mean zero
live Mongo connections" plan, after Club, Competition, Manager, Player.

**Context:** The identity-only pass above deliberately left every
`findByIdAndUpdate` call in `middleware/seasons.ts`/`season.router.ts` raw,
even though they're all plain-field (no Mongo operators). This pass
converts the ones that are genuinely isolated writes, closing them onto
`updateSeasonFields`/`createSeasonRecord`:

- `middleware/seasons.ts`'s internal `create()` (the old fixture-generation
  pipeline): `newSeason` now calls `createSeasonRecord`; `saveFixtures`
  (`{Fixtures: fixtureIds}`) and the inline `setInitialStandings`
  (`{Standings: weeks}`) now call `updateSeasonFields` - `Fixtures` doesn't
  exist on the Postgres schema (dropped in favor of the reverse
  `fixtures.Season` FK, already set per-fixture at creation time via
  `generateFixtureObject`), so that key is a harmless no-op there, same
  pattern as Club's `Players` array.
- Exported `createSeason` middleware and the standalone exported
  `setInitialStandings` middleware: same `createSeasonRecord`/
  `updateSeasonFields` swap.
- `season.router.ts`'s `/:id/:code/generate-fixtures` final handler: same
  `updateSeasonFields({Fixtures: fixtureIds})` swap.
- Fixed three `season._doc._id`/`season._doc.SeasonCode` accesses (in
  `addSeasonToComp` and `createSeason`) to plain `season._id`/
  `season.SeasonCode` - leftover from when these called the raw `.save()`
  (a Mongoose Document); the repository-backed `createSeasonRecord` always
  returns a plain object on both backends now.
- Fixed a genuine pre-existing bug found while testing: `season.service.ts`'s
  `fetchAll()` passed `{field, dir}` straight to Mongoose's `.sort()`,
  which wants `{[fieldName]: 1|-1}` - every caller (only
  `season.router.ts`'s `GET /`) passed the broken `{field, dir}` shape, so
  every plain `GET /seasons` call threw `"Invalid sort value"`. Fixed by
  building the `{[sort.field]: sort.dir}` object inside `fetchAll`.
- Removed dead `season.service.ts` function `createNew` (no remaining
  callers after the above).

**Left raw, unchanged from the identity-only pass:** `season.controller.ts`'s
finish-season flow (genuine mixed `$push`/`$set` operators),
`GET /`/`/:id/seasons/all`'s arbitrary query/populate/select, and the
Calendar-side `findOneAndUpdate` at `season.controller.ts:183` (deferred to
Calendar's own Phase B turn).

Verified live on both backends: `createSeasonRecord` returns a plain
`{_id, SeasonCode}` object (Mongo ObjectId string / Postgres UUID) with no
`._doc` nesting; `updateSeasonFields(id, {Fixtures: [...]})` performs a real
array write on Mongo and a silent no-op on Postgres (unknown column
ignored); `GET /seasons` returns `200`/correctly-sorted results on Mongo
(previously crashed) - Drizzle's `findAll` never took the broken `sort`
path to begin with, since it doesn't implement `fetchAll`'s query/sort
surface.

**Files:** `controllers/seasons/{season.service,season.router}.ts`,
`middleware/seasons.ts`.

---

### Player and Fixture conversions - both partial, plus two real bugs found and fixed

**Status:** Done, deliberately partial - seventh and eighth entities
converted after Place, User, Manager, Club, Competition, and Calendar.

**Player.** Same always-populate-`Nationality` hook shape as Club/Manager/
Competition. Converted: `GET /:id` (and the two internal reads at
`GET /:id/rating` and `PUT /works/add-roles/:id`, both switched to the
repository too), `POST /:id/update` (plain fields), `POST /new`,
`DELETE /:id`. Left raw: `GET /all` (arbitrary query), `PATCH /update-many`
(bulk, arbitrary update), `/stats` and the three aggregate-pipeline stats
functions (`getPlayerStats`/`getSpecificPlayerStats`/`allPlayerStats` -
multi-stage `$lookup`/`$group` Mongo aggregations, no Drizzle equivalent
without a raw-SQL rewrite), and `updatePlayersDetails` (end-of-year
rating/age progression - `$set`/`$push` operators). `delete()` on Mongo
uses `.remove()` (not `findByIdAndDelete`) specifically to keep
`player.model.ts`'s real, active `post('remove')` hook firing (it pulls
this player out of `Club.Players`, a Mongo-only array, and deletes its
`PlayerMatch` history) - the Drizzle implementation deletes the matching
`playerMatchDetails` rows explicitly first, since that FK has no
`ON DELETE CASCADE`.

**Fixture.** No auto-populate hook, but `fixture.service.ts`'s raw
`fetchOneById` always populates `HomeSideDetails`/`AwaySideDetails` (each
with `PlayerStats`) regardless of its own `populate` argument - so
`findById` replicates that same baseline via nested Drizzle relations
(`homeSideDetails`/`awaySideDetails`, each `with: { playerStats: true }`),
proving Manager/Club/Competition's single-level nested-populate pattern
extends cleanly to two levels. Converted: `GET /:id` (only when no extra
`?populate=` is requested - that case needs the raw arbitrary-populate
path) and `DELETE /:id`. Left raw (and never exposed via router to begin
with - no public create/update route exists for Fixture, only match-engine
internals): `findOneAndUpdate` (arbitrary query + update, used throughout
match simulation to record state) and bulk creation
(`createFixtures`/`createMany`). `create`/`update`/`findAll` exist on the
repository for future use but aren't wired into anything yet.

**Two real, pre-existing bugs found and fixed along the way (not part of
the DB-migration scope, but directly blocking the routes converted here):**

1. `fixture.model.ts`'s `post('remove')` hook was declared
   `async function(this, next)` - a post-remove hook's real signature is
   `(doc, next)`, so the single declared parameter `next` was actually
   bound to the removed *document*, not a callback. Calling `next()` then
   threw `TypeError: next is not a function` - on **every single** Fixture
   removal, silently after the deletion had already committed (so the
   document really was gone, but every caller saw an error instead of
   confirmation). This predates this session entirely; it just never got
   exercised live until `DELETE /fixtures/:id` was tested against a real
   record here. Fixed by adding the missing `doc` parameter and dropping
   `next()` (unnecessary for an async hook - Mongoose waits on the
   returned promise instead).
2. `POST /players/new` and `POST /competitions/new` called
   `respond.success(...)` and *then* `void incrementCounter(...)` - if
   `incrementCounter` throws, that throw now lands inside a `try` block
   whose `catch` calls `respond.fail(...)` on a response that was already
   sent, crashing the process with `Error: Cannot set headers after they
   are sent to the client`. Hit this directly testing Player creation
   under `backend=drizzle`: `incrementCounter` reads `DB.db` (see
   `db/index.ts`), which resolves to the *Drizzle* database object under
   that backend, not a raw MongoDB driver handle - calling `.collection()`
   on it throws synchronously. Fixed by reordering both routes to call
   `incrementCounter` *before* `respond.success` (matching the order
   `manager.router.ts`'s create route already used) - a thrown error now
   produces one clean `respond.fail`, not a crash. The underlying
   `incrementCounter`/`DB.db` mismatch under `backend=drizzle` is a
   separate, bigger, pre-existing problem (the whole Mongo `counter`
   collection concept was never adapted for Postgres) - not fixed, same
   family as the already-documented Manager/Competition counter issues.

Verified both entities' converted surface (including the nested Fixture
populate and both bug fixes) against real data on both Mongo and Postgres.

**Files:** `repositories/{Player,Fixture}Repository.ts`,
`repositories/{mongo,drizzle}/{Player,Fixture}Repository.ts`,
`repositories/{Player,Fixture}RepositoryFactory.ts`,
`controllers/players/{player.service,player.router}.ts`,
`controllers/fixtures/{fixture.service,fixture.router,fixture.model}.ts`,
`controllers/competitions/competition.router.ts` (counter-ordering fix
only).

---

### Fixture Phase B follow-up - match engine's own writes, sixth Phase B entity

**Status:** Done. Sixth entity in the "make `USE_DRIZZLE=true` mean zero
live Mongo connections" plan, after Club, Competition, Manager, Player,
Season.

**Context:** The identity-only pass above deliberately left the match
engine's `findOneAndUpdate` raw, even though it's plain-field (no Mongo
operators). This pass closes it, plus two other call sites that turned out
to already be doing no more than the repository's `findById`/`create`
already do:

- `game/functions.ts`'s `updateFixture` (the real match-finish write - sets
  `Played`, `PlayedAt`, `Details`, `Events`, `HomeSideDetails`,
  `AwaySideDetails`, `HomeManager`, `AwayManager` by `_id`, no operators)
  now calls `updateFixtureFields` instead of the raw `findOneAndUpdate`.
  Every field it sets is a real column on Postgres's `Fixtures` table, so
  this is a straight port, not a partial one.
- `game.controller.ts` and `jobs/matchQueue.ts` both called
  `fetchOneById(id, false)` - passing `populate: false` skips the raw
  function's *extra*-populate branch entirely, leaving it doing exactly
  what `getFixtureById` (repository-backed, always includes
  `HomeSideDetails`/`AwaySideDetails`+`PlayerStats`) already does. Both
  swapped over.
- `game.controller.ts`'s `restCreateFriendly` (`POST /game/friendly`)
  called the raw `createNew`, unwrapping a `{error, result}` shape; swapped
  to the repository-backed `createFixture` (throws on failure, already
  inside a try/catch that produces the same `respond.fail`).
- Removed now-dead `fixture.service.ts` functions `createNew` and
  `findOneAndUpdate` (no remaining callers anywhere in the codebase after
  the above), and the now-unused `incrementCounter` import.

**Left raw, unchanged:** the explicit `?populate=` path on
`GET /fixtures/:id` (arbitrary Mongoose populate spec, no general Drizzle
equivalent worth building for one param), `fetchAll`/`deleteAll` (used by
`season.router.ts`'s `/:id/fixtures` route - out of scope for this pass,
Season's own territory), and bulk `createFixtures`/`insertMany` (fixture
generation, already FK-correct per-fixture at creation time, not a
plain-field update).

Verified live on both backends: created a friendly fixture via
`createFixture`, fetched it via `getFixtureById`, applied the match-finish
`updateFixtureFields` write (`Played`, `PlayedAt`, `Details`, `Events`),
and deleted it - identical behavior and field values on Mongo and
Postgres.

**Files:** `controllers/fixtures/fixture.service.ts`,
`controllers/game/{functions,game.controller}.ts`, `jobs/matchQueue.ts`.

---

### Competition and Calendar conversions - both partial, same identity-only pattern

**Status:** Done, deliberately partial - fifth and sixth entities converted
after Place, User, Manager, and Club. Built `delete()` into both
repositories from the start this time (learned from the Manager/Club
create-without-delete gap two entries below).

**Competition.** `competition.model.ts` has the same always-populate hook
shape as Club/Manager: `pre('find')`/`pre('findOne')` unconditionally
populate `Country` (a full `Place`, top-level field this time, not nested
like Club's `Address.Country`). Converted: `GET /:id?populate=false`
(explicit only - the default, `populate=true`, populates `Clubs`/`Seasons`
and stays raw), `POST /:id/update` (plain fields), `POST /new`, and
`DELETE /:id`. Left raw: `GET /all` (arbitrary Mongo query object),
`GET /:id/seasons/all` (Season-coupled), `addClubToCompetition`/
`addSeasonToCompetition` - `Competition.Clubs` doesn't map to one thing on
Postgres: a league's clubs live on `Clubs.League` (a single FK, since a
club has exactly one primary league), but a cup/tournament's clubs live in
the `competitionClubs` join table (genuinely many-to-many - a club can be
in its league AND a cup at once). Picking the right one per competition
`Type` is a real design decision, not a mechanical conversion - not done
here.

**Calendar.** No auto-populate hook on this one. Converted:
`GET /calendar/calendars/:id`, `GET /calendar/calendars`,
`DELETE /calendar/calendars/:id`, and two internal call sites that were
already doing safe, plain-field work: `createCalendarYear`
(`POST /calendar/new`, was `createNew`/raw `.save()`, `Days: []` at
creation is trivially safe to drop) and `endYear`'s
`isActive: false, isEnded: true` write (was `updateCalendar` with a plain
object, no operators - genuinely just needed swapping in
`updateCalendarFields`). Left raw, and it's the bulk of
`calendar.controller.ts`: `createSeasonsInTheYear`, `setupDaysInYear`/`2`
(build `Calendar.Days`, which Postgres dropped entirely in favor of
`days.Calendar`, the reverse FK), and `startYear`'s
`updateCalendars({}, [{ $set: { isActive: { $eq: [...] } } }])` - a Mongo
aggregation-pipeline update that computes a different value per row
(`isActive = thisRow.YearString === year`), not a fixed-value update the
repository's plain `update()` could express. **Day itself has no
repository at all** - its one real read path, `GET /calendar/:year/days`,
needs `Matches.Fixture` populated (a full Fixture per match, not a bare
id), and Fixture isn't converted; building that properly needs Fixture
first, so it wasn't attempted as a side effect of this pass. This whole
area is also the one already flagged for an eventual perpetual-calendar
redesign ("Global, perpetual calendar" entry below) - not worth over-
investing in converting the current Days-array/Year-bootstrap mechanics
precisely because they're slated to be replaced, not just ported.

Verified both entities' full converted surface (create/read/update/delete)
against real data on both Mongo and Postgres, including the Country
auto-populate replication and the two internal calendar-controller call
sites.

**Files:** `repositories/{Competition,Calendar}Repository.ts`,
`repositories/{mongo,drizzle}/{Competition,Calendar}Repository.ts`,
`repositories/{Competition,Calendar}RepositoryFactory.ts`,
`controllers/competitions/{competition.service,competition.router}.ts`,
`controllers/calendar/{calendar.service,calendar.router,calendar.controller}.ts`.

---

### Calendar Phase B follow-up - Days-array game loop, seventh Phase B entity

**Status:** Done. Seventh entity in the "make `USE_DRIZZLE=true` mean zero
live Mongo connections" plan, after Club, Competition, Manager, Player,
Season, Fixture.

**Context:** The identity-only pass above deliberately left the whole
Days-array-building game loop raw. Closing it needed two genuinely new
pieces (not just swapping a call site), plus five mechanical ones:

- **`ICalendarFilter` gained `YearString`**, and `DrizzleCalendarRepository.findAll`
  filters on it - `getCalendars({YearString})` now works on both backends,
  where before only Mongo's raw `.find(filter)` happened to accept it (the
  Drizzle implementation ignored any key it didn't explicitly check).
- **New repository method `activateYear(yearString)`** covers `startYear`'s
  "flip every calendar's `isActive` in one go" - the old Mongo call was a
  single aggregation-pipeline update computing a different value per row
  (`$set: { isActive: { $eq: ['$YearString', year] } }`); Postgres has no
  per-row-computed value in a plain `update()`, so the Drizzle
  implementation is two statements (deactivate + reset `CurrentDay`
  everywhere, then activate the one match) - there are only ever a handful
  of Calendar rows, so two round-trips costs nothing real. Wired into
  `calendar.service.ts` as `activateCalendarYear()`, replacing
  `calendar.controller.ts`'s `startYear`'s raw `updateCalendars` call.
- **New service helpers `updateCalendarByYearString`/`getCalendarByYearString`**
  (read-by-`YearString`-then-write-by-id, since the repository's `update()`
  only takes an id) replace the raw `findOneAndUpdate({YearString}, ...)`/
  `fetchOne({YearString}, ...)` call sites in `changeCurrentDay`
  (`calendar.controller.ts`) and the season-creation calendar lookup
  (`middleware/seasons.ts`'s `create`/`createSeason`, called twice).
- `setupDaysInYear`/`setupDaysInYear2`'s `fetchCalendar` (`fetchOneById`)
  and `saveCalendar` (`Days` array write) now go through
  `getCalendarById`/`updateCalendarFields` - `Days` doesn't exist on
  Postgres (dropped in favor of the reverse `days.Calendar` FK, already set
  per-day at construction time in both functions' own Day-building code),
  so it's a harmless no-op there, same pattern as Season's `Fixtures`.
- `endYear`'s `fetchOneById` swapped to `getCalendarById` too (added a null
  check the raw call never needed, since Mongoose's `findById` result was
  used unchecked before).
- `season.controller.ts`'s finish-season flow (`checkOtherSeasons`) had its
  own raw Calendar `findOneAndUpdate({_id}, {allSeasonsCompleted: true})` -
  flagged in the Season entry above as deferred to Calendar's turn, now
  swapped to `updateCalendarFields`.
- Removed now-dead `calendar.service.ts` functions `fetchOneById`,
  `findOneAndUpdate`, `findAndUpdate` (no remaining callers anywhere after
  the above). `createSeasonsInTheYear` needed no changes at all - it has no
  Calendar calls of its own, only `fetchAll` (Competition, already
  converted) and `create` (Season, already converted).

**Left raw, and why:** `getCurrentCalendar`'s `fetchOne({isActive: true},
populate, {skip, limit})` - genuinely arbitrary populate+pagination, same
class of exclusion as every other entity's "explicit extra option" case.
Calendar's pre-existing `updateCalendar` (`findByIdAndUpdate`-based) was
already dead code with zero callers before this pass even started - left
alone, not this pass's job to clean up.

Verified live on both backends: created two calendars, confirmed
`getCalendarByYearString` finds the right one, `updateCalendarByYearString`
writes `CurrentDay`, `activateCalendarYear` correctly activates exactly one
row and resets `CurrentDay` to 0 on every row, and `updateCalendarFields`
with a `{Days: [...]}` payload performs a real array write on Mongo and a
silent no-op on Postgres.

**Files:** `repositories/CalendarRepository.ts`,
`repositories/{mongo,drizzle}/CalendarRepository.ts`,
`controllers/calendar/{calendar.service,calendar.controller}.ts`,
`middleware/seasons.ts`, `controllers/seasons/season.controller.ts`.

---

### Day - eighth Phase B entity, first with a genuinely new repository shape

**Status:** Done. Eighth entity in the "make `USE_DRIZZLE=true` mean zero
live Mongo connections" plan, after Club, Competition, Manager, Player,
Season, Fixture, Calendar - and the first one the plan flagged up front as
needing a repository that isn't just the usual identity/CRUD shape.

**Context:** Mongo's `Day.Matches` is an array of embedded match summaries
(`{Fixture, Competition, CompetitionId, MatchType, Played, Time,
FixtureIndex, Week}`), each `Fixture` a real reference Mongo can
`.populate({path: 'Matches.Fixture'})`. Postgres's `Matches` is jsonb - a
plain array of objects, not a relation - so there's nothing for a Drizzle
`with` to hook into. Per the plan, the fix is a batch fetch+merge: pull the
distinct Fixture ids out of a set of Days' `Matches` arrays, fetch them in
one query via `FixtureRepository`, and splice the full Fixture objects back
into each `Matches` entry - `attachFixturesToDays()` in `day.service.ts`,
the same shape as Player's `attachPlayersAndFixtures` (added `ids` support
to `IFixtureFilter`/both Fixture repositories to make the batch fetch
possible: `getFixtures({ids: [...]})`).

**`IDayRepository` is deliberately minimal** (`findById`/`create`/
`createMany`/`update`/`delete`) - every read/write that touches `Matches`
branches on `DB.ormType` directly in `day.service.ts` instead of going
through the repository interface, same precedent as Player's
`getPlayerStats`/`allPlayerStats`:

- **`getDaysForYear({Year, isFree?, notPlayed?, limit?})`** replaces the
  raw `fetchMany` behind `GET /:year/days` - always returns
  `Matches.Fixture` populated now (previously toggleable via
  `?populate=`, dropped as a superset simplification, same precedent as
  every other entity's always-on baseline populate). The `notPlayed` filter
  (Mongo's `{'Matches.Played': false}` - "at least one match in this day
  is still unplayed") is applied in JS on the Drizzle side after fetching
  by the plain `Year`/`isFree` columns, rather than a raw jsonb query -
  bounded by a few hundred rows per year at most, not worth a jsonb
  containment expression for.
- **`findDayByFixtureId(fixtureId, {populate?})`** replaces the raw
  `findOne({'Matches.Fixture': id})` call sites (`GET
  /day-of-fixture/:fixture`, `game.controller.ts`'s `simulate_rest` check).
  The Drizzle branch uses a raw jsonb containment query
  (`Matches @> '[{"Fixture": "<id>"}]'::jsonb`) - unlike `getDaysForYear`,
  this has no `Year` to scope the scan to, so it needs to be pushed down to
  the database rather than fetching every Day ever created.
- **`findNextPlayableDay(year, afterDay)`** replaces `changeCurrentDay`'s
  `getNextDay` (`$nor: [{'Matches.Played': true}], Year, isFree: false, Day:
  {$gt}` - "first non-free day after this one with nothing played yet").
  Same JS-side filter approach as `getDaysForYear`, plus an explicit
  `ORDER BY Day ASC` the original raw query didn't have (it relied on
  Mongo's natural/insertion order, which happens to already be ascending -
  making the intended order explicit rather than porting the implicit
  assumption).
- **`markMatchPlayed(fixtureId)`** replaces `game/functions.ts`'s
  `updateFixture`'s positional Mongo update (`findOneAndUpdate` +
  `$set: {'Matches.$.Played': true}`) - Postgres has no per-array-element
  update via Drizzle's plain `update()`, so this is a read-modify-write
  instead (fetch the Day with *bare* Fixture ids via
  `findDayByFixtureId(id, {populate: false})` - populating first would
  corrupt the write-back, replacing real ids with full objects - flip the
  one matching entry's `Played` in JS, write the whole array back). Safe
  since match-finish writes for a given fixture aren't concurrent with
  themselves.
- `createManyDays` (repository-backed bulk insert) replaces the raw
  `createMany` used by `setupDaysInYear`/`2`'s Day-building.
- `DELETE /days/:id` (`calendar.router.ts`) swapped from
  `calendar.service.ts`'s raw `deleteDayByRemove` (a `doc.remove()` kept
  only because Day's Mongoose model *used* to have a `post('remove')` hook
  - it's been commented out in `day.model.ts` for a while, so there's no
  active cascade to preserve) to the new repository's plain `delete()`.
  Removed the now-dead `deleteDayByRemove`.

Verified live on both backends: created two Days (one with a real Fixture
match, one free) under a test Calendar year, confirmed `getDaysForYear`
returns them sorted by `Day` with `Matches.Fixture` populated,
`findDayByFixtureId` finds the right Day with the Fixture populated,
`findNextPlayableDay` picks Day 1, `markMatchPlayed` flips the right
match's `Played` flag and persists it, and the day drops out of a
subsequent `notPlayed` query afterward - identical results on Mongo and
Postgres.

**Files:** `repositories/DayRepository.ts`,
`repositories/{mongo,drizzle}/DayRepository.ts`,
`repositories/DayRepositoryFactory.ts`, `repositories/FixtureRepository.ts`,
`repositories/{mongo,drizzle}/FixtureRepository.ts` (added `ids` filter),
`controllers/days/day.service.ts`,
`controllers/calendar/{calendar.router,calendar.controller,calendar.service}.ts`,
`controllers/game/{game.controller,functions}.ts`.

---

### User Phase B follow-up - registration, ninth Phase B entity

**Status:** Done. Ninth entity in the "make `USE_DRIZZLE=true` mean zero
live Mongo connections" plan, after Club, Competition, Manager, Player,
Season, Fixture, Calendar, Day. Smallest of the nine - User's identity/
club-ownership surface was already fully converted in an earlier pass
(see the "User conversion is partial - Club-coupled routes stay on Mongo"
entry below); this closes the one piece that pass deferred.

**Context:** `IUserRepository`'s own doc comment used to say registration
stayed raw because "a freshly-created user needs a Mongo ObjectId for
`Club.User` to reference, and Club isn't converted yet." Club has been
fully converted for several entities now (see the Club Phase B entry
above), so that blocker no longer holds - `updateClubs` (the middleware
`POST /join` chains into) already calls the fully-converted
`updateClubFields`.

- **Added `create()` to `IUserRepository`** (Mongo: `DB.Models.User.create()`,
  still going through the model's `pre('save')` password-hashing hook;
  Drizzle: a plain insert with the same `hashPassword()` call `update()`
  already made, since Postgres has no equivalent hook to rely on).
  `user.service.ts`'s `createUser()` wraps it.
- **`user.router.ts`'s `POST /join`** swapped from the raw `createNewUser`
  (returned `{error, result}`, `result._doc._id`/`.Clubs` - Mongoose
  Document access) to `createUser` (throws on failure, plain object
  either way) - added a `try/catch` checking for a duplicate-username
  error on either backend (Mongo's `code === 11000`, Postgres's unique
  violation surfacing as `error.cause.code === '23505'` through
  postgres-js, same shape as the FK-violation code seen testing Season's
  delete).
- **`middleware/user.ts`'s `initializeSession`** (the `POST /join`
  session-stamping step) swapped from the raw `updateUser`
  (`DB.Models.User.findByIdAndUpdate`) to `updateUserFields` - same fix
  `initializeSessionForLogin` already had for the login path, just never
  applied here since registration didn't need it until now.
- **`addClubsToUser`** (CSV bulk import's `saveClubsInUser` - re-writes
  `Users.Clubs` for clubs that already have their `User` FK set, an
  already-redundant sync even on Mongo) made a `DB.ormType === 'drizzle'`
  no-op, same array-vs-reverse-FK pattern as Club's `Players`/Season's
  `Fixtures`/Calendar's `Days`.
- Removed now-dead `user.service.ts` functions `createNewUser`,
  `updateUser` (no remaining callers after the above). Left `fetchUser`,
  `getUserSession`, `fetchOneUser`, `updateManyUsers`/`alertAllUsers`
  alone - all already dead code with zero callers *before* this pass
  started (confirmed by grep), not something this pass caused or is
  responsible for cleaning up.

Verified live on both backends: `createUser` hashes the password (verified
via `comparePassword` round-tripping), the created user is findable by
username, `updateUserFields` stamps a session, and `addClubsToUser`
performs a real Mongo write while no-op-ing cleanly on Postgres.

**Files:** `repositories/UserRepository.ts`,
`repositories/{mongo,drizzle}/UserRepository.ts`,
`controllers/user/{user.service,user.router}.ts`, `middleware/user.ts`.

---

### ClubMatch and PlayerMatch - tenth/eleventh Phase B entities

**Status:** Done. Tenth and eleventh entities in the "make
`USE_DRIZZLE=true` mean zero live Mongo connections" plan, after Club,
Competition, Manager, Player, Season, Fixture, Calendar, Day, User. Both
new repositories, both trivially small once found: each has exactly **one
real call site**, `game/functions.ts`'s `savePlayerAndClubStats` (part of
`updateFixture`, the match-finish persistence write) - every other
function in `club-match.service.ts`/`player-match.service.ts` (`fetchAll`,
`fetchMany`, `fetchOneById`, `findOne`, `findOneAndUpdate`, `deleteById`,
and ClubMatch's own dead `createMany`/PlayerMatch's dead `createNew`) has
zero callers anywhere, confirmed by grep - left alone, not part of this
pass.

**The one real wrinkle: write order had to flip.** Postgres's
`clubMatchDetails` table has no `PlayerStats` column - it's dropped in
favor of the reverse `playerMatchDetails.ClubMatchDetails` FK
(`schema.ts` even has a comment noting the field "doesn't exist in the
current Mongoose model," added specifically for this). Mongo's old code
created every `PlayerMatchDetails` row *first* (purely to collect their
ids for the `ClubMatchDetails.PlayerStats` array), then created the
`ClubMatchDetails` row last. Postgres needs the opposite: `ClubMatchDetails`
has to exist first so each `PlayerMatchDetails` row can set its FK back to
it. `savePlayerAndClubStats` now always creates `ClubMatchDetails` first
(with `PlayerStats: []`), then the `PlayerMatchDetails` rows with
`ClubMatchDetails: clubMatchId` baked in - one order that works on both
backends (nothing on Mongo depended on the old ordering; it just happened
to be the shape that got ids in Mongo's specific way). Mongo still gets a
follow-up `updateClubMatchFields(clubMatchId, {PlayerStats: [...]})`
backfill write to keep its real array in sync (`DB.ormType !== 'drizzle'`
branch) - Postgres skips it, since the reverse FK already has everything it
needs.

Repositories are deliberately small: `IClubMatchRepository` is
`findById`/`create`/`update`/`delete` (Drizzle's `findById` populates
`PlayerStats` via the `playerStats: many(playerMatchDetails)` relation
already in `relations.ts`, matching Mongo's own populate);
`IPlayerMatchRepository` is `findById`/`createMany`/`update`/`delete` -
`createMany` is the only one actually exercised.

Verified live on both backends: created a ClubMatchDetails row, created two
PlayerMatchDetails rows against it, and confirmed `getClubMatchById`
returns exactly 2 `PlayerStats` entries either way - a real array on Mongo,
the reverse-FK join on Postgres.

**Files:** `repositories/{ClubMatch,PlayerMatch}Repository.ts`,
`repositories/{mongo,drizzle}/{ClubMatch,PlayerMatch}Repository.ts`,
`repositories/{ClubMatch,PlayerMatch}RepositoryFactory.ts`,
`controllers/club-match/club-match.service.ts`,
`controllers/player-match/player-match.service.ts`,
`controllers/game/functions.ts`.

---

### Award - twelfth Phase B entity, polymorphic Recipient

**Status:** Done. Twelfth entity in the "make `USE_DRIZZLE=true` mean zero
live Mongo connections" plan, after Club, Competition, Manager, Player,
Season, Fixture, Calendar, Day, User, ClubMatch, PlayerMatch. Two real call
sites: `GET /awards/season/:season_id` (`awards/index.ts`'s `fetchAll`) and
`giveAwards` (`awards.controller.ts`, called from `POST /seasons/:id/finish`
and `GET /seasons/:id/awards`) - every other function in `awards/index.ts`
(`fetchOneById`, `fetchOne`, the dead `createNew`) has zero callers, left
alone.

**`Recipient` is polymorphic** - a Player or Manager id depending on
`Type`, which is exactly why `schema.ts`'s `awards.Recipient` column has no
`.references()` at all (Postgres can't FK one column against two tables).
Mongo's old `fetchAll` handled this with a runtime-computed
`populate({path: 'Recipient', model: capitalize(recipient)})` - passing a
model *name* as a string, resolved at populate time. There's no Postgres
equivalent, and doesn't need one: `recipient` only ever means `'player'` or
`'manager'`, so the new `fetchAll` (in `awards/index.ts`) picks
`getPlayerById`/`getManagerById` with a two-way check and batch-resolves
`Recipient` (and, at higher `populate` levels, `Club`/`Season`) via a small
shared `attachField()` helper - one query per distinct id referenced across
the fetched Awards, not one Mongoose-style populate call. A season only
ever has a handful of Awards (the six per-stat ones plus the winning-manager
one from `giveAwards`), so this stays simple rather than adding an
`ids`-batch filter to four different repositories for one small, low-
cardinality read.

**`giveAwards`'s winning-manager lookup** (`fetchOne({isEmployed: true,
Club: new Types.ObjectId(seasonChampions)})`, raw `manager.service.ts`)
moved onto `getManagers({isEmployed: true, Club: seasonChampions})[0]` -
added `Club` to `IManagerFilter`/`DrizzleManagerRepository.findAll` for
this (Mongo's `findAll` already passed any filter straight through to
`.find()`, so it only needed the Drizzle side and the interface).

`IAwardRepository` is `findAll`/`createMany` only - no `findById`/`update`/
`delete`, since nothing calls them.

Verified live on both backends: `getManagers({isEmployed, Club})` finds the
right manager, `createAwards` persists a manager-type Award, and `fetchAll`
resolves identically at every `populate` level (`''`/`'recipient'`/
`'club'`/`'club-season'`) - `Recipient` gains `FirstName` at `'recipient'`
and above, `Club` gains `Name` at `'club'` and above, `Season` gains
`SeasonCode` only at `'club-season'`.

**Files:** `repositories/AwardRepository.ts`,
`repositories/{mongo,drizzle}/AwardRepository.ts`,
`repositories/AwardRepositoryFactory.ts`, `repositories/ManagerRepository.ts`,
`repositories/{mongo,drizzle}/ManagerRepository.ts` (added `Club` filter),
`controllers/awards/{index,awards.controller}.ts`.

---

### MatchReplay - thirteenth and final Phase B "new repo" entity

**Status:** Done. Thirteenth entity in the "make `USE_DRIZZLE=true` mean
zero live Mongo connections" plan, after Club, Competition, Manager,
Player, Season, Fixture, Calendar, Day, User, ClubMatch, PlayerMatch,
Award. The smallest of the "new repository" entities, exactly as the
original plan predicted - two call sites, `saveReplay`/`fetchReplay`
(`match-replay.service.ts`), both used only by `game.controller.ts` to
persist/rewatch a finished match's per-tick frames.

**The one real design choice: how to port the upsert.** `saveReplay` was a
Mongo `findOneAndUpdate({Fixture: fixtureId}, data, {upsert: true, new:
true})` - a fixture can in principle be replayed more than once in
dev/testing flows, and the latest simulation should win, so this needs to
stay an upsert, not a plain create. `schema.ts`'s `matchReplays.Fixture`
is already `.unique()` (mirroring Mongo's own `unique: true`), so Postgres
can express the same thing natively: `DrizzleMatchReplayRepository.upsertByFixtureId`
uses a real `.insert(...).onConflictDoUpdate({target: matchReplays.Fixture, set: ...})` -
first use of `onConflictDoUpdate` in this migration, but the standard
drizzle-orm pattern for exactly this shape.

`IMatchReplayRepository` is deliberately just `findByFixtureId`/
`upsertByFixtureId` - matches the two functions `match-replay.service.ts`
ever exposed.

Verified live on both backends: saved a replay for a test fixture, fetched
it back with the nested `Home`/`Away` jsonb intact, then saved again with
different `Frames`/`TickMs` and confirmed the *same* row updated (not a
duplicate) on both Mongo and Postgres.

**Files:** `repositories/MatchReplayRepository.ts`,
`repositories/{mongo,drizzle}/MatchReplayRepository.ts`,
`repositories/MatchReplayRepositoryFactory.ts`,
`controllers/match-replays/match-replay.service.ts`.

---

### Place cleanup - fourteenth item, closes out Phase B

**Status:** Done. Last item in the "make `USE_DRIZZLE=true` mean zero live
Mongo connections" plan's Phase B, after Club, Competition, Manager,
Player, Season, Fixture, Calendar, Day, User, ClubMatch, PlayerMatch,
Award, MatchReplay. Place was flagged as "the one 'fully converted' entity
isn't actually 100% wired yet" back when Club was converted - this pass
went and checked exactly what was still leftover.

**Turned out to be nothing left to convert, only dead code to remove.**
`places.controller.ts` - the pre-repository raw `fetchAll`/`fetchOneById`/
`fetchOne`/`allCountries` functions - had **zero callers anywhere**:
`places.router.ts` was already fully repository-backed (every route calls
`places.service.ts`'s `getAllPlaces`/`getPlace`/`getPlaceByNameOrCode`/
`updatePlace`), confirmed by grep for both the file's own function names
and any import of the file at all. Deleted the file outright rather than
leave confusing dead weight suggesting an unconverted raw path that
doesn't actually exist.

The other flagged spot, `helpers/misc.ts`'s `DB.Models.Place.find({Type:
"country"})`, turned out to already be inert: it's inside
`updateAllModels`, a function wrapped entirely in a `/** ... DO NOT TOUCH
:) ... */` comment block (not live code at all, not even reachable if
uncommented without also fixing the export). Left exactly as-is, per its
own explicit instruction.

Also confirms `DB.Models.Place` under `backend=drizzle` was already fully
Mongo-independent before this pass even started - `db/drizzle/index.ts`'s
`_models.Place` resolves straight to `new DrizzlePlaceRepository(...)`,
not the shared `mongo.X` fallback slot every other entity still uses (the
one entity that got this treatment from the very first conversion pass).

Verified live on both backends: `getAllPlaces({Type: 'country'})`,
`getPlace(id)`, and `getPlaceByNameOrCode(name)` all round-trip correctly
after the file deletion (they never touched it, so this is really
confirming nothing broke, not new behavior).

**With this, Phase B is complete** - every entity in the plan's suggested
order (Club → Competition → Manager → Player → Season → Fixture →
Calendar → Day → User → ClubMatch/PlayerMatch → Award → MatchReplay →
Place cleanup) has been converted. Phase C (remove
`DrizzleDatabase.mongoFallback` and every `mongo.X` line in
`db/drizzle/index.ts`'s `_models`) is next - see the plan file for what
that involves and the full-cutover verification (Phase D) after it.

**Files:** `controllers/places/places.controller.ts` (deleted).

---

### Follow-up: calendar-setup flow was broken end-to-end under `backend=drizzle`

**Status:** Done. Found via live UI testing (`POST /api/calendar/:year/:id/setup-and-start`,
the "set up a season/calendar" button) immediately after Phase B was
declared complete - a reminder that "every entity's own routes work" isn't
the same as "every internal call chain between entities works," especially
for game-loop orchestration code (`calendar.controller.ts`,
`middleware/seasons.ts`) that calls *other* entities' service functions
internally, not just its own. Six distinct bugs, all in the same call
chain, found and fixed one crash at a time:

1. **`createSeasonsInTheYear` used Competition's raw, unconverted `fetchAll()`**
   (`competition.service.ts` - genuinely still needed for `GET
   /competitions/all`'s arbitrary client query, but this internal
   no-args call didn't need arbitrary anything). Under `backend=drizzle`
   this silently read from the Mongo fallback, handing back real Mongo
   ObjectIds - one of which then got passed straight into a Postgres
   `uuid` column insert (`Seasons.Competition`), throwing `invalid input
   syntax for type uuid`. This was the original reported crash. Fixed:
   swapped to the already-repository-backed `getCompetitions()`.
2. **`middleware/seasons.ts`'s `generateFixtures2`/`fetchCompetitionClubs`
   used Competition's raw `fetchCompetition()`** (`.populate('Clubs', ...)`
   - `Competition.Clubs` doesn't exist on Postgres at all). Fixed: swapped
   to `getCompetitionWithClubsAndSeasons()` (already built for exactly
   this reverse-lookup case, just never wired in here).
3. **`middleware/seasons.ts`'s `addSeasonToComp` unconditionally called
   Competition's raw `addSeason()`** (`$push: {Seasons: seasonId}`) -
   `competition.controller.ts`'s own `addSeasonToCompetition` had already
   been made a no-op under `backend=drizzle` for the exact same operation
   (`Seasons.Competition`, set at season-creation time, already carries
   this), but this *other* code path calling the same raw function
   directly was missed. Fixed with the identical `DB.ormType ===
   'drizzle'` no-op branch.
4. **`fixture.service.ts`'s `createFixtures()` (bulk fixture-generation
   insert) was still raw** `DB.Models.Fixture.insertMany(...)` - flagged
   in Fixture's own Phase B entry as "left raw, already FK-correct at
   creation time," which turned out to describe the *data*, not the
   *write path*: the data being FK-correct doesn't help if the insert
   itself goes to Mongo instead of Postgres. Added `createMany` to
   `IFixtureRepository`/both implementations, wired `fixture.service.ts`'s
   `createFixtures` through it.
5. **Three internal calendar.controller.ts call sites used Season's raw
   `fetchAll()`** (`setupDaysInYear`, `setupDaysInYear2`, `endYear`) with
   simple `{Year}`/`{Calendar}` equality filters that `getSeasons()`
   already supports natively - no reason these needed the raw path at
   all. `setupDaysInYear2`'s case needed a Mongo `$in` (seasons for a
   *set* of competition ids) - `ISeasonFilter` doesn't support array
   membership, so this became one `getSeasons()` call per competition
   (there's only ever a handful) instead. `competition.router.ts`'s `GET
   /:id/seasons/all` had the exact same simple-filter case and got the
   same fix.
6. **`startYear`'s `fetchSeasons` used Season's raw `findAndUpdate()`**
   for a plain-field bulk update (`{isStarted: true, StartDate, Status}`
   for every pending season in a year - no operators). Converted to
   fetch-then-update-each (`getSeasons({Year})` filtered in JS for
   pending/not-started/not-finished, then `updateSeasonFields` per match) -
   same small-cardinality reasoning as everywhere else in this migration.
   This was `season.service.ts`'s `findAndUpdate`'s only caller, but it's
   *not* dead: `game/functions.ts`'s finish-season flow still needs the
   genuinely-arbitrary-operator version.

**Two more bugs surfaced only once the above were fixed and the flow could
actually run further:**

7. **Postgres's `Seasons` table has `NOT NULL` on `StartDate`/`EndDate`;
   Mongo's schema never required them.** Season creation
   (`middleware/seasons.ts`'s internal `create()` and the exported
   `createSeason` middleware) never set either field at creation time -
   correct on Mongo (both stay `null` until the season actually starts/
   ends), fatal on Postgres. This exact wrinkle was already called out as
   a "remember this for test data" note in Season's original Phase B
   entry, but it turned out to affect real application code, not just
   test fixtures. Fixed by defaulting both to `new Date()` at creation -
   harmless placeholders, since `PATCH /:id/start` and the finish-season
   flow both overwrite them with the real value later anyway.
8. **`getSeasons()` (list) doesn't populate `Fixtures` the way
   `getSeasonById()` (single) always does** - deliberate, for list-view
   performance, but `setupDaysInYear`/`setupDaysInYear2` read `.Fixtures`
   off every season in the list they fetch. On Mongo this went unnoticed
   because `Season.Fixtures` is a real stored array of ids even without
   `.populate()` (`s.Fixtures.length` still worked, if not `s.Fixtures[i]`
   as a real object elsewhere in the same function - this code path may
   never have fully worked even on Mongo, given the "TODO URGENT APRIL 26
   2022" comments still in it) - Postgres has no such column at all, so
   `s.Fixtures` was `undefined`, not even an empty array. Added a small
   `hydrateSeasonFixtures()` helper in `calendar.controller.ts` that maps
   each season stub through `getSeasonById()` to get the fully-populated
   version, used by both `setupDaysInYear` and `setupDaysInYear2`.

**Verified end-to-end** via a live HTTP request replicating the exact
failing request (`POST /calendar/XQY-2026/<real-calendar-id>/setup-and-start`
against a real Postgres-backed calendar with real competitions) - confirmed
full success: calendar activated (`isActive: true`), all 4 real
competitions got a started season each, and 365 Days were created with 44
correctly holding real, Fixture-populated matches. Test seasons/fixtures
created during verification were cleaned up afterward.

**Files:** `controllers/calendar/calendar.controller.ts`,
`controllers/competitions/{competition.router,competition.service}.ts`,
`controllers/fixtures/fixture.service.ts`,
`repositories/FixtureRepository.ts`,
`repositories/{mongo,drizzle}/FixtureRepository.ts`,
`middleware/seasons.ts`.

**Lesson for the remaining work (Phase C's audit, Phase D):** a fully
Postgres-independent entity doesn't guarantee every *internal* caller of
its service functions was updated to use the converted path - grep for
every remaining raw `DB.Models.X` reference across the whole codebase
(not just within each entity's own files) before declaring Phase C's
"no code calls `DB.Models.X` raw" precondition actually met.

---

### Follow-up: closed the two gaps the Club conversion surfaced

**Status:** Done. Directly closes the two "found, not fixed" items from the
Club conversion entry below - both were asked for by name after that pass's
summary.

**1. `DELETE /managers/:id` is fully repository-backed now.**
`IManagerRepository` gained a `delete(id)` method (Mongo:
`findByIdAndDelete` + not-found check, matching the old raw
`deleteByRemove`'s behavior; Drizzle: `db.delete(managers).where(...)`),
and `manager.service.ts` exposes it as `deleteManagerById` - `deleteByRemove`
(the old raw Mongo-fallback-only version) is gone, along with the
Mongoose-Document-internals leak (`$__`/`_doc`) its `.remove()` used to put
in the response. Also fixed a real bug found while wiring this up:
`manager.router.ts`'s DELETE handler never `return`ed the
`appendClubRecord(...)` call from its `_updateClub` step, so the Club-side
write raced with (and could fail silently before) the actual delete - now
returned, so the chain waits on it and a failure there stops the delete.
Verified end-to-end under `backend=drizzle` against a manager that only
exists in Postgres (previously: club got unset, then the delete itself
threw a Mongo `CastError` since a Postgres UUID isn't a valid ObjectId,
leaving the manager orphaned in Postgres) - now both steps complete and the
manager is genuinely gone from Postgres.

**2. User's club-ownership routes now use the `Clubs.User` reverse FK.**
The product decision flagged in the Club entry below (keep `Users.Clubs` as
a Mongo-only relic forever, or standardize on the reverse FK) was made:
standardize on `Clubs.User`, since that's already the only thing Postgres
has and it's the same field `POST /users/join`'s club-linking step already
used. `POST /:id/add-clubs`, `POST /:id/add-club`, and
`DELETE /:id/clubs/:club_id` (`user.router.ts`) now call
`club.service.ts`'s `updateClubFields` directly instead of mutating a
`Users.Clubs` array - `add-clubs`/`add-club` set the target club(s)'
`User` field to this user's id, the delete route clears it. Response
shapes changed accordingly (they return the affected club(s), not a User
document - confirmed nothing in the client reads those response bodies
beyond `.success`, see `apps/fs-pro-client/src/views/user/settings.vue`).
`GET /users/:id?populate=true` now derives `Clubs` via
`getClubs({ User: id })` (a live reverse lookup) instead of populating a
stored array - confirmed unused by the client today, so this was a free
change; **note it surfaced a real, pre-existing data drift** in the dev
Mongo DB, where a user's stored `Users.Clubs` array (10 entries) and the
clubs whose `Clubs.User` actually points back at them (22) had already
diverged before this change - expected once ownership has two redundant,
independently-written fields, not something this fix caused. Verified
add/remove/bulk-add and the populate-derived list all correctly reflect
`Clubs.User` on both Mongo and Postgres.

Registration itself (`POST /users/join`'s user-creation step) is still
fully raw Mongo, unchanged - out of scope for this follow-up, same reason
as before (Postgres has no equivalent user-creation path here yet).

**Follow-up to the follow-up:** the drift wasn't just old data - it was
about to become a live bug. `POST /users/login` (`initializeSessionForLogin`
in `middleware/user.ts`) returns its response's `Clubs` field straight from
whatever's stored on the User record, and that's what the client actually
keys off of (`login.vue` stores it as `user.value.clubs`, read by
`app-view.vue`'s nav and `settings.vue`'s club list). Since add/remove now
write only to `Clubs.User`, `Users.Clubs` would've silently stopped being
kept in sync the moment a user added or removed a club, and login would
keep serving the stale list forever after. Fixed by having
`initializeSessionForLogin` overwrite `Clubs` with a live
`getClubs({ User: id })` lookup (mapped back down to an id array, since
that's the shape `settings.vue`'s own `$in` query still expects) before
responding - same fix shape as `GET /:id?populate=true` above. Verified on
both backends: added/removed a club, logged in again each time, confirmed
the returned list updated correctly rather than staying frozen at whatever
it was when this fix landed.

**Found, not fixed - a third instance of the same delete-goes-to-the-wrong-
backend shape, surfaced while testing #2:** `DELETE /clubs/:id`
(`club.service.ts`'s `deleteByRemove`) is still raw
`DB.Models.Club.findById(id).remove()`, which resolves to the Mongo
*fallback* even under `backend=drizzle`. Created a throwaway club through
the now-repository-backed `POST /clubs/new` while testing, then couldn't
delete it through the API at all (`DELETE /clubs/:id` silently no-op'd -
`success: false` with no matching document) - had to delete it directly
via Drizzle. Same fix shape as #1 above would close it: add `delete()` to
`IClubRepository`, wire it into `club.router.ts`. Not done here - wasn't
one of the two gaps asked for, but flagging it now since it's the same
"create is repository-backed, delete still isn't" pattern and will bite
again the next time a Postgres-native Club needs deleting through the API.

**Files:** `repositories/ManagerRepository.ts` (added `delete`),
`repositories/{mongo,drizzle}/ManagerRepository.ts` (implemented it),
`controllers/managers/{manager.service,manager.router}.ts` (`deleteByRemove`
→ `deleteManagerById`, fixed the missing `return`),
`controllers/user/user.router.ts` (`add-clubs`/`add-club`/`clubs/:club_id`/
`GET /:id?populate=true` rewired to `club.service.ts`'s `getClubs`/
`updateClubFields`).

---

### Club conversion is partial - built specifically to unblock User/Manager

**Status:** Done, deliberately partial - fourth entity converted after Place,
User, and Manager. Directly follows up on both of those: several routes left
"Club-coupled, unconverted" in the User and Manager passes turned out to be
blocked on Club having no repository at all, not on anything Club-specific -
this pass builds that repository and then goes back and finishes as much of
that deferred work as is actually safe to finish.

**Context:** `club.model.ts` has the same always-populate hook shape as
Manager's Nationality: `pre('find')`/`pre('findOne')` unconditionally
populate `Address.Country` (a full `Place`, not a bare id) on every read.
Both repositories replicate it the same way Manager's does (Drizzle's
`addressCountry` relation from `relations.ts` + a remap merging it back into
the nested `Address` object, since Postgres stores `Address` as a
Section/City-only jsonb blob with `Country` split out into its own FK
column). `create`/`update` do **not** auto-populate, matching Mongoose.

Club is a much messier surface than Place/User/Manager, though: most of its
raw functions build Mongo `$set`/`$push`/`$unset`/`$addToSet` operator
objects (Records-array history log entries, `Players` array mutations), and
`IClubRepository.update()` deliberately only accepts plain fields - no
operator support. So the *converted* surface is narrower than "everything
that reads/writes a single Club by id": `findById` (no populate)/`findAll`
(filter by `User` or `League`)/`create`/`update` (plain fields), plus a new
`appendClubRecord(id, fields, record)` helper in `club.service.ts` that
read-modify-writes the Records array instead of `$push`-ing to it - this is
what let the operator-based call sites actually convert, not just the ones
that were already plain-field updates.

Converted: `GET /clubs/:id` (no populate), `POST /clubs/new`,
`POST /clubs/:id/update` (plain fields only now - documented behavior
change, no operator support), and the full manager hire/fire flow
(`PUT /clubs/:id/manager`, `DELETE /clubs/:id/manager` in
`club.controller.ts`) via `appendClubRecord`/a new `appendManagerRecord`
(same read-modify-write pattern, added to `manager.service.ts`). Verified
hiring and firing a manager end-to-end against both backends: both sides
(`Club.Manager`/`Manager.Club`/`Manager.isEmployed`) update correctly and
Records entries append correctly on both Mongo and Postgres.

This also let two things deferred in the Manager pass actually get finished:
`GET /managers?populate=Club`, `GET /managers/unemployed`, and
`GET /managers/:id?populate=true` now go through `ManagerRepository`
(extended with an `IManagerReadOptions.withClub` flag - Mongo does
`.populate('Club', 'Name ClubCode LeagueCode')`, Drizzle uses the existing
`club` relation + a remap narrowed to the same three fields) instead of raw
Mongo. And `DELETE /managers/:id`'s Club-side write (clearing
`Club.Manager` when the manager being deleted has one) now goes through
`appendClubRecord` instead of a raw `$unset`.

**Left on the raw Mongo path, unchanged, and why:**
- `GET /clubs/all`, `GET /clubs/fetch`, add/remove-player
  (`middleware/club.ts`), the CSV bulk import (`createManyClubsFromCSV`) -
  these need either Player data (Player isn't converted - `Club.Players` was
  dropped from the Postgres schema as the inverse of `players.Club`) or
  Mongo `$push`/`$pull`/`$addToSet` semantics on that same dropped field.
  Real scope cut, not an oversight.
- `DELETE /clubs/:id` (`.remove()`) - no repository `delete()` exists yet,
  same as User/Manager; nothing currently reacts to a Club being removed
  anyway (the cascade that would unset Manager/User/Player refs is
  commented out in `club.model.ts`).
- User's `/add-club(s)`, `DELETE /:id/clubs/:club_id`, and
  `GET /users/:id?populate=true` - at the time of this pass, still blocked
  on the `Users.Clubs`-array-vs-`Clubs.User`-reverse-FK asymmetry described
  below. **Since resolved** - see the follow-up entry above, which
  standardized on `Clubs.User` and converted all three.

**Found, not fixed at the time - since resolved, see the follow-up entry
above:** `DELETE /managers/:id` was a two-step, non-atomic write (unset the
club's Manager, then delete the manager), and only the first step was
repository-backed. Tested directly under `backend=drizzle` against a
manager that only exists in Postgres: the Club-side unset succeeded, but
the final delete (`deleteByRemove` in `manager.service.ts`) was still raw
`DB.Models.Manager.findById(id).remove()`, which - while `backend=drizzle` -
resolved to the Mongo *fallback* connection, not Postgres, so it threw a
cast error on a Postgres UUID and left the manager orphaned. Fixed by
adding `delete()` to `IManagerRepository`.

**Files:** `repositories/ClubRepository.ts`,
`repositories/{mongo,drizzle}/ClubRepository.ts`,
`repositories/ClubRepositoryFactory.ts`,
`controllers/clubs/{club.service,club.router,club.controller}.ts`,
`repositories/ManagerRepository.ts` (added `IManagerReadOptions`),
`repositories/{mongo,drizzle}/ManagerRepository.ts` (added `withClub`
support), `controllers/managers/{manager.service,manager.router}.ts`
(added `appendManagerRecord`, wired the three `populate=Club` routes and
DELETE's Club-side write through the repository).

---

### Manager conversion is partial - same Club-coupling split as User

**Status:** Done, deliberately partial - third entity converted after Place
and User. **Update:** the Club conversion above finished off most of what
this entry originally left deferred - `populate=Club`/`/unemployed`/
`populate=true` are converted now, and DELETE's Club-side write is too. See
that entry for the current state; this one is kept for the
Nationality-hook context, which didn't change.

**Context:** Much lighter coupling than User's, but the same shape.
`manager.model.ts`'s schema registers `pre('find')`/`pre('findOne')` hooks
that unconditionally populate `Nationality` on every read - both
repositories have to match that (the Drizzle one uses the `nationality`
relation from `relations.ts` plus a remap, since Drizzle's relational query
API returns a differently-shaped nested object than Mongoose's populate).
`create`/`update` do **not** auto-populate (Mongoose's hook only fires for
find-style queries), so those stay as plain FK values on both sides -
verified this distinction holds correctly on both backends.

Converted: `GET /managers` (no `populate=Club`), `GET /managers/:id` (no
`populate=true`), `POST /managers` (create), `PUT /managers/:id` (update),
and - importantly - `resolveManagerTactic()`, used on every match kickoff
(`App.setupGame`, `jobs/matchQueue.ts`) to resolve a club's tactic from its
manager's `PreferredFormation`/`PreferredStyle`. Verified directly (not
just via HTTP) against both backends since it's on that critical path.

Left on the raw Mongo path at the time: `GET /managers/unemployed`,
`GET /managers?populate=Club`, `GET /managers/:id?populate=true`, and
`DELETE /managers/:id`'s Club-side write - all since converted, see the
Club entry above.

**Also found, not fixed (pre-existing, unrelated to this pass):**
`getCurrentCounter` (`utils/counter.ts`), used by `POST /managers` (and
`POST /competitions/new`, etc.) to generate a sequential id, crashes the
*entire process* - not just the request - if `req.query.model` is missing
or the counter document isn't found (`counter` ends up `null`, then
`counter!.sequence_value` throws past the `!err` check, uncaught). Hit this
directly while testing: an unrelated `POST /managers` call without
`?model=manager` took the whole dev server down. Also found the `manager`
counter's `sequence_value` in this dev DB is out of sync with actual
existing `Key`s (a fresh create immediately hit a duplicate-key error) -
a data issue, not a code one.

**Files:** `repositories/ManagerRepository.ts`,
`repositories/{mongo,drizzle}/ManagerRepository.ts`,
`repositories/ManagerRepositoryFactory.ts`,
`controllers/managers/{manager.service,manager.router}.ts`.

---

### User conversion is partial - Club-coupled routes stay on Mongo

**Status:** Done, deliberately partial. `Place` is the only entity fully
converted; `User` is the second, but only its identity-only surface.

**Context:** `Users.Clubs` was already dropped from the Postgres schema
(it's the inverse of `clubs.User`) during the relational-fix pass, which is
correct - but it means a Postgres-backed User has no working equivalent for
`.populate('Clubs')`, `/add-club(s)`, or `/clubs/:club_id`: there's no array
left on that backend to populate/push/pull. This turned out to be a real,
permanent data-model asymmetry, not a "Club isn't converted yet" problem -
see the Club entry above, written after Club got its own repository.
Registration (`POST /users/join`) creates the user then writes its id into
`Club.User` via `updateClubs` (`club.controller.ts`) - that part **is** a
pure Club-side write with no `Users.Clubs` involvement, so it's since been
converted to go through `ClubRepository` (safe on both backends: on
Mongo it's the same field Mongo always had, on Postgres it's the one true
ownership pointer). User creation itself, and `/add-club(s)`/
`/clubs/:club_id`/`GET /:id?populate=true`, still stay fully on the raw
Mongo path - the array-vs-reverse-FK gap needs an actual product decision,
not a mechanical conversion. Meanwhile login, `GET /:id` (populate=false),
`/change-password`, `/:id/update`, `/logout`, and `/enter` go through the
new `IUserRepository` (Mongo + Drizzle implementations,
`repositories/{mongo,drizzle}/UserRepository.ts`).

`comparePassword` and `findSession` were `UserSchema.methods` - only
callable on a live, non-`.lean()`d Mongoose Document - so they were pulled
out into plain functions in `utils/auth.ts` (`hashPassword`,
`comparePassword`, `resolveUserSession`) usable regardless of backend.

**Known consequence, not a bug (superseded - see "User Phase B follow-up -
registration" above):** a user who registers via `POST /join` while
`backend` is `drizzle` only exists in Mongo - `POST /login` (which checks
Postgres) won't find them until `Club` is converted and registration can
move too. Not an issue for already-migrated users (`migrate-users.ts`
already copied everyone into Postgres); only matters for brand-new signups
tested while the backend override is set to `drizzle`. **Resolved**:
registration is repository-backed now that Club is fully converted, so a
`POST /join` under `backend=drizzle` creates the user in Postgres directly.

**If revisited:** ~~Converting registration requires `Club` to be converted
first~~ - done, see the "User Phase B follow-up" entry above.

**Also found, not fixed (pre-existing, unrelated to this pass):**
- `GET /users/:id` returns the entire lean User document over the API,
  including the bcrypt password hash. Predates this migration; preserved
  as-is rather than silently changing response shape.
- `POST /users/:id/add-club` (and the sibling `/add-clubs`) used to leak
  raw Mongoose Document internals (`$__`, `_doc`) in their response - the
  same missing-`.lean()` class of bug fixed in `MongoPlaceRepository`
  earlier. Since resolved as a side effect of a later pass: both routes now
  go through `updateClubFields` (repository-backed, always a plain object)
  instead of the User-side `updateUser`, which no longer exists.

**Files:** `repositories/UserRepository.ts`,
`repositories/{mongo,drizzle}/UserRepository.ts`,
`repositories/UserRepositoryFactory.ts`, `utils/auth.ts`,
`controllers/user/{user.service,user.router}.ts`, `middleware/user.ts`.

---

## Calendar / season lifecycle

### Global, perpetual calendar (remove the Year-bootstrap ritual)

**Status:** Idea only, agreed direction - not started.

**Context:** Raised after hitting friction manually setting up a season for
testing. The current system ties "the current point in time" to a real
Calendar document scoped to a real-world year string
(`YearString`/`YearDigits`, e.g. `"AUG-2026"`, derived from `new Date()` at
creation time in `calendar.controller.ts:createCalendarYear`), PLUS a
separate `process.env.CURRENT_YEAR` env var that has to be kept in sync by
hand - `middleware/seasons.ts:create`'s season-creation path looks up "the"
calendar via `fetchOne({ YearString: year })` where `year` comes from that
env var, with nothing enforcing it matches any real Calendar row. This is
the same failure shape as the migration-tracking bug from this session
(state duplicated between the DB and something else that can silently
drift) applied to game state instead of infra state.

Getting a playable season today requires, in order: `POST` create a
Calendar (derives YearString from the real-world clock) -> create a Season
per Competition for that exact string
(`calendar.controller.ts:createSeasonsInTheYear`) -> generate ~365 Day
documents with hand-tuned rest-day heuristics
(`calendar.controller.ts:setupDaysInYear` or `setupDaysInYear2` - see
below) -> explicitly "start" the year (`startYear`, which also flips
`isActive` across all Calendars via an aggregation update). Four manual
steps, tied to wall-clock date strings, to get one playable season.

**Also found, same area:** two full, mutually-inconsistent implementations
of day/fixture-schedule generation exist side by side -
`setupDaysInYear` (simple modulo rest-day heuristic: every 3rd/4th day is
free, plus a hardcoded 20 trailing free days) and `setupDaysInYear2` (a
recursive `arrange()` scheduler with hardcoded batch sizes of 3 or 5
matches and a "skip every other day" rule). Both are live entry points,
neither is clearly canonical - dead-code cleanup needed regardless of the
bigger redesign.

**If revisited:** Replace the per-year Calendar entity with a single,
never-recreated Calendar row whose `CurrentDay` just increments forever
from world creation - no `YearString`/`YearDigits`/real-world-date
derivation at all. "Year" becomes a display-only value computed from the
day count (`Math.floor(CurrentDay / daysPerYear)`), not something with its
own creation ritual. "The current calendar" should be found the same way
`calendar.controller.ts:getCurrentCalendar` already does it -
`{ isActive: true }` - with `middleware/seasons.ts:create`'s
`process.env.CURRENT_YEAR` lookup rewired to match instead of relying on a
manually-synced env var. When a season/competition-cycle finishes, the next
one's fixtures should schedule automatically starting from
`CurrentDay + N`, instead of requiring the full manual bootstrap ritual to
run again. Collapse `setupDaysInYear`/`setupDaysInYear2` into one scheduler
built on the already-correct `RoundRobin`/`generateFixtureObject` in
`utils/seasons.ts`.

**Files:** `controllers/calendar/{calendar.controller,calendar.service,
calendar.model}.ts`, `middleware/seasons.ts` (`create`, `createSeason`),
`controllers/days/day.model.ts`, whatever admin client view currently
triggers "create a year" (not yet located - check
`apps/fs-pro-client/src/views/admin/`).

---

## Match engine

### Effective attributes layer

**Status:** Not started — no consumer yet.

**Why deferred:** Every duel/decision formula in `Decider.ts` and
`Actions.ts` currently reads a player's stats straight off the base object
(`player.Attributes.Mental`, `tackler.Attributes.Aggression`, etc.) — these
are permanent values set once at player generation. There's currently
nothing that needs to *temporarily* change a stat mid-match, so building the
indirection now would be speculative infrastructure with zero real
consumers. Build it alongside the first feature that actually needs it
(most likely [morale system](#morale-system) or [injury system](#injury-system)
below).

**Problem it solves:** Once something *does* need to temporarily adjust a
stat, there are two bad options: mutating `Attributes` directly (fragile —
needs manual bookkeeping to undo, risks leaking into persisted data), or
updating every formula site individually for every new modifier type
(error-prone, unbounded diff every time a new incident type is added).

**Sketch:**
```ts
// FieldPlayer.ts
interface IAttributeModifier {
  attribute: keyof IPlayerAttributes;
  delta: number;
  source: string; // e.g. 'morale:media-backlash', 'injury:knock'
}

class FieldPlayer {
  private activeModifiers: IAttributeModifier[] = [];

  public get EffectiveAttributes(): IPlayerAttributes {
    const effective = { ...this.Attributes };
    for (const mod of this.activeModifiers) {
      effective[mod.attribute] = clamp(effective[mod.attribute] + mod.delta, 0, 100);
    }
    return effective;
  }

  public addModifier(mod: IAttributeModifier) { this.activeModifiers.push(mod); }
  public removeModifiersFrom(source: string) {
    this.activeModifiers = this.activeModifiers.filter((m) => m.source !== source);
  }
}
```
`Decider.ts`/`Actions.ts` get switched from `player.Attributes.X` to
`player.EffectiveAttributes.X` once, mechanically. After that, any new
modifier type is just "register a modifier" — no further engine changes.

**Files:** `classes/FieldPlayer.ts`, `interfaces/Player.ts`, every read site
in `state/ImmutableState/Actions/Decider.ts` and `Actions.ts`.

---

### Morale system

**Status:** Idea only.

**Why:** Named by the user as the first concrete example of a "match
dynamic" incident, alongside cards (built) and injury (below). E.g.
negative media coverage → lower morale → worse decision-making/composure.

**Sketch:** A morale value per player (or per team) that feeds into
`Decider.ts`'s `confidenceThreshold()` and similar formulas via
[effective attributes](#effective-attributes-layer) — e.g. low morale lowers
effective `Mental`/`Composure`, raising the chance of a misplaced pass or
missed shot under pressure. Needs a source for morale changes (results
history, media events, card/injury reactions) — not designed yet.

**Depends on:** [Effective attributes layer](#effective-attributes-layer).

---

### Injury system

**Status:** Idea only.

**Why:** Second named example of a match-dynamic incident — e.g. a knock
could raise `Aggression` ("more fight") while lowering `Speed`/`Stamina`.

**Sketch:** Similar shape to cards (`PlayerMatchStatus` already supports
adding a new value like `'injured'` without redesign — see
`interfaces/Player.ts`). An injury event would either force a substitution
(if subs exist yet — they don't) or apply an
[effective-attribute](#effective-attributes-layer) modifier for the rest of
the match. Needs a decision on whether injuries can end a player's match
entirely, which implies substitutions need to exist first.

**Depends on:** [Effective attributes layer](#effective-attributes-layer),
and probably a substitution system (not designed).

---

### Residual intermittent dual-ball-holder anomaly

**Status:** Confirmed as a genuine occupancy collision; specific cause
still not found. Instrumented and safe to leave for now (self-corrects
within a few ticks in every case observed since the freeze-causing bugs
below were fixed).

**Context:** While fixing the 99%-possession/0-pass bug (see git history —
`FieldPlayer.move()` no longer calls `checkWithBall()` on every ordinary
move, and `Actions.tackle()` no longer stomps a foul's correct ball
placement with a stale post-foul ball-move), a rarer anomaly turned up via
a defensive warning added to `Game.setPlayingSides()`: occasionally two
players — sometimes on opposing teams, sometimes on the *same* team —
simultaneously satisfy `WithBall`. Frequency is inconsistent run to run
(over a dozen distinct pairs in one 15-match batch, zero in the next 85
matches, then a dozen more in the next 15). Confirmed (once the warning's
own crash - see below - was fixed and it could log positions) that in every
observed case **both players report the exact same x/y block** - this is a
real occupancy-invariant violation somewhere in the movement code, not a
`WithBall`-specific logic bug. The specific call site that lets two players
land on the same block has not been found - `Actions.ts`'s
`findFarthestFreeBlock`-based escape jumps and `Referee.ts`'s
`sendOff`/`handleMatchRestart` placements were audited and look
individually safe.

**Found and fixed along the way:** the warning itself originally crashed
the whole match (`JSON.stringify` on a live `Block`/`FieldPlayer` throws
"Converting circular structure to JSON" because `Block.occupant` points
back to a player whose `Ball.Position` cycles back to a `Block`) - fixed by
logging plain `x`/`y` numbers instead. If you add more detail to this
warning later, never `JSON.stringify` a live block/player/ball object
directly.

**If revisited:** The `console.warn('[possession] ...')` in
`Game.setPlayingSides()` already logs both players' exact block positions
(confirmed identical every time) and the ball's position whenever this
fires - run a large batch (`simRealismCheck.ts` with a high count) until it
reproduces, then work backward from which movement call most recently
placed one of the two reported players on that block.

**Files:** `controllers/Game.ts` (`setPlayingSides` — the diagnostic
warning), `state/ImmutableState/Actions/Actions.ts`, `classes/Referee.ts`,
`classes/MatchSide.ts` (`changePosition` call sites - candidates to check
first for same-team collisions specifically).

---

### Remaining realism-tuning gaps

**Status:** Deferred, not urgent — user said "I am satisfied with the
results for now." Numbers below are current as of the possession/movement
bug-fixing pass (`FieldPlayer.move()`, `Actions.tackle()`,
`Actions.successfulDribble()`, `Actions.move()`'s no-marking-opponent
fallback) - passes-per-team roughly doubled (12→22 avg) and goals per match
went up (2.1→3.5 avg) once play stopped freezing/getting silently
corrupted, so re-check this table again if more engine changes land.

**What's off:** Per `simRealismCheck.ts`, shots per team sit around 3.6 vs.
a real-world reference band of 7-18; tackles/interceptions/fouls/yellow
cards are somewhat under their reference bands too (plausibly a natural
side effect of fixing the inverted pass-success bug and the possession
freezes — passes/dribbles now succeed and progress correctly, so the ball
changes hands defensively less often than the reference bands assume).

**Diagnosis so far:** Believed structural, not a formula bug — i.e. how
often an attacker gets close enough to goal *with the ball* to justify a
shot, rather than the shoot-decision formula itself being wrong. Not
investigated further.

**Next step when revisited:** Instrument how often attacking players reach
the final third/box with possession per match, compare against the
shots-per-team gap, before touching `Decider.ts`'s shoot thresholds again.

**Files:** `scripts/simRealismCheck.ts` (the diagnostic), `Decider.ts`
(`tryShoot`, `SHOOT_PROFILES`).

---

### Real match data as a tuning baseline

**Status:** Deferred — deliberately chose the simpler path for now.

**Context:** User asked whether real-life match event logs (thousands of
matches) could be used as a baseline for tuning. Decided against sourcing/
building a real dataset for now; went with hand-picked reference ranges from
well-known aggregate stats instead (`REFERENCE_RANGES` in
`simRealismCheck.ts`).

**If revisited:** Would mean sourcing a real event-log dataset (e.g. a
public football event data provider), building an importer, and replacing
the fixed `REFERENCE_RANGES` bands with actual distributions — a
meaningfully bigger effort than the current script, and only worth it if
the hand-picked bands stop being precise enough to guide tuning.

**Files:** `scripts/simRealismCheck.ts`.

---

### Self-improving / ML-driven tuning

**Status:** Exploratory only, no design.

**Context:** User asked whether combining ML techniques with accumulated
match data could produce more realistic play over time, given the game is
web-based and could auto-update its algorithm. Discussed conversationally;
no implementation approach chosen.

**Open questions for later:** What's the training signal (real match stats
again, or player/user engagement)? Where would model inference live
relative to the synchronous, in-process `Game.gameLoop`? How would updated
parameters roll out without breaking `simRealismCheck.ts`'s reference
bands? None of this has been thought through yet — treat as a research
spike, not a scoped feature.

---

### Positional reshuffle after a red card

**Status:** Known simplification, accepted for now.

**Context:** Real teams compress their shape when down a player. Currently
a sent-off player's teammates don't reorganize — the gap is just left; the
departed player stays frozen at their last on-pitch position for the rest
of the match (their `MatchStatus` excludes them from selection via
`MatchSide.ActivePlayers`, but nothing actively closes the space).

**If revisited:** Would likely mean recomputing a temporary 10-man (or
fewer) formation shape on send-off, similar to how `MatchSide.changeTactic`
already reflows positions for a full formation change — reusing that
machinery rather than a bespoke one-off.

**Files:** `classes/Referee.ts` (`sendOff`), `classes/MatchSide.ts`.

---

### Sent-off goalkeeper edge case

**Status:** Known gap, unhandled — noted as rare.

**Context:** If a goalkeeper is sent off, no outfield player takes over in
goal. Not addressed as part of the cards work; left as an accepted edge
case since it's rare in practice.

**Files:** `classes/Referee.ts` (`sendOff`).

---

## Tactics system

### Mid-match tactic changes — interactive/human trigger

**Status:** Engine capability exists; interactive trigger does not.

**Context:** Early in the session the user asked how formation/position
could change mid-match given the match simulates all at once, then said
"let's shelve this for later." The *engine* side ended up built anyway as
part of the broader tactics work — `Game.changeTactic(side, tactic)`
mutates a live `MatchSide.Tactic` and emits a `-tactic-changed` event that
already flows into `Match.Events`/replay frames with no extra plumbing. What
was shelved specifically is a **human-facing control** for triggering it
live (e.g. a manager UI button while watching a match) — that needs a
real-time input channel into the running `Game` instance, which doesn't
exist (the queue/worker-thread model currently only accepts a match's
initial setup, not live commands into an in-flight worker).

**If revisited:** Needs a way to send a command into an already-running
`matchSimWorker` (worker_threads message passing, most likely), plus a
client control surface. Bigger than it looks because of the worker-thread
boundary.

**Files:** `controllers/Game.ts` (`changeTactic` — already done),
`jobs/matchQueue.ts`, `jobs/matchSimWorker.ts`.

---

### Uploadable/custom tactics

**Status:** Extensibility designed in; upload mechanism not built.

**Context:** User asked for an extensible tactics system where users might
eventually "upload tactics in a doc" — explicitly confirmed as
server/engine-only for now, no upload UI or parser to be built at the time.
`FORMATIONS`/`PLAYING_STYLES`/`ITactic`/`resolveTactic()` in
`state/PersistentState/Formations.ts` are shaped so a new formation or style
is just a new data entry, not a code change — but there's no importer,
validation, or file format defined for a user-supplied tactic yet.

**If revisited:** Needs a decision on tactic file format (JSON matching
`ITactic`'s shape is the natural default), a validation/sanitization layer
before anything user-supplied reaches `resolveTactic()`, and a place to
store per-manager custom tactics (currently `manager.model.ts` only stores
`PreferredFormation`/`PreferredStyle` as references into the built-in
tables).

**Files:** `state/PersistentState/Formations.ts`,
`controllers/managers/manager.model.ts`, `manager.service.ts`.

---

## Client / live-watch

### Wire live replay into the real client (matchzone.vue)

**Status:** Done. `matchzone.vue` now joins the `/match-replay` room before
kickoff via `utils/matchReplaySocket.ts` and renders live frames through
`components/matchzone/live-pitch.vue` (a plain-HTML/CSS port of
`PitchPreview.html`'s renderer), holding the final reveal until
`match-replay-end`. The pitch is now the permanent, always-visible
centerpiece of the view rather than something shown only during a live
watch. Kept for reference: `apps/fs-pro-client/src/views/game/PitchPreview.html`
(still the standalone debug tool), server side unchanged
(`realtime/io.ts`, `realtime/matchBroadcaster.ts`).

---

### Replay/rewatch a past match (including friendlies)

**Status:** Done. `Match.Frames` is now persisted as its own `MatchReplay`
Mongoose record (`controllers/match-replays/match-replay.model.ts`), keyed
by `Fixture` id, written by `saveReplay()` right after every match finishes
(both `play()`'s and legacy `restPlayGame`'s post-`startMatchReplay` step).
For friendlies this is gated behind the same `SaveStats` flag already used
for permanent stats - a friendly played with `SaveStats` off leaves nothing
behind, matching the original ask's intent.

A new `GET /api/game/replay/:fixture` endpoint (`restRewatchMatch`) reads
the stored record back and re-drives the exact same
`startMatchReplay(replayableMatch, fixtureId, tickMs)` call the live case
uses, over the same `/match-replay` Socket.IO room - so the client-side
`MatchReplaySocket`/`live-pitch.vue` pieces built for live-watching needed
no changes at all. `matchzone.vue` now shows a "WATCH REPLAY" button in
place of "START" once `matchFinished` is true, wired to a new
`watchReplay()` that joins the room, hits the replay endpoint, and streams
frames into the same `liveFrame` the live path already renders through.

**Not done / left as-is:** `jobs/matchQueue.ts`'s worker-thread pipeline
(used by `PitchPreview.html`'s enqueue flow) deliberately still does not
persist anything - it's a separate debug/testing path, out of scope here.
Matches played before this feature shipped have no `MatchReplay` record;
`watchReplay()` surfaces that as a plain `alert()` on a 404 rather than
hiding the button, since there's no cheap way to know in advance without
an extra round-trip.

**Files:** `controllers/match-replays/match-replay.{model,service}.ts` (new),
`db/{interfaces,mongodb,postgresql,drizzle/index}.ts` (registered
`MatchReplay` alongside the other models), `controllers/game/game.controller.ts`
(`saveReplay` calls + `restRewatchMatch`), `controllers/game/game.router.ts`
(`GET /replay/:fixture`), `views/game/matchzone.vue` (`watchReplay()` +
WATCH REPLAY button).

---

### Render match-dynamic state in the client

**Status:** Data available; not rendered.

**Context:** Frames already carry `matchStatus` per player (added as part
of the cards work) and tactic-change events already reach `Match.Events`,
but no client (including `PitchPreview.html`) visually distinguishes a
sent-off player or shows a tactic change happening live.

**Files:** `apps/fs-pro-client/src/views/game/PitchPreview.html`,
eventually `matchzone.vue`.

---

### Dugout/squad-browsing panel still on Vuetify

**Status:** Deliberately left as-is.

**Context:** When Matchzone's core match-viewing surface (pitch, score,
results, timeline, MOTM, game-lobby) was rewritten from Vuetify to plain
HTML/CSS for a lighter, more "live" feel, the Dugout side panel
(`components/matchzone/widgets/dugout.vue`, `dugout-club.vue`,
`squadlist.vue`, `squadlist-player.vue` - squad browsing, tabs, day-fixtures
list) was explicitly kept on Vuetify. It's a roster-browsing utility, not
part of the live-match feel that prompted the rewrite, and converting it
would have roughly doubled that pass's size. It still renders correctly
embedded in the new plain-HTML layout (Vuetify's theme context comes from
`app-view.vue`'s top-level `<v-app>`, which the rewrite didn't touch).

**If revisited:** Same treatment as the rest of Matchzone - replace
`v-tabs`/`v-window`/`v-list`/`v-avatar` with plain markup, keeping all
existing props/logic (squad sorting, match-selected navigation,
expand/collapse per club) unchanged.

**Files:** `apps/fs-pro-client/src/components/matchzone/widgets/dugout.vue`,
`dugout-club.vue`, `squadlist.vue`, `squadlist-player.vue`.

---

## Product direction

### Football "world builder" (Pax Historia-style) / shared World Service

**Status:** Parked — deliberately pivoting to finishing manager-mode and
building owner-mode first. Revisit once the core single-club game loop is
solid, not before.

**Context:** Inspired by Pax Historia (YC-launched platform where creators
publish custom maps/worlds and players act inside them via an interactive
map as the main navigation surface, not a database form). The idea for FS
Pro: a user creates a Country if it doesn't exist, creates Leagues inside
it, creates Clubs inside those leagues, then starts managing one - all via
click-to-drill-down navigation instead of admin dropdown forms. A further
idea layered on top: make the world/map system (countries, regions, cities,
borders, timeline, ownership) a separate shared **World Service** that
multiple future "games" (football, elections, politics, economy) could plug
into, each owning its own tables but referencing the same canonical
country/region/city ids. `Places` already has zero football-specific
fields, so this seam stays clean for free as long as nothing football-
specific leaks into it - no action needed to preserve this, just something
to keep in mind.

Two Explore passes (this session) confirmed the football data model is
mostly already there for the lighter, non-map first version:
- **Competitions (Leagues)** and **Clubs** already have full working create
  endpoints (`POST /competitions/new`, `POST /clubs/new`) and admin forms.
- **Places (Countries)** has a `createNew`/`createPlace` service function
  but **no router route** - `places.router.ts` only exposes GET/PUT. This
  was the one missing piece of backend CRUD.
- **Player generation** exists but is manual/decoupled:
  `GET /players/generate-players?...` (spawns a Python name-generator
  script + `generatePlayer()`) then a separate
  `PUT /clubs/:id/add-many-players` to attach them. Nothing chains these
  today, and `scripts/python_names.bat` hardcodes a stale path
  (`C:\emma\done\fs-pro-server\...`) that doesn't match this machine's
  actual repo location - **likely broken right now**, unverified.
- **Season/fixture generation** is a complete, working round-robin
  implementation (`middleware/seasons.ts`, `utils/seasons.ts:RoundRobin`).
- **Claiming a club** already has an endpoint (`POST /users/:id/add-club`),
  today only ever called from registration's club-picker.
- **No map/canvas/onboarding UI exists anywhere in the client** - would be
  a clean build.
- The user confirmed the first version should be card-grid navigation
  (Country page → League cards → Club cards, styled like `matchzone.vue`),
  explicitly **not** a literal map/canvas with positioned countries - that
  was the other option considered and rejected for v1 as over-scoped.

**If revisited:** A full plan was drafted and abandoned mid-review - the
concrete pieces (new `POST /places/new` route; new `views/user/atlas/*`
card-grid views; client-side chaining of existing endpoints for
create-club-with-generated-squad, claim-club, and start-first-season) are
still the right shape and can be re-derived quickly from this note. Verify
the Python name-generator path issue first, before building the auto-squad
flow on top of it.

**Files (if revisited):** `controllers/places/places.router.ts` (new POST
route), new `apps/fs-pro-client/src/views/user/atlas/{countries,country,
league}.vue` + router entry, `scripts/python_names.bat` (path fix, if
actually broken).

---

### Manager mode and owner mode

**Status:** This is the actual current direction - see conversation for the
in-progress discussion of what's missing from each.

**Context:** Rather than the world-builder idea above, the agreed next
phase is deepening the single-club game loop: first close the gaps in
*manager* mode (the role that already partially exists - squad viewing,
tactics, playing fixtures, standings), then add *owner* mode as a new layer
on top (finances, stadium, hiring/firing a manager, sponsorships,
reputation) that doesn't exist in any form today. Concretely still missing
from manager mode per this file's other entries: a real transfer market
(today there's only a `TransferHistory` log field and manual roster
add/remove - no buy/sell offers, no AI-driven transfer activity, no transfer
windows), contracts/wages, the Morale system and Injury system entries
above (both still "idea only"), an interactive trigger for mid-match tactic
changes (engine already supports it - see the Tactics system section),
training/player development, and any job-security/board-objectives
narrative layer. Owner mode is a bigger architectural step since it implies
a mode switch (an owner delegates match-day decisions to an appointed
manager - AI or another human - rather than making them directly).

**If revisited:** See the live conversation this was raised in for the
detailed breakdown and sequencing recommendation once one is agreed.
