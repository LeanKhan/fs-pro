# PROGRESS.md — orchestration run

Lead: this agent. Target repo: `/mnt/c/done/fs-pro` (`C:\done\fs-pro`).
Program of record: `FOR-AGENTS.md` (R1–R11, D1–D5, Batches 0–6).

## Batch status

| Batch | Agent | Branch / worktree | Status | Report |
| --- | --- | --- | --- | --- |
| B0 | 0A baseline | `core/launch` @ `a480c86` (read-only) | **PARTIAL** — commands run & green; commit step blocked (Q1/Q2) | `BASELINE.md` §1, §3 |
| B0 | 0B audit (facts) | `core/launch` (read-only) | **PARTIAL** — facts confirmed; 10k measurement not run | `BASELINE.md` §2, §4 |
| B1 | 1A hierarchy spec | — | not started (owner gate after) | — |
| B1 | 1B world-service skeleton | — | not started | — |
| B1 | 1C test infra | — | not started | — |
| B2–B6 | — | — | not started | — |

Nothing is merged; `perfect/integration` is not created yet (Q6).

## Open questions

See `OPEN-QUESTIONS.md`: Q1 (CRLF/index), Q2 (B0A commit premise), Q3
(untracked `.claude/`, `FOR-AGENTS.md`), Q5 (Windows vs Linux Go/Rust),
Q6 (worktree scheme), Q7 (`go test -race` needs cgo). Q4 (sim-lab command) is
**resolved from source**. Answers to Q1–Q3 and Q5–Q7 are required before
Batch 1 build agents run.

## Baseline result at a glance (Batch 0)

All suites currently **green**: server `tsc` PASS; Go `test` PASS in all 3
modules; Rust `cargo test --release` PASS; sim-lab runs (9.4 s). Three
pre-existing **metric** faults are recorded for Batch 5A (goals 3.21 vs
2.5-2.9; 3-5-2 dominates; quality 47% vs 30-45%). `go test -race` blocked
(Q7). Client vue-tsc / vite build / 10k scale still to run.

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
