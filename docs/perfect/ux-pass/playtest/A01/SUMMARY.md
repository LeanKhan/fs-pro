# A01 — SUMMARY (admin running the world)

Persona A01: admin, 1440x900 mouse. Instance: client `http://localhost:4173`,
API `:3010` (INSTANCE-LOG.md). Sessions with breaks per D4.

> **Status: complete (no longer blocked).** Session 1 (setup + screen survey,
> 11:24–12:19Z) stands. The outage that cut Session 2 short (A01-12:
> WSL→Windows interop + wedged API) was fixed by the lead at **23:08Z**.
> **Session 2 ran 2026-10-08 23:14Z → 2026-10-09 00:52Z** (a service restart
> interrupted ~00:26Z; resumed without repeating work). All findings below are
> evidenced.

## Pass outcome (A01)

- **World-running half: exercised and good.** The live clock advances at the D3
  scale-4 pace; "Advance one day" and the Year Calendar / Sim-to-Date controls
  work; competitions and their editions are fully manageable.
- **Governance/moderation half: essentially absent.** There is no Users,
  Reports, Chat or News surface anywhere; an admin cannot see who owns a club,
  cannot suspend a player, and cannot moderate content. The only assignment
  control is buried in the player Account settings and has no user selector.
- **A01-12 is resolved**; the world survived the restart with state intact.

## Level reached and when

- Admin club "Playtest Admin FC" founded **11:32Z** (needed to reach the app at
  all — A01-01). The admin account itself is Level 0 (it runs the world, it does
  not chase XP).
- World clock at hand-over: **Day 483 – Wed Dec 29 2027** (00:50Z), up from Day
  466 at Session 1 start. That is ~7 game days across Session 2's ~80 min
  (≈11–12 min/game day, matching D3); at scale 1 that is ~48 min/day, ~30 s/game
  hour.
- Year Calendar tally at hand-over: **3604 matches · 3497 played · 107
  remaining**.

## Wall time to Level 1 / Level 2

- N/A for the admin persona (A01 runs the world; it does not chase XP).
- Session 2 wall time ≈ **1 h 38 m**, of which ~25 min was a service restart;
  active play ≈ 65–70 min.

## D3 setup verification (the admin's first job)

- `Game day length (real min)` shown in the UI = **48** (confirmed Session 1,
  re-read Session 2). Effective `GAME_TIME_SCALE=4` is an environment value and
  is **not surfaced** (A01-04) — only day length is editable.
- Observed pace: game hour ≈ 30 s real, game day ≈ 12 min real (hour 13→15→16 in
  ~70 s; Day 475→483 over ~80 min). **Scale-1 equivalents: hour = 2 min, day =
  48 min.**
- `XP per win/draw/loss` = 30/15/5; `XP for each Level` blank (= 100×Level²);
  clock **Live**. Competitions exist and are running (Amateur Cup #4 in
  registration; the two pyramid pools running; others in draft).

## Top 5 frustrations

1. **No governance at all.** No Users/Reports/Chat/News moderation anywhere; no
   way to see a club's owner or suspend/ban a player. (A01-15)
2. **No admin door from login.** An `isAdmin` login is forced through the player
   "Found your club" onboarding; the only console link is buried in
   Settings → Account. (A01-01)
3. **Managers screen is broken.** "Error!" + GO BACK overlay, and the table has
   no column headers. (A01-10, A01-14)
4. **Admin header loss on deep link** — sidebar/top bar show "No club yet" and
   "Day 1" until you first pass through `/u/settings`. (A01-03/A01-06)
5. **"undefinedd"** duration on the pyramid pool leagues; **empty "League"
   column** on Clubs. (A01-05, A01-11)

## Top 3 delights

1. The **Year Calendar** — month grid with every fixture per day, transfer-window
   markers, view toggles, Sim to Date, and a live matches/played/remaining tally.
2. **World & Calendar** is genuinely powerful: live clock, advance-day,
   fast-forward, day length, transfer windows, XP curve, all in one place.
3. **Competitions** management is complete and readable — create/open/edit/
   archive, with a clear per-edition view (registration window, entrants,
   fee-paid state, invite, cancel).

## Moments I'd have quit as a real admin

- Right after login: no hint that an admin console exists, while the product
  made me create a real club in the shared world to get in. I assumed the admin
  UI was missing (Session 1).
- Opening the console Home and getting a static logo with no dashboard (A01-02).
- Reaching for "suspend this account" / "hide that chat message" and finding
  that no such screen exists at all (A01-15).

## Metrics — actions per admin key task

(§4 lists player tasks; those are N/A to A01. Admin equivalents:)

| Task | Actions (clicks/keystrokes) | Notes |
| --- | --- | --- |
| Sign in as admin | ~4 | credentials + Sign in |
| Reach admin console from login | ~9 | forced founding flow then Settings→Account→Admin console (A01-01). Once in the office shell, the sidebar "Admin console" link is 1 click. |
| Watch the clock advance | 1 + reload | "Now"/"Next tick" do not auto-refresh (A01-13) |
| Advance the world one day | 2 | Console → World & Calendar → "Advance one day" |
| Fast-forward to a date | 3 | type target day → "Simulate to day" |
| Open the Year Calendar | 2 | World & Calendar → "Open Year Calendar" |
| Find a club | 2 | Console → Clubs, type in search |
| Observe a club | 2 | search + eye icon |
| Inspect a competition's editions | 2 | Console → Competitions → "Open" |
| See a club's owner | impossible | no owner/user shown anywhere (A01-16) |
| Moderate a user / report / chat | impossible | no such screen (A01-15) |

## Accessibility / consistency notes

- Admin console is a **dark theme** in an otherwise cream/wood game (U7 art
  direction); flagged as a consistency observation, not a fix mandate.
- The Managers table exposes unlabelled action buttons and a headerless table
  to the a11y tree (A01-14).
- Club rating control exposes each value three times in the a11y tree (static
  text + button + radio).

## Session-2 evidence index

- `41-s2-admin-home.png`, `42-s2-world-calendar.png`, `43-s2-calendar-top.png`
  — console home + calendar.
- `44-s2-live-clock.png`, `45-s2-advanced-one-day.png`, `46/47/49-s2-clock-*`
  — live clock, advance-one-day, reload test (A01-13).
- `50/51/52-s2-competition*-` — competitions list + Amateur Cup editions.
- `53-s2-managers.png` (A01-10/A01-14), `54-s2-players.png`,
  `56/57/58-s2-club*` (A01-08/09/11).
- `59/60/61-s2-*` — moderation sweep (A01-15).
- `63/64-s2-assign-*` — Assign clubs dialog (A01-16).
- `65-s2-year-calendar.png`.
