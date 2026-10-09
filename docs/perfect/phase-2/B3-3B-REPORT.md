# B3-3B-REPORT.md — phase 2, Batch 3, Agent 3B

**Branch:** `p2/b3-3b` (worktree `.claude/worktrees/p2b3b`, from `p2/integration`
@ `89ef790`). **Scope (brief):** the owner-program screens — the starting-balance
reveal, hire-a-manager (browse → paid interview → negotiate → sign),
build-the-squad (free-agent + transfer markets, minimum-squad meter, budget
left), the facility step with **Tier** wording, the star reveal per step, and the
"You've reached Level 1, here's your league" draw/pool reveal — plus the
`club-game.vue` Manager-hub copy reframed to the owner's POV (L4), and juice
(count-ups, stingers through the existing WebAudio SFX).

**Ownership respected (R11).** I did **not** touch `components/cozy/advisor/**`
or the campus scene (3A). New work lives under `components/program/**`,
`composables/use-owner-program.ts`, `services/program.ts`,
`views/game/owner-program.vue`, the `club-game.vue` copy/entry and one additive
route. Unique `op-*` class names throughout (cozy.scss has global
`.card`/`.res`/`.form`).

---

## 0. Deliverables

| # | Deliverable | Path |
| --- | --- | --- |
| 1 | Program route/host | `apps/fs-pro-client/src/views/game/owner-program.vue` |
| 2 | Program shell + rail + stars + meter + advisor note | `apps/fs-pro-client/src/components/program/program-{shell,rail,stars,meter,advisor-note}.vue` |
| 3 | Step screens | `.../program/program-{balance,managers,squad,facilities,level1}.vue` |
| 4 | Market cards + count-up + helpers | `.../program/program-{manager-card,player-card,count-up,lib}.vue/.ts` |
| 5 | API access layer (ts-rest) | `apps/fs-pro-client/src/services/program.ts` |
| 6 | Flow state + actions | `apps/fs-pro-client/src/composables/use-owner-program.ts` |
| 7 | Owner-POV hub copy + program entry | `apps/fs-pro-client/src/views/game/club-game.vue` |
| 8 | Route | `apps/fs-pro-client/src/router/index.ts` |
| 9 | Playwright screenshots (route-mocked) | `tests/e2e/specs/owner-program.spec.ts` → `tests/e2e/artifacts/*/owner-program/` |
| 10 | Design-detector DOM snapshot + scan | `tests/e2e/artifacts/owner-program-dom/managers.html` |

### Files changed (summary)

```
 M apps/fs-pro-client/src/router/index.ts                 (+8: /game/:clubId/program)
 M apps/fs-pro-client/src/views/game/club-game.vue        (hub copy + program entry)
?? apps/fs-pro-client/src/components/program/**           (13 files)
?? apps/fs-pro-client/src/composables/use-owner-program.ts
?? apps/fs-pro-client/src/services/program.ts
?? apps/fs-pro-client/src/views/game/owner-program.vue
?? tests/e2e/specs/owner-program.spec.ts
?? tests/e2e/artifacts/*/owner-program/                   (20 PNGs: 10 screens × 2 viewports)
?? tests/e2e/artifacts/owner-program-dom/managers.html
```

---

## 1. The screens

All copy and money are in **Villa** (`formatVilla`, L13/D2). Every step consumes
the server program state (`GET /program/:clubId`) and the advisor line the Go
engine selects; the client never invents step facts.

1. **Balance reveal** (`program-balance.vue`) — the drawn V1M–V5M as a count-up
   "wow", a coin burst, the band-appropriate line (≤V1.5M / <V4M / ≥V4M, spec
   §4 step 0), and "what it buys" cards. Once-per-club via a local flag; the
   server has no persisted flag for step 0.
2. **Hire a manager** (`program-managers.vue` + `program-manager-card.vue`) —
   browse the seeded pool with **masked ranges** (`48–52`), sort (Cheapest /
   Best rated / Youngest), search, affordable-only. **Interview · V25k** calls
   the paid reveal and shows exact attributes + a trait note + the `−10%`
   negotiation badge. **Sign** opens the negotiate modal (fee, wage, 1–5 year
   contract, budget-after, "not interviewed" warning), then the money write.
3. **Build the squad** (`program-squad.vue` + `program-player-card.vue`) —
   minimum-squad **meter** (manager ✓, n/11, GK count) fed by the club roster,
   **budget left**, a free-agent market (search / position / sort / **Scout ·
   V15k** reveal / **Sign**), and a **Transfer market** tab (existing
   `players.getPlayers` + `transfers.purchasePlayer`, gated by the window).
   Board advance is surfaced as the L7 recovery path when cash runs thin.
4. **Facilities** (`program-facilities.vue`) — the Tier-1 builds with **Tier**
   wording (never "level"; `tierWording()` also rewrites the one legacy
   `effectLabel` that still said "level"), costs/times from `asset.next`, the
   recommended {Training Ground, Stands, Medical Centre} set, and the ★★★
   buffer hint.
