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
