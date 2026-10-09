# Go port — owner-facing status

Date: 2026-10-09 (updated after the owner-program-market + transfers-writes pass).
Evidence: `VERIFY-B0B1.md`, `VERIFY-B2.md`, `VERIFY-B3.md`, `VERIFY-B5.md`,
`VERIFY-B6.md`. Counts verified against the real DB with **both** Go (`:3227`) and
Node (`:3099`) running.

## TL;DR

All **162** contract routes are registered with exact method/path/status and the
correct policy rule. **103 are real, 56 are declared stubs, 2 return a
shape-valid empty 200, 1 is a gate.** No S1 remains; the one open money-integrity
risk (S2) is a concurrency gap in transfer settlement. New this pass: the whole
owner-program market and 5 of 8 transfer writes are real and match Node.
The server is **read-capable with a real squad/transfer/program-management
surface**, but still **play-incapable** — matches, world progression, and
open-play (editions/challenges) are stubbed.

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
| transfers | 7 | 3 | 0 | 0 | 10 |
| facilities | 3 | 3 | 0 | 0 | 6 |
| play | 5 | 6 | 0 | 0 | 11 |
| editions | 1 | 13 | 0 | 0 | 14 |
| challenges | 0 | 6 | 0 | 0 | 6 |
| world | 2 | 3 | 0 | 0 | 5 |
| competitionDefinitions | 3 | 3 | 0 | 0 | 6 |
| atlas | 1 | 8 | 0 | 1 | 10 |
| tiles | 1 | 0 | 0 | 0 | 1 |
| program | 12 | 1 | 0 | 0 | 13 |
| **total** | **103** | **56** | **2** | **1** | **162** |

By verb: **GET 73 → 47 real + 2 empty (49/73 = 67 % 2xx; 24 stubbed)**;
**non-GET 89 → 56 real, 32 stubbed, 1 gate (63 % real)**.

### Remaining stubs grouped (all declared `400`, except `game.enqueueMatch` `409`)
- **clubs (2):** getClubPerformance, suggestLineup. *(empty: getMediaFeed)*
- **players (1):** generatePlayers (gated by `ENABLE_PLAYER_GENERATION`).
- **calendar (3):** tickClock, healCalendar, simulateToDate. *(empty: getWorldFeed)*
- **game (4):** kickoffNew, rewatchMatch, getReplay; enqueueMatch (`409`).
- **transfers (3):** listPlayerForSale, scoutPlayerTransfer, requestBudgetIncrease.
- **facilities (3):** getMedicalStatus, squadRecovery, treatPlayer.
- **play (6):** playMatch (gate `409`→`400`), collectShop, bookMatch, getMatchPrep,
  saveMatchPlan, previewMatchPlan.
- **editions (13):** get, create, action, invite, eligibility, register, withdraw,
  rankings, bracket, eligibleOpponents, clubEntries, getEntryPolicy, setEntryPolicy.
- **challenges (6):** propose, respond, forClub, forEdition, getPolicy, setPolicy.
- **world (3):** endYear, advanceDay, performance.
- **competitionDefinitions (3):** create, update, archive.
- **atlas (8):** getAtlas, getChrome, search, getPlacement, listInvites,
  createInvite, foundCountry, foundTown. *(gate: foundClub → `409`/`400`)*
- **program (1):** tip (engine-backed; world-service unreachable).

## Verification evidence

- `go build/vet` clean, `gofmt -l .` empty, `go test ./... -count=1` green with
  and without `DATABASE_URL`; `contract-check` → `PASS: 162 route(s)`.
- **No S1.** Anon `401 "Not logged in"` / non-owner `403 "You do not manage this
  club"` match Node on every `program.*` market write and `transfers.{purchase,
  placeBid,respondToOffer,getOffers}`; `TestEveryHandlerRuleDeniesAnonymous`
  covers the whole handler set. `play.getPlayState`/`findOpponents` verified
  **public in Node** and now public in Go.
