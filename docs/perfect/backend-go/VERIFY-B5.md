# Independent verification — `apps/fs-pro-server-go` B5 (all 162 routes)

Verifier: independent subagent (adversarial). Date: 2026-10-09.
Repo: `C:\done\fs-pro`. Prior report: `VERIFY-B3.md`.
Environment: Go 1.24.5, Node v26.10.0. DB
`postgresql://fspro:superpassword@localhost:5434/fspro_playtest` (read-only).
Go ran on `:3227`, **Node on `:3099`** — both booted against the same DB, so the
differential findings are **[DB-backed]** unless marked otherwise. I authenticated
to both with an existing `Sessions` row (signed cookie; no writes).

---

## 1. Manifest completeness — **PASS (162/162), with a routing workaround**

`/__routes` = **165 entries = 162 contract + `/healthz`, `/`, `/__routes`**.
My own independent walk of the compiled contract over all 21 domains:

```
contract routes: 162; manifest: 165; matched: 162
by domain: clubs15 meta1 fixtures4 players8 managers6 calendar11 places8 awards1
seasons5 users15 game6 transfers10 facilities6 play11 editions14 challenges6
world5 competitionDefinitions6 atlas10 tiles1 program13
```

0 method/full-path/status diffs. Doer's harness: `PASS: 162 route(s) match (…all 21…)`.
**Negative control:** a mock with a wrong `transfers.getTransferWindow` path +
missing `clubs.*` + a bogus route exited **1** with 162 diffs.

**Editions routing workaround [DB-backed]:** `openplay/router.go:16-36` registers
`GET /api/editions` (real) and a single catch-all
`GET /api/editions/{rest...}` (`HandleRaw`) for the other 7 GET paths, which are
only recorded in the manifest via `ManifestOnly` (`httpapi/server.go:120-124`).
Live, **every** editions GET sub-path returns the identical
`400 "Fetching an edition is not available…"` — `editions.get`, `rankings`,
`bracket`, `clubEntries`, `getEntryPolicy`, `eligibility`, `eligibleOpponents`
are all served by one handler; the per-route stub funcs
(`openplay/handlers.go:78-90`) are dead code. So the requirement "each resolves
to the right handler" is **NOT met** — functionally harmless while all are
identical stubs (all declared 400), but these paths have no distinct mux pattern
to hang real behaviour on (S3, see D3 below).

---

## 2. Differential Go vs Node (same DB) — real routes MATCH except 4

Semantic diff + zod on both sides (float32 formatting separated from real diffs):

| route | verdict |
|---|---|
| `meta.getDbStatus` | MATCH |
| `transfers.getTransferWindow` | **MATCH** (zod PASS) |
| `world.getSettings` | DIFF — `regionTowns` value (D5) |
| `world.updateSettings` (PATCH) | **STATUS-DIFF: Go 200 vs Node 401/403** (D1) |
| `editions.list` | DIFF — different rows/fields/message (D2) |
| `competitionDefinitions.list` / `get` | DIFF — `definition`/`latestEdition` always null (D3) |
| `tiles.getTile` | both 400 (world-service down); error body differs (D6); happy path **UNVERIFIED** |
| `clubs.getClubs`, `clubs.getClub` | MATCH / FLOAT-FMT; zod FAIL **identically** (nullable classes, D-drift) |
| `fixtures.getFixtures?light=true` | MATCH; zod FAIL **identically** (`FixtureCode` null, D-drift) |
| `fixtures.getFixture`, `getScheduleSummary` | MATCH (zod PASS) |
| `awards`, `seasons`, `getSeason`, `standings` | MATCH (zod PASS) |
| `players`, `managers`, `calendar.getClock` | MATCH (zod PASS) |
| `atlas.checkName` | DIFF — Go 200 without `kind`; Node 400 (D4) |

**Known drift WARNs reproduced identically under Node:** nullable
`AttackingClass`/`DefensiveClass` on `clubs.getClubs` (`payload[31].DefensiveClass
null`, both) and NULL `FixtureCode` on `fixtures.getFixtures`
(`payload[12].FixtureCode null`, both). `Award.Type='club'` **not reproduced**
(the sampled seasons only contain `Type='player'`) → UNVERIFIED.

D15–D18 fixes hold under Node: `getClock` 496/14/48, `getSeasons` ~51 KB,
`getSeasonStandings` 10 rows/Rank 1..10 — all MATCH.

---

## 3. Stub honesty + safety — **FAIL on access control (D1)**