5. **Level 1 → the draw** (`program-level1.vue`) — the XP push (win +30 / draw
   +10 / loss +5, recent qualifying friendlies) and, at the threshold, the
   **league draw reveal**: Level-1 shield, competition · division · pool name,
   the pool table animating in, and the first fixture, with confetti and
   `sfx.levelup`.
6. **Star reveal** (`program-shell.vue`) — after the server advances, the
   completed step's stars pop in with a chime on each star, `+N program XP` and
   the server's `reasons` (decision quality, spec §3.2).

**Juice** (threejs-gameplay-systems game-feel): `program-count-up.vue` rAF
count-ups for the balance and the negotiated fee; `program-stars.vue` staggered
star pops with `sfx.play('star')`; `sfx.play('coin'/'collect'/'levelup'/'win')`
stingers on the reveal, interview, sign, build and league moments. Every
non-essential motion is gated behind `prefers-reduced-motion` (count-up jumps to
the final value; stars show at once; confetti hidden).

---

## 2. Wiring (existing store/services patterns)

- `services/program.ts` wraps every `client.program.*` route with a typed
  envelope-unwrap (`fetchProgramState`, `advanceProgram`, `fetchManagerMarket`,
  `interviewManager`, `signManager`, `releaseManager`, `fetchFreeAgents`,
  `scoutFreeAgent`, `signFreeAgent`, `requestBoardAdvance`, `dismissTip`,
  `fetchProgramChapter`). No envelope shapes leak into components.
- `composables/use-owner-program.ts` owns the flow state and actions, mirroring
  `use-club-game.ts`: it loads the program state, campus, play state and club
  roster in parallel, then lazily loads the manager/player markets when the step
  changes. Money-write actions apply the returned state, so budget/steps update
  without a second read. It reuses `facilities.startUpgrade`,
  `players.getPlayers`, `transfers.getTransferWindow` and
  `transfers.purchasePlayer` for the facility and transfer-market paths.
- The step predicate is re-checked after each action by calling
  `POST /program/:clubId/advance`, which is how the star reveal is captured
  (`before.step !== next.step`).
- `club-game.vue` gained a small server-backed entry: it reads the program step
  and shows a `.program-chip` ("Owner's program · <next action>") while the
  program runs, opening `/game/:clubId/program`; `?open=program` deep-links it.

**Manager-hub copy (L4, owner POV).** In `club-game.vue`: the drawer title
`Manager` → **"Owner's office"**; tab titles → **The brief** (was "Team sheet"),
**Recruitment** (was "Transfers"), **Owner** (was "Club"); `managerBriefingMessage`
now reports *the manager's brief to the owner* ("Your manager reports …") rather
than the manager's own thoughts. The dock label in `cozy-hud.vue` is 3A's file
and was left untouched.

---

## 3. Commands and output (R4)

**Environment.** Worktrees have no `node_modules`; I joined the worktree's
`node_modules` (root + the four workspace dirs) to the main checkout's with
Windows junctions, so the client build/typecheck run under **Windows Node**
(`cmd.exe`), as required.

### 3.1 Client build (Windows Node)

```
> npm run build --workspace fs-pro-client
✓ built in 17.73s
... assets/owner-program-<hash>.js   43.04 kB │ gzip: 14.13 kB ...
```

### 3.2 Client typecheck (`vue-tsc`)

No repo-local `vue-tsc`; used the phase-1 pinned scratch
(`vue-tsc@2.0.29` + `typescript@5.4.5` in `%TEMP%\node_modules`):

```
> node_modules\.bin\vue-tsc.cmd --noEmit -p ...\apps\fs-pro-client\tsconfig.json
31                     # error count — the documented baseline, unchanged
$ grep -n "program\|owner-program\|use-owner-program" <output>
NO MATCHES IN MY FILES
```

The 31 errors are exactly the phase-1 baseline (`BASELINE.md`); none is in a new
or changed file.

### 3.3 Playwright (route-mocked; full stack not running)

The dev stack (Postgres + API + Go world-service) was **not** up, so every API
route is mocked in the spec. Both brief viewports, one worker:

```
> node .../@playwright/test/cli.js test specs/owner-program.spec.ts --reporter=list
Running 18 tests using 1 worker
  ✓ desktop-1440x900 › owner program screen: balance / managers / squad /
    facilities / level1 / league
  ✓ desktop-1440x900 › interview -> negotiate -> star reveal
  ✓ desktop-1440x900 › transfer market tab
  ✓ desktop-1440x900 › DOM snapshot for the design detector
  ✓ mobile-390x844  › (the same eight, with the DOM snapshot skipped)
  17 passed, 1 skipped (47.7s)
```

### 3.4 `impeccable` design detector (R8)

The DOM snapshot of the rendered manager screen (Vite dev inlines the CSS) was
scanned with `npx -y impeccable detect` (v4.1.0). It began at **41**
anti-patterns; after sweeping my screens' muted text off the app-wide
`--muted #8b7357` (the B1-2/4B token issue) and darkening my primary
green/blue, the final scan is:

