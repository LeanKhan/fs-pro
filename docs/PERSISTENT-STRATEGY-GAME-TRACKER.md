# Persistent Strategy Game — Implementation Tracker

Plan: [PERSISTENT-STRATEGY-GAME-PLAN.md](./PERSISTENT-STRATEGY-GAME-PLAN.md)
Branch: `ideas/persistent-strat-game`
Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` deferred/dropped

Last updated: 2026-09-21

## Open design decisions
- [ ] One shared world vs multiple world shards
- [ ] Timers: calendar-day (recommended) vs real-time
- [ ] Monetization stance (none / cosmetic-only / time-skips)
- [ ] Can human clubs challenge each other async, or league-only + friendlies
- [ ] Club-per-user limit + AI takeover of abandoned clubs
- [ ] League groupings: plan recommends keep divisions + ground licensing (needs user sign-off)

## MVP slice (Phase 1 + 2)
Design notes decided so far: new clubs start at Level 0 everywhere with 11 players; assets are levelled (0–5), cost + calendar-day build time, one concurrent project to start; upgrades resolve in `advanceDayIfDone`; spending recorded in `TransferLedger` (`Type: 'facility'`) until a dedicated ledger exists.

- [x] `clubAssets` table in `apps/fs-pro-server/src/db/drizzle/schema.ts`
- [x] Migration `0023_club_assets.sql` + `run-0023-migration.ts` (applied to dev DB; migrations 0015+ are applied by scripts, not the drizzle journal)
- [x] `services/facilities/asset-config.ts`: 4 asset types, levels 0-5, cost / days / effects / prerequisites (Stadium Grounds, Stands, Training Ground, Youth Academy)
- [x] `services/facilities/facilities.service.ts`: `getCampus`, `startUpgrade` (atomic conditional budget debit + `facility` ledger row), `completeDueUpgrades`, `getAssetEffects`
- [x] Hook completion into `advanceDayIfDone` (`controllers/calendar/calendar.service.ts`)
- [x] api-contract: `routes/facilities.ts` + `schemas/facilities.ts`, registered in `index.ts`; server router `controllers/facilities/facilities.router.ts` wired in `routers/index.ts`
- [x] Ownership/auth check on upgrade endpoint (session `userID` must own the club, or admin) - written, NOT yet exercised over HTTP
- [x] New clubs start at Level 0 (a missing `ClubAssets` row = Level 0, so no seeding needed)
- [ ] Client: campus/facilities zone in `apps/fs-pro-client/src/views/user/club/zones/`
- [~] Verification: `tsc` clean (server + api-contract); service-level live check on dev DB passed (start, debit, ledger, concurrent/duplicate/unknown/poor refusals, no early completion, completion on due day, idempotent re-run; dev data restored afterwards). Still to do: HTTP-level auth check (401/403/200), a real live-clock tick, client rendering
- [ ] Gate income (capacity-capped) - moved to Phase 1 work; upgrades currently only cost money, nothing pays back yet
- [ ] Effects not yet consumed by game systems (`getAssetEffects` exists; training/youth/capacity wiring is Phase 2)

## Phase 1 — Structured economy
- [ ] `clubLedger` table (income + expense streams) replacing untyped `Clubs.Finances`
- [ ] Gate receipts, capacity-capped attendance
- [ ] Sponsors / merch / TV income
- [ ] Upkeep + staff wages expenses
- [ ] Per-matchday accrual in the calendar tick
- [ ] Finance dashboard in owner zone

## Phase 2 — Club campus & timed upgrades
- [ ] Building effects wired: training ground → `player-training.service.ts`
- [ ] Youth Academy → `player-lifecycle.service.ts`
- [ ] Medical → `player-fitness.service.ts`
- [ ] Scouting → `transfer-scout.service.ts`
- [ ] Media + PR team, Commercial office, Club shop / fan zone
- [ ] Staff roles (Head Coach, Chief Scout, Physio, PR Manager) with wages
- [ ] Prerequisites + tier/reputation caps on max level
- [ ] Concurrent-project limit ("builders")

## Phase 3 — Contracts & board pressure
- [ ] Player contract length / expiry / renewal
- [ ] Persistent board objectives + confidence meter + sack/ultimatum
- [ ] Reuse `board-budget.service.ts` for project funding negotiation

## Phase 4 — Fan/city simulation loops
- [ ] Fan happiness, ticket price + wage policy dials
- [ ] Ground licensing per division tier
- [ ] Away-fan allocation + crowd-safety incidents, giant-kill windfall
- [ ] Random world events via `world-feed.service.ts`

## Phase 5 — Async social / PvP
- [ ] Federations (clans) table
- [ ] Async challenge matches (QuickSim vs saved setup)
- [ ] Leaderboards, inter-federation cup
- [ ] Per-user notification inbox + push/email

## Phase 6 — Live-ops & seasons
- [ ] Seasonal objectives / events
- [ ] Cosmetic monetization (kits, crests, stadium skins)

## Phase 7 — Mobile companion (Expo)
- [ ] Scaffold app, projects view, notifications

## Log
- 2026-09-21: Plan approved and saved to docs. Codebase explored (calendar clock, schema, prize-money/wage ledger patterns, contract/router wiring). No implementation code written yet.
- 2026-09-21: Server side of the MVP slice implemented (schema, migration 0023, asset config, facilities service, calendar hook, contract + router). Service-level live test passed; temp test script removed.
