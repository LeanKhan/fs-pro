# Independent verification — `apps/fs-pro-server-go` B0 + B1

Verifier: independent subagent (adversarial). Date: 2026-10-08.
Scope: batches B0+B1 only (scaffold, health, welcome, meta, route manifest,
sessions, route-policy engine, 15 `users.*` routes).
Environment: Windows/PowerShell, Go 1.24.5, Node v26.10.0. **No Postgres
available (Docker down)**, so every DB-dependent check is marked SKIP with the
reason.

Method: I did not trust `NOTES.md` or the doer's scripts. I built a separate
verification harness (`/tmp/opencode/*.mjs`), reproduced the cookie signature
and the bcrypt fixture in Node by hand, wrote my own route-manifest diff, and
diffed the policy tables programmatically.

---

## 1. Independent build / vet / test / gofmt — **PASS**

```
> go version
go version go1.24.5 windows/amd64
> go build ./...          EXIT=0
> go vet ./...            EXIT=0
> gofmt -l .              (no output) GOFMT_EXIT=0
> go test ./... -count=1
ok  fs-pro-server/internal/auth
ok  fs-pro-server/internal/config
ok  fs-pro-server/internal/db
ok  fs-pro-server/internal/httpapi
ok  fs-pro-server/internal/mail
ok  fs-pro-server/internal/meta
ok  fs-pro-server/internal/policy
ok  fs-pro-server/internal/session
ok  fs-pro-server/internal/user
EXIT=0
```

Verbose run confirms the DB tests skip cleanly without `DATABASE_URL`
(`TestLivePingSkipsWithoutDatabaseURL`, `TestPgStoreCRUDSkipsWithoutDatabaseURL`
→ `--- SKIP`), and that the user/policy/session/envelope tests are real
assertions (not tautologies) — except `TestWelcome`, see Defect 3.

---

## 2. Route-manifest conformance — **PASS**

Server started with `ENABLE_ROUTE_MANIFEST=true PORT=3210 SESSION_SECRET=test-secret`.
`GET /__routes` returned 18 entries (16 contract meta+users + `/healthz`, `/`,
`/__routes`).

I parsed the compiled contract (`packages/api-contract/dist/index.js`)
independently of the doer's script and diffed every meta+users route
(method, full path with `/api`, sorted status set):

```
contract meta+users routes: 16, manifest: 16
  meta.getDbStatus        GET    /api/meta/db [200]
  users.joinUser          POST   /api/users/join [200,400]
  ... (all 15 users.*)
INDEPENDENT-DIFF: PASS (0 diffs)
```

Doer's harness against the live server: `PASS: 16 route(s) match (meta + users).` exit 0.

**Negative control** (required): I stood up a mock `/__routes` that returned
`meta.getDbStatus` with method `POST`, path `/api/meta/WRONG`, statuses
`[200,999]`, omitted every `users.*`, and added a bogus route. The doer's
`contract-check/check-contract.mjs` correctly returned **exit 1** with 18 diffs
(`... method POST != GET`, `... path /api/meta/WRONG != /api/meta/db`,
`missing route users.joinUser`, …). The script genuinely fails. **No missing,
extra or mismatched meta+users route.**

Note: `users.changePassword` manifest statuses are `[200,400,401,403,404]` vs
the contract's declaration order `[200,404,400,401,403]` — same set; both the
doer's script and mine sort before comparing. Not a defect.

---

## 3. Envelope + JSON parity — **PASS (one caveat)**

Live raw responses (curl, server no DB):

| request | status | body |
|---|---|---|
| `GET /api/meta/db` | 200 | `{"message":"Database status fetched successfully","payload":{"backend":"postgresql"},"success":true}` |
| `GET /api/users/nonexistent` | 400 | `{"message":"Error fetching User","payload":"database is not configured","success":false}` |
| `POST /api/users/join` (bad username) | 400 | `{"message":"Usernames are 3-24 letters, numbers, dots, dashes or underscores","success":false}` |
| `DELETE /api/users/abc/logout` (no session) | 401 | `{"message":"Not logged in","success":false}` |
| `POST /api/users/abc/update` (no session) | 401 | `{"message":"Not logged in","success":false}` |
| `POST /api/users/login` ×9 | 429 | `{"message":"Too many login attempts for this account. Please wait a few minutes and try again.","success":false}` |

