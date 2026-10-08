# P04 — Impatient skipper: DIARY

Persona: **P04, Impatient skipper** — skips every dialog, tutorial and advisor
line; never reads guidance the first time. Viewport **390×844, touch**
(`personaContext('P04')`, Windows Node + Playwright, tracing on). Focus: can you
recover after skipping? Dead ends and lost guidance. Stop at Level 2 or the
8-hour cap (D5); sessions of 10–25 min with real breaks (D4).

Client: `http://localhost:4173` (production build, INSTANCE-LOG §2). All times
**UTC** (host is UTC−5). Account: `p04skipper` / `Skip Olson` (Skip FC, `SKIP`).
Supervisor: harness `tests/e2e/playtest/harness.mjs` — evidence only, no game
shortcuts (U2).

Mood is 1–5 (5 = great).

---

## Session 1 — Register + found a club, skip everything (11:24Z–11:43Z)

**Goal:** get in fast, found a club, ignore all guidance.

- [11:24Z] Landed on `/`. Clean landing: sign-in card, "New manager" link.
  Tapped **New manager**. `00-landing.png`. **Mood 4.**
- [11:27Z] Join form: name/email/username/password/password-again. Filled and
  submitted. `02-join-filled.png`.
- [11:28Z] Registered straight into a full-screen world map, banner
  "Found your club". Bottom card **"Your home"**: *Sdev Central · Kev Central,
  Kev · Hillside · 2/6 clubs*. Only action: **Next: your club**. Tapped it.
  Tapped **Next: your club**. `03b-resume.png`. **Mood 3** (I don't care where
  "home" is, I just want in).
- [11:34Z] Club form: Club name, **Code**, Ground, crest/colours. The name and
  ground *look* filled ("Sdev Central United" / "Sdev Central Park") but
  **Next: kick-off is disabled** and there is no hint why. Tapped Next anyway —
  nothing happened, no message. As a skipper who never reads, I had to poke the
  fields to discover they were only placeholders. Tapped the empty Code box and
  typed `SKIP`; fields were then actually empty-valued, so I typed a name too.
  `04-your-club.png`, `04b-club-filled.png`, `04d-club-filled.png`.
  **Mood 2** — first "why is nothing happening?" moment.
- [11:43Z] Kick-off summary: **"Skip FC SKIP" — Philamentia Central, Bellean
  Central, Bellean · Philamentia Central Park**. Wait — the "Your home" card two
  steps earlier said Sdev Central, **Kev**. The club was founded in a different
  country than the one advertised, and nothing told me. Dismissed the intro copy
  (skipped by habit). `05-kickoff.png`. **Mood 2.**
- [11:43Z] Tapped **Found Skip FC** → welcome map "Skip FC is born!" →
  **Go to your ground**. `06-campus.png`. Mood 3 (the crest/celebrate beat is
  nice).
  - *Break (~8 min).*

## Session 2 — Campus, silence the advisor, hunt the first task (11:51Z–12:10Z)

**Goal:** reach the owner program Level 2. Skipper rule: dismiss every advisor
line, don't read.

- [11:51Z] Campus loads. Bottom nav: **Build · Move · Squad · Manager · PLAY**.
  Top: First steps **0/4**, pulsing **Owner's program** chip. A welcome modal
  ("While you were away") blocks the screen — tapped **Let's go!**.
  `08-campus-welcome.png`. Then Vintra the club secretary panel with rotating
  one-line tips ("Spend on a manager first — the rest waits on him").
  `09-campus-after-welcome.png`.
- [11:52Z] Skipped/quieted the advisor: **Got it** then **Quiet advisor tips**.
  The advisor group empties out and a minimised bubble is all that is left.
  `11-advisor-quiet.png`, `error.png` (bubble). **From here there is no way back
  to the tips I never read** — no "show tutorial again" that I can see.
  **Mood 2.**
- [11:59Z] First task is "hire a manager". Tapped bottom **Manager** — it opens
  **Owner's office** (Matchday / The brief / Squad / Recruitment / Owner /
  Analysis), not a manager hire. `12-manager-screen.png`.
- [12:04Z] Tapped **Recruitment** → **Transfer Market** (free agents, 5,596
  players; "Budgets V4.3M"). No manager anywhere. A dark tooltip is stuck over
  the Scouted Shortlist; the list also contains an obvious test row
  ("HTTP PgTest", OVR 0, V0). `13-recruitment.png`. **Mood 1** — I dismissed
  all the help and now I cannot find the one task the game told me to do.
- [12:07Z] Went back to the campus, force-tapped the **Owner's program** chip
  (it pulses and would not hold still). It did not open anything I could read
  before the harness timed out. **This is where I'd rage-quit** — the impatient
  path has no recovery.
- [12:10Z–12:30Z] **Infrastructure outage:** every Windows `cmd.exe` from WSL
  now fails with `UtilAcceptVsock:271: accept4 failed 110`; the Playwright
  harness cannot start. Global (A01 logged it 12:18Z; P01/P02/P03/P05 affected
  too). I cannot continue the playtest. Logged and reported to the lead.
- **Blocked at Level 0** (0/100 XP, Day 468→470). Sessions 1–2 real play:
  ≈11:24Z–12:10Z across two sittings.

---

## Break / outage wait (12:10Z onward)

- [12:20Z] Last screenshot `error.png`; the run hung in the a11y snapshot and
  was killed by the shell timeout. Recovered state.json so the next session
  stays logged in.
- [12:30Z] Started a background interop probe; documented findings while
  waiting.
- [pending] Resume session 3 when interop returns: finish the owner program,
  push toward Level 2, and re-check P04-04 (manager hire) and P04-01 (home).
