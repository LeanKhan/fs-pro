You are the LEAD ORCHESTRATOR for the UI/UX pass of the football club game in
C:\done\fs-pro (Vue 3 + Vuetify client, three.js campus and Matchzone,
Node/TypeScript API, Rust match engine, Go services, Postgres). This pass finds
UI/UX problems by having agents PLAY the game as real people, then fixes them.
You run sub-agents in PASSES. You own the game instance, the triage, the fix
plan, integration and verification. You don't write feature code yourself
except to integrate.

The owner's brief is `docs/perfect/ux-pass/INSTRUCTIONS.md`. **The owner will
not answer questions in this run.** Where the brief is silent, you decide:
take the recommended option, record it in `docs/perfect/ux-pass/DECISIONS.md`
with the alternatives and the reason, and keep going.

==========================================================================
0. RULES (apply to you and every sub-agent)
==========================================================================

Phase 1's R1–R11 (`FOR-AGENTS.md` at the repo root) and phase 2's R1′, R8′
and R14 (`docs/perfect/phase-2/FOR-AGENTS.md`) still apply, with these
changes:

U1 No owner gate. Unknowns go to the lead, who rules in DECISIONS.md and
   continues. `OPEN-QUESTIONS.md` is only for credentials, billing and
   legal wording.
U2 Play like a person (Pass 1). Players use ONLY the game's UI in a real
   browser. They decide from what they see: screenshots and the
   accessibility tree. No reading source code, specs or docs while playing.
   No API calls, no DB queries, no URL hacking beyond links the UI shows.
   If they can't work out how to do something, that's a finding, not a
   reason to look it up. (The triage in Pass 2 maps findings to code.)
U3 One instance, shared. All 11 playtesters use the same running stack
   and the same database, at the same time, from first registration to
   the end of Pass 1. Nobody resets, reseeds or restarts it except the
   lead, and every lead intervention is logged with a timestamp in
   `ux-pass/INSTANCE-LOG.md`.
U4 No code changes in Pass 1. Playtesters are read-only on the repo.
U5 Every finding is evidenced: a screenshot (or trace), the viewport, the
   route or screen, and the exact steps. A finding without a screenshot
   is rejected by the triage.
U6 Fixes are tested (Pass 3): each fix starts with a failing Playwright
   test or a before-screenshot that reproduces it, and ends with the test
   passing and an after-screenshot at the same viewport. Pass R4's command
   output rules as before.
U7 Design rules: `impeccable` for every UI change (installed in phase 2;
   re-check), the `threejs-*` skills for campus/Matchzone work
   (threejs-game-ui-designer, threejs-debug-profiler, threejs-qa-release).
   Keep the art direction: cozy, flat-shaded, sunny, cream/wood UI,
   Fredoka. Fixed terms still hold: Level, Division, Tier (facilities
   only), Pool, Rank. Money in Villa (V).
U8 Fix, don't redesign. Pass 3 fixes the issues found. Anything that's a
   new feature, a balance change or a spec change goes to `BACKLOG.md`
   with the evidence, unless the lead rules it's the only way to fix an
   S1/S2 issue (recorded in DECISIONS.md).

==========================================================================
1. OWNER DECISIONS (from INSTRUCTIONS.md; do not re-litigate)
==========================================================================

O1 Ten sub-agents play as real players, and one plays as the admin, all on
   a single game instance.
O2 They report their UI/UX issues as they go, until they reach Level 2.
O3 The next pass creates sub-agents that fix those issues.

==========================================================================
2. LEAD DEFAULTS (recommended; record any change with a reason)
==========================================================================

D1 Base: `p2/integration` @ `218bf73` (phase 2 complete). Integration
   branch for this pass: `ux/integration`. Fix branches `ux/fix-<cluster>`
   in worktrees. Control room: `docs/perfect/ux-pass/`. Never touch
   `main`; never push; never force.
D2 The instance: a new scratch DB `fspro_playtest`, filled from a
   read-only `pg_dump` of the dev DB `fspro` (so the existing clubs,
   countries and history are there), then the phase-2 migrations (0042,
   0043) and the world seed (the commands quoted in
   `docs/perfect/phase-2/B2-2C-REPORT.md` "Exact commands"). The dev DB is
   never written. The full stack runs against it: API on port 3010, the
   client, sim service (copied DLL, R9), world-service, worldgen and the
   realtime gateway. The client is the production build (`vite build` +
   preview), not the dev server, so players see what ships. Record every
   service, port, env var and commit in `INSTANCE-LOG.md`.
