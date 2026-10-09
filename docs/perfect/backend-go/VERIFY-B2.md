# Independent verification — `apps/fs-pro-server-go` B2 re-verification (with D1–D5)

Verifier: independent subagent (adversarial). Date: 2026-10-09.
Repo: `C:\done\fs-pro`. This is a **separate file** (`VERIFY-B2.md`); my prior
B0/B1 report is `VERIFY-B0B1.md` and is unchanged.
Scope: re-verify the D1–D5 fixes, then verify batch B2 (clubs 15 + players 8 +
managers 6), plus regression.
Environment: Windows/PowerShell, Go 1.24.5, Node v26.10.0, `tsx`/`typescript`
present. **No Postgres (Docker down)** — every DB-dependent check is SKIP (reason
given). Server run at `PORT=3214`, `ENABLE_ROUTE_MANIFEST=true`.

Method: no trust in `NOTES.md`. I imported the real Node TS tables with `tsx`
and diffed them against the Go-embedded JSON; wrote my own contract-manifest
diff; live-hit every B2 route reachable without a DB; and ran the doer's harness
against a deliberately-wrong mock (negative control).

---

## 1. Re-verification of D1–D5 — **all PASS**

- **D1 (admin bypass) — PASS.** `policy.Enforce` now returns
  `Decision{Allowed:true}` for admins **before** the rule switch
  (`internal/policy/policy.go:94-98`), so `self`/`club`/`player`/`fixture` all
  short-circuit and no `Keep` is attached (admins are never field-stripped).
  Non-admins still get the exact Node deny paths. Genuine regression tests:
  `policy_test.go:210-235` (`TestAdminBypassesEveryRuleKind`, asserts `Allowed`
  **and** `len(Keep)==0` for every rule kind incl. body/query club sources) and
  `policy_test.go:237-245` (`TestAdminBypassOwnAccount`). Both PASS.
- **D2 (reset-email context) — PASS.** `requestPasswordReset` spawns its work on
  `context.WithTimeout(context.Background(), 30s)` (`internal/user/handlers.go:277-289`),
  not `r.Context()`. A repo-wide grep for `go func` finds only
  `handlers.go:111` (verification mail), `handlers.go:277` (reset mail) and
  `cmd/server/main.go:127` (listener) — **no other deferred work captures a
  request context**. `TestRequestPasswordResetSendsAfterResponse`
  (`handlers_test.go:379-387`) is real: `env.do` cancels the request context the
  instant `ServeHTTP` returns (`handlers_test.go:224-237`) and the test then
  waits for the mail to arrive. PASS.
- **D3 (welcome) — PASS.** `internal/httpapi/routes.go:10` is now
  `<p>Welcome to FS-PRO <i>Server</i></p> enjoy!` and `TestWelcome`
  (`server_test.go:49-59`) pins the literal string from `server.ts:151` instead
  of the server's own constant. PASS.
- **D4 (AddressCountry) — PASS.** `auth.PgClubStore.FindByUserID` now calls
  `injectAddressCountry` (`internal/auth/club.go:26-41,57-72`), attaching
  `AddressCountry` only when the FK resolves (matching Node's
  `...(addressCountry ? {...} : {})`). This covers `getUser?populate=true` /
  `addClubsToUser` / login. `TestMergeAddressCountry` PASS.
