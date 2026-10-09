# P04 — ISSUES (Impatient skipper)

One row per issue, written as it happened (FOR-AGENTS §4). Viewport for every
row: **390×844, touch** (`personaContext('P04')`). Route column is the screen
the player was on. "First seen" = game Level + wall time (UTC).

| ID | Sevr | Category | Screen/route | Viewport | Steps | Expected | Actual | Screenshot | First seen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P04-01 | S2 | flow / functional bug | Onboarding: "Found your club" → "Kick-off" (`/`) | 390x844 touch | Register → map shows "Your home: Sdev Central, Kev" → tap **Next: your club** → fill name/Code → **Next: kick-off** | The club is founded where the game just said "your home", or the flow makes the chosen location explicit | Club is founded in **Philamentia Central, Bellean** (different country/town) with no warning; the two screens disagree | `screenshots/03b-resume.png`, `screenshots/05-kickoff.png` | Level 0 · 11:32Z–11:43Z |
| P04-02 | S3 | feedback / copy | Club creation form (`/`) | 390x844 touch | Tap **Next: your club** → form shows Club name "Sdev Central United" and Ground "Sdev Central Park" (they are *placeholders*) → **Next: kick-off** is disabled | Fields either hold the suggested values, or the disabled Next explains what is missing | Fields *look* filled but are empty; Next is disabled with no reason; tapping it does nothing | `screenshots/04-your-club.png` | Level 0 · 11:34Z |
| P04-03 | S3 | accessibility | Club creation form (`/`) | 390x844 touch | Read the a11y tree of the club form | "Code" and the three colour fields have accessible names | They appear as bare `textbox` nodes with no name (the visible "Code" label is not associated) | `screenshots/04-your-club.png`, `screenshots/04c-club-top.png` | Level 0 · 11:34Z |
| P04-04 | S2 | flow / copy | Campus → bottom-nav **Manager** (`/`) | 390x844 touch | Skip/quiet advisor → first task is "hire a manager" → tap bottom **Manager** → tap **Recruitment** | A route to hire the manager the program asks for | **Manager** opens "Owner's office" (Matchday/Brief/Squad/Recruitment/Owner/Analysis); **Recruitment** is the player Transfer Market (5,596 free agents). No manager hiring found; the skipper who dismissed Vintra has no obvious way back to the task | `screenshots/12-manager-screen.png`, `screenshots/13-recruitment.png` | Level 0 · 11:59Z–12:04Z |
| P04-05 | S3 | flow / feedback | Campus (`/`) | 390x844 touch | Load the campus repeatedly | The "While you were away" digest shows once, or can be disabled | The modal blocks the screen on every load and must be dismissed each time | `screenshots/08-campus-welcome.png` | Level 0 · 11:51Z |
| P04-06 | S3 | visual | Owner's office → Recruitment → Transfer Market (`/`) | 390x844 touch | Open Recruitment | Nothing floats over the list unless hovered | A dark tooltip (a player name) is stuck over the Scouted Shortlist, unrelated to any pointer | `screenshots/13-recruitment.png` | Level 0 · 12:04Z |
| P04-07 | S3 | functional bug / data | Owner's office → Recruitment → Transfer Market (`/`) | 390x844 touch | Open Recruitment, page through free agents | Only real free agents | Leftover test row **"HTTP PgTest"** (DEF, 29, OVR 0, V0/V0) is listed as a free agent | `screenshots/13-recruitment.png` | Level 0 · 12:04Z |
| P04-08 | S4 | accessibility / feedback | Campus (`/`) | 390x844 touch | Try to tap the pulsing **Owner's program** chip | A tappable chip holds still | The chip animates continuously ("element is not stable" to the automation); a normal tap failed once and the a11y snapshot hung. Re-checked S3: a forced tap **did** open the sheet — flaky, not a true block | `screenshots/09-campus-after-welcome.png`, `screenshots/s3-04-after-owners-program.png` | Level 0 · 12:07Z (S1–S3) |
| P04-09 | S3 | flow / copy | Campus / advisor after "Quiet advisor tips" (`/`) | 390x844 touch | Read nothing first time → **Got it** → **Quiet advisor tips** | After silencing help, a way to get the guidance back | Tips are gone; only an unlabelled minimised speech-bubble remains; no "show tips again" affordance found. A skipper who skipped cannot recover the tutorial | `screenshots/error.png`, `screenshots/11-advisor-quiet.png` | Level 0 · 11:52Z |
| P04-10 | S3 | flow / copy | Owner's program → "Build the squad" (`/`) | 390x844 touch | Sign 2 free agents → read the step tracker in the same panel | One consistent squad count | One snapshot says both **"Sign 9 more to open PLAY"** (2 signed) **and** **"0 of 11 players / 0 goalkeepers"**; two different "11"s on one screen with no explanation. The step then completed once 11 were signed | `screenshots/s3-08-squad-built.png`; a11y in `traces/s3-evidence.md`; `traces/trace-*.zip` | Level 0 · 01:22Z (S3) |
| P04-11 | S2 | feedback / juice | Campus → PLAY → **Play now** (`/`) | 390x844 touch | PLAY → vs Ledger United (Even) → **Play now** | A match screen / result, at least a toast or a cooldown timer when blocked | Returns straight to campus with **no score, no result, no XP toast**; repeat taps are silently ignored (75 s real / 300 s design cooldown, no indicator); the Win/Loss only appears later inside the Owner's program ("L Ledger United 0-1", "L P07 Athletic 0-1"). "Did my match happen?" | `screenshots/s3-11-play-now.png`, `screenshots/s3-12-immediately-after.png`, `screenshots/s3-14-after.png`; `traces/s3-16-grind.txt` | Level 0 · 01:42Z–02:39Z (S3) |
| P04-12 | S2 | flow / pacing | **League** sheet (`/`) | 390x844 touch | Reach the Level-1 goal ("Earn the league place") → open **League** | The promised league entry is actionable, or it names when the draw is | *"You're not in a league this year. New clubs join their country's pyramid when the next season is drawn."* No date; the Level-1 carrot leads to a season-long dead end for a skipper. Blocks the D5 Level-2 loop | `screenshots/s3-15-league.png` | Level 0 (40/100) · 03:02Z (S3) |
| P04-13 | S3 | visual / copy | Campus top bar (`/`) | 390x844 touch | Read the header after reaching 40 XP | A clearly labelled Level and XP | XP renders as a tiny unlabelled **"0 40/100"** pinned under the attention bell, next to V4M / 143 / 2 / 112 with no labels; the leading "0" reads like part of the XP | `screenshots/s3-14-before.png`, `screenshots/s3-10-campus.png` | Level 0 · 02:39Z (S3) |

