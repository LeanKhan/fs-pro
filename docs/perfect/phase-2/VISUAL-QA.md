# VISUAL-QA.md — phase 2, Batch 4B (visual and feel QA)

Agent 4B. Branch **`p2/b4-4b`** from `p2/integration` @ `6e01ded` (VERIFY-B3
PASS). Program of record: `docs/perfect/phase-2/FOR-AGENTS.md` §4 Batch 4 (R4,
R8′, L10), `ADVISOR-SPEC.md`, `DECISIONS.md` (B1-2 `--muted` sweep). Reports
reviewed first: `B3-3A-REPORT.md`, `B3-3B-REPORT.md`, `B3-3C-REPORT.md`.

Ownership: this report, the QA screenshots under
`docs/perfect/phase-2/assets/visual-qa/**`, the `--muted` token change, and the
QA-only dev harnesses. **No program logic was changed.**

---

## 0. TL;DR — the four gates

| Gate | Target | Result |
| --- | --- | --- |
| Campus fps with the advisor active, desktop 1440×900 | **≥ 55** | **57 fps** (p95 18.5 ms) — live stack |
| Campus fps with the advisor active, mobile 390×844 | **≥ 30** | **57 fps** (p95 19.1 ms) — live stack |
| Advisor line text-fit, every frozen line, both sizes | no overflow / clipping | **39/39 lines, 0 failures** at both sizes (2.4) |
| Culture-named people/clubs/places in the UI | long names fit | **pass** — 24-char manager, long player, 30-char club name (2.5) |
| `threejs-qa-release` canvas inspection | non-blank, on-GPU | **6/6 PASS** (2.3) |
| `--muted` WCAG AA token sweep (DECISIONS B1-2) | ≥ 4.5:1 | **fixed** 4.09:1 → **6.03:1** (2.6) |
| `impeccable` review of every changed screen | findings + fixes/deferrals | **32 detector findings + 3 advisories**, 1 fixed, 6 deferred, rest false-positive/out-of-scope (2.7) |

**Findings:** 32 `impeccable` detector findings + 3 advisories across the three
changed screens; **1 fixed** (`--muted` AA), **6 real findings deferred** with a
recommendation (all pre-existing shared style or content, not phase-2 code
defects), and the remaining are **false positives** (documented) or **belong to
other components**. No new contrast, overflow or layout defect was introduced by
Batch 3.

---

## 1. Environment and how it was run