I probed 80 endpoints (signed owner cookie where club-scoped). **Every stub
returns a declared status with a clear message and a valid envelope; zero
200-with-zodFAIL.** Program (13), play (collectShop/bookMatch/prep/plan),
game (kickoffNew/rewatch/getReplay), transfers writes, editions writes,
challenges, world endYear/advanceDay, calendar tick/heal/simulate,
competitionDefinitions writes, facilities medical, `getClubPerformance`,
`suggestLineup` → all declared `400`; `enqueueMatch` → declared `409`.
`getMediaFeed`/`getWorldFeed` → shape-valid empty `200`. `playMatch` reproduces
**409 then 400**: the small squad returned `409 "…at least 11 players"`; the
11-player owner returned the declared `400` after the gate. `foundClub` returns
the declared `409` naming gate.

**But four REAL write/read handlers behind `handler`-policy rules have no access
check** — see D1. They are exploitable and were proven live (anonymously) without
performing a write.

---

## 4. Policy on new routes — **table PASS, enforcement FAIL for `handler` rules**

Programmatic `POLICIES` (Node) vs `policy.Table` (Go): **105/105 identical**
(`POLICY-DIFF: PASS`), so every route id resolves to the correct rule. Spot-check
denials returned the exact Node status/message: `403 "Admins only"` (transfers
`setTransferWindow`, atlas `foundCountry`/`foundTown`, `game.enqueueMatch`,
`calendar.tickClock/heal/simulate`), `403 "You do not manage this club"`
(transfers club-scoped with a non-owner), `401 "Not logged in"` (anonymous).
`world.*`/`editions.*`/`challenges.*`/`competitionDefinitions.*` are `handler`
as in Node; `atlas.getChrome`/`search`/`tiles.getTile` public; `atlas.foundClub`
signedIn — all match.

The defect is that Go's `handler` rule means "allowed" and the handlers must
check access themselves (`policy.go:77-85`) — four real ones don't (D1). Node's
handlers do.

---

## 5. Regression — **PASS**

```
go build ./...  EXIT=0    go vet ./...  EXIT=0    gofmt -l .  (empty)
go test ./... -count=1  (no DATABASE_URL)  → all packages ok
go test ./... -count=1  (DATABASE_URL set) → all packages ok
```

---

## Defect list

### D1 — S1 — `handler`-rule real endpoints have no access check (auth bypass)
**[DB-backed]**
- **Files:** `internal/policy/policy.go:77-85` (`Handler` returns `Allowed` before
  any identity check) is the enabler; the handlers that never implement the check:
  - `internal/world/handlers.go:40-50` `updateSettings` (write)
  - `internal/facilities/handlers.go:48-66` `startUpgrade` (write; debits budget)
  - `internal/facilities/handlers.go:69-89` `savePlacement` (write)
  - `internal/play/handlers.go:236-247` `markInboxRead` (write)
  - `internal/play/handlers.go:197-203, 250-256` `getInbox`/`getMatchday` (reads)
- **Repro [DB-backed, live]:**
  - `PATCH /api/world/settings {}` **anonymous → 200** (`"World settings updated"`);
    Node → `401 "Not logged in"` (owner → `403 "You do not manage this club"`).
    With any known key this call **writes** world settings (year length, transfer
    windows, week template…).
  - `GET /api/play/{club}/inbox` **anonymous → 200** with another club's messages;
    Node → 401.
  - `POST /api/facilities/{club}/upgrade {assetType:"__bogus__"}` **anonymous →
    400** (reached the handler; Node → 401). With a valid asset type this starts
    an upgrade and debits the club's budget.
  - `GET /api/play/{club}/matchday` anonymous → 200; Node → 401.
- **Impact:** any unauthenticated caller can mutate world settings, start
  facility upgrades (money), overwrite campus placement, mark any club's inbox
  read, and read any club's inbox/matchday. **Fix:** implement the Node
  `canManageClub`/`isAdmin` check inside each `handler`-rule real handler, or
  give these routes real `Club`/`Admin` policy rules.

### D2 — S2 — `editions.list` diverges from Node **[DB-backed]**
- **File:** `internal/openplay/handlers.go:25-76` (`listEditions`/`editionListItem`).
- **Repro:** `GET /api/editions` → Go first item `{code:"AMATEUR-CUP-E5",
  competitionName:"Amateur Cup", definition:{…}}`, message `"Editions"`; Node
  first item `{id:"d347096d…", code:"KLV-XPY-2030", title:"Season-…", status:
  "cancelled", editionNumber:5, published:true,…}`, message `"OK"`. Array length
  differs by 33; 480 value + 101 extra-key diffs. Both zod PASS, so the client
  renders **different editions in a different order**.

### D3 — S2 — `competitionDefinitions.list`/`get` return `definition:null`, `latestEdition:null` **[DB-backed]**
- **File:** `internal/openplay/handlers.go:143-165` (`competitionSummary` reads
  `c["Definition"]`, a column that does not exist — the `Competitions` table has
  `Entry/Stages/WinCondition/Rewards/Outcomes/Recurrence`, no `Definition`).
