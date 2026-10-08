# P01 — SUMMARY (First-time casual, never played a manager game)

**Status: STOPPED EARLY — environment outage, then wall-clock/agent budget exhausted.**
Not Level 2. The stop was forced by a **host-level WSL↔Windows interop failure at
2026-10-08T12:29Z** that made the client and the Playwright runner unreachable; I
could not continue playtesting (details in `DIARY.md` and §"Blocker" below).

## Level and times (all UTC)

| Milestone | Time | Wall time from first registration |
|---|---|---|
| Registration form opened | 11:29Z | (t0) |
| Account created (`casualsam`) | ~11:30Z | ~1 min |
| Club founded ("Sdev Central United", SCU) | 11:40Z | ~11 min |
| First view of campus / First steps | ~11:50Z | ~21 min |
| Owner's program started | ~12:05Z | ~36 min |
| **Outage began** | **12:29Z** | **~1 h 00 min** |
| **Level reached** | **Level 0** | — |
| Time to Level 1 | **not reached** (blocked at Level 0) | — |
| Time to Level 2 | **not reached** | — |

D5 cap was 19:29Z; I stopped at ~14:55Z because the host stayed down for ~2.5 h and
no further play was possible.

## Blocker (environment, not a game defect)

- From 12:29Z: `cmd.exe` / any Windows executable failed with
  `WSL (pid) ERROR: UtilAcceptVsock:271: accept4 failed 110`.
- `/proc/sys/fs/binfmt_misc/WSLInterop` was gone (only `WSLInterop-late` left);
  `localhost:4173` and `localhost:3010` unreachable from WSL.
- Windows host was still alive (via the WSL gateway IP `172.22.48.1`:
  3005 realtime = 200, 3011 API-worker = 200 then 503), so this is the WSL
  interop service / vsock, not a dead machine. Not repairable from inside WSL
  (no root; re-registering binfmt and repointing `WSL_INTEROP` both failed).
- Needs a Windows-side `wsl --shutdown` (or restart of the WSL interop service)
  by the lead/owner. Until then **every** playtester and the whole stack are
  unreachable, not just P01.

## First-10-minutes funnel (P01)

Reached campus: yes. Understood the single next action ("hire a manager"): yes
(advisor is clear). Actually **found** where to hire a manager: **no** (see
P01-03). Reached Level 1/2: no.

## Top 5 frustrations (in order felt)

1. **I was promised Sdev Central (Kev) and got dropped in Philamentia Central
   (Bellean)** — after I named my club after the promised town (P01-01). I'd
   have to rename the club I just made or live with a wrong name.
2. **I could not find how to hire a manager** — the only "Manager" button opens
   "Owner's office" (matchday/tactics/transfers/finances). The game told me to
   do this first and then hid it (P01-03).
3. **"Code" on the club form gave no hint** and blocked "Next" until filled
   (P01-02) — every field on the join form had a helper, this one didn't.
4. **The bottom dock and the advisor use different words for the same thing**:
   advisor says "manager", dock says "Manager", the panel that opens says
   "Owner's office", the program step says "The voice on the training pitch".
5. **Forced break on return**: a "While you were away" modal blocks the campus
   every session, even when the only news is "Squad rested", and must be
   dismissed before anything is tappable.

## Top 3 delights

1. **The art and onboarding look**: the flat, sunny, cream/wood UI and the
   crest designer are genuinely inviting; register → found took under 2 minutes
   with no jargon and no dead ends.
2. **Vintra, the club secretary**: one plain-English line at a time, one clear
   next action, always present but dismissible ("Quiet advisor tips"). Exactly
   the right register for a first-timer.
3. **The Owner's program screen**: it also states the trade-off openly
   ("A manager from V40,000 / Eleven players from V220,000 / One Tier-1 building
   from V200,000 — funds can't do all three well. That choice is the game.").
   That single line made the game feel like it had real decisions.

## Moments I'd have quit as a real player

- **Moment 1 (11:40Z):** the town I was promised changed under me after founding.
  A real casual would wonder if they'd done something wrong; many would restart
  the whole sign-up. (I didn't restart — U3 forbids it — and logged P01-01.)
- **Moment 2 (~12:10Z):** five minutes after being told "hire a manager first" I
  still had no way to hire one. This is the most likely first-session quit.

## Actions per key task (§4 metric)

Actions = distinct taps/field entries by the player.

| Task | Done? | Actions | Notes |
|---|---|---|---|
| Register + found a club | Yes | **9** | login→New manager; 5 fields; Create; Next: your club; name+code; Next: kick-off; Found |
| Open the campus | Yes | 2 | dismiss welcome ("Let's go!"), dismiss/return |
| **Sign a manager** | **No** | **7 attempted, 0 succeeded** | dock Manager → office; visited all 6 tabs; never found a manager list (P01-03) |
| Sign a player | No | — | blocked before this |
| Start a build | No | — | blocked before this |
| Play a match | No | — | blocked before this |
| Set a plan | No | — | blocked before this |
| Find the league table | No | — | blocked before this |

## Evidence

- Screenshots: `screenshots/s01-01…s01-19*.png` (all 390×844).
- Traces: `traces/*.zip` (started, but later sessions could not run after the
  outage).
- Findings rows: `ISSUES.md` (P01-01 S2, P01-03 S2, P01-02 S3).

## What I'd want the lead to do

1. Restore the WSL interop / restart the stack on the host, and log it in
   `INSTANCE-LOG.md`. P01 is stopped only by this.
2. Re-run P01 (or a fresh first-timer) to finish the first 10 minutes once the
   instance is reachable — the manager-signing path (P01-03) is the highest-value
   thing to confirm.
3. Consider the persona's funnel value: P01 reached the campus in ~21 min with a
   clean sign-up but could not progress past the first program step.