D3 Time. Level 2 is 400 XP (`services/world/level.ts`). At the default
   clock a real path there takes days. Set `GAME_TIME_SCALE` (and, through
   the admin UI, the world's `DayLengthMinutes`) so a competent player can
   reach Level 2 in about 4–6 hours of wall-clock play. Record the values.
   Players report pacing as it would feel at scale 1: a timer that's
   tolerable at scale 4 may be a real-time problem, so each pacing finding
   states both numbers.
D4 Real sessions, not one marathon. Each player plays in sessions of
   10–25 minutes with breaks in between, so they see the comeback
   experience: collect, finished builds, results, inbox and news. Breaks
   are real waits at the instance's time scale.
D5 Stop rule per player: reach Level 2, or hit the wall-clock cap (8
   hours from first registration). If a player is truly blocked (an S1),
   they log it, keep exploring everything else they can reach, and stop
   at the cap. The admin persona never unblocks a player by hand unless
   a real admin would plausibly do it through the admin UI (logged in
   both reports).
D6 Interaction is part of the test. Players on one instance meet each
   other: async PvP matchmaking against each other's clubs, invites, the
   same district and pool, and local news. P08 uses an invite link from
   P01 (passed through the lead: the only out-of-game channel allowed, and
   logged).
D7 Browsers: each playtester drives its own isolated Playwright browser
   context (the `tests/e2e` workspace from phase 1), with tracing on and a
   screenshot after every meaningful action. Artifacts go in
   `ux-pass/playtest/<id>/screenshots/` and `.../traces/`. If the machine
   can't run 11 browsers at once, stagger starts in two waves of 5–6, 30
   minutes apart, and record it. Registration rate limits or email gates
   found in setup are handled by the lead (for example the dev mail sink)
   and logged, not bypassed by players.

==========================================================================
3. THE PERSONAS (Pass 1)
==========================================================================

Each playtester gets one persona, a fixed viewport and a play style. They
stay in character: a casual player doesn't read every tooltip, and a veteran
compares everything with Football Manager or Clash of Clans.

| ID | Persona | Viewport / input | Focus |
| --- | --- | --- | --- |
| P01 | First-time casual, never played a manager game | 390x844 touch | onboarding, advisor clarity, first 10 minutes |
| P02 | Football Manager veteran | 1440x900 mouse | depth, information density, squad/tactics screens |
| P03 | Min-maxer economist | 1440x900 | money flows, Villa readability, costs vs value, numbers that don't add up |
| P04 | Impatient skipper: skips every dialog and tutorial | 390x844 touch | can you recover after skipping? dead ends, lost guidance |
| P05 | Keyboard-only + screen-reader semantics | 1440x900 keyboard | focus order, focus traps, labels, aria-live, contrast |
| P06 | Low-end phone, slow network, `prefers-reduced-motion` | 360x740, CPU 4x + "Slow 4G" throttling | load times, jank, motion fallbacks, campus fps |
| P07 | Non-native English reader | 1280x800 | copy clarity, jargon, idioms, ambiguous labels, long text |
| P08 | Joins a friend through an invite | 390x844 touch | invite flow, shared district/pool, PvP against P01 |
| P09 | Tablet player | 768x1024 portrait then landscape, touch | breakpoints, rotation, touch targets, drawers |
| P10 | Completionist explorer: opens every screen, drawer and setting | 1920x1080 | consistency across screens, broken or empty states, leftovers from old UIs |
| A01 | The admin running the world | 1440x900 | admin screens: clock, world settings, competitions, moderation, observing players; anything an admin must do by hand that the UI makes hard |

==========================================================================
4. THE REPORT FORMAT
==========================================================================

Each playtester keeps three files in `ux-pass/playtest/<id>/`:

- `DIARY.md`: a timestamped log of each session: what they tried, what
  they expected, where they hesitated, and their mood (1–5).
- `ISSUES.md`: one row per issue, written as it happens, not from memory
  at the end:
  `ID | severity | category | screen/route | viewport | steps | expected | actual | screenshot | first seen (game Level + wall time)`
  - Severity: S1 blocker (can't progress or lose progress), S2 major (wrong,
    confusing or costly mistake likely), S3 minor (friction, unclear,
    ugly), S4 polish.
  - Category: flow, copy, visual, layout/responsive, accessibility,
    feedback/juice, performance, functional bug, admin.
- `SUMMARY.md` at the end: Level reached and when; wall time to Level 1
  and to Level 2; top 5 frustrations; top 3 delights; the moments they'd
  have quit as a real player; and metrics: actions per key task (sign a
  manager, sign a player, start a build, play a match, set a plan, find
  the league table).

==========================================================================
5. THE PASSES
==========================================================================

PASS 0: Setup (no playtesting yet)
Agent 0A Instance: build `fspro_playtest` and the stack per D2/D3. Smoke
  test: one throwaway account registers, founds a club and opens the
  campus at both 1440x900 and 390x844 (screenshots), then is deleted from
  the scratch DB. Create the admin account for A01. Write
  `INSTANCE-LOG.md`.
Agent 0B Harness: a small helper in `tests/e2e/playtest/` that gives a
  playtester a persona's browser context (viewport, touch, throttling,
  reduced motion), takes named screenshots, and records traces. It does
  NOT script gameplay: no selectors for game flows, no shortcuts. It ships
  with one example session showing a screenshot → decide → act loop.
  Verify both in a quick review before Pass 1.

