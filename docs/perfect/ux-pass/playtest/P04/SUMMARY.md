# P04 — SUMMARY (Impatient skipper)

Persona: **P04** — skips every dialog, tutorial and advisor line; never reads
guidance first time. Viewport **390×844 touch**. Client `http://localhost:4173`
(production build, INSTANCE-LOG §2). Focus: **can you recover after skipping?
Dead ends, lost guidance.** Account: `p04skipper` / **Skip Olson** (Skip FC,
`SKIP`), club `38ef7455-4aea-4b4d-84de-b7fa6cfdc746`.

> **Outage status.** Session 1–2 (2026-10-08 11:24Z–12:10Z) were cut off by the
> global WSL→Windows interop outage. The instance was restored at
> **2026-10-08T23:08Z** and I resumed from the preserved `state.json` (no
> re-registration) in **session 3 (23:46Z 10-08 → 03:0xZ 10-09)**. The interop
> outage **recurred at ~03:0xZ on 10-09** (`accept4 failed 110`), so session 3
> also ended blocked. Sessions 1–3 are covered below.

## Level / time

| | |
| --- | --- |
| Level reached | **0** — **40/100 XP** (Owner's program XP **30/54**, First steps **3/4**) |
| Wall time to register + found club | **~19 min** (2026-10-08 11:24Z → 11:43Z) |
| Wall time to Level 1 | **not reached** |
| Wall time to Level 2 | **not reached** (D5 cap never reached in play time; interop outages were the cause) |
| Effective play time | ≈**3 h** — ≈46 min (sessions 1–2) + ≈2 h 15 min (session 3) |
| Wall clock reg → stop | ≈**15.9 h** (11:24Z 10-08 → ~03:1xZ 10-09), of which **≈11 h was the outage** |
| Stop reason | **blocked S1 (harness/env)**: WSL→Windows interop outage — first 12:10Z 10-08, restored 23:08Z, **recurred ~03:0xZ 10-09**. Not a game defect. `traces/interop-s3.log`. |

Game clock at stop: **Day 494 · Sun Jan 09 2028 (Year 9)**. Club **Skip FC**,
Philamentia Central, Bellean. Bank ≈V4M · Fans 143 · Power 112 · Squad 11+ ·
Training Ground Tier 1 (built) · **not in a league** (next season's draw).

## What happened in session 3 (resumed)

- The **Owner's program** sheet is the missing map: Manager → Squad → Facilities
  → Level 1. It opened only on a forced tap (the chip pulses; a normal tap
  sometimes does nothing).
- **Signed a manager** (V40,000) via Owner's program → "start the program" →
  *Sign a manager*. **Signed 11 players** in one tap each. **Built Training
  Ground Tier 1** (V200,000; shows 5 min = 20 min at design scale 1).
- **PLAY** matched me against another persona's club (P03's *Ledger United*,
  "Even"). Friendlies pay **Win +30 / Draw +10 / Loss +5**; I **lost both 0-1**
  (+10 total for 40/100).

## Top 5 frustrations

1. **Tapping PLAY → Play now gives no match at all** — no score, no result, no
   XP toast, and repeat taps are silently ignored (cooldown with no timer). The
   result only surfaces later in the Owner's program list. (P04-11)
2. **The Level-1 carrot is a season-long dead end.** The program says "Earn the
   league place"; the League screen says "You're not in a league this year. New
   clubs join … when the next season is drawn." No date. (P04-12)
3. **Skipping still loses the map.** After quieting the advisor the tips are gone
   until a reload; the "Owner's program" chip — the only route to the first
   task — is an animation that fights the tap. (P04-09, P04-08)
4. **"Hire a manager" is not where the nav says.** Bottom-nav **Manager** opens
   Owner's office (Matchday/Brief/Squad/Recruitment/Owner/Analysis); the hire is
   behind the Owner's program chip. A skipper taps the obvious button and lands
   in the wrong place. (P04-04)
5. **Two different "11"s on one screen.** "Sign 9 more" next to "0 of 11 players
   / 0 goalkeepers" — signed vs matchday squad, unexplained. (P04-10)

## Top 3 delights

1. The **Owner's program** sheet itself — Vintra's voice, the three-way money
   choice ("Funds can't do all three well. That choice is the game.") and the
   win/draw/loss XP strip make the goal legible once found.
2. The **crest/celebrate beat** and the toast ("… joins for V16,500") — quick,
   warm confirmation when a signing lands.
3. The **campus** continues to read beautifully at 390 px; the town visibly grows
   between sessions.
4. The **advisor** returned on reload with fresh, relevant lines — a real
   recovery path for the skipper (mitigates P04-09).

## Moments I'd have quit as a real player

- **Session 1, 11:34Z** — disabled "Next: kick-off" on a form that looks filled.
- **Session 2, 12:04Z** — after silencing Vintra, unable to find "hire a manager".
- **Session 3, 01:42Z** — tapping **Play now** and getting *nothing*: no match,
  no score, no explanation. For an impatient player, "the button did nothing" is
  the quit moment, and it happened on the core game action.
- **Session 3, 03:02Z** — being told the league is a whole season away, with no
  date, right after the game promised it at Level 1.

## Metrics — actions per key task

One "action" = one tap/keystroke group in the screenshot → decide → act loop.

| Task | Actions | Notes |
| --- | --- | --- |
| Register | 7 | clean, single screen (session 1) |
| Found a club | 8 | form + 2 Next + Found (session 1) |
| **Sign a manager** | 8 | chip (flaky) → start program → scroll → Sign → confirm; found only via the chip (P04-04) |
| **Sign a player** | 1 each | one tap per free agent + toast; no confirm sheet (fast, good) |
| **Start a build** | 1 | "Build Tier 1" (plus 2 to open the sheet) |
| **Play a match** | 2 | PLAY → Play now, but **no result shown** (P04-11) |
| Set a plan | not reached | not attempted |
| Find the league table | 1 | **League** button → "not in a league this year" (P04-12) |

## Evidence

Screenshots: `screenshots/*.png` (viewer: PNG, 390×844); session-3 set is
`s3-*.png`. Traces: `traces/trace-*.zip`. Raw a11y excerpts for P04-10..13:
`traces/s3-evidence.md`. Play/XP logs: `traces/s3-14-playlog.txt`,
`traces/s3-15-log.txt`, `traces/s3-16-grind.txt`. Interop logs:
`traces/interop-error.log` (10-08), `traces/interop-s3.log` (10-09).

## Verdict

For an impatient skipper the **onboarding still survives skipping** as far as the
campus, and the Owner's program *does* contain the recovery path — but it hides
behind an unreliable, pulsing chip, and the bottom nav points the wrong way. Once
progression is needed, the feedback loop breaks: a friendly that "does nothing",
a squad tracker that contradicts itself, and a league that is a season away. The
single highest-impact fix for this persona is **making the first task reachable
from the obvious nav button and making PLAY show a result**.

## Resume note (for a possible session 4)

Login preserved in `state.json`. Resume at **Level 0 · 40/100 XP**, Program XP
30/54, squad signed, Training Ground built. Next: play friendlies (or book) to
Level 1, then watch the next season draw to enter a league for the Level-2 loop.
Re-check P04-11 (match feedback) and P04-12 (league gate) first.
