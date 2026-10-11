# Independent verification — COMPLETE (all 162 real/empty)

Verifier: independent subagent (adversarial). Date: 2026-10-09.
Repo: `C:\done\fs-pro`. New file (not appended) — cited from `STATUS.md`.
Environment: Go + Node on the same DB (`fspro_playtest`), sim `:5050` up,
world-service `:3016` up. **[DB-backed]** unless **[code-read]**.

## 1. Regression + security — **FAIL: one S1 remains**

```
go build ./... EXIT=0   go vet ./... EXIT=0   gofmt -l . (empty)
go test ./... -count=1  (no DATABASE_URL)  → all packages ok
go test ./... -count=1  (DATABASE_URL set) → all packages ok
contract-check → PASS: 162 route(s)
```

Live Go-vs-Node security probes (18 cases):
- `play.playMatch`, `game.enqueueMatch`, `calendar.tickClock`/`heal`/
  `simulateToDate` → anonymous `401 "Not logged in"`, non-owner `403` — **MATCH**.
- `play.bookMatch` / `play.saveMatchPlan` with a malformed body → **Node `400`
  (ts-rest zod) vs Go `401`/`403`** (Go validates bodies only in the handler;
  benign ordering, valid bodies are accepted).
- **S1 (NEW): `world.endYear` and `world.advanceDay` have no admin check.**
  - **File:** `internal/world/handlers.go:65` (`endYear`) and `:77`
    (`advanceDay`). The route-policy rule for both is `handler` (signed-in only),
    and unlike `updateSettings` (`:45-52`, which *does* gate on
    `auth.IsAdminByID`) these two call the pipeline directly.
  - **Repro [DB-backed]:** signed in as a **non-admin** owner (`EconomistP03`,
    `isAdmin=false`): `POST /api/world/end-year` → **Go `200` "Y10 ended"** (it
    committed a year rollover), **Node `403` "You do not manage this club"**.
    `world.advanceDay` is the same shape (code-read; not fired live to avoid a
    second write).
  - **Impact:** any signed-in user can end the year / advance the day — a
    destructive world mutation (year CAS, performance freeze, season report,
    scheduled fixtures played).

## 2. Census — **160 real / 0 stub / 2 empty / 0 gate**

Independent contract walk + live probe of all 162 (owner cookie): **no 5xx, no
route returns a stub message**; the only two non-2xx-by-design are 200-empties.

| domain | real | empty | | domain | real | empty |
|---|---:|---:|---|---|---:|---:|
| meta/users/managers/fixtures/awards/seasons | 32 | 0 | | play | 11 | 0 |
| clubs | 14 | 1 | | editions | 14 | 0 |
| players | 8 | 0 | | challenges | 6 | 0 |
| calendar | 10 | 1 | | world | 5 | 0 |
| places | 8 | 0 | | competitionDefinitions | 6 | 0 |
| game | 6 | 0 | | atlas | 10 | 0 |
| transfers | 10 | 0 | | tiles | 1 | 0 |
| facilities | 6 | 0 | | program | 13 | 0 |

**GET: 71/73 real + 2 documented empty (97 %); non-GET: 89/89 real (100 %).**

The two empty-200s are **reduced**, not Node-equal: `clubs.getMediaFeed`
(Go 74 B vs Node 10 135 B — Node has a real media hub) and
`calendar.getWorldFeed` (Go 203 B vs Node 12 148 B; Go omits the optional
`local`).

## 3. Adversarial correctness of the new core

**play.playMatch / game.kickoffNew — PASS, except one S2.**
- Rolled-back real-sim tests pass: `TestPlayMatchRealSim`, `TestKickoffNewRealSim`
  (score persisted, non-zero XP, `match_reward` ledger row, cooldown set, replay
  stored on `watch`), `TestSimulateMatch*`. Rewards/XP go through the
  `playMatch` layer; `PlayFixture` credits the home gate + recent form only.
- **S2 (NEW): the replay persist is not atomic and not an upsert.**
  - **File:** `internal/play/playfixture.go:58-98`. The fixture UPDATE, gate,
    standing and `MatchReplays` insert are **separate commits**, and the replay
    insert is a plain `db.InsertRow` (no `ON CONFLICT`).
  - **Repro [DB-backed]:** `GET /api/game/kickoff-new/{fixture}` where a
    `MatchReplays` row already exists → **Go `400` `duplicate key … "MatchReplays_
    FixtureId_unique"`**, while the fixture/Played/gate/standing writes already
    committed (partial state); **Node `200`** (it upserts —
    `MatchReplayRepository.ts:39` `onConflictDoUpdate`). Any re-kickoff of a
    played fixture hits this.

