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
This is an **environment** blocker, not a game finding. A background watcher retried for **75 minutes**
(45 min + 30 min; `INTEROP_STILL_DOWN`); `cmd.exe` and `powershell.exe` both still fail. A fallback was considered and
rejected: a Linux Chromium build and WSL Node do exist, but the client is bound to Windows
`127.0.0.1:4173` (unreachable from WSL — `curl` → `000`) and the API host is not reachable via the WSL
gateway either, so the harness cannot be run from WSL against this instance. Play stopped here.

**Still pending when the outage hit:** the Stands/Ticket Booth build had just been initiated; its
completion + timer, gate-fee income, the facility step of the Owner program, reaching Level 1/2, playing
a match, the league table, and a second session were not observed.

- [2026-10-08T23:42:04.891Z] RESUME: opened campus after outage; instance + login working.
- [2026-10-08T23:57:47.204Z] 24 probe failed: locator.click: Timeout 30000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /\+V20k/ }).first()[22m [2m - locator resolved to <button data-v-55d33b69="" data-coach="collect" class="bubble collect full" title="The till is full: collect your takings">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 8 × waiting for element to be visible, enabled and stable[22m [2m - element is not stable[22m [2m - retrying click action[22m [2m - waiting 500ms[22m
- [2026-10-09T00:15:09.687Z] Session 3: collected the bobbing till takings and read the Build panel.
- [2026-10-09T00:33:01.804Z] Session 3: started the Ticket Booth (Stands) build; captured the terms dialog.
- [2026-10-09T00:40:27.302Z] Session 3: drove the Stands dialog to "Upgrade to Tier 1" and captured the confirmation.
- [2026-10-09T00:50:10.173Z] Session 3: opened the PLAY dock to find the match options.
- [2026-10-09T00:57:05.718Z] Session 3: hit "Play now" against E2E United; captured the match screen.
- [2026-10-09T01:09:17.872Z] Session 3: collected the till and reopened the Owner program to read XP.
- [2026-10-09T01:15:22.705Z] Session 3: started a "qualifying friendly" from the Owner program.
- [2026-10-09T01:20:42.969Z] Session 3: played a "Play now" friendly and re-checked the Owner program for XP.

---

## Session 3 (resumed) — outage over, build + first match (2026-10-08T23:42Z–2026-10-09T01:20Z, ~98 min wall)

**Mood: 4/5.** The instance came back and my login was intact. This session finally showed the *economy in
motion*: a V300,000 build, gate takings, the Owner-program XP funnel, and a real qualifying friendly against
another playtester's club. The money loop is real — but the feedback around every money/result event is thin.

**What I did**
1. Reached the campus (Day 477). HUD unchanged: **V4.6M · 150 · ★5 · ⚡116**, Level **12/100**, First steps **2/4**.
2. The floating **"+V20k"** turned out to be *"Collect the club shop takings"* — the recurring income loop.
   It **bobs**, so a normal click times out (P03-14); force-clicked it: **V4.3M → V4.4M** on a later collect.
3. **Build panel**: 7 Tier-0 plots, *"0/1 builders busy"*; next costs V200k–V350k (Total ≈V1.92M on a V4.6M
   balance — the "hard choice" is still not a choice). Built **Stands → Ticket Booth** (3,000 capacity,
   **V300,000**, timer **7:24**) — **one click, no confirmation** (P03-13).
4. Facility completed → Owner-program **Facilities** step done; **+18 XP → Program XP 30/54**; First steps **3/4**.
5. **PLAY**: the "Find a Match" screen offered me **E2E United xqchx9** (test club, Power 147) then **Keyboard FC**
   (P05, Power 115). The screen shows "Your power 116 / Team sheet 4-3-3 / Starters 11/11" but **no XP table**
   and no hint which button is *qualifying* (P03-16, P03-17).
6. **Play now** vs Keyboard FC: **won → +30 XP** (30→60), **fans 150→164**, **star 5→6**, then a **"Resting 1:15"**
   cooldown. No match screen, no scoreline, no reward summary — the result is only a HUD delta + a "W" marker (P03-15).
7. Re-opened the **Owner's program**: `Program XP 30/54`, `Budget V4.4M`, `Level 1 progress 30/100`,
   *Win +30 / Draw +10 / Loss +5*, *"No qualifying friendlies played yet"* before the match registered,
   *"Every qualifying friendly pays gate money too"*, and the **Board's advance** recovery path.

**Hesitations**
- The HUD balance (**V4.3M/V4.4M**, 0.1M precision) never shows the V4k–V20k takings I just collected (P03-18).
- After "Play now" I genuinely could not tell whether the match had happened, let alone the score (P03-15).
- The Owner program promises "gate money" from friendlies, but the balance looked unchanged after the win.

**XP/money ledger observed** — Manager step **+9**, Squad step **+3**, Facilities step **+18** (= **30/54**);
qualifying-friendly win **+30**. Balance: 4.8M → (manager V90k + 11×V7.5k) 4.63M → −V300k build → **V4.3M** →
+V takings → **V4.4M**.

**Would I have quit?** No — this session was actually fun once the match loop opened. The would-quit moment is
still the missing match result: a sports manager game that does not show you your own scoreline is disorienting.

---

## Session 4 (planned) — grind qualifying friendlies to Level 1/2

Plan: repeat PLAY → Play now, logging the exact XP delta and cooldown each time, and watch for the Level-1
transition (league join) and the fatigue/"keep the squad fresh" mechanic.
- [2026-10-09T01:47:10.628Z] 33 failed: locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /^PLAY/ }).first()[22m [2m - locator resolved to <button class="playbtn">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not enabled[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is not enabled[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 3 × waiting for element to be visible, enabled and stable[22m [2m - element is not enabled[22m [2m - retrying click action[22m [2m - waiting 500ms[22m [2m - waiting for element to be visible, enabled and stable[22m
- [2026-10-09T02:04:17.786Z] Session 4: single-match diagnostic with 2-min polling.
- [2026-10-09T02:25:03.211Z] Session 4: opened a match, captured the Matchzone and jumped to the Result screen.
- [2026-10-09T02:52:17.193Z] 36 failed: locator.click: Timeout 15000ms exceeded. Call log: [2m - waiting for getByRole('button', { name: /^PLAY/ }).first()[22m [2m - locator resolved to <button class="playbtn">…</button>[22m [2m - attempting click action[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is visible, enabled and stable[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m [2m - <div class="mz-stage"></div> from <div data-v-8eb23cb4="" class="mz mz--overlay">…</div> subtree intercepts pointer events[22m [2m - retrying click action[22m [2m - waiting 20ms[22m [2m 2 × waiting for element to be visible, enabled and stable[22m [2m - element is visible, enabled and stable[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m [2m - <div class="mz-stage"></div> from <div data-v-8eb23cb4="" class="mz mz--overlay">…</div> subtree intercepts pointer events[22m [2m - retrying click action[22m [2m - waiting 100ms[22m [2m 28 × waiting for element to be visible, enabled and stable[22m [2m - element is visible, enabled and stable[22m [2m - scrolling into view if needed[22m [2m - done scrolling[22m [2m - <div class="mz-stage"></div> from <div data-v-8eb23cb4="" class="mz mz--overlay">…</div> subtree intercepts pointer events[22m [2m - retrying click action[22m [2m - waiting 500ms[22m

---

## Session 4 — the match loop, and Level 1 at last (2026-10-09T01:31Z–~03:05Z, ~94 min wall, interrupted)

**Mood: 4/5 → 2/5.** The core sports loop finally opened up: real friendlies against other playtester clubs,
a live Matchzone, gate money and a league place. But the run was cut off by a **second WSL↔Windows interop
outage** at ~03:05Z, the same failure as the first one.

**What I did / learned**
1. **Where XP comes from** (economist's ledger):
   - Owner program steps: Manager **+9**, Squad **+3**, Facilities **+18** → Program XP **30/54**.
   - Qualifying friendly: **Win +30 / Draw +10 / Loss +5** (matches the Owner program table).
2. **The match loop is real and (mostly) good.** PLAY → *Find a Match* (Your power / Team sheet / Starters;
   opponent card with power and a **Even/Challenger/Favoured** tag) → **Play now** opens the **Matchzone**:
   a live 3D match (scoreboard `LED 0-0 KBD`, minute, 1st half, pause / 2× / skip / **Result**), which is a
   genuine delight.
3. **Results are credited asynchronously** (~30 s after Play now), then the PLAY dock shows **"Resting 1:15"**
   (75 s = 300 s design, ×4). The result itself is only inferable from HUD deltas — there is **no post-match
   summary** (P03-15).
4. **"Error fetching match replay"** hit the very first match of the session: a blue full-screen overlay with
   *Try again* / *Back* that **blocks the campus** until dismissed (P03-19, S2).
5. **Reached Level 1.** XP went 60 → 90 → 100 → **Level 1**, and the requirement changed to **0/300**
   (per-level thresholds: 100 then 300). On level-up the **league pool changed 8th/8 → 1st/6**, with no
   explanation (P03-22).
6. **Gate money is real.** Balance rose **V4.3M → V4.4M → V4.5M** across friendlies ("every qualifying
   friendly pays gate money too"); the collect-takings bubble kept offering **+V14k…+V40k**.
7. **Fatigue/injuries accumulate.** After several friendlies the pre-match panel warned **"1 starter(s)
   injured"**, later **2 lineup slots empty**, and my **power fell 116 → 112** — with no persistent injury
   surface or recovery cost (P03-21).
8. **A Goal appeared**: *"Win 3 matches within 6 hours — V40,000 + 60 XP"* (2/3 wins, `3:09:13 left`,
   `Board 0%`). A big money/XP lever, but the timer unit (game vs real hours) and the 0 % board are opaque
   (P03-20).

**Where I stopped:** ~03:05Z, when `cmd.exe /c …` again returned
`WSL … UtilAcceptVsock:271: accept4 failed 110`. Retried 6× over ~3 min, still down; a background watcher
keeps retrying. This is the **environment**, not the game.

**Last known state:** **Level 1**, **XP 10/300**, balance **V4.5M**, fans **226**, star **10**, power **112**
(2 injured starters), rank **1st/6**.

**Would I have quit?** No. The loop is genuinely good. But two things would make a min-maxer stop: the
replay error on a core action (P03-19) and never being able to see my own score (P03-15).
