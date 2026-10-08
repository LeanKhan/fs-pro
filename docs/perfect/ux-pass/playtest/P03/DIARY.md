- [2026-10-08T11:24:52.819Z] Opened http://localhost:4173; landing screenshot 01-landing.
- [2026-10-08T11:26:16.295Z] Clicked New manager tab -> registration screen.
- [2026-10-08T11:27:36.672Z] Submitted registration as EconomistP03 -> landed on http://localhost:4173/start.
- [2026-10-08T11:29:28.207Z] Advanced to the Club step of founding.
- [2026-10-08T11:30:43.455Z] Named club Ledger United (LED), ground Balance Park; advanced.
- [2026-10-08T11:32:47.046Z] Founded Ledger United; landed on http://localhost:4173/start.
- [2026-10-08T11:34:17.427Z] Entered campus at http://localhost:4173/game/023d54eb-4d69-4ad6-b870-e594cc915f14.
- [2026-10-08T11:37:11.175Z] Blocked opening owner program: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /Owner's program/ })[22m [2m - locator resolved to <button data-v-8eb23cb4="" class="program-chip">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 12 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 500ms[22m [2m - waiting for element to be visible, enabled and stable[22m
- [2026-10-08T11:38:43.903Z] Owner's program chip would not stabilise for a normal click (force-clicked); screenshot 08b.
- [2026-10-08T11:42:01.290Z] Sampled the Owner-program opening balance at t0/1.5s/4s to test stability.
- [2026-10-08T11:43:49.992Z] Started the Owner program; now on the Manager step.
- [2026-10-08T11:49:11.788Z] Sorted manager market by Best rated; captured top of the list.
- [2026-10-08T11:51:45.998Z] Opened Sign on the top best-rated manager.
- [2026-10-08T11:54:50.950Z] Signed Saikyaivau Daimau for V90,000 (3-yr).
- [2026-10-08T11:59:05.863Z] Signed cheapest GK from the free-agent list.
- [2026-10-08T12:03:22.018Z] Reloaded and re-checked squad counters after signing GK.
- [2026-10-08T12:06:40.980Z] Signed 10 cheapest outfield free agents to complete the 11.
- [2026-10-08T12:09:45.283Z] Verified squad counters and opened the Squad dock.
- [2026-10-08T12:12:42.192Z] Captured campus HUD clip and opened the Build panel.
- [2026-10-08T12:17:15.385Z] Probed HUD pills for tooltips (fans/star/bolt/cash).

---

## Session 1 — onboarding + founder economy (11:24Z–12:18Z, ~54 min wall)

**Mood: 3/5.** Clean onboarding, but the economy does not survive an
economist's glance: the numbers on the founding screens, the HUD and the
Owner's program do not agree, and the "hard choice" the program sells does not
exist at the money it gives you.

**What I did**
1. Landing → New manager → registered `EconomistP03` (`p03.economist@fspro.playtest`).
2. Found club: Home = Sdev Central (Kev), Club = **Ledger United / LED / Balance Park**, Kick-off.
   - Before founding the preview read **Bank 1.5M / Squad 16 / Level 0 / Fans 150**.
   - After founding I had **V4.8M** and a "board drew you V4.8M" welcome. (P03-01)
3. Owner's program: budget V4.8M, 4 steps (Manager, Squad, Facilities, Level 1), Program XP 0/54.
   - The big "opening balance" hero number animates (V3.1M→V4.8M). (P03-02)
   - Splash says "Funds can't do all three well" against V40k+V220k+V200k = V460k on a V4.8M balance. (P03-03)
4. Manager: brief "Overall 60+ / fee <40% / V400k left"; sorted Cheapest then Best rated.
   - Cheapest V40,000 fee · V2,000/yr; best V90,000 fee · V4,500/yr; Interview V25,000. (P03-04, -12)
   - Signed **Saikyaivau Daimau** (Overall 48–60, 3-yr) for V90,000 → Program XP 9/54, budget V4.7M. (P03-10)
5. Squad: signed the cheapest GK + 10 cheapest outfield free agents (V7,500 fee · V1,125/yr each).
   - A test entity **"HTTP PgTest" (Rating 0–6, V0)** is pinned first in the Cheapest sort. (P03-07)
   - The "Minimum matchday squad" counter stayed 0/11 after the GK success toast until a reload. (P03-06)
   - After the manager sign the list briefly showed "No players match." with "Clear the filter…". (P03-09)
6. Campus HUD: **V4.6M · 150 · ★5 · ⚡116** — all unlabelled, no tooltips. (P03-05)
7. Build panel read: Stands→Ticket Booth V300,000; Stadium→Grass Pitch V250,000; Training→Practice
   Field V200,000; Youth→Youth Tent V350,000; Scouting→Lookout Post V220,000; Medical→First Aid Tent
   V260,000; Staff→Staff Hut V300,000. Builders 0/1. Vintra now pushes a Tier-1 stand ("pays the gate
   fee every match") — i.e. the money loop the program never explains up front.

**Hesitations**
- The founding preview bank (1.5M) vs the real bank (V4.8M) made me distrust every figure afterwards.
- The "Overall 60+" brief with a market that tops out at 48–60 made the star rating feel arbitrary.
- Interview cost (V25,000) vs a V40,000 fee: I could not work out the expected value, so I skipped it.
- The floating "Owner's program" chip would not accept a normal click (it moves). Had to force-click.

**Would I have quit?** Probably not at Level 0 (the loop is quick), but the mismatch between the
"tough budget" copy and V4.8M of walking-around money would make me stop trusting the balance sheet.

## Session 2 — blocked by an environment outage (12:18Z–…)

**Mood: 2/5.** I started the Stands build step, then the WSL↔Windows interop used to drive the
Windows-only Playwright browser died: `cmd.exe /c …` fails with
`WSL … UtilAcceptVsock:271: accept4 failed 110` (host unreachable), so no further browser steps can run.
This is an **environment** blocker, not a game finding. Waiting/retrying (a background watcher is
polling); the Stands build, the facility completion, gate-fee income, level-up and any second session
are still pending.

