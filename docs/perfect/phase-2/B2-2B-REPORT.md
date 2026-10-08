# B2-2B-REPORT.md — phase 2, Batch 2, Agent 2B

**Branch:** `p2/b2-2b` (worktree `.claude/worktrees/p2b2b`, from
`p2/integration` @ `59615d8`, i.e. after B2-2A). **Scope:** the Node owner
model: migrations + backfills, founding (L1), the manager market (L4), the PLAY
squad gate (L5), the Level-1 pyramid trigger (L2) and the calls to the Go
program engine (PROGRAM-SERVICE-CONTRACT.md). No Go files and no client files
were edited; the world seed/restock and the Node name cut-over are 2C's and were
not touched.

---

## 0. Deliverables

| # | Deliverable | Path |
| --- | --- | --- |
| 1 | Migrations + backfills | `.../db/drizzle/migrations/0042_owner_program.sql`, `0043_places_culture.sql`, `db/drizzle/schema.ts` |
| 2 | Founding (L1) | `services/world/club-founding.service.ts` |
| 3 | Manager market (L4) | `services/program/manager-market.service.ts`, `manager-model.ts` |
| 4 | PLAY squad gate (L5) | `services/program/squad-gate.ts`, `services/play/play.service.ts`, `controllers/play/play.router.ts` |
| 5 | Level-1 trigger (L2) | `services/world/level-change.ts`, `services/play/rewards.ts` |
| 6 | Go program calls | `services/world/world-service.client.ts`, `services/program/owner-program.service.ts` |
| — | API (ts-rest + zod + policy) | `packages/api-contract/src/routes/program.ts`, `schemas/program.ts`, `index.ts`; `controllers/program/program.router.ts`, `routers/index.ts`, `middleware/route-policy.ts` |
| — | Program facts / free agents | `services/program/program-facts.service.ts`, `free-agent-market.service.ts`, `program-constants.ts` |
| — | Tests / scripts | `test/program-model.test.ts`, `program-client.test.ts`, `squad-gate.test.ts`; `scripts/checkProgramMigrations.ts`, `checkProgramConcurrency.ts`, updated `checkWorldPyramid.ts` |

### Files changed (summary)

```
 M controllers/game/functions.ts                 (MOTM null robustness, see §7)
 M controllers/play/play.router.ts               (409 for the gate)
 M db/drizzle/schema.ts                          (+2 tables, manager/place/player columns)
 M middleware/route-policy.ts                    (program.* rules)
 M routers/index.ts                              (register the program router)
 M scripts/checkWorldPyramid.ts                  (phase-2 founding + Level-1 join)
 M services/competitions/pyramid.service.ts      (L2: draw only Level >= 1)
 M services/competitions/world-competitions.service.ts (race-safe ensureCompetition)
 M services/play/play.service.ts                 (L5 gate)
 M services/play/rewards.ts                      (L2 trigger after XP)
 M services/world/club-founding.service.ts       (L1)
 M services/world/level-change.ts                (L2 trigger)
 M services/world/world-service.client.ts        (+program calls)
 M packages/api-contract/src/index.ts            (+program route + schema exports)
?? ... migrations/0042,0043, services/program/**, controllers/program/**, routes|schemas/program.ts,
   test/program-{model,client}.test.ts, test/squad-gate.test.ts,
   scripts/checkProgram{Migrations,Concurrency}.ts
```

---

## 1. Migrations (L3/L12)

`0042_owner_program.sql`

- `OwnerProgram` (per L8): `ClubId` PK, `Step`, `StepStars` jsonb, `ProgramXp`,
  `Chapter`, `ChapterData`, `DismissedTips`, `StartedAt`, `CompletedAt`,
  `updatedAt` — plus two columns the step predicates need and the spec's §9.1
  sketch has nowhere to persist:
  - `StartingBalance real` — the V1M–V5M draw the manager step measures the fee
    against (contract §1.2).
  - `Scout jsonb` — `{managerIdsBrowsed, interviewedManagerIds, scoutedPlayerIds}`
    (contract §1.2 `facts.scout`).
