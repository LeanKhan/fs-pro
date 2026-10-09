# `apps/fs-pro-server-go` — Go port of the `fs-pro-server` HTTP backend

Status: **PLAN** (no implementation code in this document).
Scope: rewrite the HTTP API of `apps/fs-pro-server` in Go so the existing Vue
client (`apps/fs-pro-client`, **192** `client.*.query()/mutation()` call sites)
keeps working byte-for-byte at the HTTP boundary. Node keeps serving; the Go
server listens on `PORT` (default `3000`) beside it.

Sources read for this plan (do not re-invent):

- Contract: `packages/api-contract/src/index.ts`, `routes/*.ts` (21 files, **162 routes**), `schemas/envelope.ts`, `schemas/user.ts`, `schemas/club.ts`, `schemas/player.ts`, `schemas/manager.ts`, `schemas/place.ts`, `schemas/meta.ts`, `schemas/query.ts`.
- Server: `apps/fs-pro-server/src/server.ts`, `sessionStore.ts`, `routers/index.ts`, `middleware/{route-policy,user,hardening}.ts`, `db/index.ts`, `db/drizzle/{schema,relations}.ts` (**34 tables** + `Sessions`), `controllers/user/{user.router,user.service,user.model}.ts`, `controllers/clubs/{club.router,club.service}.ts`, `repositories/drizzle/{User,Club}Repository.ts`, `helpers/responseHandler.ts`, `utils/auth.ts`, `controllers/auth/{club-access,sso.router}.ts`, `controllers/realtime/realtime.router.ts`, `controllers/*/…-face.router.ts`, `controllers/services/services.router.ts`, `controllers/world/atlas.router.ts`.
- Go precedent: `services/world-service/{go.mod,cmd/world-service/main.go,internal/config,internal/db,internal/http}`.

---

## 1. Objectives, non-goals, acceptance

### Objectives

1. Serve **all 162 contract routes** with the **exact HTTP method, full path
   (incl. `/api` prefix), declared status codes, and JSON field names** the
   `packages/api-contract` ts-rest + zod schemas define.
2. Same envelope on every JSON route:
   - success `{"success":true,"message":string,"payload":<T>}`
   - failure `{"success":false,"message":string,"payload":<unknown>}`
     (route-policy denials emit **no** `payload` key — see §5.5).
3. Interoperable sessions: read/write the same `Sessions(sid text pk, session
   jsonb, expires timestamptz)` table and accept/reproduce express-session
   signed cookies (`fspro.sid` = `s:<sid>.<b64url-hmac-sha256>` with
   `SESSION_SECRET`), so a browser logged into Node is logged into Go and vice
   versa.
4. Reproduce `middleware/route-policy.ts`'s `POLICIES` table as a Go table keyed
   by **route id** (`clubs.updateClub`, `users.logoutUser`, …), including its
   default rule (GET = public, anything else = admin) and its deny
   status/message pairs.
5. Read the existing Postgres database with hand-written `pgx/v5` SQL. No ORM,
   no sqlc, no migration.
6. `go build ./...`, `go vet ./...`, `go test ./...` clean. Unit tests are
   **DB-free by default**; anything needing Postgres is guarded by
   `if os.Getenv("DATABASE_URL") == "" { t.Skip(...) }`.
7. Deterministic, dependency-light, stdlib-first: `net/http` + Go 1.22
   `ServeMux` method+wildcard patterns; only third-party dep = `jackc/pgx/v5`
   (+ `golang.org/x/crypto/bcrypt`, already transitive in the workspace).

### Non-goals (v1)

- Replacing Node at runtime; serving the Vue client; Socket.IO; the world
  simulation itself.
- `src/scripts/**` (per owner), swagger/api-docs, Sentry (optional stub),
  multipart uploads (deferred to B6).
- ORM/codegen, TypeScript-to-Go transpilation, a generic schema engine.
- Perfect rendering parity (byte-identical JSON). Parity is **semantic**:
  parsed JSON validates against the same zod schema.

### Acceptance bar

- **Vue client unchanged**: for each of the 192 call sites, the Go response
  status + parsed body satisfy the route's declared zod schema, and the client's
  `unwrap()` (which reads `payload`) works. Verified by `contract-check` (§7).
- Session cookie minted by Node is accepted by Go and vice versa.
- `go build ./... && go vet ./... && go test ./...` clean; DB integration tests
  pass when `DATABASE_URL` is set and skip cleanly when it is not.

---

## 2. Directory / module layout

```
apps/fs-pro-server-go/
  go.mod                          module fs-pro-server, go 1.24.5
  go.sum
  cmd/server/main.go              config -> logger -> db pool -> session -> server -> graceful shutdown
  contract-check/                 Node conformance harness (§7); NOT part of the Go build
    package.json
    check-contract.mjs
    README.md
  internal/config/                env config with defaults + validation
  internal/httpapi/               the HTTP surface: ServeMux, middleware chain, envelope, JSON, manifest
  internal/session/               express-session-compatible sign/unsign + Postgres store
  internal/policy/                route-policy table + guard middleware
  internal/db/                    pgxpool wrapper with per-call timeout (mirror world-service)
  internal/auth/                  bcrypt interop, user lookups, sanitizeUser, club access
  internal/clients/               HTTP clients to sibling services (world, sim, program, worldgen, jev)
  internal/mail/                  Resend HTTP client (no-op/log when RESEND_API_KEY unset)
  internal/meta/                  1 route
  internal/user/                  users/auth: 15 routes
  internal/club/                  clubs: 15 routes
  internal/player/                players: 8 routes
  internal/manager/               managers: 6 routes
  internal/fixture/               fixtures: 4 routes
  internal/calendar/              calendar: 11 routes
  internal/place/                 places: 8 routes
  internal/season/                seasons: 5 routes; also standings
  internal/award/                 awards: 1 route
  internal/game/                  game: 6 routes
  internal/play/                  play: 11 routes
  internal/facilities/            facilities: 6 routes
  internal/program/               program: 13 routes
  internal/transfer/              transfers: 10 routes
  internal/openplay/              editions (14) + challenges (6) + competition-definitions (6)
  internal/world/                 world: 5 routes
  internal/atlas/                 atlas: 10 routes
  internal/tile/                  tiles: 1 route (proxy to world-service)
  internal/realtime/              plain-REST realtime ticket/mod (B6)
  internal/plainroutes/           faces, services, crests, kits, files, sso (B6)
```

One-line responsibilities:

- `cmd/server` — process lifecycle only.
- `internal/config` — `PORT` (3000), `DATABASE_URL`, `SESSION_SECRET`,
  `LOG_LEVEL`, `TRUST_PROXY`, `COOKIE_SECURE`, `CORS_ORIGINS`, service URLs.
- `internal/httpapi` — router registration, middleware chain, request context,
  envelope + JSON encoding rules, route manifest, health.
- `internal/session` — cookie sign/unsign + store CRUD against `Sessions`.
- `internal/policy` — `POLICIES` map + `Guard` wrapper per route.
- `internal/db` — `pgxpool` + per-call timeout (`Querier` interface for fakes).
- `internal/<domain>` — `<domain>.go` (handlers), `service.go` (SQL), tests.
- `internal/clients` — outbound HTTP to world/sim/program/worldgen/jev.

---

## 3. Cross-cutting design

### 3.1 Router + middleware chain

Use one `*http.ServeMux` with method+path patterns, wrapped by a single chain:

```
requestLogger -> recoverer -> cors -> securityHeaders -> limiters
  -> sessionMW -> policyMW(exact-route) -> handler
```

- **Routing** (Go 1.22): `mux.HandleFunc("POST /api/users/login", h.Login)`.
  Trailers where a collection route and an item route could collide use `{$}`
  (e.g. `GET /api/managers/{$}` vs `GET /api/managers/{id}`). Static segments
  beat wildcards by ServeMux precedence, but the Go table is still authored in
  the same specificity order as `route-policy.ts`'s `compile()` so intent is
  reviewable.
- **Middleware** is `func(http.Handler) http.Handler`; `cmd/server` composes
  them once. Middleware that needs the route id (`session` doesn't, `policy`
  does) is applied **per route** at registration:
  `mux.Handle("POST /api/clubs/{id}/update", s.guard("clubs.updateClub", club.Update))`.
  `s.guard` is a method on the server that looks up the rule, runs
  `policy.Enforce`, then calls the handler.
- **Handler signature**: `func(w http.ResponseWriter, r *http.Request)` plus a
  thin `httpapi.Handler` type that returns `(status int, payload any, err error)`
  so the envelope is emitted in exactly one place. `httpapi.Respond` writes it.

### 3.2 Request context

`httpapi.Context` is derived from `context.Context` on every request and carries
`slog.Level` logger, the session (`userID`, `sessionID`), the resolved route id,
and a lazily-parsed body cache. Accessors:

- `httpapi.Session(ctx) (userID, sessionID string, ok bool)`
- `httpapi.RouteID(ctx) string`

The session is attached by `sessionMW` after `session.Manager.Load(r)`.

### 3.3 Error + envelope helpers

`internal/httpapi/envelope.go`:

```go
func Success(w, status int, message string, payload any)   // {"success":true,...}
func Fail(w, status int, message string, payload any)      // payload nil => key omitted
func FailNoPayload(w, status int, message string)          // route-policy deny shape
```

- `Fail` must **omit** the `payload` key when the Go value is `nil` and there
  was no explicit payload, matching the zod `failEnvelope()` optional payload
  (route-policy `deny()` sends `{success:false,message}` only).
