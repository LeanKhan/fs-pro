# Deploying fs-pro

One host, Docker Compose. Five long-running containers plus a migration job:

| Service | What | Reachable from |
| --- | --- | --- |
| `web` | nginx: the built client, and a proxy for `/api`, `/socket.io` and `/realtime` | the internet (the only published port) |
| `server` | API, calendar clock, world tick | `web` |
| `sim` | Go service + Rust `sim-cli`; **every match needs it** | `server` |
| `realtime` | WebSocket gateway (presence, chat, world events) | `web` |
| `db` | Postgres 17 | `server`, `migrate` |
| `migrate` | one-shot: applies migrations, then exits | — |

## Dokploy with an external database

Use `compose.dokploy.yaml` instead of `compose.prod.yaml`: it has no bundled
Postgres and publishes no port, and it joins Dokploy's `dokploy-network`.

1. Create a Postgres database in Dokploy. Note its internal host (its app
   name) and build `DATABASE_URL=postgresql://user:password@<app-name>:5432/<db>`.
2. Create a **Compose** service from this repo with Compose Path
   `./compose.dokploy.yaml`.
3. In its Environment tab set `DATABASE_URL`, `PUBLIC_HOST`, `SESSION_SECRET`
   and `REALTIME_SECRET` (see `.env.production.example`).
4. Under Domains add `PUBLIC_HOST` -> service `fspro-web`, port `80`, HTTPS on.
5. Deploy. `migrate` runs first. If the database already had its migrations
   applied by hand, baseline it first (see Migrations below).

Service names are prefixed `fspro-` because they share `dokploy-network` with
your other projects, where a plain `server` or `sim` could resolve to someone
else's container. A database reached by a public host and port instead of its
internal name works too; the `dokploy-network` link is then simply unused.

## First deploy

```sh
cp .env.production.example .env.production   # fill it in
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

Put TLS in front of `web` (Caddy, a load balancer, Cloudflare). The server is
configured for that: `TRUST_PROXY=1` and `COOKIE_SECURE=true`, so the session
cookie only travels over HTTPS and the site must be served as
`https://$PUBLIC_HOST`.

## Updating

Run the same `up -d --build`. `migrate` runs first on every deploy and is safe
to repeat.

## Migrations

Migrations 0015 onwards are hand-written SQL that drizzle's journal doesn't
list, so `drizzle-kit migrate` alone leaves most of the schema missing.
`apply-sql-migrations.ts` runs them in order and records each in
`"SqlMigrations"`.

**A database that already has them applied by hand** (for example one set up
with the old `run-00NN-migration.ts` scripts) needs a one-off baseline before
its first deploy, or they would run a second time:

```sh
docker compose -f compose.prod.yaml --env-file .env.production run --rm \
  -e BASELINE=1 migrate sh -c "npx ts-node --transpile-only src/scripts/migration/apply-sql-migrations.ts"
```

## Notes

- Uploaded images and logs are written inside the `server` container and are
  lost when it is recreated. Mount a volume on `apps/fs-pro-server/assets` if
  you rely on uploads.
- With more than one `server` instance, run the extras with `ROLE=web` so only
  one runs the clock and world tick.
- Single sign-on (Imaginations) and player faces (worldgen) are optional; leave
  their variables empty to run without them.

## Email (Resend)

Sign-up confirmation and password reset go out through Resend.

1. In Resend, add your sending domain and publish the DNS records it shows
   (SPF and DKIM). Mail from an unverified domain is rejected.
2. Create an API key with sending access.
3. Set `RESEND_API_KEY` and `MAIL_FROM` (for example
   `FS Pro <noreply@play.example.com>`). Links in the emails point at
   `https://$PUBLIC_HOST`.
4. Send yourself a test: sign up with your own address and open the link.

Without `RESEND_API_KEY` in production nothing is sent and the server logs an
error, so nobody could confirm an email or reset a password: set it before
launch. Outside production the email is printed in the server log instead.

New accounts must confirm their email before founding a club
(`REQUIRE_VERIFIED_EMAIL`, on by default in the compose files). Admins and
imagination-login accounts are exempt. Existing accounts can add an email in
Settings; they keep their clubs either way.

Resend's failures (a rejected key, an unverified domain) are logged as
`[mail] Resend rejected ...` with the reason from Resend.

## Hardening that ships with the server

- **Rate limits** (`apps/fs-pro-server/src/middleware/hardening.ts`): login 20 per
  15 min per address and 8 per account, sign-up 5 per hour per address, club
  founding 10 per hour, and 600 requests a minute for everything else. They
  are counted per process, in memory.
- **`TRUST_PROXY` must equal the number of proxies in front of the server**
  (nginx counts as one). If it is too low, every player shares one address and
  the limits lock everyone out together; if too high, clients can fake theirs.
  The compose files default to 2 (nginx plus Traefik or another TLS proxy).
- **API docs are off in production.** `ENABLE_API_DOCS=true` turns them on.
- **`GET /healthz`** checks the process and the database; the compose files use
  it as the server's container health check.
- **Still to do:** email and password reset, chat moderation, a
  Content-Security-Policy for the client, error tracking and backups.
- **CI** (`.github/workflows/ci.yml`) typechecks the server, builds the client,
  runs the Rust and Go tests and builds the production images on every push.
