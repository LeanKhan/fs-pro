# RELEASE-REPORT.md — phase 2 (owner program, advisor, cultures, difficulty)

Lead orchestrator. Branch **`p2/integration`**, from `perfect/integration` (all
phase-1 work). Program of record: `docs/perfect/phase-2/FOR-AGENTS.md`.
**Do not merge to `main`; the owner decides.**

## 1. What shipped (with evidence)

| Batch | Deliverable | Evidence |
| --- | --- | --- |
| B0 | Baseline, audit, research | `BASELINE.md`, `AUDIT.md`, `RESEARCH.md` |
| B1 | Specs: owner program, advisor, cultures (+ portrait art) | `OWNER-PROGRAM-SPEC.md`, `ADVISOR-SPEC.md`, `CULTURES-SPEC.md`, `VERIFY-B1.md` |
| B2-A | Go `internal/program` (steps, stars, rewards, tips) + balance simulator + frozen contract + zod | `PROGRAM-SERVICE-CONTRACT.md`, `B2-2A-REPORT.md` |
| B2-B | Node owner model: migrations `0042`/`0043`, L1 founding, manager market, PLAY squad gate, Level-1 pyramid trigger | `B2-2B-REPORT.md` |
| B2-C | Idempotent world seed (5,000 players / 1,000 managers), restock/expiry, signing race safety, pre-league wages + recovery, qualifying XP, worldgen name cut-over, Villa formatter | `B2-2C-REPORT.md`, `VERIFY-B2.md` |
| B3-A | Advisor "Vintra": component + store + content model, campus 3D pointer, a11y | `B3-3A-REPORT.md` |
| B3-B | Owner-program screens (balance reveal → hire → squad → build → Level-1 league reveal) + owner-POV hub | `B3-3B-REPORT.md` |
| B3-C | Server-backed first steps (localStorage gone), `/program/:clubId/tip` proxy, inbox/news hooks, full real-stack journey e2e | `B3-3C-REPORT.md`, `VERIFY-B3.md` |
| B4-A | Difficulty tuning (R13/L7): all five criteria PASS + 3 live bots | `BALANCE.md`, `VERIFY-B4.md` |
| B4-B | Visual/feel QA: fps, text-fit, canvas inspection, culture names, `--muted` AA fix | `VISUAL-QA.md`, `VERIFY-B4.md` |

## 2. Numbers

| Metric | Value | Source |
| --- | --- | --- |
| `balanced_expert` time-to-Level-1 (median) | **70 min** at V1M/V3M/V5M (target 45–90) | `BALANCE.md` |
| Skill beats luck (L7) | expert@V1M **70** < random@V5M **77** (10 seeds) | `BALANCE.md` |
| Soft-locked runs | **0** (15 cells × 1,000) | `BALANCE.md` |
| Star ↔ speed correlation | Spearman **+0.489** | `BALANCE.md` |
| World seed | **5,000** players / **1,000** managers, idempotent | `B2-2C-REPORT.md` |
| Founding rate | **14 ms/club** (was 31 in B2-2E) | `B2-2C-REPORT.md` |
| Campus fps (advisor active) | **57** desktop / **57** @390×844 (≥55/≥30) | `VISUAL-QA.md` |
| Advisor-line text-fit | **0** overflow / 0 clipping (39 lines) | `VISUAL-QA.md` |
| `--muted` contrast | **6.03:1** (was 4.09:1) | `VISUAL-QA.md` |
| Server tests | **151** vitest; tsc **0** | this run |
| Go tests | world-service 11 pkgs, worldgen 2, realtime 1, sim-service 2 — all ok | this run |
| Rust `cargo test --release` | ok | this run |
| Client | build ✓; `vue-tsc` unchanged at the 31-error baseline | this run |
| Playwright | owner-journey (real stack) desktop+mobile + cross-device; advisor 38; program 17; balance bots 3; visual-qa | agent reports |

## 3. Lead decisions taken in the owner's place

All in `DECISIONS.md`. Headlines: D1 (Batch-0 works read-only in the main
checkout), D2 (Villa format `V1.5M`/`V1,500,000`), D3 (advisor portrait path
(b) after Gemini blocked), B1-1 (use the Phase-1 B4 worldgen; don't rebuild),
B1-2 (defer `--muted` sweep to QA — done in 4B), B1-3 (accept the SVG advisor),
B1-4 (culture data follow-up). Migration numbering starts at `0042` (phase 1
ended at `0041`).

## 4. Remaining risks / what did not ship

1. **L7's strict cross-budget median** now holds (70 < 77), but the margin is
   modest (7 min); `random`@V5M still finishes at 77. This is intended
   (random is lucky-slow, not soft-locked) but a future tuning pass could widen
   the gap.
2. **4A's live bots are single-sample** (one stochastic matchoutcome per run);
   the medians come from the 1,000-run simulator. Directional only.
3. **Advisor copy**: 6 desktop / 4 mobile Go-authored lines exceed the
   ADVISOR-SPEC 2–3-line rule (4B F1) — a copy pass, not shipped.
4. **Shared button contrast** (4B F2/F5) and a mobile 10px XP label (F3)
   deferred with recommendations.
5. **Node is not yet wired to the B1-1C culture data follow-up** (mix/sub-group
   /sheet-name data commits) — Phase-1 B4 worldgen is used, but the per-country
   mix refinement is a follow-up.
6. **Legal pages** were explicitly skipped by the owner.

## 5. Exact steps to run the world seed + migrations on the dev DB (`fspro`)

```
# 1. back up first (phase-1 script)
DATABASE_URL=postgresql://fspro:…@localhost:5434/fspro BACKUP_DIR=./backups scripts/db-backup.sh

# 2. apply the new migrations (0042 owner program, 0043 places culture)
cd apps/fs-pro-server
npm run build --workspace @repo/api-contract
npx ts-node --transpile-only src/scripts/migration/apply-sql-migrations.ts

# 3. seed the market (idempotent; safe to re-run)
#    requires the Go world-service up for culture names
npx ts-node --transpile-only src/scripts/<world-seed script from B2-2C-REPORT.md>
```

(Exact script names and env are quoted in `B2-2C-REPORT.md` §"Exact commands".)
Run only after the owner approves touching the production DB.

## 6. Stop

The run stops here. `p2/integration` is the integration branch; `main` is
untouched. The owner reviews this report and decides the release.
