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
| P04-08 | S4 | accessibility / feedback | Campus (`/`) | 390x844 touch | Try to tap the pulsing **Owner's program** chip | A tappable chip holds still | The chip animates continuously ("element is not stable" to the automation); it also never opened a readable panel before the harness gave up | `screenshots/09-campus-after-welcome.png` | Level 0 · 12:07Z |
| P04-09 | S3 | flow / copy | Campus / advisor after "Quiet advisor tips" (`/`) | 390x844 touch | Read nothing first time → **Got it** → **Quiet advisor tips** | After silencing help, a way to get the guidance back | Tips are gone; only an unlabelled minimised speech-bubble remains; no "show tips again" affordance found. A skipper who skipped cannot recover the tutorial | `screenshots/error.png`, `screenshots/11-advisor-quiet.png` | Level 0 · 11:52Z |

## Not filed as product issues (infrastructure / environment)

- **WSL→Windows interop outage, 12:10Z→** (`UtilAcceptVsock:271: accept4 failed
  110`): blocks the Playwright harness for every Windows-Node persona. Global —
  A01 logged it 12:18Z (INSTANCE-LOG §7, A01-12). Reported to the lead; this is
  an instance blocker, not a game UX defect. Log: `traces/interop-error.log`.
- My own harness label-matching quirk (getByLabel substring "Password" hit the
  email field) is **not** a game issue and is not filed.

## Re-check status

None of the above could be re-confirmed with a second session after 12:10Z
because the harness was down. P04-01 and P04-04 are the two I most want to
re-check first.
