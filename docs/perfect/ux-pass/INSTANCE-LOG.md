# INSTANCE-LOG.md — shared playtest instance (Agent 0A, Pass 0)

The one instance the whole UX pass plays on (U3). Everything here runs against
the scratch database **`fspro_playtest`**; the dev database `fspro` is
**read-only** (only `pg_dump`ed). All timestamps are **UTC** (the Windows host
is UTC−5; server logs print local time).

- Integration branch: **`ux/integration`** (never touched `main`).
- **Client production build commit: `e4db26c`** (repo HEAD when the client was
  built; client/server/Go/Rust sources are identical to `218bf73` — the only
  commits on top are the UX-pass docs and the 0B harness).
- Status: **UP** since 2026-10-08T11:02Z. Smoke test PASS. Admin ready for A01.

---

## 1. Database

| | |
| --- | --- |
| Name | `fspro_playtest` |
| Host | `localhost:5434` (Docker container `fs-pro-db-1`, image `postgres:17`) |
| URL | `postgresql://fspro:superpassword@localhost:5434/fspro_playtest` |
| Created from | read-only `pg_dump -Fc` of `fspro` (28 MB custom-format dump, taken 10:56Z) |
| Size after seed | 107 MB |
| Content | 11 countries, 24 cities, 24 districts, 50 clubs, 5,006 free-agent players, 1,001 free managers, 13 users (2 admin), 29 migrations |

**Recipe (exact):**

```bat
REM dump (read-only; never writes to fspro) - host Windows Docker CLI
docker run --rm --network fs-pro_default -v <dumpdir>:/backups postgres:17-alpine ^
  pg_dump "postgresql://fspro:superpassword@db:5432/fspro" -Fc -f /backups/fspro.dump

docker run --rm --network fs-pro_default -v <dumpdir>:/backups postgres:17-alpine sh -c ^
  "psql -h db -U fspro -d postgres -c 'DROP DATABASE IF EXISTS fspro_playtest;' && psql -h db -U fspro -d postgres -c 'CREATE DATABASE fspro_playtest OWNER fspro;' && pg_restore -h db -U fspro -d fspro_playtest --no-owner --no-privileges /backups/fspro.dump"
```

Both Postgres commands run in the `postgres:17-alpine` Docker image (the WSL
`pg_dump` 16 cannot read a v17 server); `db` is the `fs-pro_default` network
alias for `fs-pro-db-1`. The dump mount path is passed with `wslpath -w`.

### 1.1 Migrations — deviation from D2 (recorded)

The dev DB `fspro` turned out to be at the **pre-0038 schema** (Clubs still had
`TownId`, no `OwnerProgram`/`PlaceInvites`/`PlaceStats`, no `SqlMigrations`
ledger), not at 0041 as D2 assumed. Applying only 0042/0043 would have failed
against it. I therefore applied **all remaining hand-written migrations
0038–0043** and recorded a baseline so the app's runner is a no-op:

1. Created `SqlMigrations` and **baselined 0015–0037** (already present in the
   `fspro` schema, confirmed column by column).
2. Applied, in order and one transaction each, `0038_world_districts.sql`,
   `0039_perf_indexes.sql`, `0040_tile_revisions_trigger.sql`,
   `0041_clubs_district_index.sql`, `0042_owner_program.sql`,
   `0043_places_culture.sql`, recording each name in `SqlMigrations` (29 rows).

Verified after: `Clubs.DistrictId` (no `TownId`), `Places.CultureId`,
`OwnerProgram`, `PlaceInvites`, `PlaceStats`, `WorldSeed`, 24 districts, 50
backfilled `OwnerProgram` rows.

### 1.2 World seed and launch setup

