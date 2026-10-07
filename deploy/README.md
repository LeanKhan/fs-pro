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
