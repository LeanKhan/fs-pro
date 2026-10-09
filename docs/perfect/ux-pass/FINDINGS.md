# FINDINGS.md — UX pass owner readout (Pass 2)

The short readout from the merged triage (`ISSUES.md`). Evidence for every claim
is in `playtest/<id>/` (screenshots, traces, diaries).

## The funnel

| | Reached Level 1 | Reached Level 2 (400 XP) | Notes |
| --- | --- | --- | --- |
| A01 (admin) | n/a | n/a | runs the world; not an XP persona |
| P01 | no | no | blocked finding the first step (U-05) |
| P02 | no | no | **blocked by U-01** — the headline dead end |
| P03 | yes (~10 XP into L1) | no | reached L1, then the interop outage |
| P04 | no | no | UI path only, blocked by the manager dead end |
| P05 | no | no | stopped after the a11y sweep |
| P06 | no | no | low-end device; ~2 fps campus |
| P07 | no | no | blocked by U-01 / U-05 |
| P08 | no | no | blocked by U-01 |
| P09 | no | no | blocked by U-01 |
| P10 | no | no | explorer run |

**Zero of ten player personas reached Level 2.** The single cause common to
every blocked run is **U-01**: the manager hire 403s, so the first required step
cannot be completed and every match is refused. This is the pass's headline and
the only S1 game defect. Everything else is friction, correctness or polish on
top of a first hour that does not work.

## Patterns across personas

1. **The first hour does not work, for everyone.** Three independent personas
   (P02, P07, and P01/P04 by discovery) hit the same wall: the Owner's office
   "Hire Head Coach" is an admin-only route (U-01), the bottom-dock **Manager**
   is a dead end for the task (U-05), and the match refusal is silent (U-06).
2. **Test data is user-visible.** "HTTP PgTest" (a Postgres fixture) is the
   *cheapest* free agent in every market (7 personas), and an E2E club is in
   live matchmaking. It reads as "unfinished build" to casual and veteran
   players alike.
3. **The world feels shared but lies about placement.** Under concurrent
   founding the "Your home" preview and the actual placement diverge (5
   personas). The preview is a promise the transaction does not keep.
4. **Interactions fight the player.** The primary campus CTAs bob/pulse, so
   both automation and real taps miss (5 personas); reduced-motion is ignored
   (P06). The "While you were away" modal blocks the campus on every return and
   is not a dialog (P05, P01, P02, P04, P08).
5. **Numbers without labels.** The HUD is a run of unlabelled digits
   (balance/fans/star/bolt/Board/rank/XP) — an economist and a non-native reader
   both bounced off it (P03, P04, P07).
6. **The admin half is split.** World-running is genuinely powerful (clock,
   year calendar, competitions) but governance is absent (no users, reports,
   chat, bans) and the one screen that matters day-to-day (Managers) crashes
   (A01).

## Quit-risk moments (verbatim, from the diaries)

- P02: *"The first required onboarding action cannot be completed."*
- P04: *"Returns straight to campus with no score, no result, no XP toast."*
- P06: *"Campus runs at 1.7–2.9 fps… I'd assume the game is broken."*
- A01: *"Right after login: no hint that an admin console exists."*

## Accessibility status

The founding flow is keyboard-operable and the joiner form is properly labelled
(P05 positives), but **every overlay is non-modal to assistive tech**: no
`dialog` role, no focus trap, Escape dead, focus lost on close (U-13). Market
action buttons are indistinguishable by name (U-14). HUD values have no names
(U-22). Cited contrast: owner-program inactive subtitles 3.38:1 (below 4.5:1);
disabled join submit 2.38:1 (exempt, polish).

## Delights to protect (U7)

The hand-drawn cozy art and crest editor; the founding map → home → crest →
"is born!" sequence; the Owner's Program checklist; the Matchzone live-match
view and the Year Calendar. Fixes must not flatten these.

## Disposition

- **Fix now (C1–C10)**: U-01, U-03, U-04, U-05, U-06, U-07, U-08, U-09, U-10,
  U-11, U-13, U-14, U-15, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25,
  U-26, U-27, U-29 (part), U-30 (part), U-32 (part), U-35.
- **Backlog (`BACKLOG.md`)**: U-12 (governance), U-16 (deep campus perf),
  U-28 (invites UI), U-31 (copy pass), U-33 (analysis advice), U-34 (art
  direction), plus the rest of U-29/U-30.
- **Won't-fix**: U-02 (operator/instance).
