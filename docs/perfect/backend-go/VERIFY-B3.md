# Independent verification — `apps/fs-pro-server-go` B3 (+ D6–D14 re-verify)

Verifier: independent subagent (adversarial). Date: 2026-10-09.
Repo: `C:\done\fs-pro`. Prior report: `VERIFY-B2.md`.
Environment: Go 1.24.5, Node v26.10.0. **Postgres UP** at
`postgresql://fspro:superpassword@localhost:5434/fspro_playtest` with real data
(23 users, 61 clubs, 6084 players, 1061 managers, 4311 fixtures).

**Node DID boot** (`apps/fs-pro-server`, `npm run start-dev`, `PORT=3099`,
`ROLE=web`, `RATE_LIMIT=off`; `/healthz` 200 in ~21 s) and served every route
against the same DB. I ran the Go server (`:3213`) and Node (`:3099`) side by
side and semantically diffed parsed JSON. Findings below are tagged
**[DB-backed]** (proven against both live servers) or **[code-read]**.

---

## 1. D6–D14 re-verification — **ALL PASS**

- **D6 (youth gate) — PASS [code-read + unit tests].** `recruitYouthPlayers`
  now calls `youthRefusal` for non-admins (`internal/club/handlers.go:338`),
  which enforces Youth-Academy `Level >= 1` (`ClubAssets.AssetType='youth_academy'`),
  squad cap 28 (signed, non-retired) and the `scaled(24/tier)` cooldown off
  `TransferLedger` (`handlers.go:390-419`). Owners always recruit 1 (count only
  read when `isAdminUser`, `handlers.go:329-337`), youth are 16–18 via
  `GenerateYouth` (`player/generator.go:39-76`), and a `'youth_scouted'`
  TransferLedger row is written (`handlers.go:365-369`). Tests
  `TestYouthRefusalNoAcademy/FullSquad/Cooldown/Allowed` and
  `TestGenerateYouthAgeRange` pass. No wider bypass found.
- **D7 — PASS [code-read].** `getPlayerRating` error branch is now
  `Fail(400, err.Error(), nil)`; not-found stays `"Player not found!"`
  (`internal/player/handlers.go:220-227`).
- **D8 — PASS [code-read].** `removePlayerFromClub` passes the add message, so
  `remove` falsy → `"Player added to Club successfully"` (`club/handlers.go:175-211`).
- **D9 — PASS [code-read].** `"ClubId" <> $n` (`player/repository.go:95-98`),
  unit-pinned by `TestPlayerWhereExcludeClub`.
- **D10 — PASS [code-read].** `q.Has("competitionCode")` gates the filter
  (`player/handlers.go:247`, `player/service.go:35,59-62`).
- **D11 — PASS [code-read].** `boolQuery` accepts only `true`/`false`; anything
  else is absent (`player/handlers.go:112-119`, same in club/fixture/manager/season).
- **D12 — PASS [code-read].** stats `player` attaches lowercase `nationality`
  (`player/service.go:111`).
- **D13 — PASS [code-read].** `truthy`/`nullishValue`/`nullishString`
  (`player/handlers.go:73-110`), unit-pinned by `TestTruthyAndNullish`.
- **D14 — PASS [live].** `check-contract.mjs:116` now prints all ten domains.

---

## 2. Manifest + policy — **PASS**

Go server `/__routes`: **77 entries = 74 contract + health + root + dev manifest**.
My own independent walk of the compiled contract over all 10 domains:

```
contract routes (10 domains): 74; manifest subset: 74; total manifest: 77
INDEPENDENT-DIFF: PASS (0 diffs)
```

