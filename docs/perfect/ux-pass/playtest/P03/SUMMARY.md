# P03 — Summary (Min-maxer economist)

- **Persona:** P03, 1440×900, mouse.
- **Client:** `http://localhost:4173` (production build), shared instance `fspro_playtest`.
- **Club:** Ledger United (LED), owner `EconomistP03`, Sdev Central (Kev). User id
  `56e2d9cf-05a4-484f-9547-9ee90fd40e46`; login persisted in `state.json` (password, if ever needed:
  `Playtest-P03-2026!`).
- **Outcome:** ✅ **reached Level 1**; **stopped at Level 1, XP 10/300**, when a **second**
  WSL↔Windows interop outage cut the harness (environment, not the game). Not the 8-hour cap.

## Outage status (annotated)

- **Session 1** ended at 12:18Z (2026-10-08) on the first WSL↔Windows interop failure
  (`UtilAcceptVsock:271: accept4 failed 110`); it was fixed by the lead and Pass 1 **resumed at 23:08Z**.
- **Sessions 3–4** ran 23:42Z → ~03:05Z on the resumed instance; Level 1 was reached during this window.
- **At ~03:05Z (2026-10-09)** the *same* interop failure recurred and the harness could not run
  (`cmd.exe /c …` fails). Retried 6× over ~3 min; a background watcher keeps retrying. Work stops here.

## Level reached and when

| Milestone | Game time | Wall clock (UTC) | Elapsed from first registration |
| --- | --- | --- | --- |
| Registered | Day 466, Dec 2027 | 2026-10-08 11:27:36 | — |
| Founded club (Level 0) | Day 466 | 2026-10-08 11:32:47 | ~5 min |
| Campus entered, onboarding done | Day 466 | 2026-10-08 11:34:17 | ~7 min |
| Manager + 11 players, Program XP 12/54 | Day 469 | 2026-10-08 12:09:45 | ~42 min |
| **Level 1** (100 XP) | Day ~490 | **2026-10-09 ~02:15** | **~4 h of actual play** across the outage |
| **Level 2** (400 XP) | — | **not reached** | stopped at **10/300** (second outage) |

Play wall time ≈ **4 h** in real sessions (54 min + resumed 23:42→03:05), with ~11 h of environment outage in
between. XP thresholds are **per level**: Level 1 = 100, then **Level 2 = 300 new XP**.

## Top 5 frustrations

1. **A core action breaks: "Error fetching match replay."** *Play now* opened the Matchzone and showed a blue
   full-screen error (*Try again* / *Back*) that **blocks the campus** until dismissed (P03-19, S2).
2. **My own result is never shown.** No post-match score, W/D/L or reward summary — only HUD deltas and tiny
   `W/D` form badges (P03-15).
3. **The numbers still don't reconcile.** Founding preview **1.5M** vs **V4.8M** actual (P03-01); the "hard
   choice" copy over V460k of costs on millions (P03-03); the *same* XP shown against targets **54 / 100 /
   300** (P03-11); **Board 0%** while 1st/6 and W-W-D-W-W (P03-20); the league pool silently **8 → 6** (P03-22).
4. **Money UI fights the player.** The collect-takings bubble and the Owner-program chip **bob** and cannot be
   clicked normally (P03-14, P03-08); the HUD balance is rounded to **V0.1M**, hiding V4k–V20k takings,
   V7,500 fees and V1,125 wages (P03-18); HUD pills are unlabelled (P03-05).
5. **Opaque costs and steps.** Interview **V25,000** on a V40,000 fee with no explained benefit (P03-12);
   "Budget after" ignores wages (P03-10); a **V300,000** build commits on **one click** with no confirmation
   (P03-13).

## Top 3 delights

1. **The Matchzone.** *Play now* opens a live 3D match — scoreboard `LED 0-0 KBD`, minute, 1st half,
   pause / 2× / skip / **Result** — the emotional payoff the management loop needed.
2. **The Owner's program funnel.** Step cards, `Program XP 30/54`, `Budget V4.4M`, a `Level 1 progress`
   bar, the reward table (*Win +30 / Draw +10 / Loss +5*) and a one-tap **Play a qualifying friendly** CTA.
