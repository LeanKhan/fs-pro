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
- [12:30Z] Started a background interop probe (30 s poll); documented findings
  while waiting.
- [13:09Z] Probe finished: **still down after 30 min** (outage ≈1 h). No
  playtest artifact anywhere in `ux-pass/playtest/` has been written since
  12:35Z — every Windows-Node persona is blocked. No lead fix recorded in
  INSTANCE-LOG §7. **Stopped per D5** ("truly blocked by an S1, log it, stop"),
  not at Level 2. Account `p04skipper` / `state.json` preserved, so a session 3
  can resume if interop is restored:
  - finish "hire a manager" and the rest of the owner program to **Level 2**;
  - re-check P04-04 (manager hire route) and P04-01 (home vs founded town);
  - time a build and a match, and find the league table.
- [2026-10-08T23:46:59.518Z] S3 resume: opened http://localhost:4173; a11y has 25 lines.
- [2026-10-08T23:54:46.425Z] S3: dismissed digest; opened First steps checklist to find the manager task.
- [2026-10-09T00:09:53.805Z] S3: tapped Owner&#39;s program chip.
- [2026-10-09T00:36:55.725Z] S3: services up; tried advisor bubble and Owner&#39;s program chip to recover guidance.
- [2026-10-09T00:47:33.725Z] S3: opened Owner&#39;s program and tapped "Right then — start the program" to find the manager hire.
- [2026-10-09T00:53:24.173Z] S3: signed the cheapest manager (V40,000) from the Owner&#39;s program Sign-a-manager screen.
- [2026-10-09T01:03:28.884Z] S3: confirmed "Sign for V40,000" and captured the result.
- [2026-10-09T01:10:59.031Z] S3: signed 1 GK + 10 outfielders from Owner&#39;s program to open PLAY.
- [2026-10-09T01:22:41.144Z] S3: signed players in a loop to try to open PLAY.
- [2026-10-09T01:29:16.494Z] S3: built Training Ground Tier 1 (V200,000, shows 5 min at scale 4 = 20 min design).
- [2026-10-09T01:37:12.671Z] S3: returned to grounds and opened PLAY.
- [2026-10-09T01:42:31.893Z] S3: tapped Play now vs Ledger United (P03).
- [2026-10-09T01:50:31.778Z] S3: replayed Play now with screenshots at 0.8s/2s/6s to catch any match feedback.
- [2026-10-09T02:01:38.586Z] S3: ran 3 friendly plays ~78s apart; logged XP before/after to find the cooldown behavior.
- [2026-10-09T02:39:31.029Z] S3: single clean friendly play; XP before/after logged.
- [2026-10-09T03:02:47.996Z] S3 recon: read Owner&#39;s program status and League screen.

---

## Session 3 — Resume after the outage: find the manager, build the club (23:46Z–03:0xZ)

**Goal:** pick up from the preserved `state.json` and finally get through the
owner program to **Level 2 (400 XP)**, as P04 (skip everything, don't read).

- [23:46Z] Resumed on `http://localhost:4173` with the saved login (no
  registration, no password). Campus loaded, "While you were away" digest again
  (P04-05 confirmed) and the advisor tip rotating. `s3-01-resume-campus.png`.
  **Mood 4** — instance is back and I'm still Skip FC.
- [23:54Z] Dismissed the digest, tried tapping **First steps 0/4** — it's plain
  text, nothing happens. **Mood 3.**
- [00:09Z] Tapped the pulsing **Owner's program** chip — nothing on screen.
  The tap is unreliable against the animation (P04-08). `s3-03-owners-program.png`.
  **Mood 2.**
- [00:36Z] Retried with a forced tap; the **Owner's Program** sheet opened:
  *Program XP 0/54, 4 steps (Manager · Squad · Facilities · Level 1), Vintra's
  line, opening balance V4M, "Funds can't do all three well. That choice is the
  game."* `s3-04-after-owners-program.png`. **Mood 4** — this is the missing map.
- [00:47Z] Tapped **"Right then — start the program"** → a proper **"Sign a
  manager"** list (search, Cheapest/Best/Youngest, Affordable only). So the task
  *is* reachable — but only from the chip, never from the bottom-nav **Manager**
  that opened Owner's office in session 2 (P04-04 re-checked: route exists,
  nav is the trap). `s3-05-after-start.png`. **Mood 4.**
- [00:53–01:03Z] Signed the cheapest manager (V40,000, 3-yr contract). A
  **Negotiate & sign** sheet appears with a warning that I haven't interviewed
  him. Program XP **9/54**. `s3-06-after-sign.png`, `s3-07-after-confirm.png`.
  **Mood 3.**
- [01:10–01:22Z] Step 2: "Build the squad." Signing is one tap per player with a
  toast ("… joins for V16,500"); no confirm sheet for players. But the tracker is
  contradictory: the counter said **"Sign 9 more"** while the list said
  **"0 of 11 players · 0 goalkeepers"** (P04-10). Kept tapping; the step then
  completed (Program XP 12/54). `s3-08-after-gk.png`, `s3-08b-squad-built.png`.
  **Mood 3** — it works, but the two "11"s on one screen don't agree.
- [01:29Z] Step 3: built **Training Ground Tier 1** (V200,000, shows **5 min** —
  20 min at design scale 1). "All builders are busy" on every other card.
  `s3-09-after-build.png`.
- [01:37Z] Back to the grounds: **First steps 3/4**, Level 0 **12/100**, and
  PLAY now says **Starters 11/11** (it was "0 lineup slots empty" before).
- [01:42–02:39Z] Played qualifier friendlies. PLAY → **Find a Match** shows
  P03's **Ledger United** ("Even", power 116 vs my 118). Tapping **Play now**
  returns to campus with **no match screen, score or XP toast** — the result only
  shows later inside the Owner's program (**L Ledger United 0-1**, **L P07
  Athletic 0-1**). Repeat taps do nothing and there is no cooldown timer
  (75 s real / 300 s design). `s3-11-play-now.png`, `s3-12-*`, `s3-14-*`.
  **Mood 2** — "did my match happen?" (P04-11).
- [03:02Z] Recon: Owner's program **Program XP 30/54**, **Level 1 progress
  40/100**, "Win +30 Draw +10 Loss +5". The **League** screen says: *"You're not
  in a league this year. New clubs join their country's pyramid when the next
  season is drawn."* So even the Level-1 goal doesn't open league matches now
  (P04-12). `s3-15-program.png`, `s3-15-league.png`. **Mood 2** — the promised
  "real league" is a season away and the screen gives no date.
- [03:0xZ] **The interop outage recurred** (`UtilAcceptVsock:271: accept4 failed
  110`); `cmd.exe` from WSL fails again, so the harness cannot run. Broke for the
  session. Stopped per D5. `traces/interop-s3.log`. **Mood 1** — same wall as
  yesterday, just as I could see the path to Level 1.

**Where I stopped:** Level **0 · 40/100 XP** (Program XP 30/54; First steps 3/4),
Bank ≈V4M, squad signed, Training Ground Tier 1 built, Day 494 · Year 9. Reached via
**~2 h 15 min** of real play in session 3 (23:46Z–03:0xZ, including harness hangs
and two mid-session API restarts). Not Level 1 or 2 — blocked by the recurring
interop outage, not by the game. The `state.json` login is preserved for a
session 4 (see SUMMARY "resume note").
