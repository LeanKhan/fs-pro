# A01 — Admin running the world — DIARY

Persona: A01, "The admin running the world". Viewport 1440x900, mouse.
Instance: client `http://localhost:4173`, API `:3010` (see INSTANCE-LOG.md).
Mood is 1–5 (1 = would quit, 5 = delighted).

---

## Session 1 — first login, world setup look-around (2026-10-08 ~11:24–11:53Z)

**Goal:** log in as admin, find the admin UI, confirm the D3 clock/world
settings, check competitions exist, then start running the calendar.

- [2026-10-08T11:24:54.179Z] A01 recon: opened client, captured landing screenshot + a11y tree.
- [2026-10-08T11:26:20.198Z] Entered admin username + password from INSTANCE-LOG; captured filled form.
- [2026-10-08T11:26:24.471Z] Logged in as admin; landed on http://localhost:4173/start.
- [2026-10-08T11:28:23.988Z] Re-opened /start (still logged in) to walk the founding flow and look for admin access.
- [2026-10-08T11:28:26.419Z] Clicked "Next: your club" on the founding flow.
- [2026-10-08T11:31:34.645Z] Filled the admin club identity (Playtest Admin FC/ADM/Playtest Park).
- [2026-10-08T11:31:36.918Z] Advanced to the kick-off step of founding.
- [2026-10-08T11:32:47.231Z] On the kick-off review step; about to found the admin club.
- [2026-10-08T11:32:53.474Z] Founded the admin club; landed on http://localhost:4173/start.
- [2026-10-08T11:34:17.384Z] No welcome screen; navigating directly (already founded).
- [2026-10-08T11:34:24.581Z] Entered the ground; landed on http://localhost:4173/start.
- [2026-10-08T11:35:41.567Z] Clicked "Back to my club" from the founding screen.
- [2026-10-08T11:35:54.237Z] In the club shell; landed on http://localhost:4173/game/f5fd144a-0904-4cad-8020-f9d9e237f0b8.
- [2026-10-08T11:38:46.982Z] Dismissed welcome, opened Settings to look for admin/world controls.
- [2026-10-08T11:40:25.094Z] Opened Account from Settings to look for admin controls.
- [2026-10-08T11:42:20.598Z] Clicked the visible "Admin console" link.
- [2026-10-08T11:52:07.454Z] Opened World & Calendar in the admin console.

**What I expected:** logging in as an admin takes me to admin tools, or at
least the app shows an obvious "Admin" entry point for an `isAdmin` user.

**What happened:** the admin account has no club, so login forces me through
the *player* "Found your club" onboarding (Home → Club → Kick-off). There is no
admin link anywhere in that flow; the only way out I could see was to found a
club I don't want. Once in the game shell, Settings → Account is the only
place the "Admin console" link exists — it is not in the top bar, not in the
bottom nav, not in the settings list itself. So to act as admin I first had to
create a real club in the shared world. That is exactly the kind of hidden
admin path A01 is supposed to flag.

Once in the console, **World & Calendar** confirms the pacing knob the brief
asks about: "Game day length (real min)" = **48**. The effective
`GAME_TIME_SCALE=4` is not shown anywhere in the UI (only day length is), so an
admin cannot verify the two together. The clock reads **Live**. XP win/draw/loss
= 30/15/5 and "XP for each Level" is blank = 100×Level². Transfer window open.

**Mood: 2/5.** Admin login is a scavenger hunt; I nearly concluded the admin
UI didn't exist. The console itself is functional but styled as a dark
"developer" app, not the cozy cream/wood game.

**Incident (12:10Z):** the required Windows-Node path went down mid-session:
every `cmd.exe` from WSL now returns `UtilAcceptVsock:271: accept4 failed 110`.
That blocks the Playwright harness for me (and looks global). Logged as A01-12
and in INSTANCE-LOG.md §7. I had already completed the D3 setup and the first
survey of every admin screen before the outage, so the evidence above stands.

---

## Session 2 — [outage blocks] (2026-10-08 12:10–15:05Z) — archived

Session 2 could not start during the outage. The WSL→Windows interop was down
(every `cmd.exe`/`powershell.exe` from WSL failed with `UtilAcceptVsock:271:
accept4 failed 110`) and, from ~13:20Z, the API stalled on DB-backed routes
(`/healthz` → `503 {"ok":false}`, a real login hung at "Signing in…" while an
empty-body login returned `400` in ~4 ms; `fs-pro-db-1` itself was healthy). A
Linux-side fallback host (same production bundle + host proxy + Linux Chromium)
rendered the client correctly but could not get through the hung login. Logged
for the lead in `INSTANCE-LOG.md §7/§8`; **A01-12** (S1 environment blocker).
**Mood: 1/5** (blocked by tooling, not by the game).

