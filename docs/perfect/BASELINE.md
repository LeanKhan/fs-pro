# BASELINE.md — Batch 0 (baseline + audit)

Status: **PARTIAL — blocked at 0A.** No feature code touched. Every line below
is either a command I ran (output quoted) or a file:line.

## 0. Environment (machine facts)

Working tree audited: `/mnt/c/done/fs-pro` (Windows `C:\done\fs-pro` via WSL).

| Tool | Result |
| --- | --- |
| node | `v24.21.0` |
| npm / npx | `11.19.0` |
| psql | `psql (PostgreSQL) 16.15)` (client) |
| docker | `Docker version 29.7.2` — **no images, nothing running** (`docker images`, `docker ps` empty) |
| git | `2.43.0` |
| go (Linux) | **not on PATH** (`command -v go` fails) |
| go (Windows) | `/mnt/c/Program Files/Go/bin/go.exe` → `go version go1.24.5 windows/amd64` (runs via WSL interop) |
| cargo/rustc (Linux) | **not on PATH**; no `~/.cargo` |
| cargo/rustc (Windows) | `/mnt/c/Users/Emmanuel/.cargo/bin/cargo.exe` → `cargo 1.90.0 (840b83a10 2025-07-30)`; `rustc.exe` → `rustc 1.90.0 (1159e78c4 2025-09-14)` |

Go modules in the repo (`find . -name go.mod`):
`apps/fs-pro-realtime/go.mod`, `services/sim-service/go.mod`,
`services/worldgen/go.mod`. No `go.work`.

Postgres is reachable on `localhost:5434` (from `apps/fs-pro-server/.env`
`DATABASE_URL`). Databases (`psql ... -d postgres -Atqc "select datname ..."`):

```
fspro
fspro_pyramid_check
postgres
template0
template1
```

`fspro` has 32 public tables. **No `fspro_scale_100k` yet** (created in Batch 2C).

Design skills (R8) are installed under the **Windows profile**, not the WSL
home: `/mnt/c/Users/Emmanuel/.claude/skills/threejs-*` (9 packs incl.
`threejs-qa-release`) and `/mnt/c/Users/Emmanuel/.impeccable`. No
`impeccable` skill directory and no `~/.claude/skills` in WSL. The harness's
own `skill` tool only exposes `opencode` and `report`, so agents must load
these by reading the files at those paths.

Existing tooling found: `apps/fs-pro-server/src/scripts/seedScaleWorld.ts`,
`.../checkWorldPyramid.ts`, `docs/SCALE.md`, `.github/workflows/ci.yml`.

## 1. Agent 0A — repo state and the baseline commit

- Branch `core/launch`, HEAD `a480c86 feat: move worldgen service here`
  (`git log --oneline -6`). The previous worldgen work is already committed.
- `git status --porcelain | wc -l` → **755** (753 `M`, 2 `??`).
- The 753 modifications are **entirely CRLF-vs-LF churn, not real work**:
  - `git diff --stat | tail -1` → `753 files changed, 344286 insertions(+), 344286 deletions(-)`
    (equal counts).
  - `git diff --numstat | wc -l` → `753`, but
    `git diff --ignore-cr-at-eol --numstat | wc -l` → `0`.
  - Spot check: `diff <(git show HEAD:f | tr -d '\r') <(tr -d '\r' < f)` is
    identical (ignoring CR) for `routers/index.ts`, `server.ts`,
    `compose.prod.yaml`, `package.json`.
  - `git check-attr text eol -- <file>` → `unspecified`; `core.autocrlf` is
    unset locally and globally.
- The only untracked items are `.claude/` and `FOR-AGENTS.md`:
  `git -c core.autocrlf=true status --porcelain` → exactly those 2 lines.

**Conclusion: 0A as written cannot be executed meaningfully.**
"Commit the current uncommitted work exactly as it is" would either be a
no-op (there is no real tracked work) or, if done with `git add -A`, a
753-file whitespace-only commit that would poison every future diff and every
agent worktree. See OPEN-QUESTIONS Q1.

## 2. Agent 0B — audit of the five "Facts"