- **Repro:** `GET /api/competition-definitions` → Go `{"code":"EFL","definition":
  null,"latestEdition":null,…}` (2623 B); Node returns the assembled
  `definition:{Name,Description,Entry,…}` and a populated `latestEdition`
  (8259 B). The client's definition viewer gets an empty definition.

### D4 — S2 — `atlas.checkName` skips required-query validation and mis-validates **[DB-backed]**
- **File:** `internal/atlas/handlers.go:22-40`.
- **Repro:** `GET /api/atlas/check?name=Testville` (no `kind`) → **Go 200**
  `{ok:true}`; Node **400** (zod: `kind` is a required enum). With `kind=club`
  and a taken name both disagree on the message (`"…is already taken"` vs
  `"That name or code is taken"`). Missing/invalid `kind` silently falls into the
  place-conflict path. More broadly, Go never validates request queries, so any
  route with required params won't 400 like Node.

### D5 — S2 — `regionTowns` reads/writes the wrong column **[DB-backed]**
- **File:** `internal/world/handlers.go:71` (`"regionTowns": "CityDistricts"`),
  `:144` (same on read). Node (`world.router.ts:46,127`) maps `regionTowns` →
  `RegionCities`.
- **Repro:** Calendars row `CityDistricts=2`, `RegionCities=8`; Go
  `GET /api/world/settings` → `regionTowns:2`, Node → `regionTowns:8`. A
  `PATCH {"regionTowns":n}` writes `CityDistricts` (data corruption).

### D6 — S3 — `world.updateSettings` empty/unknown patch returns a zeroed view **[DB-backed]**
- **File:** `internal/world/handlers.go:100-116` — the no-op path calls
  `settingsView` on a **partial projection** (`_id,CurrentDay,YearStartDay`).
- **Repro:** `PATCH /api/world/settings {}` → `currentYear:0, autoRollover:false,
  transferWindows:[], weekTemplate:[], …` even though the real settings are
  populated. (Real-key patches return the full `r.Settings()` correctly.)

### D7 — S3 — `tiles.getTile` error body differs; happy path unverified **[DB-backed, partial]**
- **File:** `internal/tile/*`. World-service (port 3016) is **down**, so both
  return 400; Go returns `{"message":"The world service could not be reached",
  "payload":"…dial tcp 127.0.0.1:3016…"}`, Node `{"success":false,"message":
  "fetch failed"}`. Proxy pass-through of the real tile is **UNVERIFIED**.

### D8 — S3 — editions per-route stub funcs are dead; manifest advertises unrouted paths **[DB-backed]**
- **Files:** `internal/openplay/router.go:16-36`, `internal/openplay/handlers.go:78-90`.
- See Task 1. All 7 editions GET sub-paths share one catch-all → identical
  message; the individual handlers can never run.

### D9 — S3 — enum/validation gaps vs Node (contract-side) — see Task 2 drift; not Go regressions.

---

## Highest-value remaining work (ranked: client impact × feasibility)

| # | work item | client impact | effort | note |
|---|---|---|---|---|
| 1 | **D1 auth checks** on `handler`-rule real endpoints | critical (security/money) | **S** | add `canManageClub`/`isAdmin` to world/facilities/play handlers |
| 2 | **D2/D3 editions + competition-definitions real shapes** | high (open-play UI) | **M** | fix from the Node routers; `definition` needs assembling from `Competitions` columns |
| 3 | **program.\*** (13) owner-program engine | high (whole screen) | **L–XL** | port owner-program.service + markets (770 lines) |
| 4 | **play core** (`playMatch`, plan/prep, shop, book) + **game** sim (`kickoffNew`/replay) | high (the match loop) | **XL** | blocked on the sim-core/queue; largest single piece |
| 5 | **transfers writes** (purchase/bid/offers/list/scout/budget) | high (transfer market) | **L** | negotiation/AI/Jev services |
| 6 | **world.endYear/advanceDay** + **calendar tick/heal/simulate** | high (progression) | **L–XL** | needs the world-day/season-cycle engine; same engine |
| 7 | **atlas reads/founding** (getAtlas/chrome/search/placement/invites) | med-high (map UI) | **M–L** | founding + placement depend on world-service |
| 8 | **editions challenges** | medium | **M** | challenge state machine |
| 9 | **clubs.getClubPerformance / suggestLineup / getMediaFeed** | medium | **M** | analytics/advisor/media services |
| 10 | **facilities medical** (getMedicalStatus/squadRecovery/treatPlayer) | low-med | **S–M** | medical.service |
| 11 | **competitionDefinitions create/update/archive** | low (admin) | **S** | write path over existing validation |
| 12 | **tiles** | infra | **S** | depends on world-service being reachable, not new code |
| 13 | **D4–D7 parity fixes** (query validation, regionTowns, empty patch, tile error) | low | **S** | bundle into one pass |

**Do first:** D1 (security), then D2/D3 (they return confidently wrong data on
real endpoints today). Everything else is stub replacement, ordered by the table.
