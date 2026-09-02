# Changelog

Notable changes to FSPro. Dates are approximate (grouped by the week the work landed), since this is tracked as milestones rather than strict semver releases.

## Unreleased

### Database: MongoDB → PostgreSQL migration complete

The long-running Mongo → Postgres migration (in progress since late 2025) is done. Postgres via [Drizzle ORM](https://orm.drizzle.team/) is now the **only** backend.

- Removed MongoDB, Mongoose, and `mongoose-autopopulate` entirely - no dual-backend code path, no `DB.ormType`/`DB.backend` switch, nothing left importing `mongoose`.
- Every entity (Clubs, Players, Managers, Competitions, Seasons, Fixtures, Calendars, Days, Users, Awards, Match Replays, Club/Player match details, Places) is served through a Drizzle repository.
- Deleted the 14 one-time `migrate-*.ts` data-mover scripts used during the migration - historical now that the data has moved.
- Converted every `*.model.ts` file's Mongoose schema half down to a plain TypeScript interface.
- Found and fixed a good number of raw Mongo-shaped calls that had survived the initial migration pass silently broken (they type-checked fine since the old `IModels` type was `any`, but would have thrown at runtime) - including a genuine bug in match-result standings updates that was writing through a dead code path.

### Removed Prisma

Prisma was evaluated as the Postgres ORM early in the migration (`feat: install prisma`, Nov 2025) and used for a handful of entities before the project settled on Drizzle instead.

- Deleted the Prisma-backed `PostgreSQLDatabase`/`SQLPlaceRepository`, the generated Prisma client, `prisma.config.ts`, and the `prisma/` schema + migrations folder.
- Removed `prisma`, `@prisma/client`, and `@prisma/adapter-pg` from `package.json`.
- Updated stale API docs (Swagger) that still described a runtime `mongo`/`drizzle`/`prisma` backend switch that no longer exists.

### Calendar model redesigned as a singleton

Replaced the old "one Calendar row per real-world year, with Days holding an embedded array of Matches" model with a simpler shape that fits Postgres properly and matches how the game actually works (one perpetual, ever-advancing game-world clock - **not** tied to the real-world date):

- `Calendars` is now a true singleton table (one row, ever) holding just `CurrentDay`/`CurrentDate`.
- `Fixtures` own their own schedule directly (`ScheduledDay`/`ScheduledDate` columns) instead of being referenced from a `Day.Matches` jsonb array - "what's playing on day N" is now a plain indexed column filter instead of a jsonb query.
- `Days` is now a sparse table, only ever holding real non-match calendar events.
- Reset the calendar/season/fixture/match-history data to a clean slate under the new model (Clubs, Players, Managers, Users, Competitions, and Places were preserved).
- Rewrote the calendar/season/fixture/game-loop application code around the new shape: starting and ending a season cycle, advancing the current day, fetching fixtures by day range, and updating standings after a match.

### Replaced arbitrary client-facing queries with typed filters

Several routes used to accept a raw Mongo-style `{field: value}` JSON query straight from `req.query` and pass it into `.find()` - a pattern that's both a security smell and something that simply can't translate to SQL. These were replaced with specific, named, typed query parameters:

- Removed the generic `/search/all` and `/search/one` routes (backed by an unrestricted query-builder) that had been mounted on nine different entity routers.
- Replaced Club's `/fetch`, and arbitrary `?query=`/`?populate=` params on Competitions, Seasons, and Fixtures, with typed equivalents (`?type=`, `?id=`, `?year=`, `?competition=`, `?current=`, `?ids=`, `?unclaimed=`, `?scheduledDay=`/`?scheduledDayFrom=`/`?scheduledDayTo=`).
- Updated every client call site that relied on the old arbitrary-query shape.

### Client updated to match

- Rewired the dashboard, club dashboard, matchzone, admin calendar, and end-of-year views to the new singleton Calendar / Fixture-owns-its-schedule model.
- Removed the old calendar year create/setup/start bootstrap UI in favor of a simple "Start Next Season Cycle" / "End Season Cycle" flow.
- Removed a client-side "day of fixture" round-trip that's no longer needed now that a Fixture carries its own `ScheduledDay`.

### Tooling

- Switched from ESLint/Prettier to [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)/Oxfmt across the monorepo.
- Added a Docker Compose setup (`compose.yaml`) for the local Postgres database, with credentials read from a gitignored `.env` instead of hardcoded in the tracked file.

## Match Engine & Replay (Aug 2026)

- Added match replay: a finished match's per-tick frames are saved and can be re-streamed on demand without re-simulating it.
- Fixed possession, passing, tackling, positioning, and attacking-run bugs in the simulation engine.
- Added red/yellow cards, club kit rendering, and match queueing (simulating a match in a worker thread, off the request path).
- Adopted Drizzle ORM and began the full entity-by-entity conversion off Prisma.

## Vue 3 Migration (Nov 2025)

- Migrated `fs-pro-client` from Vue 2 to Vue 3 (and Vuetify 3), across every view and component.
- Restored custom club icons and the FSPro logo under the new Vuetify version.

## Early Postgres Experiments (Nov 2025 - Mar 2026)

- First attempt at a Postgres backend, using Prisma: Places, Users, Managers, Competitions, Clubs, Calendars, and Days were migrated one at a time behind a runtime backend switch, with Mongo still live as the default.
- Added the Seasons model to Postgres.

## Project Origins

FSPro started as two separate repositories - [fs-pro-server](https://github.com/LeanKhan/fs-pro-server) and [fs-pro-client](https://github.com/LeanKhan/fs-pro-client) - later combined into this monorepo. Early milestones: the initial Express/TypeScript server and game engine, the original Vue 2 client, and the first working version of creating seasons and playing matches against MongoDB.

---

For what's planned next, see the "What's next?" section in [README.md](README.md).
