# PROGRESS.md — orchestration run

Lead: this agent. Target repo: `/mnt/c/done/fs-pro` (`C:\done\fs-pro`).
Program of record: `FOR-AGENTS.md` (R1–R11, D1–D5, Batches 0–6).

## Batch status

| Batch | Agent | Branch / worktree | Status | Report |
| --- | --- | --- | --- | --- |
| B0 | 0A baseline | `core/launch` @ `a480c86` (read-only) | **PARTIAL** — commands run & green; commit step blocked (Q1/Q2) | `BASELINE.md` §1, §3 |
| B0 | 0B audit (facts) | `core/launch` (read-only) | **PARTIAL** — facts confirmed; 10k measurement not run | `BASELINE.md` §2, §4 |
| B1 | 1A hierarchy spec | `perfect/b1-1a` (`8925cc5`) | **merged** (approved, `DECISIONS.md`) | `WORLD-HIERARCHY-SPEC.md` |
| B1 | 1B world-service skeleton | `perfect/b1-1b` (`522a1b0`) | **verified + merged** | `B1-1B-REPORT.md`, `services/world-service/**` |
| B1 | 1C test infra | `perfect/b1-1c` (`3ed2606`) | **verified + merged** (1 item UNVERIFIED: Playwright re-run, rate limit) | `B1-1C-REPORT.md`, `tests/e2e/**` |
| B1 | verify | `perfect/b1-verify` (`9f14cc3`) | **PASS** (1 MEDIUM fixed in `24af869`) | `VERIFY-B1.md` |
| B2 | 2A Go service + schema | `perfect/b2-2a` | **running** | — |
| B2 | 2B contract + client + schemas | `perfect/b2-2b` (`5d61443`) | **done; pending verify** | `B2-2B-REPORT.md` |
| B2 | 2C checks + 100k scale | staged | blocked on 2A/2B | — |
| B3–B6 | — | — | not started | — |

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
**build** PASS (Windows Node, 15.4 s). **Client typecheck FAILS with 31
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
- **Worktrees have no `node_modules`** (gitignored, not copied). Before any
  Node/vitest/Playwright run in a worktree, `npm ci` (Windows Node) or symlink
  the main checkout's `node_modules`. Vitest/Playwright are new devDependencies
  (lockfile updated by 1C) and are not yet materialized in the main checkout.

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
