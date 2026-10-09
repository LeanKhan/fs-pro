# `apps/fs-pro-server-go` — B0 + B1 notes

Go port of `apps/fs-pro-server`'s HTTP backend. This app serves the B0 scaffold
(health, welcome, meta, route manifest) and the B1 surface (sessions, the
route-policy engine, the 15 `users.*` routes). Node remains authoritative and
both can read/write the same `Sessions` table.

## Decisions taken where the plan was silent

1. **Cookie parsing decodes percent-encoding.** `net/http`'s `r.Cookie` does
   **not** URL-decode the value, while Node's `cookie` package percent-encodes
   the signed value (`s%3A...`). `session.ParseCookie` therefore runs
   `url.PathUnescape` (not `QueryUnescape`, which would turn `+` into a space and
   corrupt the base64 signature). The plan's claim that `r.Cookie` unescapes is
   not correct for Go.
2. **Set-Cookie is emitted by buffering the response.** express-session adds the
   cookie before `res.end`; a plain Go middleware runs before the body is
   flushed, so `sessionMiddleware` writes into a small buffer and flushes after
   the handler, adding `Set-Cookie` first.
3. **Rate limits are implemented in-memory** (same windows/limits/keys as
   `hardening.ts`), but the `standardHeaders: 'draft-7'` response headers are not
   emitted — only the `429 {success:false,message}` body matters to clients.
4. **Security headers are a representative subset of helmet** (`nosniff`,
   `X-Frame-Options`, `Cross-Origin-Resource-Policy: cross-origin`,
   `X-DNS-Prefetch-Control`), not a byte-for-byte helmet clone.
5. **`AuthTokens` issue is one atomic statement.** The Node service wraps
   "void old tokens + insert new" in a transaction; Go uses a data-modifying CTE
   (`WITH voided AS (UPDATE …) INSERT …`), which is atomic in a single statement
   and avoids depending on a transaction interface in `db.Querier`.
6. **jsonb decodes to Go values, not `json.RawMessage`.** pgx's `Rows.Values()`
   already unmarshals jsonb (numbers become `float64`, re-encoded in the same
   compact form), which is semantically identical for the client. The plan's
   `json.RawMessage` preference would require column-specific handling for no
   observable difference.
7. **The club surface in B1 is intentionally minimal** (`FindByUserID`,
   `Update`, `SetOwner`) because the user routes only select bare club rows or
   set the owner FK. Relation injection (`Players`, `Manager`, `AddressCountry`)
   arrives with the clubs batch.
8. **No-DB operation.** Without `DATABASE_URL` the process still starts; the
   offline stores return `auth.ErrOffline` so database-backed routes fail
   cleanly with the Node-shaped `400` bodies instead of panicking.

## Fixtures pinned in tests

