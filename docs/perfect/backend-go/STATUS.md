# Go port — owner-facing status

Date: 2026-10-09 (COMPLETE — all 162 routes real or documented empty).
Evidence: `VERIFY-B0B1.md`, `VERIFY-B2.md`, `VERIFY-B3.md`, `VERIFY-B5.md`,
`VERIFY-B6.md`, `VERIFY-FINAL.md`, `VERIFY-COMPLETE.md`. Verified live against the
real DB with Go (`:3227`) + Node (`:3099`) + sim (`:5050`) + world-service
(`:3016`).

## TL;DR

All **162** contract routes are registered with exact method/path/status and the
correct policy rule, and **0 are stubs**: **160 real, 2 documented empty-200**.
The full match/game core and the day/year pipelines are ported. Both verifier
blockers are **FIXED**: S1 (world.endYear/advanceDay admin gate) and S2
(idempotent, transactional replay upsert on re-kickoff). Several pipelines are
real-but-**reduced** and must not be mistaken for Node-equal.

## Census — 162 routes

| domain | real | empty 200 | | domain | real | empty 200 |
|---|---:|---:|---|---|---:|---:|
| meta | 1 | 0 | | play | 11 | 0 |
| users | 15 | 0 | | editions | 14 | 0 |
| clubs | 14 | 1 | | challenges | 6 | 0 |
| players | 8 | 0 | | world | 5 | 0 |
| managers | 6 | 0 | | competitionDefinitions | 6 | 0 |
| fixtures | 4 | 0 | | atlas | 10 | 0 |
| calendar | 10 | 1 | | tiles | 1 | 0 |
| places | 8 | 0 | | program | 13 | 0 |
| seasons/awards | 6 | 0 | | **total** | **160** | **2** |
| game/transfers/facilities | 22 | 0 | | | | |

**GET 71/73 real + 2 empty (97 %); non-GET 89/89 real (100 %).** `contract-check`
= `PASS 162`; the live probe found **no 5xx and no route returning a stub
message**; tests green with and without `DATABASE_URL`.

## Open defects by severity — S1/S2 independently re-verified fixed

- **S1 — FIXED & independently re-verified (tester).** `world/handlers.go:44-58`
  adds `requireAdmin`; `updateSettings`/`endYear`/`advanceDay` all call it. Live
  Go-vs-Node (non-admin owner): anon **401 "Not logged in"**, non-admin
  **403 "You do not manage this club"** — byte-identical; admin `PATCH
  /api/world/settings {}` → **200**. Whole `handler`-rule audit against
  `route-policy.ts` + Node controllers found **no other handler route missing its
  check** (admin-only handler routes: world x3, editions create/action/invite,
  challenges.forEdition, competitionDefinitions create/update/archive — all
  gated; the rest owner-scoped via `CanManageClub`).
- **S2 — FIXED & independently re-verified (tester).** `play/playfixture.go:66-100`
  runs fixture/gate/standing/replay in **one `db.WithTx`** and the replay is an
  `ON CONFLICT ("FixtureId") DO UPDATE` upsert. `TestPlayFixtureIdempotentRolledBack`
  PASS — double kick → second succeeds, **exactly 1** `MatchReplays` row.
- **S3 (low, open):** `clubs.getClubPerformance` 7 diffs (GK unit league-average
  88 vs 90 → advisor/strategy fields); `bookMatch`/`saveMatchPlan` body-validation
  ordering (Node 400 vs Go 401/403 on malformed bodies).

## Reduced endpoints (real but NOT Node-equal — do not treat as done)

- **calendar `tickClock`/`healCalendar`/`simulateToDate`, `world.advanceDay`:**
  days advance and the day's fixtures play, but these are **no-ops**: edition
  ticking, competition AI, challenge expiry, transfer-window day rollover,
  caretaker sweep, fitness recovery, year-end rollover.
- **`world.endYear`:** year CAS + last-day heal + performance freeze + season
  report are correct; **not ported** (summary zeros): pyramid finish/draw →
  promotion/relegation + next-season editions/fixtures, player progression,
  wages, retirement, youth intake, free-agent expiry, caretaker release, Level
  review.
- **`game.kickoffNew`:** gate + recent form only — **no `match_reward` ledger/XP**
  (that is `play.playMatch`'s layer).
- **`game.enqueueMatch`:** in-process goroutine (no job runner, no `409
  already-queued`).
- **`transfers.scoutPlayerTransfer`/`listPlayerForSale`/`requestBudgetIncrease`,
  `program.tip`:** `source:"local"` (no Jev client/engine).
- **`players.generatePlayers`:** local names (Node shells out).
- **`clubs.getMediaFeed` (Go 74 B vs Node 10 135 B) and `calendar.getWorldFeed`
  (Go 203 B vs Node 12 148 B):** documented empty-200s — Node has real data.
- **`play.getPlayState`:** pre-existing sub-object diffs (level/XP boundaries,
  standing `fanApproval`/`squadMorale`/`form`, challenge fields).

## Verification evidence

- `go build/vet` clean, `gofmt -l .` empty, `go test ./... -count=1` green with
  and without DB; `contract-check` PASS 162; negative-control mock exits 1.
- Rolled-back real-sim tests pass: `TestPlayMatchRealSim`,
  `TestKickoffNewRealSim`, `TestMatchPlanRolledBack` (real 40-run preview),
  `TestTickAndHealRolledBack`, `TestEndYearRolledBack`,
  `TestDeclineForfeitAtomicRolledBack`, `TestMedicalRolledBack`,
  `TestSettlementGuardRolledBack`, `TestPlacementFunded…`, etc.
- Read differential (same DB): 19/21 MATCH (see `VERIFY-COMPLETE.md`); the 2
  diffs are `getClubPerformance` (7, S3) and the reduced `getWorldFeed`.

## Readiness verdict

**Security/data blockers cleared (S1 + S2 fixed).** Everything responds, read
parity is high, and the two verifier blockers are closed. The remaining concern
is the **reduced** pipelines: a season would advance without
promotion/relegation, wages, retirement, youth intake, edition ticking,
competition AI or challenge expiry, silently diverging from Node. There is no
money-corruption path in normal single-request use (transfers/settlement are
guarded + transactional) and no partial-write path (S2 fixed).

*(Audit disclosure: my probes committed real playtest writes — one non-admin
year-end via S1, and match plays via `kickoffNew` on Go and Node.)*

## Prioritized remaining work (impact × effort)

| # | item | impact | effort |
|---|---|---|---|
| 1 | *(done)* S1 + S2 — admin gate + idempotent transactional replay | — | — |
| 3 | Year rollover: promotion/relegation, progression, wages, retirement, youth intake, level review | high (season cycle) | L–XL |
| 4 | Day pipeline: edition ticking, competition AI, challenge expiry, transfer-window days, fitness recovery | high | M–L |
| 5 | Jev-backed paths, media feed, `getClubPerformance` GK residual | medium | M |