- Differential vs Node (same DB): `program/{id}/managers`, `program/{id}/players`,
  `transfers/offers`, `transfers/scouted-shortlist/{id}` → **all 0 diffs**;
  earlier MATCHes (clock, standings, seasons, editions.list,
  competitionDefinitions, users/clubs/players/managers/fixtures/awards/places)
  hold. Rolled-back DB tests cover the market/purchase write paths.

## Open defects by severity

- **S1 — none.**
- **S2 — none.** D23 (transfer settlement concurrency) is **FIXED**:
  `settleTransfer` now uses `SELECT ... FOR UPDATE` on the player and buying
  club plus a `RowsAffected`-checked conditional player move (`WHERE "_id"=$1
  AND "isRetired"=false AND "ClubId" IS NOT DISTINCT FROM $expectedSeller`) and
  conditional budget debit (`WHERE coalesce("Budget",0) >= $amount`), with
  `expectedSeller` = nil for a free-agent purchase and the offer's `ToClubId`
  for an accept. `TestSettlementGuardRolledBack` proves one ledger row and a
  refused second settlement; any lost race rolls back.
- **S3 (1):**
  1. `placeBid` not atomic (`internal/transfer/market.go`): offer row inserted
     outside a tx, AI settlement/`finishOffer` separate; duplicate-bid check is a
     non-transactional read. **[code-read — known, not yet fixed]**
  - *(Fixed this pass:* `transfers.getScoutedShortlist` is now **public** like
    Node — D24; and the stale package doc comments were corrected — D26.)*

**Drift WARNs (Node-identical, contract/data):** nullable club classes; NULL
`FixtureCode`; `real` float32 formatting; `Award.Type='club'` (UNVERIFIED).

## Readiness verdict

- **Read paths: ~67 % (49/73 GET return 2xx) with high Node parity.** The real
  reads (users, clubs, players, managers, fixtures, seasons, standings, awards,
  places, calendar, competition-definitions, editions list, transfers window/
  offers/shortlist, world settings, the program market lists) match Node.
- **Write paths: ~63 % real, and now include real management writes** — squad
  add/remove, club/player/manager CRUD, facility upgrades, free-agent signings,
  the owner-program market (interview/sign/release manager, scout/sign player),
  and instant purchases/bids/offer responses. **Still missing the gameplay core:**
  matches, world progression (`endYear`/`advanceDay`), editions entries/rankings,
  and challenges. The world cannot advance and matches cannot be played.
- **What a client sees today:** works — browsing screens, club/player/manager
  management, facilities, the Owner Program market, the transfer window, buy/bid/
  respond flows. Breaks — Matchzone (kickoff/prep/plan), Open Play (editions),
  Challenges, World end-year/advance-day, Atlas map, Media feed, Medical Centre.
  Silently degrades — media/world feeds empty; `program.tip`.
- **Risk:** the S2 concurrency gap is the only money-integrity exposure; the S3
  shortlist over-restriction is a parity (not security) issue. No data-corruption
  path in normal single-request use.

## Prioritized remaining work (client impact × effort)

| # | item | impact | effort |
|---|---|---|---|
| 1 | Match/game core: `play.playMatch` sim, plan/prep/shop/book, `game.kickoffNew`/replay (+ sim-core client) | critical | XL |
| 2 | World progression: `world.endYear`/`advanceDay`, `calendar.tickClock`/`heal`/`simulateToDate` | critical | L–XL |
| 3 | Editions (13) + challenges (6) | high | M–L |
| 4 | Transfers remaining: list/scout/budget-request; **and D23's conditional-debit fix** | high | S–M |
| 5 | Atlas reads/founding (world-service dependent) | med-high | M–L |
| 6 | `clubs.getClubPerformance` / `suggestLineup` / `getMediaFeed` | medium | M |
| 7 | Facilities medical (3) | low-med | S–M |
| 8 | `competitionDefinitions` create/update/archive | low | S |
| 9 | S3 nits: shortlist over-restriction, `placeBid` atomicity, stale docs | low | S |
