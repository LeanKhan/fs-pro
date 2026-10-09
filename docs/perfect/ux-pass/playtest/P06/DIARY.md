# P06 — DIARY (Low-end phone, slow network, prefers-reduced-motion)

Persona P06: 360×740 touch, CPU 4× throttle, Chrome "Slow 4G" network,
`prefers-reduced-motion: reduce`. Instance: client http://localhost:4173,
API :3010. Clock: `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` (design speed =
this ÷ 4). Mood 1–5 (1 = about to quit, 5 = delighted).

Credentials registered through the UI: **playtestP06 / Playtest-P06-2026!**
(display name "Casey Lowend", email playtestP06@example.com).

---

- [2026-10-08T23:13:44.290Z] Session 1 start. Landing loaded (domcontentloaded 2845 ms on Slow 4G/CPU4x). Read a11y tree to find registration.
- [2026-10-08T23:15:39.030Z] Opened New manager registration form.
- [2026-10-08T23:17:50.507Z] Registered playtestP06 (Casey Lowend). After submit: url=http://localhost:4173/start (4266 ms).
- [2026-10-09T02:45:00.000Z] Session 1 (registration → manager signed → squad signing attempt) ran ~3h30m of wall clock because each throttled interaction took ~5–12 s. Mood 3/5: the game is charming and readable, but P06's phone makes every tap and every campus frame a chore.
- [2026-10-09T02:45:00.000Z] **INSTANCE: WSL↔Windows interop outage (same `UtilAcceptVsock:271: accept4 failed 110` as INSTANCE-LOG §7 12:18Z).** All Windows-Node/Playwright runs fail, so I cannot drive the browser. Not a game finding (U2/instance). Logged here; polling for recovery.
- [2026-10-09T02:58:00.000Z] Interop still down after ~13 min of probes (attempts every 10 s). Pausing play, waiting for the lead's fix; will resume when `cmd.exe` works again.
- [2026-10-08T23:28:43.097Z] Reloaded app while logged in; landed on http://localhost:4173/start.
- [2026-10-08T23:31:58.685Z] World map still showed "Unrolling the map…" after ~9s (0 nodes).
- [2026-10-08T23:32:04.231Z] Founding: clicked "Next: your club" -> http://localhost:4173/start.
- [2026-10-08T23:39:37.586Z] Re-checked founding state: url=http://localhost:4173/start.
- [2026-10-08T23:43:59.099Z] Founded Lowend United (LOW, Lowend Park); after kick-off url=http://localhost:4173/start, kickoff-enabled=true.
- [2026-10-08T23:51:44.854Z] Founded club -> campus in 30323 ms. rAF fps over 3s: {"frames":165,"ms":3008,"fps":54.9}. reduced-motion=true.
- [2026-10-09T00:03:58.903Z] Campus arrival: url=http://localhost:4173/game/d02212ac-caf1-4713-8b60-5807f27dee8c. rAF fps over 4s: {"frames":16,"ms":4219,"fps":3.8,"worstFrameGapMs":306}.
- [2026-10-09T00:20:16.839Z] Campus idle fps 1.7 (worst 899ms, 9 frames >50ms); pan fps 0.8 (worst 2353ms).
- [2026-10-09T00:45:17.668Z] Cleared modals; clean campus idle fps 2.9 (worst 505ms, p95 505ms, >50ms frames 15).
- [2026-10-09T00:54:31.094Z] Reduced-motion=true; running animations=5; resources=44, js transfer=539780B.
- [2026-10-09T01:04:02.059Z] Reduced-motion audit: 5 animations still running with reduce set: bob, bob, bob, pulse-5a34c057, spin.
- [2026-10-09T01:17:28.414Z] Opened Manager screen (11556 ms to render after tap).
- [2026-10-09T01:28:36.229Z] Owner's office tab strip: Recruitment inViewport(before)=false, navScrollable=true; after programmatic scroll inViewport=true.
- [2026-10-09T01:37:37.507Z] Read Owner's office "The brief" and "Squad" tabs to find where to hire a manager.
- [2026-10-09T01:43:34.171Z] Explored top Squad button and First-steps checklist looking for the manager-hiring entry point.
- [2026-10-09T01:50:00.212Z] Followed Vintra advisor and opened Owner's program looking for manager hiring.
- [2026-10-09T02:00:25.755Z] Started the Owner's program and looked for the manager-hiring list.
- [2026-10-09T02:18:22.820Z] Clicked Sign on top manager (JBJousare BatouAge 51Formation 41212Style DirectOverall41–53); click->UI 11599 ms.
- [2026-10-09T02:25:49.755Z] Signed manager Jousare Batou for V40,000, 3-year contract. XP text=PROGRAM XP 9/54.
- [2026-10-09T02:38:01.693Z] Signed GK + free agents; progress {"squad":null,"xp":null,"budget":null}.