- Keys: `success`, `message`, `payload`. `payload` omitted exactly where Node
  omits it — route-policy denials (`route-policy.ts:228-230`) and join
  validation (`user.router.ts:87`); present (and `null`-able) elsewhere. Matches
  `failEnvelope()` (`envelope.ts:10-19`).
- Meta message/payload are byte-equal to `meta.router.ts:10-14`.
- MySQL/Node error payload = `err.message` (`payload:"database is not configured"`);
  Node `fail(err)` (`user.router.ts:37-39`) produces the same string.
- Rate-limit 429 message equals `hardening.ts:23-26`.

**HTML escaping:** only one encoder exists, `internal/httpapi/json.go:19`
`enc.SetEscapeHTML(false)`; grep shows no other JSON writer. `TestNoHTMLEscaping`
(`envelope_test.go:64-73`) asserts `<b>a&b</b>` survives. Caveat: **no B1 route
echoes caller-supplied input** on the response path without a DB (the offline
store short-circuits before any echo), so this is verified at code+unit level,
not end-to-end. I did not find a live route to prove it over the wire.

---

## 4. Session cookie interop — **PASS (DB round-trip SKIP)**

- Installed `cookie-signature` at repo root is **1.0.6**; `express-session/index.js`
  does `var signed = 's:' + signature.sign(val, secret);` and strips `s:` on
  unsign.
- Independent Node reproduction (`crypto.createHmac('sha256','test-secret')`
  over raw sid `S1a2b3c4d5e6f7g8h9i0`, `.digest('base64')`, trim `=`):

```
sig    = 1sRA2npOqWLh1dSa2BcuXX6Iq+xVvGnr9HzNvaByNqA
signed = s:S1a2b3c4d5e6f7g8h9i0.1sRA2npOqWLh1dSa2BcuXX6Iq+xVvGnr9HzNvaByNqA
```

This is **byte-identical** to the Go fixture in `session_test.go:16` and to
`internal/session/session.go:22-51`:
`"s:" + sid + "." + base64.StdEncoding(HMAC-SHA256(secret, rawSid))` with
trailing `=` trimmed. Standard (not URL) base64, padding stripped, `s:` prefix,
HMAC input = raw sid: all correct.

- `go test ./internal/session -run 'Sign|Unsign|ParseCookie' -v` → all 7 PASS
  (fixture accepted; tampered sig / wrong secret / `s:`-less / `foo.bar`
  rejected; percent-encoded `s%3A…%2B…` and raw cookie both parse).
- `ParseCookie` uses `url.PathUnescape` (not `QueryUnescape`), so a literal `+`
  in the base64 std signature is preserved — correct, and documented in
  `NOTES.md` #1.
- **SKIP**: end-to-end "Node mints cookie → Go loads row from `Sessions`" needs
  Postgres (none). The `PgStore` CRUD test also `t.Skip`s. So the store JSONB
  shape / `expires` handling is unverified against a live DB.

---

## 5. Route-policy parity — **table PASS / engine FAIL**

### 5a. Table parity — PASS

I extracted the Node `POLICIES` object literal and eval'd it, parsed the Go
`Table` map literal, and canonicalised both (kind + `fields` + `adminQuery` +
club id source):

```
node POLICIES: 105, go Table: 105
key sets identical: true
POLICY-DIFF: PASS (all rules identical)
```

