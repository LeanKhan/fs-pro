# OPEN-QUESTIONS.md

Owner-only decisions blocking the run. Format: question, why it blocks,
options with a recommendation. None of these has been guessed.

---

## Q1 — The working tree is CRLF; the git index is LF (753 phantom modifications)

**Question.** How should line endings be handled before any batch runs?

**Why it blocks.** `git status` reports 753 modified files, but
`git diff --ignore-cr-at-eol --numstat` shows **zero** content changes and
every sampled file is identical to HEAD after `tr -d '\r'`
(`docs/perfect/BASELINE.md` §1). `core.autocrlf` is unset. Consequence:
every sub-agent worktree will show the same 753 phantom files, so R11 diff
review and "what changed" reports are unusable until this is fixed.

**Options.**
- (A, recommended) Set repo-local `core.autocrlf=true` and add a
  `.gitattributes` rule (`* text=auto eol=lf`), then `git add --renormalize .`.
  History stays LF; the tree is clean. No content change.
- (B) Add only `.gitattributes` and re-checkout the tree so the working copy
  becomes LF. Cleaner for Linux tooling, larger one-time churn on Windows.
- (C) Commit the CRLF tree as-is (753-file whitespace commit). Not recommended
  — it destroys diff readability forever.

**Need:** pick A / B / C.

---

## Q2 — Batch 0A says "commit the current uncommitted work exactly as it is"; there is none

**Question.** Confirm Batch 0A should become a no-op, or say what it was meant
to capture.

**Why it blocks.** HEAD is already `a480c86 feat: move worldgen service here`
and there is no real tracked diff (Q1). The only untracked items are `.claude/`
and `FOR-AGENTS.md` (Q3). Committing "as is" would be the 753-file CRLF commit.

**Options.** (A) Treat 0A's commit step as satisfied by HEAD; proceed. (B) If
some other work was meant to be snapshotted, name it.

**Need:** A or B.

---

## Q3 — Untracked `.claude/` and `FOR-AGENTS.md`

**Question.** Commit, ignore, or delete?

**Why it blocks.** They are the only two untracked paths. `.claude/` holds
`settings.local.json` and `worktrees/`; `FOR-AGENTS.md` is a copy of this
program's prompt. Committing machine-local settings is normally wrong;
per-agent worktrees may also want `.claude/worktrees` ignored.

**Options.** (A, recommended) gitignore `.claude/`; commit `FOR-AGENTS.md` as
the program of record (or move it under `docs/perfect/`). (B) Ignore both.

**Need:** A or B.

---

## Q4 — The 400-formation sim-lab invocation — **RESOLVED (source-read, no owner input needed)**

Answered from `crates/sim-core/src/bin/sim_lab.rs:10-11`: the command is
`sim-lab 400 realism quality styles formations` (sections `realism quality
boost attributes styles formations`; first arg = pairs). Baseline captured in
`BASELINE.md` §3. No decision needed.

---

## Q5 — Go and Rust are Windows-only on this machine; Linux has neither

**Question.** Approve running Go/Rust via WSL→Windows interop, or should the
Linux toolchains be installed?

**Why it blocks.** R3/R4 require `go test -race`, `go test -bench`, and
`cargo test --release`. Linux `go`/`cargo` are absent; Windows `go.exe`
(1.24.5) and `cargo.exe`/`rustc.exe` (1.90.0) work through interop. Docker is
installed but has no images pulled.

**Options.** (A, recommended) Run Go/Rust with the Windows binaries via WSL
interop and record the exact command form; use Docker images where a Linux
build is required (CI parity). (B) Install the Linux toolchains first.

**Need:** A or B.

---

## Q6 — Git worktree / branch naming under the CRLF problem

**Question.** Confirm the R10 scheme (`perfect/integration` + per-agent
`perfect/b<N>-<agent>` worktrees) once Q1 is decided.

**Why it blocks.** With Q1 unresolved, each new worktree inherits the 753
phantom files. Also `perfect/*` branches do not exist yet.

**Options.** (A, recommended) After Q1, create `perfect/integration` off
`core/launch`; each agent branches from it. (B) Another scheme.

**Need:** A or B (can be implicit in Q1).

---

## Q7 — `go test -race` cannot run on this machine

**Question.** How should R4's `go test -race ./...` requirement be satisfied?

**Why it blocks.** Every module fails immediately:
`go: -race requires cgo; enable cgo by setting CGO_ENABLED=1`
(`services/worldgen`, `apps/fs-pro-realtime` with the Windows toolchain).
CGO is off and there is no C toolchain under WSL. Plain `go test ./...` passes
for all three modules (`BASELINE.md` §3). R4 requires race tests, and Batch 2A
specifically needs a 200-parallel-founding concurrency test.

**Options.**
- (A, recommended) Run Go tests/builds inside the `golang:1.24-bookworm` Docker
  image (already needed for Linux parity and the Dockerfiles), where `-race`
  works. Record the exact `docker run` form. Note: `docker` currently has no
  images pulled (network required).
- (B) Install a C toolchain (mingw-w64 for the Windows Go, or a Linux Go + gcc).
- (C) Waive `-race` for this run and rely on plain tests + dedicated
  concurrency tests without the detector. Violates R4.

**Need:** A / B / C.

---

## INCIDENT-1 — two uncommitted lines in `FOR-AGENTS.md` were discarded

At ~01:42 the lead ran `git checkout -- FOR-AGENTS.md` on the integration
worktree to clear what looked like a line-ending artifact. It was not: `git diff
--ignore-cr-at-eol --stat` had shown `2 insertions`, i.e. a real edit to the
working copy that was never committed. The content is **not recoverable** — no
dangling git blobs (`git fsck --lost-found` = 0), every worktree copy is the
250-line committed version, no editor backup. The owner should re-apply those
two lines.

Process fix (adopted): never `git checkout -- <file>` unless the full diff of
that file has been read; check `--stat` first, then read the diff.

## RESOLVED — `services/worldgen` embedded data was untracked

Found by Batch 1C (OQ1) and fixed on `perfect/integration` in `a90b32a`:
`.gitignore:29 data` was unanchored and swallowed `services/worldgen/**/data`,
so `a480c86` could not build on a fresh checkout. Changed to `/data`; the 29
name-bank/face-part JSON files are now tracked (36 worldgen files total). CI's
`::warning::` skip for worldgen can be removed.
