# FSPro → "Clash of Clans / SimCity for Football"

## Context
FSPro already has a persistent, server-driven world: one global calendar ticked by `calendar-clock.service.ts` (live mode, CAS lease), a tournament engine, a match engine with live streaming, transfer market + AI scout, training, youth/retirement lifecycle, board budget requests, SSO auth and club ownership (`Clubs.UserId`). That is ~60% of a *persistent world* (Bartle: world keeps evolving while players are offline). What is missing is the **builder/base layer** (SimCity, CoC's village) and the **asynchronous social/PvP layer** (CoC's clans, wars, raids).

Source takeaways:
- **Clash of Clans**: two-currency loop (earn → spend on timed upgrades → stronger), limited builders as a scarcity gate, trophies/leagues, clans + wars/CWL, seasons, shields/offline-safe attacks.
- **City-builders**: player is planner/leader; budget & salary dials; interconnected systems whose decisions cascade; open-ended goals with satisfaction + balance as health metrics; disasters/events.
- **Persistent world**: world advances offline. FSPro chooses *true persistence* (server tick) — already built; design everything as "queue an order, world resolves it on ticks".

## Core concept mapping
| Inspiration | FSPro equivalent |
|---|---|
| Village / city | **Club campus**: stadium, training ground, academy, medical, scouting HQ, commercial, fan zone (grid or slot-based, on the existing world map `Places`) |
| Gold/Elixir | **Cash** (existing `Budget`) + **Reputation/Fan Base** (soft) + **Youth Points / Scouting Points** |
| Builders + upgrade timers | **Staff/contractors**: N concurrent projects; timers measured in **calendar days**, resolved by the tick |
| Zoning / traffic / citizen happiness | Fan happiness, attendance, stadium capacity vs demand, wage-to-revenue ratio, board confidence |
| Troops/defenses | Squad + tactics (existing lineup/tactic); "defense" = your tactic setup when AI/other users play you |
| Trophies/leagues | Existing leagues + promotion/relegation → the "trophy ladder" |
| Clans / wars | **Supporters' consortiums / Federations**: shared league, loan pool, joint scouting, inter-clan cups |
| Raids | **Async challenges**: friendly/cup ties simulated by QuickSim vs another player's saved setup (no need for both online) |
| Disasters/events | Injuries wave, scandal, sponsor collapse, stadium fire, cup upsets — random world events via `world-feed` |
| Seasons/battle pass | Season Report (exists) + seasonal objectives, cosmetic kits/crests |

## Facility & staff levels (user direction)
Every asset is a leveled building/role; a new club starts at **Level 0/1 everywhere: dirt pitch, no stands, 11 players**, and grows by paying cash + waiting calendar days.
- **Assets** (each with `level`, cost curve, build days, per-level effect): Stadium Grounds (pitch quality → match/injury effects), Stands (capacity, per-stand), Training Ground, Youth Academy, Scouting Network, Medical/Physio, Media + PR team, Commercial/Sponsorship office, Club Shop/Fan Zone.
- **Staff** are the same pattern (Head Coach, Chief Scout, Physio, PR Manager): hire level-N staff with wages that hit the ledger.
- **Table shape**: `clubAssets(clubId, assetType, level, upgradingTo, startDay, completeDay)`; effect lookup from a static config (`assetConfig.ts`: `{type, level → cost, days, effects}`) so balancing is data, not code.
- Prereqs like CoC (e.g. Stands L3 needs Grounds L2), and a max level gated by club **tier/reputation** so nobody can buy everything on day one.

## Decision: do we keep league groupings?
**Recommendation: keep leagues/divisions, but decouple them from facility level.** Leagues stay the competitive ladder (promotion/relegation = trophies); facilities are the economy ladder. Clubs in a division *may* differ wildly, and that is a feature.
- **Ground licensing** (real-football style): each division tier requires minimum Stadium/Stands level (and later Academy) to *enter* it. Promotion without the ground = you must upgrade in the off-season or be denied/fined. This keeps divisions roughly comparable without forcing equal levels.
- **Matchday economy handles small-vs-big cases** (your away-fans example):
  - `homeDemand = f(fanBase, form, ticketPrice, opponent draw)`; `awayDemand = f(visitor fanBase, distance via world map Places)`.
  - Away allocation is a slice of capacity (e.g. 5–10%, upgradable via segregated-stand level). Excess demand is turned away = lost revenue for the host, not free money.
  - Small stadium + huge visiting fanbase → **crowd-safety risk**: if attendance pressure > stand safety level, roll for incident: fines, stand damage (asset level temporarily reduced / repair project), fan-happiness drop. Upgraded stands/security lower the risk.
  - Upside for small clubs: **giant-kill windfall** (cup draw vs big club = big gate/TV/prize), which funds an upgrade — the CoC "underdog loot" feel.