- `Managers` gains `Tactics, Motivation, Development, Discipline, Overall,
  Wage, SigningFee, ContractYears (default 0), ContractUntilYear`.
- `Players` gains `FreeAgentSince` + the free-agent partial index.
- `WorldSeed` (2C's ledger; the table ships with the schema).

`0043_places_culture.sql`

- `Places.CultureId text`. Cultures are **data in worldgen**, not DB rows
  (L12/§9.2), so there is deliberately **no FK constraint** — the column holds
  the worldgen culture id. A country carries its primary culture; a
  region/city/district inherits its country's.

Backfill (tested, see §8.1): every existing club gets `OwnerProgram` `'done'`
with `StartingBalance = Budget`; existing managers get deterministic attributes
from `hashtext(Key)` (40–84), a derived `Overall`, fee/wage from §5.3, and a
2-year contract when employed; existing free agents get a `FreeAgentSince`
anchor; the 11 starter countries get their `country_cultures.json` culture and
their regions/cities/districts inherit it.

---

## 2. Founding (L1)

`services/world/club-founding.service.ts`:

- removed the fixed `STARTING_BUDGET`, the owner-as-manager insert, `ManagerId`,
  the 16-player `createSquad`, the `placeInPyramid` call, and the now-dead
  squad helpers;
- draws `Budget = drawStartingBalance()` (uniform V1M–V5M in V100k bands,
  §5.1);
- inserts the `OwnerProgram` row at `Step='not_started'` with the drawn balance;
- the welcome inbox message states the draw in Villa (local `V1 M` format;
  2C's shared formatter will replace it);
- still creates the district/city/region/country, crest, campus, fans,
  reputation and news; sets `CultureId` on new regions/cities/districts when the
  country has one.

---

## 3. Manager market (L4)

`services/program/manager-market.service.ts`:

- **browse**: free managers (`isEmployed=false AND ClubId IS NULL`), attributes
  masked to a stable ±6 range, plus the true `signingFee`/`wage` and the
  post-interview `effectiveFee`; records the ids the owner opened.
- **interview**: pays `INTERVIEW_FEE = V25k` once per manager (idempotent),
  reveals exact attributes, records the interview; the sign fee drops 10%
  (`NEGOTIATION_BONUS`, §5.3).
- **sign**: one transaction — conditional `Budget >= fee` debit, conditional
  `Managers` hire (`isEmployed=false AND ClubId IS NULL`), `Clubs.ManagerId`
  set, ledger row. Two racing owners: exactly one wins.
- **release**: clears `Clubs.ManagerId`, returns the manager to the pool
  (`ContractYears=0`).

`manager-model.ts` holds the pure overall/fee/wage/mask arithmetic §5.3/§6.1.

## 3b. Free-agent market (the `players` step)

`services/program/free-agent-market.service.ts`: browse free agents with the
rating masked, scout for `SCOUT_FEE = V15k` (paid reveal, idempotent), and sign
at Value with the §6.4 two conditional writes (budget + still-unsigned) — the
same race-safety pattern; club rating is refreshed after commit. 2C's world
seed fills this pool.

---

## 4. PLAY squad gate (L5)

`services/program/squad-gate.ts`: `assertClubPlayable(clubId)` requires
`Clubs.ManagerId != null` **and** ≥11 signed non-retired players **and** ≥1 GK —
the exact minimum `default-lineup.ts` needs. Wired at the top of
`playMatch` (`play.service.ts`). `ProgramGateError` carries `status=409` and a
`code` (`no_manager`/`no_keeper`/`no_squad`) the advisor consumes;
`play.router.ts` maps it to 409. The pure decision (`gateProblem`) is unit-tested.

---

## 5. Level-1 pyramid trigger (L2)

`services/world/level-change.ts` gains `enterPyramidAtLevelOne(clubId)`:

- no-op unless the club is Level ≥ 1 (`levelForXp(XP) ≥ 1`) and has a country;
- **idempotency keys on a real pyramid entry** (`Entries` with `Division IS
  NOT NULL`), not on the program step — the `level1` step marks the program
  `done` itself, and a club that just reached Level 1 must still be placed once;
  `placeInPyramid` + the `(SeasonId, ClubId)` unique index are the second line
  of defence;
- runs the existing mid-season join, then marks `OwnerProgram` `done`;
- called after every XP write commits: from `payClub` (`rewards.ts`, so every
  match/reward path) and from the owner program's step advance.

`pyramid.service.ts` `drawPyramid` now draws **only clubs at Level ≥ 1** (L2),
so an unqualified Level-0 club is never dragged into a league; the first
Level-1 club of a country still creates the edition on the spot. This required
a race-safe `ensureCompetition` (`ON CONFLICT DO NOTHING` + re-read), because
concurrent Level-1 arrivals in one country all create the national league.

---

## 6. Go program calls (frozen contract)

`services/world/world-service.client.ts` adds `getProgramSteps`,
`evaluateProgramStep`, `nextProgramStep`, `programTip` (zod-parsed, non-2xx
throws). `services/program/owner-program.service.ts` builds `StepFacts` from
the DB (`program-facts.service.ts`), calls `/program/evaluate`, stores
`StepStars`/`ProgramXp`, credits the reward XP through the level-change seam
(L6) and advances via the contract's next-step order. `getProgramState` degrades
gracefully when the engine is unreachable; `advanceProgram` surfaces the error.
(`/program/simulate` is the Go simulator; 2A/4A call it, not Node.)

The client-facing ts-rest surface is `packages/api-contract/src/routes/program.ts`
(GET state, POST advance/tips/interview/sign/release/scout/loan/chapter) with
`schemas/program.ts`, `program.*` in `route-policy.ts`, and
`controllers/program/program.router.ts` registered in `routers/index.ts`.

---

## 7. Production fixes required by L2 (documented)

| File | Change | Why |
| --- | --- | --- |
| `pyramid.service.ts` | `drawPyramid` filters to Level ≥ 1 | L2/§7: the year-end draw and the first-time draw must not place Level-0 clubs |
| `world-competitions.service.ts` | `ensureCompetition` is race-safe | 50 concurrent Level-1 arrivals create one league, not 49 unique-violation errors |
| `controllers/game/functions.ts` | `MOTM` may be null | a side with no players produces no MOTM; keeps the fixture saveable |

---

## 8. Commands and output (R4)

All commands run from the worktree through **Windows Node** (`cmd.exe /c`),
scratch DBs on `localhost:5434`, `go` via Windows.

### 8.1 Migration backfill — dev-schema copy, before/after counts

```
DATABASE_URL=.../fspro_b2b2b_mig npx ts-node --transpile-only src/scripts/checkProgramMigrations.ts
```
```
before { clubs: 50, entries: 664, players: 1093, managers: 52, places: 63 }
after  { clubs: 50, entries: 664, players: 1093, managers: 52, places: 63 }
  ok  existing row counts unchanged (Clubs, Entries, Players, Managers, Places)
  ok  every existing club kept Budget, ManagerId, XP, name and code (table checksum identical)
  ok  50 OwnerProgram rows, all 'done'
  ok  all 52 managers backfilled with attributes, overall, fee and wage
  ok  144 free agents anchored with FreeAgentSince
  ok  11 starter countries resolved; 52 regions/cities/districts inherited a culture
  ok  re-running 0042 and 0043 is idempotent (guards hold)
9 checks passed
```
The copy is `CREATE DATABASE fspro_b2b2b_mig TEMPLATE fspro_b2e_dist` (current
schema + the 11 real countries + existing clubs/entries/players/managers).

### 8.2 The real apply path

```
DATABASE_URL=.../fspro_b2b2b_apply npx ts-node --transpile-only src/scripts/migration/apply-sql-migrations.ts
```
```
applied 0042_owner_program.sql
applied 0043_places_culture.sql
Applied 2 migration(s).
```
(0015–0041 pre-baselined in `SqlMigrations`; `OwnerProgram` = 50 rows,
`Places.CultureId` non-null = 63.)

### 8.3 50-racing level-up concurrency (exactly one entry each)

```
DATABASE_URL=.../fspro_b2b2b_conc npx ts-node --transpile-only src/scripts/checkProgramConcurrency.ts
```
```
  ok  50 Level-1 clubs created, each with a manager-step program
  ok  a running pyramid edition with one bottom-division pool exists
  ok  world-service stub listening on 127.0.0.1:63136
  ok  50 concurrent triggers produced exactly 50 entries, one per club
  ok  a second race left the entry count at 50 and every program at 'done'
5 checks passed
```

### 8.4 `checkWorldPyramid.ts` green

```
REALTIME_URL=off DATABASE_URL=.../fspro_b2b2b_pyr npx ts-node --transpile-only src/scripts/checkWorldPyramid.ts
```
```
  ok  fill order: district, city, region, country, then a new country
  ok  40 clubs founded, no AI rivals
  ok  reaching Level 1 entered all 40 clubs (none entered before)
  ok  2 pyramid edition(s): pool mates are scheduled against each other, on league days only
  ok  a 28-day season plays out
  ok  year end: 2 finished, 10 club(s) moved, every country redrawn
  ok  caretaker after time away; release frees the district slot for the next club
14 checks passed
```
The Go world-service and Go sim-service ran against the scratch DB / Rust
`sim_core.dll` for this check.

### 8.5 Server typecheck + unit tests

```
npm run tsc --workspace fs-pro-server      -> tsc (0 errors)
npm test --workspace fs-pro-server         -> Test Files 12 passed (12) | Tests 123 passed (123)
npm run build --workspace @repo/api-contract -> tsc (0 errors)
npm run build --workspace fs-pro-client    -> ✓ built in 12.86s
```

---

## 9. Acceptance criteria → evidence

| Criterion | Evidence |
| --- | --- |
| Migrations + tested backfill; existing clubs unchanged, program-complete | §8.1 (checksum + counts), §8.2 |
| Existing Places get a culture | §8.1 (11 starter countries + 52 inherited) |
| Founding: random V1M–V5M, no manager/squad/pyramid | §8.4 ("no manager at founding", "not entered before Level 1"), unit test `drawStartingBalance` |
| Manager market browse/interview/sign/release | `manager-market.service.ts`; `program-client.test.ts`; §8.4 uses the market path indirectly |
| Squad gate on PLAY | `test/squad-gate.test.ts`; gate wired in `play.service.ts` |
| Level-1 trigger, idempotent under concurrency | §8.3 (50 racing → 50 entries) |
| Go program calls per the frozen contract | `test/program-client.test.ts` (7), `program-service` zod parse |
| `checkWorldPyramid.ts` green | §8.4 |

## 10. Known gaps / hand-offs

- **2C owns**: the world seed/restock, the shared Villa formatter (the founding
  welcome line uses a local format), the Node name cut-over, wages/TTL and the
  L7 recovery tuning. `/program/:clubId/loan` is a deterministic stub
  (V250k for a V50k fee, contract §8.1) 2C may replace with the existing board
  request.
- **Chapters** (`getProgramChapter`) are minimal: the stored chapter plus a
  target string; the §12 predicates are a 2C/3C follow-up.
- `StepFacts.events` (`playBlocked`, `sessionMinutes`) default to false/0 until
  the client sends them; the tips that use them are the only ones not yet fed.
- The client-facing `/program` routes compile and are policed, but no client
  screen consumes them yet (Batch 3).
- `simulateProgram` was not added to the Node client: it is the 2A/4A simulator,
  not a production call.