---

## Session 2 — resumed: world running, observe, moderate (2026-10-08 23:14Z → 2026-10-09 00:52Z)

**Goal:** confirm the live clock/calendar advance, run/advance the world,
observe clubs/players/managers, inspect competitions and their editions, then
attempt the moderation chores a real admin must do (users, reports, chat/news)
and record exactly what is missing.

**Environment.** Interop restored; all four services answered `/healthz` 200
(client 4173; API web 3010; API worker 3011; realtime 3005). Existing login
persisted, so no re-login was needed — I landed straight in the manager office
at `/u`. A service restart interrupted the session at ~00:26Z; I re-checked
health (all 200) and resumed without repeating work.

- **Clock/calendar (confirmed advancing).** On landing the shell read
  **Day 475 – Tue Dec 21 2027, "World running"**. In the manager office sidebar
  the **Admin console** link is now plainly visible (contrast A01-01, where it
  existed only inside Settings → Account); it still does not appear in the
  login/founding flow.
- **Admin console Home** is still a static centered FSPro logo + "Let's go!"
  with no dashboard — A01-02 still reproduces (`41-s2-admin-home.png`).
- **World & Calendar** showed Day 475, Year 8 day 11 of 28, day length 48,
  XP 30/15/5, two transfer windows, and the Live Game Clock. I clicked
  **"Advance one day"**: Day 475 → Day 476, and the page reported
  "Day 475: 0 matches played" (`45-s2-advanced-one-day.png`).
- **The clock is genuinely live.** Watching the panel for 70 s *without*
  reloading showed **no change** ("Now: day 476, hour 7") — the panel is a
  snapshot, and its "Next tick" drifted a minute into the past. Reloading it
  three times over ~70 s showed the hour advance **13 → 15 → 16** and the next
  tick advance **6:27:30 → 6:28:30 → 6:29:00 PM** (`46/47/49`). So a game hour
  is ~30 s and a game day ~12 min, exactly the D3 scale-4 pace, but the page
  never refreshes itself — new finding **A01-13**.
- **Continuous advance over the session.** Day 475/476 at 23:14–23:22Z → **Day
  483 (Wed Dec 29 2027)** by 00:50Z: ~7 game days in ~80 min ≈ 11–12 min/day,
  matching the D3 setting. Scale-1 equivalent: ~48 min/day, ~30 s/hour.