- **D5 (join doesn't block on mail) — PASS.** `sendVerificationAsync`
  (`handlers.go:101-121`) runs on a background context; join/resend/setEmail
  call it without awaiting (`:159`, `:355`, `:399`).
  `TestJoinDoesNotBlockOnSlowMailer` (500 ms mailer, asserts elapsed < 250 ms)
  and `TestJoinSendsVerificationAfterResponse` both PASS.

---

## 2. Route manifest + policy for the new domains — **PASS**

Started the server and fetched `/__routes` (48 entries = 45 contract + health +
root + dev manifest). I independently walked
`packages/api-contract/dist/index.js` (my own script, not the doer's) and diffed
method / full path / sorted status set for `meta.`, `users.`, `clubs.`,
`players.`, `managers.`:

```
contract routes (meta/users/clubs/players/managers): 45; manifest matched subset: 45
INDEPENDENT-DIFF: PASS (0 diffs)
```

**45 contract routes exactly** (1 meta + 15 users + 15 clubs + 8 players +
6 managers), verified against `/__routes`. `clubs.getClubPerformance` and
`clubs.suggestLineup` correctly declare `[200,400,404]`; `clubs.getClub` declares
`[200,404]`; `clubs.hireManager` `[200,400,401]`. `managers.getManagers` /
`managers.createManager` normalize to `/api/managers` (raw contract path
`/managers/`), matching the Go registration.

Doer's `contract-check/check-contract.mjs` against the live server:
`PASS: 45 route(s) match`. **Negative control:** I pointed it at a mock
`/__routes` with a wrong `clubs.getClubs` path, missing every `clubs.*` route and
a bogus `managers.bogus`; it exited **1** with 46 diffs. The harness genuinely
fails. (Cosmetic: `check-contract.mjs:116` still prints `(meta + users)` — see D14.)

Every route is registered through the policy guard: `httpapi.Server.Register`
computes `policy.RuleFor(id, method)` per route (`internal/httpapi/server.go:83-105`),
and the ids come straight from the routers (`internal/{club,player,manager}/router.go`),
which I verified match the Node `POLICIES` keys (the 105-key table diff from my
B0/B1 report is unchanged; all B2 keys were already present and correct).

---

## 3. B2 behaviour vs Node (code-reading; no DB) — **mostly PASS, divergences below**

**Clubs** (`internal/club/*` vs `controllers/clubs/*` + `drizzle/ClubRepository.ts`):
- `getClubs` default flags: ids → `withPlayersAndManager` defaults false, otherwise
  true; `unclaimed` skips relations — matches `club.router.ts:43-52`.
- `getClub` populate semantics (`typeof query.populate === 'string' && !== 'false'`)
  match `club.router.ts:76-77`; 404 not-found and 404-on-error bodies match.
- Column passthrough: DB column is literally `_id` (`schema.ts` `uuid('_id')`);
  Go `SELECT *` yields `_id` and `ScanOne` drops `mongoId`. `applyClubRelations`
  (`repository.go:174-196`) injects `AddressCountry` (when FK resolves),
  `Players` (only when requested, empty array otherwise) and `Manager` (only when
  requested and resolved) — mirrors `toClub` (`ClubRepository.ts:36-55`). Unit
  tests pin the empty-array/omit behaviour (`repository_test.go:5-45`).
- Rating recompute (`club/service.go:46-87`) matches `club.service.ts:121-150`:
  `AttackingClass = ATT + MID/2`, `DefensiveClass = GK + DEF/2`,
  `Rating = sum(avg)/count`, per-position `*_Rating`; `RefreshAll` batches of 25.
  `TestRatingUpdate`/`TestRatingUpdateEmpty` PASS.
- `hireManager` 401 semantics match: "already has a manager" → 401, other → 400;
  messages and payload identical (`club.router.ts:332-354`, `club.controller.ts:24-76`).
- `fireManager` and `deleteManager` record flows match, including Node's odd
  `type:'hired'` on the club departure record (`manager.router.ts:127`).
- `addManyPlayersToClub`, `createClub`, `updateClub`, `deleteClub` messages/errors match.

**Players** (`internal/player/*` vs `controllers/players/*` + `drizzle/PlayerRepository.ts`):
- **Rating multiplier tables are byte-identical.** I imported the real Node
  modules with `tsx` (`interfaces/Player.AllMultipliers`, `player.model.Roles`,
  `utils/player-factors.{ratingFactors,postitionFactors,ageFactors}`) and
  deep-diffed against the JSON embedded in `rating_data.go`:
  `AllMultipliers roles: 12/12; factor lengths rating=101/101 pos=26/26 age=101/101;
  RATING-TABLES-DIFF: PASS (all 5 tables byte-identical)`. The `SetPiece` vs
  `Setpiece` quirk is pinned by `rating_test.go:16-30` (all-50 ST = 48).
- `calculatePlayerRating`/`calculateTotal` (cap 99, unknown position −10000) and
  the value/wage math match `utils/players.ts:56-153`. `CalculatePlayerValue`
  intentionally uses position-factor **midpoints** instead of Node's
  `Math.random` (NOTES, documented) — values will not match Node per-call.
- `getPlayers` excludes retired by default (`repository.go:74-76` vs
  `PlayerRepository.ts:70`) and every filter matches. `getPlayerStats` shape
  (`_id` + 9 stat fields + nested `player`, top-5, `The Best 5 Players by X`
  message) matches `player.service.ts:264-299` and `player.router.ts:200-218`.
- `createPlayer`/`updatePlayer` compute Rating/Value; `deletePlayer` deletes
  `PlayerMatchDetails` first then the player, matching `PlayerRepository.ts:121-137`.
- `getPlayer` not-found returns 200 with `null` payload, matching Node.

**Managers** (`internal/manager/*` vs `controllers/managers/*` + `drizzle/ManagerRepository.ts`):
- `getManagers` (`withClub = populate==='Club'`, `withNationality=true`),
  `getUnemployedManagers` (`withClub+withNationality`), `getManager`
  (`populate==='true'` → club only) all match `manager.router.ts:28-112`.
- Club relation is the narrow `{_id, Name, ClubCode}` projection
  (`repository.go:188-205`), matching `toManager` (`ManagerRepository.ts:45-53`)
  and `ManagerClubRefSchema`.
- `createManager` uses `MG-` + `(1000000+value).substring(1)` = `getNextCounterId('manager')`;
  message `Manger created successfully` reproduces Node's typo. `deleteManager`
  records the departure on the club first, then deletes. All match.

---

## 4. Honesty of the stubs — **PASS (shapes) with one behavioural flag (D6)**

Live responses (no DB), all valid envelopes with a **declared** status:

| route | observed | declared? |
|---|---|---|
| `GET /api/clubs/{id}/performance` | `400 {"success":false,"message":"Club performance is not available in the Go server yet"}` | yes (400) |
| `POST /api/clubs/{id}/lineup-suggestion` | `400` (policy-guarded; stub text) | yes (400) |
| `GET /api/clubs/{id}/media-feed` | `200 {"success":true,"message":"Media feed fetched successfully","payload":[]}` | yes (200 array) |
| `GET /api/players/generate-players` | disabled → `400`; enabled → `200 Player[]` | yes (200/400) |
| `POST /api/clubs/{id}/recruit-youth` | `200 Player[]` (generated locally) | yes (200 array) |

No stub returns an undeclared status or a wrong-shape success payload. Generated
players carry every `PlayerSchema` required field (`FirstName/LastName/Age/
Position/Role/Attributes/Rating/Value/isSigned`). `NOTES.md:94-119` documents all
of them. `getMediaFeed` silently degrades (empty feed) but cannot corrupt client
state. **`recruitYouthPlayers` does bypass a real gate — D6.**

---

## 5. Regression — **PASS**

```
go build ./...   EXIT=0
go vet ./...     EXIT=0
gofmt -l .       (empty) EXIT=0
go test ./... -count=1   all 12 packages ok (club, player, manager included)
server with DATABASE_URL unset: starts, /healthz 503, /api/meta/db 200
```
DB-backed tests skip cleanly (`TestLivePingSkipsWithoutDatabaseURL`,
`TestPgStoreCRUDSkipsWithoutDatabaseURL`).

---

## Defect list (B2)

### D6 — S2 — `recruitYouthPlayers` bypasses the owner gate and generates adults
- **Files:** `apps/fs-pro-server-go/internal/club/handlers.go:313-351` (no gate),
  `internal/player/generator.go:34-71` (age 18–30) vs
  `apps/fs-pro-server/src/controllers/players/player-lifecycle.service.ts:369-399`
  (+ `:409-434` `youthPromotionRefusal`) and `:234` (`ageRange: YOUTH_AGE_RANGE`, 16–18).
- **Expected (Node):** a non-admin owner is refused unless a Youth Academy exists
  (`tier >= 1`), the squad is below 28, and the per-tier cooldown has elapsed;
  owners always recruit exactly **1**; youth are age **16–18** with worldgen names
  and a resolved nationality; a `TransferLedger` `'youth_scouted'` row is written.
- **Actual (Go):** none of the refusal/cooldown/squad-cap checks run; owners may
  pass `count` (clamped 1–3); `GeneratePlayer("", "", rng)` yields **age 18–30**,
  `FirstName=""`, no `NationalityId`; no `TransferLedger` row.
- **Impact:** an owner can spam unlimited signed players (squad/rating/economy
  exploit) and every "youth" prospect is an adult. `NOTES.md` discloses "no
  cooldown / generates locally" but **not** the age range, the count clamp, or the
  missing ledger row.
- **Repro (code):** the handler has no read of any cooldown/asset state; `GeneratePlayer`
  is hard-coded `18 + rng.Intn(13)`; `club/handlers.go:324-330` uses the body `count`.

### D7 — S3 — `getPlayerRating` reports DB errors as "Player not found!"
- **File:** `internal/player/handlers.go:189-191`.
- **Expected (Node):** `player.router.ts:188-196` catch → 400 `{success:false,message: fail(err)}`.
- **Actual:** `Fail(400,"Player not found!", err.Error())` → message always
  "Player not found!" and an extra payload. Live: `{"message":"Player not found!","payload":"database is not configured"}`.
- **Impact:** connection/DB errors masquerade as a missing player.

### D8 — S3 — `removePlayerFromClub` success message differs when `remove` is falsy
- **File:** `internal/club/handlers.go:174-208`.
- **Expected (Node):** `club.router.ts:445-454` → `query.remove ? 'Player removed from Club successfully' : 'Player added to Club successfully'`.
- **Actual:** remove-player with `remove` absent/false returns "Player removed from
  Club successfully" (because `removePlayerFromClub` passes that as `addedMessage`).
- **Impact:** message-only; only when a caller omits `?remove=true` on the remove route.

### D9 — S3 — `getPlayers?excludeClubId` includes NULL-ClubId players
- **File:** `internal/player/repository.go:71-73` (`"ClubId" IS DISTINCT FROM $`).
- **Expected (Node):** `PlayerRepository.ts:68-69` `ne(...)` → SQL `<>`, which
  drops rows where `ClubId IS NULL`.
- **Impact:** free agents appear in "other clubs' players"; masked when
  `isSigned=true` is also sent.

### D10 — S3 — empty `competitionCode` filters differently
- **File:** `internal/player/service.go:57` (`if competitionCode != ""`).
- **Expected (Node):** `player.service.ts:288-292` `competitionCode !== undefined`
  → `?competitionCode=` filters `= ''` (usually zero rows).
- **Actual:** empty string is treated as "no filter" → all rows.

### D11 — S3 — `booleanQuery` leniency + an empty-flag default
- **Files:** `internal/{club,player,manager}/handlers.go` `boolQuery` vs
  `packages/api-contract/src/schemas/query.ts:8-11`.
- **Expected:** only `true`/`false` (or a real boolean); anything else is a 400
  validation error. **Actual:** Go also accepts `"1"`/`"0"` (and, for
  `getClubs?withPlayersAndManager=`, defaults to *with* players where Node's
  `?? true` treats `''` as falsy → *without*).
- **Impact:** minor; the Vue client sends `true`/`false`.

### D12 — S3 — stats nested `player.Nationality` casing
- **File:** `internal/player/service.go:86,113-135` injects `Nationality`;
  Node `player.service.ts:180` attaches lowercase `nationality`.
- Documented in `NOTES.md:114-116`; `PlayerStatsEntrySchema` is `.passthrough()`,
  so both validate. Divergence only for a client reading the nested key.

### D13 — S3 — `updatePlayer`/`createPlayer` trigger conditions use `!= nil`/zero
- **File:** `internal/player/handlers.go:118,135-138` vs `player.router.ts:77,82`.
- Node uses JS truthiness (`data.Age`, `data.Position`), so `Age: 0` / `Position: ""`
  do not trigger a recompute; Go's `!= nil`/`age==0` fallbacks differ in those
  edge cases (Go substitutes the existing row's values).

### D14 — S3 — stale harness message
- **File:** `contract-check/check-contract.mjs:116` prints `(meta + users)` while
  actually checking 5 domains (45 routes). Cosmetic.

---

## What must be fixed before B3

1. **D6 (blocker):** implement the `recruitYouthPlayers` gate — Youth Academy
   check, squad cap (28), per-tier cooldown, count=1 for non-admins, a
   `TransferLedger` `'youth_scouted'` write, and a **youth** age range (16–18) with
   nationality. If it must stay a stub for now, make it return a declared 400
   (like `getClubPerformance`) instead of silently handing out unlimited players.
2. **D7:** make `getPlayerRating`'s error branch return Node's
   `message: fail(err)` (no payload) rather than "Player not found!".
3. **D9/D10:** align `excludeClubId` (`<>`, NULL-excluding) and empty
   `competitionCode` (filter, not no-op) with the Node SQL.
4. **D8/D11/D12/D13:** low-risk parity fixes; D8/D11 are one-liners.
5. **D14:** fix the harness message so it doesn't understate coverage.
6. Keep the D1–D5 regression tests; add a `recruitYouthPlayers` gate test when B4
   builds the facilities/ledger surface.

**Unverified (no Postgres):** all DB-backed behaviour — live 200 success bodies,
relation cardinality against real rows, `getPlayerStats` against real
`PlayerMatchDetails`, `NextCounterID` against the real sequences, and the
`players.getPlayers`/clubs filters against seeded data. These remain a required
gate before B3 is called done.
