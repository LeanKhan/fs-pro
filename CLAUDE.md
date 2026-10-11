# fs-pro

## Game model: Clash of Clans on a football club

The design lives in `docs/coc-mapping/` (start with `README.md`; what is
actually built is logged in `PROGRESS.md`). Read it before touching the campus,
economy, matches, squad, grid, ladder or the club hub.

The launch loop is the whole game:

**Collect → Build → set your Pitch Grid → Attack → stars + loot + Standing →
get attacked while away → repeat.**

Key concepts:

- **Campus**: the village. 3D grounds (`views/game/club-game.vue`,
  `components/cozy/`). It is home: every other screen is an overlay or drawer
  on top of it, never a separate route-home.
- **Clubhouse tier**: the Town Hall. Caps every other facility's level and
  gates the Groundskeeper count (`internal/clubhouse`, the single authority).
- **Resources**: Cash (`Clubs.Budget`), Fans, Scout Tokens, Sponsor Credits.
  Crossed costs: Cash buildings cost Fans and vice versa. Each has a vault cap.
  Collectors (Turnstiles, Club Shop) accrue lazily; `campus.collect` banks them.
- **Groundskeepers**: the builders. Scarce simultaneous-upgrade slots.
- **Tier** is the word for facility grades. Never call them "Level".
- **Attack (raid)**: `POST /api/play/:clubId/match`. Async, server-side,
  deterministic: the attacker's Match grid vs the defender's stored Home grid,
  run through `crates/sim-core`. Returns 0-3 stars, stolen loot and Standing
  deltas (`MatchResult.raid`). The defender gets a guard/shield.
- **Standing points**: the ladder (CoC trophies), `Clubs.StandingPoints`,
  floored at 0. Leagues/rollover in `internal/league`.
- **Pitch Grid**: the squad's formation as cells (Home / Match / Derby slots),
  `internal/grid`. Abilities and traits are gated by facility tier.
- **Squad supply**: a founded club starts with a 16-player starter squad and a
  manager, named by worldgen in its town's culture. More players come from the
  Youth Academy (`POST /api/clubs/:id/recruit-youth`). Transfers are hidden
  for launch.
- **Founding / placement**: new clubs fill the world town → region → country →
  new country (world-service placement). Each club gets its own map spot near
  its town (`Clubs.MapX/MapY`). Never spawn AI clubs on founding.
- **Club hub**: defence log + replays, ladder, season pass, legacy, abilities,
  association, pre-season (`components/cozy/club-hub.vue`).

## Server

- **Go only** (`apps/fs-pro-server-go` + `services/*`). Local stack:
  `scripts/run-go-stack.ps1`. Migrations are SQL files in
  `apps/fs-pro-server/src/db/drizzle/migrations/` (applied by
  `deploy/migrate.sh`); the Node app is not run.
- Server-authoritative and deterministic: per-run seeds, no client-trusted
  outcomes.

## Retired for launch (do not wire back in)

The old pyramid/open-play game: pyramid leagues and divisions, the hourly
calendar clock and year end, Club Level/XP as a gate, the board score,
open-play competitions and challenges, booked matches/matchday/prep, the owner
program, world news, transfers. The code still exists, but no client route or
HUD entry leads to it (managers are redirected to their campus; admins keep
the `/a` screens). The Go world-worker schedules no pyramid fixtures. Don't add
mode flags or dual code paths for it.
