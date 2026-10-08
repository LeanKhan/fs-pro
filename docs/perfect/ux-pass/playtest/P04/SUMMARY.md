# P04 — SUMMARY (Impatient skipper)

Persona: **P04** — skips every dialog, tutorial and advisor line; never reads
guidance first time. Viewport **390×844 touch**. Client `http://localhost:4173`
(production build). Focus: **can you recover after skipping? Dead ends, lost
guidance.**

> ⚠️ **Incomplete run — infrastructure blocker.** The WSL→Windows interop
> outage at **12:10Z** (global; A01-12 / INSTANCE-LOG §7) stopped the Playwright
> harness after ~46 min of play. I reached **Level 0**, not Level 2 (D5). This
> summary covers sessions 1–2 only; it will be extended if interop returns
> before the pass closes.

## Level / time

| | |
| --- | --- |
| Level reached | **0** (0/100 XP) — blocked before any progression |
| Wall time to register + found club | **~19 min** (11:24Z → 11:43Z) |
| Wall time to Level 1 | **not reached** |
| Wall time to Level 2 | **not reached** (8-hour cap not the cause; interop outage was) |
| Real play | ≈46 min across two sittings (11:24–11:43Z, 11:51–12:10Z) |
| Stop reason | **blocked S1 (harness)** by the global WSL→Windows interop outage (12:10Z; re-probed still down at 13:09Z). Logged per D5; not a game defect. A session 3 can resume from the preserved `state.json`. |

Game clock at stop: Day 470 · Thu Dec 16 2027 (Year 8). Club **Skip FC**,
Philamentia Central, Bellean. Bank V4.3M · Fans 150 · Squad 0/16 · First steps 0/4.

## Top 5 frustrations

1. **I skipped the help and there is no way back.** After "Quiet advisor tips"
   the guidance vanishes and only an unlabelled bubble remains — no "show tips
   again". For this persona that is the whole game. (P04-09)
2. **The club I "chose" isn't the club I got.** "Your home: Sdev Central, Kev"
   then I'm founded in Philamentia Central, Bellean. (P04-01)
3. **The first task is unfindable.** Program says *hire a manager*; **Manager**
   opens Owner's office; **Recruitment** is the player market. Dead end for a
   skipper. (P04-04)
4. **"Next" looks ready but does nothing.** The club form fields render
   suggestions as placeholders; Next is disabled with no reason. (P04-02)
5. **The digest modal blocks me every load.** "While you were away" on every
   campus visit. (P04-05)

## Top 3 delights

1. The **crest/celebrate beat** ("Skip FC is born!", "Go to your ground") — a
   warm, well-earned moment.
2. The **campus art** (cozy flat-shaded town) reads instantly even at 390px.
3. **Owner's office copy** is friendly ("Spend it like it's the last money
   you'll see"), and the money/Level header is legible on a phone.

## Moments I'd have quit as a real player

- **11:34Z** — tapping a disabled "Next: kick-off" on a form that *looks*
  complete, with no explanation (nearly quit inside 10 minutes).
- **12:04Z** — after silencing Vintra, being unable to find "hire a manager":
  this is the quit moment. The impatient path has no recovery and the game never
  told me I was skipping something I'd need.

## Metrics — actions per key task

Counted as distinct taps/typing actions from the screenshot → decide → act loop
(one "action" = one tap/keystroke group). Tasks not reached are marked.

| Task | Actions | Notes |
| --- | --- | --- |
| Register | 7 (2 taps + 5 fields) | clean, single screen |
| Found a club | 8 | 1 tap + form (name, Code, colours skipped) + 2 Next + Found |
| Sign a manager | **not reachable** | "Manager" nav ≠ hire; no route found (P04-04) |
| Sign a player | not reached | blocked at manager step |
| Start a build | not reached | bottom-nav **Build** seen but never reached (blocked) |
| Play a match | not reached | PLAY dock seen "Ready" but not attempted (blocked) |
| Set a plan | not reached | blocked |
| Find the league table | not reached | **League** button seen on campus; not opened (blocked) |

## Evidence

Screenshots: `screenshots/*.png` (viewer: PNG, 390×844). Traces:
`traces/trace-*.zip` (Playwright, one per session step). A11y trees printed with
each step. Interop log: `traces/interop-error.log`.

## Verdict

For an impatient skipper the **onboarding survives skipping** only up to the
campus. The moment genuine progression is needed, skipping the advisor leaves a
dead end (P04-04) with no recovery affordance (P04-09). Two of the nine findings
(P04-01, P04-04) are flow-level and should be triaged as S2 repriorities.