- **Competitions & editions.** 12 competitions listed (cups, tournaments,
  national leagues, two pyramid pool leagues). Opening **Amateur Cup** showed
  the editions list (#4 Day 478 registration; #3 Day 457–470 finished; #2 and
  #1 finished), the current edition's registration window 473–478, its 16
  registered clubs with fee-paid states, an "Invite clubs" combobox, "Cancel
  edition" and "New edition" (`50/51/52`). The **"Pools · undefinedd"** label
  on the two pyramid leagues (A01-05) still reproduces.
- **Clubs / Players / Managers.**
  - Players: full table with headers, search, pagination, view/edit actions —
    fine (`54-s2-players.png`).
  - Clubs: headers Name/Address/Manager/Stadium/**League**/Players/Actions, but
    **League is empty for every row** (A01-11 still reproduces); the admin's own
    club detail has no owner/account info, no moderation, and the empty teal
    banner placeholder remains (A01-08/A01-09). It shows "No Manager :/" and
    "No Players fetched" (`56/57/58`).
  - Managers: **still renders the "Error!" panel with a "GO BACK" button**, and
    the table below has **no column headers at all** — the third column is a raw
    boolean `false` and the row actions are unlabelled (A01-10 still reproduces;
    the missing headers are new, **A01-14**) (`53-s2-managers.png`).
- **Moderation sweep — what is missing.** The console sidebar is exactly:
  **Home, Clubs, World & Calendar, Players, Competitions, Managers**. There is
  **no Users, Reports, Chat or News section**; the top-right account menu has
  only **Settings** and **Log out**; and the only audience/presence data is the
  admin's own **"Live connection · 1 online"** on the Account page. I could not
  find any way to list accounts, see who owns a club, suspend/ban a player, or
  moderate chat/news. The only user-adjacent control is **"Assign clubs
  (admin)"**, buried at the bottom of the *player* Account page (Settings →
  Account), not in the console. Its "Add Clubs" dialog lists all 61 clubs
  (including real player clubs like Completionist FC, Lowend United, Keyboard
  FC, E2E United), has columns Code/Name/Address/Manager/Stadium/**League**
  (empty)/Players, and reveals an **"ADD (10)"** confirm once rows are ticked —
  but there is **no user selector**, so it only adds clubs to the admin's own
  account and cannot reassign a club to another user. New findings **A01-15**
  (S2, no moderation surface) and **A01-16** (S3, assignment tool buried + no
  owner/user view).
- **Year Calendar** (console → "Open Year Calendar", routes to `/u/calendar`) is
  a delight: Year 8 day 19 of 28, Day 483 "TODAY", month grid with every
  fixture per day and transfer-window markers, view toggles, "Sim to Date", and
  a live tally **3604 matches / 3497 played / 107 remaining**. Evidence that the
  world is actively playing fixtures (`65-s2-year-calendar.png`).
- **Service restart (00:26Z).** The instance restarted mid-session (I was in the
  Assign-clubs dialog). All four `/healthz` came back 200; the admin session and
  the world state (Day and header) survived. I resumed at 00:41Z without redoing
  completed steps. This is instance maintenance, not a game finding.

**What I expected:** an admin can run the world (clock, calendar, competitions)
and can also govern the *players* in it — find accounts, act on reports, and
moderate chat/news.

**What happened:** the world-running half is genuinely good (live clock,
advance/simulate, rich Year Calendar, complete competition/edition management),
but the **governance half is essentially absent** — there is no user, report or
content moderation anywhere a person would look, and the one assignment tool is
buried in a player settings page with no owner context.

**Mood: 3/5.** Running the world feels powerful and the Year Calendar is a real
highlight; but an "admin running the world" who cannot even see the people in
it, or whom a club belongs to, is missing half the job.

**Session-1 issues still reproducing in Session 2:** A01-02, A01-03/A01-06
(header shows "No club yet"/"Day 1" on direct deep-load), A01-05 ("undefinedd"),
A01-08/A01-09 (club detail), A01-10 (Managers Error!), A01-11 (empty League
column). A01-12 (interop/API) is **resolved** by the lead.

### Raw harness decision log (auto-appended)


- [2026-10-08T11:59:19.469Z] Opened admin Competitions to confirm competitions exist.
- [2026-10-08T12:03:49.421Z] Surveyed admin Clubs screen.
- [2026-10-08T12:07:53.472Z] Surveyed admin Clubs screen.
- [2026-10-08T12:08:03.857Z] Surveyed admin Players and Managers screens.
- [2026-10-08T12:12:34.902Z] Confirmed day length reads 48 and exercised "Save pacing" to see feedback.
- [2026-10-08T12:19:04.268Z] Opened a player club (Keyboard FC) from admin Clubs to look for moderation tools.
- [2026-10-08T23:15:57.478Z] Session 2 recon: opened client at http://localhost:4173/u.
- [2026-10-08T23:18:31.486Z] Session 2: admin console home + World & Calendar read; clock shows Day 475 - Tue Dec 21 2027.
- [2026-10-08T23:20:47.420Z] Session 2: admin clock read (Day 475 - Tue Dec 21 2027) then clicked "Advance one day" -> Day 476 - Wed Dec 22 2027.
- [2026-10-08T23:25:32.115Z] Session 2: watched the live clock for 70s. Now: day 476, hour 7 (cup day). => Now: day 476, hour 7 (cup day)..
- [2026-10-08T23:28:51.808Z] Session 2: re-read the clock across 3 reloads over ~70s to test if the world advances.
- [2026-10-08T23:32:57.448Z] Session 2: opened admin Competitions and drilled into the first competition to inspect editions.
- [2026-10-08T23:36:01.457Z] Session 2: opened competition detail http://localhost:4173/a/competitions/24a1c042-3eff-4d97-8f30-2a626a4b7cf7/AMATEUR-CUP to inspect editions.
- [2026-10-08T23:41:09.940Z] Session 2: re-checked Managers/Players, opened a player detail; noted moderation affordances.
- [2026-10-08T23:50:36.192Z] Session 2: inspected admin Clubs list columns and a club detail, looking for owner/moderation controls.
- [2026-10-09T00:05:16.092Z] Session 2: swept admin Home, the account menu and Settings for user/report/chat/news moderation entries.
- [2026-10-09T00:13:42.343Z] Session 2: opened the "Assign clubs (admin)" control from Settings > Account.
- [2026-10-09T00:41:19.879Z] Session 2: checked a club in the Assign clubs dialog to see if a confirm action appears (did not assign).
- [2026-10-09T00:50:30.937Z] Session 2: opened the admin Year Calendar (http://localhost:4173/u/calendar).
