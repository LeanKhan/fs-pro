# P05 — SUMMARY (Keyboard-only + screen-reader semantics)

Viewport 1440×900, keyboard only. Client `http://localhost:4173` (production
build `e4db26c`). Club **Keyboard FC (KBD)**, Sdev Central. All times UTC.

**Status: stopped at the second environment block.** The run was cut short
twice by a **WSL↔Windows interop outage** (not a game defect): first at
~12:31Z on 2026-10-08 (fixed 23:08Z, see `INSTANCE-LOG.md` §7/§8), then again
at **03:10Z on 2026-10-09** (`UtilAcceptVsock:271: accept4 failed 110`; every
`cmd.exe`, so win32-native Playwright, is unavailable). Login persisted
throughout (`p05keyboard` / club `15428d05-3e73-477e-a594-b4b713cc90bf`,
`state.json`).

## Outcome

| | |
| --- | --- |
| Level reached | **Level 0** |
| XP at stop | **35 / 100** (Level 1 needs 100; Level 2 needs 400) |
| Owner's Program | **Program XP 12/54**; First steps **3/4** (manager signed, squad built, Tier 1 Training Ground building/done) |
| Level 1 reached | **no** |
| Level 2 reached | **no** |
| Sessions | 5 sessions across the two outage windows (2 forced breaks) |
| Wall time | S1–3 ≈ 11:25–14:02Z 2026-10-08 (≈2 h 37 m, incl. ≈90 min interop block). Resumed S4–5 ≈ 23:39Z 2026-10-08 → 03:10Z 2026-10-09 (≈3 h 31 m, incl. long scale-4 waits and a second interop block at the end). |
| Stop reason | **D5 environment block** at 03:10Z 2026-10-09 (interop down again). Before that, honest progression was possible but slow: the only Level-0 XP source is *winning* qualifying friendlies, and the squad is depleted/injured. |
| Outage status | **Down again as of 03:10Z 2026-10-09.** Lead action (D8): restart the WSL→Windows interop / Windows-side browser tooling; verify `cmd.exe` first. |

## Resumed-run narrative (what changed since the interim report)

- Login was intact; the world had kept ticking through the outage — the campus
  read **Day 478, Year 8** on resume and **Day 493, Year 9** at stop.
- Completed **Owner's Program steps 1–3** keyboard-only: signed manager
  *Faititrai Yaiyou* (Program XP 9/54 → 12/54), built a matchday squad, and
  built a **Tier 1 Training Ground** (campus Level XP 12 → 30/100).
- Opened **PLAY**; the matchmaker matched me against another persona's club
  (**P10 "Completionist FC"**), confirming D6 PvP matchmaking works.
- Could not convert friendlies into wins: **XP stuck at 35/100** over repeated
  `Play now` presses. My club was 8/11 starters with injuries and a losing run
  ("L D L D L"); at Level 0 only friendly *wins* pay meaningful XP (a loss pays
  ~5), so Level 1 was out of reach in the time available.
- Pacing (D3): every wait is **4× the scale-1 design number**. A Tier 1 build
  showed "5 min" (= 20 design min); a match cooldown is 75 s (= ~19 design s).
  At scale 1 the same build would be 20 min and the XP grind worse.

## Accessibility status (the P05 lens)

Registration → founding and the whole Owner's Program are completable
keyboard-only, focus rings are clearly visible, and the advisor tip is a proper
live region. But the build is **not screen-reader grade**, and modal handling is
the systemic weakness:

- **Modals don't manage focus (systemic).** The campus welcome/"While you were
  away" overlays and the **"Find a Match"** panel have no `role="dialog"` /
  `aria-modal`, keep focus on `body`/the trigger behind them, and offer no
  Escape (P05-01, P05-02, P05-21). The overlay's dismiss controls are the
  **23rd/24th** tab stops.
- **The one real dialog is unreachable by keyboard.** "Negotiate & sign" *is*
  `role="dialog" aria-modal="true"`, but focus is not moved into it and its
  markup sits **last in a 200-card document**, so `Not yet` / `Sign for V…`
  are hundreds of tab stops away — a keyboard-only player **cannot sign anyone
  without a focus workaround** (P05-17). Focus is then lost to `body` on close
  (P05-18).
- **Identical accessible names without identity:** 7 facility buttons named
  "Build Tier 1" (P05-19); the 200-manager list's actions (P05-07).
- **Invisible/unlabelled controls:** three 0×0 `input[type=color]` in the crest
  builder (P05-03); swatches announced as hex (P05-04).
- **Completed First-steps items are announced as disabled buttons**, not "done"
  (P05-20).
- **Contrast** is mostly good (6:1–11:1); low spots: inactive step subtitles
  3.38:1 (P05-15) and the disabled submit 2.38:1 (P05-16, exempt).

**Issue totals: 21** — **S1 ×0, S2 ×4, S3 ×9, S4 ×8** (see `ISSUES.md`; the
only S1-shaped events were the two environment outages, filed by the lead).

## Top 5 frustrations

1. The unreachable "Negotiate & sign" dialog (P05-17) — I could not sign a
   manager or player with the keyboard alone.
2. Modals that never announce themselves and leave focus on `body` behind the
   scrim (P05-01/02/21) — as a screen-reader user I did not know an overlay had
   opened.
3. The 200-card manager list: ~400 tab stops, identical action names, no
   headings (P05-07).
4. Seven facility buttons all named "Build Tier 1" (P05-19).
5. The invisible, unnamed colour inputs in the crest builder (P05-03).

## Top 3 delights

1. The focus indicator — a clear, high-contrast lime outline.
2. Registration → founding and the Owner's Program are fully completable with
   the keyboard, with proper visible labels on every real field.
3. The Vintra advisor is a `role="status"` live region (its tips are
   announced), and colour swatches expose `[pressed]`.

## Moments I would have quit as a real player

- First campus load: overlay opens silently, Escape dead, dismiss 23–27 tabs
  away (P05-01). A screen-reader user would think the page is frozen.
- Opening "Negotiate & sign" and finding no reachable button — the signing loop
  is the core of the game (P05-17).

## Metrics — actions per key task (keyboard)

| Task | Key actions | Reached? |
| --- | --- | --- |
| Register | ~12 | yes |
| Found a club | ~12 (a reload loses it, P05-05) | yes |
| Open the Owner's Program | dismiss modals (23–27 Tabs each) + Tab×6 + Enter | yes |
| Sign a manager | Tab×~7 to "Sign", Enter, then **focus workaround** for the dialog | yes (with workaround) |
| Sign a player | direct "Sign" for free agents; negotiate dialog otherwise | yes |
| Start a build | Tab×2 to the facility's "Build Tier 1", Enter | yes |
| Play a match | Tab×20 to PLAY, Enter, Tab×3 to "Play now", Enter | yes (match opened; no XP won) |
| Set a plan (team sheet) | — | no |
| Find the league table | League is locked until Level 1 | no (locked) |

## Evidence

- Screenshots: `playtest/P05/screenshots/*.png` (this run: `25`–`42`; earlier
  `01`–`24`).
- Traces: `playtest/P05/traces/*.zip`.
- Step scripts: `playtest/P05/steps/*.mjs` (throwaway, keyboard-only) and
  `.playtest-runtime/p05/` (helpers).
- Session log: `playtest/P05/DIARY.md`; issues: `playtest/P05/ISSUES.md`.
