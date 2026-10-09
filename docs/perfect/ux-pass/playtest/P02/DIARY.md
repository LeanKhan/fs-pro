# P02 — DIARY.md

**Persona:** Football Manager veteran. Viewport 1440×900, mouse.
**Focus:** depth, information density, squad/tactics screens. I compare
everything with Football Manager and Clash of Clans.
**Instance:** shared playtest stack, `http://localhost:4173`, D3 scale
`GAME_TIME_SCALE=4`, `DayLengthMinutes=48` (so every timer is 4× its
design-scale equivalent; I report both).

Mood is 1–5 (1 = about to rage-quit, 5 = delighted).

---

## Session 1 — 2026-10-08, ~11:20–11:45 UTC (registration & founding)

First impressions as an FM veteran. The landing page is clean, cosy, and the
crest designer on the club step is genuinely lovely — five shapes, eight
patterns, eight emblems, three independent colour rows with hex boxes. That is
the kind of depth I want, and it is *ahead* of most F2P club games which hand you
three preset badges. I spent real time in it.

Then the first friction. I typed a club name, the code auto-derived, and
"Next: kick-off" stayed greyed out. I re-typed three different names before I
found the tiny line "That name or code is taken" — which never told me *which* of
the three fields was the problem. As a veteran I expect a field-level error; this
is the onboarding moment and it cost me ~5 minutes.