| # | Fact | Verdict | Evidence |
| --- | --- | --- | --- |
| F1 | Crest resolution is split between a client code table and the API | **CONFIRMED (partly)** | `apps/fs-pro-client/src/helpers/crest.ts:8-10` builds `iconFileByName[code]` and only falls back to `GET /api/crests/:code.svg`; server route declared `apps/fs-pro-server/src/controllers/world/atlas.router.ts:115`. The client table is still a source of truth for legacy clubs. |
| F2 | 6-clubs-per-town cap; 288 per country | **CONFIRMED** | `docs/WORLD-PYRAMID-SPEC.md:55` (`TownSize` 6), `:59` ("a full country holds 288 clubs"), `:304` (`TARGET country: 288`). |
| F3 | Atlas returns a whole-world payload | **CONFIRMED** | `apps/fs-pro-server/src/services/world/atlas.service.ts:124` `getAtlas(userId, {countryId})` returns countries/regions/towns; consumed whole by `apps/fs-pro-client/src/components/atlas/atlas-map.vue`; `seedScaleWorld.ts:12` timers `getAtlas`. |
| F4 | Names are placeholders | **CONFIRMED** | `apps/fs-pro-server/src/utils/placeholder-names.ts` (static pools), used at `controllers/players/player-lifecycle.service.ts:7,217` and `services/world/club-founding.service.ts:17,50`. `services/worldgen` now exists and is committed at HEAD, but is not yet wired into these call sites. |
| F5 | Empty-DB gaps (first player has no opponent) | **CONFIRMED direction, needs runtime proof** | `docs/GAME-PHILOSOPHY.md:5` says the world ships full of AI clubs, but `docs/OPEN-PLAY-COMPETITIONS-SPEC.md:6` says "no AI rivals are spawned"; matchmaking draws from AI clubs (`docs/PERSISTENT-STRATEGY-GAME-PLAN.md:33`). Runtime measurement on an empty DB is **not yet run** (see §4). |

## 3. Agent 0A — baseline command results (run this session)

| Command | Result | Output |
| --- | --- | --- |
| `apps/fs-pro-server`: `../../node_modules/.bin/tsc --noEmit` | **PASS** | `TSC_EXIT=0`, log empty (0 lines) |
| `apps/fs-pro-realtime`: `go test ./...` (Windows `go.exe`) | **PASS** | `ok github.com/fs-pro/realtime 1.269s` |
| `services/sim-service`: `go test ./...` | **PASS** | `ok fs-pro-sim-service/engine 0.783s`, `ok .../server 1.018s` |
| `services/worldgen`: `go test ./...` + `go vet ./...` | **PASS** | `ok fs-pro-worldgen/server (cached)`; vet exit 0 |
| `crates/sim-core`: `cargo test --release` | **PASS** | contract 6/6, determinism 1/1, realism_bench 1/1; all `test result: ok` |
| `crates/sim-core`: `./target/release/sim-lab.exe 400 realism quality styles formations` | **PASS (ran), 9.4 s** | see below |

sim-lab invocation contract: `crates/sim-core/src/bin/sim_lab.rs:10-11`
(`[pairs] [section...]`, sections `realism quality boost attributes styles
formations`; default all). This resolves Q4 from source, no guessing.

Baseline numbers (pre-existing, for the Batch 5A/6 "before" table):

```
goals 3.21 [2.5-2.9] | xG 3.01 | shots 22.5 [22-28] | on target 8.1 [8-10]
passes 434 [800-1100] | completion 79.4% [78-86] | tackles 38.0 [30-40] | fouls 22.5 [20-26]
yellows 3.33 [3-4] | reds 0.25 [0.1-0.25] | home W/D/L 44/23/33 [45/25/30]
goal diff per rating point 0.236 | quality explains 47% of goal diff [aim 30-45%]
Formations (home pts/match): 352 = 2.00/2.05/1.88/1.57 beats all others (~1.3-1.8)
```

### Pre-existing faults to fix later (do not fix now)

1. **Goals 3.21/ match is above the 2.5-2.9 target** — evidence above; this is
   Batch 5A's "goals should land in 2.5-2.9" item.
2. **Formation 3-5-2 dominates every other formation** (2.00-2.05 vs ~1.3-1.8)
   — evidence above; Batch 5A's "3-5-2 must not beat every formation".
3. **Quality explains 47% of goal diff** (aim 30-45%) — slightly over.

### Still not run

- Client typecheck (`vue-tsc@2.0.29` + `typescript@5.4.5` scratch, per R4) —
  **NOT RUN**.
- Client build (`npm run build --workspace fs-pro-client`) — **NOT RUN**.
- 10k-club scale measurement on `fspro_pyramid_check` (0B) — **NOT RUN**.

## 4. Blockers (detailed in OPEN-QUESTIONS.md)

- Q1 CRLF working tree vs LF index (753 phantom modifications).
- Q2 Batch 0A "commit as-is" premise is false.
- Q3 `.claude/` and `FOR-AGENTS.md` untracked — commit or ignore?
- Q5 Go/Rust are Windows-only; `go test -race` fails (needs cgo) — see Q7.
- Q7 `go test -race` is blocked: `go: -race requires cgo; enable cgo by
  setting CGO_ENABLED=1`, and CGO is off / no C toolchain under WSL. R4 requires
  race tests (incl. Batch 2A's 200-parallel-founding test).
