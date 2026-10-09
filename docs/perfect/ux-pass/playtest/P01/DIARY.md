# P01 — DIARY (First-time casual, never played a manager game)

Persona: first-time casual, 390×844 touch. In character: taps the obvious thing,
doesn't read every tooltip, expects the game to tell me what to do next.

Clock: instance `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` (12 real min/game day).
First registration: **2026-10-08T11:29Z**. D5 cap: **2026-10-08T19:29Z**.

Mood key: 1 = frustrated/ready to quit, 3 = neutral/plodding, 5 = delighted.

---

## Session 1 — onboarding / first 10 minutes (started 11:29Z)

_(timestamped lines below are appended live by the harness as I decide.)_

- What I did: found account `casualsam`, founded "Sdev Central United" (SCU), saw the welcome, the Vintra advisor, the Owner's program and the Owner's office tabs. Placed **Philamentia Central, Bellean** though the home step said **Sdev Central, Kev** (P01-01).
- **Environment break, 2026-10-08T12:29Z:** the WSL↔Windows interop layer dropped (`UtilAcceptVsock: accept4 failed 110`; `/proc/sys/fs/binfmt_misc/WSLInterop` gone, client `localhost:4173` unreachable from WSL). Nothing I can do from inside WSL — forced break. Will retry; this is not a game issue. (Mood at break: 3.)

### Session 1 detail (mood: 4 → then 3)

- **Sign-up (11:29–11:31Z, mood 5):** `/auth/login` → "New manager" → 5 fields → "Create account". Zero jargon, no email gate, no dead ends. Genuinely nice.
- **Found-club flow (11:31–11:40Z, mood 4):** home step promises "Sdev Central, Kev · 2/6 clubs" and "You'll join **Kev's** league pyramid". Crest designer is a delight. "Code" field is unexplained and blocks progress (P01-02). After founding, the card says the club is in **Philamentia Central, Bellean** — a different town *and country* than promised, and now my club name is wrong (P01-01). Mood drops. This is quit-moment #1.
- **Campus (11:50Z, mood 4):** welcome modal + Vintra are clear: "Hire a manager, sign a legal XI, put up a building, then reach Level 1." First steps 0/4. Owner's program explains the budget trade-off well.
- **Trying to hire a manager (12:00–12:15Z, mood 3 → 2):** tapped the only "Manager" button (dock) → "Owner's office" with Matchday / The brief / Squad / Recruitment / Owner / Analysis. Checked every tab with screenshots. No staff/manager list anywhere. The one thing the game said to do first has no visible door. Quit-moment #2 (P01-03).
- Note: Vintra's tip text is rendered twice in the DOM/innerText (one visible, one duplicated) — cosmetic, not filed.

### Forced break and stop (12:29Z onward)

- The WSL interop outage persisted for ~2.5 h (retried ~90 times from 12:29Z to 14:55Z). Host was alive (realtime 3005 = HTTP 200 over the gateway IP); later the API worker 3011 went 503. No Windows executable and no client UI reachable.
- I did not reach Level 1 or Level 2; stopped at Level 0 at ~14:55Z, well inside the 19:29Z cap, because no further play was possible.
- Mood at stop: 2 (wanted to play; environment, not the game, stopped me).

---

## Session 2 — resumed after the outage (started 2026-10-08T23:42Z)

Login persisted (`casualsam` / club `03a9072f…`), so I landed straight on the
campus. Two further brief server restarts interrupted me (~02:00Z and ~02:15Z);
I reconnected each time and did **not** redo onboarding. Mood: 3 → 4.

- **Return loop (23:42Z, mood 3).** The first thing on every return is a forced
  **"While you were away"** modal — this time the whole news is "⚡ Squad rested /
  The players are ready to play." Nothing is tappable until I hit "Let's go!".
  Seen on every reconnect; filed as **P01-04**.
- **Advisor chain (23:51Z, mood 4).** Vintra's tip then reads "Every club needs
  one voice on the training pitch. Spend on a manager first…" with a "Got it"
  button. Clear, single next action — nice.
- **BREAKTHROUGH — the manager door (00:29–01:36Z, mood 2 → 5).** Tapping the
  campus **"First steps 0/4"** chip expands it to reveal a real button:
  **"Sign a manager — Interview, then hire"**. Tapping that (and then
  "Right then — start the program") opens the **manager recruitment list**
  (search, Cheapest/Best rated/Youngest, "Affordable only", ~19–300 candidates,
  each with fee·wage, an "Interview · V25,000" button and "Sign"). I signed one
  (V40,000 fee, V2,000/yr); a **"Negotiate & sign"** modal appears with a warning
  "You haven't interviewed him. The attributes are still a range; signing now is
  a gamble." → **Program XP 0 → 9/54.**
  - The path exists but it is **four nested taps deep** (First-steps chip →
    Sign a manager → program intro → "start the program" → list), while the
    bottom-dock **Manager** button (the obvious entry) opens **"Owner's office"**
    (Matchday / The brief / Squad / Recruitment / Owner / Analysis) which has no
    manager anywhere. In session 1 I never found it; this is the same finding,
    now confirmed with the working path. Updated **P01-03**.
