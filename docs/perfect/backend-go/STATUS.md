# Go port — owner-facing status

Date: 2026-10-09 (FINAL — after the open-play writes / challenge-lifecycle pass).
Evidence: `VERIFY-B0B1.md`, `VERIFY-B2.md`, `VERIFY-B3.md`, `VERIFY-B5.md`,
`VERIFY-B6.md`, `VERIFY-FINAL.md`. Counts verified against the real DB with both
Go (`:3227`) and Node (`:3099`) running.

## TL;DR

All **162** contract routes are registered with exact method/path/status and the
correct policy rule. **117 are real, 42 are declared stubs, 2 return a
shape-valid empty 200, 1 is a gate.** No S1 and no S2 remain. The server now
covers the full read surface, account/roster management, the owner-program
market, 5/8 transfer writes, the editions register/withdraw path, and the whole
challenge lifecycle — but the **gameplay core (matches, world progression) is
still stubbed**, so the world cannot advance and matches cannot be played.

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
| editions | 9 | 5 | 0 | 0 | 14 |
| challenges | 6 | 0 | 0 | 0 | 6 |
| world | 2 | 3 | 0 | 0 | 5 |
| competitionDefinitions | 3 | 3 | 0 | 0 | 6 |
| atlas | 1 | 8 | 0 | 1 | 10 |
| tiles | 1 | 0 | 0 | 0 | 1 |
| program | 12 | 1 | 0 | 0 | 13 |
| **total** | **117** | **42** | **2** | **1** | **162** |

By verb: **GET 73 → 54 real + 2 empty (56/73 = 77 % 2xx; 17 stubbed)**;
**non-GET 89 → 63 real, 25 stubbed, 1 gate (71 % real)**.

### Remaining stubs grouped (all declared `400`, except `game.enqueueMatch` `409`)
- **clubs (2):** getClubPerformance, suggestLineup. *(empty: getMediaFeed)*
- **players (1):** generatePlayers (gated by `ENABLE_PLAYER_GENERATION`).
- **calendar (3):** tickClock, healCalendar, simulateToDate. *(empty: getWorldFeed)*
- **game (4):** kickoffNew, rewatchMatch, getReplay; enqueueMatch (`409`).
- **transfers (3):** listPlayerForSale, scoutPlayerTransfer, requestBudgetIncrease.
- **facilities (3):** getMedicalStatus, squadRecovery, treatPlayer.
- **play (6):** playMatch (gate `409`→`400`), collectShop, bookMatch, getMatchPrep,
  saveMatchPlan, previewMatchPlan.
- **editions (5):** action, invite, eligibility, bracket, eligibleOpponents.
- **world (3):** endYear, advanceDay, performance.
- **competitionDefinitions (3):** create, update, archive.
- **atlas (8):** getAtlas, getChrome, search, getPlacement, listInvites,
  createInvite, foundCountry, foundTown. *(gate: foundClub → `409`/`400`)*
- **program (1):** tip (engine-backed; world-service unreachable).

## Verification evidence

- `go build/vet` clean, `gofmt -l .` empty, `go test ./... -count=1` green with
  and without `DATABASE_URL`; `contract-check` → `PASS: 162 route(s)`.
- **No S1.** Live Go-vs-Node on every new write: anonymous `401 "Not logged in"`,
  non-owner `403 "You do not manage this club"`, byte-identical to Node.
  `TestEveryHandlerRuleDeniesAnonymous` covers the handler set.
- Differential (same DB): `challenges/club/{clubId}`, `editions/{id}`,
  `editions/club/{clubId}`, `editions` → **all 0 diffs**; earlier MATCHes hold.
- Rolled-back DB tests cover the money/result write paths (purchase/settlement
  guards, placeBid atomicity, market, edition register/withdraw, challenge
  propose/accept/decline/forfeit); the ranking/Elo/XP maths is byte-identical to
  `ranking.ts`/`ranking.service.ts`.

## Open defects by severity

- **S1 — none.**
- **S2 — none.**
- **S3 — none.** **D27 FIXED:** a forfeit `Decline` now commits the
  `ChallengeStatus` and runs `applyResult` in **one** transaction
  (`applyResultTx`), so a failure rolls both back — the challenge stays
  `proposed` and is retryable. `db.WithTx` now uses a savepoint when the
  querier is already a transaction, so a composed write can fail without
  poisoning the caller. `TestDeclineForfeitAtomicRolledBack` proves a forced
  `applyResult` failure leaves status `proposed`, `Played=false` and zero
  `RankingResults`, then a retry applies exactly one result and a second attempt
  is refused (`wrong-status`).
  - Pre-existing low nits: `editions.action`/`invite` stubbed (blocked on the Zod
    `buildDefinition` snapshot); `editions/{id}/rankings` group-rule metadata uses
    a fallback (`metric:"ppg"` vs Node's pyramid `"points"`) — rows/ranks match.

**Drift WARNs (Node-identical, contract/data):** nullable club classes; NULL
`FixtureCode`; `real` float32 formatting; `Award.Type='club'` (UNVERIFIED).

## Readiness verdict

- **Read paths: ~77 % (56/73 GET) 2xx with high Node parity.**
- **Write paths: ~71 % real (63/89).** Works end-to-end: accounts/auth, club/
  player/manager CRUD, squad add/remove, facilities upgrades, transfers window +
  purchase/bid/offer-response, the owner-program market, editions
  create/register/withdraw, and the full challenge propose/accept/decline/cancel
  lifecycle (with Elo/XP/standings on a forfeit).
- **Not playable:** matches (`play.playMatch`, `game.kickoffNew`/replay/enqueue),
  world progression (`world.endYear`/`advanceDay`, `calendar.tickClock`/`heal`/
  `simulateToDate`), transfers listing/scouting/budget, the atlas map, facilities
  medical. A client pointed at Go: browsing, squad/transfer/program management
  work; Matchzone, World end-year, Atlas, Media feed, Medical Centre error.
- **Risk:** none known — D27's lost-result window is closed (forfeit + result are
  one transaction); no money-corruption path (settlement is guarded +
  transactional).

## Prioritized remaining work (client impact × effort)

| # | item | impact | effort |
|---|---|---|---|
| 1 | Match/game core: `play.playMatch` sim, plan/prep/shop/book, `game.kickoffNew`/replay (+ sim-core client) | critical | XL |
| 2 | World progression: `world.endYear`/`advanceDay`, `calendar.tickClock`/`heal`/`simulateToDate` | critical | L–XL |
| 3 | Transfers remaining (list/scout/budget) | high | S-M |
| 4 | Atlas reads/founding (8, world-service dependent) | med-high | M–L |
| 5 | clubs analytics (3), facilities medical (3), editions action/invite/eligibility/bracket/opponents (5), competitionDefinitions writes (3), program.tip | medium→low | M/S |