Doer's harness: `PASS: 74 route(s) match (meta, users, clubs, players, managers,
fixtures, calendar, seasons, awards, places).` **Negative control:** a mock
`/__routes` with a wrong `calendar.getClock` path + missing `fixtures.*` + a bogus
route exited **1** with 46 diffs. Every route is registered via
`Server.Register` → `policy.RuleFor(id, method)`; the router ids match the Node
`POLICIES` keys (unchanged 105-key table). PASS.

---

## 3. Live zod validation — **PASS with two contract/data exceptions (both affect Node too)**

I validated parsed payloads against the compiled zod `responses[200]` for my own
case list (32 cases) and ran the doer's `validate-live.mjs`. The 8 required
routes:

| route | Go | Node | notes |
|---|---|---|---|
| `GET /api/users/{id}?populate=true` | PASS | PASS | |
| `GET /api/clubs/all` | **FAIL** | **FAIL** | D19 (NaN→null `Attacking/DefensiveClass`) |
| `GET /api/clubs/{id}` | PASS | PASS | |
| `GET /api/players/all?isSigned=false` | PASS | PASS | |
| `GET /api/managers?populate=Club` | PASS | PASS | |
| `GET /api/fixtures?light=true` | **FAIL** | **FAIL** | D20 (`yellow-card` enum) |
| `GET /api/calendar/current` | PASS | PASS | |
| `GET /api/seasons` | PASS | PASS | |

Every zod outcome is **identical on Go and Node** — wherever Go fails, Node fails
with the same issue, so these are contract/data bugs, not Go regressions.
Doer's `validate-live.mjs` exits 0; it hardcodes `EXPECTED_DRIFT` for
`seasons.getSeason`/`clubs.getClubs` but not for `fixtures.getFixtures`/
`seasons.getSeasonFixtures` (same drift), and it never value-compares to Node
(D22). With mismatched id keys it also "PASS"es 400s served for `/undefined`.

---

## 4. Differential Go vs Node (same DB) — findings

Full run: 28 routes. Semantic diff (arrays keyed by `_id`, numeric tolerance
1e-6 relative so float32 formatting is separate from real diffs):

```
SUMMARY getDbStatus=MATCH getUser=DIFF getClubs=DIFF getClubs=DIFF getClubs=DIFF
getClub=DIFF getClub=DIFF getPlayers=FLOAT-FMT getManagers=MATCH getManagers=MATCH
getFixtures=DIFF getFixtures=DIFF getFixture=DIFF getScheduleSummary=MATCH
getCurrentCalendar=DIFF getClock=DIFF getDays=MATCH getSeasonReports=MATCH
getSeasonReport=MATCH getWorldFeed=DIFF getSeasons=DIFF getSeason=DIFF
getSeasonFixtures=DIFF getSeasonStandings=MATCH(empty) getSeasonAwards=MATCH
getPlaces=MATCH getCountries=MATCH getPlace=MATCH getPlaceByName=MATCH
```

- **MATCH:** meta, managers (×2), schedule-summary, days, season-reports (×2),
  awards, places (×4). **[DB-backed]**
- **FLOAT-FMT only:** `players.getPlayers` (123 diffs, all within float32 ε).
- **Real diffs:** the `getClock` values (D15), the outfield `getPlayerRating`
  value (D15), `seasons.getSeasonStandings` (D16, below), the `getWorldFeed` stub
  (D21), and the systematic extra-columns class (D17).
- The two WARN drift items the task named:
  - **`seasons.getSeason` Fixture.Events** — **Node ALSO emits `yellow-card`**.
    The DB holds `yellow-card`, `red-card`, `penalty-shootout`, none in
    `MatchEventSchema.type`; both servers fail the enum. Contract bug (D20).
  - **`clubs.getClubs` nullable `Attacking/DefensiveClass`** — both Go and Node
    emit `null` (Postgres NaN → JSON null), both fail `z.number()` (D19). Go now
    matches Node (the B2 NaN encoder-crash is fixed).
- **`getSeasonStandings` [DB-backed]:** for season `03485b2c…` (27 Rankings, 3
  groups, `CurrentStage=0`): Go returns **27 rows** interleaved across all groups
  with `Rank: null`; Node returns **10 rows** for one group (`9ff866ab…`) with
  `Rank: 1..10`. Materially different table (D16).

---

## 5. Stub honesty — **PASS (declared status/shape, documented)**

| stub | live behaviour | declared? |
|---|---|---|
| `calendar.tickClock` / `healCalendar` / `simulateToDate` | admin-gated → 401 anonymously; body is `Fail(400, "…is not available in the Go server yet")` [code-read] | yes (400) |
| `calendar.getWorldFeed` | `200` empty feed; zod **PASS**; omits optional `local` | yes (200) |
| `clubs.getClubPerformance` | `400 {"success":false,"message":"Club performance is not available…"}` | yes (400) |
| `clubs.suggestLineup` | club-gated; body `Fail(400, …)` [code-read] | yes (400) |
| `clubs.getMediaFeed` | `200 {"payload":[]}` | yes (200) |
| `players.generatePlayers` | admin-gated; `400` when disabled [code-read] | yes (200/400) |

No stub returns an undeclared status or a wrong-shape success body. `getWorldFeed`
and `getMediaFeed` silently degrade (empty) but cannot corrupt client state.

---

## 6. Regression — **PASS**

```
go build ./...   EXIT=0
go vet ./...     EXIT=0
gofmt -l .       (empty)
go test ./... -count=1   (no DATABASE_URL)  → all 19 packages ok
go test ./... -count=1   (DATABASE_URL set)  → all 19 packages ok
```
Server starts both with and without `DATABASE_URL` (with DB: `/healthz` 200;
without: 503). NB: `internal/integration/live_test.go` is smoke reads only
(logs counts, checks a key exists) — it does **not** assert values or compare to
Node, so it passed despite D15/D16.

---

## Defect list

### D15 — S2 — Postgres `int4`/`int2` columns are read as 0 by int helpers [DB-backed]
- **Files:** `internal/db/rows.go:73-114` (`normalizeValue` has no `int16`/`int32`
  case); `internal/calendar/handlers.go:36-47` (`intOf`); `internal/player/handlers.go:53-64`
  (`ageOf`); also `internal/place/service.go:143` (`intOf(place["WorldRevision"])`).
- **Repro (live, same DB):** `GET /api/calendar/clock` → Go
  `{currentDay:0,currentHour:0,dayLengthMinutes:1440}` vs Node
  `{currentDay:496,currentHour:14,dayLengthMinutes:48}` (the Calendars row is
  496/14/48). `GET /api/players/c8dd157b-…/rating` (ATT, Age 29) → Go
  `new_value:99750000` vs Node `107250000`; the GK (age-independent) matches.
  `getWorldFeed`'s `currentDay` is 0 for the same reason.
- **Impact:** wrong clock everywhere it is interpreted (also `setClock`'s
  DayLength default and `dayKind`), wrong player values when Age comes from the
  DB, wrong place-revision comparisons.
- **Fix:** add `int16`/`int32` → `int64` in `normalizeValue` (covers every
  helper), and/or add the cases to `intOf`/`ageOf`.

### D16 — S2 — `seasons.getSeasonStandings` diverges materially from Node [DB-backed]
- **Files:** `internal/season/repository.go:86-142`, `internal/season/handlers.go:83`.
- **Expected (Node `editionStandings`):** one group's table, `Rank` = position in
  group (10 rows for the probed season).
- **Actual:** all `StageIndex = CurrentStage` rows across every group, globally
  ordered, `Rank: null` (27 rows). Documented in NOTES as an "approximation", but
  the client's standings view shows a different set and order.

### D17 — S3 — `SELECT *` passthrough returns columns Node's Drizzle omits [DB-backed]
- **Files:** `internal/{club,fixture,calendar,season}/repository.go`.
- **Observed extras in Go:** `Clubs.LeagueCode/LeagueId`, `Fixtures.Week`,
  `Calendars.singleton`, `Seasons.Promoted/Relegated/Standings/Year/isFinished/isStarted`.
  All stripped by the non-passthrough zod schemas, so no client break — but
  `GET /api/seasons` is **698 KB vs Node 51 KB (13.6×)** because the whole
  `Standings`/`Logs` jsonb is shipped. Borderline S2 on payload cost.
- **Fix:** project the Node-modelled columns (or at least drop the large
  `Standings`/`Logs`/`Definition` blobs) for list reads.

### D18 — S3 — `real` values emitted as float64 expansions [DB-backed]
- **File:** `internal/db/rows.go:105-110` (`float32 → float64`).
- Go emits `36.77000045776367`, Node `36.77` — same float32, ~1e-7 relative;
  123 diffs on `/players/all`, 373 on `/clubs/all`. zod accepts both. Cosmetic,
  but a byte-level client diff. Fix (optional): `strconv.FormatFloat(f,'g',-1,32)` round-trip.

### D19 — S3 — `clubs.getClubs` zod FAIL on NaN `Attacking/DefensiveClass` [DB-backed]
- Both Go and Node emit `null` for NaN `real` columns on some clubs; `ClubSchema`
  declares `z.number()`. Go matches Node — **contract/data bug**, not a Go
  regression. Fix in the contract (`.nullable()`) or clean the data.

### D20 — S3 — Fixture event enum omits real event types [DB-backed]
- DB has `yellow-card`, `red-card`, `penalty-shootout`; `MatchEventSchema.type`
  (`packages/api-contract/src/schemas/fixture.ts:18-37`) omits them, so
  `getFixtures`/`getFixture`(played)/`getSeason`/`getSeasonFixtures` fail zod on
  **both** servers. Go matches Node. Contract bug.

### D21 — S3 — `getWorldFeed` stub [DB-backed]
- `internal/calendar/handlers.go:83-97` returns an empty feed (shape-valid,
  optional `local` omitted) vs Node's real feed. Declared + documented; its
  `currentDay` is wrong per D15.

### D22 — S3 — Harness weaknesses [code-read]
- `contract-check/validate-live.mjs`: only validates Go (no Node diff → D15
  invisible), `EXPECTED_DRIFT` misses `fixtures.getFixtures`/
  `seasons.getSeasonFixtures`, and with mismatched id keys it "PASS"es 400s for
  `/undefined`. `internal/integration/live_test.go` asserts no values.

---

## What must be fixed before B4

1. **D15 (blocker):** normalize `int16`/`int32` in `db.normalizeValue` (or every
   int helper). `getClock` is currently wrong for every install; player values
   and place-sync revisions are wrong when read from the DB. Add a DB-backed test
   asserting `getClock.currentDay == Calendars.CurrentDay` and a Node-diff for
   `getPlayerRating` on an outfield player.
2. **D16 (blocker):** port the grouping/rank rules for `getSeasonStandings`
   (one table per group, `Rank` within group) or return a declared 400 like the
   other unported services — the current output is a confidently wrong table.
3. **D17:** stop shipping `Standings`/`Logs`/`Definition` (and other unmodelled
   columns) on list reads; 13.6× bloat on `/api/seasons`.
4. **D19/D20:** fix the contract (nullable classes; extend the event enum) or the
   seeded data — both servers currently fail zod on real responses.
5. **D18:** decide whether to match Node's float32 string form (optional).
6. Strengthen `validate-live.mjs`/integration tests to diff against Node (or at
   least assert values), so D15/D16 cannot pass unnoticed again.

**Unverified (must still be checked with the running DB before B4):** all *writes*
(delete fixture/season/day, setClock persistence, place update/import/sync with a
live world service), award `populate=club-season`, and any route behind an admin
session (`tickClock`/`healCalendar`/`simulateToDate`/`generatePlayers`/
`suggestLineup`/`recruitYouthPlayers`) — I could not mint an admin session
read-only, so those were code-read only.
