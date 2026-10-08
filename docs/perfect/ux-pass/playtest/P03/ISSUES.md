# P03 — Issues (Min-maxer economist)

Persona: P03, viewport **1440×900**, mouse. Instance client `http://localhost:4173`
(production build). Club: **Ledger United (LED)**, owner `EconomistP03`, district
Sdev Central (Kev). Game Level 0 (founder start). All times UTC.

Route shorthand:
- `R-join` = `/auth/join`
- `R-start` = `/start`
- `R-game` = `/game/023d54eb-4d69-4ad6-b870-e594cc915f14`
- `R-op` = `R-game` → Owner's program overlay (opened from the campus "Owner's program" chip)

Screenshots are under `playtest/P03/screenshots/`.

| ID | severity | category | screen/route | viewport | steps | expected | actual | screenshot | first seen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P03-01 | S3 | copy | `R-start` step 3 "Kick-off" → `R-game` campus | 1440×900 | Register → found club → step 3 → read "Bank **1.5M**" → click *Found Ledger United* → read campus HUD | The "Bank" shown before founding matches the balance after founding | Preview says **1.5M**; after founding the HUD and the welcome dialog say **V4.8M** ("the board drew you V4.8M"); no explanation of the change; the preview number also omits the `V` prefix used everywhere else | `05-kickoff-step.png`, `07-campus.png` | Level 0 · 11:32Z |
| P03-02 | S3 | visual / feedback | `R-op` header + hero number | 1440×900 | Open Owner's program; sample the big "the board's opening balance" number at t0 / 1.5 s / 4 s | A balance is a stable value | The number **counts up** (V3.1M → V4.6M → **V4.8M** over ~1.5 s). A still screenshot of the same screen shows V4.1M, then the aria tree 1 s later shows V4.6M, then V4.8M — the displayed balance is wrong/unstable for ~1.5 s after opening | `08b-owner-program.png` (V4.1M), `08c-balance-t0.png`, `08c-balance-t1.png`, `08c-balance-t2.png` | Level 0 · 11:42Z |
| P03-03 | S2 | copy | `R-op` → "Right then — start the program" splash | 1440×900 | Open Owner's program, read the splash copy + the three cost cards while Budget = V4.8M | The stated trade-off is true | Copy says *"Funds can't do all three well. That choice is the game."* but the three "from" costs are **V40,000 + V220,000 + V200,000 = V460,000**, about **10 %** of the V4.8M opening balance. There is no trade-off; the claim contradicts the numbers on the same screen | `08b-owner-program.png`, `09-manager-step.png` | Level 0 · 11:38Z |
| P03-04 | S3 | copy | `R-op` → Manager step criteria bar | 1440×900 | Read the 3-star brief; click *Best rated*; scan the market | The brief is achievable and unambiguous | Brief: *"★★★ wants Overall 60+, a fee under 40 % of your opening balance, and V400,000 left afterwards."* Best-rated market tops out at **Overall 48–60** (ceiling exactly 60; "60+" never shown as a single value). The other two conditions are trivially true for every card (max fee V90,000 ≪ V1.92M = 40 %; budget ≫ V400,000), so only the ambiguous first condition matters | `10-managers-best.png`, `09-manager-step.png` | Level 0 · 11:49Z |
| P03-05 | S3 | accessibility / copy | `R-game` campus HUD (top bar) | 1440×900 | Open campus; hover each HUD pill (cash / people / star / bolt); read the aria tree | Each number has a name/unit or a tooltip | Four unlabelled pills: **V4.6M, 150, ★5, ⚡116**. No visible label, no hover tooltip, no aria name/role. A player (and a screen reader) cannot tell what `150`, `★5` or `⚡116` are | `17-hud-clip.png`, `18-hover-cash.png`, `18-hover-fans150.png`, `18-hover-star5.png`, `18-hover-bolt116.png` | Level 0 · 12:17Z |
| P03-06 | S2 | feedback / functional | `R-op` → Squad step counters | 1440×900 | Sort free agents *Cheapest*, sign the cheapest GK → toast *"Maikabak Yoga joins for V7,500"*; read "Minimum matchday squad" | Counter increments immediately (1/11, 1 goalkeeper) | Counters still read **0/11** and **0 goalkeepers** after the success toast; only a full page reload shows **1/11**, **1 goalkeeper**. A player can believe the signing failed and try again | `13-after-gk.png` (toast + 0/11), `14-squad-after-reload.png` (1/11) | Level 0 · 11:59Z |
| P03-07 | S3 | functional bug / data | `R-op` → Squad step free agents (sort *Cheapest*) | 1440×900 | Open Squad step; sort by Cheapest; read the top of the list | Only real players appear in the market | A leftover test entity sits **first**: **"HTTP PgTest", DEF, Age 29, Rating 0–6, V0 fee, V0/yr**. It is the cheapest listed player and the easiest to sign by mistake | `15-player-terms.png`, `12-after-sign-manager.png` | Level 0 · 11:54Z |
| P03-08 | S3 | feedback / visual | `R-game` campus → "Owner's program" chip | 1440×900 | Try to click the floating "Owner's program" chip | A stable click target | The chip bobs continuously; a normal click **times out** ("element is not stable" after 30 s). Only a force-click opens the program. Motion evidence: two stills at different times show the chip at different offsets | `08-error.png` (failed click state); motion needs two stills — see diary | Level 0 · 11:37Z |
| P03-09 | S3 | feedback / copy | `R-op` → Squad step, immediately after signing the manager | 1440×900 | Sign "Saikyaivau Daimau" → observe the Squad step | The free-agent list shows the pool | List shows **"No players match."** + *"Clear the filter — the pool is deep and cheap bodies are always there."* even though **ALL** + **Cheapest** were selected and 5,000 free agents exist. The generic filter hint is misleading in a loading state | `12-after-sign-manager.png` | Level 0 · 11:54Z |
| P03-10 | S3 | copy | `R-op` → Manager "Negotiate & sign" dialog | 1440×900 | Click *Sign* on a manager; read Signing fee / Wage / Contract / Budget after | The commitment reflects fee **and** wage over the contract | "Budget after **V4.7M**" drops only by the **V90,000 fee**. Wage **V4,500 / year** × the selected 1–5-yr contract is never added to the shown commitment, so the true cost of the contract is hidden | `11-sign-manager-dialog.png` | Level 0 · 11:51Z |
| P03-11 | S3 | copy | `R-op` budget XP vs `R-game` Level XP | 1440×900 | Read "Program XP 12/54" and the campus "12/100" | One consistent XP model | The **same** earned XP is displayed against two different targets (Program **54**, Level 1 **100**) with no explanation; awards are opaque (manager = **+9**, then 11 players = **+3** total) | `08b-owner-program.png` (0/54), `12-after-sign-manager.png` (9/54), `16-squad-verify.png` (12/54) | Level 0 · 11:54Z |
| P03-12 | S3 | copy / visual | `R-op` → Manager market | 1440×900 | Compare cheapest (**V40,000 fee · V2,000/yr**) with best (**V90,000 fee · V4,500/yr**) and *Interview · V25,000* | The value of an interview is clear relative to its cost | Interview costs **V25,000** — **63 %** of a V40,000 fee — and only narrows a range already shown; the benefit (and whether it is refunded/informational) is never explained | `09-manager-step.png`, `10-managers-best.png` | Level 0 · 11:43Z |

## Notes on verification status

- P03-01, -02, -03, -04, -05, -06, -07, -09 are directly evidenced by screenshots.
- P03-08 (moving chip): the failed normal click is in the trace
  `traces/trace-2026-10-08T11-37-11-550Z.zip`; a two-still motion capture was prepared
  (`steps/20-chip-build.mjs`) but could not run before the environment outage (below).
- P03-10: the "Budget after" value was read once; a contract-length sweep to confirm it is invariant was
  prepared but could not run before the outage.
- P03-11: award split (+9 then +3) observed but the exact XP-per-action rule was not documented in-game
  (no tooltip found); reported as an ambiguity.

## Environment outage (not a game issue, does not count toward the pass)

From **12:18Z** the WSL↔Windows interop that runs the Windows-only Playwright harness failed
(`cmd.exe /c …` → `WSL … UtilAcceptVsock:271: accept4 failed 110`), and stayed down through a 45-minute
retry window. No further evidence could be captured. Pending screenshots/verifications above are blocked
by this, not by the game. `DIARY.md` § "Session 2" has the detail.
