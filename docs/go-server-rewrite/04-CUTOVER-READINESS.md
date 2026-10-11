# 04 — Node → Go Cutover Readiness

Status: **readiness + proof** (OW-D14 / `06` P10 "Node → Go cutover for all new
routes + the existing `/api/*`, decommission remaining Node timers"). A real
decommission is a deployment step; this document is the evidence and the runbook
for it.

Scope of this document:

- **Covered proof** — a runnable gate showing the Go `/__routes` manifest covers
  **every** `@repo/api-contract` route.
- **Node inventory** — exactly what the Node process still owns that Go does not.
- **Cutover sequence**, **rollback**, **data invariants**, and a
  **pre-decommission checklist**.
- **Superseded Node timers** and the flag that disables them.

Companion docs: [`03-VERIFICATION-AND-ROLLBACK.md`](./03-VERIFICATION-AND-ROLLBACK.md)
(parity/rollback protocols), [`01-MIGRATION-PHASES.md`](./01-MIGRATION-PHASES.md)
Phase 6, and the Go server's [`../../../apps/fs-pro-server-go/NOTES.md`](../../../apps/fs-pro-server-go/NOTES.md)
(real-vs-stub census).

---

## 1. Coverage proof — one-command gate

The gate boots a real `fs-pro-server-go` (no database needed), reads its
`GET /__routes` manifest and diffs it against the compiled `@repo/api-contract`
with the existing `contract-check/check-contract.mjs`. It exits `0` only when
**every** contract route is served by Go.

```powershell
# From the repo root. Cross-platform (Windows/PowerShell and POSIX shells):
node apps/fs-pro-server-go/contract-check/route-coverage-gate.mjs
```

The gate:

1. builds `@repo/api-contract` (`npm run build --workspace @repo/api-contract`);
2. builds `apps/fs-pro-server-go/cmd/server` to a temp binary;
3. starts it on an ephemeral port with `ENABLE_ROUTE_MANIFEST=true` and **no
   `DATABASE_URL`** (the manifest is DB-free — see `internal/httpapi/routes.go`);
4. runs `check-contract.mjs` against it, then stops the server and removes the
   temp binary.

Flags: `--skip-contract-build`, `--skip-go-build` (+`GATE_SERVER_BIN`),
`--port <n>`. It is also `npm run gate` inside
`apps/fs-pro-server-go/contract-check/`.

### Recorded PASS (this wave)

```text
> node apps/fs-pro-server-go/contract-check/route-coverage-gate.mjs
[gate] building @repo/api-contract ...

> @repo/api-contract@0.0.0 build
> tsc

[gate] building ./cmd/server ...
[gate] starting fs-pro-server.exe on http://127.0.0.1:50316 ...
[gate] manifest up: 211 route entries
PASS: 207 route(s) match of 207 contract route(s) (meta, users, clubs, players,
managers, fixtures, calendar, seasons, awards, places, play, game, facilities,
program, campus, grid, abilities, traits, orders, league, associations, season,
legacy, honours, transfers, editions, challenges, competitionDefinitions, world,
atlas, tiles, preseason).
```

`211` manifest entries = the **207** contract routes + **4** non-contract
entries (`GET /healthz`, `GET /{$}` welcome, `GET /metrics`,
`GET /__routes`). The gate also fails on an **unchecked contract route** (a
route id no checked domain prefix covers), so a new contract domain cannot be
silently skipped — this assertion was added to `check-contract.mjs` this wave.

`check-contract.mjs` compares **id → method, path, status set** for all 32
checked domains (it now prints `N route(s) match of N contract route(s)`).

---

## 2. Covered / uncovered matrix

### Covered — every `@repo/api-contract` route is served by Go

All **207** contract routes across **32** domains:

| Domain group | Routes | Notes |
| :--- | --: | :--- |
| `meta` | 1 | |
| `users` | 15 | session/auth surface ported; `Sessions` table shared with Node |
| `clubs` | 15 | |
| `players` | 8 | |
| `managers` | 6 | |
| `fixtures` | 4 | |
| `calendar` | 11 | clock/day reads + admin tick/heal/simulate |
| `seasons` | 5 | |
| `awards` | 1 | |
| `places` | 8 | |
| `play` | 14 | PLAY gate, raids, match plan, shop, board vault, defense log |
| `game` | 6 | kickoff / enqueue / replay reads |
| `facilities` | 6 | |
| `program` | 13 | owner-program + market |
| `campus` | 7 | |
| `grid` | 6 | |
| `abilities` / `traits` / `orders` | 2 / 2 / 2 | |
| `league` | 4 | |
| `associations` | 9 | |
| `season` / `legacy` / `honours` | 4 / 2 / 1 | |
| `transfers` | 10 | |
| `editions` | 14 | |
| `challenges` | 6 | |
| `competitionDefinitions` | 6 | |
| `world` | 5 | `endYear` / `advanceDay` are *reduced* ports (see `NOTES.md`) |
| `atlas` | 10 | |
| `tiles` | 1 | proxy to the world service |
| `preseason` | 3 | |

North-south of the contract, Go also serves `GET /healthz`, `GET /` (welcome)
and `GET /metrics` (Prometheus).

### Uncovered — Node-only surfaces (not in the contract, still in `apps/fs-pro-server`)

These are the **real blockers** for decommissioning the Node process. Paths as
mounted today (`src/server.ts`, `src/routers/index.ts`):

| Surface | Node file | What it does |
| :--- | :--- | :--- |
| `GET /api/auth/login` `/callback` `/session` `/logout` | `src/controllers/auth/sso.router.ts` | Imagination OAuth 2 + PKCE sign-in; session cookie set from the SSO callback. **The client signs in here** (`views/auth/login.vue`, `sso-complete.vue`, `club-game.vue`). |
| `POST /api/files/upload`, `POST /api/files/upload-clubs` | `src/services/file/file.service.ts` + `multer.config.ts` | Multipart uploads (crest/kit images, club CSV import) via `multer`; written under `assets/img`. **Client uses `/files/upload`** (`components/helpers/image-uploader.vue`). |
| `GET /api/players/:id/face`, `GET /api/managers/:id/face` | `src/controllers/players/player-face.router.ts`, `.../managers/manager-face.router.ts` | Generated SVG avatars via `services/worldgen`. **Client uses both** (`player-avatar.vue`, `manager-avatar.vue`). |
| `GET /api/services/worldgen/faces` `/names` `/names/family` `/health` | `src/controllers/services/services.router.ts` | HTTP surface over the `worldgen` Go microservice. |
| `GET /api/crests/:file`, `GET /api/kits/:file` | `src/controllers/world/atlas.router.ts` (`crestRouter`, `kitRouter`) | Club crest/kit SVG (or redirect to static PNG). **Client uses both** (`helpers/crest.ts`, `plugins/customIcons.ts`). |
| `GET /api/realtime/ticket`, `.../mod/reports, /mod/mute, /mod/unmute` | `src/controllers/realtime/realtime.router.ts` | Mints the signed WebSocket ticket for the (already-Go) gateway `apps/fs-pro-realtime`, and relays admin moderation. **Client needs `/api/realtime/ticket`** (`services/realtime.ts`). |
| `GET /api/random-test` | `src/routers/index.ts` | Dev echo route. |
| `GET /api-docs`, `GET /api-docs.json` | `src/server.ts` (`swagger-ui-express`) | Swagger UI, dev only (`NODE_ENV=dev` / `ENABLE_API_DOCS=true`). |
| Static mount `/img/*` (`express.static('assets')`) | `src/server.ts` | Serves `assets/img` (club kits/logos referenced as `${api}/img/...`). |
| Socket.IO `/socket.io/*` + `/match-replay` namespace | `src/realtime/{io,matchBroadcaster,frameInterpolation,packedFrames}.ts` | Live match-replay frame streaming at kickoff. The client's Matchzone reads saved replays over HTTP (`game.getReplay`, already Go); the socket re-stream is the Node-only live path. |
| Blocking world timers (3 × `setInterval`) | `src/services/{calendar,facilities,world}` | See §4. |
| Sentry error tracking | `src/helpers/error-tracking.ts` | Node-only; Go uses `slog` + `/metrics`. |

Everything else under `/api/*` is a contract route and is served by Go.

---

## 3. Node inventory — files Go does not replace

- **Non-contract routers**: `src/controllers/auth/sso.router.ts`,
  `src/controllers/realtime/realtime.router.ts`,
  `src/controllers/players/player-face.router.ts`,
  `src/controllers/managers/manager-face.router.ts`,
  `src/controllers/services/services.router.ts`,
  `src/controllers/world/atlas.router.ts` (`crestRouter`/`kitRouter`),
  `src/services/file/file.service.ts` (+ `multer.config.ts`).
- **Realtime**: `src/realtime/io.ts`, `matchBroadcaster.ts`,
  `frameInterpolation.ts`, `packedFrames.ts`, `world-events.ts`,
  `open-play-events.ts`.
- **World daemons**: `src/services/calendar/calendar-clock.service.ts`,
  `src/services/facilities/facilities.service.ts`,
  `src/services/world/ai-world.service.ts` (started in `src/server.ts`).
- **Wiring**: `src/server.ts` (Socket.IO, session middleware, static assets,
  SSO mount, `createExpressEndpoints`), `src/routers/index.ts`,
  `src/sessionStore.ts`.
- **Static**: `apps/fs-pro-server/assets/img/**`.

The Go server already reuses the same **`Sessions`** table with a
byte-compatible `fspro.sid` cookie (`internal/session/session.go`: `s:<sid>.<sig>`
HMAC-SHA256, percent-decoded cookie), so session auth is *shared*, not Node-only.

---

## 4. Superseded Node timers (disable at cutover)

Node runs exactly **three** `setInterval` world daemons (grep of
`apps/fs-pro-server/src`, this wave). Mapping to the Go daemon
`apps/fs-pro-server-go/cmd/world-worker` (tickers registered in
`cmd/world-worker/main.go`; jobs in `internal/worldworker/*.go`):

| Node timer | File / line | Interval | Go ticker | Superseded? |
| :--- | :--- | :--- | :--- | :--- |
| Facilities sweep (`completeDueUpgrades`) | `services/facilities/facilities.service.ts:253-264` | 15 s | **`builders`** (`campus.SweepDueUpgrades`, 5 s) | **Yes** |
| Live world clock (`runWorldHour` → schedules/plays fixtures, advances the day) | `services/calendar/calendar-clock.service.ts:208-213` | 15 s poll | — none — | **No** |
| AI world (`playWorldMatches` + `investInFacilities`) | `services/world/ai-world.service.ts:192-212` | `WORLD_TICK_MINUTES`=10 | — none — | **No** |

The Go worker's other tickers — `defenses` (5 s), `shields` (30 s), `league`
(1 h, `association` 1 min) — resolve the **new** CoC systems (raids, Rest
Window/Warm-up Guard, weekly ladder rollover, derby transitions). Those systems
have **no Node equivalent**, so there is nothing in Node for them to supersede;
they are additive.

**How to disable (do not delete — the Node process is still running):**

- **All three at once**: run the Node tier with `ROLE=web` (`src/server.ts`
  skips `startCalendarClock` / `startFacilitiesSweep` / `startWorldTick`). This
  is the correct cutover setting **only** once the clock and AI-world jobs are
  covered — today they are not (see §8).
- **AI world only**: `WORLD_TICK_MINUTES=0` (honoured inside
  `ai-world.service.ts`).
- There is **no** env to disable the facilities sweep or the calendar clock
  individually; both are gated only by `ROLE`.

Consequence for the current state: the `builders` ticker lets you set
`ROLE=web` **only if** you accept stopping the live clock and AI world, or after
porting them. Until then, keep a single Node `ROLE=worker` (or unset) instance
for those two jobs.

The Go worker is safe to run alongside Node at any time: every tick takes a
`pg_try_advisory_lock` and every effect is a guarded, idempotent write
(`internal/worldworker/registry.go`, `internal/worldworker/lock.go`), so two
workers cannot double-apply a tick; the `builders` sweep and Node's
`completeDueUpgrades` are both idempotent single-statement promotions.

---

## 5. Reverse-proxy cutover sequence

The current production gateway (`deploy/nginx.conf.template`) proxies
`/(api|api-docs|api-docs.json|socket.io)` to `${SERVER_HOST}:3000` (Node) and
`/realtime/` to the (already-Go) realtime gateway. The cutover adds a Go
upstream and routes the **uncovered** `/api/*` paths to Node explicitly, with a
longest-prefix `/api/` catch-all to Go.

```nginx
upstream fspro_node { server ${SERVER_HOST}:3000; }
upstream fspro_go   { server ${GO_HOST}:3001; }     # apps/fs-pro-server-go

server {
  # --- Keep the Node-only surfaces on Node (see §2) ---
  location ~ ^/api/(auth|files|services|crests|kits|realtime|random-test)(/|$) {
    proxy_pass http://fspro_node;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $forwarded_proto;
  }
  location ~ ^/api/(players|managers)/[^/]+/face$ { proxy_pass http://fspro_node; }
  location ~ ^/api-docs(/|$) { proxy_pass http://fspro_node; }
  location /socket.io/ { proxy_pass http://fspro_node; }   # match-replay broadcaster
  location /img/       { proxy_pass http://fspro_node; }   # uploaded assets

  # --- All 207 contract routes now go to Go ---
  location /api/ {
    proxy_pass http://fspro_go;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $forwarded_proto;
    proxy_read_timeout 120s;
  }

  # --- Realtime WebSocket gateway (already Go) ---
  location /realtime/ {
    proxy_pass http://${REALTIME_HOST}:3005/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
  }
}
```

Nginx resolves locations by **longest prefix**, so the specific Node locations
win over the `/api/` catch-all regardless of order. Both upstreams must run with
the **same `DATABASE_URL`, `SESSION_SECRET`, `REALTIME_SECRET`, `TRUST_PROXY`
and `COOKIE_SECURE`**.

Sequence:

1. Deploy `apps/fs-pro-server-go` (bind `HOST=0.0.0.0`, `PORT=3001`) next to
   Node. Verify on the Go instance directly: `GET /healthz` → `200 {"ok":true}`
   and the gate against it (`contract-check`).
2. Run the Go worker (`go run ./cmd/world-worker` or the built daemon) and
   `--dry-run` first to confirm the ticker set.
3. Warmup: hit the Go instance for a few read routes and compare a
   representative set to Node (`03` §1 dual-run/differential).
4. Apply the nginx config above and `nginx -s reload` (or `docker exec <nginx>
   nginx -s reload`). This is a config reload — no dropped listener.
5. Watch `5xx` rate, `/metrics` latency, and the Node `Sessions`/table write
   counters for one soak window.

---

## 6. Rollback (from `03-VERIFICATION-AND-ROLLBACK.md`)

Rollback is a reverse-proxy change, nothing more:

- Revert the `/api/` `location` to `proxy_pass http://fspro_node;` (or remove
  the Go upstream block) and `nginx -s reload`. ≤ the same config-reload window;
  in-flight requests drain, new requests immediately hit Node.
- Because both processes share one Postgres and one `Sessions` table, a rollback
  needs **no data migration and no re-login**: a session cookie minted under Go
  validates under Node and vice-versa (identical `fspro.sid` signature and
  `SESSION_SECRET`). Only an in-flight write that was mid-request is affected.
- Keep the Go process (API + worker) running but unreferenced; it must be
  idempotent against a Node-driven world. The `builders` sweep and Node's
  `completeDueUpgrades` are both idempotent promotions, so switching which
  process sweeps is safe.
- Env flags for the partially-cut-over pieces: `ROLE=web/worker` (Node timers)
  and the client/realtime flags in `03` §3 (`REALTIME_URL=off` disables Go's
  publisher → durable-inbox-only).

---

## 7. Data invariants

1. **One PostgreSQL** is the single source of truth; no table is dropped and no
   column is changed incompatibly (`05` §8 / `03` §3.3). Both Node (Drizzle)
   and Go (`pgx`) read/write the same DDL.
2. **Sessions are shared**, not replicated: `Sessions(sid, session, expires)`,
   cookie `fspro.sid`, signed `s:<sid>.<hmac-sha256>` under the same
   `SESSION_SECRET` (`apps/fs-pro-server/src/sessionStore.ts`,
   `apps/fs-pro-server-go/internal/session/session.go`).
3. **Idempotent worker writes**: every Go worker effect is anchored by a guarded
   / once-only row (builder promotion, `RankingResults`, `Raids`/`RaidResults`,
   `StandingResults`) so a crash, retry, or Node/Go overlap cannot double-apply.
4. **Writes the two processes share today**: `Fixtures`, `MatchReplays`,
   `ClubAssets`, `TransferLedger`, `ClubMessages`, `Clubs`/`Players`, `Sessions`,
   `Rankings`. Go's ports match Node's column selection and coercion
   (`internal/db` normalization; see `NOTES.md`).
5. **JSON is byte-compatible at the boundary**: integer-width and `float32`
   normalization, NaN/Inf → `null`, and JSONB decode parity are pinned by Go
   tests (`internal/db`).
6. **No simulation-state leakage**: match state lives only for the duration of a
   request/worker job; only structured results persist (AGENTS.md).

---

## 8. Pre-decommission checklist (must be green)

- [ ] **Coverage gate** green:
      `node apps/fs-pro-server-go/contract-check/route-coverage-gate.mjs`
      → `PASS: 207 route(s) match of 207 contract route(s)`. *(green this wave)*
- [ ] `cd apps/fs-pro-server-go && go build ./... && go vet ./... && go test ./...`
      all green. *(green this wave)*
- [ ] `go test -race ./...` green in `golang:1.24-bookworm` (`06` P10 exit).
- [ ] **Session parity**: a cookie minted by Node for `fspro.sid` authenticates
      against Go (shared `Sessions` + same secret); and vice-versa.
- [ ] **Covered the Node-only contract surfaces** (§2), by porting to Go *or*
      deliberately retiring each: `/api/auth/*` (SSO), `/api/files/*`
      (multipart), `/api/{players,managers}/:id/face`, `/api/services/worldgen/*`,
      `/api/crests`, `/api/kits`, `/img/*`, `/api/realtime/*`, `/api-docs`.
- [ ] **Realtime ticket** issuance ported (or the Node route kept behind the
      gateway) — the client calls `GET /api/realtime/ticket`.
- [ ] **Match-replay broadcaster** decision: port the Socket.IO `/match-replay`
      path to Go, or confirm the client only uses the HTTP `game.getReplay`
      route (it does today) and retire the socket namespace.
- [ ] **World timers covered**: `calendar-clock` and `ai-world` have Go
      `cmd/world-worker` equivalents (today they do **not**), so Node `ROLE=web`
      can be set without stopping world progression.
- [ ] **Differential soak** on the migrated read set against the same DB
      (`03` §1) with no unexplained diffs (the documented WARNs in `NOTES.md`
      are acceptable).
- [ ] **Rollback rehearsed**: `nginx -s reload` back to Node verified on staging.
- [ ] **Load/throughput** targets recorded (`03` §2, `06` benchmarks).

---

## 9. Known gaps (what still blocks a real Node decommission)

1. **SSO sign-in** (`/api/auth/*`) is Node-only; the client's login flow
   depends on it. Port the Imagination OAuth + PKCE handler (and the
   `sso` session key) or run a thin auth gateway.
2. **Multipart upload** (`/api/files/*`) is Node-only; the client's image
   uploader and CSV club import use it. Needs a Go multipart handler writing to
   the same `assets/img` location (or object storage).
3. **Generated assets** (`faces`, `services/worldgen`, `crests`, `kits`, `/img`)
   are Node-only; the client fetches them directly. Port the `worldgen`
   proxies/SVG re-render, or serve them from the worldgen service through the
   gateway.
4. **Realtime ticket + moderation relay** (`/api/realtime/*`) is Node-only even
   though the gateway (`apps/fs-pro-realtime`) is Go. Ticket minting is a small
   port; it gates live chat/notifications for the client.
5. **Live match-replay broadcaster** (Socket.IO `/match-replay`) has no Go
   equivalent. The current client plays replays over HTTP (`game.getReplay`),
   so this may be retirable rather than ported — confirm before removing.
6. **World clock + AI-world Node timers are not superseded.** Only the
   facilities/`builders` sweep is. `calendar-clock.service.ts` (live world
   advance) and `ai-world.service.ts` (AI matches + facility investment) have no
   `cmd/world-worker` ticker yet, so `ROLE=web` cannot be set without pausing
   world progression — the single biggest blocker.
7. **Dev-only surfaces** (`/api-docs`, `/api/random-test`) can simply be dropped
   in production; listed for completeness.
8. **Node's own `tsc` build is red** (pre-existing, `OW-F07`): stale TS routers
   in `src/controllers/play/play.router.ts` and `src/routers/index.ts` are typed
   against an older contract and no longer compile. The running process is
   unaffected (dev runs `ts-node-dev --transpile-only`), but `npm run prod`
   (`tsc && node build/server.js`) cannot build — so the Node image is already
   `ts-node`-based. Not a regression from this work.

---

## 10. Evidence (commands + output)

```text
> node apps/fs-pro-server-go/contract-check/route-coverage-gate.mjs
PASS: 207 route(s) match of 207 contract route(s) (...32 domains...)
gate exit=0

> cd apps/fs-pro-server-go; go build ./...   -> exit 0
> go vet ./...                                -> exit 0
> go test ./...                               -> ok across all packages, exit 0

> npm.cmd run test --workspace fs-pro-server
Test Files  16 passed (16)
     Tests  157 passed (157)      -> exit 0

> npm.cmd run lint --workspace fs-pro-server
2 pre-existing unicorn(no-new-array) errors (matchday-runner.service.ts,
lineup-advisor.service.ts) — untouched files, exit 1

> npm.cmd run build --workspace fs-pro-server   # tsc
2 pre-existing errors: src/controllers/play/play.router.ts,
src/routers/index.ts (stale routers vs the current contract) — OW-F07, exit 2
```

The Node app is **unchanged** by this wave (no file under
`apps/fs-pro-server/**` was edited): its test suite is green, and the lint/tsc
failures above are pre-existing and unrelated to the cutover.