**Match plan (`getMatchPrep`/`saveMatchPlan`/`previewMatchPlan`/`bookMatch`) —
PASS.** `TestMatchPlanRolledBack` drives book → get → save round-trip (planSet
true) and a **real 40-run preview against the running sim**; `TestCheckPlan`,
`TestStyleHelpers` pass. Owner/admin via `CanManageClub`.

**world.endYear / calendar pipeline — functional but reduced (see §4).**
`TestEndYearRolledBack` (year CAS → Y1→Y2, `SeasonReports` row, second call null)
and `TestTickAndHealRolledBack` (fixture played on tick, heal repairs a past day)
pass, running the real sim.

**`clubs.getClubPerformance` residual — small.** 7 semantic diffs vs Node: the
**Goalkeeper unit's league average (Go 88 vs Node 90 over 12 peers)** cascades to
`advisorSummary.confidence/crisisLevel/headline/summary` and
`strategies['strat-tactics'].severity`. Att/Mid/Def averages, ranks, records,
form, topPlayers and weakestStarters match. (Down from 13; a peer best-GK
selection difference.)

## 4. Reduced / no-op endpoints (honesty list)

- **calendar `tickClock`/`healCalendar`/`simulateToDate`, `world.advanceDay`:**
  days advance and the day's scheduled fixtures are played, but these are
  **no-ops**: edition ticking, competition AI, challenge expiry, transfer-window
  day rollover, caretaker sweep, fitness recovery, and the year-end rollover
  (there is no `pausedForYearEnd`).
- **world.endYear:** year CAS + last-day heal + performance freeze + season
  report are correct; **not ported** (summary reports zeros): pyramid
  finish/draw → promotion/relegation + next-season editions/fixtures, player
  progression, wages, retirement, youth intake, free-agent expiry, caretaker
  release, Level review.
- **game.kickoffNew (`PlayFixture`):** gate + form only; **no `match_reward`
  ledger/XP** (that is the `playMatch` layer).
- **game.enqueueMatch:** runs the match in an in-process goroutine (no job
  runner; no `409 already-queued` state).
- **transfers.scoutPlayerTransfer / listPlayerForSale / requestBudgetIncrease,
  program.tip:** `source:"local"` (no Jev client / real engine; matches Node when
  Jev is down).
- **players.generatePlayers:** local names (Node shells to a child process).
- **clubs.getMediaFeed / calendar.getWorldFeed:** empty-200s (Node has real data).
- **play.getPlayState:** pre-existing sub-object diffs (club level/XP boundaries,
  standing `fanApproval`/`squadMorale`/`form`, challenge fields) noted in
  `NOTES.md`.

## 5. Differential spot-checks — **19/21 MATCH**

Re-confirmed MATCH: `users.getUser?populate`, `clubs/all`, `clubs/{id}`,
`fixtures?season&light`, `seasons`, `seasons/{id}`, `seasons/{id}/standings`,
`editions`, `editions/{id}`, `transfers/window`, `transfers/offers`,
`transfers/scouted-shortlist`, `program/{id}/managers`, `program/{id}/players`,
`world/settings`, `world/performance/{id}`, `calendar/clock`,
`game/replay/{id}/data`. DIFF: `clubs.getClubPerformance` (7, §3) and
`calendar.getWorldFeed` (reduced).

## New defects

- **S1:** `world.endYear` / `world.advanceDay` missing the admin check
  (`world/handlers.go:65,77`). Fix: gate on `auth.IsAdminByID` like
  `updateSettings`.
- **S2:** `game.kickoffNew` replay insert not an upsert + non-atomic persist
  (`play/playfixture.go:58-98`) → duplicate-key 400 after partial commit. Fix:
  `ON CONFLICT ("FixtureId") DO UPDATE` and wrap the persist in one transaction.
- **S3:** `clubs.getClubPerformance` GK peer-average residual;
  `bookMatch`/`saveMatchPlan` body-validation ordering (Node 400 vs Go 401/403).

## Unintended writes during this audit (disclosed)

The probes committed real writes on the playtest DB: (a) the **non-admin year-end**
via the S1 above (Go `endYear`, Y10→Y11 — plus its performance freeze / season
report); (b) `game.kickoffNew` matches played by **Node** (`d27d978e…`) and by
**Go** (`e5f6968b…`), and a partial re-kick of `d27d978e…` that re-applied the
fixture/gate before failing on the duplicate replay. All are ordinary game
writes; the year rollover is the one that should not have been possible.

## Readiness verdict

