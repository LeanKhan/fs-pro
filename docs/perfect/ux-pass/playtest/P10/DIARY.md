# P10 — Completionist explorer: opens every screen, drawer and setting

- Persona: **P10** (FOR-AGENTS.md §3 row 10). Viewport **1920×1080**, mouse.
- Focus: consistency across every screen, drawer and setting; broken or empty
  states; leftovers from old UIs; anything that looks unfinished.
- Instance: client `http://localhost:4173` (production build), API `:3010`.
- Account (created through the UI in Session 1): **username `playtestP10`**,
  password **`Playtest-P10-2026!`**, email `playtestP10@example.com`,
  manager "Playtest P10", club **Completionist FC (CMP)** in Philamentia
  Central, Bellean.
- Clock: `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` → 1 game day = 12 real
  minutes (D3). All timings below are reported at scale 4 (observed) and,
  where relevant, as the design-scale-1 equivalent.

The `[timestamp]` lines below are written by the harness `decide()` helper as I
play; the narrative blocks are my session summaries.

---

## Session 1 — register + found + first look round (2026-10-08 23:10 → 23:58 UTC)

Wall clock start of registration ≈ **23:10Z**. Goal this session: register a
new manager through the UI only, found the club, and open the first ring of
screens (Settings and its sub-pages).

**What I did (in order).** Landing → New manager → filled the join form →
`/start` → Home step (a pre-picked plot, Philamentia Central) → Club step
(crest designer) → Kick-off step → *Found Completionist FC* → campus.

