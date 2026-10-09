# PROGRESS.md — UX pass orchestration

Lead: the orchestrator. Repo `/mnt/c/done/fs-pro`. Program of record:
`docs/perfect/ux-pass/FOR-AGENTS.md`. Owner brief:
`docs/perfect/ux-pass/INSTRUCTIONS.md`. The owner does not answer questions;
the lead rules in `DECISIONS.md`.

Integration branch: **`ux/integration`**, from `p2/integration` @ `218bf73`
(phase 2 complete). Fix branches `ux/fix-<cluster>` in worktrees.

## Pass status

| Pass | Agent(s) | Status | Output |
| --- | --- | --- | --- |
| 0 | 0A instance; 0B harness | **done + verified** | `INSTANCE-LOG.md`, `tests/e2e/playtest/**` |
| 1 | A01, P02, P05, P06 | **done (P1 reports complete)** | `playtest/<id>/{DIARY,ISSUES,SUMMARY}.md`, screenshots |
| 1 | P01, P03, P04, P07–P10 | **PAUSED — interop outage #2** (OQ-UX-2) | same |
| 2 | 2A triage | pending | `ISSUES.md`, `FINDINGS.md` |
| 3 | fix clusters | pending | `ux/fix-*` branches, before/after screenshots |
| 4 | re-play (3 personas) + report | pending | `RELEASE-REPORT.md` |

> **Pass 1 is paused (2026-10-09 ~02:40Z).** WSL↔Windows interop failed a second
> time (`UtilAcceptVsock accept4 failed 110`), blocking the Windows-Node
> Playwright harness. **Operator action required** (`wsl --shutdown`, restart
> Docker Desktop) — see `OPEN-QUESTIONS.md` OQ-UX-2 and `INSTANCE-LOG.md` §7/§8.
> Completed so far: **A01** (Session 2), **P02, P05, P06**. Remaining personas
> resume from preserved `state.json` once interop is back.

## Environment (carried from phase 1/2)

- Windows Node for client build/typecheck (`cmd.exe /c "npm ..."`); Go/Rust via
  WSL→Windows interop; `go test -race` in `golang:1.24-bookworm` Docker.
- Postgres 17 (Docker) on `localhost:5434`, user `fspro`. **The dev DB `fspro`
  is read-only**; the playtest instance is the scratch DB `fspro_playtest`.
- Client `vue-tsc` baseline: 31 errors (do not add).
- Error tracking: Sentry, DSN-gated (off unless `SENTRY_DSN` set).
- Playwright + Chromium installed (`tests/e2e`).
