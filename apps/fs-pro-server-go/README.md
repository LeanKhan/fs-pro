# fs-pro-server-go

Go port of the `apps/fs-pro-server` HTTP backend. **All 162 contract routes
registered** (B0–B5): meta (1), users (15), clubs (15), players (8), managers
(6), fixtures (4), calendar (11), seasons (5), awards (1), places (8), play
(11), game (6), facilities (6), program (13), transfers (10), editions (14),
challenges (6), competition-definitions (6), world (5), atlas (10), tiles (1).
See `NOTES.md` for the current real-vs-stub list.

## Run

```powershell
# no database: health reports down, database routes fail cleanly
$env:ENABLE_ROUTE_MANIFEST = "true"
go run ./cmd/server

# full: same Postgres as the Node server
$env:DATABASE_URL = "postgres://..."
$env:SESSION_SECRET = "<same secret as Node>"
go run ./cmd/server

# bind all interfaces (container/production parity; Node binds 0.0.0.0 in prod)
$env:HOST = "0.0.0.0"
```

Environment: `HOST` (127.0.0.1), `PORT` (3000), `DATABASE_URL`,
`SESSION_SECRET` (fallback `thisisasecret:)`), `LOG_LEVEL`, `NODE_ENV`,
`REMOTE_HOST`, `TRUST_PROXY`, `COOKIE_SECURE`, `CORS_ORIGINS`,
`ENABLE_ROUTE_MANIFEST`, `RATE_LIMIT`, `LEGACY_LOGIN_ENABLED`,
`ENABLE_PLAYER_GENERATION`, `GAME_TIME_SCALE`, `IMAGINATION_API_URL`,
`WORLD_SERVICE_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`.

## Endpoints

- `GET /healthz` — `200 {"ok":true}` / `503 {"ok":false}`
- `GET /` — welcome HTML
- `GET /api/meta/db` — `{"success":true,…, "payload":{"backend":"postgresql"}}`
- `GET /__routes` — route manifest (needs `ENABLE_ROUTE_MANIFEST=true`)
- All 162 contract routes across 21 domains (see `NOTES.md` for which are
  real vs declared stubs).
- `IMAGINATION_API_URL` configures the world reader used by
  `places/import-from-world`, `places/sync-from-world` and
  `places/resolve-anchor` (unset → those report the world as unreachable).

## Verify

```powershell
go mod tidy
go build ./...
go vet ./...
go test ./...
```

DB integration tests skip unless `DATABASE_URL` is set. See `contract-check/`
for the route-manifest diff against `@repo/api-contract`, and `NOTES.md` for
design decisions.
