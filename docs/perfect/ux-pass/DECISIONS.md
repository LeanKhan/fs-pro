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

## Pass 1 resume rulings (lead, 2026-10-08T23:25Z)

| # | Question | Choice | Why |
| --- | --- | --- | --- |
| D14 | Wave 1 was cut off before any player reached Level 2 (D5 unmet) | **Resume all of wave 1** (A01 Session 2; P01–P05) alongside wave 2, not just A01 | Definition of Done (§6) needs every player at Level 2 or the D5 cap. Preserved `state.json` logins make resume cheap (verified: the Postgres-backed `Sessions` store survives the API restart). |
| D15 | D6 wants **P08** to join via an invite from **P01** | P08 registers normally if no invite surfaces in the UI; the lead brokers a real invite only if P01's screens expose one | The cross-persona channel is the lead, and hand-feeding an invite link risks U2 (deciding from what the UI offers). If the invite path isn't discoverable, "couldn't exercise it" is itself a finding. |

## Known risk → BACKLOG

Matchmade friendlies pay 30 XP every 75 s, so a grinder can beat the 4-hour
D3 target. Filed as a balance item (U8), not fixed in this pass.

## Pass 2 rulings — triage, 2026-10-09 (lead)

Scope: the owner ruled **no further sub-agents and no resuming the paused
playtesters**; Pass 2 runs against the issues already surfaced (A01, P01–P06
full; P07–P10 partial). The triage is `ISSUES.md`; the owner readout is
`FINDINGS.md`; the deferred work is `BACKLOG.md`.

| # | Question | Choice | Why |
| --- | --- | --- | --- |
| D16 | Pass 1 is paused and 4 personas are partial | **Proceed on the reports already written**, marked partial; do not resume playtesters | Owner instruction; the surfaced issues are enough to act on, and U-01 blocks every run anyway. |
| D17 | Triage + fixes normally run as sub-agents (2A, then one per cluster) | **The lead does both directly**, one worktree, no fix sub-agents | Owner instruction ("no need to run further subagents"). R11 file-ownership clusters still hold. |
| D18 | A shared world under concurrent founding breaks the "Your home" preview (U-03) | **Fix binding deferred** (`fix*`): the change spans the Go placement service + the founding contract and cannot be integration-tested while the instance is down | Avoiding an unverifiable cross-language change to the placement path; the honest fix is to bind the previewed slot into `foundClub`. |
| D19 | Test fixtures in the live DB are data, not code | **Ship migration 0044** (delete the PgTest free agent; soft-release E2E clubs) **plus** a `Value > 0` market guard | The rows are QA artifacts with unambiguous names; the guard keeps the market clean even before the migration runs. |
| D20 | The four access gates (`clubs.hireManager` / `fireManager` admin-only) are used by owner-facing UI | **Route them through the owner program** (`program.signManager` / `releaseManager`) rather than widening the admin routes | The phase-2 program is the sanctioned owner path and applies the real fee/economy; widening the legacy routes would bypass it. |
| D21 | The transfer-window disagreement (U-08) has two day bases (`Calendar` flag vs the world `transferWindows` schedule) | **Backlog** (not fixed now) | The enforcement path (`transfer-window.service.ts`) is self-consistent; the mismatch is with the unused `transferWindows` schedule. Unifying them is a spec change, so U8 sends it to `BACKLOG.md`. |

### Pass 3 fixes landed on `ux/integration` (lead, this run)

| Cluster | Status | Canonical issues | Evidence |
| --- | --- | --- | --- |
| C1 manager-hire / first hour | done | U-01, U-05, U-10 | `manager-picker.vue`, `manager-firer.vue` now use the owner program; errors surfaced |
| C2 play refusal + away modal | done | U-06, U-07 (part), U-13 (part) | play contract `409`; `startBattle` keeps the dialog and toasts the gate message; filler "Squad rested" modal removed |
| C4 cozy modal a11y | done | U-13, U-22 (part) | `cozy-modal.vue` is `role=dialog`, traps focus, Escape closes, restores focus |
| C5 program cards | done (part) | U-19, U-20, U-21 (part) | wage×contract total, plain "your board wants" hint, true balance hint |
| C6 recruitment surface | done (part) | U-23, U-24 | table columns merged (Actions visible), shortlist card on-palette |
| C7 test-data hygiene | done | U-09 | migration 0044 + `Value > 0` guards in both markets |
| C9 admin console | done (part) | U-11, U-29 (part) | null-safe Manager cells, Vuetify-3 headers, labelled actions, `undefinedd` fixed |
| C10 campus motion | done (part) | U-17, U-18 | bob removed from interactive bubbles; `prefers-reduced-motion` honoured |
| C8 founding guard | done (part) | U-04 | `/start` gates an existing owner; "Found another club" is explicit |
| C3 placement binding | **deferred** | U-03 | see D18 |

Build status: server `tsc` clean, `@repo/api-contract` build clean, client
`vite build` clean. Runtime repro/after screenshots are deferred to the resumed
instance (`OQ-UX-2`).