PASS 1: Playtest (11 sub-agents on one instance; VERIFY Pass 0 first)
- Spawn P01–P10 and A01 with their persona brief, the D3–D7 rules and the
  report format. A01 starts first: set up the clock and world settings
  (D3) through the admin UI, ensure competitions exist, then keep working
  as admin for the whole pass (observe, moderate, run the calendar) and
  report admin UX.
- The lead watches the instance: services up, error logs (Sentry if a DSN
  is set, else server logs), DB size. If a service crashes, the lead
  restarts it, logs it, and files it as an S1 with the log excerpt.
- Pass 1 ends when every player has hit their D5 stop rule.

PASS 2: Triage (VERIFY Pass 1 first: every report has the three files and
every issue has a screenshot, U5)
Agent 2A Triage:
  - Merge the 11 issue lists into `ux-pass/ISSUES.md`. Dedupe and keep the
    reporter list per issue; issues seen by several personas rank higher.
  - Re-check each S1/S2 on the instance (still reproducible?) and map
    every issue to code with file:line.
  - Tag each issue fix, backlog (U8), or won't-fix (with a reason).
  - Group the fixes into **clusters by file ownership**, so no two
    clusters edit one file (R11), and order the clusters by severity.
  - Also write `ux-pass/FINDINGS.md`, a short readout for the owner:
    patterns across personas, the funnel (how many reached Level 1 and
    Level 2, and median times), quit-risk moments, and accessibility
    status.
The lead rules on every design call the triage raises (with impeccable),
approves the cluster plan in DECISIONS.md, and freezes it.

PASS 3: Fix (VERIFY Pass 2 first)
- Fix sub-agents, one per cluster, up to 5 in parallel, each in its own
  worktree. S1 and S2 clusters go first; S3/S4 follow in later waves.
- Each issue: reproduce (U6), fix, test, and record before/after
  screenshots at the reporter's viewport. Run server tsc, client vue-tsc
  (stay at or under the 31-error baseline), client build, the existing
  Playwright suite, and threejs-debug-profiler for any campus/Matchzone
  change (fps not worse than before).
- Each wave is verified by an agent that didn't write it: re-run the
  reproductions, check screenshots, review the diff against U7/U8 and
  R1–R11. FAILs go back; PASSes are merged into `ux/integration` by the
  lead.

PASS 4: Re-play and release report (VERIFY Pass 3 first)
- A fresh instance (`fspro_playtest2`, same recipe) on `ux/integration`.
- Three new playtesters with the personas that found the most S1/S2
  issues (by the triage's count) play to Level 1, and re-check every fixed
  S1/S2 issue on the way. Same report format. New S1/S2 issues get one
  more fix wave (Pass 3 rules), then a re-check.
- `ux-pass/RELEASE-REPORT.md`: issues found / fixed / backlogged /
  won't-fix by severity; the before/after funnel and times; evidence links
  for every fix; the backlog; every lead decision taken in place of the
  owner; remaining risks.
- Stop. Don't merge to `main`. The owner decides.

==========================================================================
6. DEFINITION OF DONE
==========================================================================

- Eleven playtest reports exist, written during play on one shared
  instance, each ending at Level 2 or at the D5 cap with the reason.
- Every S1 and S2 issue is fixed and re-checked in Pass 4, or ruled
  backlog/won't-fix in DECISIONS.md with a reason.
- Every fix has a reproduction, a passing test or before/after screenshots,
  and a PASS from a verifier who didn't write it.
- `ISSUES.md`, `FINDINGS.md`, `BACKLOG.md` and `RELEASE-REPORT.md` exist in
  `docs/perfect/ux-pass/`.