- Handlers return `httpapi.Err(status, message)` to let the wrapper `Fail`; DB
  errors are logged at error level and returned as `400 {"success":false,
  "message":"Error …","payload":"<err text>"}` to match the Node handlers'
  `fail(err)` pattern (`payload` = `err.message`).

### 3.4 JSON encoding rules (critical)

1. **Field names**: the contract field name is **the Postgres column name**
   except: Drizzle's internal `id` ↔ DB `_id` (the DB column is literally
   `_id`, so raw SQL already yields `_id`) and `mongoId` (always dropped). This
   is why raw SQL + a row→map adapter reproduces the Node wire shape almost for
   free — no camelCase translation table.
2. **Entity reads use `map[string]any` passthrough** built from
   `rows.Values()` + `FieldDescriptions()`: keep `_id`, drop `mongoId`, decode
   `jsonb`/`real` columns, then inject computed relation objects only when the
   Node repository did (`Players`, `Manager`, `AddressCountry`, `Club`,
   `Nationality`, …). This avoids 30 hand-maintained structs drifting from the
   zod schemas. **Typed structs are used only for query params, request bodies,
   and small computed payloads.**
3. **HTML escaping off**: `json.NewEncoder(w)` has `SetEscapeHTML(false)`.
   Node does not escape `<`/`>`/`&`; Go's default does (`\u003c`). Always use
   the one encoder in `httpapi/json.go`.
4. **`null` vs omitted**: nullable zod fields that the DB returns as NULL must
   be emitted as explicit `null`, not omitted (e.g. `Club.assets`, `Budget`,
   `Stadium`, `Manager: null`, `Season: null`). Optional-and-undefined server
   fields are omitted. The row adapter emits every selected column, so NULLs
   become JSON `null` automatically; do **not** use `omitempty` on passthrough
   maps.
5. **Numbers**: `real`/`numeric` scan to `float64`; emit with the default Go
   formatter (zod `z.number()` accepts `0` and `0.0`). jsonb numbers are
   embedded verbatim from `json.RawMessage` so they keep their stored form.
6. **Dates**: Postgres `timestamp`/`timestamptz` → `time.Time`. Format with
   `ISO8601msUTC(t)` = `t.UTC().Format("2006-01-02T15:04:05.000Z")` to match
   `JSON.stringify(new Date())`. Contract types that are `z.string()` accept
   any string, but the Vue client reads some of them (`createdAt`,
   `PlayedAt`), so match Node's `.toISOString()` shape. Store the helper in
   `httpapi/json.go` and use `RawMessage` when a value is already a string.
7. **Envelope cardinality**: arrays are encoded as JSON arrays, never wrapped.

### 3.5 Session middleware

`internal/session`:

- `Sign(sid, secret) string` → `"s:" + sid + "." + base64urlHMAC(secret, sid)`
  (base64 **without** `=` padding, matching `cookie-signature`).
- `Unsign(value, secret) (sid, ok)` — accepts `s:` prefix, recomputes HMAC with
  `hmac.Equal`, returns the sid. Empty/mismatched → not ok.
