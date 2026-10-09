# VERIFY-B1.md — phase 2, Batch 1 (specs)

Verifier: the lead orchestrator (wrote none of the three specs). Branch
`p2/integration`, which now contains `647365e` (1A), `98d8e02` (1B), `a3306e3`
(1C) merged. Method: existence and content checks of the deliverables and the
`file:line` sources they cite (R1).

## Deliverables present

| Agent | File | Lines/bytes | Verdict |
| --- | --- | --- | --- |
| 1A owner program | `OWNER-PROGRAM-SPEC.md` | 53,877 B | PASS |
| 1B advisor | `ADVISOR-SPEC.md` + `B1-1B-REPORT.md` + `assets/advisor/**` + `components/cozy/advisor/*.svg` | 33,155 B + art | PASS |
| 1C cultures | `CULTURES-SPEC.md` | 39,488 B | PASS |

## Cited sources exist (spot-check)

```
OK apps/fs-pro-server/src/services/transfers/system-country-names.service.ts
OK apps/fs-pro-server/src/services/nationality.ts
OK apps/fs-pro-server/src/utils/placeholder-names.ts
OK apps/fs-pro-server/src/services/play/plan-effects.ts
```

1C's worldgen claims reproduce: `names/culture.go:348 GenerateKind`,
`:442 GenerateMixed`; the 8 culture JSONs and `country_cultures.json` are on
the branch.

## Coverage checks

- 1A: 25 mentions of star scoring; migrations `0042`/`0043`; 8 mentions of
  `plan-effects`; explicit statement of **no Rust sim-core change**.
- 1B: 24 mentions of impeccable/aria-live/reduced-motion; portrait art
  delivered as layered SVG (path (b)); layout verified against real campus
  screenshots.
- 1C: 31 mentions of the six starting cultures; full Node cut-over with
  `file:line`; `Places.CultureId` migration.

## Defects / rulings

1. **Q1 (1A §15) — stale `AUDIT` claim.** `AUDIT.md` says Phase-1 B4 cultures
   never shipped; the tree **has** them (`e6f1d93`, verified). **RULED:** 1C
   verifies and retires the Node tables; it does **not** rebuild worldgen.
2. **`--muted` token fails WCAG AA** on cream app-wide (1B §8). **RULED:**
   schedule a token sweep in Batch 4 (visual/polish), not here.
3. **Advisor art path (L9):** threejs-image-generator blocked (no
   `GEMINI_API_KEY`); hand-built layered SVG chosen. **Accepted**; recorded.
4. **1C does not re-implement worldgen** (correct per brief); the mix/sub-group
   /sheet-name **data** commit is a follow-up owned by the Batch-2/4 data pass.

## Verdict: **PASS** — Batch 2 build agents may start.
