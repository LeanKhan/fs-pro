# P02 — SUMMARY.md

**Persona:** Football Manager veteran · **Viewport:** 1440×900, mouse
**Instance:** shared playtest stack (`http://localhost:4173` / API `:3010`),
D3 scale `GAME_TIME_SCALE=4`, `DayLengthMinutes=48` — every timer is 4× its
design-scale ("scale-1") equivalent; I give both where relevant.
**Club:** Veteran Analytics (VET), Sdev Central, Kev · club id
`766a6c8b-2547-4ba3-939f-6f6cb47613a1` · owner `p02mick` (login preserved in
`state.json`; no password needed to resume).
**Run window:** 2026-10-08 ~11:23–19:23Z (Session 1–3, hit the D5 cap during the
outage) **+ resumed 2026-10-08 ~23:45Z → 2026-10-09 ~02:30Z** (Sessions 4–6).
**Status: stopped — blocked by an S1 product dead-end, not by the outage this
time.** Reached **Level 0, 0/100 XP**.

## Outage annotation (was the only stop reason; now resolved)

The first SUMMARY stopped on a **shared-instance outage** (WSL→Windows interop
down from ~12:20Z, shared API hung from ~15:15Z). That is **fixed** —
`INSTANCE-LOG.md` §7/§8, lead restart at 23:08Z; `/healthz` was `200` and a real
player login worked on resume. Those two events remain **P02-12** (S1,
instance/lead item, dedupe with A01-12) but they are **no longer the reason the
run ended**.

## Level reached and when

- **Level 1: not reached. Level 2: not reached.** XP stayed **0/100** the whole
  run (Program XP 0, no match XP).
- Wall time to Level 1 / Level 2: **n/a** — there is no reachable path.

## Resumed outcome — the product is a hard dead-end at Level 0 (headline)

On a healthy instance I resumed at Owner's Program step 1 and found that a new
owner **cannot make any progress at all**:

1. **Hiring a manager is impossible (P02-13, S1).** Owner → "Hire Head Coach" →
   pick a candidate → **HIRE** closes the dialog and does nothing. The network
   shows `PUT /api/clubs/<club>/manager → 403 {"message":"Admins only"}`; the
   client console even logs *"Club Manager appointed successfully!"*. No error is
   shown. Owner's Program step 1 ("Sign a manager") never advances.
2. **Every match is refused without a manager (P02-19, S2).** PLAY → "Play now"
   silently closes; the only reason is `POST /api/play/<club>/match → 409 "Sign a
   manager before your first match"`, never surfaced in the UI.
3. The transfer window is **closed** (next opening is the following season), so
   even player signings are gated.

⇒ No manager + no matches + closed window = **no route to XP**. As a real player
I would refund the game at this point. See **P02-20** (S1) for the dead-end as a
single finding.

Wall time actually *played*: ~1 h before the outage + ~2 h 45 m on resume
(≈3 h 45 m of genuine play), spread over ~19 h wall since registration because of
the ~11 h infrastructure outage. Per D3's pacing, timers observed at scale 4
(12 real min per game day, 30 s per game hour) would be 4× longer at scale 1.

## Top 5 frustrations

1. **The first required action is broken (P02-13/P02-20, S1).** You cannot hire a
   manager through the player UI; every path to progress is then gated on one.
2. **Silent failures.** The 403 (hire) and the 409 (play) are swallowed — the UI
   says "success" for the hire, and says nothing for the match. (P02-13/P02-19.)
3. **Test/duplicate data in the live markets.** "HTTP PgTest" (OVR 0, V0) is a
   day-one free agent (P02-07); the same player appears twice on one page
   (P02-08); the manager list has 1014 rows / 1004 unique with one name ×7
   (P02-14). It reads "this build isn't finished".
4. **Numbers and states that don't reconcile.** Transfer-window countdown says
   "closes in 2 days" the day before it's closed, and the server flag says
   `open` while the banner says `closed` (P02-11); founding preview said Bank
   1.5M but the club starts with V4M (P02-01).
5. **Thin tactics for an FM veteran (P02-22).** Four formations, no roles, no
   mentality, no team instructions anywhere on the Team Sheet — while facilities
   and finances are genuinely detailed (that mismatch was the surprise).

## Top 3 delights

