# P06 — SUMMARY (Low-end phone, slow network, prefers-reduced-motion)

- **Persona:** P06, 360×740 touch, CPU 4× throttle, Chrome "Slow 4G", `prefers-reduced-motion: reduce`.
- **Instance:** client `http://localhost:4173`, API `:3010`; clock `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` (design-scale timers are ¼ of the numbers below).
- **Credentials (registered through the UI):** username **`playtestP06`** / password **`Playtest-P06-2026!`** (display name "Casey Lowend", email `playtestP06@example.com`).
- **Club:** Lowend United (LOW), Lowend Park, Northgate Central, Bellean North, Bellean.

## Status

**Level 0** (club XP 0/100 on the HUD; Owner's Program XP 9/54). Not Level 2 (400 XP).
Wall time from registration (**2026-10-08T23:13Z**) to the last successful action
(**2026-10-09T02:38Z**) ≈ **3 h 25 min**. The run did not reach the 8 h cap; it was
stopped by a **WSL↔Windows interop outage** (same `UtilAcceptVsock:271: accept4
failed 110` failure as the instance's 12:18Z outage), which blocks all
Windows-Node/Playwright play (see DIARY.md). Not a game finding.

## What I reached

- Registration → founding → campus (5 screens: world map, your home, club design, kick-off confirm, "is born!"). **12+ distinct screens**.
- Signed a manager (Jousare Batou, V40,000, 3 yr) — First steps 1/4; Program XP 9/54.
- Reached the free-agent squad builder (GK + outfielders) and the Negotiate & sign dialog; the squad-signing loop's final count could not be verified before the outage.
- Owner's office tabs (Matchday, The brief, Squad, Recruitment, Owner, Analysis); Recruitment shows "Transfer window is closed".

## Time to Level 1 / Level 2

Not reached. Extrapolating from the observed ~8.5–11.6 s per throttled interaction and
~3 fps campus, the level-2 journey is not realistically playable on this device without
the performance work listed in ISSUES.md P06-01/P06-04.

## Top 5 frustrations

1. **Campus runs at ~1.7–2.9 fps idle and 0.8 fps while panning** (worst frame 2.35 s) — a slideshow on a low-end phone (P06-01).
2. **Every tap costs ~8–12 s** to produce its next UI (Manager drawer, negotiate dialog, confirm) — the app fights back against play (P06-04).
3. **`prefers-reduced-motion: reduce` is ignored** — collect bubbles bob, the online LED pulses and the PLAY button spins regardless (P06-03).
4. **The world map shows a blank blue field with "Unrolling the map…"** for several seconds before it draws (P06-02).
5. **Owner's-office tabs overflow silently** at 360 px — Recruitment/Owner/Analysis are off-screen with no hint (P06-05).

## Top 3 delights

1. The hand-drawn cozy art (cream/wood, Fredoka, sunny crest editor) reads clearly even at 360 px.
2. The founding flow is genuinely clear: the map → home → crest → "is born!" sequence explains itself.
3. The Owner's Program turns an empty club into a legible checklist ("1 Manager / 2 Squad / 3 Facilities / 4 Level 1").

## Moments I'd have quit as a real player

- Watching the campus stutter at ~2 fps on first arrival — I'd assume the game is broken.
- Waiting ~12 s after tapping "Sign" and getting a dialog with no spinner.
- Repeated "While you were away" modals stacked on the campus every time I returned.

## Metrics — actions per key task (tap-count on the UI)

| Task | Actions observed | Notes |
| --- | --- | --- |
| Register a manager (account) | 5 fields + submit | clean, no dead ends |
| Found a club | 3 screens (home, club design, confirm) + kick-off | flow resets if reloaded mid-way |
| Sign a manager | Owner's program → start program → Sign → contract years → confirm (5) | list itself needed a scroll to "start the program" |
| Sign a player | program → (filter) → Sign → confirm | window closed for the *transfer* tab; free agents allowed |
| Start a build | not reached before outage | — |
| Play a match | not reached (needs legal XI) | — |
| Set a plan / tactics | The brief tab reached | Auto-Pick/Save Tactics visible |
| Find the league table | "League" button visible in HUD; not opened before outage | — |

## Evidence

- Diary: `DIARY.md` · Issues: `ISSUES.md`
- Screenshots: `screenshots/` (01–45) · Traces: `traces/`
- Reduced-motion audit: `traces/P06-reduced-motion-anim-audit.txt`

_Last updated 2026-10-09T02:50Z. Update if the instance resumes._
