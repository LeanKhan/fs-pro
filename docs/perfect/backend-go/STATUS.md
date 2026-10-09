# Go port — owner-facing status

Date: 2026-10-09. Authoritative for the current `apps/fs-pro-server-go` tree.
Evidence lives in `VERIFY-B0B1.md`, `VERIFY-B2.md`, `VERIFY-B3.md`,
`VERIFY-B5.md`; this file does not repeat it. All counts verified against the
real DB (`fspro_playtest`) with **both** the Go (`:3227`) and Node (`:3099`)
servers running.

## TL;DR

All **162** contract routes are registered with exact method/path/status and the
correct policy rule. **91 are real, 68 are declared stubs, 2 return a
shape-valid empty 200, 1 is a gate.** The S1 security hole is closed. The server
is currently a **read-capable, play-incapable** backend: you can browse
users/clubs/players/managers/fixtures/seasons/standings/awards/places/calendar
with high Node parity, but the core game loop (matches, transfers, open-play
editions, challenges, owner-program market steps, world progression) is stubbed
and cannot progress the world.

## Census — 162 routes

| domain | real | stub | empty 200 | gate | total |
|---|---:|---:|---:|---:|---:|
| meta | 1 | 0 | 0 | 0 | 1 |
| users | 15 | 0 | 0 | 0 | 15 |
| clubs | 12 | 2 | 1 | 0 | 15 |
| players | 7 | 1 | 0 | 0 | 8 |
| managers | 6 | 0 | 0 | 0 | 6 |
| fixtures | 4 | 0 | 0 | 0 | 4 |
| calendar | 7 | 3 | 1 | 0 | 11 |
| places | 8 | 0 | 0 | 0 | 8 |
| seasons | 5 | 0 | 0 | 0 | 5 |
| awards | 1 | 0 | 0 | 0 | 1 |
| game | 2 | 4 | 0 | 0 | 6 |
| transfers | 2 | 8 | 0 | 0 | 10 |
| facilities | 3 | 3 | 0 | 0 | 6 |
| play | 5 | 6 | 0 | 0 | 11 |
| editions | 1 | 13 | 0 | 0 | 14 |
| challenges | 0 | 6 | 0 | 0 | 6 |
| world | 2 | 3 | 0 | 0 | 5 |
| competitionDefinitions | 3 | 3 | 0 | 0 | 6 |
| atlas | 1 | 8 | 0 | 1 | 10 |
| tiles | 1 | 0 | 0 | 0 | 1 |
| program | 5 | 8 | 0 | 0 | 13 |
| **total** | **91** | **68** | **2** | **1** | **162** |

By HTTP verb: **73 GET → 43 real + 2 empty (45/73 = 62 % return 2xx; 28 stubbed)**;
**89 non-GET → 48 real, 40 stubbed, 1 gate (54 % real)**.

### Stubs grouped by domain (all declared `400`, except `game.enqueueMatch` `409`)
- **clubs (2):** getClubPerformance, suggestLineup. *(empty: getMediaFeed)*
- **players (1):** generatePlayers (gated behind `ENABLE_PLAYER_GENERATION`).
- **calendar (3):** tickClock, healCalendar, simulateToDate. *(empty: getWorldFeed)*
- **game (4):** kickoffNew, rewatchMatch, getReplay (`400`), enqueueMatch (`409`).
- **transfers (8):** purchasePlayer, placeBid, getOffers, respondToOffer,
  listPlayerForSale, scoutPlayerTransfer, getScoutedShortlist, requestBudgetIncrease.
- **facilities (3):** getMedicalStatus, squadRecovery, treatPlayer.
- **play (6):** playMatch (gate `409` then `400`), collectShop, bookMatch,
  getMatchPrep, saveMatchPlan, previewMatchPlan.
- **editions (13):** get, create, action, invite, eligibility, register, withdraw,
  rankings, bracket, eligibleOpponents, clubEntries, getEntryPolicy, setEntryPolicy.
- **challenges (6):** propose, respond, forClub, forEdition, getPolicy, setPolicy.
- **world (3):** endYear, advanceDay, performance.
- **competitionDefinitions (3):** create, update, archive.
- **atlas (8):** getAtlas, getChrome, search, getPlacement, listInvites,
  createInvite, foundCountry, foundTown. *(gate: foundClub → `409` naming gate
  or `400`)*
- **program (8):** tip, browseManagers, interviewManager, signManager,
  releaseManager, browsePlayers, scoutPlayer, signPlayer.

## Verification evidence

- `go build ./... && go vet ./... && gofmt -l .` → clean; `go test ./... -count=1`
  green **with and without** `DATABASE_URL`.
- `contract-check/check-contract.mjs` → `PASS: 162 route(s)`; my own independent
  contract walk = 162/162 (method/path/status); negative-control mock exits 1.
