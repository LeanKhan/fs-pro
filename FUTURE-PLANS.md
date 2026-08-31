# Future Plans

Running log of ideas raised during development that were deliberately **not**
built yet, why, and roughly how each would be implemented when its time
comes. Add to this whenever something gets deferred instead of just dropped
from conversation. Each entry should have enough context that work can start
cold, without re-deriving the reasoning.

Entries are grouped by area. Within a group, newest first.

---

## DB migration (Mongo → Postgres)

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

**Known consequence, not a bug:** a user who registers via `POST /join`
while `backend` is `drizzle` only exists in Mongo - `POST /login` (which
checks Postgres) won't find them until `Club` is converted and
registration can move too. Not an issue for already-migrated users
(`migrate-users.ts` already copied everyone into Postgres); only matters
for brand-new signups tested while the backend override is set to
`drizzle`.

**If revisited:** Converting registration requires `Club` to be converted
first (or at least `Club.User` + the specific join-table-style linking
`updateClubsById` does), since that's the actual blocker, not `User`
itself. See the `Club` conversion note (not yet written) for the natural
next step in this migration.

**Also found, not fixed (pre-existing, unrelated to this pass):**
- `GET /users/:id` returns the entire lean User document over the API,
  including the bcrypt password hash. Predates this migration; preserved
  as-is rather than silently changing response shape.
- `POST /users/:id/add-club` (and the sibling `/add-clubs`) leak raw
  Mongoose Document internals (`$__`, `_doc`) in their response - the same
  missing-`.lean()` class of bug fixed in `MongoPlaceRepository` earlier,
  but in the untouched `updateUser` function in `user.service.ts`. Left
  alone since these routes are deliberately out of scope for this pass.

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
