# B3-3A-REPORT.md — the advisor component + campus presence

Phase 2, Batch 3, Agent 3A. Branch `p2/b3-3a` from `p2/integration` @ `89ef790`.
Inputs: `ADVISOR-SPEC.md` (authoritative), `PROGRAM-SERVICE-CONTRACT.md` §6–7,
`FOR-AGENTS.md` (R8′, L9, L10, L11), `RESEARCH.md` §3.1, `DECISIONS.md`.
Ownership per R11: `apps/fs-pro-client/src/components/cozy/advisor/**` and the
campus scene wiring. Owner-program screens and `club-game.vue` were **not**
touched (3B owns them).

Status: **delivered**. 38/38 advisor Playwright tests pass at 1440×900 and
390×844; client build and `vue-tsc` are at baseline; `impeccable detect` is clean
on every changed UI file.

---

## 1. What shipped

One reusable `<CozyAdvisor>` component, driven by one store, used by the campus
(docked bottom-left) and available inline for drawers/founding:

| File | What it is |
| --- | --- |
| `apps/fs-pro-client/src/components/cozy/advisor/CozyAdvisor.vue` | **The component.** Portrait + bubble, expressions/poses, motion, layout, a11y. |
| `…/advisor/use-advisor.ts` | The Pinia store (`useAdvisorStore`) + the `AdvisorSource` seam (`ApiAdvisorSource`, `scriptedSource`). |
| `…/advisor/advisor-content.ts` | The deterministic content model: bands, eligibility (dismissed / max-shows / cooldown / quiet), priority-desc then id-asc selection, point-target mapping, the demo catalog. |
| `…/advisor/portrait.mjs` (+ the 5 regenerated SVGs) | The generator now emits **toggleable point arms** and the `--adv-aim` rotation, so the same art aims at a building. |
| `apps/fs-pro-client/src/components/cozy/cozy-campus.vue` | Campus wiring: mounts the advisor, projects the 3D building marker every frame, gates to the owner's club. |
| `apps/fs-pro-client/advisor-lab.html` + `src/dev/advisor-lab.ts` | Dev-only QA lab (real component over the app's own HUD geometry) with `window.__ADVISOR_TEST_HOOKS__`. |
| `tests/e2e/specs/advisor.spec.ts` | 38 Playwright tests, both viewports. |
| `apps/fs-pro-client/src/components/cozy/advisor/README.md` | Component/store/lab usage. |

### Character, expressions, poses

The art from 1B is reused verbatim (Vintra, 5 expressions, blink + talk visemes,
idle bob). It is inlined via Vite `?raw`, and the component rewrites the root
class each render:

```
class="adv expr-<neutral|happy|excited|worried|thinking>
           adv-state-<idle|talking> adv-pose-<idle|point-right|point-left>"
```

so the SVG's own CSS drives the motion (nothing is re-implemented). The one art
change: `portrait.mjs` now draws both hidden point arms in every expression file
(`.adv-point-right/.adv-point-left`, shown by the root pose class) with the
pointer's `transform-origin` at the hand; the component sets `--adv-aim` from the
projected marker so the arm aims. The contact sheet and motion proof regenerate
identically otherwise. Rebuild: `cd …/advisor && node portrait.mjs`.

### Motion (all reduced-motion gated)

| Motion | Where |
| --- | --- |
| Enter: bubble slides up 16px + fades 220ms; portrait appears, bubble 80ms later | `.adv-bubble` `adv-in` (component scoped) |
| Exit: fade + slide down 180ms | `.phase-exiting` `adv-out` |
| Idle bob ±5px / 3.4s; blink / 4.8s | the SVG's own CSS (`@media (prefers-reduced-motion: no-preference)`) |
| Talk: 4 visemes cycle 0.44s `steps(1)` + caret | SVG CSS + `.adv-caret` |
| Point: arm shows, `.adv-pointer` rotates to the marker; dotted sight-line | SVG CSS + `--adv-aim` + `.adv-sightline` |
| Marker: gold ring + chevron, subtle ring pulse | `cozy-campus.vue` scoped; pulse gated |

Reduced motion (`prefers-reduced-motion: reduce`) cuts the typewriter to instant
full text, disables bob/blink/visemes/entrance/exit/marker pulse, and snaps the
arm — verified by a Playwright run.

### Layout per `ADVISOR-SPEC.md` §4

- Desktop (≥761px): `left:10px; bottom:166px`, portrait 116×130, bubble 340px to
  the right, tail left. Clears `.worldbtn` (12+96), `.presence`
  (bottom 120+34) and the date bar.
- Mobile (≤760px): `left:8px; bottom:136px`, portrait 84×94, bubble
  `min(62vw,246px)`. Clears the date bar (`bottom:96`), dock and PLAY.
- ≤360px: stacked (bubble above the portrait), left-anchored.
- The bubble is bottom-anchored and grows **upward**, so it never pushes the
  dock/PLAY. `z-index:6` sits above the scene/building bubbles but below the
  drawer (25), modals (20) and toasts (40).

### Accessibility

- The **full line is always in the DOM** (`.adv-sr`); the visible text is an
  `aria-hidden` reveal, so a screen reader never hears a half-typed word.
- The line lives in `role="status" aria-live="polite" aria-atomic="true"`.
- The container is `tabindex="0"`: **Enter/Space** advance (skip typewriter →
  next queued line → collapse), **Esc** dismisses the current *dismissible* tip
  and never discards a program/blocked line (it collapses instead, so the owner
  cannot dead-end themselves).
- The quiet toggle is a real `<button aria-pressed>`; every target is ≥44×44;
  `:focus-visible` ring from the gold/wood palette.
- The portrait is `aria-hidden="true"` (decorative); expression/colour never
  carry meaning alone.

Note (deviation, recorded): the live region is on the *line paragraph*, not the
whole bubble, so the action buttons are not re-announced every time the text
changes. This meets the "announced once" requirement with less noise.

### Content model + the Go tip source

- Selection is a pure function of candidates + per-club memory + clock:
  priority desc, id asc, then dismissed / `maxShows` (0 = unlimited) / cooldown /
  quiet (priority < 70 suppressed) — mirroring `PROGRAM-SERVICE-CONTRACT.md` §6.
  When nothing is auto-eligible (a `once` framing line already shown), the
  advisor **collapses to the portrait with that line still reachable**, so it
  stays prominent without nagging; tapping re-reveals the framing.
- The **step framing line** comes from Node `GET /program/:clubId`
  (`ProgramState.advisor`, the Go evaluation).
- **Contextual tips** are sourced from the Go `POST /program/tip` engine through
  the Node proxy `POST /program/:clubId/tip` (`ApiAdvisorSource.tip`). That route
  is the documented Batch-3C seam; today it 404s, the store caches that and
  degrades to the step line (no invented text, no retry storm). The store also
  supports an injected `AdvisorSource`, which is how the lab and tests drive
  every state with no backend.
- Advice is deterministic and rule-based — **no LLM** is anywhere in the loop.

---

## 2. Evidence (R4)

All commands ran through **Windows Node** (`cmd.exe`), matching BASELINE.md.

### 2.1 Client build + `vue-tsc` (baseline = 31 errors)

```
$ cmd.exe /c "npm run build --workspace fs-pro-client"
✓ built in 11.15s

$ /tmp/opencode/vuecheck/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
31 errors in 14 files          # == docs/perfect/vue-tsc-baseline.log; 0 in advisor/**
$ grep -iE "advisor|cozy-campus" <log>   -> (no advisor errors)
```

The client lint is **6 errors** (was 7); none in an advisor file — I removed the
pre-existing unused `extra` param while editing `portrait.mjs`:

```
$ cmd.exe /c "npm run lint --workspace fs-pro-client"
Found 0 warnings and 6 errors.
$ grep -iE "advisor|cozy-campus" <log>   -> (no advisor lint errors)
```

### 2.2 Playwright — 38/38 at both viewports

```
$ cmd.exe /c "set E2E_BASE_URL=http://localhost:8091&& node ...@playwright/test/cli.js test advisor --reporter=list"
Running 38 tests using 1 worker
  ... 38 passed (1.3m)
[advisor] lab rAF fps while animating: 60
```

Covers: 7 expressions/states screenshotted per viewport; the typewriter proof
(visible text short, `.adv-sr` already whole); collapsed + tap-to-reopen; quiet;
inline mode inside a modal; the no-overlap assertion against `.playbtn`,
`.dock`, `.resbar` and `.presence`; `aria-live` attributes + full text; the
keyboard-only run (Enter advance/skip, Esc dismiss, Esc never discards a program
line); a reduced-motion run; and a lab frame-rate check.

### 2.3 Screenshots (24)

`tests/e2e/artifacts/advisor/{desktop-1440x900,mobile-390x844}/`:

```
neutral  happy  excited  worried  thinking  point  blocked
talking  collapsed  quiet  reduced-motion  inline
```

`point`/`excited` show the raised arm, the dotted sight-line and the gold
building marker; `collapsed` shows the portrait + nudge dot; `inline` shows the
same component inside a modal (drawers/founding).

### 2.4 Overlap rule (measured, not asserted by eye)

The Playwright no-overlap test compares `getBoundingClientRect()` of
`.cozy-advisor` with PLAY, dock, resource HUD and the presence pill and fails on
any intersection, at **1440×900** and **390×844**, for a plain line and a
pointing line. All pass; the advisor is also fully inside the viewport.

### 2.5 `impeccable` (R8′)

`impeccable context --target …/advisor` → `NO_PRODUCT_MD` / `SCOPED_EXISTING_ALLOWED`:
this is a narrow extension of the incumbent cozy world (cream/wood/Fredoka),
preserved. Deterministic detector on the changed UI:

```
$ impeccable detect --json advisor-lab.html CozyAdvisor.vue cozy-campus.vue
[]
```

(0 findings — the first pass flagged a pulsing dot and repeating-gradient stripes
in the dev lab only; both were removed. The component itself was clean from the
first scan.)

---

## 3. Acceptance criteria → evidence

| Criterion (ADVISOR-SPEC §9) | Evidence |
| --- | --- |
| One named Kev character, 5 expressions, 2 point poses | 1B art reused; point arms added by `portrait.mjs`; screenshots §2.3 |
| Enter/idle/talk/exit/point, all reduced-motion gated | §1 motion table; reduced-motion screenshot + test §2.2 |
| Never covers PLAY/dock/HUD at both sizes | §2.4 (measured assertion, both viewports) |
| Advice deterministic and rule-based; no LLM | `advisor-content.ts` + Go source §1; no client duplicate of the rule text |
| Tips have trigger/priority/cooldown/maxShows/dismissal | contract-mirroring selection in `advisor-content.ts`; server dismissal via `dismissTip` |
| `aria-live` polite, Enter advances, Esc dismisses, reduced motion | `advisor.spec.ts` accessibility + reduced-motion tests |
| Art path recorded; files in-repo and regenerable | 1B spec §0; `node portrait.mjs` regenerates all SVGs |
| Component is ONE unit for campus/drawers/founding | `CozyAdvisor.vue` `mode="campus|inline"`; inline screenshot + test |

---

## 4. Decisions and assumptions (for the lead)

1. **Tip source seam.** The browser cannot reach the Go world-service directly
   and no Node `/program/:clubId/tip` route exists yet, so the store calls that
   route (the R3′ boundary) and degrades to the Node step line when it 404s.
   Wiring the proxy is a one-line addition in 3C's scope
   (`programTip()` already exists in `world-service.client.ts:174`). No client
   rule engine was duplicated, so the Go tables stay the single source of truth.
2. **Pointing art.** The delivered expression SVGs had no arm (poses existed only
   in the contact sheet), so `portrait.mjs` was extended to emit both hidden
   point arms + the aim rotation. This is additive; the character is unchanged.
3. **Live region placement** on the line paragraph rather than the whole bubble
   (recorded above) — quieter for screen readers.
4. **Mobile quiet button kept visible** (the first pass hid it under 760px; the
   Playwright run caught that a mobile user would lose a control, so it is shown
   at all widths).
5. **`--muted` contrast**: advisor secondary text uses `#6f5940` (~6:1) per the
   1B spec; the app-wide `--muted` AA sweep remains 4B's (B1-2).
6. **Text fit**: the desktop bubble is the spec's 340px; the longest Go line
   wraps to 3 lines there. Reserving exactly 2 lines would clip, so the bubble
   grows upward (as the spec requires) and the full text is always visible. The
   formal longest-line/text-fit gate is 4B's.

## 5. Handoff / known gaps

- **3B (screens):** use `<CozyAdvisor mode="inline" :club-id="…" :source="…" />`
  or `defineExpose().show(line)`; the store is `useAdvisorStore()` in
  `components/cozy/advisor/use-advisor.ts`. `push()` shows a specific line.
- **3C (wiring):** add the Node `/program/:clubId/tip` proxy to Go
  `POST /program/tip`; replace the localStorage first steps; suppress the advisor
  while drawers/modals are open (it is already covered by z-index; explicit
  queueing is the follow-up).
- **4B (QA):** campus 3D fps with the advisor active (the lab reports 60fps
  DOM-side); the longest-line text-fit at both widths; the `--muted` AA sweep.
- Not run here: the full-stack `core-loop.spec.ts` (needs API/DB/Rust/Go); my
  campus change is purely additive and passes build + typecheck. The campus
  marker needs a live 3D campus to see end-to-end.