```bat
REM world seed (idempotent; needs worldgen up)
cd C:\done\fs-pro\apps\fs-pro-server
set DATABASE_URL=postgresql://fspro:superpassword@localhost:5434/fspro_playtest
set WORLDGEN_SERVICE_URL=http://localhost:3004
npx ts-node --transpile-only src/scripts/checkWorldSeed.ts
REM -> before: 144 free players / 3 managers
REM -> run 1: +4856 / +997  -> 5000 / 1000
REM -> run 2: +0 / +0       -> idempotent; histograms match B2-2C-REPORT.md §6.3

REM launch setup: creates the A01 admin, sets clock live, ensures competitions
set ADMIN_EMAIL=admin@fspro.playtest
set ADMIN_PASSWORD=Playtest-Admin-2026!
set ADMIN_USERNAME=playtestadmin
set ADMIN_FULLNAME=Playtest Admin
npx ts-node --transpile-only src/scripts/launch-setup.ts
REM -> admin created; Amateur Cup edition already live
```

`0038`–`0043` were applied with `psql -v ON_ERROR_STOP=1 -1 -f` in the
`postgres:17-alpine` image; the `SqlMigrations` rows were inserted alongside.

---

## 2. Services (all Windows-native processes; WSL reaches them through Windows `curl`)

| # | Service | Port | Bind | PID | Launch | Env (beyond defaults) |
| - | ------- | ---- | ---- | --- | ------ | --------------------- |
| 1 | Go `worldgen` | 3004 | 127.0.0.1 | 52084 | `.playtest-runtime\run-worldgen.bat` | `WORLDGEN_SERVICE_PORT=3004` |
| 2 | Go `world-service` | 3016 | 127.0.0.1 | 53004 | `run-world-service.bat` | `WORLD_SERVICE_PORT=3016`, `DATABASE_URL=.../fspro_playtest`, `LOG_LEVEL=info` |
| 3 | Rust engine + Go `sim-service` | 5050 | 127.0.0.1 | 20712 | `run-sim.bat` | `PORT=5050`, `SIM_CORE_DLL_PATH=C:\done\fs-pro\.playtest-runtime\sim_core.dll` (R9 copy) |
| 4 | Go `realtime` gateway | 3005 | 0.0.0.0 | 15532 | `run-realtime.bat` | `REALTIME_PORT=3005`, `REALTIME_SECRET=fs-pro-playtest-realtime-secret` |
| 5 | Node API (web) | 3010 | 0.0.0.0 | 50360 | `run-api-web.bat` | `NODE_ENV=dev`, `ROLE=web`, `DATABASE_URL`, `WORLD_SERVICE_URL=http://localhost:3016`, `WORLDGEN_SERVICE_URL=http://localhost:3004`, `SIM_SERVICE_URL=http://localhost:5050`, `REALTIME_URL=http://localhost:3005`, `REALTIME_SECRET=...`, `GAME_TIME_SCALE=4`, `RATE_LIMIT=off`, `FSPRO_CLIENT_URL=http://localhost:4173` |
| 6 | Node API (worker) | 3011 | 0.0.0.0 | 30784 | `run-api-worker.bat` | same as #5 but `PORT=3011`, `ROLE=worker` |
| 7 | Client (production build) | 4173 | 127.0.0.1 | 34804 | `run-client-preview.bat` | build-time `VITE_APP_API_BASE_URL=http://localhost:3010` |

Health (verified through Windows `curl`):

```
3004/health  {"status":"ok","service":"fs-pro-worldgen",...}
3016/health  {"status":"ok","service":"fs-pro-world-service","database":"up",...}
5050/health  {"status":"ok","service":"fs-pro-sim-service","engine":"rust-sim-core",...}
3005/healthz {"ok":true}
3010/healthz {"ok":true}
3011/healthz {"ok":true}
4173/        HTTP 200
```

**Why two Node APIs.** The brief says `ROLE=web` on 3010, but `ROLE=web`
disables the calendar clock, facilities sweep and AI world tick
(`apps/fs-pro-server/src/server.ts:220`). Without them the world never advances
and no league fixtures are played, so D4/D5 could not work. I run the briefed
`ROLE=web` instance on **3010** and a second `ROLE=worker` instance on **3011**
(leases make them safe together). This is the production split the code
documents, not a new feature.

**Builds.** `.playtest-runtime\build-go.bat` (Go 1.24.5 windows/amd64,
`GOTOOLCHAIN=local`) and `.playtest-runtime\build-node.bat`
(`npm run build --workspace @repo/api-contract`, `npx tsc`, then
`npm run build --workspace fs-pro-client` with the VITE base URL). Client build
verified: `dist/index.html` exists and the bundle contains
`http://localhost:3010`.

