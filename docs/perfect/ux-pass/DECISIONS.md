# DECISIONS.md — UX pass lead rulings

Adopted unchanged: **U1–U8** (rules), **O1–O3** (owner), **D1–D7** (lead
defaults) from `docs/perfect/ux-pass/FOR-AGENTS.md`. Only departures and new
rulings are recorded here.

## Owner ruling (2026-10-08)

- **D8 — start the services freely.** The owner authorises starting (and
  restarting) the Go services (`world-service`, `worldgen`), the Rust `sim`
  service and the rest of the playtest stack **without approval**. The lead may
  start/restart them at will and logs each intervention in `INSTANCE-LOG.md`
  (U3). No agent blocks waiting for permission to bring a service up.

## Pass 0 rulings (lead, after 0A/0B)

| # | Question | Choice | Why |
| --- | --- | --- | --- |
| D9 | dev DB `fspro` is pre-0038 | Apply **0038–0043** to `fspro_playtest` and baseline 0015–0037 in `SqlMigrations` | The playtest DB must match the shipped code; the dev DB is read-only. |
| D10 | `ROLE=web` disables the clock | Run **two APIs**: web `:3010` + worker `:3011` | D4/D5 need the calendar/AI clock; matches the production web/worker split. |
| D11 | D3 time scale | **`GAME_TIME_SCALE=4`, `DayLengthMinutes=48`** (day 12 min, league round ≈21 min, build 5 min, friendly cooldown 75 s ⇒ ≈5–6 h to 400 XP) | Nearest to the D3 target inside one instance; players still report scale-1 equivalents. |
| D12 | **S1: stale `sim_core.dll`** — serialized `match_data`, but the code expects `match`, so **every match was rejected** | Rebuilt `crates/sim-core` and copied the current DLL; sim now 20/20, 2.50 goals/match | Real blocker; the repo's committed DLL is still stale and must be replaced on the branch. |
| D13 | Stale dev stacks (`phase-2`, `p2b3c` ts-node-dev) were running | Killed them | D8 authorises; the playtest instance must own its ports/DB. |

## Known risk → BACKLOG

Matchmade friendlies pay 30 XP every 75 s, so a grinder can beat the 4-hour
D3 target. Filed as a balance item (U8), not fixed in this pass.