**Not yet safe to point the Vue client at it.** All 162 routes respond and read
parity is high, but two blockers: **S1** (any signed-in user can end the year)
and **S2** (re-kick a played fixture → partial write + 400). Beyond those, the
world/year pipelines are reduced, so seasons advance without promotion/relegation,
wages, retirement, youth intake, edition ticking, competition AI or challenge
expiry — a client driving a season would silently diverge from Node. Fix S1 and
S2 first; the reduced pipelines are a scope/product decision, not a crash.

## Prioritized remaining work

1. **S1** — admin-gate `world.endYear`/`advanceDay` (S).
2. **S2** — upsert + transaction the match replay persist (S–M).
3. **Year rollover** — promotion/relegation, player progression, wages,
   retirement, youth intake, level review (L–XL).
4. **Day pipeline** — edition ticking, competition AI, challenge expiry,
   transfer-window days, fitness recovery (M–L).
5. **Jev-backed paths + media feed + `getClubPerformance` GK residual** (M).

---

# Re-verification (S1 / S2 fixes) — appended 2026-10-09

Adversarial re-check of the two blockers I raised. **Both verified fixed.**

## S1 — verified FIXED (DB-backed + code-read)
- **Source:** `internal/world/handlers.go:44-58` adds `requireAdmin` (401 anonymous
  / 403 `"You do not manage this club"`), and `updateSettings:60-63`,
  `endYear:76-80`, `advanceDay:91-95` all call it.
- **Live (non-admin owner `EconomistP03`, `isAdmin=false`):**

  | route | anon | non-admin | admin |
  |---|---|---|---|
  | `POST /api/world/end-year` | Go 401 = Node 401 | Go 403 = Node 403 | code-read (requireAdmin) |
  | `POST /api/world/advance-day` | Go 401 = Node 401 | Go 403 = Node 403 | code-read |
  | `PATCH /api/world/settings {}` | Go 401 = Node 401 | Go 403 = Node 403 | **Go 200** (proves admin passes) |

  (Admin `endYear`/`advanceDay` were not fired live to avoid committing a
  rollover; the shared `requireAdmin` gate is the same code path.)
- **Whole handler-rule audit (not accepting the doer's word):** I grepped
  `route-policy.ts` + the Go `policy.Table` + every Go handler against Node's
  controller access checks. Node's handler routes that require admin are
  `world.updateSettings/endYear/advanceDay` (`world.router.ts:75,148,192`),
  `editions.create/action/invite` + `challenges.forEdition` (`open-play.router.ts`
  `requireAdmin`), and `competitionDefinitions.create/update/archive`
  (`competition-definitions.router.ts:124,139,153`). **All are now admin-gated in
  Go**; every other handler route is owner-scoped via `canManageClub` in Node and
  `auth.CanManageClub` in Go; `atlas.foundCountry/foundTown` are covered by the
  `admin` policy rule. **No remaining handler route lacks its check.**

## S2 — verified FIXED (DB-backed + rolled-back test)
- **Source:** `internal/play/playfixture.go:66-100` — the fixture UPDATE, gate,
  standings and replay now run in **one `db.WithTx`**, and the replay write is
  `INSERT … ON CONFLICT ("FixtureId") DO UPDATE` (upsert), matching Node's
  `MatchReplayRepository.ts:39`.
- **Test:** `TestPlayFixtureIdempotentRolledBack` **PASS** — it calls
  `PlayFixture` twice on the same fixture inside a rolled-back tx, asserts the
  second succeeds with `Played=true` and a score, and that `MatchReplays` has
  **exactly 1** row.
- A live double-kick was **not** run this pass (no unplayed owned fixture was
  available for the harness session, and a live kick commits); the rolled-back
  test + the single-transaction/upsert source is the proof.

## Regression — PASS
`go build`/`vet` clean, `gofmt -l .` empty, `go test ./... -count=1` green **with
and without** `DATABASE_URL`; `contract-check` → `PASS: 162 route(s)`.

## Census — **160 real / 0 stub / 2 empty / 0 gate**
Independent 162-route probe: 0 stub messages, 0 5xx, 0 unreachable; the 2 empties
are `clubs.getMediaFeed` and `calendar.getWorldFeed`.

## Residual risks (unchanged; not defects)
1. **Reduced season cycle** — `world.endYear` does not do promotion/relegation,
   progression, wages, retirement, youth intake or level review; the day pipeline
   does not do edition ticking, competition AI, challenge expiry, transfer-window
   days or fitness recovery. A season would silently diverge from Node.
2. **Reduced reads** — `clubs.getMediaFeed` / `calendar.getWorldFeed` are
   empty-200s; `clubs.getClubPerformance` has 7 residual diffs (GK peer-average).
3. **Local (non-Jev) fallbacks** — `transfers.scout/list/budget`, `program.tip`.
   (No S1/S2; no money-corruption path in normal single-request use.)