- Windows Node (the repo's `node_modules` is win32-native), Postgres
  `fspro_p2c_seed2` on `localhost:5434`, Go world-service `:3016`, Node API
  `:3010` already running. Worktrees have no `node_modules`; the Batch-4B
  worktree's were junctioned to the main checkout (as 3B did), so the client
  build/typecheck and Playwright run under **Windows Node**.
- Client: my worktree served by Vite on **`:8091`**
  (`VITE_APP_API_BASE_URL=http://localhost:3010`), so the runs exercise the
  Batch-4B revision (including the `--muted` change), not the other agent's
  `:8080` dev server.
- Playwright CLI (Windows): `node <repo>\node_modules\@playwright\test\cli.js`.
- Canvas pixel metrics need `pngjs`; the `threejs-qa-release` inspector needs
  `pngjs` + `@playwright/test`. They were installed in a scratch
  `\.qa-tools\node_modules` (not committed; `NODE_PATH` points at it).

```bat
:: from tests/e2e
set E2E_BASE_URL=http://localhost:8091
set NODE_PATH=C:\done\fs-pro\.claude\worktrees\p2b4b\.qa-tools\node_modules
node C:\done\fs-pro\.claude\worktrees\p2b4b\node_modules\@playwright\test\cli.js ^
     test specs/campus-qa.spec.ts --headed --reporter=list
```

### Reproducing the client at this revision

```bat
cd apps\fs-pro-client
set VITE_APP_API_BASE_URL=http://localhost:3010
node C:\done\fs-pro\node_modules\vite\bin\vite.js --port 8091 --strictPort
```

---

## 2. The gates

### 2.1 Campus fps with the advisor active

The fps gate is measured on the **live campus** (`register → found → campus`,
real API/DB/world-service) with the advisor docked, typed and idle-bobbing. The
frame loop is a `requestAnimationFrame` counter over 5 s after a 2.5 s warm-up;
`p95`/`worst` are per-frame ms.

**Aggregate (desktop)** — live, `campus-fps-live-desktop-1440x900.json`:

```json
{ "fps": 57, "frames": 287, "p95": 18.5, "worst": 23.7 }
```

**Aggregate (mobile 390×844)** — live, `campus-fps-live-mobile-390x844.json`:

```json
{ "fps": 57, "frames": 287, "p95": 19.1, "worst": 20.2 }
```

The dev lab (`campus-advisor-lab.html`, the same `World` class + the real advisor over
the real `cozy.scss` HUD) agrees: **58 fps (p95 18.1 ms) desktop / 57 fps
(p95 18.4 ms) mobile**, with `renderer.info` **137 draw calls, 179,930
triangles, 78 geometries, 6 textures** — well inside the desktop budget
(300 calls / 750k triangles) and the mobile budget (150 / 300k).

**Renderer.** Both the fps runs force the discrete GPU:
`--force_high_performance_gpu --enable-gpu-rasterization --ignore-gpu-blocklist`.
Without it the hybrid laptop picks the Intel UHD iGPU (**45 fps desktop**) and
headless Chromium falls back to SwiftShader (**2–4 fps**), which is not a real
measurement. GPU string recorded: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Ti
Laptop GPU …, Direct3D11 vs_5_0 ps_5_0, D3D11)`.

> Note: 57 fps is the display/rAF ceiling here (a frame is ~18 ms, not
> 16.7 ms); the scene is GPU-light. If the batch wants 60, the residual is the
> shadow pass and antialiasing in `World` (`world.ts:115-120`) — a renderer
> change, deliberately **not** made in a QA pass.

### 2.2 Advisor text-fit — every frozen Go line, both sizes

`tests/e2e/specs/visual-qa.spec.ts` pushes **all 39 authored lines** from the Go
rule table (`services/world-service/internal/program/tips.go`; the 36
`constText` rules plus the 3 `balance.reveal` variants) through the real
`CozyAdvisor` and measures the bubble at both viewports. Fixture:
`tests/e2e/specs/fixtures/advisor-lines.json`.

| Viewport | Lines | Overflow | Clipped off-screen | Max chars | Over the 2/3-line rule |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 39 | **0** | **0** | 114 | 6 lines render to 3 lines |
| 390×844 | 39 | **0** | **0** | 114 | 4 lines render to 4 lines |

Measured per line: horizontal overflow (`scrollWidth > clientWidth`), text
truncation (`scrollHeight > clientHeight`), and bubble-within-viewport. The
bubble grows upward, anchored at the bottom: its top edge never rises above
**y = 564** (desktop) / **y = 531** (mobile), so it never leaves the viewport or
pushes the dock/PLAY. Reports:
`advisor-textfit-{desktop-1440x900,mobile-390x844}.json`.

**Deferred finding F1 (content, not layout).** The ADVISOR-SPEC §1 writing rule
caps a line at **2 rendered lines desktop / 3 mobile**; six lines exceed it on
desktop and four on mobile (worst 114 chars — `balance.reveal.low`,
`step.manager.arrive`, `step.facilities.arrive`). The bubble is designed to grow
upward, so nothing clips or overflows — this is a copy-length rule, and the
strings are authored in Go (`tips.go`, owner 2A) and asserted by 2A's tests.
**Recommendation:** shorten those four strings to ≤ ~95 chars or widen the
desktop bubble to 360px; either is a one-line change outside this QA pass.

### 2.3 `threejs-qa-release` canvas inspection

Ran the skill's inspector against the campus-advisor-lab (the real `World`, default
layout, the advisor docked and pointing) with a declared manifest and
deterministic named states. Command:

```bat
node .qa-tools\inspect-threejs-canvas.mjs ^
  --manifest docs\perfect\phase-2\assets\visual-qa\canvas-inspection\evidence.json ^
  --url http://localhost:8091/campus-advisor-lab.html
