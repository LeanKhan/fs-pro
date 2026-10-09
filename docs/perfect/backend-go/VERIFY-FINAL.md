# Independent verification — FINAL audit (open-play writes + challenges)

Verifier: independent subagent (adversarial). Date: 2026-10-09.
Repo: `C:\done\fs-pro`. New file (not appended) — cited from `STATUS.md`.
Environment: Go 1.24.5, Node v26.10.0, DB `fspro_playtest` (read-only). Go `:3227`,
Node `:3099`, same DB, shared owner session. Findings **[DB-backed]** unless
**[code-read]**.

## 1. Regression + security — **PASS, no S1**

```
go build ./... EXIT=0   go vet ./... EXIT=0   gofmt -l . (empty)
go test ./... -count=1  (no DATABASE_URL)  → all packages ok
go test ./... -count=1  (DATABASE_URL set) → all packages ok
contract-check → PASS: 162 route(s)
```

Live Go-vs-Node on the new writes — all **11/11 MATCH**:
- **anonymous** `POST /api/challenges`, `POST /api/challenges/{fx}/accept`,
  `POST /api/editions`, `POST /api/editions/{id}/entries/{club}`,
  `DELETE /api/editions/{id}/entries/{club}`, `GET /api/challenges/edition/{id}`
  → **`401 "Not logged in"` on both**.
- **non-owner** (signed-in, wrong club) on the same routes →
  **`403 "You do not manage this club"` on both**.

`policy.TestEveryHandlerRuleDeniesAnonymous` passes. D23/D24/D25 re-verified:
`TestSettlementGuardRolledBack`, `TestPlaceBidAtomicRolledBack`,
`TestPurchaseRolledBack` pass; anonymous `GET /transfers/scouted-shortlist/{id}`
→ `200` on both (D24 fixed).

## 2. Adversarial correctness of the new writes — **PASS except one S3 (atomicity)**

**Editions — PASS [code-read + rolled-back tests].**
- `CreateEdition` locks the competition `FOR UPDATE`, `EditionNumber = max+1`,
  inserts `draft`. `checkDates` guards the ordering + past-start.
- `Register` (`edition_service.go:403-461`): locks the season `FOR UPDATE`, runs
  the ordered eligibility predicate, **guarded fee debit**
  (`UPDATE Clubs … WHERE coalesce("Budget",0) >= $fee`, `RowsAffected` checked) +
  `entry_fee` ledger row, then an `Entries` upsert
  (`ON CONFLICT ("SeasonId","ClubId") DO UPDATE`). Double registration is refused
  by the `Already entered` rule; a `withdrawn`/`invited` row does **not** block
  re-registration (`edition_service.go:274-278`). All in one tx.
- `Withdraw` refunds only entries with `FeePaid > 0`, then zeroes `FeePaid`
  (`refundFees`, `:504-538`) — no double-refund; `running` editions cancel open
  challenges instead. `TestEligibilityAndRegisterRolledBack` covers open
  register, double-register refusal, fee debit + ledger + refund, maxClubs,
  invite-only, unpublished.

**Challenges — PASS for propose/accept/decline/cancel; one S3 on decline.**
- Scheduler: `dayKind` (week template + `YearStartDay`) and `findSlot`
  (first free cup day in `[today+1, lastDay]`, live fixtures block) match
  `world-calendar.ts` / `challenge.service.ts`; test asserts the accepted day is
  a cup day.
- `ApplyResult` (`challenge_service.go:783-915`): the once-only guard is
  `INSERT INTO "RankingResults" ("FixtureId",…) ON CONFLICT ("FixtureId") DO
  NOTHING` + `RowsAffected()` — and `RankingResults` has a **unique PK on
  `FixtureId`** (verified in `pg_indexes`), so a second application is a no-op.
  Forfeit scoring (`FORFEIT_GOALS = 3`), the `accepted → played` transition, both
  clubs locked `FOR UPDATE` in id order, `Rankings` rows via `applyMatchToRow`,
  Elo via `eloAfter`, XP via `grantXp` (+`LevelHistory`) — **all identical to the
  Node source** (`ranking.ts:35-74`, `ranking.service.ts:126-329`; `DEFAULT_ELO_K
  = 24`, `DEFAULT_XP_PER_MATCH = {30,15,5}`, `DEFAULT_LEAGUE_RULES` match). The
  rolled-back test asserts a forfeit writes **exactly 1** `RankingResults` row and
  an away 3-0 ranking row.