The service `.bat` files and logs live in the untracked, git-excluded
`.playtest-runtime/` directory; `start-backends.ps1`, `start-app.ps1`,
`start-web-client.ps1` start them detached via `Start-Process -WindowStyle
Hidden`. Logs: `.playtest-runtime/logs/<service>.log`.

---

## 3. Time scale (D3)

**Chosen values: `GAME_TIME_SCALE=4` and `Calendars.DayLengthMinutes=48`**
(`ClockMode='live'`, `LevelThresholds=null`, `XPPerMatch=null`).

**Reasoning.** Level 2 is 400 XP (default curve `100·n²`, Level 1 = 100). A
competent owner reaches Level 1 at a ~70-minute median at design speed
(`BALANCE.md`); the owner program pays ≤54 XP and qualifying friendly wins pay
30 each. From Level 1 the club joins a pyramid pool and earns 30/15/5 XP per
win/draw/loss, so ≈300 XP ≈ 10–14 results. League days are 4 of every 7
(`WeekTemplate = L,C,L,L,C,L,L`), so one round is ≈(7/4) game days.

- Game day = `DayLengthMinutes / GAME_TIME_SCALE` = **48/4 = 12 real minutes**;
  a game hour = **30 s**; a league round ≈ **21 real minutes**.
- 12–14 results ≈ **4.2–4.9 h**, plus ≈0.75–1 h to Level 1 → **≈5–6 h**, inside
  the 4–6 h target, with D4's session breaks.
- Session waits at scale 4: facility build (20 design min) = **5 min**, match
  cooldown (300 s design) = **75 s**, defence shield (30 design min) = 7.5 min,
  AI world tick = 150 s.

**Alternatives considered.** Scale 2 with `DayLengthMinutes=24` gives nearly
the same calendar cadence (12 min/day) but doubles every interaction wait
(10 min build, 150 s cooldown); scale 4 was chosen to match D3's hint and keep
sessions snappy. Values are all ≥ the code's minimums (day length 24..20160).

**Report both numbers.** Every timer is **4× its scale-1 ("design") equivalent**
at this setting; playtesters must state the design-scale number alongside the
observed one, per D3.

**Known pacing risk (backlog, not an instance setting).** Matchmade friendlies
(PLAY) are gated only by the 75 s cooldown and also pay 30 XP/win, so a
determined grinder could clear 400 XP in well under 4 h. This is a
balance/design question for `BACKLOG.md` (U8), recorded here for honesty.

---

## 4. Smoke test (one throwaway account)

Script: `.playtest-runtime/smoke.cjs` (Playwright Chromium, driven by Windows
Node), against the **production client** on `http://localhost:4173`:

register → found club → campus at **1440×900** and **390×844**.

- Result: **PASS** (`SMOKE_OK`). Club `e9312e1a-f6a4-4685-a164-40241d0ee5c1`,
  owner `smoke-smfmfal@example.com` / `smksmfmfal`, founded in Sdev Central.
- Screenshots (committed):
  `docs/perfect/ux-pass/playtest/smoke/screenshots/smoke-campus-1440x900.png`
  `docs/perfect/ux-pass/playtest/smoke/screenshots/smoke-campus-390x844.png`
  Both show the 3D campus, First-steps checklist, Vintra advisor and PLAY dock.
- Cleanup: the club (OwnerProgram, ClubChallenges, ClubMessages,
  ClubPerformance, its news item), the sessions and the user were deleted from
  `fspro_playtest` in one transaction; `Clubs` is back to **50**, the throwaway
  user count is **0**. The pre-existing district it was placed in was left
  untouched.

## 5. Admin account for A01 (test credentials)

| | |
| --- | --- |
| Email | `admin@fspro.playtest` |
| Username | `playtestadmin` |
| Password | `Playtest-Admin-2026!` |
| User id | `53e430b3-8f82-4a08-9c06-258bf242f3c0` |
| isAdmin | true (set via `launch-setup.ts`) |

