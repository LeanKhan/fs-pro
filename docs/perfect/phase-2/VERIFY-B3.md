# VERIFY-B3.md — phase 2, Batch 3 (3A + 3B + 3C)

Verifier: the lead orchestrator (wrote none of the batch's code). Branch
`p2/integration`, containing `5b584a0` (3A), `264263f` (3B), `ec8cefb` (3C).

## Re-run on `p2/integration` (independent)

```
server tsc (npx tsc --noEmit)   -> 0 errors
server vitest (npx vitest run)  -> 15 files / 151 tests passed
money-symbol grep [$€£][0-9]    -> count=0  (Villa only)
```

## Agent evidence, read and judged

| Check | Evidence | Result |
| --- | --- | --- |
| 3A advisor | build ✓, vue-tsc 31=baseline, 38 Playwright (no-overlap + a11y at 1440×900 / 390×844), impeccable clean, 24 screenshots | PASS |
| 3B program screens | build ✓, vue-tsc 31=baseline, 17 Playwright, 20 screenshots, impeccable 41→6 | PASS |
| 3C wiring + e2e | **full real stack** (Postgres + Go world-service + Rust sim + Node + Vite): register→found→hire→squad→build→qualifying→Level 1→league on **desktop and mobile**, cross-device check, 11 screenshots/project | PASS |
| L8 server first steps | `fspro_steps_<id>` removed; program HUD from `fetchProgramState()` | PASS |
| L13 Villa | grep zero (server + client + contract) | PASS |
| Tip proxy | `program.tip` route + `'program.tip': { club: param('clubId') }` | PASS |

## Defects / notes (non-blocking)

1. **3B star overlay** doesn't fire in the live flow (client sets state from the
   already-advanced server response); server step/stars are correct, the e2e
   treats the overlay as optional. Handed to Batch 4 QA.
2. `tip.play.gate` / `tip.idle.break` are wired but only surface under their
   conditions (not forced in e2e).

## Verdict: **PASS** — Batch 4 build agents may start.