- `Propose`/`Accept`/`Decline`/`Cancel` are transactional with club locks and
  status guards; concurrent actions serialise and the second sees the new status.

**D27 — S3 — `Decline` forfeit result is not atomic with the status [code-read].**
`internal/openplay/challenge_service.go:589-623`: `refuse` sets
`ChallengeStatus='forfeited'`, `Played=true` inside the `Decline` transaction;
then `r.ApplyResult(...)` runs in a **separate** transaction (`:617-621`). If
`ApplyResult` fails (process/DB error between the two), the fixture is committed
`forfeited` with **no** `RankingResults` row and no Elo/XP, and a retry hits
`Challenge is forfeited` (`wrong-status`, 409) so the result is **permanently
lost**. The `RankingResults` PK guard prevents double-application, not this lost
window. Fix: run `refuse` + `ApplyResult` in one transaction (or make Decline
retry `ApplyResult` when status is already `forfeited`). No double-count path.

## 3. Census refresh — **117 real / 42 stub / 2 empty / 1 gate**

Independent contract walk + code stub-set + live probe (no 5xx; no REAL route
returning a stub message). By domain:

| domain | real | stub | | domain | real | stub |
|---|---:|---:|---|---|---:|---:|
| meta/users/managers/fixtures/awards/seasons | 32 | 0 | | facilities | 3 | 3 |
| clubs | 12 | 2 (+1 empty) | | play | 5 | 6 |
| players | 7 | 1 | | editions | **9** | **5** |
| calendar | 7 | 3 (+1 empty) | | challenges | **6** | **0** |
| places | 8 | 0 | | world | 2 | 3 |
| game | 2 | 4 | | competitionDefinitions | 3 | 3 |
| transfers | 7 | 3 | | atlas | 1 | 8 (+1 gate) |
| tiles | 1 | 0 | | program | 12 | 1 |

**Remaining stubs (42):** clubs.getClubPerformance, clubs.suggestLineup,
players.generatePlayers; calendar.{tickClock,healCalendar,simulateToDate};
game.{kickoffNew,enqueueMatch,rewatchMatch,getReplay};
transfers.{listPlayerForSale,scoutPlayerTransfer,requestBudgetIncrease};
facilities.{getMedicalStatus,squadRecovery,treatPlayer};
play.{playMatch,collectShop,bookMatch,getMatchPrep,saveMatchPlan,previewMatchPlan};
editions.{action,invite,eligibility,bracket,eligibleOpponents};
world.{endYear,advanceDay,performance};
competitionDefinitions.{create,update,archive};
atlas.{getAtlas,getChrome,search,getPlacement,listInvites,createInvite,foundCountry,foundTown};
program.tip.

## 4. Differential spot-checks — **4/4 MATCH**

`GET /api/challenges/club/{clubId}` → 0 diffs (the earlier `direction` diff is
resolved); `GET /api/editions/{id}` → 0 diffs; `GET /api/editions/club/{clubId}`
→ 0 diffs; `GET /api/editions` → 0 diffs. (Known justified diff, not re-run:
`editions/{id}/rankings` per-group rule metadata; pyramid group-rule resolution
not ported. Write paths verified via rolled-back tests, not HTTP.)

## 5. Readiness

- **No S1, no S2.** One S3 (D27) and the pre-existing S3 nits (nothing else new).
- **Read paths: 54/73 real + 2 empty = 56/73 (77 %) return 2xx**, high Node parity.
- **Write paths: 63/89 real (71 %).** Now includes the full owner-program market,
  5/8 transfer writes, editions create/register/withdraw, and all challenge
  lifecycle writes.
- **Still not end-to-end:** matches (`play.playMatch`, `game.kickoffNew`/replay),
  world progression (`world.endYear`/`advanceDay`, `calendar.tickClock`/`heal`/
  `simulateToDate`), transfers list/scout/budget, the atlas surface, facilities
  medical, and `editions.action`/`invite`. The world cannot advance and matches
  cannot be played.