- **Build the squad (01:36–01:52Z, mood 3).** Program step 2: "Eleven bodies and
  a keeper…". Free agents list; signing a free agent is **immediate** (no
  confirm), scouting costs V15,000. I filtered **GK**, signed a keeper, then
  signed outfielders from the first visible card until 11/11. Prog XP 9 → 12/54.
  - Note: the free-agent list contained a leftover test player
    **"DEF HTTP PgTest, Age 29, Rating 0–6, V0"** at the top — filed **P01-05**.
- **Build a Tier 1 (01:52Z, mood 4).** Program step 3 lists facilities with
  cost + build time + a "Recommended" tag; I built the recommended **Training
  Ground V200,000** ("Builders on site — the Tier 1 goes up while you work").
  Builders then show "All builders are busy"; the panel tells me to "Play while
  the builders work". Clear.
- **First match, async PvP (01:59–02:15Z, mood 4 → interrupted).** PLAY opens
  **"Find a Match"**: "Your power 114, Team sheet 4-3-3, Starters 11/11" vs
  **"Keyboard FC Power 115"** (another playtester, P05) with a "Visit grounds"
  link, and **Play now** / **Book**. I tapped **Play now**; the result screen was
  lost to the 02:15Z restart, but my club XP moved to **30/100** (Level 1 needs
  100), so the match registered. First steps now **3/4** — only "Level 1" left.
- **Forced break (02:15Z)** — server restart; reconnected at 02:16Z (s02-19).
  Mood 3.

### Resumed-session state at 02:20Z

- Level 0; club XP **30/100**; First steps **3/4**; Program XP **12/54**;
  budget ≈V4.5M; Day 490.
- Have: a manager, an 11-player squad (1 GK), a Tier-1 Training Ground under
  construction. PLAY ready.

### Session 2 detail — issues opened

- **P01-04 (S3):** forced "While you were away" modal blocks the campus on every
  return, even when the only news is "Squad rested".
- **P01-05 (S3):** a leftover test player "HTTP PgTest (Rating 0–6, V0)" is
  listed as a free agent.
- **P01-06 (S3, accessibility):** the "First steps 0/4" chip — the **primary
  onboarding entry point** — is exposed as plain `text`, not a button/role, in
  the accessibility tree (only after expanding does a real button appear).
- **P01-03 (S2, updated):** hiring the first manager is reachable only via a
  collapsed chip + a program intro screen; the dock "Manager" (Owner's office)
  is a dead end for it.
- [2026-10-08T23:42:25.266Z] Resumed after outage: opened the client; checking where I landed.
- [2026-10-08T23:51:34.576Z] Dismissed the forced "While you were away" modal with "Let's go!" — had to be cleared before anything else was tappable.
- [2026-10-08T23:51:44.159Z] Tapped through Vintra's tip chain with Next; recorded each tip.
- [2026-10-09T00:06:39.427Z] Blocked exploring First steps/program: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /Owner's program/ }).first()[22m [2m - locator resolved to <button data-v-8eb23cb4="" class="program-chip">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 16 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 500ms[22m
- [2026-10-09T00:29:51.214Z] Tapped the "First steps 0/4" chip on the campus to open the onboarding checklist.
- [2026-10-09T00:41:04.260Z] Found the path: campus chip "First steps" expands to a "Sign a manager" button; tapped it to open the manager recruitment flow.
- [2026-10-09T00:47:54.192Z] Tapped "Right then — start the program" in the Owner's program to begin the manager step.
- [2026-10-09T00:57:37.276Z] Clicked the real "Right then — start the program" button (previously my tap hit Vintra's note text).
- [2026-10-09T01:09:15.334Z] Tapped "Sign" on the top-rated manager candidate; checking the confirmation.
- [2026-10-09T01:15:38.696Z] Blocked signing (07b): locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for locator('button').filter({ hasText: /^Sign$/ }).first()[22m
- [2026-10-09T01:20:33.579Z] Clicked the first manager "Sign" button (whitespace-tolerant locator).
- [2026-10-09T01:30:36.253Z] Confirmed "Sign for V40,000" (no interview) — the modal warned the attributes were still a range and I was gambling.
- [2026-10-09T01:36:06.698Z] Signed a goalkeeper first, then outfield free agents, until the matchday squad was filled.
- [2026-10-09T01:41:36.659Z] Signed a goalkeeper and outfielders scoped to the first visible player card.
- [2026-10-09T01:48:38.506Z] Kept signing the first visible free agent until the matchday squad reached 11.
- [2026-10-09T01:52:07.918Z] Tapped "Build Tier 1" on the recommended Training Ground (V200,000) in program step 3.
- [2026-10-09T01:59:18.522Z] Tapped PLAY on the campus dock to find a friendly match.
- [2026-10-09T02:14:43.422Z] Tapped "Play now" against the matched club; waited for the match result.
- [2026-10-09T02:16:33.540Z] Reconnected after another server restart; capturing campus state to resume.
- [2026-10-09T02:44:31.096Z] Played a run of qualifying friendlies, capturing each result and XP.
- [2026-10-09T03:00:37.953Z] Recon2 failed: locator.click: Element is outside of the viewport Call log: [2m - waiting for getByRole('button', { name: 'New headlines' }).first()[22m [2m - locator resolved to <button data-v-55d33b69="" class="bubble alert" title="New headlines">…</button>[22m [2m - attempting click action[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m
