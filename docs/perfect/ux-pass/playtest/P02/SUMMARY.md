# P02 — SUMMARY.md

**Persona:** Football Manager veteran · **Viewport:** 1440×900, mouse
**Instance:** shared playtest stack (`http://localhost:4173` / API `:3010`),
D3 scale `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` — every timer is 4× its
design-scale ("scale-1") equivalent; I give both where relevant.
**Run window:** 2026-10-08 ~11:23–19:20 UTC (≈8 h wall → **hit the D5 cap**).
**Stop reason: shared-instance outage (below), not Level 2.**

## Level reached and when

- **Level 1: not reached.** **Level 2: not reached.** I finished onboarding and
  founded the club (`Veteran Analytics`, VET, Sdev Central, Kev) at ~11:43 UTC,
  then reached **Level 0, 0/100 XP** and had just opened the **Owner's Program**
  (Manager → Squad → Facilities → Level 1, 54 program XP) and the
  **Owner's office → Recruitment** screen when the environment failed.
- Wall time to Level 1 / Level 2: **n/a**.

## Why the run stopped (environment, not game)

Two independent infrastructure failures, both outside my control:

1. **WSL→Windows interop died** at ~12:20 UTC (`accept4 failed 110` on every
   `cmd.exe`/`powershell.exe`). The D7 harness runs Windows Node, so the
   sanctioned browser path was gone for the rest of the window.
2. **The shared API hung** at ~15:15 UTC: `POST /api/users/login` never returns
   (no response in 85 s) and `GET /healthz` = **HTTP 503 `{"ok":false}`**.
   Port 5434 still accepts TCP, so it reads as a hung Node worker/pool rather
   than a dead DB — a lead restart candidate. **All play stopped here.**

I worked around (1) honestly — reusing A01's in-WSL mirror of the *same*
production bundle against the *same* API (UI-only, no shortcuts) — which is how
I got as far as the login screen under (2). I did not use API/DB access to play.

## Top 5 frustrations

1. **The instance is not dependable enough to playtest on.** Two outages in one
   window; the second makes login impossible.
2. **My own onboarding stall: the club-name gate.** "Next: kick-off" stayed
   disabled and the only clue was "That name or code is taken" — which never
   says *which* field. Several retries (P02-01/P02-02).
3. **Numbers that don't reconcile.** Founding said "Bank 1.5M"; the club started
   with V4M (P02-01).
4. **Test/QA data in the live market.** A player named "HTTP PgTest", OVR 0, V0,
   in the day-one transfer list, plus duplicate rows on one page (P02-07/08).
5. **The primary action is hidden.** In the Recruitment drawer the Actions
   column is clipped at 1440 with no visible horizontal scroll (P02-06), and the
   Scouting Department's recommended player is the least legible thing on screen
   (P02-05).

## Top 3 delights

1. **The crest designer** (Club step): 5 shapes × 8 patterns × 8 emblems × three
   independent colour rows with hex inputs, live preview. Genuinely deeper than
   most F2P club games; I lost real time in it.
2. **The Owner's office.** Six tabs (Matchday, The brief, Squad, Recruitment,
   Owner, Analysis) and a real transfer market: rating/age/value/wage columns,
   scouted shortlist, transfer-window clock, season/history offer tabs. This is
   the FM-flavoured depth I came for.
3. **An explicit syllabus.** The 4-step Owner's Program (Manager → Squad →
   Facilities → Level 1) with a program-XP counter makes the first hour legible
   without a wiki.

## Moments I'd have quit as a real player

- **Minute ~15:** couldn't get past the club-name step and couldn't tell why.
- **Minute ~50:** saw "HTTP PgTest" in the market — "this isn't a real product
  yet".
- **~15:15:** couldn't log in at all.

## Metrics — actions per key task

Counts are from the accessibility tree; "actions" = distinct UI interactions
(clicks/field fills) on the golden path, first attempt.

| Task | Actions | Notes |
| --- | --- | --- |
| Register + found a club | ~14 | 2 page loads, 5 field fills, 3 wizard advances, 1 crest tweak, 1 confirm (+ ~5 wasted on the name/code gate) |
| Sign a manager | **not completed** | reached Recruitment; entry is "Interview (V25k) then hire"; blocked before I could sign |
| Sign a player | **not completed** | market visible (5,596 rows) but Actions column clipped and instance died |
| Start a build | **not completed** | — |
| Play a match | **not completed** | Matchday tab shows "Book (0/2)" / "No matches scheduled" |
| Set a plan (tactics/team) | **not completed** | dock exposes Squad / Team Sheet; not opened |
| Find the league table | **not completed** | "League" button present on campus; not opened |

## Issue counts

12 rows in `ISSUES.md`: **S1 ×1** (P02-12, instance/API hang), **S2 ×2**
(test data P02-07, window countdown P02-11), **S3 ×7**, **S4 ×2**. P02-07/08
still want a PNG re-capture once the instance is back (evidence so far is the
aria/trace plus the note in each row); everything else has a PNG.

## For the lead

- The two failures above are not persona findings; they are instance/lead items
  (U3). **The API hang in particular needs a restart + an INSTANCE-LOG entry**,
  and the interop failure needs a `wsl --shutdown`-class fix on the host before
  any Windows-Node playtester can resume.
- **Dedupe note:** A01 already logged both (interop at 12:18Z; API DB-backed
  routes hanging at 13:22–15:05Z, root cause `ECONNRESET` in the API logs, in
  `INSTANCE-LOG.md` §7/§8 and `playtest/A01/ISSUES.md` A01-12). My P02-12 is the
  same instance S1 seen from the player side; triage should merge them.
- I am **not** declaring the game a Level-2 failure: I never got a fair run.
  When the instance is healthy I am ready to resume this persona from
  Level 0 / Owner's Program step 1.