- **Cup/friendly matchmaking across tiers** allowed; league play stays within division so sporting fairness is preserved; no level-based matchmaking needed.
- Fallback if this feels too complex: cap attendance at capacity with no incident model (Phase 1), add incidents in Phase 4.

## Phased roadmap (each phase shippable; ordered by leverage)
1. **Structured economy (SimCity foundation)** — replace untyped `Clubs.Finances` jsonb with a `clubLedger` table + income streams (gate receipts, sponsors, merch, TV, prize money already in `prize-money.service.ts`) and expense streams (wages, upkeep, projects). Add per-tick/per-matchday accrual in the calendar clock. Finance dashboard on the owner zone.
2. **Club campus & timed upgrades (CoC core loop)** — new `clubBuildings` + `buildProjects` tables (type, level, startDay, completeDay). Use the unused `Clubs.Stadium`. Buildings give effects: stadium capacity → gate income; training ground → multiplier in `player-training.service.ts`; academy → youth intake quality (extend `player-lifecycle.service.ts`); medical → `player-fitness.service.ts` recovery; scouting → `transfer-scout.service.ts` reach. Project completion resolved in the calendar tick. Limited concurrent projects ("builders").
3. **Contracts & board pressure** — add contract length/expiry/renewal to players (only `Wage` exists today); make board persistent: objectives per season, confidence meter, sack/ultimatum, reuse `board-budget.service.ts` (ACCEPTED/COMPROMISE/REJECTED) as the negotiation layer for project funding.
4. **Fan/city simulation feedback loops** — fan happiness, attendance = f(form, ticket price, stadium level, rivalry); ticket price & wage policy as player-facing dials (the "tax sliders"). Random events feed via `world-feed.service.ts`.
5. **Async social/PvP** — Federations (clan) table; async challenge matches using saved lineup/tactic vs QuickSim; shared leaderboards; inter-federation cup via `tournament-engine.service.ts`. Add per-user notification inbox (Users.Alerts is barely used) + push/email, since async play depends on it.
6. **Live-ops & seasons** — seasonal objectives, events, cosmetic monetization (kits/crests/stadium skins; avoid pay-to-win gem-skipping since sims are deterministic and competitive).
7. **Mobile client** (none exists) — a thin companion app (Expo) for checking projects, approving upgrades, notifications; the Vue web stays the main manager UI.

## Key design decisions to confirm with user
- One shared world (current singleton calendar) vs multiple world shards/servers.
- Real-time timers vs calendar-day timers (recommend calendar-day: works with pause/speed and keeps the sim deterministic).
- Monetization stance (none / cosmetic-only / time-skips).
- Whether other human clubs can be "attacked"/challenged, or interaction stays league-based + async friendlies.
- Club-per-user limit and inactivity handling (AI takeover of abandoned clubs; AI board/transfer already exists).

## Critical files
- `apps/fs-pro-server/src/db/drizzle/schema.ts` (new tables + migration)
- `apps/fs-pro-server/src/services/calendar/calendar-clock.service.ts` (tick hooks for accrual/project completion)
- `services/economy/prize-money.service.ts`, `services/transfers/transfer.service.ts` (ledger integration)
- `services/ai/board-budget.service.ts` (reuse for project funding/negotiation)
- `controllers/players/player-training.service.ts`, `player-fitness.service.ts`, `player-lifecycle.service.ts`, `services/ai/transfer-scout.service.ts` (building effects)
- `packages/api-contract` (ts-rest contracts for new endpoints); client zones in `apps/fs-pro-client/src/views/user/club/zones/`

## Verification (per phase)
Follow the dual-backend live-test method (memory: DB migration verification): run migration, drive the calendar tick in live mode, assert ledger rows/building completion after N ticks, run `tsc`, and check the client zone renders real data. Keep dev-data footprint minimal or disclose it.

## Recommended first step
Phase 1 + 2 together as an MVP slice: ledger + `clubAssets` (Stadium Grounds, Stands, Training Ground, Youth Academy first) with day-based timers, new clubs starting at Level 0 with 11 players, capacity-capped gate income. That alone creates the earn → upgrade → grow loop. Ground licensing and the away-fan incident model follow in Phase 4.