All 105 rules match, including `users.updateUser` fields
`FullName,Avatar,Age,Alerts`, `clubs.updateClub` `Lineup,Tactic`,
`players.updatePlayer` `TrainingFocus`, `game.kickoffNew`
`fixture … adminQuery=[simulate_rest]`, and the body/query club-id sources.
`RuleFor` default (GET public / else admin, `rules.go:197-205`) matches
`route-policy.ts:247`. All deny status+message pairs match exactly
(`401 "Not logged in"`, `403 "Admins only"`, `403 "That is not your account"`,
`404 "Club not found"`, `403 "You do not manage this club"`,
`404 "Player not found"`, `403 "That player is not at your club"`,
`403 "<flag> is for admins only"`, `404 "Fixture not found"`,
`403 "You are not playing in this match"`, `403 "Not allowed"`).

### 5b. Enforcement parity — **FAIL** (Defect 1, S2)

`policy.Enforce` never grants an admin the bypass that Node grants. See Defect 1.

---

## 6. User-domain behaviour — **FAIL** (divergences; see Defects 1, 2, 4, 5)

Compared `user.router.ts` / `user.service.ts` / `drizzle/UserRepository.ts` /
`utils/auth.ts` / `sessionStore.ts` against `internal/user/*.go` and
`internal/auth/*.go`. Passing items:

- `sanitizeUser`: strips `Password`, `Session`, `EmailVerifiedAt`; derives
  `EmailVerified = (EmailVerifiedAt != nil)`; preserves `Clubs`. Matches
  (`auth/user.go:55-70` vs `user.router.ts:44-48`).
- Password/Session/EmailVerifiedAt never cross the wire on any route.
- Owned `Clubs` derived by reverse FK (`Clubs.UserId`), login returns ids,
  `getUser?populate=true` returns full rows, `addClubsToUser` returns `Club[]`.
- `updateUser` non-admin allowlist enforced in the guard
  (`policy_test.go:248-269`, `handlers_test.go:423-456`).
- `logoutUser` status/messages (`"Username does not exist"` 404; `"Error
  logging out"` + `"Session not found! Try reloading"` 400) match.
- `enterSession` id quirk is ported faithfully: client `sessionID` is the store
  key, the request's own session id (`st.ID`) is written to `Users.Session` and
  returned; `st.ID` is always non-empty because `Manager.Load` assigns one.
- bcrypt: cost 10 (`BcryptCost`), Go `ComparePassword` accepts the Node
  bcryptjs fixture, and I independently verified that fixture in Node:
  `bcryptjs.compareSync('correct horse battery staple', <fixture>) === true`,
  `getRounds === 10`. Unknown-user login runs a real bcrypt compare against a
  real cost-10 dummy hash (`handlers.go:189-192`, `password.go:41-51`) — timing
  parity preserved. (Reverse direction "Go hash accepted by Node" was NOT
  independently exercised — no Go source may be written — but both emit `$2a$`.)

Divergences found are listed as Defects 1, 2, 4, 5 below.

---

## 7. Code-quality / risk pass — **PASS with findings**

- **No panics / fatal exits**: grep for `panic(`/`log.Fatal` → none; a
  recoverer maps panics to a logged 500 (`middleware.go:95-107`).
- **SQL injection**: no user value is interpolated into SQL. Identifiers go
  through `quoteIdent` (doubled double-quotes, `db/rows.go:131-133`); values are
  bind parameters (`db/query.go`). `fmt.Sprintf` is used only to assemble
  `INSERT`/`UPDATE` identifier/placeholder lists. Confirmed safe.
- **HTML escaping**: single `SetEscapeHTML(false)` encoder (`json.go:19`); no
  bypass.
- **`omitempty` on passthrough maps**: none (grep → 0). NULLs become explicit
  `null` via `ScanOne`/`normalizeValue` (`db/rows.go:29-47,74-102`).
- **Dates**: `ISO8601msUTC` = `2006-01-02T15:04:05.000Z` used for
  `time.Time` (`db/rows.go:14`) and cookie `expires` (`manager.go:149`).
- **Context timeouts**: pool `WithTimeout` on every `Query/QueryRow/Exec`
  (`db/db.go:99-132`); `healthHandler` 2s. **Exception:** the reset-email
  goroutine uses a request-scoped ctx — Defect 2.
