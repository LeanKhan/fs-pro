# Implementation Tracker — match-centred club game

Plan: [PERSISTENT-STRATEGY-GAME-PLAN.md](./PERSISTENT-STRATEGY-GAME-PLAN.md) · Direction: [GAME-PHILOSOPHY.md](./GAME-PHILOSOPHY.md)
Branch: `ideas/persistent-strat-game`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` deferred/dropped
Rewritten 2026-09-21 after the direction change (match = primary loop; real-time timers; no leagues going forward).

## Decisions
- [x] Real-time timers (upgrades, challenge deadlines); calendar demoted to background for the seeded AI world
- [x] Matchmaking on demand, not scheduled fixtures/pods/lobbies
- [x] Old leagues kept as memories only (also the AI opponent pool)
- [x] New clubs start from scratch (Level 0, 11 players)
- [ ] Monetization stance
- [ ] Exact anti-grind levers (cooldown / energy / fatigue only)
- [ ] Do players lose anything on a defeat?
- [ ] Async human-vs-human timing

## MVP loop (done 2026-09-21)
- [x] Migration 0025 (`0025_play_loop.sql` + runner, applied): `ClubAssets.StartAt/CompleteAt`, `Clubs.XP`, `ClubChallenges`
- [x] Facilities on real-time timers: `baseMinutes` in `asset-config.ts` (L1 = 20-40 min, x level), lazy completion on every read + `startFacilitiesSweep` (15s, started from `server.ts`); calendar-day completion hook removed. Old `StartDay/CompleteDay` columns are unused leftovers
- [x] Play service (`services/play/play.service.ts`): opponent from the 5 closest-power AI clubs, season-less friendly fixture titled "(Matchmade)", QuickSim via `play()`, retries the next opponent if a club can't field a match
- [x] Rewards (`rewards.ts`): win 25k+30xp / draw 8k+10xp / loss 2k+5xp with `match_reward` ledger rows; stadium gate credited by the existing `updateFixture`; Club Level = floor(sqrt(XP/100))
- [x] Cooldown between matches: `MATCH_COOLDOWN_SECONDS` env, default 300 (use 20 for local testing) + existing squad fatigue/injuries (matches use SaveStats)
- [x] Challenge (`challenge.service.ts`): "Win N matches within 24h" (N = 3 + level/3), auto-issued, lazily expired, reward paid on completion (`challenge_reward`), next one issued immediately; failing has no penalty
- [x] Contract `play` (`GET /play/:clubId`, `POST /play/:clubId/match`) + router; shared owner/admin check `controllers/auth/club-access.ts` (also used by facilities)
- [x] Client: `zones/play-panel.vue` (level/XP bar, PLAY with cooldown countdown, challenge card with countdown, recent matches, result dialog) and real-time `facilities-panel.vue`, both in `owner-zone.vue`
- [x] Verification: tsc clean; service-level checks all passed on the dev DB (real-time upgrade + lazy completion, match paid = reward + gate net, XP, challenge progress/completion payout/expiry, cooldown refusal, ledger rows); 6 real matches gave varied scores (2W/2D/2L vs equal power); real HTTP (GET 200, unauthenticated POST 401, unknown club 404); headless-Chrome screenshot reviewed; sweep starts with the server. Snapshot + restore of the dev DB around every destructive check
- [ ] NOT covered: an authenticated PLAY click in the browser (POST is session-gated; only the handler-level access check pattern and the 401 were exercised), the result dialog, the periodic sweep completing an upgrade with nobody reading, opponent variety over many matches
- [ ] Economy is unbalanced (see below)

### Known issues / tuning (found during the MVP)
- Gate income dwarfs rewards: backfilled clubs at Stands L3 earn ~250-330k net per match (rewards are 2-25k) and upgrades cost 1-5M. A new Level 0 club earns ~15k/match, which is fine; established clubs are the problem. Levers: cooldown (default now 5 min), ticket price, upkeep scaling, or gate only from real stadium events
- Matches feel one-note: QuickSim result only, no BATTLE presentation yet
- The Stadium Grounds description still says "Starts as a bare dirt turf" on a Level 3 pitch (cosmetic)
- `@repo/api-contract` must be rebuilt (`npm run build` in packages/api-contract) before the server starts; runtime loads the gitignored `dist`
- A pre-existing unplayed friendly in dev data has tactics stored as "[object Object]" and can't be played (old bug, unrelated)
- Matchmaking opponents are AI clubs only; no human opponents or power bands beyond "closest 5"

## Next (after MVP)
- [ ] Away summary + notifications inbox
- [ ] Facility effects that change play (coaching -> tactical abilities, academy -> players, scouting, medical); new facilities (medical, scouting, coaching, media/PR)
- [ ] Async human-vs-human matchmaking (club snapshots, rivalries)
- [ ] Tournaments (entry fee, 8 clubs), rival battles, event clubs, daily challenges
- [ ] Proper economy ledger, sponsors, fans, reputation; anti-grind tuning
- [ ] New-club creation flow + onboarding challenge
- [ ] BATTLE screen / live presentation
- [ ] Mobile companion, cosmetics, live-ops

## Built before the direction change: facilities (done 2026-09-21)
Design notes decided so far: new clubs start at Level 0 everywhere with 11 players; assets are levelled (0–5), cost + calendar-day build time, one concurrent project to start; upgrades resolve in `advanceDayIfDone`; spending recorded in `TransferLedger` (`Type: 'facility'`) until a dedicated ledger exists.

- [x] `clubAssets` table in `apps/fs-pro-server/src/db/drizzle/schema.ts`
- [x] Migration `0023_club_assets.sql` + `run-0023-migration.ts` (applied to dev DB; migrations 0015+ are applied by scripts, not the drizzle journal)
- [x] `services/facilities/asset-config.ts`: 4 asset types, levels 0-5, cost / days / effects / prerequisites (Stadium Grounds, Stands, Training Ground, Youth Academy)
- [x] `services/facilities/facilities.service.ts`: `getCampus`, `startUpgrade` (atomic conditional budget debit + `facility` ledger row), `completeDueUpgrades`, `getAssetEffects`
- [x] Hook completion into `advanceDayIfDone` (`controllers/calendar/calendar.service.ts`)
- [x] api-contract: `routes/facilities.ts` + `schemas/facilities.ts`, registered in `index.ts`; server router `controllers/facilities/facilities.router.ts` wired in `routers/index.ts`
- [x] Ownership/auth check on upgrade endpoint (session `userID` must own the club, or admin) (handler-level check done, see below)
- [x] New clubs start at Level 0 (a missing `ClubAssets` row = Level 0, so no seeding needed)
- [x] Client: `zones/facilities-panel.vue` (levels, upgrade progress bar, next-level cost/days/blocked reason, upgrade button) replaces the fake "Stadium & Infrastructure" card in `owner-zone.vue`. Removed the client-authoritative `expandStadium` (it wrote Budget/Stadium.Capacity straight through `updateClub`). `vite build` passes; NOT type-checked (`vue-tsc` isn't installed) and NOT viewed in a browser
- [x] Verification (2026-09-21): `tsc` clean; service-level checks; real HTTP against a running server (GET campus 200, unknown club 404, unauthenticated upgrade 401); real `tickNow()` advanced day 348 -> 349 and completed a due Training Ground upgrade (L2 -> L3); a played friendly credited gate income exactly per formula (capacity from Stands, attendance 72% of 8,000, revenue = att x 28, costs formula, Budget delta = net); the panel rendered with real data in headless Chrome (screenshot reviewed). The dev DB was snapshotted (pg_dump via the `fs-pro-db-1` container) before the destructive checks and restored afterwards (verified day 348, 2,089 fixtures, no temp rows, 176 asset rows, tier columns intact)
- [x] Gate income capacity-capped: `updateFixture` (`controllers/game/functions.ts`) now takes capacity from the Stands level via `getAssetEffects` (was a hardcoded 20,000); upkeep scales with capacity. Level 0 capacity is 1,000. NOT yet exercised by an actual played fixture (only typechecked + formula reasoning)
- [x] Porting existing clubs (decided 2026-09-21): virtual AI defaults REMOVED. A missing `ClubAssets` row = Level 0 = a brand-new club from scratch. `scripts/migration/backfill-club-assets.ts` (idempotent, `--dry` supported, fixed legacy cutoff so later clubs are untouched) wrote real rows for the 44 pre-existing clubs by division (`legacyClubLevels`: div 1 = grounds 3/stands 3/training 2/academy 2, div 2 = 2/2/1/1, else 1/1/1/0). Run on dev DB: 176 rows; rerun inserted 0. Existing human-owned dev clubs also got their division's levels (they're established clubs). Fixes the ownership-flip and relegation-drift problems
- [x] Claiming decision: claiming an existing club INHERITS its facilities; claiming may not ship in the MVP at all. Not enforced anywhere yet - no claim endpoint was gated or changed
- [ ] Any club-creation path must not run the backfill logic; verify new clubs really start with no rows (create-club flow not yet exercised)
- [x] HTTP handler auth verified by calling the handler directly: no session 401, non-owner 403, owner 200. Admin path untested (no admin user in dev DB)
- [ ] Effects still not consumed beyond capacity (`getAssetEffects` also returns training/youth multipliers; wiring is Phase 2)
- [ ] NOT covered by the checks: the live-mode polling loop itself (`pollOnce`; `tickNow` shares `performTick`), the panel's in-progress/progress-bar state, an authenticated upgrade click in the browser, and the admin auth path
- [ ] Findings: (1) `@repo/api-contract` must be rebuilt (`npm run build` in packages/api-contract) before the server starts - runtime loads `dist`, which is gitignored; a stale dist crashes startup with "Cannot use 'in' operator ... 'method'". (2) `advanceDayIfDone` returns before the upgrade-completion hook when no later fixture day exists, so game days (and upgrades) only progress while fixtures are scheduled ahead - i.e. they stall between the end of a season cycle and `startNextSeasonCycle`. (3) Pre-existing bad data: an unplayed friendly (`New Simeone Mirrors F.C vs Jacwinth Tanks FZ`) has `HomeTactic`/`AwayTactic` stored as the string "[object Object]", so `play()` throws on `JSON.parse` - an old createFriendly bug, not from this work. (4) The panel's description still says "Starts as a bare dirt turf" on a Level 3 pitch (cosmetic)
- [ ] Gate-income economics need a tuning pass once a real season is simulated (ticket price fixed at 28, fill 65-95% random)

## DEFERRED — season flow, off-season, pyramid (superseded by GAME-PHILOSOPHY)
Game days only moved fixture-to-fixture, so upgrades/transfer window/fitness froze between season cycles, and the cycle itself (end -> start next) is admin-triggered.
- [x] Off-season idle days: in LIVE mode, when nothing is left to play and nothing is scheduled ahead, the tick advances one empty game day (spaced by `OffDaySlotMinutes`) for up to `OFFSEASON_DAYS` = 30 days after the last fixture day (`calendar-clock.service.ts` `shouldIdle`, `calendar.service.ts` `advanceIdleDay`). Paused mode never idles. Day-advance side effects (fitness, upgrades finishing, AI transfer market) extracted to `applyDayAdvance`, shared by fixture jumps and idle days
- [x] Empty-day fix: `advanceDayIfDone(day, { allowEmptyDay })` - the runner passes it when nothing is left to play, so the calendar can jump from an idle (empty) day to a newly scheduled cycle instead of sticking
- [x] Verified on dev DB (snapshot + restore): live idle ticks 348->349->350 completed a due upgrade; paused tick = no idle; cap stops idling at 30 empty days; empty day 378 jumped to a fixture on 381
- [ ] Automatic season cycle from the tick: when all seasons finish -> `endSeasonCycle` -> off-season -> `startNextSeasonCycle` (currently admin-only; needed for pods / thousands of players). Ties in with rolling fixtures below
- [ ] Rolling matchmaking vs scheduled fixtures for players who join any time (design discussion 2026-09-21)

## DEFERRED — league pyramid & pods (built partially, no longer central)
Decisions: flexible config-driven tiers (start: 5 tiers, pod 20, fan-out 2, U=2 promoted, R=fanout x U=4 relegated so pod sizes balance); new clubs start from scratch in the bottom tier; bots fill empty seats and slowly upgrade; one global calendar. See plan section "League pyramid & pods".
- [x] Tier representation decided: explicit `Competitions.Tier` + `Pod` columns (`Division: 0` is already used by cups in `tournament-engine.service.ts`)
- [x] Read existing promotion/relegation code: hard-coded for 2 divisions/country (`season.controller.ts` `prolegate` + `finishSeasonPlain`, `season-report.service.ts` ~217); picks the first competition at Division +/- 1, so pods and middle tiers are impossible -> needs a generalised replacement
- [x] Migration 0024 (`0024_competition_tier_pod.sql` + runner, applied to dev): `Tier` + `Pod` on Competitions, existing leagues backfilled Tier = Division, Pod = 0 (dev: 2 countries x tier 1 + tier 2)
- [x] Generalised `finishSeasonPlain` + `prolegate` (`prolegatePyramid`, refuses to move anyone if a destination league is missing) + `season-report.service.ts` movements, for leagues with a `Tier`; leagues without one keep the legacy code path untouched. `tsc` clean
- [x] Dry run (no writes): real dev data reproduces the legacy behaviour exactly (net size change 0 in all 4 leagues); synthetic 5-tier/31-pod pyramid stays balanced at 20 per pod. NOT yet exercised: an actual `finishSeason` -> `endSeasonCycle` run that writes moves (dry run only; applying uses the same `appendClubRecord` as legacy)
- [x] Next season generation read: `startNextSeasonCycle` creates a Season per Competition from each club's `LeagueId`, so moving clubs = updating LeagueId and new pods automatically get seasons
- [x] `services/competitions/pyramid-config.ts` (tiers 5, pod 20, fanout 2, U=2, R=fanout x U) + `pyramid.service.ts` (`getTierInfo`, `bottomTierOf`, `fanoutBelow` derived from real pod counts so countries with different shapes work, `findLeague`, `planMoves`)
- [ ] New-club creation flow: starter club, 11 players, Level 0 facilities, joins an open bottom-tier pod (no creation flow exists today; users are assigned existing clubs via `user.router.ts`)
- [ ] Pod allocation: open a new pod when full; bot fill for empty seats; human takes over a bot seat
- [ ] Cross-pod promotion/relegation at season end
- [ ] Bot facility-upgrade routine (slow, budget-driven)
- [ ] Bottom-tier seed data / dev reset support
- [ ] Regional pods via `homePlaceId` (later)

## Log
- 2026-09-21: Direction change after reading GAME-PHILOSOPHY.md; plan and tracker rewritten; MVP loop started. Everything under "Built before..." and "DEFERRED" is kept for history.
