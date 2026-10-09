# Independent verification — owner-program market + transfers writes (B6)

Verifier: independent subagent (adversarial). Date: 2026-10-09.
Repo: `C:\done\fs-pro`. Supersedes nothing; continuations of `VERIFY-B5.md`.
Environment: Go 1.24.5, Node v26.10.0, DB `fspro_playtest` (read-only). Go `:3227`,
Node `:3099`, both against the same DB, shared owner session. Findings tagged
**[DB-backed]** (live, both servers) or **[code-read]**.

## 1. Regression + security — **PASS, no S1**

```
go build ./... EXIT=0   go vet ./... EXIT=0   gofmt -l . (empty)
go test ./... -count=1   (no DATABASE_URL)  → all packages ok
go test ./... -count=1   (DATABASE_URL set) → all packages ok
contract-check → PASS: 162 route(s)
```

- **D1 holds.** Live Go-vs-Node, anon + non-owner: `program.{browseManagers,
  signManager,signPlayer}` and `transfers.{purchase,placeBid,respondToOffer,
  getOffers}` → **`401 "Not logged in"` / `403 "You do not manage this club"` on
  both**. `policy.TestEveryHandlerRuleDeniesAnonymous` walks every handler route
  (skips only the two public ones) and passes.
- **`play.getPlayState`/`findOpponents` really are public in Node** —
  `route-policy.ts` has no entry (default GET public) and `play.router.ts:44-62`
  never calls `canManageClub`. Go is now public too (anon `200` on both). The
  doer's change **fixes** the B5 over-restriction; not a regression. Mechanism:
  `policy.IsPublicHandler` + `server.go:91` skips the guard for those two ids.
- **All S3 nits fixed [DB-backed]:** `users.getUser?populate=true` nested club keys
  now byte-identical to Node (no `LeagueCode/LeagueId`); `program.getProgram`
  `completed:true, reasons:[]` matches; `atlas.checkName` message `"Checked"`
  matches.

## 2. Money-write correctness (adversarial) — **one S2 (concurrency), rest PASS**

**Program market — race-safe [code-read + rolled-back tests].** `SignManager`
(`program/market.go:317-372`) and `SignPlayer` (`:518-566`) use
`SELECT … FOR UPDATE`, conditional `UPDATE … WHERE isEmployed=false AND ClubId IS
NULL` / `isSigned=false AND ClubId IS NULL` with `RowsAffected()` checks, and a
conditional debit `debitBudget` (`:570-577`, `WHERE coalesce("Budget",0) >= $2`).
`InterviewManager`/`ScoutPlayer` debit only when not already
interviewed/scouted, then update the `OwnerProgram.Scout` jsonb and write a
`TransferLedger` row — all in one `db.WithTx`. `SignPlayer` recomputes the club
rating after commit. `TestMarketRolledBack` (0-budget rejection, double-sign
rejection, release-to-pool) and `TestPurchaseRolledBack` pass.

