# B5B — ops (phase 1)

## Error tracking — Sentry (done earlier)

Server `@sentry/node`, client `@sentry/vue`, both DSN-gated. Commit `2bd1dd8`.
Evidence: `vitest` 2/2, server `tsc` 0, client build OK.

## Backups + restore drill

`scripts/db-backup.sh` (compressed custom dump + prune) and
`scripts/db-restore.sh`. Drill (through the `postgres:17` image, matching prod):

```
dump fspro_b2c         -> DUMP_EXIT=0
create fspro_restore_test
restore                -> RESTORE_EXIT=0
tables  fspro_b2c=34  fspro_restore_test=34
Clubs   fspro_b2c=40  fspro_restore_test=40
```

Commit `8675be6`.

## Client CSP

`deploy/nginx.conf.template` now sends a `Content-Security-Policy`:
`default-src 'self'`; inline styles (Vuetify); Google + jsDelivr fonts/icons;
same-origin API/sockets; Sentry ingest. Commit `c296a7a`. **Validate on
staging** before tightening.

## Load test — 1,000 concurrent

`scripts/load-test.mjs` (dependency-free, Node global fetch).

```
BASE=http://localhost:3010 CONCURRENCY=1000 DURATION_MS=10000 \
PATHS=/api/tiles/0/3/1 node scripts/load-test.mjs
```

| Config | Requests | OK | Errors | rps | p50 | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| default (limiter **on**, 600/min) | 14,388 | 600 | 13,788 (429) | 1,375 | 555 ms | 1,105 ms | 3,315 ms |
| `RATE_LIMIT=off` | 6,000 | **6,000** | **0** | **540** | 1,441 ms | 3,639 ms | 3,791 ms |

Reading: with the limiter on, the API **sheds** excess load with 429 (the
intended backstop) — a 1,000-VU burst from one IP is far above 600/min. With it
off, the single local API node served 1,000 concurrent connections with **zero
errors** at 540 rps (p95 3.6 s). The bottleneck is the one Node process / one
load-generator, not correctness. Production spreads load across replicas
(`ROLE=web`) and keeps the limiter on.

Commit pending with this report.

## Not done

- Legal pages (owner skipped).
