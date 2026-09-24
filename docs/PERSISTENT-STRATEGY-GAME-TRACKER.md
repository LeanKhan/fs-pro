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
- [x] **Single-player first, in a shared world** (2026-09-23; see the top of [GAME-PHILOSOPHY.md](./GAME-PHILOSOPHY.md)): the AI-club world stands on its own, and humans who join later are just more clubs in the matchmaking pool. Gate for every feature: *is it fun if no other human ever shows up?* Never assume one human club; ownership stays per club (`club-access.ts`)
- [-] Monetization stance: deferred until there are other players
- [ ] Exact anti-grind levers (cooldown / energy / fatigue only): tune for the developer's own fun, not retention; put every timer (upgrades, cooldowns, challenge windows) on one time-scale setting
- [ ] Do players lose anything on a defeat?
- [x] Async human-vs-human timing: human clubs are played asynchronously, like any AI club (the owner doesn't need to be online), whenever that lands. No real-time head-to-head

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
- ~~Gate income dwarfs rewards~~ **Fixed 2026-09-23**: rewards are now a % of that match's own gate net (see "Core loop integrity fixes" below), so outcome matters at every stadium size instead of being swamped by gate income past Stands L1
- Matches feel one-note: QuickSim result only, no BATTLE presentation yet
- The Stadium Grounds description still says "Starts as a bare dirt turf" on a Level 3 pitch (cosmetic)
- `@repo/api-contract` must be rebuilt (`npm run build` in packages/api-contract) before the server starts; runtime loads the gitignored `dist`
- A pre-existing unplayed friendly in dev data has tactics stored as "[object Object]" and can't be played (old bug, unrelated)
- Matchmaking opponents are AI clubs only (by design for now, see Decisions); no power bands beyond "closest 5"

## After MVP - matchmaking and facilities made real (2026-09-21, alongside the new Club HQ hub `club-rpg-hub.vue`)
- [x] Matchmaking preview: `GET /play/:clubId/opponents` (1 + Scouting level options from the 5 closest-power AI clubs, first = closest) and `POST /play/:clubId/match` takes an optional `opponentId` (must still be in the pool). The hub's mocked "Abuja Lions" opponent replaced with the real preview
- [x] Power scale: matchmaking power = rating x 2.5 (75 rating = 188) to match the hub's ~180 scale
- [x] New real facilities: `scouting` (opponent options), `medical_centre` (-10% match cooldown per level, wired in `play.service.ts`), `staff_house` (coaching level; tactical abilities NOT wired yet). Hub pins/quick list read them from the campus; only `main_office` is still a placeholder
- [x] Verified on dev DB (snapshot + restore): new assets appear at L0, power scale, scouting L2 -> 3 distinct options with the closest first, bad opponent refused, chosen opponent played, base cooldown 300s and 210s with Medical L3; hub screenshot against the live backend. Client builds; not type-checked (`vue-tsc` not installed)
- [ ] Still mocked in the hub: Fans and Reputation (derived from level), Squad Value fallback, Main Office, Settings, Shop/Objectives/Matches tabs, the "coins" currency
- [ ] Note: the hub's background image seems to have HUD/labels baked in that duplicate the live overlays (visible in the screenshot)
- [x] Multi-opponent selection UI via Scouting Department: `matchmaking-modal.vue` renders selectable rival cards with matchup difficulty ratings (Favored, Balanced, Challenger) and passes the chosen opponent to `POST /play/:clubId/match`.
- [x] Live BATTLE arena presentation: `battle-arena-modal.vue` transforms the match into a high-energy Clash-style battle screen with minute-by-minute highlights, live momentum meter (Home vs Away pressure), and tactical coaching orders (High Press, Counter Attack, Overload) derived from `staff_house` coaching level.
- [x] Away summary executive briefing: `away-summary-modal.vue` detects time away (> 2 min) and greets returning managers with completed constructions, squad recovery status, and campus scouting reports.
- [x] Dynamic facility quick list: `club-game.vue` binds all 7 facilities (`stands`, `stadium_grounds`, `training_ground`, `youth_academy`, `medical_centre`, `scouting`, `staff_house`) with real levels and live upgrade progress.
- [x] Facility detail sheet upgrade polish: `facility-detail-sheet.vue` features side-by-side current vs next tier unlock comparison, live treasury affordability checks, and upgrade button state.
- [x] Animated supporters on campus (`campus-fans.vue`): Featherweight SVG walking character rig with alternating limbs, torso bobbing, directional facing, varied club kits/accessories, walking realistic campus routes and scaling dynamically with club fan count (3 -> 6 -> 10 -> 15 fans).
- [x] GitHub-style Play Match / Quick Sim split button: Integrated into both the standalone RPG game route (`/game/:clubId` via `bottom-dock-nav.vue`) and the Club Home manager dashboard (`/u/clubs/:id/:code` via `dashboard.vue`). Remembers user execution preference in `localStorage` and triggers instant QuickSim with query invalidation and notification feedback.
- [x] Medical Centre & Player Fitness/Injury deep integration (`medical.service.ts`, `player-fitness.service.ts`, `facility-detail-sheet.vue`):
  - **Facility Scaling**: Unlocks 1 to 3 Treatment Bays, -8% to -40% match fatigue loss, -10% to -50% injury roll chance, -1 to -3 days initial injury roll duration, and up to 40% treatment cost discount.
  - **Match Resistance**: Integrated into `applyMatchFatigueAndInjuries` so upgraded medical centers directly shield squad fitness and reduce injury frequency.
  - **Squad Cryotherapy Session**: Whole-squad treatment restoring +30 Fitness and reducing 1 day off all active injuries across the club.
  - **Targeted Treatment Bays**: Concentrate care on individual players with *Intensive Physio & Rehab* (shaves days or instantly cures minor strains), *Hyperbaric Chamber Boost* (conditions player to 100% Fitness), and *Specialist Surgery* (instantly cures severe injuries at Level 3+).
  - **Audited Financials**: All procedures deduct club treasury with verified `TransferLedger` audit rows (`Type: 'medical_treatment'`).
  - **Interactive UI**: Tabbed Medical Bay interface in `facility-detail-sheet.vue`, quick `➕ Treat` shortcuts in `squad-zone.vue`, and pre-match lineup injury recovery link in `matchmaking-modal.vue`.

## Core loop integrity fixes (2026-09-23)
Research (background Explore agents + direct reads) found two integrity problems undercutting the "upgrade facilities -> get stronger" premise: 4 of 7 facilities had `effects()` computed and shown in the UI but read by nothing else, and gate income (Stands-driven, outcome-independent) had grown to dwarf win/draw/loss rewards by up to ~40x. Full plan: `delegated-scribbling-metcalfe.md` (local plan file, not checked in).
- [x] **Gate-relative rewards**: `REWARDS` flat cash (25k/8k/2k) replaced by a % of *that match's own* gate net - win +50%, draw +10%, loss -15% (floor `MIN_WIN_CASH=3,000` on a win). XP stays flat per outcome. Verified live: draw net 285,240 -> reward 28,524 (exactly x0.1); win net 274,218 -> 137,109 (x0.5); loss net 354,606 -> -53,191 (x-0.15) - all exact matches to the formula
- [x] **Scouting redesigned**: was gating opponent *choice* in matchmaking (wrong fit - "Scouting pertains to finding talent, not opponents"). Now drives a new **scouted transfer shortlist** (`GET /transfers/scouted-shortlist/:clubId`, `getScoutedShortlist` in `services/transfers/scouted-shortlist.service.ts`): `1 + min(level,4)` AI-recommended targets (free agents + transfer-listed players from other clubs), ranked by rating-per-value, surfaced in `zones/transfer-zone.vue`. Verified: Level 0 -> 1 target, Level 4 -> 5 targets, own club excluded
- [x] **Opponent choice moved to Club Level** (not a facility): `findOpponents` option count is now `1 + min(floor(level/2), 4)`. Verified: XP 0 (level 0) -> 1 option, XP 1000 (level 3) -> 2 options
- [x] **Training Ground wired**: `applyTrainingGrowth(player, growthMultiplier)` in `player-training.service.ts` takes the club's `trainingGrowthMultiplier`, batched once per distinct club in `player.controller.ts`'s yearly pass. Verified over 500 trials: avg rating gain 1.952 (Lv0) vs 2.614 (Lv4 bonus x1.32) - matches the intended +32%
- [x] **Youth Academy wired**: `generateYouthPlayers(count, forceGK, qualityBonus)` shifts the generated attribute ranges up by `round(qualityBonus * 40)` points (capped at 99); both `runYouthIntakeForYear` and `recruitYouthPlayersForClub` now pass the club's `youthQualityBonus`. Verified directionally (Lv0 avg 45.62 vs Lv4 avg 47.15 over 8 recruits each - small N, but correctly signed)
- [x] **Stadium Grounds + Staff House wired** as a small pre-match home-side Rating nudge (`homeRatingBonus = pitchQuality*0.3 + coachingLevel*0.4`, capped in practice by facility max level), threaded through `PlayOptions` -> `buildSimulateMatchRequest` -> the plain club/player JSON sent to the sim (never persisted to the DB). Chose this over deep-wiring `pitchQuality` into the worker-thread `injuryRisk` config (no existing per-match override point there, and adding one was out of proportion for this pass) and over a live mid-match tactical-ability system (matches resolve instantly via QuickSim server-side before the client ever sees them, so there's no live match to intervene in - the battle-arena's 3 tactical buttons stay cosmetic, a deliberate scope call). Verified: +3.5 bonus raises the home club's Rating 75.2 -> 78.7 and every home player's Rating by +3.5 in the built sim request; away side unaffected
- [x] Verification: `tsc` clean (server + contract), client `vite build` clean, dev DB snapshotted before and restored+count-checked after (2,089 fixtures / 0 matchmade / XP 0 / 0 challenges / 176 assets / 0 reward+facility ledger rows, matching the last known-clean baseline)
- [ ] NOT done this pass: rebalancing `challenge.service.ts`'s flat challenge reward (left as-is, it's a periodic bonus goal not a per-match one); a full statistical check of the Stadium Grounds bonus's effect on injury *rate* specifically (the chosen implementation affects Rating, not injury risk directly - see above)

