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

## Session 2 — [pending interop recovery] run the world, observe, moderate

- [2026-10-08T11:59:19.469Z] Opened admin Competitions to confirm competitions exist.
- [2026-10-08T12:03:49.421Z] Surveyed admin Clubs screen.
- [2026-10-08T12:07:53.472Z] Surveyed admin Clubs screen.
- [2026-10-08T12:08:03.857Z] Surveyed admin Players and Managers screens.
- [2026-10-08T12:12:34.902Z] Confirmed day length reads 48 and exercised "Save pacing" to see feedback.
- [2026-10-08T12:19:04.268Z] Opened a player club (Keyboard FC) from admin Clubs to look for moderation tools.
