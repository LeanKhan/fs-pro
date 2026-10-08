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