- **Mass-write surface**: `Update` builds `SET` from arbitrary body keys with
  allowlisting only at the policy layer (`db/query.go:46-77`,
  `auth/user.go:131-147`). Not currently exploitable (non-admins are stripped;
  admins are blocked from other accounts by Defect 1), but it is coupled to
  Defect 1 — see "before B2".
- **npm/contract-check**: the doer's harness reads the compiled dist and hard-codes
  `CHECKED_PREFIXES=['meta.','users.']`, so it cannot yet detect a *missing
  domain* (it will trivially pass B2..B6 until extended). Not a bug for B1.

---

## Defect list

### D1 — S2 — Admins are blocked by `self`/`club`/`player`/`fixture` rules
- **Files:** `apps/fs-pro-server-go/internal/policy/policy.go:94-116` vs
  `apps/fs-pro-server/src/middleware/route-policy.ts:255-295` (esp. line 257).
- **Expected (Node):** after loading `isAdmin`, `if (user.isAdmin) return next();`
  — an admin is allowed for **every** rule kind and no `keepFields` filtering is
  applied.
- **Actual (Go):** the admin only short-circuits the `Admin` kind:
  ```go
  if !admin {
      if rule.Kind == Admin { return 403 "Admins only" }
  }
  switch rule.Kind {
  case Self:    if req.Param(rule.Param) != req.UserID { return 403 "That is not your account" }
  case Club:    ... 403 "You do not manage this club"
  case Player:  ... 403 "That player is not at your club"
  case Fixture: ... 403 "You are not playing in this match"
  }
  ```
  The package doc even claims "admins always allowed" (`rules.go:11-12`), which
  the code contradicts.
- **Impact:** an admin cannot `users.updateUser` / `users.logoutUser` /
  `users.removeClubFromUser` another account, nor `clubs.updateClub`,
  `clubs.suggestLineup`, `clubs.recruitYouthPlayers`, `players.updatePlayer`,
  `game.kickoffNew` on others' resources — all of which Node permits. Also,
  an admin editing **their own** account via `users.updateUser` is
  field-stripped to `FullName/Avatar/Age/Alerts`, whereas Node lets an admin
  write any field.
- **Repro (unit, no DB):** `Enforce(ctx, Rule{Kind: Self, Param:"id"}, Request{UserID:"boss", Param: id→"other"}, access{admins["boss"]=true})`
  → `403 "That is not your account"`; Node returns allow. No test covers
  admin+Self/Club/Player/Fixture (`policy_test.go:95-106` only tests `Kind: Admin`).
- **Fix:** after `found`/`admin` are known, `if admin { return Decision{Allowed:true} }`
  before the switch (keep the `Admin` rule's non-admin path returning
  `403 "Admins only"`, and do not apply `Keep` for admins).

### D2 — S2 — `requestPasswordReset` async work runs on a canceled context
- **File:** `apps/fs-pro-server-go/internal/user/handlers.go:257-281`
  (`ctx := r.Context()` at 264; `go func(){ … FindByEmail(ctx,…) … Tokens.Issue(ctx,…) … Mail.Send(ctx,…) }()` at 267-278).
- **Expected (Node):** `user.router.ts:230-246` fires an async IIFE with no
  request-context cancellation, so the reset email reliably sends after the
  response.
- **Actual:** net/http cancels `r.Context()` when `ServeHTTP` returns — i.e.
  immediately after this handler — and the goroutine (and the Resend
  `http.NewRequestWithContext`) inherits that cancelation, so the DB lookup
  and/or mail send frequently abort. `grep context.WithoutCancel` → 0 matches.
- **Impact:** `POST /api/users/forgot-password` can return 200 while never
  sending the reset email (silent user-facing failure).
- **Fix:** run the goroutine with `context.WithoutCancel(r.Context())` (plus its
  own timeout), not the request context.