1. **The Owner tab finance board** — Treasury, wage bill, matchday revenue, net
   margin, a matchday ledger, Board Confidence 60% and Fan Approval 55%. Real,
   readable, FM-flavoured.
2. **The Build system** — seven facilities, each with Tier, its current stat and
   the priced *next* upgrade (Grass Pitch V250,000 … Staff Hut V300,000) against
   your V4M, plus "0/1 builders busy". Clash-of-Clans done with taste.
3. **The crest designer + Owner's Program syllabus** (from Session 1, still
   true) — 5 shapes × 8 patterns × 8 emblems × 3 colour rows with a live preview;
   and a 4-step program with a program-XP counter that gives a newcomer a map.

## Moments I'd have quit as a real player

- **Resume, minute 5:** pressing HIRE and watching nothing happen, twice.
- **Resume, minute 30:** PLAY → silent close; then realising a manager is
  mandatory and unbuyable.
- **Resume, minute 40:** "You're not in a league this year" with the window shut
  and no squad — the game has nothing left to offer me until a season rollover I
  can't influence.

## Metrics — actions per key task (first attempt)

| Task | Actions | Notes |
| --- | --- | --- |
| Register + found a club | ~14 | Session 1; ~5 wasted on the ambiguous name/code gate (P02-02). |
| Sign a manager | **blocked** | Reached the HIRE click (4 actions) but `PUT …/manager` = 403; never signed (P02-13). |
| Sign a player | **blocked** | Market browsable (5,626 rows) but window closed and Actions column clipped (P02-06). |
| Start a build | **blocked** | Build panel opens and lists 7 priced upgrades; clicking a facility was never completed before interop dropped again. |
| Play a match | **blocked** | PLAY → Play now (3 actions) → 409, silently closed (P02-19). |
| Set a plan (tactics/team) | **reachable, not completable** | Team Sheet opens (4-3-3, style, Auto-Pick/Suggest/Save); 0 players so nothing to save; no roles/mentality (P02-22). |
| Find the league table | **not available** | League screen is an empty state for the whole first season (P02-21). |

## Issue counts (final)

22 rows in `ISSUES.md`: **S1 ×3** (P02-12 instance outage — now resolved,
dedupe with A01-12; **P02-13 manager hire 403**; **P02-20 the resulting
dead-end**), **S2 ×4** (P02-07 test data, P02-11 window countdown, P02-14 manager
duplicates, P02-19 silent 409), **S3 ×12**, **S4 ×3**.

New this resume: **10 rows** — S1 ×2 (P02-13, P02-20), S2 ×2 (P02-14, P02-19),
S3 ×5 (P02-15, P02-16, P02-18, P02-21, P02-22), S4 ×1 (P02-17). Two earlier rows
were **corrected/re-evidenced** on resume: P02-10 (the empty market was an
intermittent render, not the window closing) and P02-11 (server `TransferWindow-
Open:true` while closed, added).

## Evidence (resume)

- Screenshots `screenshots/40-…`–`55-…` (see `ISSUES.md` for per-issue paths);
  key ones: `43-hire-dialog.png` (empty), `44-hire-waited.png` (duplicates),
  `45-after-hire.png` + `46-after-hire-diag.png` (403), `48-recruitment.png`
  (PgTest + dupes + clipped Actions), `50-match-result.png` (silent 409),
  `51-formation-options.png`, `53-league.png`.
- Step scripts + captured JSON/network/console in `steps/` (e.g.
  `steps/46-hire-diag.mjs` holds the `403 Admins only` and the optimistic
  "appointed successfully" console log; `steps/50-play.mjs` holds the `409`).

## For the lead (triage)

- **Fix first:** P02-13/P02-20 — the player-side appoint-manager route is
  admin-only, and it gates the entire new-player funnel. Nothing else in Pass 1
  that a fresh account can reach matters until this works. P02-19 (surface the
  reason for a refused match) is the cheap companion fix.
- P02-07/08/14 (duplicate + test rows) are likely one server-side join/seed bug
  across players and managers; they were seen by more than one persona.
- P02-12 is the (now-fixed) instance outage; merge with A01-12 per `INSTANCE-LOG`.
- **Environment:** WSL→Windows interop dropped again mid-resume
  (`UtilAcceptVsock:271 accept4 failed 110`), which is why Session 6 is short and
  the facility-build confirm step (55) has no PNG. Same host issue as A01-12;
  needs the host-level fix, not a game fix.
