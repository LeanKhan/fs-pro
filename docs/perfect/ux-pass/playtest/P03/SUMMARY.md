# P03 — Summary (Min-maxer economist)

- **Persona:** P03, 1440×900, mouse.
- **Client:** `http://localhost:4173` (production build), shared instance `fspro_playtest`.
- **Club:** Ledger United (LED), owner `EconomistP03`, Sdev Central (Kev).
- **Status:** ⛔ **stopped early — environment blocker** (WSL↔Windows interop failure); not the 8-hour cap. See below.

## Level reached and when

| Milestone | Game time | Wall clock (UTC) | Elapsed from first registration |
| --- | --- | --- | --- |
| Registered | Day 466, Dec 2027 (world) | 11:27:36 | — |
| Founded club (Level 0) | Day 466 | 11:32:47 | ~5 min |
| Campus entered, onboarding done | Day 466 | 11:34:17 | ~6 min 40 s |
| Manager + 11 players signed, Owner program 12/54 | Day 469 | 12:09:45 | ~42 min |
| **Level 1** | — | **not reached** | — |
| **Level 2** | — | **not reached** | — |

**Stop reason:** *environment blocker, not the 8-hour cap.* At 12:18Z the WSL↔Windows interop used to
drive the Windows-only Playwright browser went down (`cmd.exe /c …` →
`UtilAcceptVsock:271: accept4 failed 110`). `cmd.exe` and `powershell.exe` both still fail after a
**75-minute** retry window (45 min + 30 min), so no further browser steps could run. A WSL fallback was checked and is not
usable: the client is bound to Windows `127.0.0.1:4173` (unreachable from WSL; `curl` → `000`) and the
API host is unreachable via the WSL gateway, so the harness cannot be re-hosted on WSL. Files
(`DIARY.md`, `ISSUES.md`, `SUMMARY.md`, `screenshots/`, `traces/`) are complete as of the stop.

## Top 5 frustrations

1. **No number is trustworthy.** The founding preview said **Bank 1.5M**; after founding I had
   **V4.8M** with no explanation, and the Owner's-program hero balance still animates from V3.1M up
   (P03-01, P03-02).
2. **The "hard choice" is fake.** "Funds can't do all three well … That choice is the game." sits above
   V40,000 + V220,000 + V200,000 = **V460,000 of costs on a V4.8M balance** (P03-03).
3. **Unlabelled money-ish counters.** The HUD shows **150, ★5, ⚡116** with no label, unit, tooltip or
   aria name (P03-05).
4. **Signing feedback lies.** After a paid signing the toast confirms and the squad counter still says
   0/11 until a reload (P03-06); right after the manager sign the pool showed "No players match." (P03-09).
5. **Opaque costs.** Interview V25,000 on a V40,000 fee with no explained benefit (P03-12); contract
   length 1–5 years with "Budget after" reflecting only the fee (P03-10).

## Top 3 delights

1. **The Owner's program is a clean economic funnel** — 4 named steps, explicit "from" cost anchors
   (V40k / V220k / V200k) and a visible progress target (0/54), so I always knew what money was for.
2. **The manager market card** puts fee, wage, style and formation side-by-side with Cheapest /
   Best rated / Youngest sorts and an "Affordable only" filter — the fastest team-building screen I saw.
3. **Fast, legible founder flow** — register → name club → campus in under 7 minutes, and the campus
   HUD + Vintra advisor keep the next action obvious.

## Moments I'd have quit as a real player

- The moment the founding **"Bank 1.5M"** preview turned into **V4.8M** — from then on I trusted no figure.
- When the "Minimum matchday squad" counter stayed at **0/11** and **0 goalkeepers** after the GK's
  success toast — I nearly tried to sign him a second time.
- (Would have quit) if the budget had ever actually forced a choice, because the screen that promises
  the choice never shows one.

## Metrics — actions per key task (mouse clicks / typed fields)

| Task | Reached? | Actions | Notes |
| --- | --- | --- | --- |
| Register | ✅ | 7 | New-manager tab (1), 5 fields, Create account (1) |
| Found a club | ✅ | 6 | Next, 3 fields, Next, Found |
| Sign a manager | ✅ | 6 | Owner's program chip (needs force-click), start program, Best rated, Sign, "Sign for V90,000"; ~1 interview screen offered (skipped) |
| Sign a player | ✅ | 1 each | Filters once (ALL + Cheapest); each *Sign* is a **single** click (no terms dialog) |
| Start a build | ⚠ started | 3 | Build, choose Stands→Ticket Booth, confirm (build was in flight when the outage hit) |
| Play a match | ❌ | — | Blocked: squad only completed with the last signing; PLAY not yet used |
| Set a plan | n/a | — | Owner program has no editable plan (steps are fixed) |
| Find the league table | ❌ | — | Not reached before the outage |

## Money facts recorded (for the economist readout)

- Opening balance after founding: **V4.8M** (preview claimed 1.5M).
- Manager: cheapest V40,000 fee · V2,000/yr; best V90,000 fee · V4,500/yr; **Interview V25,000**; signed
  Saikyaivau Daimau (Overall 48–60, HighPress, 433) for V90,000 / 3 yr → budget V4.7M, Program XP 9/54.
- Free agents: **V7,500 fee · V1,125/yr**, **Scout V15,000**; 5,000+ in the pool.
- Facilities (Tier-1 "next" costs): Grass Pitch V250,000 · Ticket Booth V300,000 · Practice Field
  V200,000 · Youth Tent V350,000 · Lookout Post V220,000 · First Aid Tent V260,000 · Staff Hut V300,000.
  Builders **0/1**. Vintra: "A Tier-1 stand pays the gate fee every match."
- Other money loop surfaced: **"Ask the board"** cash advance — "a once-a-year recovery path, not a tap."
- XP: Program target **54**; campus Level 1 target **100**; same earned XP (12) shown against both.
  Observed awards: manager **+9**, next 11 players **+3** total.