### D3 — S3 — Welcome string differs from Node
- **File:** `internal/httpapi/routes.go:10` — `"<p>Welcome to FS PRO <i>Server</i></p> enjoy!"`.
- **Node:** `src/server.ts:151` — `"<p>Welcome to FS-PRO <i>Server</i></p> enjoy!"`.
- **Diff:** `FS PRO` (space) vs `FS-PRO` (hyphen). `TestWelcome`
  (`server_test.go:49-57`) compares against its own constant, so it cannot
  catch this.
- **Fix:** change the constant to `FS-PRO`.

### D4 — S3 — `Clubs` payloads omit the `AddressCountry` relation Node always injects
- **Files:** `internal/auth/club.go:28-34` (`SELECT * FROM "Clubs" WHERE "UserId"=$1`,
  no join) vs `src/repositories/drizzle/ClubRepository.ts:87-96` (`with:{ addressCountry: true }`)
  and `:49-51` (`...{ AddressCountry: remapId(addressCountry) }`).
- **Affected B1 responses:** `GET /api/users/{id}?populate=true` and
  `POST /api/users/{id}/add-clubs` (both use the reverse-FK list).
- **Impact:** `AddressCountry` is missing from each club in those payloads.
  `ClubSchema.AddressCountry` is optional (`schemas/club.ts:68`) so zod still
  passes, but a client reading it sees a difference. `NOTES.md` #7 defers the
  rest of relation injection to the clubs batch; `AddressCountry` is cheap and
  should not wait.
- **Fix (B2):** join `Places` on `AddressCountryId` (and inject
  `Players`/`Manager` where Node does).

### D5 — S3 — `sendVerification` is awaited (Node fires and forgets)
- **File:** `internal/user/handlers.go:96-111`; called synchronously at
  `:149` (join), `:344` (resend), `:388` (setEmail).
- **Node:** `user.router.ts:95,282,306` use `.catch(...)` without awaiting.
- **Impact:** with a real `RESEND_API_KEY`, `POST /api/users/join` blocks up to
  the 10s mail timeout before responding, unlike Node. (With the log-only
  sender it is instantaneous.)
- **Fix:** invoke it asynchronously with a non-request context (same shape as
  D2's fix).

### D6 — S3 (minor) — Set-Cookie lacks `Expires`
- **File:** `internal/session/manager.go:129-139`. Go's `http.Cookie` emits only
  `Max-Age` when `MaxAge>0`; express-session emits both `Expires` and `Max-Age`.
- Browsers treat these equivalently; header-level only. Low priority.

---

## What the doer must fix before B2

1. **D1 (blocker):** let admins bypass `Self`/`Club`/`Player`/`Fixture` in
   `policy.Enforce`, exactly like `route-policy.ts:257`; add unit tests for
   admin+Self / admin+Club / admin+Player / admin+Fixture (both another user's
   resource and the admin's own account). Every B2 domain (clubs/players/
   managers) uses these rule kinds, so this bug will silently break admin tooling
   and pollute the new tests.
2. **D2 (blocker):** stop using `r.Context()` for the fire-and-forget reset
   email; use `context.WithoutCancel` + timeout. Add a test (fake store/mailer)
   that asserts the work completes after the handler returns.
3. **D3:** fix the `FS-PRO` welcome constant and make `TestWelcome` pin the
   literal string (or compare to a fixture), not the constant.
4. **D4:** inject `AddressCountry` (and the other relations Node injects) in the
   club list reads used by `getUser?populate=true` / `addClubsToUser` when B2
   lands; don't leave B1 responses as a long-lived shape.
5. **D5:** make verification mail fire-and-forget (or at least non-blocking).
6. **Contract harness:** extend `CHECKED_PREFIXES` per batch so a whole missing
   domain cannot pass unnoticed; the current script already has a working
   negative control.

**Do not forget:** the full DB-backed acceptance (join→login→`GET /users/{id}`
→logout over the real `Sessions` table; Pass 2 zod response validation) is
**unverified here — no Postgres**. It remains a required gate before B2 can be
called done.