## Not filed as product issues (infrastructure / environment)

- **WSL→Windows interop outage, 12:10Z→** (`UtilAcceptVsock:271: accept4 failed
  110`): blocks the Playwright harness for every Windows-Node persona. Global —
  A01 logged it 12:18Z (INSTANCE-LOG §7, A01-12). Reported to the lead; this is
  an instance blocker, not a game UX defect. Log: `traces/interop-error.log`.
- **Interop outage recurred in session 3, ~03:0xZ 2026-10-09** (same
  `accept4 failed 110` signature; re-probed at ~03:1xZ, still failing). Blocks the
  harness again. Not a game UX defect; per the rules I did not restart services.
  Log: `traces/interop-s3.log`.
- **Client blanked twice mid-session-3** (after an API restart): step-13 rounds 2–3
  produced identical 30,755-byte blank screenshots; recovered after the lead
  restarted services, then interop died. Environment, not a game issue.
- My own harness label-matching quirk (getByLabel substring "Password" hit the
  email field) is **not** a game issue and is not filed.

## Re-check status (session 3, 2026-10-09)

- **P04-04 (manager hire):** re-checked. The route **exists** — Owner's program
  chip → "Right then — start the program" → **Sign a manager** (search + list +
  Sign). The bottom-nav **Manager** still opens Owner's office and is a dead end
  for the task. **Keep open** (S2→S3): reachable, but the nav contradicts the
  task and the chip is the unreliable tap of P04-08.
- **P04-08 (pulsing chip):** re-checked. A forced tap **did** open the program
  sheet; a normal tap failed once and the a11y snapshot hung on the animation.
  **Downgrade to S4**: flaky for automation / slow for a user, not a true block.
- **P04-09 (no way back after quieting the advisor):** partially **mitigated** —
  in session 3 the advisor tips reappeared on reload (with fresh lines, e.g.
  "Safe start: any qualifying friendly pays the same XP on the way up"), and
  "Quiet advisor tips" is offered again. Within the same page after quieting
  there is still no "show tips again". Keep as S3 with this note.
- **P04-01 (home vs founded town):** not re-checked (did not re-found); the
  two-screen mismatch from session 1 stands.
- **P04-07 (HTTP PgTest test row):** still present in the free-agent list with a
  Scout/Sign button (session 3), Rating 0–6. Confirmed.

**Session-3 evidence:** raw a11y excerpts backing P04-10…P04-13 are in
`traces/s3-evidence.md`; the interop recurrence is in `traces/interop-s3.log`.