## World that reacts (2026-09-23) - plan: [WORLD-THAT-REACTS.md](./WORLD-THAT-REACTS.md)
- [x] Migration 0026 (`0026_club_standing.sql` + `run-0026-migration.ts`, applied): `Clubs.Fans/Reputation/BoardConfidence/Form`, `Players.MoraleValue`, new `ClubMessages` table (inbox). Backfill `backfill-club-standing.ts` (applied) seeds Fans from stadium capacity x quality and Reputation from Rating (Pace FZ 5.7k/27 ... Binatone 27k/82); the same `ensureStanding` runs lazily for any club without standing (e.g. new clubs)
- [x] `services/world/club-standing.service.ts`: `applyMatchResult` is called from exactly one seam, `updateFixture` in `controllers/game/functions.ts` (league matchdays and PLAY both pass through it). It moves Form, Fans (+2.5% W / +0.4% D / -2% L, plus opponent gap and streak bonus, capped at +/-8% per match), Reputation (tracks who you beat: +2 upset, 0 for beating a much smaller club), BoardConfidence (+/-3 plus streak) and squad MoraleValue (+/-4 plus streak, reverting a quarter of the way to 60 each match). Inbox messages only for human-owned clubs, only on streaks of 3/5 and board-confidence crossings (35, 20, 80)
- [x] Consumers: attendance = capacity x `attendanceFill` (fans/capacity, form, opponent pull, +/-4% noise) instead of a flat random 65-95%. Morale + form give a per-side Rating nudge clamped at +/-1.75 in `buildSimulateMatchRequest` (about +/-10% xG). Reputation in `aiResponse`: up to +30% on the asking price when selling to a smaller club, and key players refuse clubs 25+ reputation below. Board: confidence below 35 caps grants at 50%, below 20 refuses; poor form caps at 75%
- [x] Visible: `generateStandingNews` leads the MY_CLUB media feed on a 3+ streak ("in freefall: 6 defeats in a row"). `gatherFixtureFacts` falls back to recent matches of any kind when there's no season (verified: a matchmade club's form went from empty to WWWWW). `GET /play/:clubId/inbox` + `POST .../inbox/read` (owner only); `PlayState.standing` and `MatchResult.standingChange` in the contract. Client: real Fans/Reputation/Fan Approval/Form in the overview card and Club HQ hub; unread inbox messages always open the "While You Were Away" briefing (marked read on close, re-checked after each match); a "The world reacts" block in the rewards dialog; owner-zone board confidence/fan approval/expectations use real fields; the media card's invented fallback stories replaced with a plain offline notice
- [x] `GAME_TIME_SCALE` env (`services/play/game-time.ts`, default 1): divides facility upgrade times, match cooldown and challenge windows; challenge titles name the scaled duration
- [x] Verification (dev DB snapshot -> tests -> restored and count-checked: 2,624 fixtures / 1 matchmade / XP 30 / 2 challenges / 177 assets / 44 clubs / 0 inbox rows). Losing run, Royal Philamentia vs Dagada: baseline fans 24,605, expected fill 74%, board 60, morale 60, nudge 0 -> after 3L 22,804 / 64% / 50 / 50 / -0.66 -> after 6L 19,778 / 54% / 33 / 42 / -1.14. The feed led with the crisis story and the inbox had 5 messages. 20 wins then 20 losses stayed bounded (morale 83 / 38, nudge +1.32 / -1.29, reputation 75 / 64). 3 real PLAY matches: each moved both clubs exactly once (opponent form 0 -> 1, fan deltas match a single application); gate attendance rose 14.7k -> 16.0k -> 17.2k over two wins. Live dev server: `GET /play/:id` returns `standing`, inbox returns 401 without a session. `tsc` clean (server + contract), client `vite build` clean
- [ ] NOT covered: an authenticated browser check of `/game/:clubId` (the route redirects to login; no test credentials), a real league matchday through the seam (same code path as PLAY, not exercised separately), the scouted shortlist still ignores Reputation
- [ ] Note for restores: `pg_dump --clean` from before 0026 can't drop `Clubs` while `ClubMessages` references it - drop `ClubMessages` first, or restore from a post-0026 dump