**Transfer market — PASS sequentially, but D23 (S2) under concurrency.**
`ExecutePurchase`/`settleOffer` pre-check affordability/window **outside** the
transaction, then `settleTransfer` (`transfer/market.go:119-190`) debits
**unconditionally**:
```sql
UPDATE "Clubs" SET "Budget" = coalesce("Budget",0) - $2 … WHERE "_id" = $1   -- no `>= $2`
UPDATE "Players" SET … WHERE "_id" = $1                                     -- no `AND "ClubId" IS NULL`
```
With no conditional guard and no `FOR UPDATE`/row lock, two concurrent
purchases of the same free agent (or two concurrent accepts of one offer) both
pass the pre-check and both debit → **negative budget + duplicate
`TransferLedger` rows**; the player UPDATE also has no `ClubId IS NULL` guard.
The rolled-back test only exercises the sequential double-buy (caught by the
player's now-non-empty `ClubId`), not concurrency. Contrast the program market's
`debitBudget`, which is conditional. **[code-read; concurrency window not
live-proven — I do not run committing writes.]**

## 3. Differential vs Node (same DB) — **4/4 MATCH (+1 over-restriction)**

`GET program/{id}/managers` → **0 diffs**; `GET program/{id}/players` → **0 diffs**;
`GET transfers/offers?clubId` → **0 diffs**; `GET transfers/scouted-shortlist/{id}`
(owner) → **0 diffs**. *(browse* write the `OwnerProgram.Scout` browse log, as
Node does; additive only.)* HTTP `POST purchase`/`bids` differential not run
(cannot wrap an HTTP request in a DB rollback) → the Go rolled-back tests are the
evidence; mark **code-verified**.

## 4. Stub census refresh — **103 real / 56 stub / 2 empty / 1 gate**

Independent re-derivation (contract walk + code stub-set + live probe, no 5xx):

| domain | real | stub | empty/gate |
|---|---:|---:|---|
| meta/users/managers/fixtures/awards/seasons | 32 | 0 | – |
| clubs | 12 | 2 | 1 empty |
| players | 7 | 1 | – |
| calendar | 7 | 3 | 1 empty |
| places | 8 | 0 | – |
| game | 2 | 4 | – |
| transfers | **7** | **3** | – |
| facilities | 3 | 3 | – |
| play | 5 | 6 | – |
| editions | 1 | 13 | – |
| challenges | 0 | 6 | – |
| world | 2 | 3 | – |
| competitionDefinitions | 3 | 3 | – |
| atlas | 1 | 8 | 1 gate |
| tiles | 1 | 0 | – |
| program | **12** | **1** | – |
| **total** | **103** | **56** | **2 + 1** |

Remaining stubs (56): clubs.getClubPerformance, clubs.suggestLineup,
players.generatePlayers; calendar.{tickClock,healCalendar,simulateToDate};
game.{kickoffNew,enqueueMatch,rewatchMatch,getReplay};
transfers.{listPlayerForSale,scoutPlayerTransfer,requestBudgetIncrease};
facilities.{getMedicalStatus,squadRecovery,treatPlayer};
play.{playMatch,collectShop,bookMatch,getMatchPrep,saveMatchPlan,previewMatchPlan};
editions.{get,create,action,invite,eligibility,register,withdraw,rankings,bracket,
eligibleOpponents,clubEntries,getEntryPolicy,setEntryPolicy}; all 6 challenges;
world.{endYear,advanceDay,performance}; competitionDefinitions.{create,update,
archive}; atlas.{getAtlas,getChrome,search,getPlacement,listInvites,createInvite,
foundCountry,foundTown}; program.tip.

## Defect list (this round)

### D23 — S2 — transfer settlement has no conditional debit / move [code-read]
- **File:** `internal/transfer/market.go:138,146` (and `settleOffer` at `:356`).
- **Expected:** the program market's guarded pattern — `UPDATE … WHERE
  coalesce("Budget",0) >= $2` and `… WHERE "ClubId" IS NULL` with `RowsAffected`
  checks, or a row lock.
- **Actual:** unconditional `Budget - $2` and unconditional player move, after
  pre-checks that run outside the transaction.
- **Repro (reasoning):** two concurrent `POST /api/transfers/purchase` for one
  free agent, or two concurrent accepts of one offer → double debit (negative
  budget) + two `TransferLedger` rows. Sequential double-buy is rejected (test).

### D24 — S3 — `transfers.getScoutedShortlist` is over-restricted [DB-backed]
- **File:** `internal/transfer/handlers.go:144-147` (`requireClubParam`).
- **Expected (Node):** `route-policy.ts` has no `transfers.getScoutedShortlist`
  entry → default GET **public**; Node anon `200`.
- **Actual:** Go anon `401`, non-owner `403`. Owner path matches (0 diffs).

### D25 — S3 — `placeBid` is not atomic [code-read]
- **File:** `internal/transfer/market.go:255-289`. The `TransferOffers` row is
  inserted outside a transaction, then the AI answer runs `settleTransfer`
  (its own tx) and `finishOffer` (a separate `Exec`). A failure between leaves a
  `pending` offer with the player already moved. The duplicate-open-bid check
  (`:238-246`) is also a read outside a tx, so concurrent duplicate bids can pass.

### D26 — S3 — stale doc comments [code-read]
- `internal/program/handlers.go:1-4` still says the market writes are declared
  400 stubs; `internal/transfer/transfer.go:2-4` still says the negotiation/AI
  endpoints are stubs. Both are now real.

## Top 3 next items

1. **Match/game core** — `play.playMatch` sim, plan/prep/shop/book,
   `game.kickoffNew`/replay (+ sim-core client). Critical impact, XL.
2. **World progression** — `world.endYear`/`advanceDay`,
   `calendar.tickClock`/`heal`/`simulateToDate`. Critical, L–XL.
3. **Editions + challenges** (13 + 6 stubs) — high impact, M–L. (Then D23's
   conditional-debit fix, S, as a correctness prerequisite for the transfer
   market's concurrency safety.)