```

Result — **6/6 PASS**, `gpu=hardware`, `budget=ok`, no console or page errors:

| Capture | entropy | edge density | contrast | dominant share | budget |
| --- | --- | --- | --- | --- | --- |
| desktop `campus-advisor` | 4.79 | 0.285 | 141.2 | 0.258 | ok |
| desktop `campus-advisor-point` | 4.77 | 0.276 | 141.2 | 0.258 | ok |
| desktop `campus-advisor-excited` | 4.78 | 0.277 | 141.2 | 0.258 | ok |
| mobile `campus-advisor` | 5.47 | 0.370 | 143.9 | 0.187 | ok |
| mobile `campus-advisor-point` | 5.55 | 0.369 | 143.9 | 0.190 | ok |
| mobile `campus-advisor-excited` | 5.58 | 0.378 | 144.4 | 0.190 | ok |

The inspector's render-budget check confirms the scene is inside the
threejs-qa-release starting budgets — desktop: **127 calls / 300, 178,974
triangles / 750,000, 69 geometries / 300, 6 textures / 60**; mobile: **125 /
150, 181,098 / 300,000, 70 / 200, 6 / 40** (`withinBudget: true`).

Reports + screenshots: `assets/visual-qa/canvas-inspection/`. The inspector's
independent pixel decode agrees with the in-repo screenshot metrics
(`campus-*-*.json`: `blank: false`, std ≈ 44–50, 660–889 unique shades).

### 2.4 Culture-named people, clubs and places

Test: `visual-qa.spec.ts` "culture names fit" and the live founding flow. Names
are real worldgen output from the seeded market in `fspro_p2c_seed2`:

| Kind | Name (source) | chars | Result 1440 | Result 390 |
| --- | --- | --- | --- | --- |
| Manager | `Jegeleg UnDaTop-Greencoat` | 24 | card 335px, name fits | card 364px, name fits |
| Player | `Gurenchi El Calisto` | 20 | name fits | ellipsis engages (95px cell), **card fits** |
| Player | `Kevnyken Kevnheinminth` | 21 | fits | ellipsis |
| Club (live HUD) | `VendoorStein Atletihk <stamp>` | 28 | fits the date bar | fits |
| Club (seeded max) | `VendoorStein Atletihk S.C` | 25 | — | — |
| Place (seeded max) | `Philamentia Central, Philamentia` | 32 | news ticker (ellipsised by design) | same |

The player row is a fixed 5-column grid with `min-width: 0` and
`text-overflow: ellipsis` (`program-player-card.vue:116-126`), so a long name
ellipsizes inside its cell instead of breaking the grid — the card's own
`scrollWidth === clientWidth` at both sizes. No changed screen renders a
fixed-width **place** label: a place name reaches the campus only through the
news ticker, which is `nowrap + ellipsis` by design (`cozy.scss .ticker`), and
the founding form's region/town inputs (max 30 chars each). Evidence:
`culture-names-{manager,players}-{desktop,mobile}.json/.png` and
`campus-live-advisor-{desktop,mobile}.png`.

### 2.5 Advisor expressions and campus with the advisor active

- **Advisor, every expression/state** — 12 states × 2 viewports (neutral,
  happy, excited, worried, thinking, point, blocked, talking, collapsed, quiet,
  reduced-motion, inline), regenerated on this revision:
  `assets/visual-qa/advisor/<viewport>/*.png`.
- **Campus + advisor (live)** — `assets/visual-qa/campus-live-advisor-*.png`;
  the bubble is bottom-left, clears PLAY / dock / resource HUD / presence, and
  shows `V3.0M` in Villa.
- **Campus + advisor (lab, 3 states incl. the pointing marker + sight-line)** —
  `assets/visual-qa/campus-campus-advisor*/`.
- **Each owner-program screen** × 2 viewports — `assets/visual-qa/owner-program/`
  (balance, managers, squad, facilities, level 1, league, interview, negotiate,
  star reveal, transfer market).

### 2.6 `--muted` WCAG AA token sweep (DECISIONS B1-2)

Ruling B1-2 (from 1B §8): the shared `--muted` token fails AA on cream app-wide;
schedule the sweep in Batch 4. Implemented:

| Token | Before | After | On cream `#fdf4df` |
| --- | --- | --- | --- |
| `--muted` | `#8b7357` | **`#6f5940`** | 4.09:1 → **6.03:1** |

Changed in the three definitions of the cozy palette:
`components/cozy/cozy.scss:10`, `components/matchzone/matchzone.scss:10`,
`styles/cozy-app.scss:11`. `#6f5940` is the value the advisor and owner-program
screens already use for secondary text, so the sweep is a unification, not a new
colour. All three are cream/light surfaces (checked every `var(--muted)` use:
88 sites; none on a dark/green surface), so darkening only increases contrast.
The unrelated `PitchPreview.html` `--muted: #8ba597` is a different token and was
left alone.