- express-session/`cookie-signature@1.0.6` cookie for secret `test-secret` and
  sid `S1a2b3c4d5e6f7g8h9i0` (generated with the repo's installed package).
- Node `bcryptjs` hash of `correct horse battery staple` at cost 10.

## Deviations from the plan

- `internal/clients`, `internal/mail` (Resend) is log-only without
  `RESEND_API_KEY`, matching `mail.service.ts`.
- Contract Pass 2 (zod response validation) is not implemented in B0/B1; the
  Guard `t.Skip` posture for DB tests is in place.

---

## B2 verifier follow-up (D1–D5, HOST) and batch B2

### Defects fixed

- **D1** `policy.Enforce` now grants the admin bypass *before* rule dispatch
  (route-policy.ts:257): an admin passes `self`/`club`/`player`/`fixture` for a
  resource they don't own and is never `KeepFields`-stripped. Regression tests:
  `TestAdminBypassesEveryRuleKind`, `TestAdminBypassOwnAccount`.
- **D2** `requestPasswordReset` runs its async work on
  `context.WithTimeout(context.Background(), 30s)`, not `r.Context()`.
  Regression: `TestRequestPasswordResetSendsAfterResponse` (the test cancels the
  request context as soon as `ServeHTTP` returns).
- **D3** Welcome string is now `FS-PRO`; `TestWelcome` pins the literal.
- **D4** `auth.PgClubStore.FindByUserID` injects `AddressCountry` for
  `getUser?populate=true` / `addClubsToUser` / login. Pure merge is tested in
  `auth.TestMergeAddressCountry`; handler test asserts the relation survives.
- **D5** Verification mail is fire-and-forget on a background context
  (`sendVerificationAsync`). Regression: `TestJoinDoesNotBlockOnSlowMailer`
  (500 ms mailer) and `TestJoinSendsVerificationAfterResponse`.
- **HOST** added with default `127.0.0.1` (no Windows firewall prompt);
  `HOST=0.0.0.0` for container/production parity. `config.Addr()` is
  `HOST:PORT`. Tests: `TestDefaults`, `TestHostOverride`.

### Batch B2 — clubs (15) + players (8) + managers (6)

- `internal/club`: repository (column-map reads, `AddressCountry` always,
  `Players`/`Manager` when requested), rating recompute
  (`CalculateAndUpdateClubRating`, `RefreshAll`), and all 15 routes.
- `internal/player`: repository (retired excluded, nationality injection),
  exact rating/value/wage math (multiplier tables embedded verbatim from the TS
  sources via `rating_data.go`), `getPlayerStats` aggregation with the nested
  `player` object, counter `NextCounterID`, and all 8 routes.
- `internal/manager`: repository (narrow `Club` `{_id,Name,ClubCode}` +
  `Nationality`), `AppendRecord`, and all 6 routes. Club hire/fire uses a
  club-local `ManagerStore` interface to avoid an import cycle.

### B2 deviations / stubs (explicit)

- **`getClubPerformance`** returns `400 "Club performance is not available in
  the Go server yet"` — the Node analytics service (581 lines) is out of scope.
- **`suggestLineup`** returns `400` — the Node advisor calls Jev with a local
  fallback (276 lines); not ported.
- **`getMediaFeed`** returns `200 []` — the media hub (1048 lines) is not
  ported; the empty array keeps the declared shape.
- **`recruitYouthPlayers`** generates players locally; the Node owner cooldown
  and worldgen names are not ported (documented in the handler).
- **`generatePlayers`** is gated behind `ENABLE_PLAYER_GENERATION=true` and
  generates locally instead of shelling out (the Node behaviour).
- **`calculatePlayerValue`** is deterministic (range midpoints for outfield
  position multipliers) because Node's `getPositionMultiplier` uses
  `Math.random`; values will not match Node's per-call random numbers.
- **`SetPiece` vs `Setpiece`:** `AllMultipliers` keys use `SetPiece` while
  stored attributes use `Setpiece`; like Node, a weight whose key is absent is
  skipped (so an all-50 ST rates 48, not 50). Pinned in `player` tests.
- **`applyClubAnchors` / `worldClient.upsertEntity`** on create/update club are
  not ported (world-service integration is a later batch).
- **`getPlayerStats`** nested `player` uses the capital-`N` `Nationality`
  relation (other player reads' shape) instead of Node's lowercase raw
  `nationality`; the stats schema is `.passthrough()` so this is tolerated.
- Rating recompute only writes `GK/DEF/MID/ATT` `*_Rating` columns; unknown
  position strings are skipped rather than producing an invalid column.


---

## B2 verifier follow-up (D6-D14) and batch B3

### Defects fixed

- **D6** `clubs.recruitYouthPlayers` now reproduces the gate from
  `player-lifecycle.service.ts:409-434`: a Youth Academy (`ClubAssets`
  `youth_academy` level >= 1), squad cap 28 (signed, not retired), and a
  per-tier cooldown (`scaled(24 / tier)` hours; `GAME_TIME_SCALE` aware) for
  owners. Owners always recruit exactly 1; admins may pass `count` (1-3). Youth
  are **16-18** (`GenerateYouth`, attributes 10-35, position attrs 30-45,
  `isYouth:true`), a `TransferLedger` `'youth_scouted'` row is written, and the
  response carries the created players. Tests: `TestGenerateYouthAgeRange`,
  `TestYouthRefusalNoAcademy/FullSquad/Cooldown/Allowed`. Not ported: worldgen
  names/nationality (placeholder names, no `NationalityId`) and
  `completeDueUpgrades` (reads `ClubAssets.Level` directly).
- **D7** `getPlayerRating`'s error branch returns `400 {message: err.Error()}`
  (no payload), not `"Player not found!"`.
- **D8** `remove-player` uses Node's shared message logic: `remove` falsy →
  `"Player added to Club successfully"`.
- **D9** `excludeClubId` uses `<>` (NULL-excluding), not `IS DISTINCT FROM`.
  Test `TestPlayerWhereExcludeClub`.
- **D10** an explicitly-present empty `competitionCode` still filters
  (`= ''`). Test `TestGetSpecificPlayerStatsCompetitionFilter`.
- **D11** `booleanQuery` only accepts `true`/`false` (no `1`/`0`); a
  present-but-empty flag is falsy (matches Node's `?? true` for
  `withPlayersAndManager`). Tests in club/fixture/player/manager/season.
- **D12** `getPlayerStats`' nested `player` uses lowercase `nationality`
  (Node's raw-SQL key).
- **D13** `updatePlayer`'s recompute trigger uses JS truthiness while field
  substitution uses nullish coalescing. Tests `TestTruthyAndNullish`.
- **D14** `check-contract.mjs` prints the domains it actually checked.

### Live database findings (fspro_playtest)

- **NaN/Infinity in `real` columns** made `GET /api/clubs/all` return an empty
  body: Go's JSON encoder rejects NaN while Node emits `null`. `db.normalizeValue`
  now maps NaN/Inf to `null` (regression `TestRowMapTurnsNaNInfinityIntoNull`).
  This was a real B2 bug only visible against seeded data.

### Batch B3 — fixtures (4) + calendar (11) + seasons (5) + awards (1) + places (8)

- `internal/fixture`: repository with Node's relation injection — side details
  (ClubMatchDetails + PlayerMatchDetails) always unless `light`; embedded
  HomeTeam/AwayTeam (Players + Manager, no AddressCountry) only for
  `getFixture`. Filters `season`/`scheduledDay(From/To)`/`played`/`club`
  (Home OR Away); `light` skips stats.
- `internal/season`: list/fixtures/get/delete; `getSeason` attaches raw
  `Fixtures`; standings from the `Rankings` table (documented approximation).
- `internal/award`: `recipient` enum selects player/manager; `populate` attaches
  Recipient, then Club (club/club-season) and Season (club-season).
- `internal/place`: CRUD plus `import/sync/resolve-anchor` via
  `internal/clients`' `WorldClient` (`IMAGINATION_API_URL`, 3s timeout, public
  reads); `getPlaceByName` matches Name or Code.
- `internal/calendar`: singleton `Calendars` (get-or-create), `Days` range/
  delete, `SeasonReports`, `getClock` and a **fully implemented** `setClock`
  (mode/day-length clamp, next-hour boundary).

### B3 stubs and deviations (explicit)

- **Runner-dependent calendar endpoints stubbed with a declared `400`**:
  `tickClock` (`"tickClock is not available in the Go server yet"`),
  `healCalendar`, `simulateToDate`. These drive
  `services/world/world-day.service.ts` + the whole season/world simulation,
  which is a much larger batch; a wrong-shape 200 would be worse.
- **`getWorldFeed`** returns a shape-valid, calendar-backed empty feed
  (`recentResults`/`headlines`/`otherLeagues`/`activeInjuries` empty) rather
  than porting the 208-line feed service.
- **`getSeasonStandings`** is an approximation: reads `Rankings` for the
  season's `CurrentStage` (falling back to stage 0), orders by
  Points/GD/GF/ClubId, sets `Position`, `Rank: null`, `Group`. Node's
  `getStageTable`/ranking rules (pyramid pools, group rules) are not ported.
- **`getSeasonReport(s)`** read `SeasonReports.Data` (the generation service is
  not ported, but reports already in the DB are returned faithfully).
- **`recruitYouthPlayers`** does not port worldgen names/nationality or
  `completeDueUpgrades`.
- `IMAGINATION_API_URL` unset: import → `400` "the world server could not be
  reached", sync → `offline:true` summary, resolve → `resolved:false` (all
  declared shapes).

---

## B3 verifier follow-up (D15-D22) and batch B4

### Defects fixed

- **D15** `db.normalizeValue` now widens every integer width (int8/16/32/64,
  uints) to int64, handles float32, pgtype wrappers and slices/maps
  recursively; local int helpers gained int16/int32. `GET /api/calendar/clock`
  now returns 496/14/48 (was 0/0/1440). Regression:
  `TestRowMapNormalizesIntegerWidths`.
- **D16** `getSeasonStandings` ports `editionStandings`: pyramid editions return
  the top-division pool group; otherwise the current/last league/groups stage.
  Each group is ranked (metric/tiebreakers/minGamesToRank) with Rank 1..N, null
  under minGamesToRank. For season `03485b2c…` this is now 10 rows, 1 group,
  Rank 1..10 (was 27 rows, Rank null).
- **D17** unmodelled DB columns are stripped per table (Clubs `LeagueCode/
  LeagueId`, Fixtures `Week`, Calendars `singleton`, Seasons `Promoted/
  Relegated/isFinished/isStarted/Year/Standings`) so payloads match Node's
  Drizzle selection. `GET /api/seasons` is now ~51 KB (was ~698 KB).
- **D18** float32 (real) is emitted in its shortest round-tripping form
  (`strconv.FormatFloat(v,'g',-1,32)` + parse) → `36.77`, not
  `36.77000045776367`. Regression `TestRowMapShortFloat32`.
- **D19** ClubSchema's nullable `AttackingClass`/`DefensiveClass` left unchanged
  (widening to nullable risks client arithmetic); documented as known
  contract/data drift (Node emits the same null).
- **D20** `MatchEventSchema.type` widened with `yellow-card`, `red-card`,
  `penalty-shootout` (observed in seeded data) and `@repo/api-contract`
  rebuilt; played fixtures now validate.
- **D21/D22** `validate-live.mjs` now requires an expected status per case
  (a stub/undefined 400 can no longer pass), fails on unresolved ids, and lists
  the checked domains. Genuine Node-identical drift is `WARN`, not PASS.

### Batch B4 — play (11) + game (6) + facilities (6) + program (13)

- **facilities (real):** `getCampus`, `startUpgrade` (guarded budget debit +
  ClubAssets upsert + TransferLedger row), `savePlacement` (asset-config costs/
  effects and campus-grid validation, both ported). `getMedicalStatus`,
  `squadRecovery`, `treatPlayer` are declared `400` stubs (medical.service.ts
  not ported).
- **play:** `getPlayState` (club summary, level/XP, cooldown, recent results —
  the unported standing/challenge/shop sub-objects are shape-valid defaults and
  `league` is null), `getMatchday` (real fixtures), `getInbox`/`markInboxRead`
  (ClubMessages), `findOpponents` (real DB), `playMatch` reproduces the PLAY
  gate `409` (squad-gate.ts port) and returns a declared `400` once the gate
  passes (sim-core not ported). `collectShop`, `bookMatch`, `getMatchPrep`,
  `saveMatchPlan`, `previewMatchPlan` are declared `400` stubs.
- **game:** `tacticOptions` (real), `createFriendly` (real fixture insert);
  `kickoffNew`/`rewatchMatch`/`getReplay` declared `400`, `enqueueMatch`
  declared `409` (sim-core / match queue not ported).
- **program (13): all declared `400` stubs.** The owner-program engine
  (~770 lines of pure Node+DB: owner-program.service, manager-market,
  free-agent-market) is not ported in this batch.
- No `internal/clients/{simclient,programclient,jevclient}` were needed because
  the sim/program engine calls are the stubbed endpoints; `internal/clients`
  still holds the world reader from B3.

### Differential (Go :3227 vs Node :3099, same DB)

MATCH: `getClock` (496/14/48), `getSeasonStandings` (10/1/Rank 1..10),
`getSeasons` (~51 KB). `getPlayerRating` matches on `new_rating` (93);
`new_value` differs because Node's `getPositionMultiplier` uses `Math.random`
(outfield position factor), documented from B2. `getPlayState`/`getMatchday`/
`getCampus`/`getInbox` validate against zod; `getProgram` is a declared stub.

---

## Batch B5 (final contract batch) — all 162 routes registered

### Implemented vs stubbed

**Real:** `transfers.getTransferWindow`/`setTransferWindow` (singleton Calendars
window); `world.getSettings`/`updateSettings`; `editions.list`;
`competitionDefinitions.list`/`get`/`validate`; `atlas.checkName`;
`tiles.getTile` (straight proxy of the world-service response). Pure ports with
tests: window gate, purchase affordability, offer state machine,
competition-definition defaults/validation, atlas name availability + founding
409 gate, tile proxy (httptest stub).

**Declared stubs (all `400` unless noted), with reason:**
- transfers: purchasePlayer, placeBid, getOffers, respondToOffer,
  listPlayerForSale, scoutPlayerTransfer, getScoutedShortlist,
  requestBudgetIncrease — negotiation/AI/Jev services not ported.
- editions: get, eligibility, rankings, bracket, eligibleOpponents, clubEntries,
  getEntryPolicy, create, action, invite, register, withdraw, setEntryPolicy —
  open-play entry/ranking engine not ported.
- challenges: all 6 (propose/respond/forClub/forEdition/getPolicy/setPolicy) —
  challenge service not ported.
- competitionDefinitions: create/update/archive — write path not ported.
- world: endYear, advanceDay — the season cycle (world-day/year-end services)
  is not ported; performance — the analytics view is not ported.
- atlas: getAtlas, getChrome, search, getPlacement, listInvites, createInvite,
  foundCountry, foundTown — atlas/founding/placement services not ported;
  foundClub returns the declared `409` when required new-place names are
  missing, else `400`.
- B4 carry-overs still stubbed: program.* (13), play.collectShop/bookMatch/
  getMatchPrep/saveMatchPlan/previewMatchPlan and play.playMatch after the gate,
  game.kickoffNew/rewatchMatch/getReplay and game.enqueueMatch (409),
  facilities.getMedicalStatus/squadRecovery/treatPlayer,
  clubs.getClubPerformance/suggestLineup, calendar.tickClock/healCalendar/
  simulateToDate. `clubs.getMediaFeed` and `calendar.getWorldFeed` return
  shape-valid empty 200s.

### Serving note

`editions`' GET paths share one ServeMux catch-all
(`/api/editions/{rest...}`), because Go's ServeMux rejects
`/api/editions/club/{clubId}` vs `/api/editions/{id}/rankings` as ambiguous; the
manifest still lists each contract path (`Server.ManifestOnly`).

### Differential (Go vs Node, same DB)

MATCH: `getTransferWindow`, `getSettings`, `editions.list`,
`competitionDefinitions.list` (zod-validated); earlier MATCHes
(`getClock`, `getSeasonStandings`, `getSeasons`) unchanged. The 4 known
contract/data drift WARNs are unchanged (nullable club classes, NULL
FixtureCode, Award.Type='club').

---

## B5 verifier follow-up — D1 (S1 security) fixed + parity fixes

- **D1 (S1) — fixed centrally.** `policy.Enforce` no longer treats `Handler` as
  a blanket allow: a `handler`-rule route now requires a signed-in user (401
  "Not logged in" when anonymous) before the handler runs, matching Node (every
  handler calls `canManageClub`/`isAdmin` first). Real handlers gained the same
  owner/admin check Node's do, via `auth.CanManageClub` (401/403 "You do not
  manage this club"/404 "Club not found") and `auth.IsAdminByID`:
  `world.updateSettings` (admin → non-admin 403), `facilities.startUpgrade`/
  `savePlacement`, `play.getPlayState`/`findOpponents`/`getInbox`/`getMatchday`/
  `markInboxRead`. Live: anonymous `PATCH /api/world/settings`,
  `GET /api/play/{id}/inbox|matchday`, `POST /api/facilities/{id}/upgrade`,
  `GET /api/program/{id}` now all return `401 {"success":false,"message":"Not
  logged in"}`. Regression:
  `policy.TestEveryHandlerRuleDeniesAnonymous` walks every `handler`-rule id and
  asserts 401, so a future blanket-allow (or a new handler route) fails the test.
- **D4 — fixed:** `atlas.checkName` requires a valid `kind` (400 otherwise) and
  the taken message is now `"That name or code is taken"` (Node's).
- **D5 — fixed:** `regionTowns` reads/writes `RegionCities` (was
  `CityDistricts`); live `regionTowns` is now 8, matching Node.
- **D6 — fixed:** an empty/unknown `PATCH /api/world/settings` returns the full
  real settings view, not a zeroed projection.
- **D7 — fixed:** `tiles.getTile`'s offline body is now
  `{"success":false,"message":"fetch failed"}` (Node's shape).
- **D8 — improved:** the editions catch-all dispatches by path segments to the
  distinct per-route handlers (get/rankings/bracket/clubEntries/entryPolicy/
  eligibility/eligibleOpponents), so each sub-path resolves to its own handler
  even though Go's ServeMux cannot register the ambiguous patterns separately.

**Not done this pass (still open):**
- **D2 `editions.list` shape/order/message** (needs the Node edition-list
  service port; currently lists Seasons rows with message "Editions" vs Node
  "OK").
- **D3 `competitionDefinitions` `definition`/`latestEdition`** — must be
  assembled from `Competitions` columns (`Entry/Stages/WinCondition/Rewards/…`)
  and the latest `Seasons` row; currently null.
- **program.\*** (13) — still declared 400 stubs. The owner-program engine
  (`services/program/**`, ~770 lines pure Node+DB) was not ported.
- Remaining stub list is unchanged from the B5 NOTES entry minus the D1/D4–D8
  items above.

---

## D2/D3 fixed + owner-program core ported

- **D3 — FIXED.** `competitionDefinitions.list/get` now assemble `definition`
  from the real `Competitions` columns (`Entry/Stages/WinCondition/Rewards/
  Outcomes/Recurrence`, Name/Description/Prestige) and `latestEdition` from the
  newest `Seasons` row; list ordered by Name. Differential vs Node:
  `list` 0 semantic diffs (message "Competitions"), `get` matches.
- **D2 — FIXED.** `editions.list` mirrors Node: competition inner-join,
  `ORDER BY StartDay DESC LIMIT 200`, `published = Definition != null`, message
  "OK". Differential vs Node: **0 semantic diffs** (55 rows).
- **program.\* — core ported (5 of 13 real):** `getProgram`, `advanceProgram`
  (strict, surfaces the engine failure as 400 like Node), `dismissTip`,
  `requestLoan` (once-per-year `board_advance` guard + TransferLedger row),
  `getProgramChapter`. `getProgram` degrades to the persisted state when the
  world-service program engine is unreachable; **differential vs Node on a real
  owned club = exact MATCH** (step/stepStars/programXp/startingBalance/budget/
  completed/stars/xp/reasons/advisor/chapter), both reporting
  `reasons:["program engine unavailable"]`. All program routes carry the owner
  check (`auth.CanManageClub`).
- **Still stubbed (8 program routes, declared 400):** `tip`,
  `browseManagers`, `interviewManager`, `signManager`, `releaseManager`,
  `browsePlayers`, `scoutPlayer`, `signPlayer` — the manager/free-agent market
  services (with the masked-rating ranges and Scout jsonb writes) are not yet
  ported; no `internal/clients/programclient.go` was added (the engine is
  currently unreachable anyway, so `getProgram`'s Node-identical degraded path
  is what ships).
- Unchanged remaining stubs elsewhere (B5 list) still stand.

---

## Owner-program market ported + S3 nits (this pass)

**Program market (7 of the 8 stubs now real):** `browseManagers`,
`interviewManager`, `signManager`, `releaseManager`, `browsePlayers`,
`scoutPlayer`, `signPlayer`. Ported from `manager-market.service.ts` /
`free-agent-market.service.ts`: masked rating ranges (`MaskRange`/`HIDDEN_SPREAD`,
matching Node's round-then-mask), interview discount (`EffectiveManagerFee`),
`OwnerProgram.Scout` jsonb updates, transactional conditional budget debits
(`WHERE coalesce("Budget",0) >= fee`), `TransferLedger` rows, `Clubs.ManagerId`
set/clear, free-agent sign + `calculateAndUpdateClubRating`, and the exact
`ProgramManagerListSchema`/`ProgramPlayerListSchema`/`ProgramSignResultSchema`
payloads. Added `db.Begin`/`db.WithTx`/`db.InRollback` (transaction support via
`pgx.Tx`).
- `program.tip` stays a declared `400`: engine-backed and the world-service
  program engine is unreachable (Node's `tip` returns the same failure status).

**S3 nits fixed:**
- `auth.PgClubStore.FindByUserID` strips `LeagueCode`/`LeagueId`.
- `program.getProgram` degraded `completed` = (`step == "done"`), `reasons` `[]`
  when done.
- `atlas.checkName` success message `"Checked"`.
- `play.getPlayState`/`findOpponents` are public again
  (`policy.IsPublicHandler`), matching Node; the D1 guard still covers all other
  `handler` routes (`TestEveryHandlerRuleDeniesAnonymous` skips only these two).

**Tests:** pure masking/fee/overall; rolled-back DB market test
(`TestMarketRolledBack`) proving 0-budget rejection, double-sign rejection and
release-to-pool — all inside `db.InRollback`, so the DB is never changed.

**Differential vs Node (same DB, shared owner session):**
`GET /api/program/{id}/managers` → **0 diffs**; `.../players` → **0 diffs**
(after the rating rounding fix). `getProgram`/D2/D3 remain MATCH.

**Still stubbed: transfers writes (8: purchase, bid, offers, respond, list,
scout, shortlist, budget-request)** — not started this pass. Plus the unchanged
B5 set (matches/game sim, open-play editions/challenges, world progression,
atlas reads/founding, facilities medical, competitionDefinitions writes,
clubs analytics).

---

## Transfers writes ported (this pass)

**Real now (5 of the 8 stubs):** `purchasePlayer` (`ExecutePurchase` +
`settleTransfer` — one transaction: buyer debit, seller credit, player move,
`TransferLedger`, then both clubs' ratings refreshed), `placeBid` (offer row +
immediate AI answer via the pure `AiResponse`, counter/reject/accept),
`respondToOffer` (pending/countered turn check, accept settles at the agreed
price), `getOffers` (`ListOffers` → `OfferView`: direction/awaiting/player/clubs),
`getScoutedShortlist` (`ScoutedShortlist`: free agents + other clubs' listed
players, scored `rating/(value+1)`, length gated by the Scouting asset level).
Window gating (`AssertWindowOpen`) on purchase/placeBid/accept; every write is
owner/club-scoped via `auth.CanManageClub`; all money writes go through
`db.WithTx` (transactional) with `db.WithTx` short-circuiting inside an existing
tx.

**Tests:** pure `TestAiResponseTransitions`; rolled-back
`TestPurchaseRolledBack` proving the player moves + budget debits + ledger row
atomically and a double-buy is rejected (inside `db.InRollback`, DB unchanged).

**Differentials vs Node (shared DB, owner session):**
`GET /api/transfers/offers` → **0 diffs**; `GET
/api/transfers/scouted-shortlist/{clubId}` → **0 diffs**. `POST purchase`/`bids`
HTTP differential not run (needs a rollback wrapper around an HTTP request);
covered by the rolled-back Go purchase test.

**Still stubbed (3):** `listPlayerForSale` (Jev listing reaction + AI opening
bid), `scoutPlayerTransfer` (Jev scout report + local fallback),
`requestBudgetIncrease` (Jev board decision + performance service). Not ported
this pass — they depend on `JevService`/`performance.service` and their exact
payload builders.

---

## D23 (S2 concurrency) fixed + D24 (over-restriction) fixed

- **D23 — FIXED.** `transfer.settleTransfer` now runs inside one transaction with
  `SELECT ... FOR UPDATE` on the player and buying club, a **guarded player
  move** (`WHERE "_id"=$1 AND "isRetired"=false AND "ClubId" IS NOT DISTINCT
  FROM $expectedSeller`, `RowsAffected` checked) and a **guarded budget debit**
  (`WHERE coalesce("Budget",0) >= $amount`, `RowsAffected` checked). `expectedSeller`
  is `nil` for `executePurchase` (must still be a free agent) and the offer's
  `ToClubId` for `settleOffer`, so two racing purchases of one free agent, or two
  racing accepts of one offer, can no longer double-charge or double-insert the
  ledger. Any lost race returns an error and the transaction rolls back.
  - Proven by `TestSettlementGuardRolledBack` (deterministic two-call: first
    settlement wins, second is refused by the guard, exactly **1** ledger row,
    player owned by the first buyer) plus the existing
    `TestPurchaseRolledBack`; both run inside `db.InRollback`.
- **D24 — FIXED.** `transfers.getScoutedShortlist` no longer requires club
  ownership (Node has no route-policy entry → default GET public). Anonymous
  now reaches the handler (404 for a bogus club, 200 for a real one).
- **D25 (placeBid not atomic) and D26 (stale comments) — D26 fixed** (package
  docs updated). D25 remains a known S3 (offer insert + AI answer not one tx).
- **Priority 3 (the 3 remaining transfers stubs) — NOT done this pass:**
  `listPlayerForSale`, `scoutPlayerTransfer`, `requestBudgetIncrease`. They need
  the probabilistic `JevService` reaction/scout/board local fallbacks
  (`jev.service.ts`, `transfer-scout.service.ts`, `board-budget.service.ts`) and
  their exact multi-field payloads; not ported. Census therefore stays
  **103 real / 56 stub / 2 empty / 1 gate**.

---

## Open-play read paths ported (editions + challenges)

**Real now (9):** `editions.get` (edition + entries with club name/code),
`editions.rankings` (StageTable: groups + ranked `RankingRow`s from the
`Rankings` table, pool metadata from `Pools`), `editions.clubEntries`
(entry + nested edition + competitionName), `editions.getEntryPolicy` /
`editions.setEntryPolicy`, `challenges.forClub`, `challenges.forEdition`
(admin), `challenges.getPolicy`, `challenges.setPolicy`.

Access matches Node: the edition/challenge read handlers that Node leaves
unchecked are public via `policy.IsPublicHandler` (`editions.get`,
`eligibility`, `rankings`, `bracket`, `eligibleOpponents`, `getEntryPolicy`,
`clubEntries`, `challenges.forClub`, `challenges.getPolicy`); `forEdition` is
admin; the setters are owner/admin (`auth.CanManageClub`). D1 still holds.

**Differentials vs Node (same DB):** `GET /api/editions/{id}` → **0 diffs**;
`GET /api/editions/club/{clubId}` → **0 diffs**. `GET
/api/editions/{id}/rankings` → **5 diffs, all per-group rule metadata**
(Node's `pyramidGroupRules` gives `metric:"points"`, `minGamesToRank:10`;
Go's fallback gives `ppg`/world defaults) — the rows/ranks/points match;
documented justified diff (pyramid group-rule resolution not ported).
`GET /api/challenges/club/{clubId}` → `direction` differs (Go infers from
home/away; Node's `ChallengeService.clubChallenges` marks challenges where the
club did not initiate as `incoming`) — documented justified diff.

**Still stubbed (10):** editions.create/action/invite/eligibility/register/
withdraw/bracket/eligibleOpponents; challenges.propose/respond. They need
`EditionService` (status machine, entry fee/invite, eligibility predicates) and
`ChallengeService` (propose/accept/decline/cancel + forfeit), which were not
ported this pass. Census: **112 real / 47 stub / 2 empty / 1 gate**.

---

## D25 fixed - PlaceBid is now atomic (this pass)

`internal/transfer/market.go` `PlaceBid` previously inserted the `TransferOffers`
row outside a transaction, then ran the AI answer (`settleTransfer` / `finishOffer`)
as separate statements, and the duplicate-open-bid check was a non-transactional
read. Now the whole answer runs inside one `db.WithTx`, which:
- locks the bidding club row with `SELECT "_id" ... FOR UPDATE` so two concurrent
  bids from the same club serialise and the open-bid check cannot be raced;
- inserts the offer and performs the accept/counter/reject in the same tx, so a
  settlement failure rolls the insert back instead of leaving a `pending` offer
  with the player already moved;
- **also fixes a latent bug:** the insert was missing the non-default
  `TransferOffers."updatedAt"` column (Node passes `updatedAt: new Date()`); the
  NotNull constraint would have rejected every bid at runtime.

Regression: `TestPlaceBidAtomicRolledBack` (rolled back) - happy path inserts a
row and returns an id; a seeded open bid makes the next `PlaceBid` refuse and
leaves the offer count unchanged.

## Still outstanding (not attempted this pass)

The open-play **writes** remain stubs: editions `create/action/invite/eligibility/
register/withdraw/bracket/eligibleOpponents` (8) and `challenges.propose/respond`
(2). They need faithful ports of `EditionService` (status-transition machine,
entry fee + `FeePaid`, invite rows, eligibility predicate) and
`ChallengeService` (`propose`/`accept`/`decline`/`cancel` with `findSlot`,
`proposalReasons`, `context` rules and forfeit counting), plus `getBracket`.
The three transfer stubs (`listPlayerForSale`, `scoutPlayerTransfer`,
`requestBudgetIncrease`) also remain; they need the Jev local-fallback shapes
(`source:'jev'|'local'`) from `transfer-scout.service.ts` /
`board-budget.service.ts`.

---

## Editions writes: create / register / withdraw now real

Ported from `services/competitions/edition.service.ts` (`internal/openplay/edition_service.go`):

- **`editions.create`** (admin) - `CreateEdition`: validates dates
  (`registrationOpensDay <= registrationClosesDay <= startDay`, start not in the
  past -> `bad-dates` 400), locks the competition `FOR UPDATE`, takes
  `EditionNumber = max+1`, `SeasonCode = <CODE>-E<n>`, inserts a `draft`; 201 +
  `Edition created` + `toEdition` payload.
- **`editions.register`** (owner/admin) - `Register`: serialises per edition
  (`Seasons ... FOR UPDATE`), runs the full eligibility predicate, guarded fee
  debit (`WHERE coalesce("Budget",0) >= fee`) + `entry_fee` ledger row, then an
  `Entries` upsert (`ON CONFLICT ("SeasonId","ClubId") DO UPDATE`), status
  `registered` (or `active` when the edition is already `running`).
- **`editions.withdraw`** (owner/admin) - router parity: an `invited` entry is
  deleted (`DeclineInvite`), otherwise `Withdraw` refunds fees while
  `draft`/`registration`, or cancels the club's open challenges while `running`;
  refusals are `wrong-status` 409. Payload `{ok:true}` + `Withdrawn`.

The **eligibility predicate** (`eligibilityAt`) mirrors Node reason-for-reason and
in order: `Already entered`; `Registration is closed` (with the `lateEntryUntilDay`
escape); `No places left`; `Invitation only`; Level/Elo/rating bands (skipped for
invited clubs); country; `Only for past winners`; `Already in a competition that
excludes this one`; barred; `Entry limit reached (n / max)`; `Can't afford the
entry fee`. `levelForXp` (from `services/world/level.ts`) is ported as a pure
function. Errors map through `editionFail` exactly like Node's `fail()` (22P02 ->
404, `not-found`->404, `not-allowed`->403, `wrong-status`/`ineligible`->409, else
400).

Tests: `TestCheckDates` + `TestLevelForXp` (pure); `TestEligibilityAndRegisterRolledBack`
(rolled back) covers open registration, double-registration refusal, the fee
debit + `entry_fee` ledger + refund on withdraw, the full-places and invite-only
reasons, and the unpublished "Not open for entry yet".

### Still stubbed (declared, not half-shipped)
- **`editions.action`**: `publish` needs `buildDefinition` (the Zod
  `CompetitionDefinitionSchema` fills defaults/transforms - the Go
  `ValidateDefinition` is only a minimal validator, so the snapshotted
  `Definition` JSON would diverge); `cancel` needs the same definition path plus
  `refundFees`/`closeOpenChallenges` (already written, but `action` is one route
  covering both verbs).
- **`challenges.propose`**: `propose` itself is portable, but the router runs
  `applyChallengePolicy(fixture.id)` immediately after, which needs
  `squadFitness` + `tryAccept` (the scheduler `findSlot` + `dayKind`).
- **`challenges.respond`**: `accept` needs `findSlot`; `decline`/`expire` need
  `refuse` + `minDeclinesBeforeForfeit` and, on forfeit, `applyResult` (the
  ~150-line ranking/Elo/XP applier in `ranking.service.ts`). Not ported.

Census: **115 real / 44 stub / 2 empty / 1 gate**.

---

## Challenge lifecycle: propose + respond now real (findSlot / applyResult ported)

- **Scheduler** (`ranking.go` `dayKind`, `challenge_service.go` `findSlot`):
  ported `world-calendar.ts` day kinds (week template, `YearStartDay`) and
  `challenge.service.findSlot` (first free cup day in `[from+1, lastDay]`, live
  fixtures on any competition block the day; cancelled challenges free it).
- **`applyResult`** (`ApplyResult`): ported ranking.service `applyResult` -
  `RankingResults` insert is the once-only guard, `accepted -> played`, table
  rows via `applyMatchToRow`, Elo via `eloAfter`, XP via `grantXp` (+
  `LevelHistory` on a level change), forfeit = 3-0. Pure maths in `ranking.go`.
- **`challenges.propose`** (owner/admin): locks both clubs, `contextAt`
  (running league/groups stage + full `LeagueRules`), the `proposalReasons`
  predicate (group, caps, cooldown, pending, open count, rank range), inserts
  the fixture, then `ApplyChallengePolicy` (`squadFitness`, `tryAccept` =
  `Accept`, `declineOutsidePolicy`). 201 `Challenge sent`, direction `outgoing`.
- **`challenges.respond`** (owner/admin; admin may `cancel` any):
  `Accept` (findSlot + `ScheduledDate`), `Decline` (`refuse` ->
  declined/forfeited; `minDeclinesBeforeForfeit`, then `applyResult`), `Cancel`.
  Messages/statuses mirror Node (`Challenge <status>`, `Declined too often:
  recorded as a forfeit`); the payload carries `forfeited` only for a decline.
- **Fixed toChallenge direction** to Node's rule
  (`ChallengerClubId === clubId ? outgoing : incoming`), which resolves the
  earlier documented diff.
- **D1 fix**: `challenges.forEdition` added to the policy table as `Handler`
  (it was missing, so anonymous hit the handler's 403); `requireAdmin` now
  returns 401 for anonymous to match Node's `accessDenied`.

Tests: `TestDayKind`, `TestApplyMatchToRow`, `TestEloAfter`,
`TestResolveFullRules` (pure); `TestChallengeProposeRespondRolledBack` (rolled
back) drives propose -> accept (asserts a cup-day slot), propose -> decline
(non-forfeit), then seeds three declines and asserts the fourth forfeits, writes
one `RankingResults` row and an away 3-0 ranking row.

Differential: `GET /api/challenges/club/{clubId}` now **0 semantic diffs** vs
Node (same DB). `GET /api/challenges/edition/{editionId}` anonymous now 401 on
both. A propose-then-read differential is not possible without committing a
write (all writes rolled back), so the write path is covered by the rolled-back
test instead.

Census: **117 real / 42 stub / 2 empty / 1 gate**. editions.action remains the
one open-play write stub (needs the Zod `buildDefinition` snapshot).

---

## D27 fixed — forfeit status + applyResult are atomic

`Decline` used to commit the `forfeited` status, then call `ApplyResult` in a
separate transaction: if the result application failed the fixture was left
`forfeited` with no `RankingResults`/Elo/XP and a retry was refused
(`wrong-status`), losing the result permanently.

- `ApplyResult` is now split: `applyResultTx(ctx, tx, ...)` runs the whole
  ranking/Elo/XP body against a caller-supplied querier; `ApplyResult` wraps it
  in `db.WithTx`. `Decline` calls `applyResultTx` **inside** its own
  transaction (after `refuse`), so the status update and the result commit or
  roll back together.
- `db.WithTx` now begins through the `Beginner` interface unconditionally, so
  when the querier is already a transaction pgx creates a **savepoint**: a
  failure rolls back only this unit of work and leaves the caller's transaction
  usable. This is what lets the composed decline fail cleanly and be retried.
- A test-only seam (`applyResultGuard`) forces `applyResultTx` to fail.

Proof: `TestDeclineForfeitAtomicRolledBack` (rolled back) seeds the forfeit
threshold, proposes, then forces `applyResult` to fail — the fixture is still
`proposed`, `Played=false`, with zero `RankingResults`. Clearing the guard and
retrying applies exactly one `RankingResults` row; a second attempt is refused
(`wrong-status`) and still leaves exactly one. The `RankingResults` PK guard
still holds.