**What I expected vs saw.**
- The join form is clean and labels every field ("Username 3-24 letters,
  numbers, . _ -", "Password at least 8 characters"); the Create-account
  button stays disabled until the form is valid, with no explanation text
  afterwards. Fine.
- The founding flow is a 3-step wizard (Home / Club / Kick-off). The three
  steps are numbered in the top-left; step 3 is disabled until step 2 is
  valid. Smooth.
- The **crest designer** is genuinely rich (5 shapes, 8 patterns, 8 emblems,
  3 colour palettes of 16 swatches + hex fields). Nothing finished-looking
  is wrong there, but the emblem/shape buttons are icon-only with no visible
  caption — I only knew what "pennant"/"sash"/"chevron" were from the
  accessibility tree. A sighted mouse user sees no labels.
- The state after founding persisted (no partial-state loss) — good.

**First look round.** Already two shells are visible: the **3D campus overlay**
(floating top bar, first-steps panel, advisor, bottom Build/Move/Squad/Manager
dock) and the **web-app shell** (left sidebar: My ground, Office, Competitions,
World Map, Year Calendar, Year History, <club>, Settings). They read as two
different products; the left sidebar has an old-fashioned list with no section
grouping and no icons-with-labels consistency check yet. More below.

**Mood: 4/5** — the onboarding is genuinely polished and quick; the only
hesitations were the unlabelled crest controls and having to guess that the
top-right "gear" is Settings.

### Findings this session
- P10-01 (S4, copy/consistency) — Settings entry and the screen it opens use
  different names.
- P10-02 (S3, visual) — Year Calendar "SIM TO DATE" is magenta, off-palette.
- P10-03 (S3, visual/copy) — crest shape/pattern/emblem buttons are icon-only
  (no visible labels), so a mouse user cannot tell what they are.
- P10-04 (S4, accessibility/consistency) — world-map image alt is a raw list
  of 11 country names.

## Session 2 — Owner's office + Owner's Program (2026-10-09 ~00:30 → ~02:40 UTC)

After the first server restart I re-verified the stack (`/healthz` ok, client
200) and continued.

**What I did.** Opened the **Owner's office** drawer from the campus "Manager"
dock button and walked all six tabs (Matchday, The brief, Squad, Recruitment,
Owner, Analysis). Then opened the **Owner's Program** (`/game/<id>/program`),
started it, and looked at step 1 (Sign a manager) including the interview and
the *Negotiate & sign* modal.

**Highlights.**
- The program step 1 screen is the best-built screen so far: sort chips
  (Cheapest / Best rated / Youngest), "Affordable only", a named board-brief
  line ("wants Overall 60+, a fee under 40% of your opening balance, and
  V400,000 left afterwards"), and rich candidate cards. Interviewing reveals
  the true ratings and knocks 10% off the fee ("−10% negotiated") — a lovely,
  legible loop.
- The *Negotiate & sign* modal is clear: signing fee, wage, contract 1–5,
  "Budget after V2.9M".

**Hesitations / friction.**
- The "Owner's office" drawer is not a modal: the 3D campus behind stays
  live-looking and the drawer is only ~42% wide, so it reads as two products
  at once.
- Three different names for the same job: the task says "Sign a manager", the
  Owner tab button says "HIRE HEAD COACH", and the program calls it "Manager".
- The Analysis tab's advisor invented match stats for a club that has played
  no matches (P10-06) and dresses in a dark/purple theme the rest of the game
  never uses (P10-07).

**Mood: 3/5** — the program screen is strong, but the naming drift and the
"designed for a different product" advisor panel are exactly the unfinished /
leftover feel this persona hunts for.

### BLOCKED (instance/interop, not a game finding)
At ~02:25Z the WSL→Windows interop failed again mid-run:
`UtilAcceptVsock:271: accept4 failed 110` on every `cmd.exe` call, so the
Windows-Node Playwright harness cannot start. This is the same outage logged by
A01 and the lead in `INSTANCE-LOG.md` (12:18Z row); it is the lead's job to
restore it, not mine (RESUME-BRIEF hard rule). I could not reach the client
from WSL either (`http://172.22.48.1:4173` → no route/000). I logged it and
kept retrying rather than starting/restarting anything. The manager signing is
one click away from completing: the *Negotiate & sign* modal was open when the
interop failed.

---

## Machine log

- [2026-10-08T23:14:43.341Z] Opened the landing page at 1920x1080; captured full a11y tree.
- [2026-10-08T23:16:55.811Z] Opened the New manager registration form.
- [2026-10-08T23:18:52.844Z] Registered playtestP10 / Playtest-P10-2026! and captured the post-registration screen.
- [2026-10-08T23:21:10.560Z] Advanced from Home step to the Club step of the founding flow.
- [2026-10-08T23:23:56.899Z] Filled club identity (Completionist FC / CMP / The Archive) and reached the Kick-off step; captured it.
- [2026-10-08T23:26:28.823Z] Clicked "Found Completionist FC"; captured the result.
- [2026-10-08T23:29:33.263Z] Entered the ground/campus and captured the full 1920x1080 view.
- [2026-10-08T23:33:45.054Z] Dismissed the welcome modal; captured campus and inventory of clickable controls.
- [2026-10-08T23:39:56.641Z] Diagnosed off-screen control coordinates (long document / transformed layer).
- [2026-10-08T23:44:29.165Z] Opened Settings from the campus gear and captured it.
- [2026-10-08T23:53:03.757Z] Opened Settings > Account; captured it.
- [2026-10-08T23:53:43.703Z] Opened Settings > Manager hub; captured it.
- [2026-10-08T23:54:21.748Z] Opened Settings > Year calendar & history; captured it.
- [2026-10-09T00:39:12.654Z] Opened Owner's office tab "Matchday"; captured it.
- [2026-10-09T00:39:20.576Z] Opened Owner's office tab "The brief"; captured it.
- [2026-10-09T01:00:00.339Z] Opened Owner's office tab "Squad"; captured it.
- [2026-10-09T01:00:11.634Z] Opened Owner's office tab "Recruitment"; captured it.
- [2026-10-09T01:00:21.272Z] Opened Owner's office tab "Owner"; captured it.
- [2026-10-09T01:00:31.907Z] Opened Owner's office tab "Analysis"; captured it.
- [2026-10-09T01:40:55.851Z] Opened the Owner's program panel and captured it.
- [2026-10-09T01:52:44.530Z] Started the Owner's program; captured step 1 (Manager).
- [2026-10-09T02:18:56.183Z] Interviewed the first manager candidate.
