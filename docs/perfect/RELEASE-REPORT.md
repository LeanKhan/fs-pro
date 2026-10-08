# RELEASE-REPORT.md — run summary (Batches 0–6)

Lead orchestrator, 2026-10-07. Branch **`perfect/integration`**. Program of
record `FOR-AGENTS.md`. This is the end-of-run report: what shipped, the
numbers, what did **not** ship, and the risks. It is honest about the last
group — the run is **not** a complete Batches 0–6 pass.

## 1. What shipped (merged to `perfect/integration`)

| Area | What | Evidence |
| --- | --- | --- |
| B1 | World-hierarchy spec (approved), Go `services/world-service` skeleton, vitest + Playwright test infra | `WORLD-HIERARCHY-SPEC.md`, `B1-1B/1C-REPORT.md`, `VERIFY-B1.md` |
| B2 | District hierarchy end-to-end: migration `0038` (town→city+district, `PlaceInvites`, `PlaceStats` trigger, `TileRevisions`), Go placement/hierarchy/ranking/pyramid, Node integration, prominence/pyramid delegation | `B2-2A/2B/2C-REPORT.md`, `VERIFY-B2.md`, `B2-FIX-REPORT.md` |
| B2 fix | pgx per-call-timeout cancel bug (`internal/db/db.go`) fixed | `4c83f08` |
| B2-D/E | 10k scale proof; founding-throughput pass; migration `0039` perf indexes; **100k world founded** | `B2-2D/2E-REPORT.md`, `SCALE.md` §B2D/E |
| B3-A | Zoomable-map tile API: quadtree `GET /tiles/{z}/{x}/{y}`, per-place caps, parent-summary overflow, ETag/304, contract + Node proxy + route-policy, invalidation trigger (`0040`), `Clubs(DistrictId…​)` indexes (`0041`) | `B3-3A-REPORT.md`, `VERIFY-B3.md` (PASS) |
| B3-B/C | Client LOD map (`store/world-tiles.ts`, `world-tiles-map.vue`, SVG by design), whole-world `getAtlas` retired (0 callers), `/atlas/chrome` + `/atlas/search`, screenshots at every zoom, desktop + mobile | `B3-B-C-REPORT.md`, commit `7f48bb3` |
| B4 | Cultures: 8 culture-keyed worldgen banks (2000 first + 2000 surnames + place/club/stadium patterns each), mix-aware, deny-list, collision 1.24% over 800k | `B4-CULTURES-REPORT.md`, commit `e6f1d93` |
| B5-A | Crest resolution (API is the single source; legacy redirect), idempotent `launch-setup` script, formation balance (3-5-2 no longer dominant; goals 2.58) | `B5A-FORMATION-BALANCE.md`, commits `3bacbc0`, `d68f7e7`, `6bb0a8d` |
| B5-B | Sentry error tracking, Postgres backup/restore + drill, client CSP, 1,000-concurrency load test | `B5B-OPS-REPORT.md`, commits `2bd1dd8`, `8675be6`, `c296a7a`, `4923086` |
| B5 owner rulings | Legal skipped; existing production clubs retained (no empty world) | `DECISIONS.md` §G |

## 2. Numbers (before → after)

| Metric | Before | After | Source |
| --- | --- | --- | --- |
| Founding, 1,000 clubs | 75 ms/club | 38 ms/club (1 client) | `SCALE.md` §B2E |
| Founding, 10,000 clubs | 118 ms/club | 46 ms/club (1) / 28 ms (4) | `SCALE.md` §B2E |
| Founding, 100,000 clubs | n/a | **31 ms/club, 8 clients, 3,066 s** | `SCALE.md` §B2E |
| Whole-world atlas, 10k | 632–706 KB | retired (tiles) | `SCALE.md`, spec §7 |
| Tile payload (10k / 20.7k) | — | ≤2.1 KB / ≤4.5 KB (cap 60 KB) | `B3-3A-REPORT.md` §5 |
| Tile latency p95 (10k / 20.7k) | — | **2.26 ms / 2.41 ms** (cap 50 ms) | `B3-3A-REPORT.md` §5 |
| 10k world rows | — | 10k clubs / 160k players / 90k fixtures / 8 countries | `SCALE.md` §B2D |
| Server `tsc` | PASS | PASS | `BASELINE.md` §3 |
| Server vitest | (none) | 94 tests (92 + 2 Sentry) | `B2-2C-REPORT.md`, this run |
| Client `vue-tsc` | **31 errors** | **31 errors** (unfixed) | `vue-tsc-baseline.log` |

## 3. Status of every batch item

| Item | Status | Why |
| --- | --- | --- |
| **B3-B/C** client LOD map + `getAtlas` retirement | **DONE** | see §1; full-stack fps trace and DB-backed `/atlas/chrome|search` unverified (component verified with Playwright route mocks). |
| **B4** cultures | **DONE** | see §1; Node is not yet wired to the new name kinds (GO-only batch). |
| **B5-A** crest, `launch-setup`, formation balance | **DONE** | see §1. |
| **B5-B ops** backup/restore, CSP, load test, Sentry | **DONE** | see §1. |
| **B5 legal** | **skipped by owner** | no legal text authored. |
| **B5-C empty world** | **resolved by owner** | keep existing clubs; no AI-spawn implementation needed. |
| **B6** full re-run + Playwright + visual QA | **partial** | server tsc/vitest (99), client build, Go tests, and component screenshots pass on `perfect/integration`; a full-stack Playwright fps run and the 1M tile benchmark remain. |

## 4. Remaining risks

1. **D5 "100k end-to-end"** is met for **founding** (31 ms/club, 100k in ~51 min);
   the **year end at 100k is not claimed** and is projected well past budget
   (`SCALE.md` §B2E). Year end at 10k is ~7 min, dominated by club ratings
   (334 s) and youth intake (52 s) — both flagged for set-based rewrites.
2. **Tile 1M synthetic p95** is not directly measured (no 1M tile DB exists);
   the risk is mitigated by sargable predicates + the `0041` indexes
   (`EXPLAIN` confirms index use). See `VERIFY-B3.md` D1.
3. **Client typecheck has 31 pre-existing errors** — unchanged this run.
4. **Simulation metric faults** (goals 3.21 vs 2.5–2.9; 3-5-2 dominance;
   quality 47% vs 30–45%) are still open (B5-A).
5. **Parallel-run coordination:** a second orchestration operated on this repo;
   one migration-number collision (0039) and one unexpected branch
   (`ANOMALY-1`) were reconciled (rebased; migration renumbered to `0040`).

## 5. Open questions still unanswered

- Batch 5 legal wording (skipped by owner).
- Sentry **DSN/release** values per environment (integration is DSN-gated; supply
  `SENTRY_DSN` / `VITE_SENTRY_DSN` in the deploy env).
- The 44/50 existing production clubs retained (owner) — confirm the deploy
  step never truncates `Clubs` on first launch.

## 6. Repro / evidence index

- `docs/perfect/PROGRESS.md` — batch table and worktrees.
- `docs/perfect/VERIFY-B1.md`, `VERIFY-B2.md`, `VERIFY-B3.md` — independent verification.
- `docs/SCALE.md` — scale numbers.
- `docs/perfect/B2-*`, `B3-3A-REPORT.md` — per-batch commands and outputs.
- Sentry: `npx vitest run test/error-tracking.test.ts` → 2 passed; server `tsc` → 0 errors.