Two numbers didn't reconcile. The kick-off card said "Bank 1.5M"; the club then
started with V4M. I trust the V4M (campus + Owner's Program agree) so the
founding preview is the odd one out.

Getting back to my club after founding is a bit of a maze: reopening the wizard
URL offers to found a *different* club in a different town, with only a small
"Back to my club" escape. I found it, but a newcomer might not.

The campus itself is information-rich and looks the part: Day/Year clock, XP bar,
Villa, fans, a First-steps checklist, an advisor, and a 4-step Owner's Program
(Manager → Squad → Facilities → Level 1, 54 XP). I like that the program is an
explicit syllabus. **Mood: 4/5.**

Plan: spend the board's V4M on the Owner's Program in order.

---

## Session 2 — 2026-10-08, ~11:45–12:10 UTC (Owner's office, Recruitment)

Came back after a break and got the "While you were away — Squad rested"
modal. That's the comeback beat working as intended; nice. Small annoyance:
Escape doesn't dismiss it and the backdrop blocks the whole campus until you
press "Let's go!".

The "Manager" button on the dock opens an **Owner's office** drawer with six
tabs: Matchday, The brief, Squad, Recruitment, Owner, Analysis. This is the
depth screen I was hoping for. Recruitment is a real transfer market:
Budget V4M, a "Request Board Funding" button, a transfer-window banner
("open — closes in 2 days (day 471)"), My Offers with a season/history toggle,
a Scouted Shortlist, search, All/Free Agents/Other Clubs filters, and a
5,596-player table with Player · Position · Age · Rating · Origin/Club · Value ·
Wage · Actions, paginated at 10/page.

For an FM veteran this is the good stuff — rating chips, age, value, wage all
visible. But three things jarred:

1. **Test data in the live market.** The list included a player literally named
   "HTTP PgTest" (DEF, 29, OVR **0**, V0, V0). It is a Postgres test fixture
   leaking into the production market a player sees on day one. It reads as
   "this build is unfinished".
2. **Duplicate rows.** The same player (Drikumu Bloobraz, DEF 19 62 V416,000)
   appeared twice in a single page of 10, as did Peebrubrai Mevra. It makes the
   market look broken.
3. **Empty state inconsistency.** A second visit showed "No players available"
   in the same table where the first visit had 5,596 — I need to re-test whether
   it's a race or a real intermittent bug.

Also: the right-hand drawer means the Actions column (the eye / sign buttons)
is clipped at 1440 wide and the table doesn't obviously scroll horizontally.
The primary action is the one you can't see.

**Mood: 3/5.** The ambition is right; the polish and number-hygiene are not yet
FM-grade.

_(Environment note: after this session WSL→Windows interop, which I need to
drive Windows Node/Playwright, went down — every `cmd.exe` call returned
`UtilAcceptVsock:271 accept4 failed 110`. I paused the playtest and retried.)_

---

## Session 3 — 2026-10-08, ~12:20–16:00 UTC (blocked: instance outage)

Two separate environment failures stopped the run:

1. **Interop down (~12:20 onwards).** Every Windows sidecar call (`cmd.exe`,
   `powershell.exe`) failed with `WSL UtilAcceptVsock:271 accept4 failed 110`
   for ~3.5 h. The Windows-side Playwright harness (D7) could not run at all.
   I kept polling; it never recovered inside my window.

2. **Shared API hung (~15:15 onwards).** I fell back to the same trick A01 had
   already set up — running the *identical* production client bundle on Linux
   (`dist/` served on `http://localhost:4173`) with the browser's API calls
   proxied ("172.22.48.1:3010", the WSL host gateway) to the same shared
   instance. That loaded the client and I reached the sign-in screen, but
   **`POST /api/users/login` never returns** (no response after 85 s; button
   stuck on "Signing in…"). `GET /healthz` returns **HTTP 503 `{"ok":false}`**.
   Note the DB port (5434) still accepts TCP, so this looks like a hung worker
   / pool in the Node API, not a dead DB — the kind of thing the lead restarts
   and logs.

I did **not** bypass this by touching the API by hand or the DB (U2). I stopped
advancing and polled for recovery. No gameplay progress was possible from
~15:15 UTC; I had reached **Level 0** with the onboarding and the Recruitment
screen exercised.

_Correction to Session 2's point 3:_ the empty market wasn't a race. Re-checking
the screenshots, the day-469 table (5,596 rows) and the day-470 table ("No
players available") differ because the **transfer window closed** between them —
while the day-469 banner still said "closes in 2 days (day 471)". Logged as
P02-10 (market empties silently when the window shuts) and P02-11 (the countdown
contradicts the close day).

**Mood: 2/5** — not the game's fault today, but the pass depends on the shared
instance staying up.

---

## Stop — 2026-10-08 ~19:20 UTC (D5 cap)

Both the interop and the shared API stayed down to the 8-hour cap (first
registration ~11:23 UTC → cap ~19:23 UTC). `healthz` polled **503** every 30 s
for ~4 h; interop polled `accept4 failed 110` for ~7 h. I stopped per D5:
"truly blocked, log it, stop at the cap". No gameplay was possible after
~15:15 UTC.

Final state of my club: **Veteran Analytics (VET), Sdev Central, Kev — Level 0,
0/100 XP**, Owner's Program step 1 (hire a manager) not started, transfer window
closed. 12 issues logged (1 S1 instance, 2 S2, 7 S3, 2 S4).

**Mood: 1/5** at the stop — I came to play to Level 2 and never got a healthy
instance for more than a few minutes.

---

# RESUME — 2026-10-08 ~23:45Z onward (after the outage was fixed)

The login in `state.json` still worked, so I landed straight in
`/game/766a6c8b-2547-4ba3-939f-6f6cb47613a1` — no password, no re-onboarding.
My club had aged in the downtime: **Day 478, Year 8** on arrival (last session:
day ~470), Level 0, 0/100 XP, V4M, transfer window **closed**. The campus and
its "While you were away" modal came back exactly as before (Escape still does
nothing — P02-09).

## Session 4 — 2026-10-08 ~23:45–01:15Z (resume: Owner's Program, manager hire)

I picked up the Owner's Program at step 1, "Hire your first manager". Opening
the Owner's office (dock → Manager) and reading the tabs gave me the first real
map of the game:

- **Owner tab** is a proper finance board — Club Treasury, Annual Wage Bill,
  Matchday Revenue, Net Operating Margin, a Matchday Financial Ledger table,
  Board Confidence **60%**, Fan Approval **55%**, and "Board Expectations"
  (a real FM-flavoured dashboard; I liked it).
- **The brief** tab turned out to be the **Team Sheet / tactics board** (4-3-3,
  Playing Style Balanced, Auto-Pick / Suggest / Save Tactics) — the same screen
  as the dock's "Team Sheet" button, while the separate **Squad** tab is squad
  management (Medical Bay, Promote Youth Player, a player table). The label
  "The brief" doesn't match its content (P02-16).
- **Analysis** is an empty board-review panel at Level 0 ("No performance data
  yet") — fine, just empty.

Then the headline of the whole run: **hiring a manager is impossible.** Owner →
"Hire Head Coach" opens a "Hire a new Manager" dialog whose candidate list is
**crawling with duplicates** (1014 rows / 1004 unique; one name ×7, another ×5 —
P02-14), opens **empty for the first ~4 s** with no spinner (P02-15), and shows
only Nationality/Age/Titles with an unexplained "Details" note box (P02-18).
Worse: picking a candidate and pressing **HIRE closes the dialog and does
nothing**. The network shows `PUT /api/clubs/<club>/manager → 403 {"message":
"Admins only"}` while the client console logs "Club Manager appointed
successfully!". No error is surfaced; "No manager currently under contract"
stays and First steps never leaves 0/4. (P02-13.)

**Mood: 2/5.** The depth is genuinely there on the finance/tactics side, but the
one action the game tells me to do first is broken.

## Session 5 — 2026-10-08 ~01:30–02:00Z (Recruitment resume + PLAY dead-end)

Came back and re-checked the market. The transfer window is still **closed**, but
the market is **browseable again** (5,626 rows on day 486) — so the empty "No
players available" I saw on day 470 was an intermittent render, not the window
closing (corrected in P02-10). Data hygiene is unchanged: **"HTTP PgTest"** is
still a live free agent (P02-07), the same player still appears twice on one page
("Jugre Cheifeigie" in adjacent rows, "Peebrubai Mevra" twice — P02-08), the
"Scouted Shortlist" card is still dark-on-dark (P02-05), and the Actions column
is still clipped at the drawer edge (P02-06).

I couldn't bid (window closed), so I tried the **PLAY** dock: "Find a Match" is a
nice, clear card (Your power / Team sheet / Starters, and — importantly — *"The
engine fills gaps automatically"*), and it matchmade me against another **human**
club ("Sdev Central United", manager Sam Carter; later "Invite Rovers", a P08).
I pressed **Play now** and the dialog just **closed silently**. The reason is
only in the network: `POST /api/play/<club>/match → 409 "Sign a manager before
your first match"` — swallowed by the UI (P02-19).

So it's a **hard dead-end**: I can't hire a manager (403, P02-13) and I can't
play any match without one (409, P02-19), and the window is shut, so there is no
route to XP at all. **Level 1/2 are unreachable from a new club.** I logged it as
P02-20 and kept exploring everything I could still reach.

**Mood: 1/5.** Not a persona nit — a fresh player simply cannot start.

## Session 6 — 2026-10-09 ~02:00–02:30Z (breadth: League, Challenges, Build, tactics)

- **League**: empty for a new club — "You're not in a league this year. New clubs
  join their country's pyramid when the next season is drawn." No table, no
  fixtures, just an "Other competitions" button (P02-21). As a veteran I came
  looking for a table and found a dead end.
- **Challenges**: a 5-tab overlay (challenge/incoming/sent/upcoming/history),
  empty; tabs are cramped.
- **Build**: genuinely good — seven facilities with Tier, the current stat and
  the *next* upgrade with its price (Grass Pitch V250,000, Ticket Booth V300,000,
  Practice Field V200,000, Youth Tent V350,000, Lookout Post V220,000, First Aid
  Tent V260,000, Staff Hut V300,000), against my V4M. "0/1 builders busy" is
  clear. This is the Clash-of-Clans half of the game done with taste.
- **Tactics depth (my persona focus)**: the Team Sheet offers only **four
  formations** (4-3-3, 4-4-2, 4-2-3-1, 3-5-2) and a Playing Style dropdown; the
  pitch slots (LW/ST/RW, CM/CDM/CM, LB/CB/CB/RB, GK) expose **no player roles,
  no mentality, no team instructions** even in their empty-state labels (P02-22).
  For an FM veteran this is the thin part of an otherwise detailed game.

Mid-session the **WSL→Windows interop dropped again** (`UtilAcceptVsocd:
accept4 failed 110`) on every `cmd.exe` call, so the Windows-Node harness could
not run. I polled for ~2 minutes per attempt; last checked it was still down when
I stopped to write up. This is the same host issue as Session 3 (A01-12).

**Mood: 3/5.** The depth on finances/facilities is real and I enjoyed it; the
dead-end on the very first action caps the whole experience.

---

- [2026-10-08T11:25:17.969Z] Opened the client at http://localhost:4173; landed on http://localhost:4173/auth/login.
- [2026-10-08T11:26:51.674Z] Opened the New manager registration form; reading the fields.
- [2026-10-08T11:28:04.520Z] Registered p02mick; after submit url=http://localhost:4173/start.
- [2026-10-08T11:29:58.356Z] Wizard step 2 (Club); url=http://localhost:4173/start.
- [2026-10-08T11:33:52.676Z] Diagnosed the disabled kick-off gate: filled all three fields and logged the button state.
- [2026-10-08T11:35:19.261Z] Probed five name/code pairs; logged whether the taken-message and disabled gate change.
- [2026-10-08T11:38:05.719Z] Founded Veteran Analytics (VET); after kick-off url=http://localhost:4173/start.
- [2026-10-08T11:39:58.237Z] Entered the ground; campus url=http://localhost:4173/start.
- [2026-10-08T11:41:31.206Z] Clicked Back to my club. url=http://localhost:4173/game/766a6c8b-2547-4ba3-939f-6f6cb47613a1.
- [2026-10-08T11:50:52.507Z] Dismissed the welcome modal and opened the Owner's program.
- [2026-10-08T11:56:08.638Z] Entered Owner's Program step 1 (Manager); looking for the hire action.
- [2026-10-08T11:58:48.786Z] Opened the Manager screen from the dock.
- [2026-10-08T12:03:57.277Z] Diagnosed a modal-root that intercepts clicks on the campus.
- [2026-10-08T12:08:15.821Z] Dismissed the comeback modal, then clicked the Manager dock button.
- [2026-10-08T12:13:13.870Z] Opened Owner's office → Recruitment tab.
- [2026-10-08T12:17:20.567Z] Recruitment diag: 1 rows, duplicates=[], PgTest=false, tableScroll={"sw":792,"cw":792}.
- [2026-10-08T15:17:01.320Z] Linux fallback: signed in; url=http://localhost:4173/auth/login.
- [2026-10-08T15:17:34.435Z] Linux fallback: probed the login response; API looks degraded.
- [2026-10-08T15:18:13.070Z] Linux fallback: logged the login request/response; API degraded.
- [2026-10-08T15:53:42.901Z] Linux fallback: long login attempt -> status null.
- [2026-10-08T23:47:13.999Z] Resumed after the outage: opened the client; checking whether the preserved login lands me at my club.
- [2026-10-08T23:55:34.552Z] Dismissed the comeback modal (Escape still does nothing, P02-09). Opened Manager to hire my first manager.
- [2026-10-09T00:11:36.568Z] Toured the Owner's office tabs (The brief / Squad / Owner / Analysis) to locate the manager hire and the squad views.
- [2026-10-09T00:33:04.931Z] Owner tab is a real finance board (Treasury, wage bill, board confidence, ledger). Clicked "Hire Head Coach" to start the manager interview.
- [2026-10-09T00:44:30.524Z] Diagnosed the Hire-a-Manager dialog: waited 15s and scrolled; logging whether any candidate ever appears.
- [2026-10-09T00:55:22.662Z] Hired the first candidate from the manager dialog; checking whether the Owner's Program step advances.
- [2026-10-09T01:05:35.087Z] Diagnosed the failed hire: captured API responses, console errors and the dialog alert after pressing Hire.
- [2026-10-09T01:12:13.002Z] Compared "The brief" (tactics board) with the drawer "Squad" tab and the dock "Team Sheet" button to see whether they are the same screen with different names.
- [2026-10-09T01:24:51.524Z] Opened Recruitment and acted on the first market row to test whether a normal player can inspect/sign (the "Build a squad" step).
- [2026-10-09T01:33:46.262Z] Pressed PLAY on an empty squad to see whether a quick match is possible before signing players.
- [2026-10-09T01:44:27.815Z] Played a quick match (Play now) against another human club to observe the match screen, result and XP.
- [2026-10-09T02:06:19.952Z] Enumerated the Team Sheet tactics options (formation, playing style, role slots) to judge tactical depth versus Football Manager.
- [2026-10-09T02:23:45.185Z] Captured Playing Style options and opened the League screen to inspect information density.
- [2026-10-09T02:30:35.785Z] Toured League, Challenges, World and Settings to compare information density across the club screens.
- [2026-10-09T03:03:57.256Z] Opened Build to see facility costs/options and whether a normal owner can start a build while the program is blocked on the manager step.