Test credentials only; they live in the scratch DB.

---

## 6. Environment facts

- Go `go1.24.5 windows/amd64`, Rust `cargo 1.90.0`, Windows Node `v26.10.0`;
  repo `node_modules` is win32-native so every Node/Playwright run goes through
  Windows Node (`cmd.exe`). WSL Node is present but cannot run the workspaces.
- R9: the sim engine locks `sim_core.dll` via `LoadLibrary`, so `run-sim.bat`
  points `SIM_CORE_DLL_PATH` at a copy in `.playtest-runtime/sim_core.dll`,
  leaving the repo's `services/sim-service/sim_core.dll` unlocked.
- Sentry off (`SENTRY_DSN` unset). Email verification not required
  (`REQUIRE_VERIFIED_EMAIL` unset). Rate limiting off (`RATE_LIMIT=off`).
- The client is the **production** bundle served by `vite preview`
  (`npm run serve`, the repo's script name is `serve`, not `preview`).

---

## 7. Timestamped intervention log

| UTC | Intervention | Detail |
| --- | --- | --- |
| 10:56 | Dump `fspro` (read-only) | `pg_dump -Fc` in `postgres:17-alpine`, 28,064,006 bytes |
| 10:56 | Create + restore `fspro_playtest` | drop/create/`pg_restore --no-owner`, OK |
| 10:58 | Apply migrations 0038–0043 | baselined 0015–0037; six files applied in order |
| 10:59 | Verify schema | `DistrictId`/`CultureId`/`OwnerProgram`/`PlaceInvites`/`WorldSeed` present |
| 11:00 | Build Go services + copy DLL | world-service, worldgen, realtime, sim-service; `BUILD_GO_DONE` |
| 11:01 | Build Node + client | api-contract, server `tsc`, client `vite build` (`BUILD_NODE_DONE`) |
| 11:02 | **Stopped stale phase-2 services** | killed leftover `worldgen` (16424), `world-service` (18240, 31328), ts-node-dev API (29764), sim (39920) holding 3004/3006/3016/3010/5050 |
| 11:02 | Start backends | worldgen 3004, world-service 3016, sim 5050, realtime 3005 — all `/health` ok |
| 11:03 | World seed | 5,000 players / 1,000 managers; idempotent re-run adds 0 |
| 11:03 | Launch setup | admin `playtestadmin` created; clock live; Amateur Cup edition live |
| 11:04 | Set D3 clock | `DayLengthMinutes=48`; reset `NextTickAt = now()+30s` to avoid a multi-year catch-up storm (the inherited `NextTickAt` was ~240 game days in the past at the new speed) |
| 11:04 | Start API (web+worker) + client | 3010/3011 up; worker logs calendar tick |
| 11:04 | **Stopped a second stale dev stack** | an `npm run start-dev` tree from worktree `p2b3c` respawned and held 3010; killed the whole tree (npm→ts-node-dev→node, plus its vite dev servers on 8080/8091) |
| 11:05 | Restart API web + client | 3010 `ROLE=web`, 4173 `vite preview` — both healthy |
| 11:07 | Calendar verified ticking | `CurrentHour` advanced, `LastTickAt` updating; facilities sweep ran (`14 upgrades completed`) |
| 11:08 | Smoke test | register → found → campus 1440×900 + 390×844, PASS |
| 11:09 | Delete throwaway account+club | one transaction; `Clubs` 50, throwaway user 0 |

---

## 8. Blockers / notes for the lead

- **No hard blocker.** All seven services are up and reachable.
- Two stale dev stacks had to be stopped (logged above); D8 authorises this.
- A second Node API (`ROLE=worker`, 3011) runs the world clock. It is required
  because the briefed `ROLE=web` instance cannot tick. Keep both running.
- If a service is restarted, re-use the `.bat` in `.playtest-runtime/` (loads
  the correct `DATABASE_URL`/scale). A `cmd.exe`-launched `.bat` is needed
  because WSL environment variables do not cross the Windows interop boundary.
- The A01 admin can adjust `DayLengthMinutes`/clock through the admin UI; the
  values above are the D3 starting point.
