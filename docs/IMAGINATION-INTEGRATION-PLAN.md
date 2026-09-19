# Plan: Imagination as the entry point for fs-pro (identity + shared world data)

## Context
`imagination` (Go API + Vue worldmap, Postgres, `../imagination`) should become the front door: accounts are created and authenticated there, and `fs-pro` (Node/Express + ts-rest, Drizzle/Postgres, express-session) becomes a relying app. fs-pro also reads world data (places for clubs), publishes match results, and follows the world clock. Repos stay separate; integration is over HTTP (matches imagination's WORLD-DESIGN.md).

Decisions made: OIDC-style redirect login; migrate existing fs-pro users into imagination; share places, match-result events, and the world clock.

Current state found:
- imagination `internal/auth/auth.go` is a no-op middleware; no users table (migrations 0001-0003). Entity/event/clock endpoints already exist at `/api/v1/worlds/{id}/{entities,events,clock}` (`internal/router/router.go`).
- fs-pro-server owns auth in `src/controllers/user/user.router.ts` (joinUser/login), `src/utils/auth.ts` (bcryptjs cost 10), express-session cookie `fspro.sid` shared with Socket.IO (`src/server.ts:69-90`). `Clubs.UserId` -> `Users`.

## Phase 1: Imagination becomes an identity provider (Go)
1. Migration `0004_accounts.sql`: `accounts` (id uuid, username unique, display_name, password_hash, created_at, legacy_fspro_id nullable), `oauth_clients` (fs-pro registered, redirect URIs), `auth_codes` (short-lived, PKCE challenge), `signing_keys`/config for RS256.
2. `internal/auth`: register/login handlers (bcrypt via `golang.org/x/crypto`, verifies existing fs-pro hashes as-is), imagination session cookie, and OIDC endpoints: `GET /oauth/authorize` (PKCE code flow), `POST /oauth/token`, `GET /.well-known/jwks.json`, `GET /oauth/userinfo`. Access token = short-lived RS256 JWT (`sub` = account id, `username`).
3. Replace the pass-through `auth.Middleware` with real verification for write routes; keep read/wiki routes public. Bind/CORS settings updated for cross-origin cookies.
4. worldmap (Vue): login/register views + "Play football" launcher that goes through `/oauth/authorize` for the fs-pro client.

## Phase 2: fs-pro-server as OIDC client
1. Add `GET /api/auth/login` (redirect to imagination with PKCE + state), `GET /api/auth/callback` (exchange code, verify JWT against JWKS via `jose`), then set `req.session.userID` exactly as today so Socket.IO session sharing (`io.engine.use(Session)`) keeps working. Logout also ends the imagination session.
2. Drizzle migration: add `Users.accountId` (uuid, unique). On first callback, upsert a thin local `Users` row keyed by `accountId` (keeps `Clubs.UserId` FK). Stop using `Password`/`joinUser` credentials; remove/redirect the old login and signup routes and update the ts-rest contract in `packages/api-contract`.
3. Client (`apps/fs-pro-client`): replace `views/auth/login.vue` with a redirect to `/api/auth/login`; keep club-picking onboarding after first login.
4. Move the hardcoded session secret (`src/server.ts`) to env while here.

## Phase 3: One-time user migration
Script in fs-pro-server (`src/scripts/`) that copies `Users` (username, bcrypt hash, fullname) into imagination `accounts` (writes `legacy_fspro_id`), then sets `Users.accountId`. Idempotent, dry-run flag, reports collisions. Take a DB backup first; do not run against real data without confirmation.

## Phase 4: Shared world data
1. Places for clubs: add `homePlaceId`/`stadiumPlaceId` to Clubs (Drizzle migration + admin form place picker reading `GET /api/worlds/{id}/places`). New `src/services/worldClient.ts` in fs-pro-server wraps imagination HTTP calls (base URL + service credential via client-credentials grant).
2. Register clubs as entities: upsert `{system:"football", entityType:"club", externalId, homePlaceId, stadiumPlaceId, url}` on club create/update; store the returned registry ID on the club.
3. Match results: durable outbox table in fs-pro (Postgres) + worker that posts `football.match.completed` with stable source event ID, retrying until acknowledged; enqueue at match end (`Match` end path in `src/simulation`).
4. World clock: fs-pro reads `GET /clock` and gates its day/season advance (`endSeasonCycle` flow) to the world day, initially read-only/one-directional so fs-pro cannot desync the world; advance stays owned by imagination.
5. Dev ergonomics: root script/compose to start both stacks, deep links club <-> place.

## Critical files
- imagination: `internal/auth/auth.go`, `internal/router/router.go`, `internal/database/migrations/`, `apps/worldmap/src` (views/router)
- fs-pro: `apps/fs-pro-server/src/server.ts`, `src/controllers/user/user.router.ts`, `src/utils/auth.ts`, `src/db/drizzle/` (schema + migrations), `packages/api-contract`, `apps/fs-pro-client/src/views/auth/login.vue`, club model/service/admin form

## Verification
- Go: `go test ./...` with `TEST_DATABASE_URL`; tests for PKCE flow, token expiry, JWKS rotation, bad redirect URI/state.
- fs-pro: `tsc`/`vue-tsc`, then live end-to-end run of both stacks: register in worldmap -> launch fs-pro -> lands logged in with session; Socket.IO live-match connection authenticated; logout in one logs out both.
- Migration script: dry-run on a copy of the dev DB, verify user counts, that an old password still logs in, and Clubs ownership intact.
- Shared data: create a club with a place, confirm entity appears in imagination; play a match, confirm exactly one event even after forced outbox retries; clock read reflected in fs-pro.

## Suggested order / risks
Phases 1-3 first (identity is the entry point) and shippable alone; Phase 4 items are independent afterwards. Risks: cross-origin cookies/CORS across the two origins (use one parent domain or reverse proxy in dev), key management for JWT signing, and keeping the old fs-pro login working behind a flag until migration is verified.