Re-screenshotted after the change: the advisor lab (12 states × 2), the
owner-program screens (10 × 2), the text-fit runs, the campus lab canvas
inspector (6 captures) and the live campus. All pass; the detector still reports
**0** real low-contrast findings on the changed UI (the one remaining
`#6f5940` line is the layered-background false positive in 2.7).

Every one of the 88 `var(--muted)` sites was checked: all sit on cream
(`#fdf4df`), `#fffaf0`, `#fff8e6` or the `.op` sky→cream gradient, so the change
is a monotonic contrast **increase** on every surface it touches. Screens that
consume the same light palette but are outside this batch's changed set (the
Matchzone HUD, the league/`/u` office screens) were **not** re-captured — they
need a live match/office flow — but they share the identical light panels, so
the same arithmetic applies.

---

## 3. `impeccable` review — every changed screen

Method: the deterministic detector on three rendered DOM snapshots (Vite dev
inlines the CSS, so the scan is valid), plus a visual pass over every screenshot
above. Commands:

```bat
npx -y impeccable detect tests\e2e\artifacts\qa-dom\advisor-campus.html ^
     tests\e2e\artifacts\qa-dom\campus-live.html ^
     tests\e2e\artifacts\owner-program-dom\managers.html
```

Changed screens reviewed: the advisor component (all states), the campus HUD +
advisor + 3D marker, and the owner-program screens (balance, managers, squad,
facilities, Level 1, league, interview, negotiate, star reveal, transfer
market). DOM snapshots: `tests/e2e/artifacts/qa-dom/`,
`tests/e2e/artifacts/owner-program-dom/`.

### 3.1 Detector totals

| Snapshot | anti-patterns | advisories |
| --- | --- | --- |
| `advisor-campus.html` | 13 | 1 |
| `campus-live.html` | 13 | 1 |
| `managers.html` (owner program) | 6 | 1 |

### 3.2 Findings, with disposition

**Fixed (1).**

- **[P1] `--muted` low contrast** — fixed by the token sweep (2.6).

**Real findings, deferred (6)** — none is in the new phase-2 code; each needs an
owner outside a QA pass.

| # | Finding | Where | Why deferred | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | Advisor lines exceed the spec's 2/3-line rule (6 desktop / 4 mobile) | `tips.go` copy (2A) | Content, not layout; asserted by 2A tests | Shorten the four long strings or widen the desktop bubble |
| F2 | White text on saturated buttons: `#ffffff` on `#6fb7f2` (2.2:1), `#ffc94a` (1.5:1), `#7bd655` (1.8:1) | `cozy.scss` world/PLAY/`.adv-next` | The game's established button style (bold + `text-shadow`), used app-wide | Darken the gradients or add a dark text variant, app-wide |
| F3 | Mobile XP-bar functional text at **10px** | `cozy.scss` `.xpbar span` (`max-width:760px`) | Pre-existing HUD; not phase-2 | Bump to 11px |
| F4 | `transition: width` on progress bars (layout thrash) | `cozy.scss` `.q-bar div`, `.xp-bar > div` | Pre-existing; 0.4s, off the hot path | Use `transform: scaleX` |
| F5 | `shape-assembled-illustration` — the advisor SVG (22 primitives) | `advisor-*.svg` (L9 path b) | Already recorded in ADVISOR-SPEC §8; Gemini path (a) is the upgrade | Retry image-generator art if billing is restored |
| F6 | `side-tab` 3px one-sided border on the rail/tab header | `program-shell.vue` | The chunky cream/wood border is the whole game's design language, not an AI tell here | Keep unless a broader restyle |

**False positives / accepted (documented).**

- `low-contrast 2.8:1 #6f5940 on #6dbb47` (owner program): the text sits on the
  `.op` sky→cream **gradient**, which the detector ignores, then walks up to the
  solid `.cozy` green. The real surface is cream — **6.03:1**. (Same class of
  layered-background false positive as 3B's `#6f5940 on #6dbb47` and 1B's
  §8 note.)
- `cramped-padding` on `.res` ×3 and `.xpbar`: `.res` is a pill with 14px
  horizontal padding (children are centred, not flush); the vertical flags are
  the emoji/glyph baseline — and this geometry is the **lab mock**, not product
  markup.
