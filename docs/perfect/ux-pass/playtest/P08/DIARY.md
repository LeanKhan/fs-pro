# P08 — DIARY (Joins a friend through an invite)

Persona: joins a friend's club world via an invite, 390×844 touch (mobile).
In character: I arrived because a friend (P01) invited me; I expect one link to
drop me into their district/pool and to be able to play against their club.

Clock: instance `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` (12 real min/game day).
First registration: **2026-10-08T23:17Z** (`playtestP08` created). D5 cap: **2026-10-09T07:17Z**.

Mood key: 1 = frustrated/ready to quit, 3 = neutral/plodding, 5 = delighted.

**Invite-path note:** no invite link was passed to me through the lead (the only
allowed out-of-game channel, D6). I therefore fall back to registering a NEW
manager through the UI (`playtestP08`), as my brief directs, and record the
un-exercised invite path as a finding (P08-01). The shared district / pool / PvP
against P01's club is still exercised from inside the world.

---

_(timestamped lines below are appended live by the harness as I decide.)_
- [2026-10-08T23:15:40.248Z] Opened the client at the plain URL (no invite link was ever given to me). Looked for any invite/join-by-link affordance on the landing screen.
- [2026-10-08T23:17:46.114Z] Tapped "New manager". Noting the fields and any invite-code field.
- [2026-10-08T23:19:07.682Z] Filled the join form (no invite-code field exists on it) as playtestP08 and created the account.
- [2026-10-08T23:21:13.212Z] Continued to the club naming step.
- [2026-10-08T23:23:22.252Z] Named club "Invite Rovers" (INV), ground "Invite Park"; advanced to kick-off.
- [2026-10-08T23:26:13.907Z] Founded Invite Rovers; capturing the post-founding confirmation and where I landed.
- [2026-10-08T23:29:11.840Z] Completed the founding wizard in one pass and founded Invite Rovers.
- [2026-10-08T23:32:24.791Z] Entered the ground/campus. Looking for the town page and the invite link the founding card mentioned.
- [2026-10-08T23:34:41.811Z] Tapped "Back to my club" from the post-founding /start wizard.
- [2026-10-08T23:39:02.907Z] Dismissed the welcome modal and recorded the campus HUD, dock and advisor.
- [2026-10-08T23:49:02.980Z] Blocked: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: 'World', exact: true })[22m [2m - locator resolved to <button title="World" class="roundbtn big">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is visible, enabled and stable[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m [2m - <button class="x" aria-label="Close">…</button> from <div data-v-8eb23cb4="" class="modal-root open">…</div> subtree intercepts pointer events[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is visible, enabled and stable[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m [2m - <button class="x" aria-label="Close">…</button> from <div data-v-8eb23cb4="" class="modal-root open">…</div> subtree intercepts pointer events[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 8 × waiting for element to be visible, enabled and stable[22m [2m - element is visible, enabled and stable[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m [2m - <button class="x" aria-label="Close">…</button> from <div data-v-8eb23cb4="" class="modal-root open">…</div> subtree intercepts pointer events[22m [2m - retrying click action[22m [2m - waiting 500ms[22m [2m - waiting for element to be visible, enabled and stable[22m
- [2026-10-08T23:54:28.595Z] Found a blocking modal on campus load; closed it and opened World.
- [2026-10-09T00:08:23.858Z] Opened Bellean (my country) from the World screen.
- [2026-10-09T00:28:11.889Z] Tapped "My club" on the World screen to try to reach my district/town page.
- [2026-10-09T00:35:58.777Z] Searched the World for "Philamentia" to locate my town page.
- [2026-10-09T00:46:51.431Z] Pressed Enter on the place search and zoomed the map in to try to reach district level.
- [2026-10-09T00:56:03.463Z] Opened the League screen to see my pool/division and any friends.
- [2026-10-09T01:02:41.876Z] Opened Settings to look for account, town page and invite-link options.
- [2026-10-09T01:12:42.440Z] Opened the Account panel from Settings.
- [2026-10-09T01:21:34.227Z] Captured the Account screen at 390x844 (full page + viewport): the nav sidebar overlays the account form.
- [2026-10-09T01:31:22.209Z] Measured /u/settings at 390px: document overflows horizontally and the nav rail covers the form; tapping outside did not dismiss it.
- [2026-10-09T01:46:01.238Z] Tapped "Ground" from the World nav to look for a town/district page with an invite link.
- [2026-10-09T01:53:38.173Z] Blocked: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /Owner's program/ })[22m [2m - locator resolved to <button data-v-8eb23cb4="" class="program-chip">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 16 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 500ms[22m [2m - waiting for element to be visible, enabled and stable[22m
- [2026-10-09T02:10:43.636Z] Blocked: locator.click: Timeout 10000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /Owner's program/ })[22m
- [2026-10-09T02:17:15.563Z] Tapped the dock "Manager" button to see whether it leads to hiring a manager.
- [2026-10-09T02:22:06.092Z] Tapped the dock Manager button by coordinate (real tap); captured what it opens.
- [2026-10-09T02:48:40.111Z] Opened the "The brief" tab of the Owner's office.
- [2026-10-09T02:53:59.798Z] Checked the Recruitment and Owner tabs of the Owner's office.

---

## Session 1 — arrive, register, found, first look (23:15Z–00:00Z, mood 4 → 3)

I arrived expecting a friend's invite link. **No invite link was ever given
to me** (the only allowed out-of-game channel, D6, carried none), so I did what
my brief says and registered a fresh manager. Screens: landing → New manager →
`/start` home → crest → kick-off → campus.

- **Sign-up (23:15–23:19Z, mood 4):** `/auth/login` → "New manager" → 5 fields
  → "Create account". Clean, no email gate. But the join screen has **no
  "I have an invite" / invite-code field at all** — for a persona whose entire
  reason for being here is an invite, there is no door for it (P08-01).
- **Found-club (23:19–23:32Z, mood 4):** home step promised **Philamentia
  Central, Bellean · 3/6 clubs**, and the club landed there too (unlike P01's
  mismatched town — good). The post-founding card says **"Bring friends: invite
  links from your town page put them in Philamentia Central with you."** So the
  game promises an invite-link feature.
- **Campus (23:34Z, mood 3):** welcome modal → Vintra → "hire a manager first".
  HUD: Level 0 · 0/100 · V1.6M · Fans 150. The "Owner's program" chip is
  _bouncing_ (Playwright cannot click it; a moving tap target).

## Session 2 — hunting the town page / invite link (00:00Z–01:00Z, mood 2 → 3)

I spent most of this session trying to find the place the founding card told me
to share invite links from. I looked in every obvious surface:

- **World** (`/world`): search a club or place, My club, countries list, "Found
  another club". Searching "Philamentia" showed **no results and no feedback**.
- **My club** panel: club stats + "Visit ground". No district link, no invite.
- **League**: "You're not in a league this year" — no pool yet.
- **Settings** modal: sound, quick-sim, match speed, Manager hub, calendar,
  Account, Sign out. No invite.
- **Account** (`/u/settings`): name/username, password, email, "My clubs",
  "Found another club". **No invite link anywhere.**

I could not reach a "town page" at all, and I found **no place in the entire UI
to create, copy or share an invite link**. For this persona that is the headline
problem. (I also hit the P08-02 responsive break: `/u/settings` renders a 256px
rail over the form at 390px.)

- **00:00–01:00Z mood note:** plodding; the promise on the founding card is not
  matched by any reachable affordance.

## Session 3 — Owner's office / onboarding path (01:00Z–02:54Z, mood 3 → 2)

The game's first instruction is "hire a manager". The dock **Manager** button
(which needed a coordinate tap because it animates) opens **Owner's office**
= Matchday / The brief / Squad / Recruitment / Owner / Analysis — results,
tactics, transfers, finances. Same dead-end P01 hit: no manager list, no "sign"
action. On mobile the tab strip is **clipped** ("Recruitment" shows as "Re…",
"Owner"/"Analysis" are off-screen) so I could not even open those tabs by tap
(candidate P08-03). "The brief" is the tactics/team sheet (squad empty, 10 slots
empty). The **Matchday** tab does have "Book a match — Pick an opponent from
matchmaking" (the PvP hook I was sent to test, "Book (0/2)").

## Environment break — 2026-10-09T02:55Z (not a game issue)

The WSL↔Windows interop layer dropped again mid-step:
`WSL (pid) ERROR: UtilAcceptVsock:271: accept4 failed 110`, and
`/proc/sys/fs/binfmt_misc/WSLInterop` is gone (only `WSLInterop-late` remains).
Every `cmd.exe`/Windows-Node run (the harness) now fails, so no Playwright step
can run and the client on `localhost:4173` is unreachable from WSL. This is the
same host-level outage recorded in `INSTANCE-LOG.md` §7 (12:18Z) and is the
lead's to fix (D8); I cannot restart services. I will retry; meanwhile I am
writing up the evidence already captured. Mood at break: **2**.
