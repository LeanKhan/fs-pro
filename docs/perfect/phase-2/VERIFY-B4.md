# VERIFY-B4.md — phase 2, Batch 4 (4A + 4B)

Verifier: the lead orchestrator (wrote neither agent). Branch `p2/integration`,
containing `a717a87`/`956afe0`/`f464e69` (4A) and `485e934` (4B).

## Re-run on `p2/integration` (independent)

```
server tsc (npx tsc --noEmit)          -> 0 errors
server vitest (npx vitest run)         -> 15 files / 151 tests passed
client build (npm run build)           -> built in 11.77 s  (after the 4B token fix)
go test ./internal/program/...         -> program ok, program/sim ok
```

## 4A — difficulty (R13, L7): all five criteria PASS

| # | Criterion | Result |
| --- | --- | --- |
| 1 | `balanced_expert` median in 45–90 min at every balance | **PASS** — 70 min at V1M/V3M/V5M |
| 2 | Every naive strategy ≥2× slower or needs recovery | **PASS** — facilities_first 2.00×; splurge/all_in/random recover in ≥32/1,000 |
| 3 | Skill beats luck (L7) | **PASS** — expert@V1M 70 < random@V5M 77; holds across 10 seeds |
| 4 | 0 soft-locks | **PASS** — `soft=0` in all 15 cells |
| 5 | Stars correlate with time-to-Level-1 | **PASS** — Spearman rho **+0.489** |
| — | `go test ./...` + `-race` | **PASS** |
| — | 3 live Playwright bots confirm ordering | **PASS (directional)** — expert@V1.1M ≤ naive@V3.2M/4.4M friendlies; a single live run is one outcome sample (noted) |

The gap's root cause was a **correctness** bug (the simulator did not credit
program XP to the XP bar, unlike the live Node code), now fixed; the naive
strategies were made genuinely spend-then-recover. `BALANCE.md` §1.

## 4B — visual/feel QA

| Gate | Target | Result |
| --- | --- | --- |
| Campus fps, advisor active, 1440×900 | ≥55 | **57** (p95 18.5 ms) |
| Campus fps, 390×844 | ≥30 | **57** (p95 19.1 ms) |
| Advisor-line text-fit (39 lines, both sizes) | 0 overflow | **0 / 0** |
| threejs-qa-release canvas inspection | pass | **6/6** (gpu=hardware, 0 errors) |
| Culture long names | fit | render cleanly |
| `--muted` WCAG AA (B1-2 ruling) | ≥4.5:1 | **6.03:1** (was 4.09:1) |

32 impeccable findings + 3 advisories: 1 fixed (the AA token), 6 real
deferred with recommendations (mostly pre-existing Go copy / shared button
contrast), the rest false positives/layered backgrounds.

## Notes

- 4A's live bots are single-sample (a matchoutcome is stochastic); the medians
  come from the 1,000-run simulator. Accepted as directional.
- 4B briefly overwrote and **restored** the pre-existing `campus-lab.*` harness;
  its own harness is `campus-advisor-lab.*`.

## Verdict: **PASS** — Batch 5 (final verification) may start.