- `clipped-overflow-container` (html/body/`.cozy`): the full-screen game
  deliberately clips; the advisor and drawers use their own layers, not
  tooltips escaping `.cozy`.
- `pulsing-dot .cozy .livedot`: the **live-match** indicator (genuinely live
  data) — the rule exempts "indicators tied to genuinely live, changing data".
- `pulsing-dot .status-pulse` / `.live-pulse-dot`, `dark-glow #67e8f9`: other
  components captured by the whole-page dump (manager-app widgets), not on the
  changed screens.
- `repeating-stripes-gradient`: the program screen's decorative cloud/sky.

### 3.3 Human visual review (beyond the detector)

- **Art direction is intact**: cozy, flat-shaded, sunny, cream/wood, Fredoka,
  Villa money throughout; no dark/realistic drift.
- **Tier wording (L12) is clean** on the facilities screen — every label reads
  "Tier 1", "Build Tier 1", "Tier 1 · 20 min"; no legacy "level" leaked.
- **Mobile advisor** is large but clears the date bar, dock and PLAY; the
  bubble never clips.
- **Minor cosmetica** (not defects): a decorative `.op-cloud` overlaps the
  inactive "Level 1" rail chip on desktop; the sign toast briefly overlaps the
  rail during the star reveal. Both are transient/decorative.
- **Live dev-stack noise**: the realtime gateway (`:3005`) is not running, so
  the client logs 4 WebSocket connection errors; the client degrades silently
  and the flow is unaffected. Pre-existing dev-stack gap (noted by 3C too).

### 3.4 Design-health read

The changed UI keeps a coherent, authored identity: one named character
(Vintra), the same cream/wood/Fredoka system as the campus, money in one unit,
and juice (count-ups, star pops, stingers) that respects reduced motion. The
detector's residual flags are shared-style or false positives, not signs of
generated-UI drift. **Verdict: PASS with F1–F6 deferred.**

---

## 4. Screenshot inventory

```
assets/visual-qa/
  advisor/<desktop-1440x900|mobile-390x844>/    12 PNGs each (expressions + states)
  owner-program/<viewport>/                     10 PNGs each (the program screens)
  campus-live-advisor-<viewport>.png            campus + advisor on the real stack
  campus-campus-advisor{,-point,-excited}-<vp>.png   lab campus states
  campus-campus-advisor*-<vp>.json              canvas pixel metrics
  campus-fps-{live,lab}-<vp>.json               fps + renderer stats
  advisor-textfit-<vp>.{json,png}               the 39-line text-fit report
  culture-names-<manager|players>-<vp>.{json,png}
  canvas-inspection/evidence.json + 6× {json,png}   threejs-qa-release pass
```

## 5. Test files added (QA only)

- `tests/e2e/specs/visual-qa.spec.ts` — text-fit (39 lines × 2), culture-name
  fit, DOM snapshots for the detector.
- `tests/e2e/specs/campus-qa.spec.ts` — canvas metrics, lab fps, live campus
  screenshots + the authoritative fps gate.
- `tests/e2e/specs/fixtures/advisor-lines.json` — the frozen Go line set
  (generated from `tips.go`).
- `apps/fs-pro-client/campus-advisor-lab.html` + `src/dev/campus-advisor-lab.ts` — a dev-only
  harness exposing the real `World` + `CozyAdvisor` under
  `__THREE_GAME_TEST_HOOKS__` for the canvas inspector (no backend).
- `src/dev/advisor-lab.ts` — one added hook (`pushLine`) so arbitrary frozen
  lines can be text-fit; no component/store logic touched.

## 6. Checks after the change

```
vue-tsc --noEmit -p apps/fs-pro-client/tsconfig.json   -> 31 errors (baseline, 0 in changed files)
npm run build --workspace fs-pro-client                -> ✓ built in 16.43s
```

## 7. Known gaps

- fps is measured on this laptop's discrete GPU with a headed browser; the
  headless default (SwiftShader) is not a valid frame-rate measurement. The
  command is recorded in §1/§2.1.
- The 57 fps ceiling is the rAF/display cadence here, not a measured limit of
  the scene.
- F1–F6 are recommendations, not applied, because they belong to the copy
  (`tips.go`), the shared button style (`cozy.scss`) or a deliberate design
  choice — none to phase-2 screen logic.