- `ParseCookie(r)` reads cookie name `fspro.sid` (the `cookie` package URL-
  decodes; Go's `r.Cookie` already unescapes). Node writes
  `s%3A<sid>.<sig>`; `r.Cookie("fspro.sid").Value` returns the decoded
  `s:<sid>.<sig>`.
- `Store` interface (`Get/Set/Destroy/Touch`) with a `PgStore` implementation:
  - `Get`: `SELECT session FROM "Sessions" WHERE sid=$1 AND expires>now()`.
  - `Set`: `INSERT … ON CONFLICT (sid) DO UPDATE SET session=$2, expires=$3`
    where `session` is a jsonb `{cookie:{...},userID:...}` and `expires` =
    `now + maxAge (30 days)`.
  - `Destroy`: `DELETE FROM "Sessions" WHERE sid=$1`.
  - `Touch`: `UPDATE "Sessions" SET expires=$2 WHERE sid=$1`.
- Session JSON shape to read: at minimum `userID` (string) and optional
  `cookie`. Write the same shape Node writes (including `cookie.maxAge`,
  `httpOnly`, `sameSite:"lax"`, `secure`, `expires`) so Node can read Go's.
- `sessionMW`: if no cookie or unsign fails → attach no session (do **not**
  401 here; policy does that). If the row is missing/expired → treat as no
  session. On successful load attach `userID` + the signed `sid` as
  `sessionID`.

### 3.6 Route-policy engine

`internal/policy`:

- `Rule` variants mirroring `route-policy.ts`: `public`, `signedIn`, `admin`,
  `handler`, `Self{param, fields}`, `Club{get, fields}`, `Player{param, fields}`,
  `Fixture{param, adminQuery}`.
- `Table map[string]Rule` = literal port of `POLICIES` (Appendix B). Keyed by
  route id. **Default when absent**: GET → public, otherwise admin.
- `Enforce(ctx, rule, r) (allowed bool, status int, message string)`:
  - no userID → `401 "Not logged in"`.
  - `signedIn` → allow.
  - else load `users.isAdmin`; missing user → `401 "Not logged in"`;
    admin → allow; `admin` rule and not admin → `403 "Admins only"`.
  - `Self`: param != userID → `403 "That is not your account"`; else apply
    `KeepFields`.
  - `Club`: `ownsClub` → `404 "Club not found"` if missing,
    `403 "You do not manage this club"` if not owner; apply `KeepFields`.
  - `Player`: missing → `404 "Player not found"`; not at owned club →
    `403 "That player is not at your club"`; apply `KeepFields`.
  - `Fixture`: reject admin-only query flags with
    `403 "<flag> is for admins only"`; missing → `404 "Fixture not found"`;
    no side owned → `403 "You are not playing in this match"`.
  - Any internal error → `403 "Not allowed"` (logged), mirroring Node.
- Helpers read params three ways: `param(name)` = `r.PathValue(name)`,
  `bodyField(name)` = buffered body map, `queryField(name)` = `r.URL.Query()`.
  Because `bodyField`/`KeepFields` need the JSON body before the handler
  parses it, `httpapi` buffers the body once (`bodymap.go`) and re-exposes it to
  the handler. `KeepFields` keeps only the allowlisted top-level keys for
  non-admins (`clubs.updateClub` → `Lineup`,`Tactic`; `players.updatePlayer` →
  `TrainingFocus`; `users.updateUser` → `FullName`,`Avatar`,`Age`,`Alerts`).

### 3.7 Logging, config, shutdown

- `log/slog` JSON handler to stdout (mirror `world-service/cmd/…/main.go`),
  level from `LOG_LEVEL`. Request middleware logs method, path, status, ms.
  `RATE_LIMIT=off` disables limiters.
- `internal/config`: `PORT` default `3000`; `DATABASE_URL` required only for
  DB-backed features and tests; `SESSION_SECRET` falls back to
  `"thisisasecret:)"` with a warning outside dev, exactly like `server.ts`;
  `COOKIE_SECURE`, `TRUST_PROXY`, `CORS_ORIGINS`, and the sibling-service URLs.
- Graceful shutdown: `signal.NotifyContext(SIGINT,SIGTERM)` → `srv.Shutdown`
  with 10s timeout → `pool.Close()`, mirroring `world-service`.
- Health: `GET /healthz` → `200 {"ok":true}` on a successful `select 1`,
  else `503 {"ok":false}`; starts even without `DATABASE_URL` (reports false).
  `GET /` → the Node welcome string. CORS whitelist mirrors `server.ts`
  (`localhost:8080/5173`, `REMOTE_HOST`, `CORS_ORIGINS`), `credentials:true`.
- Rate limits (port `hardening.ts`) land in B1 for the `/api/users/*` and
  `/api/auth` routes; in-memory counters keyed by IP (and username/email where
  Node does). The generic `/api` 600/min limiter is registered in B0 as a
  pass-through (off unless enabled).

---

## 4. Batch plan (B0..B6, dependency order)

Each route below is `routeId  METHOD /full/path`. Full inventory: Appendix A.
Batch order is chosen so each batch only depends on earlier ones. **B0+B1 are
sized to land in one sitting.**

### B0 — scaffold, config, health, meta

Goal: a runnable Go binary that answers health, the welcome page, the B0 meta
route, and publishes a machine-readable route manifest; full test harness in
place.

Endpoints: `meta.getDbStatus  GET /api/meta/db` (constant
`{backend:"postgresql"}`, DB-free); `GET /healthz`; `GET /` (plain routes).

Files to create:

- `go.mod`, `go.sum`
- `cmd/server/main.go`
- `internal/config/config.go`, `config_test.go`
- `internal/db/db.go`, `db_test.go`
- `internal/httpapi/{server.go,router.go,middleware.go,context.go,json.go,envelope.go,envelope_test.go,manifest.go,manifest_test.go,health.go}`
- `internal/meta/{meta.go,meta_test.go}`
- `contract-check/{package.json,check-contract.mjs,README.md}`

Unit tests that prove it:

- `config_test.go`: `PORT` default 3000; invalid port rejected; missing
  `SESSION_SECRET` warns but loads; `DATABASE_URL` optional.
- `envelope_test.go`: success/fail shapes; `Fail(nil)` omits `payload`;
  no HTML escaping (`<` stays `<`); array payload stays an array.
- `manifest_test.go`: manifest is sorted, unique, and its B0 subset matches the
  expected method/path/status set; the contract-check diff for B0 passes.
- `meta_test.go`: `GET /api/meta/db` returns
  `{"success":true,"message":…,"payload":{"backend":"postgresql"}}`.
- `db_test.go`: pool construction validates URL; skips live ping without
  `DATABASE_URL`.
- `httptest` smoke: `/healthz` 200 vs 503, `/` welcome.

### B1 — sessions + users/auth + policy engine

Goal: the full user/auth surface, working sessions, and the policy engine that
every later batch relies on.

Endpoints (15): `users.joinUser POST /api/users/join`;
`users.loginUser POST /api/users/login`;
`users.requestPasswordReset POST /api/users/forgot-password`;
`users.resetPassword POST /api/users/reset-password`;
`users.verifyEmail POST /api/users/verify-email`;
`users.resendVerification POST /api/users/resend-verification`;
`users.setEmail POST /api/users/email`;
`users.changePassword POST /api/users/change-password`;
`users.getUser GET /api/users/{id}`;
`users.logoutUser DELETE /api/users/{id}/logout`;
`users.updateUser POST /api/users/{id}/update`;
`users.addClubsToUser POST /api/users/{id}/add-clubs`;
`users.addClubToUser POST /api/users/{id}/add-club`;
`users.removeClubFromUser DELETE /api/users/{id}/clubs/{club_id}`;
`users.enterSession POST /api/users/enter`.

Files to create:

- `internal/session/{session.go,session_test.go,store.go,store_test.go}`
- `internal/policy/{policy.go,rules.go,policy_test.go}`
- `internal/auth/{password.go,password_test.go,user.go,user_test.go,clubaccess.go,clubaccess_test.go}`
- `internal/user/{router.go,handlers.go,service.go,router_test.go,service_test.go}`
- `internal/httpapi/bodymap.go`, `bodymap_test.go`
- `internal/mail/{resend.go,resend_test.go}` (log-only when key unset)
- extend `internal/httpapi/router.go` to register the 15 routes + guard.

Unit tests that prove it:

- Session signing round-trip against a **fixed secret + fixed cookie value**
  copied from an express-session/`cookie-signature` fixture; rejects tampered
  signatures and `s:`-less values.
- `PgStore` CRUD integration, skipped without `DATABASE_URL`.
- bcrypt interop: committed hash produced by Node `bcryptjs` validates with
  `golang.org/x/crypto/bcrypt.CompareHashAndPassword`, and a Go-produced hash
  is accepted.
- Policy table tests for every rule kind + defaults + deny messages/statuses.
- User validation logic (username regex `^[A-Za-z0-9_.-]{3,24}$`, password
  ≥8, email check, duplicate email/username 400 messages) as pure tests.
- Handler `httptest` with a fake store/repo: join sets `session.userID` and
  `Users.Session`; login returns `Clubs` as ids; `getUser?populate=true`
  returns full clubs; `updateUser` strips non-allowlisted fields for non-admins.
- Contract-check diff for all 15 user routes (DB-free) + zod response
  validation when `DATABASE_URL` is set.

### B2 — clubs + players + managers

Goal: the identity/CRUD domains and their reverse-FK joins.

Endpoints (29):

- clubs (15): `getClubs GET /api/clubs/all`, `getClub GET /api/clubs/{id}`,
  `getClubPerformance GET /api/clubs/{id}/performance`,
  `suggestLineup POST /api/clubs/{id}/lineup-suggestion`,
  `createClub POST /api/clubs/new`, `updateClub POST /api/clubs/{id}/update`,
  `deleteClub DELETE /api/clubs/{id}`,
  `addPlayerToClub PUT /api/clubs/{id}/add-player`,
  `addManyPlayersToClub PUT /api/clubs/{id}/add-many-players`,
  `refreshAllClubsRatings PUT /api/clubs/refresh-ratings`,
  `hireManager PUT /api/clubs/{id}/manager`,
  `fireManager DELETE /api/clubs/{id}/manager`,
  `recruitYouthPlayers POST /api/clubs/{id}/recruit-youth`,
  `removePlayerFromClub PUT /api/clubs/{id}/remove-player`,
  `getMediaFeed GET /api/clubs/{id}/media-feed`.
- players (8): `getPlayers GET /api/players/all`,
  `updatePlayer POST /api/players/{id}/update`,
  `createPlayer POST /api/players/new`, `getPlayerRating GET /api/players/{id}/rating`,
  `getPlayerStats GET /api/players/stats`, `generatePlayers GET /api/players/generate-players`,
  `getPlayer GET /api/players/{id}`, `deletePlayer DELETE /api/players/{id}`.
- managers (6): `getManagers GET /api/managers`, `getUnemployedManagers GET /api/managers/unemployed`,
  `getManager GET /api/managers/{id}`, `deleteManager DELETE /api/managers/{id}`,
  `updateManager PUT /api/managers/{id}`, `createManager POST /api/managers`.

Files: `internal/club/*`, `internal/player/*`, `internal/manager/*`,
`internal/clients/worldclient.go` (upsert entity, fire-and-forget),
`internal/atlas` is B5 — club create only needs the world client.
Tests: club `getClubs` default `withPlayersAndManager=true` vs `ids`/`unclaimed`
(skip live); `id`→`_id` remap + drop `mongoId`; nested `Players`/`Manager`/
`AddressCountry` injection; `Player.Attributes` jsonb passthrough preserves
`Setpiece`; `getPlayerStats` raw aggregation shape (`player` nested,
`clean_sheets`, passthrough); `suggestLineup` via jev/local fallback
(unit-testable selection logic); `calculateAndUpdateClubRating` math
(`Attacking/DefensiveClass`, per-position `_Rating`) as a pure test;
`refresh-ratings` idempotence.

### B3 — calendar + fixtures + seasons + awards + places

Endpoints (29):

- fixtures (4): `getFixtures GET /api/fixtures` (query `season`, `scheduledDay`,
  `scheduledDayFrom/To`, `played`, `club`, `light`), `getScheduleSummary GET /api/fixtures/schedule-summary`,
  `getFixture GET /api/fixtures/{id}`, `deleteFixture DELETE /api/fixtures/{id}`.
- calendar (11): `getCurrentCalendar GET /api/calendar/current`,
  `getSeasonReports GET /api/calendar/season-reports`,
  `getSeasonReport GET /api/calendar/season-reports/{year}`,
  `getWorldFeed GET /api/calendar/world-feed`, `getDays GET /api/calendar/days`,
  `deleteDay DELETE /api/calendar/days/{id}`, `getClock GET /api/calendar/clock`,
  `setClock POST /api/calendar/clock`, `tickClock POST /api/calendar/clock/tick`,
  `healCalendar POST /api/calendar/heal`,
  `simulateToDate POST /api/calendar/simulate-to-date`.
- seasons (5): `getSeasons GET /api/seasons`,
  `getSeasonFixtures GET /api/seasons/{id}/fixtures`,
  `getSeason GET /api/seasons/{id}` (payload `Season|null`),
  `getSeasonStandings GET /api/seasons/{id}/standings`,
  `deleteSeason DELETE /api/seasons/{id}`.
- awards (1): `getSeasonAwards GET /api/awards/season/{season_id}`.
- places (8): `getPlaces GET /api/places`, `getCountries GET /api/places/country`,
  `importFromWorld POST /api/places/import-from-world`,
  `syncFromWorld POST /api/places/sync-from-world`,
  `resolveAnchor POST /api/places/resolve-anchor`, `getPlace GET /api/places/{id}`,
  `getPlaceByName GET /api/places/name/{name}`,
  `updatePlace PUT /api/places/{id}`.

Files: `internal/fixture/*`, `internal/calendar/*` (calls `internal/clients`
world-service for world feed/advance-day), `internal/season/*`,
`internal/award/*`, `internal/place/*`, `internal/clients/worldclient.go` extend.
Tests: fixture filters + `light` (no per-player stats) + `club` home/away;
`getScheduleSummary` first/last/total/played; calendar singleton row handling;
clock mode transitions; places `import/sync/resolve-anchor` calls stubbed
world-service; ISO-8601 date shapes; `Season|null` encoding.

### B4 — play + game + facilities + program

Goal: the match/loop domains. `game` is folded in here (not called out in the
mission's sketch) because `play.playMatch` and `game.kickoffNew` drive the same
simulation engine and share `internal/clients/simclient.go`.

Endpoints (36):

- play (11): `getPlayState GET /api/play/{clubId}`,
  `findOpponents GET /api/play/{clubId}/opponents`,
  `playMatch POST /api/play/{clubId}/match` (200 + `409` PLAY-gate message),
  `getInbox GET /api/play/{clubId}/inbox`,
  `collectShop POST /api/play/{clubId}/shop/collect`,
  `getMatchday GET /api/play/{clubId}/matchday`,
  `bookMatch POST /api/play/{clubId}/book`,
  `getMatchPrep GET /api/play/{clubId}/fixtures/{fixtureId}/prep`,
  `saveMatchPlan PUT /api/play/{clubId}/fixtures/{fixtureId}/plan`,
  `previewMatchPlan POST /api/play/{clubId}/fixtures/{fixtureId}/preview`,
  `markInboxRead POST /api/play/{clubId}/inbox/read`.
- game (6): `kickoffNew GET /api/game/kickoff-new/{fixture}`,
  `enqueueMatch GET /api/game/enqueue/{fixture}` (202),
  `rewatchMatch GET /api/game/replay/{fixture}` (202),
  `getReplay GET /api/game/replay/{fixture}/data`,
  `tacticOptions GET /api/game/tactic-options`,
  `createFriendly POST /api/game/friendly`.
- facilities (6): `getCampus GET /api/facilities/{clubId}`,
  `startUpgrade POST /api/facilities/{clubId}/upgrade`,
  `savePlacement PUT /api/facilities/{clubId}/placement`,
  `getMedicalStatus GET /api/facilities/{clubId}/medical`,
  `squadRecovery POST /api/facilities/{clubId}/medical/squad-recovery`,
  `treatPlayer POST /api/facilities/{clubId}/medical/treat-player`.
- program (13): `getProgram GET /api/program/{clubId}`,
  `advanceProgram POST /api/program/{clubId}/advance`,
  `dismissTip POST /api/program/{clubId}/tips/{tipId}/dismiss`,
  `tip POST /api/program/{clubId}/tip`,
  `browseManagers GET /api/program/{clubId}/managers`,
  `interviewManager POST /api/program/{clubId}/managers/{managerId}/interview`,
  `signManager POST /api/program/{clubId}/managers/{managerId}/sign`,
  `releaseManager POST /api/program/{clubId}/managers/{managerId}/release`,
  `browsePlayers GET /api/program/{clubId}/players`,
  `scoutPlayer POST /api/program/{clubId}/players/{playerId}/scout`,
  `signPlayer POST /api/program/{clubId}/players/{playerId}/sign`,
  `requestLoan POST /api/program/{clubId}/loan`,
  `getProgramChapter GET /api/program/{clubId}/chapter`.

Files: `internal/play/*`, `internal/game/*`, `internal/facilities/*`,
`internal/program/*`, `internal/clients/{simclient.go,programclient.go,jevclient.go}`.
Tests: PLAY-gate `409`; squad-gate; `plan-effects`/`match-plan` pure logic;
facilities upgrade cost/level + completion sweep; medical math; program step
predicate/advance idempotence + money-write transactional guards (fake repo).

### B5 — transfers + editions/challenges/competition-definitions + world + atlas + tiles

Endpoints (52):

- transfers (10): `purchasePlayer POST /api/transfers/purchase`,
  `getTransferWindow GET /api/transfers/window`,
  `setTransferWindow POST /api/transfers/window`,
  `placeBid POST /api/transfers/bids`, `getOffers GET /api/transfers/offers`,
  `respondToOffer POST /api/transfers/offers/{id}/respond`,
  `listPlayerForSale POST /api/transfers/list`,
  `scoutPlayerTransfer POST /api/transfers/scout`,
  `getScoutedShortlist GET /api/transfers/scouted-shortlist/{clubId}`,
  `requestBudgetIncrease POST /api/transfers/budget-request`.
- editions (14): `list GET /api/editions`, `create POST /api/editions`,
  `get GET /api/editions/{id}`,
  `action POST /api/editions/{id}/status/{action}`,
  `invite POST /api/editions/{id}/invite`,
  `eligibility GET /api/editions/{id}/eligibility/{clubId}`,
  `register POST /api/editions/{id}/entries/{clubId}`,
  `withdraw DELETE /api/editions/{id}/entries/{clubId}`,
  `rankings GET /api/editions/{id}/rankings`,
  `bracket GET /api/editions/{id}/bracket`,
  `eligibleOpponents GET /api/editions/{id}/opponents/{clubId}`,
  `clubEntries GET /api/editions/club/{clubId}`,
  `getEntryPolicy GET /api/editions/policy/{clubId}`,
  `setEntryPolicy PUT /api/editions/policy/{clubId}`.
- challenges (6): `propose POST /api/challenges`,
  `respond POST /api/challenges/{fixtureId}/{action}`,
  `forClub GET /api/challenges/club/{clubId}`,
  `forEdition GET /api/challenges/edition/{editionId}`,
  `getPolicy GET /api/challenges/policy/{clubId}`,
  `setPolicy PUT /api/challenges/policy/{clubId}`.
- competition-definitions (6): `list GET /api/competition-definitions`
  (query `includeArchived`), `get GET /api/competition-definitions/{id}`,
  `validate POST /api/competition-definitions/validate`,
  `create POST /api/competition-definitions` (201),
  `update PUT /api/competition-definitions/{id}`,
  `archive POST /api/competition-definitions/{id}/archive`.
- world (5): `getSettings GET /api/world/settings`,
  `updateSettings PATCH /api/world/settings`, `endYear POST /api/world/end-year`,
  `advanceDay POST /api/world/advance-day`,
  `performance GET /api/world/performance/{clubId}`.
- atlas (10): `getAtlas GET /api/atlas`, `getChrome GET /api/atlas/chrome`,
  `search GET /api/atlas/search`, `getPlacement GET /api/atlas/placement`,
  `listInvites GET /api/atlas/invites`, `createInvite POST /api/atlas/invites`,
  `checkName GET /api/atlas/check`, `foundCountry POST /api/atlas/countries`,
  `foundTown POST /api/atlas/towns`, `foundClub POST /api/atlas/clubs`.
- tiles (1): `getTile GET /api/tiles/{z}/{x}/{y}` (proxy to world-service).

Files: `internal/transfer/*`, `internal/openplay/*` (editions+challenges+defs),
`internal/world/*`, `internal/atlas/*`, `internal/tile/*`, extend
`internal/clients/{simclient.go,programclient.go,worldclient.go}`.
Tests: transfer window gating; instant purchase budget math; offer state
machine (pending→countered→accepted/rejected/expired); competition-definition
defaults/validation (port `services/competitions/definition.ts`); ranking/
knockout table shapes; atlas `checkName` + founding 409 body; tile proxy
pass-through. `competitionDefinitions` bodies use `CompetitionSummarySchema`
(camelCase `id`,`code`,`name`,`latestEdition`) — note the deliberate mix.

### B6 — realtime REST + plain routes + wiring

Goal: the non-contract HTTP surface and deployment wiring.

Plain routes:

- `/api/realtime/ticket` GET, `/api/realtime/mod/reports` GET,
  `/api/realtime/mod/mute` POST, `/api/realtime/mod/unmute` POST — port from
  `controllers/realtime/realtime.router.ts`; ticket signing must match
  `apps/fs-pro-realtime` (Go) expectations.
- `/api/players/{id}/face` GET, `/api/managers/{id}/face` GET,
  `/api/services/worldgen/{faces,names,names/family,health}` — proxy to
  `services/worldgen` via `internal/clients`.
- `/api/crests/{file}` GET, `/api/kits/{file}` GET — needs `renderCrestSvg`/
  `renderKitSvg` (TS in `api-contract/crest.ts`). **Decision: defer** to a
  follow-up unless the crest port is trivial; the client degrades to its
  hand-drawn assets for original clubs but founded clubs need SVG. Flag in
  `OPEN-QUESTIONS`.
- `/api/files/upload`, `/api/files/upload-clubs` — **defer** (multipart; no
  client caller in the 192 sites).
- `/api/auth/sso/{login,callback,session,logout}` — **defer/optional**
  (imagination OAuth; not on the password-login path).
- `/api/random-test`, `/`,`/healthz` — covered in B0 where applicable.

Wiring: `deploy/` compose entries, `cmd/server` env docs, a README in the app,
and an optional CI job that starts Postgres and runs the zod response pass.

---

## 5. Per-domain mapping notes (Node → Go)

| Node file(s) | Go package | Tricky logic to preserve |
|---|---|---|
| `controllers/meta/meta.router.ts` | `internal/meta` | constant `{backend:"postgresql"}` |
| `controllers/user/user.router.ts`, `user.service.ts`, `user.model.ts`, `utils/auth.ts`, `sessionStore.ts` | `internal/user`, `internal/auth`, `internal/session` | join/login set `session.userID` + save; login strips `Password/Session/EmailVerifiedAt`, adds `EmailVerified` bool, `Clubs` = owned club ids; `getUser?populate=true` inlines full `Club[]`; `updateUser` self + field allowlist; `enterSession` id quirk (client `sessionID` stored on the row, `req.sessionID` returned); dummy bcrypt on unknown user (timing); `revokeSessions` deletes `Sessions` rows where `session->>'userID'`. |
| `controllers/user` email flows + `services/auth/email-token.service.ts` + `services/mail/mail.service.ts` | `internal/user`, `internal/mail` | token = 32 random bytes base64url, store SHA-256; issuing voids prior unused tokens of same kind (transaction); `requestPasswordReset` always 200; `resetPassword` marks `EmailVerifiedAt` and revokes sessions. |
| `controllers/clubs/club.router.ts` + `club.service.ts` + `club.controller.ts` | `internal/club` | `getClubs` defaults `withPlayersAndManager=true` but `ids`/`unclaimed` skip it; reverse-FK `Clubs.UserId`; `Players`/`Manager`/`AddressCountry` only injected when fetched; rating math; `add/remove-player` toggleSigned + recompute; `hireManager` 401 on "already has a manager". |
| `controllers/players/player.router.ts` + `player.service.ts`, `player-lifecycle.service.ts`, `player-training.service.ts` | `internal/player` | `Attributes` jsonb passthrough (`Setpiece` lowercase); `getPlayerStats` different shape (`Setpiece`/`nationality`, `clean_sheets`, nested `player`); exclude retired from active reads; `generatePlayers` shells out (admin/dev) — port as a stub/feature-flag. |
| `controllers/managers/manager.router.ts` + `manager.service.ts` | `internal/manager` | `Club`/`Nationality` relation injection; `NationalTeam` union bool/string; delete records departure on club first. |
| `controllers/fixtures/fixture.router.ts` + `fixture.service.ts` | `internal/fixture` | `light` omits per-player stats; `club` matches home OR away; played/unplayed; schedule summary. |
| `controllers/calendar/calendar.router.ts` + `calendar.service.ts`; `services/calendar/*` | `internal/calendar` | singleton `Calendars` row; `clock`/`tick`/`heal`/`simulate-to-date` call matchday runner; `getWorldFeed` joins places; `getDays`/`Events`; day deletion. |
| `controllers/seasons/season.router.ts` + `season.service.ts`; `services/competitions/ranking.service.ts` | `internal/season` | `getSeason` returns `Season|null`; standings flat list best-first; season==edition. |
| `controllers/awards/awards.router.ts` | `internal/award` | `recipient` enum + `populate` club/club-season. |
| `controllers/places/places.router.ts` + `places.service.ts` | `internal/place` | `import/sync/resolve-anchor` call world-service; `getPlaceByName` matches Name or Code. |
| `controllers/game/game.router.ts` + `game.controller.ts` + `functions.ts`; `jobs/matchQueue.ts` | `internal/game` | synchronous `play()`; `simulate_rest` sequential loop; enqueue 202; replay data pack; tactics list from `match/tactics.ts`. |
| `controllers/play/play.router.ts`; `services/play/*` | `internal/play` | owner-only via policy `handler`+`canManageClub`; PLAY gate `409`; match plan save/preview; inbox read. |
| `controllers/facilities/facilities.router.ts`; `services/facilities/*` | `internal/facilities` | asset levels/costs from `asset-config.ts`; placement validated against shared `campus-grid.ts`; medical status/treat/squad-recovery. |
| `controllers/program/program.router.ts`; `services/program/*` | `internal/program` | thin proxy to Go program engine for evaluate/tip/score; all money writes transactional; step stars/XP; advisor tips dismissal. |
| `controllers/transfers/transfer.router.ts` + `transfer.service.ts`; `services/transfers/*`; `services/ai/*` | `internal/transfer` | window gating; instant purchase vs bid offer state machine; AI answers immediately; Jev scout/budget with local fallback (`source: 'jev'|'local'`). |
| `controllers/open-play/open-play.router.ts`, `competition-definitions.router.ts`; `services/competitions/*` | `internal/openplay` | editions status transitions; challenge accept/decline/cancel + forfeit; competition definition defaults/validation; `Rankings`/`Pools` tables. |
| `controllers/world/world.router.ts`; `services/world/*` | `internal/world` | settings patch; `endYear`/`advanceDay` drive the season cycle; `performance`. |
| `controllers/world/atlas.router.ts`; `services/world/{atlas,club-founding,placement}.service.ts` | `internal/atlas` | `checkName`, `foundClub` 409 when new place names missing, invite tokens; `getChrome`/`search` public. |
| `controllers/world/tiles.router.ts` | `internal/tile` | proxy `GET /tiles/{z}/{x}/{y}` to `services/world-service`. |
| `controllers/realtime/realtime.router.ts` | `internal/realtime` | ticket claims `{uid,name,clubs,code,admin,ver}`; admin mod relay to gateway. |
| `controllers/*/…-face.router.ts`, `controllers/services/services.router.ts` | `internal/plainroutes` | worldgen HTTP client (SVG/names); plain JSON/SVG responses (not envelopes). |
| `controllers/auth/sso.router.ts`; `services/auth/imagination-auth.service.ts` | `internal/plainroutes` (defer) | PKCE state in session; redirect flows. |
| `helpers/responseHandler.ts` | `internal/httpapi` | envelope + `contentType('json')` |
| `middleware/route-policy.ts` | `internal/policy` | `POLICIES` (Appendix B), defaults, `KeepFields`, deny messages |
| `middleware/{user,hardening}.ts` | `internal/httpapi` | checkSession, health, security headers, rate limits |
| `utils/auth.ts` | `internal/auth` | bcrypt cost 10; dummy hash; session resolve |
| `db/drizzle/schema.ts` | `internal/db` (queries) | 34 tables; column names ARE contract names (except `id`/`mongoId`) |
| `sessionStore.ts` | `internal/session` | exact `Sessions` CRUD + signing |

### 5.1 `id` remap and joins

- Drizzle maps DB column `_id` → JS property `id`; repositories rename it back
  to `_id` and drop `mongoId`. In Go, `SELECT`-ing the real columns already
  yields `_id`; only `mongoId` is dropped. **No rename table needed.**
- Relations are injected by the Go service exactly when Node injected them:
  - `Club`: `Players` (many, from `players.ClubId`), `Manager` (one, via
    `clubs.ManagerId`), `AddressCountry` (one, `clubs.AddressCountryId`) — the
    `*Id` fields always pass through as bare ids.
  - `Manager`: `Club` narrowed to `{_id,Name,ClubCode}` (`ManagerClubRefSchema`)
    and `Nationality` (Place).
  - `Fixture`: `Details`, `Events`, side detail ids; replay only on the replay
    routes.
- Nested relations are one level deep only, matching the Node repositories.

---

## 6. Risk register (top 8) + mitigations

1. **Contract drift** (route/status/field mismatch as the contract evolves).
   *Mitigation*: single `POLICIES`/route table per domain reviewed against
   Appendix A; `/__routes` manifest + `contract-check` diff in CI (DB-free);
   zod response validation when a DB is available; add each new route to the
   manifest test in the same PR.
2. **Session/cookie incompatibility** (HMAC format, padding, `s:` prefix,
   cookie name, JSONB shape, `expires`).
   *Mitigation*: `session_test.go` pinned to fixtures captured from
   express-session/`cookie-signature`; share the existing `Sessions` table;
   never destroy/rotate Node sessions during coexistence; skip the DB store
   test without `DATABASE_URL` but keep a Postgres CI job.
3. **PascalCase vs camelCase and `_id` remap.** *Mitigation*: codify the rule
   "contract field = column name, except `_id` (already a column) and dropped
   `mongoId`"; row→map passthrough for entity reads; golden JSON fixtures for
   `User`, `Club`, `Player`, `Manager`, `Place`. Note `competition-definitions`
   is the deliberate exception (camelCase `CompetitionSummarySchema`).
4. **JSON encoding differences** (HTML escaping, null vs omit, float/date
   formatting, key order). *Mitigation*: `SetEscapeHTML(false)`; explicit `null`
   for nullable columns (no `omitempty` on passthrough maps); `ISO8601msUTC`
   helper; conformance compares **parsed** JSON, never bytes.
5. **Joins / relation loading parity** (`Players`,`Manager`,`AddressCountry`,
   fixture details, season→competition) — easy to over-fetch or under-fetch.
   *Mitigation*: explicit SQL + second queries, inject only when Node does;
   paired conformance fixtures for `populate` on/off.
6. **DB-less testing vs real integration.** *Mitigation*: `db.Querier` +
   `session.Store` interfaces for fakes; every DB test `t.Skip` without
   `DATABASE_URL`; a compose/CI Postgres job runs the full suite and the zod
   response pass; record golden rows as JSON fixtures for pure tests.
7. **Heavy cross-service domains** (sim `game`/`play`, program engine,
   transfers AI/Jev, world-service, worldgen, SSO) and the risk of blocking the
   port. *Mitigation*: `internal/clients` HTTP wrappers with timeouts + local
   fallbacks where Node has them (`source:'local'`); stub in unit tests; defer
   plain routes (faces/crests/kits/uploads/sso) to B6.
8. **Auth/policy/security regressions** (wrong default, missing field
   allowlist, bcrypt mismatch, missing rate limits).
   *Mitigation*: policy table tests incl. defaults and exact deny
   status/message; bcrypt interop fixture; port `hardening.ts` limits in B1;
   never log secrets; keep admin-only defaults for unlisted mutations.

Supplementary watch-items (not top-8): ServeMux pattern collisions
(`/clubs/refresh-ratings` vs `/clubs/{id}`, `/players/stats` vs `/players/{id}`,
`/managers/unemployed` vs `/{id}`, `/editions/club/{clubId}` vs `/editions/{id}`)
— rely on ServeMux precedence, add explicit tests; and `real`/jsonb numeric
scanning (use `json.RawMessage` for jsonb).

---

## 7. Contract-conformance test design

Two passes in `apps/fs-pro-server-go/contract-check/`, run after
`npm run build --workspace @repo/api-contract`:

### Pass 1 — route manifest diff (DB-free, runs always)

1. Go server exposes a dev-only manifest (gated by `ENABLE_ROUTE_MANIFEST=true`,
   never in production) via `GET /__routes`:
   `[{"id":"clubs.updateClub","method":"POST","path":"/api/clubs/{id}/update","statuses":[200,400]}, …]`.
2. `check-contract.mjs` imports the compiled contract
   (`../../packages/api-contract/dist/index.js`), walks `apiContract`
   recursively reading `method`, `path`, `pathPrefix`, and `responses` keys —
   the same walk `route-policy.ts`'s `compile()` does — and produces the
   expected set (162 routes) of `{id, method, fullPath, statuses}`.
3. Diff expected vs actual. Fails on missing/extra route, wrong method, wrong
   path, or missing/extra declared status. `path` params are compared as
   `{name}` placeholders (the script normalizes `:x` → `{x}`).

This proves §3 of the acceptance bar (method, path, status codes) with no DB.

### Pass 2 — response shape validation (needs `DATABASE_URL` + seeded DB)

1. Skip if `DATABASE_URL` is unset (same guard as the Go integration tests).
2. A cases file lists `{routeId, request:{method,path,query,body,headers},
   expectedStatus, sessionCookie}` — a small hand-maintained set per batch,
   seeded from the dev database (real club/player/fixture ids via env or a
   fixtures JSON).
3. For each case: fetch the Go server, assert status, then validate the parsed
   body with the route's zod `responses[expectedStatus]` schema from the
   compiled contract (the same schema `failEnvelope()` wraps), and assert
   `success` is `true` where appropriate.
4. Report per-route PASS/FAIL and exit non-zero on any failure.

UI (not a test): `check-contract.mjs --run` boots the server itself for local
use; CI passes a base URL. The Vue client's 192 call sites are the coverage
target; the cases file is expanded one batch at a time and the diff pass keeps
the full 162 honest.

---

## 8. Definition of done — B0 and B1

### B0 — done when

1. `apps/fs-pro-server-go/` builds: `go build ./...`, `go vet ./...`,
   `go test ./...` all clean.
2. Binary starts with only `SESSION_SECRET` (no `DATABASE_URL`) and:
   - `GET /healthz` → `503 {"ok":false}` (no DB) or `200 {"ok":true}` (DB up).
   - `GET /` → the Node welcome string, `200`.
   - `GET /api/meta/db` → `200 {"success":true,"message":…,"payload":{"backend":"postgresql"}}`.
3. Envelope unit tests pass, incl. no-HTML-escaping and `Fail` omitting
   `payload` when nil.
4. `GET /__routes` returns the B0 set; Pass 1 contract-check reports 0 diffs
   for B0 (the 1 meta route + health/welcome are documented as non-contract).
5. Graceful shutdown test: SIGTERM stops the server within the timeout.
6. `contract-check/README.md` documents how to run both passes.

### B1 — done when

1. All 15 `users.*` routes registered at exact method+path and visible in
   `GET /__routes`; Pass 1 reports 0 diffs for the users domain.
2. `session.Sign`/`Unsign` round-trip against pinned express-session fixtures
   (accept Node cookie, reject tamper). `PgStore` CRUD integration passes with
   `DATABASE_URL` and skips without it.
3. bcrypt interop test passes (Node-produced hash accepted; Go-produced hash
   produced at cost 10).
4. Policy engine tests: `public`/`signedIn`/`admin`/`self`/`club`/`player`/
   `fixture`/defaults, with exact deny status+message
   (`401 "Not logged in"`, `403 "Admins only"`, `403 "You are not playing in
   this match"`, …); `KeepFields` strips non-allowlisted body keys.
5. Handler tests (fake store/repo, no DB): join stores `session.userID` and
   `Users.Session`; login sets session + returns `Clubs` ids; getUser
   `populate=true` returns full clubs; updateUser self+allowlist enforced;
   password/email reset/verify token flows.
6. With `DATABASE_URL`: join→login→`GET /api/users/{id}`→logout round-trips
   through the real `Sessions` table and Pass 2 validates `UserSchema`.
7. `go build ./... && go vet ./... && go test ./...` clean.

---

## Appendix A — route inventory (162)

Full path = `/api` + `pathPrefix` + route `path`. Response column lists declared
statuses (payload schema name).

### meta (1)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getDbStatus | GET `/api/meta/db` | – | 200 → DbStatus |

### users (15)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| joinUser | POST `/api/users/join` | body `{FullName,Username,Password,Email,Clubs?}` | 200→User, 400 |
| loginUser | POST `/api/users/login` | body `{Username,Password}` | 200→User, 400, 404 |
| requestPasswordReset | POST `/api/users/forgot-password` | body `{Email}` | 200→null?, 400 |
| resetPassword | POST `/api/users/reset-password` | body `{Token,NewPassword}` | 200→null?, 400 |
| verifyEmail | POST `/api/users/verify-email` | body `{Token}` | 200→null?, 400 |
| resendVerification | POST `/api/users/resend-verification` | body `{}?` | 200→null?, 400, 401 |
| setEmail | POST `/api/users/email` | body `{Email,Password}` | 200→User, 400, 401, 409 |
| changePassword | POST `/api/users/change-password` | body `{Username,CurrentPassword,NewPassword}` | 200→User, 404, 400, 401, 403 |
| getUser | GET `/api/users/{id}` | query `populate?` | 200→User, 400, 404 |
| logoutUser | DELETE `/api/users/{id}/logout` | body `{}?` | 200→{}, 400, 404 |
| updateUser | POST `/api/users/{id}/update` | body UserWrite | 200→User, 400 |
| addClubsToUser | POST `/api/users/{id}/add-clubs` | body `string[]` | 200→Club[], 400 |
| addClubToUser | POST `/api/users/{id}/add-club` | body `{clubId}` | 200→Club, 400 |
| removeClubFromUser | DELETE `/api/users/{id}/clubs/{club_id}` | body `{}?` | 200→Club, 400 |
| enterSession | POST `/api/users/enter` | body `{userID,sessionID}` | 200→`{userID,sessionID}`, 400, 404 |

### clubs (15)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getClubs | GET `/api/clubs/all` | query `ids?,unclaimed?,withPlayersAndManager?` | 200→Club[], 400 |
| getClub | GET `/api/clubs/{id}` | query `populate?` | 200→Club, 404 |
| getClubPerformance | GET `/api/clubs/{id}/performance` | query `year?` | 200→ClubPerformance, 404, 400 |
| suggestLineup | POST `/api/clubs/{id}/lineup-suggestion` | body `{formation,style?,slots[11]}` | 200→LineupSuggestion, 404, 400 |
| createClub | POST `/api/clubs/new` | body ClubWrite | 200→Club, 400 |
| updateClub | POST `/api/clubs/{id}/update` | body ClubWrite | 200→Club, 400 |
| deleteClub | DELETE `/api/clubs/{id}` | – | 200→Club, 400 |
| addPlayerToClub | PUT `/api/clubs/{id}/add-player` | query `remove?`; body `{playerId,isSigned,clubCode?,clubId?}` | 200→Club, 400 |
| addManyPlayersToClub | PUT `/api/clubs/{id}/add-many-players` | body `{playerIds,clubId,clubCode}` | 200→Club, 400 |
| refreshAllClubsRatings | PUT `/api/clubs/refresh-ratings` | body `{}?` | 200→{}, 400 |
| hireManager | PUT `/api/clubs/{id}/manager` | body `{manager,details?}` | 200→{}, 400, 401 |
| fireManager | DELETE `/api/clubs/{id}/manager` | query `reason?` | 200→{}, 400 |
| recruitYouthPlayers | POST `/api/clubs/{id}/recruit-youth` | body `{count?}` | 200→Player[], 400 |
| removePlayerFromClub | PUT `/api/clubs/{id}/remove-player` | query `remove?`; body as add-player | 200→Club, 400 |
| getMediaFeed | GET `/api/clubs/{id}/media-feed` | query `fixtureId?,competitionCode?,channel?` | 200→MediaItem[], 400 |

### players (8)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getPlayers | GET `/api/players/all` | query `club?,clubCode?,isSigned?,excludeClubId?` | 200→Player[], 400 |
| updatePlayer | POST `/api/players/{id}/update` | body PlayerWrite | 200→Player, 400 |
| createPlayer | POST `/api/players/new` | body PlayerWrite | 200→Player, 400 |
| getPlayerRating | GET `/api/players/{id}/rating` | – | 200→`{new_rating,new_value}`, 400 |
| getPlayerStats | GET `/api/players/stats` | query `competitionCode?,sortBy?,sortDir?` | 200→PlayerStatsEntry[], 400 |
| generatePlayers | GET `/api/players/generate-players` | query `number,culture,position` | 200→Player[], 400 |
| getPlayer | GET `/api/players/{id}` | – | 200→Player, 400 |
| deletePlayer | DELETE `/api/players/{id}` | – | 200→Player, 400 |

### managers (6)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getManagers | GET `/api/managers` | query `isEmployed?,clubId?,populate?` | 200→Manager[], 400 |
| getUnemployedManagers | GET `/api/managers/unemployed` | – | 200→Manager[], 400 |
| getManager | GET `/api/managers/{id}` | query `populate?` | 200→Manager, 400 |
| deleteManager | DELETE `/api/managers/{id}` | – | 200→Manager, 400 |
| updateManager | PUT `/api/managers/{id}` | body ManagerWrite | 200→Manager, 400 |
| createManager | POST `/api/managers` | body ManagerWrite | 200→Manager, 400 |

### fixtures (4)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getFixtures | GET `/api/fixtures` | query `season?,scheduledDay?,scheduledDayFrom?,scheduledDayTo?,played?,club?,light?` | 200→Fixture[], 400 |
| getScheduleSummary | GET `/api/fixtures/schedule-summary` | – | 200→`{firstDay,lastDay,total,played}`, 400 |
| getFixture | GET `/api/fixtures/{id}` | – | 200→Fixture, 400 |
| deleteFixture | DELETE `/api/fixtures/{id}` | – | 200→Fixture, 400 |

### calendar (11)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getCurrentCalendar | GET `/api/calendar/current` | – | 200→Calendar, 400 |
| getSeasonReports | GET `/api/calendar/season-reports` | – | 200→SeasonReport[], 400 |
| getSeasonReport | GET `/api/calendar/season-reports/{year}` | – | 200→SeasonReport, 404, 400 |
| getWorldFeed | GET `/api/calendar/world-feed` | query `clubId?` | 200→WorldFeed, 400 |
| getDays | GET `/api/calendar/days` | query `from?,to?` | 200→Day[], 400 |
| deleteDay | DELETE `/api/calendar/days/{id}` | – | 200→Day, 400 |
| getClock | GET `/api/calendar/clock` | – | 200→ClockState, 400 |
| setClock | POST `/api/calendar/clock` | body `{mode?,dayLengthMinutes?}` | 200→ClockState, 400 |
| tickClock | POST `/api/calendar/clock/tick` | body `{}?` | 200→`{ran,fromDay,toDay,simulatedFixtures,nextTickAt}`, 400 |
| healCalendar | POST `/api/calendar/heal` | body `{}?` | 200→`{healedCount,currentDay}`, 400 |
| simulateToDate | POST `/api/calendar/simulate-to-date` | body `{targetDay?,targetDate?,includeTargetDay?}` | 200→`{startDay,currentDay,currentDate,simulatedFixtures,simulatedDays}`, 400 |

### places (8)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getPlaces | GET `/api/places` | query `type?,code?,name?,region?` | 200→Place[], 400 |
| getCountries | GET `/api/places/country` | – | 200→Place[], 400 |
| importFromWorld | POST `/api/places/import-from-world` | body `{entity_id}` | 200→Place, 400 |
| syncFromWorld | POST `/api/places/sync-from-world` | body `{}` | 200→`{offline,checked,updated,stale,errors}`, 400 |
| resolveAnchor | POST `/api/places/resolve-anchor` | body `{entity_id}` | 200→`{resolved,breadcrumbs,city,countryId,missingCountry}`, 400 |
| getPlace | GET `/api/places/{id}` | – | 200→Place, 400 |
| getPlaceByName | GET `/api/places/name/{name}` | – | 200→Place, 400 |
| updatePlace | PUT `/api/places/{id}` | body PlaceWrite | 200→Place, 400 |

### awards (1)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getSeasonAwards | GET `/api/awards/season/{season_id}` | query `recipient`,`populate?` | 200→Award[], 400 |

### seasons (5)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getSeasons | GET `/api/seasons` | query `competition?,current?` | 200→Season[], 400 |
| getSeasonFixtures | GET `/api/seasons/{id}/fixtures` | – | 200→Fixture[], 400 |
| getSeason | GET `/api/seasons/{id}` | – | 200→Season\|null, 400, 404 |
| getSeasonStandings | GET `/api/seasons/{id}/standings` | – | 200→StandingLine[], 400, 404 |
| deleteSeason | DELETE `/api/seasons/{id}` | – | 200→{}, 400, 404 |

### game (6)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| kickoffNew | GET `/api/game/kickoff-new/{fixture}` | query `send_other_results?,simulate_rest?,quick_sim?` | 200→GameResults\|PlayResult, 400 |
| enqueueMatch | GET `/api/game/enqueue/{fixture}` | – | 202→`{fixture_id}`, 404, 409 |
| rewatchMatch | GET `/api/game/replay/{fixture}` | – | 202→`{fixture_id}`, 400, 404 |
| getReplay | GET `/api/game/replay/{fixture}/data` | – | 200→`{Home,Away,Details,Frames,Names?}`, 400, 404 |
| tacticOptions | GET `/api/game/tactic-options` | – | 200→`{formations[],styles[]}` |
| createFriendly | POST `/api/game/friendly` | body `{homeClubId,awayClubId,homeTactic?,awayTactic?,saveStats?}` | 200→`{fixture_id}`, 400, 404 |

### transfers (10)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| purchasePlayer | POST `/api/transfers/purchase` | body `{playerId,buyingClubId,offerAmount}` | 200→`{player,buyingClub,sellingClub,amount}`, 400, 404 |
| getTransferWindow | GET `/api/transfers/window` | – | 200→TransferWindow, 400 |
| setTransferWindow | POST `/api/transfers/window` | body `{open,days?}` | 200→TransferWindow, 400 |
| placeBid | POST `/api/transfers/bids` | body `{playerId,biddingClubId,amount}` | 200→TransferOffer, 400, 404 |
| getOffers | GET `/api/transfers/offers` | query `clubId,limit?,offset?,currentSeasonOnly?` | 200→TransferOffer[], 400 |
| respondToOffer | POST `/api/transfers/offers/{id}/respond` | body `{clubId,action}` | 200→TransferOffer, 400, 404 |
| listPlayerForSale | POST `/api/transfers/list` | body `{playerId,clubId,isListed,askingPrice?}` | 200→`{player,reaction,marketInterest,newOffer?}`, 400, 404 |
| scoutPlayerTransfer | POST `/api/transfers/scout` | body `{playerId,clubId}` | 200→ScoutReport, 400, 404 |
| getScoutedShortlist | GET `/api/transfers/scouted-shortlist/{clubId}` | – | 200→ScoutedTarget[], 404 |
| requestBudgetIncrease | POST `/api/transfers/budget-request` | body `{clubId,amount,justification}` | 200→BudgetResponse, 400, 404 |

### facilities (6)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getCampus | GET `/api/facilities/{clubId}` | – | 200→Campus, 404 |
| startUpgrade | POST `/api/facilities/{clubId}/upgrade` | body `{assetType}` | 200→Campus, 400, 401, 403, 404 |
| savePlacement | PUT `/api/facilities/{clubId}/placement` | body `{placement}` | 200→Campus, 400, 401, 403, 404 |
| getMedicalStatus | GET `/api/facilities/{clubId}/medical` | – | 200→MedicalStatus, 404 |
| squadRecovery | POST `/api/facilities/{clubId}/medical/squad-recovery` | body `{}` | 200→SquadRecoveryResponse, 400, 401, 403, 404 |
| treatPlayer | POST `/api/facilities/{clubId}/medical/treat-player` | body PlayerTreatmentRequest | 200→PlayerTreatmentResponse, 400, 401, 403, 404 |

### play (11)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getPlayState | GET `/api/play/{clubId}` | – | 200→PlayState, 404 |
| findOpponents | GET `/api/play/{clubId}/opponents` | – | 200→Opponent[], 400, 404 |
| playMatch | POST `/api/play/{clubId}/match` | body `{opponentId?,watch?}?` | 200→MatchResult, 400, 401, 403, 404, 409 |
| getInbox | GET `/api/play/{clubId}/inbox` | – | 200→Inbox, 400, 401, 403, 404 |
| collectShop | POST `/api/play/{clubId}/shop/collect` | body `{}?` | 200→ShopCollect, 400, 401, 403, 404 |
| getMatchday | GET `/api/play/{clubId}/matchday` | – | 200→Matchday, 400, 401, 403, 404 |
| bookMatch | POST `/api/play/{clubId}/book` | body `{opponentId}` | 200→MatchdayFixture, 400, 401, 403, 404 |
| getMatchPrep | GET `/api/play/{clubId}/fixtures/{fixtureId}/prep` | – | 200→MatchPrep, 400, 401, 403, 404 |
| saveMatchPlan | PUT `/api/play/{clubId}/fixtures/{fixtureId}/plan` | body `{plan,asDefault?}` | 200→MatchPrep, 400, 401, 403, 404 |
| previewMatchPlan | POST `/api/play/{clubId}/fixtures/{fixtureId}/preview` | body `{plan}` | 200→PlanPreview, 400, 401, 403, 404 |
| markInboxRead | POST `/api/play/{clubId}/inbox/read` | body `{}?` | 200→Inbox, 400, 401, 403, 404 |

### editions (14)
Write routes also declare 400/401/403/404/409 unless shown.
| id | method + path | request | statuses → payload |
|---|---|---|---|
| list | GET `/api/editions` | query `status?,competitionId?,eligibleFor?` | 200→EditionListItem[] |
| create | POST `/api/editions` | body `{competitionId,registrationOpensDay,registrationClosesDay,startDay}` | 201→Edition |
| get | GET `/api/editions/{id}` | – | 200→EditionDetail |
| action | POST `/api/editions/{id}/status/{action}` | body `{reason?}?` | 200→Edition |
| invite | POST `/api/editions/{id}/invite` | body `{clubIds[]}` | 200→Entry[] |
| eligibility | GET `/api/editions/{id}/eligibility/{clubId}` | – | 200→Eligibility |
| register | POST `/api/editions/{id}/entries/{clubId}` | body `{}?` | 200→Entry |
| withdraw | DELETE `/api/editions/{id}/entries/{clubId}` | body `{}?` | 200→`{ok:true}` |
| rankings | GET `/api/editions/{id}/rankings` | query `stage?,group?` | 200→StageTable |
| bracket | GET `/api/editions/{id}/bracket` | query `stage?` | 200→Bracket |
| eligibleOpponents | GET `/api/editions/{id}/opponents/{clubId}` | – | 200→OpponentOption[] |
| clubEntries | GET `/api/editions/club/{clubId}` | – | 200→Entry&`{edition}`[] |
| getEntryPolicy | GET `/api/editions/policy/{clubId}` | – | 200→EntryPolicy\|null |
| setEntryPolicy | PUT `/api/editions/policy/{clubId}` | body `{policy}` | 200→EntryPolicy\|null |

### challenges (6)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| propose | POST `/api/challenges` | body `{editionId,challengerClubId,opponentClubId}` | 201→MatchChallenge, +400/401/403/404/409 |
| respond | POST `/api/challenges/{fixtureId}/{action}` | body `{clubId}` | 200→`{challenge,forfeited?}`, +400/401/403/404/409 |
| forClub | GET `/api/challenges/club/{clubId}` | query `status?` | 200→MatchChallenge[], + |
| forEdition | GET `/api/challenges/edition/{editionId}` | – | 200→MatchChallenge[], + |
| getPolicy | GET `/api/challenges/policy/{clubId}` | – | 200→ChallengePolicy\|null, + |
| setPolicy | PUT `/api/challenges/policy/{clubId}` | body `{policy}` | 200→ChallengePolicy\|null, + |

### world (5)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getSettings | GET `/api/world/settings` | – | 200→WorldSettings, 400 |
| updateSettings | PATCH `/api/world/settings` | body WorldSettingsPatch | 200→WorldSettings, 400, 401, 403, 404 |
| endYear | POST `/api/world/end-year` | body `{}?` | 200→YearEndSummary, 400, 401, 403, 404, 409 |
| advanceDay | POST `/api/world/advance-day` | body `{}?` | 200→WorldDayReport, 400, 401, 403, 404 |
| performance | GET `/api/world/performance/{clubId}` | query `year?` | 200→PerformanceView, 400, 404 |

### competition-definitions (6)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| list | GET `/api/competition-definitions` | query `includeArchived?` | 200→CompetitionSummary[], 400 |
| get | GET `/api/competition-definitions/{id}` | – | 200→CompetitionSummary, 400, 404 |
| validate | POST `/api/competition-definitions/validate` | body CompetitionDefinitionInput | 200→`{ok,definition,errors}`, 400 |
| create | POST `/api/competition-definitions` | body Input`+{Code}` | 201→CompetitionSummary, 400, 401, 403, 404, 409 |
| update | PUT `/api/competition-definitions/{id}` | body Input | 200→CompetitionSummary, 400, 401, 403, 404 |
| archive | POST `/api/competition-definitions/{id}/archive` | body `{archived}` | 200→CompetitionSummary, 400, 401, 403, 404 |

### atlas (10)
`writeErrors` = 400/401/403/404/409.
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getAtlas | GET `/api/atlas` | query `countryId?` | 200→Atlas, 400 |
| getChrome | GET `/api/atlas/chrome` | – | 200→AtlasChrome, 400 |
| search | GET `/api/atlas/search` | query `q` | 200→AtlasSearchResult[], 400 |
| getPlacement | GET `/api/atlas/placement` | query `invite?` | 200→Placement, 400, 401 |
| listInvites | GET `/api/atlas/invites` | query `clubId` | 200→TownInvite[], writeErrors |
| createInvite | POST `/api/atlas/invites` | body `{clubId}` | 200→TownInvite, writeErrors |
| checkName | GET `/api/atlas/check` | query `kind,name,code?,countryId?` | 200→NameCheck, 400 |
| foundCountry | POST `/api/atlas/countries` | body FoundCountry | 200→AtlasCountry, writeErrors |
| foundTown | POST `/api/atlas/towns` | body FoundTown | 200→AtlasTown, writeErrors |
| foundClub | POST `/api/atlas/clubs` | body FoundClub | 200→FoundedClub, writeErrors |

### tiles (1)
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getTile | GET `/api/tiles/{z}/{x}/{y}` | path ints `z 0..5,x,y` | 200→Tile, 400 |

### program (13)
All declare 200 + 400/401/403/404/409.
| id | method + path | request | statuses → payload |
|---|---|---|---|
| getProgram | GET `/api/program/{clubId}` | – | ProgramState |
| advanceProgram | POST `/api/program/{clubId}/advance` | body `{}?` | ProgramState |
| dismissTip | POST `/api/program/{clubId}/tips/{tipId}/dismiss` | body `{}?` | ProgramDismissTip |
| tip | POST `/api/program/{clubId}/tip` | body ProgramAdvisorState`+{now,events?}` | ProgramTipResponse |
| browseManagers | GET `/api/program/{clubId}/managers` | – | ProgramManagerList |
| interviewManager | POST `/api/program/{clubId}/managers/{managerId}/interview` | body `{}?` | ProgramScoutReveal |
| signManager | POST `/api/program/{clubId}/managers/{managerId}/sign` | body `{contractYears?}?` | ProgramSignResult |
| releaseManager | POST `/api/program/{clubId}/managers/{managerId}/release` | body `{}?` | ProgramState |
| browsePlayers | GET `/api/program/{clubId}/players` | – | ProgramPlayerList |
| scoutPlayer | POST `/api/program/{clubId}/players/{playerId}/scout` | body `{}?` | ProgramScoutReveal |
| signPlayer | POST `/api/program/{clubId}/players/{playerId}/sign` | body `{}?` | ProgramSignResult |
| requestLoan | POST `/api/program/{clubId}/loan` | body `{}?` | ProgramLoan |
| getProgramChapter | GET `/api/program/{clubId}/chapter` | – | ProgramChapter |

Total: 1+15+15+8+6+4+11+8+1+5+6+10+6+11+14+6+5+6+10+1+13 = **162**.

---

## Appendix B — `POLICIES` port (exact)

Literal of `apps/fs-pro-server/src/middleware/route-policy.ts` lines 42–165.
Unlisted GET → public; unlisted non-GET → admin.

```
clubs.updateClub              = Club(param("id"), fields=[Lineup,Tactic])
clubs.suggestLineup           = Club(param("id"))
clubs.recruitYouthPlayers     = Club(param("id"))
clubs.createClub              = admin
clubs.deleteClub              = admin
clubs.addPlayerToClub         = admin
clubs.addManyPlayersToClub    = admin
clubs.refreshAllClubsRatings  = admin
clubs.hireManager             = admin
clubs.fireManager             = admin
clubs.removePlayerFromClub    = admin

players.updatePlayer          = Player("id", fields=[TrainingFocus])
players.generatePlayers       = admin

users.joinUser                = public
users.loginUser               = public
users.enterSession            = public
users.changePassword          = signedIn
users.requestPasswordReset    = public
users.resetPassword           = public
users.verifyEmail             = public
users.resendVerification      = signedIn
users.setEmail                = signedIn
users.logoutUser              = Self("id")
users.updateUser              = Self("id", fields=[FullName,Avatar,Age,Alerts])
users.addClubsToUser          = admin
users.addClubToUser           = admin
users.removeClubFromUser      = Self("id")

game.kickoffNew               = Fixture("fixture", adminQuery=[simulate_rest])
game.enqueueMatch             = admin
game.createFriendly           = Club(bodyField("homeClubId"))

transfers.purchasePlayer      = Club(bodyField("buyingClubId"))
transfers.placeBid            = Club(bodyField("biddingClubId"))
transfers.respondToOffer      = Club(bodyField("clubId"))
transfers.listPlayerForSale   = Club(bodyField("clubId"))
transfers.scoutPlayerTransfer = Club(bodyField("clubId"))
transfers.requestBudgetIncrease = Club(bodyField("clubId"))
transfers.getOffers           = Club(queryField("clubId"))
transfers.setTransferWindow   = admin

program.* (13)                = Club(param("clubId"))
facilities.startUpgrade|savePlacement|squadRecovery|treatPlayer = handler
play.playMatch|markInboxRead|collectShop|getMatchday|bookMatch|getMatchPrep|saveMatchPlan|previewMatchPlan|getInbox = handler
editions.create|action|invite|register|withdraw|setEntryPolicy = handler
challenges.propose|respond|setPolicy = handler
world.updateSettings|endYear|advanceDay = handler
competitionDefinitions.validate|create|update|archive = handler
atlas.foundCountry|foundTown  = admin
atlas.foundClub               = signedIn
atlas.getPlacement            = signedIn
atlas.listInvites|createInvite = handler
atlas.getChrome|search        = public
tiles.getTile                 = public
fixtures.deleteFixture        = admin
players.createPlayer|deletePlayer = admin
managers.createManager|updateManager|deleteManager = admin
calendar.deleteDay|setClock|tickClock|healCalendar|simulateToDate = admin
places.importFromWorld|syncFromWorld|resolveAnchor|updatePlace = admin
seasons.deleteSeason          = admin
```

---

## Appendix C — plain (non-contract) routes & decision

| method + path | Node source | decision |
|---|---|---|
| GET `/healthz` | `middleware/hardening.ts` | B0 (repo contract: `{ok:bool}`) |
| GET `/` | `server.ts` | B0 (welcome text) |
| GET `/api/realtime/ticket` | `controllers/realtime` | B6 |
| GET `/api/realtime/mod/reports` | `controllers/realtime` | B6 |
| POST `/api/realtime/mod/mute` | `controllers/realtime` | B6 |
| POST `/api/realtime/mod/unmute` | `controllers/realtime` | B6 |
| GET `/api/players/{id}/face` | `player-face.router.ts` | B6 (worldgen proxy) |
| GET `/api/managers/{id}/face` | `manager-face.router.ts` | B6 (worldgen proxy) |
| GET/POST `/api/services/worldgen/…` | `services.router.ts` | B6 (worldgen proxy) |
| GET `/api/crests/{file}` | `atlas.router.ts` (`crestRouter`) | defer (needs TS `renderCrestSvg`) |
| GET `/api/kits/{file}` | `atlas.router.ts` (`kitRouter`) | defer (needs TS `renderKitSvg`) |
| POST `/api/files/upload` | `services/file/file.service.ts` | defer (multipart) |
| POST `/api/files/upload-clubs` | `services/file/file.service.ts` | defer (multipart CSV) |
| GET `/api/auth/{login,callback,session,logout}` | `sso.router.ts` | defer/optional (OAuth) |
| GET `/random-test` | `routers/index.ts` | drop |
| `/api-docs*` | `docs/swagger.ts` | excluded |
| Socket.IO | `realtime/io.ts` | excluded (Go realtime exists) |
| `src/scripts/**` | – | excluded (owner) |
