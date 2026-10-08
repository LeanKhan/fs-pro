# A01 — SUMMARY (admin running the world)

Persona A01: admin, 1440x900 mouse. Instance: client `http://localhost:4173`,
API `:3010` (INSTANCE-LOG.md). Sessions with breaks per D4.

> Status: Session 1 complete (all admin screens surveyed, D3 verified).
> Session 2 (run the calendar / observe / moderate) is **blocked by an
> environment failure** — A01-12: WSL→Windows interop is down, so the
> Windows-Node Playwright harness cannot run. See DIARY.md. The findings below
> are all from Session 1 and are fully evidenced.

## Pass outcome (A01)

- **Stopped by instance/tooling failure, not by the game.** From 12:10Z the
  WSL→Windows interop died (`UtilAcceptVsock accept4 failed 110`), and from
  ~13:20Z the Windows API also stalled on all DB-backed routes (`/healthz`,
  `/api/*` hang; `/` answers). A Linux-side fallback (same production bundle +
  host proxy) was prepared but is useless while the API is stalled.
- **Admin job status:** D3 clock/settings verified and competitions confirmed
  (the setup half of the brief) **done and evidenced**. The continuous
  run-the-calendar / observe-players / moderate half **could not be exercised**.
- **12 issues** reported: 1 × S2 (Managers screen error), 10 × S3/S4 (admin
  flow, header state loss, "undefinedd", missing time-scale, ambiguous save
  feedback, no moderation tools, empty League column, dead console Home, club
  placeholder), 1 × S1 environment blocker (A01-12).

## Level reached and when

- Admin club "Playtest Admin FC" founded at **11:32Z** (needed to reach the
  app at all — see A01-01). Admin account itself is Level 0 (it is a runner,
  not a player).
- World clock at hand-over: live, Day 466 → 469 during Session 1 (12 real
  min/game day at `GAME_TIME_SCALE=4`, `DayLengthMinutes=48`).

## Wall time to Level 1 / Level 2

- N/A for the admin persona (A01 runs the world; it does not chase XP).

## D3 setup verification (the admin's first job)

- `Game day length (real min)` shown in the UI = **48** (confirmed, A01 setup).
- Effective `GAME_TIME_SCALE=4` is an environment value and is **not shown in
  the admin UI** (A01-04); only day length is editable.
- `XP per win/draw/loss` = 30/15/5; `XP for each Level` blank (= 100×Level²);
  clock **Live**. Competitions exist (12 shown, incl. Amateur Cup running).

## Top 5 frustrations

1. **No admin door.** An `isAdmin` login is forced through the player
   "Found your club" onboarding; the only "Admin console" link is buried in
   Settings → Account. (A01-01)
2. **Admin header loss on deep link** — sidebar/top bar show "No club yet" and
   "Day 1" until you first pass through `/u/settings`. (A01-03/A01-06)
3. **Managers screen throws an Error! fallback** and loses its toolbar and
   column headers. (A01-10)
4. **"undefinedd"** duration on the pyramid pool leagues. (A01-05)
5. **No moderation tools at all** — no users/accounts, reports, or chat/news
   moderation; a club page can only recruit/rate/edit players. (A01-08)

## Top 3 delights

1. The **World & Calendar** page is genuinely powerful and clear: live clock
   with next-tick time, day-length control, transfer-window controls, a
   timeline of every season, and a fast-forward simulator, all in one place.
2. **Competitions** management is complete and readable (create, open, edit,
   archive; per-card format/duration/latest-edition).
3. **Clubs/Players/Managers** tables are fast, searchable and paginated, with a
   consistent view/edit/delete action pair.

## Moments I'd have quit as a real admin

- Right after login: no hint anywhere that an admin console exists, while the
  product made me create a real club in the shared world to get in. I assumed
  the admin UI was missing.
- Opening the console Home and getting a static logo with no dashboard.

## Metrics — actions per admin key task

(§4 lists player tasks; those are N/A to A01. Admin equivalents:)
| Task | Actions (clicks/keystrokes) | Notes |
| --- | --- | --- |
| Sign in as admin | ~4 | credentials + Sign in |
| Reach admin console from login | ~9 | forced founding flow (3 steps, name/code/ground) then Settings→Account→Admin console |
| Verify/set clock | 4 | Settings→Account→Admin console→World & Calendar (day length already 48) |
| Find a club | 2 | Admin console→Clubs, type in search |
| Open/observe a club | 2 | search + eye icon |
| Advance the world one day | 1 | "Advance one day" |
| Check competitions | 2 | Admin console→Competitions |
| Moderate a user | impossible | no such tool (A01-08) |

## Accessibility / consistency notes

- Admin console is a **dark theme** in an otherwise cream/wood game (U7 art
  direction); flagged as a consistency observation, not a fix mandate.
- Club rating control exposes each value three times in the a11y tree
  (static text + button + radio) — noisy for a screen reader (P05 scope).