## AI clubs change on their own (2026-09-23)
- [x] `services/world/ai-world.service.ts`: a real-time world tick started from `server.ts`, running every `WORLD_TICK_MINUTES` (default 10, scaled by `GAME_TIME_SCALE`, 0 = off; never overlaps itself). Each tick:
  - **Matches:** 4 AI-vs-AI matches between rested clubs of similar power (60-minute rest). They are season-less friendlies titled "(World)" with `SaveStats: false` (no per-player rows or fatigue), played through `play()`, so the usual `updateFixture` seam moves both clubs' standing and pays home gate income.
  - **Facilities:** each AI club has a 15% chance to start an upgrade, using only cash above a reserve (half a year's wages, at least 1M) and only when nothing else is building. It picks one of its three weakest affordable assets, which avoids every club building the same thing.
  - **Market:** `runAiMarket` runs whatever the transfer window says.
- [x] `runAiMarket` (split out of `runTransferDay` in `transfer-market.service.ts`, which still calls it while the window is open) covers need signings and AI-to-AI deals, plus new **debt sales**. An AI club in debt sells its highest-wage player to a richer AI club at 90% of value, or lists him (one listed player at a time) so humans can buy him. The window still gates all human business and AI bids for human players
- [x] Bug fix (pre-existing): `settleTransfer` now clears `isTransferListed`/`AskingPrice`, so a sold player is no longer still for sale at his new club
- [x] Verification (snapshot -> 6 direct ticks -> restored and count-checked: 2,628 fixtures / 0 world / 1 active upgrade / 1,327 ledger rows / 5 listed players, all matching the snapshot). 21 world matches, and every one of the 42 AI clubs played once, so the rest period works. Every AI club's Fans moved; 18 budgets rose from gate income; 15 club ratings changed through transfers. 3 debt sales (Rising Thunders -30M -> -5M, Zander -78M -> -61M) and at most 1 listed player per indebted club. Upgrades spread across assets (staff house 12, scouting 8, medical 8, training 1). No human club was ever pulled into a world match. A tick takes 0.4-1.1s. `tsc` clean
- [ ] Heads-up: with the dev server running, the tick really changes the dev DB every 10 minutes. Set `WORLD_TICK_MINUTES=0` to freeze the world for a test. An earlier restore in this pass did not apply and nobody noticed until the data looked wrong: after a restore, always check counts, not just the error count
- [ ] Not done: the deep AI debts (Binatone -143M against a 117M/yr wage bill) will take a long time to clear through one sale per tick; there's no AI wage renegotiation or release. AI clubs' youth/retirement still only happen at a season cycle end. No inbox or press coverage of AI club activity beyond the existing ledger-driven transfer news

## Next (after MVP)
- [x] Away summary + notifications inbox
- [x] Facility effects that change play: Training Ground, Youth Academy, Stadium Grounds and Staff House all now affect real outcomes (see "Core loop integrity fixes" below); new facilities (media/PR, commercial office) still not started
- [x] **Priority: a world that reacts** ([WORLD-THAT-REACTS.md](./WORLD-THAT-REACTS.md)): persistent fans, reputation, form and morale, with consumers the player can feel (see section above)
- [x] **Priority: AI clubs change on their own** (see section above; youth/retirements still at cycle end only)
- [x] One global time-scale setting for all real-time timers (`GAME_TIME_SCALE`)
- [ ] Tournaments (entry fee, 8 clubs), rival battles, event clubs, daily challenges (all against AI clubs, so they pass the zero-humans test)
- [ ] Proper economy ledger, sponsors; anti-grind tuning (fans and reputation now real, see above)
- [ ] New-club creation flow + onboarding challenge
- [x] BATTLE screen / live presentation
- [-] Async human-vs-human matchmaking (human clubs in the opponent pool, rivalries): parked until someone else is playing; the design already supports it
- [-] Leaderboards, alliances/social, anti-cheat, live PvP: parked, since they only work with other players
- [-] Mobile companion, cosmetics, live-ops: parked with monetization


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
- 2026-09-23: AI world tick: AI clubs play each other, invest and trade in real time (section above).
- 2026-09-23: World that reacts, phases 1-3 implemented and verified (section above), plus `GAME_TIME_SCALE`. Next priority: AI clubs changing on their own.
- 2026-09-23: Direction settled as single-player first, in a shared world: the AI world stands on its own, humans are just extra clubs in the async matchmaking pool whenever they arrive, and multiplayer-only features are parked. Recorded at the top of GAME-PHILOSOPHY.md.
- 2026-09-21: Dev-DB hygiene note: an earlier snapshot/restore cycle was not re-verified and the dev DB drifted by one played match (30 XP, a challenge row, ~+335k budget) before the game-screen tests; caught at the end and restored from the last verified-clean snapshot (day 348, 2,089 fixtures, 0 matchmade, XP 0, 0 challenges, 176 asset rows). Always run a count check after each restore.
- 2026-09-21: Direction change after reading GAME-PHILOSOPHY.md; plan and tracker rewritten; MVP loop started. Everything under "Built before..." and "DEFERRED" is kept for history.
