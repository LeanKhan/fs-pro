# PROGRESS.md — orchestration run

Lead: this agent. Target repo: `/mnt/c/done/fs-pro` (`C:\done\fs-pro`).
Program of record: `FOR-AGENTS.md` (R1–R11, D1–D5, Batches 0–6).

## Batch status

| Batch | Agent | Branch / worktree | Status | Report |
| --- | --- | --- | --- | --- |
| B0 | 0A baseline | `core/launch` @ `a480c86` (read-only) | **PARTIAL** — commands run & green; commit step blocked (Q1/Q2) | `BASELINE.md` §1, §3 |
| B0 | 0B audit (facts) | `core/launch` (read-only) | **PARTIAL** — facts confirmed; 10k measurement not run | `BASELINE.md` §2, §4 |
| B1 | 1A hierarchy spec | `perfect/b1-1a` (commit `8925cc5`) | **done; lead-approved** (`DECISIONS.md`) | `WORLD-HIERARCHY-SPEC.md`, `B1-1A-REPORT.md` |
| B1 | 1B world-service skeleton | `perfect/b1-1b` @ `.claude/worktrees/b1b` (ses_eeb050ef3ffeZ4KCsy9Z2KLOAr) | **running** | `B1-1B-REPORT.md` (when done) |
| B1 | 1C test infra | `perfect/b1-1c` @ `.claude/worktrees/b1c` (ses_eeb050ef0ffebWP1d2I85Yrtle) | **running** | `B1-1C-REPORT.md` (when done) |
| B2–B6 | — | — | not started | — |

Nothing is merged; `perfect/integration` is not created yet (Q6).

## Open questions

See `OPEN-QUESTIONS.md`: Q1 (CRLF/index), Q2 (B0A commit premise), Q3
(untracked `.claude/`, `FOR-AGENTS.md`), Q5 (Windows vs Linux Go/Rust),
Q6 (worktree scheme), Q7 (`go test -race` needs cgo). Q4 (sim-lab command) is
**resolved from source**. Answers to Q1–Q3 and Q5–Q7 are required before
Batch 1 build agents run.

## Baseline result at a glance (Batch 0)

All backend suites **green**: server `tsc` PASS; Go `test` PASS in all 3
modules; Rust `cargo test --release` PASS; sim-lab runs (9.4 s); client
**build** PASS (Windows Node, 15.4 s). **Client typecheck FAILS with 34
pre-existing errors** (`docs/perfect/vue-tsc-baseline.log`). Three
pre-existing **metric** faults are recorded for Batch 5A (goals 3.21 vs
2.5-2.9; 3-5-2 dominates; quality 47% vs 30-45%). `go test -race` runs via
Docker (Q7, owner-approved). Still to run: 10k scale (`fspro_pyramid_check`
must be rebuilt first).

## Scratch databases (Batch 0 prep)

Both rebuilt to the exact live v17 schema via a `postgres:17-alpine` Docker
`pg_dump -s fspro` (client pg_dump 16 cannot read a v17 server; Docker used
instead — no change to the running dev DB `fspro`):

- `fspro_pyramid_check` — 32 tables, 0 clubs (rebuilt).
- `fspro_scale_100k` — 32 tables, empty (pre-created for D5/Batch 2C).

`seedScaleWorld.ts` runs against `fspro_pyramid_check` (10k) — **in progress**.

## Environment corrections (apply to every agent)

- Client build/tests must use **Windows Node** (`cmd.exe /c "npm ..."`); the
  repo `node_modules` is win32-native (no Linux `rollup`/`esbuild` binding).
- Go/Rust run through the **Windows** toolchains via WSL interop; `go test
  -race` only inside the `golang:1.24-bookworm` Docker image (Q7).
- Skills live at `C:\Users\Emmanuel\.claude\skills\threejs-*` and
  `C:\Users\Emmanuel\.impeccable` (not in WSL home).
- Git identity for this run is repo-local `OpenCode Agent
  <opencode-agent@localhost>` (no identity existed; no attribution lines were
  supplied by the environment).

## Evidence index

| Claim | Evidence |
| --- | --- |
| HEAD / branch | `git log --oneline -6`, `git rev-parse HEAD` |
| 753 diffs are CRLF-only | `git diff --stat`, `git diff --ignore-cr-at-eol --numstat`, `tr -d '\r'` spot checks (`BASELINE.md` §1) |
| toolchain versions | `--version` outputs (`BASELINE.md` §0) |
| DBs on :5434 | `psql -Atqc "select datname from pg_database"` → `fspro`, `fspro_pyramid_check`, … |
| skills present (Windows) | `ls /mnt/c/Users/Emmanuel/.claude/skills` |
| F1–F4 file:line | `BASELINE.md` §2 |
| server tsc PASS | `TSC_EXIT=0`, empty log (`BASELINE.md` §3) |
| Go modules PASS | `go test ./...` outputs in `BASELINE.md` §3 |
| Rust PASS | `cargo test --release` → `test result: ok` x4 (`BASELINE.md` §3) |
| sim-lab numbers | `target/release/sim-lab.exe 400 realism quality styles formations` output (`BASELINE.md` §3) |

## Working agreements established this session

- Session/working dir for all commands: `/mnt/c/done/fs-pro` (the current
  session is in `../imagination`; every command uses an explicit workdir).
- Go/Rust run through the Windows toolchains via WSL interop (pending Q5).
- New docs from agents go under `docs/perfect/` only.