- **D1 security re-verified** (Go vs Node, same DB): anonymous
  `PATCH /api/world/settings`, `GET /api/play/{id}/inbox`, `GET /api/play/{id}/matchday`,
  `POST /api/facilities/{id}/upgrade`, `GET /api/program/{id}` → **all `401 "Not
  logged in"` on both**; non-owner → **`403 "You do not manage this club"` on
  both**. `policy.TestEveryHandlerRuleDeniesAnonymous` walks every handler route.
  **No S1 remains.**
- Differential vs Node: 17 of 20 sampled real routes MATCH semantically
  (floats tolerated); see open defects for the 3.

## Open defects by severity

- **S1 — none.**
- **S2 — none confirmed.** Every stub returns a declared status and valid error
  envelope; no route returns 2xx with wrong data.
- **S3 (4):**
  1. `users.getUser?populate=true` still returns unmodelled `Clubs.LeagueCode/
     LeagueId` — the D17 strip was applied to `internal/club` but not to
     `auth.PgClubStore.FindByUserID` (`internal/auth/club.go:29`, `SELECT *`).
     zod strips them; wire-only. **[DB-backed]**
  2. `program.getProgram` degraded state diverges: Go `completed:false,
     reasons:["program engine unavailable"]` vs Node `completed:true, reasons:[]`
     (contradicts the NOTES "exact MATCH" claim). **[DB-backed]**
  3. `atlas.checkName` `message` differs (`"Name check"` vs Node `"Checked"`);
     payload matches. **[DB-backed]**
  4. `play.getPlayState` and `play.findOpponents` now require club ownership
     (`internal/play/handlers.go:42-45,165` via `CanManageClub`) but are **public
     GET** in Node — anonymous Go `401` vs Node `200`. Over-restrictive, not a
     security hole; a logged-out read parity break. **[DB-backed]**

**Drift WARNs (Node emits the same bytes — contract/data, not Go bugs):**
nullable `AttackingClass`/`DefensiveClass` on `clubs.getClubs`; NULL `FixtureCode`
on fixtures; `real`-column float32 formatting (`36.77` vs `36.77000045776367`);
`Award.Type='club'` (not present in the sampled seasons → UNVERIFIED).

## Readiness verdict

- **Read paths: ~62 % (45/73 GET return 2xx) and high parity** on the routes that
  are real (users, clubs, players, managers, fixtures, seasons, standings,
  awards, places, calendar reads, competition-definitions, editions list,
  transfers window, world settings). A Vue client browsing these works.
- **Write paths: ~54 % real, but the gameplay core is not.** Matches
  (`playMatch`/`kickoffNew`/replay), the transfer market, open-play entries and
  rankings, challenges, the owner-program market steps, and world progression
  (`endYear`/`advanceDay`/`tickClock`) are stubs. **The world cannot advance and
  matches cannot be played through the Go server.** It is not a drop-in
  replacement yet.
- **What a client would see today:** works — Home/settings (GET), User profile,
  Club/Player/Manager browsers, Fixtures/Calendar/Season/Standings, Awards,
  Places, Transfer-window banner. Breaks with an error toast — Matchzone
  (kickoff/prep/plan), Transfer Market (buy/bid/offer), Open Play (editions),
  Challenges, Owner Program market steps, Atlas map, Media feed, Medical Centre,
  World end-year/advance-day. Silently degrades — Media feed and World feed show
  empty; `getProgram` shows a "program engine unavailable" reason.
- **Security/corruption:** no remaining S1/S2. The only corruption-class risks
  are the unmodelled-column leak (S3) and the program degraded-state mismatch
  (S3); neither can lose or corrupt stored data.

## Prioritized remaining work (client impact × effort)

| # | item | impact | effort |
|---|---|---|---|
| 1 | Match/game core: `play.playMatch` sim, plan/prep/shop/book, `game.kickoffNew`/replay (+ sim-core client) | critical | XL |
| 2 | World progression: `world.endYear`/`advanceDay`, `calendar.tickClock`/`heal`/`simulateToDate` | critical | L–XL |
| 3 | Transfers writes (purchase/bid/offers/list/scout/budget) | high | L |
| 4 | Editions entries/rankings/bracket + all 6 challenges | high | M–L |
| 5 | Owner-program market: tip, browse/interview/sign/release manager, browse/scout/sign player | high | L |
| 6 | Atlas map reads + founding/placement/invites (world-service dependent) | med-high | M–L |
| 7 | `clubs.getClubPerformance` / `suggestLineup` / `getMediaFeed` | medium | M |
| 8 | Facilities medical (status/recovery/treat) | low-med | S–M |
| 9 | `competitionDefinitions` create/update/archive | low | S |
| 10 | S3 parity nits (user club column strip, program degraded state, checkName message, play read over-restriction) | low | S |
