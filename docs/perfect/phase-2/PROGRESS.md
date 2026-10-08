# PROGRESS.md — phase 2 orchestration run

Lead: the orchestrator. Target repo `/mnt/c/done/fs-pro`.
Program of record: `docs/perfect/phase-2/FOR-AGENTS.md` (P1–P7, L1–L13, R1′–R14).
Owner brief: `docs/perfect/phase-2/INSTRUCTIONS.md`. The owner does **not**
answer questions this run; the lead rules in `DECISIONS.md`.

Integration branch: **`p2/integration`**, from `perfect/integration` @ `1cfd57a`
(the phase-1 tip, which already includes a "starting cultures" commit).

## Batch status

| Batch | Agent | Branch / worktree | Status | Report |
| --- | --- | --- | --- | --- |
| B0 | 0A baseline | `p2/b0-0a` | **running** | `BASELINE.md` |
| B0 | 0B audit | `p2/b0-0b` | **running** | `AUDIT.md` |
| B0 | 0C research | `p2/b0-0c` | **running** | `RESEARCH.md` |
| B1 | 1A owner-program spec | — | pending (after VERIFY B0) | `OWNER-PROGRAM-SPEC.md` |
| B1 | 1B advisor spec + art | — | pending | `ADVISOR-SPEC.md` |
| B1 | 1C cultures + worldgen | — | pending | `CULTURES-SPEC.md` |
| B2–B5 | — | — | pending | — |

## Environment facts (carried from phase 1)

- Client build/typecheck through **Windows Node**; worktrees have no
  `node_modules`.
- `go test -race` in `golang:1.24-bookworm` Docker; Go/Rust via WSL→Windows
  interop (`GOTOOLCHAIN=local`, `C:\Program Files\Go\bin\go.exe`).
- Postgres 17 in Docker on `localhost:5434`, user `fspro` / `superpassword`.
- Destructive DB work only on scratch DBs; the dev DB `fspro` is off-limits.
- Client `vue-tsc` baseline: 31 pre-existing errors (do not add any).
- Error tracking (phase-1 B5B): Sentry, DSN-gated.