3. **The money loop actually pays.** Gate takings (`+V14k…+V40k` collect bubble) and qualifying friendlies
   moved the balance **V4.3M → V4.5M**; a **Goal** offered **V40,000 + 60 XP** for 3 wins. Real, readable
   revenue at last.

## Moments I'd have quit as a real player

- The replay-error screen on my first match of the session (P03-19) — an error where the game's reward moment
  should be.
- Never seeing my own scoreline after a match (P03-15) — a sports game that hides your result.
- The "tough budget" copy on millions of walking-around money (P03-03) — I stopped trusting the balance sheet.

## Metrics — actions per key task (mouse clicks / typed fields)

| Task | Reached? | Actions | Notes |
| --- | --- | --- | --- |
| Register | ✅ | 7 | New-manager tab, 5 fields, Create account |
| Found a club | ✅ | 6 | Next, 3 fields, Next, Found |
| Sign a manager | ✅ | 6 | Owner's program chip (needs force-click), start, Best rated, Sign, confirm (~1 interview offered) |
| Sign a player | ✅ | 1 each | Filters once; each *Sign* is a **single** click (no terms dialog) |
| Start a build | ✅ | **1** | Build → plot → **Upgrade to Tier 1** (commits V300,000 with **no** confirmation) |
| Play a match | ✅ | 2 | PLAY → **Play now** (then the Matchzone); result ~30 s later + `Resting 1:15` |
| Set a plan | ⚠ seen | — | A red **"set plan"** chip appeared next to the next fixture (`@ FZ Pregge · 13:07`); not opened before the outage |
| Find the league table | ⚠ seen | — | A **League** button exists; the HUD shows the rank (`8th/8` → `1st/6`) but the table was not opened before the outage |

## Money facts recorded (for the economist readout)

- Opening balance after founding: **V4.8M** (founding preview claimed **1.5M**, no `V`).
- Manager: cheapest V40,000 fee · V2,000/yr; best V90,000 · V4,500/yr; **Interview V25,000**. Signed
  Saikyaivau Daimau for V90,000 / 3 yr.
- Free agents: **V7,500 fee · V1,125/yr**, Scout V15,000; 5,000+ pool; a test entity **"HTTP PgTest" (V0)**
  was pinned first (P03-07).
- Facilities (Tier-0 → Tier-1): Grass Pitch V250,000 · Ticket Booth V300,000 · Practice Field V200,000 ·
  Youth Tent V350,000 · Lookout Post V220,000 · First Aid Tent V260,000 · Staff Hut V300,000 — **≈V1.92M**
  for all seven on a V4.8M balance ("0/1 builders" — one build at a time).
- Built **Stands → Ticket Booth** (3,000 capacity, **V300,000**, timer **7:24**, ≈30 design-min ×4) — one
  click, no confirmation → **+18 XP** (Facilities step).
- **Income observed:** collect-takings bubble **+V4k / +V6k / +V13k / +V14k / +V15k / +V20k / +V29k / +V40k**;
  balancing → **V4.3M → V4.4M → V4.5M** across friendlies ("qualifying friendlies pay gate money").
- **Goal:** *Win 3 matches within 6 hours* → **V40,000 + 60 XP** (2/3 when last seen; `3:09:13 left`; Board 0%).
- **Cost of grinding:** injuries accumulate — **2 starters out**, power **116 → 112** — with no persistent
  injury list or shown recovery cost (P03-21).
- **XP ledger:** Manager +9, Squad +3, Facilities +18 (=30/54); friendly **Win +30 / Draw +10 / Loss +5**;
  per-level thresholds **100** then **300**.

## Files / evidence

- Diary: `DIARY.md` (Sessions 1–4). Issues: `ISSUES.md` (P03-01…-22). Steps: `steps/23-*…37-*`.
- Screenshots: `screenshots/34-t30.png` (Matchzone), `36-m1-after.png` (replay error), `30-owner-program.png`
  (funnel), `36-m1-live.png` (HUD: Board 0%, 1st/6, power 112), `27-after-build.png` (build in flight).