```
> npx -y impeccable detect tests\e2e\artifacts\owner-program-dom\managers.html
6 anti-patterns found. 1 advisory note.

C:\...\owner-program-dom\managers.html
  [side-tab] border-bottom: 3px                        (header/tab rule)
  [low-contrast] 2.8:1 — text #6f5940 on #6dbb47        (layered-background false positive)
  [pulsing-dot] .status-pulse        ┐
  [pulsing-dot] .live-pulse-dot      ├ other components (whole-page dump)
  [pulsing-dot] .cozy .livedot       ┘
  [dark-glow]  Zero-offset box-shadow (#67e8f9)         (other component)
```

The remaining low-contrast line reads the ancestor `.cozy` `#6dbb47` as the
background for text that sits on the `.op` gradient — the same class of
layered-background false positive ADVISOR-SPEC §8 documents. The three pulsing
dots and the glow are other components' styles captured by the whole-page dump.

---

## 4. Screenshots

`tests/e2e/artifacts/<project>/owner-program/` (Playwright, one per screen;
`artifacts/owner-program-dom/managers.html` is the detector input):

| # | Screen | desktop 1440×900 | mobile 390×844 |
| --- | --- | --- | --- |
| 1 | balance reveal | `01-balance.png` | `01-balance.png` |
| 2 | manager browse | `02-managers.png` | `02-managers.png` |
| 3 | squad + meter + free agents | `03-squad.png` | `03-squad.png` |
| 4 | facilities (Tier 1) | `04-facilities.png` | `04-facilities.png` |
| 5 | Level-1 push | `05-level1.png` | `05-level1.png` |
| 6 | league draw reveal | `06-league.png` | `06-league.png` |
| 7 | manager interview (paid reveal) | `07-manager-interview.png` | `07-manager-interview.png` |
| 8 | negotiate + sign modal | `08-manager-negotiate.png` | `08-manager-negotiate.png` |
| 9 | star reveal | `09-star-reveal.png` | `09-star-reveal.png` |
| 10 | transfer market | `10-transfer-market.png` | `10-transfer-market.png` |

---

## 5. Acceptance criteria → evidence

| Criterion (brief) | Status | Evidence |
| --- | --- | --- |
| Starting-balance reveal, V1M–V5M in Villa | **PASS** | `program-balance.vue`; shots 1 |
| Hire a manager: browse, paid reveal, negotiate, sign | **PASS** | shots 2/7/8; `program-managers.vue`, `services/program.ts` |
| Build the squad: free-agent + transfer markets, minimum-squad meter, budget left | **PASS** | shots 3/10; `program-squad.vue`, `program-meter.vue` |
| Facility step with Tier wording + star reveal | **PASS** | shot 4; `tierWording()` in `program-lib.ts`; shots 9 |
| Level-1 moment with draw/pool reveal | **PASS** | shot 6; `program-level1.vue` |
| Reframe Manager-hub copy to owner POV (L4) | **PASS** | `club-game.vue`: "Owner's office", The brief, Recruitment, Owner, manager-reported brief |
| Juice: count-ups, stingers via existing SFX | **PASS** | `program-count-up.vue`, `program-stars.vue`; `sfx.play('coin'/'collect'/'star'/'levelup'/'win')`; reduced-motion gated |
| Unique class names (cozy.scss globals avoided) | **PASS** | every rule is under an `op-` class |
| Doesn't touch advisor/** or the campus scene | **PASS** | `git status` shows no changes there |
| `npm run build` | **PASS** | §3.1 |
| `vue-tsc` (no new errors) | **PASS** | §3.2 (31 = baseline) |
| Screenshots at 1440×900 and 390×844 | **PASS** | §4 (20 PNGs) |
| `impeccable` review | **PASS** | §3.4 |

---

## 6. Known gaps / hand-off

- **The dev stack was not up**, so the screenshots use the spec's route mocks
  (said clearly above). The real end-to-end flow — register → found → balance →
  hire → squad → build → friendlies → Level 1 → league — is **3C's** Playwright
  flow on the live stack; these screens are the units it will drive.
- **3C owns the trigger swap**: replacing the localStorage first steps
  (`club-game.vue` `fspro_steps_*`) with the server program state and removing
  my lightweight `.program-chip`/`?open=program` shim in favour of the advisor's
  routing. My `showBalance` once-per-club flag is local-only for the same reason.
- **Advisor portrait** is 3A's component; these screens render only the
  deterministic advisor **line** ("Vintra · club secretary"), not the art.
- `useOwnerProgram` loads a step's market lazily on step change; after a
  step-advancing action it reloads only when the step actually moves.
- The transfer-market tab is honest about the window: a Level-0 club sees
  "window closed — free agents are the way in", since purchases are refused
  while closed.
- **Contrast**: the app-wide `--muted #8b7357` AA issue (DECISIONS B1-2) is
  swept **inside my screens**; the shared token remains for the Batch-4 sweep
  named in `DECISIONS.md`.
- **Skills**: the harness `skill` tool exposes only repo skills, so
  `threejs-game-ui-designer` / `threejs-gameplay-systems` were read directly from
  `C:\Users\Emmanuel\.claude\skills\…\SKILL.md`; `impeccable` was run via npx
  because it is not a repo skill.
