# BACKLOG.md — UX pass (U8: not fixed in Pass 3)

Issues the triage ruled are **new features, balance changes or spec changes**,
or improvements too large/risky to land inside a "fix, don't redesign" pass.
Each has the evidence and a suggested direction. Nothing here blocks the S1/S2
fix plan.

| Item | Canonical | Why backlog | Evidence | Suggested direction |
| --- | --- | --- | --- | --- |
| Admin governance surfaces | U-12 | New feature: Users / Reports / Chat / News moderation, ban/suspend, club-owner column. Needs product scope. | A01-08/15/16 | A `Users` admin screen with search, suspend/ban, and "clubs owned"; a `Reports` queue; wire the existing `users.addClubsToUser` behind a user picker. |
| Deep campus performance | U-16 | The campus is ~2 fps at 360px/CPU4×. A real fix is a render-budget pass (LOD, instancing, draw-call cuts, DPR cap, shadow/AA budget) — too broad for this pass. | P06-01/P06-04 | `threejs-debug-profiler` + `threejs-aaa-graphics-builder` render budget; cap `devicePixelRatio`, cut shadow map, instance repeated props, idle-fps mode. |
| Invite flow UI | U-28 | New feature: no invite field on join, no "town page", no create/copy/accept affordance, though the server API exists. | P08-01; server `createInvite`/`listInvites` already shipped | Add a "Invite friends" card on the club/district page + `?invite=` acceptance on `/auth/join`; D6 wants P08 to join P01's district. |
| Non-native copy pass | U-31 | Spec/copy change across ~39 strings; needs the owner's voice. | P07-01..39, P05-13 | A copy pass with plain-English alternatives (keep the cozy voice): "Found a club" → "Start a club", "legal XI" → "a full team of 11", label fee/wage, "ATT" legend, contract "years". |
| Analysis advice contradicts data | U-33 | Product decision: the advisor template should suppress claims until there is a sample. | P10-06 | Gate each advice card on `matchesPlayed ≥ n`; show "Not enough data yet". |
| Art-direction recovery | U-34 | Visual redesign beyond "fix, don't redesign". | P10-02/07, A01 dark console | Bring "SIM TO DATE", the JEV advisor and the admin console into the cream/wood/amber palette. |
| Admin console polish | U-29 (rest) | Larger admin UX work: real Home dashboard, live in-place clock, unified save feedback, populated League column, club moderation. | A01-01..13 | A dedicated admin-console pass; the quick wins ("undefinedd", headers, login door) are in C9. |
| Founding-form a11y/UX debt | U-30 (rest) | Form redesign: prefill the suggested name/ground, persist wizard state, name the colour inputs / hide decorative ones, keyboard-selectable map pins, labelled crest pickers. | P01-02, P04-02, P05-03..06, P07-07, P10-03 | Follow-up form pass; the "already own a club" guard is in C8. |
| Matchmade-friendly XP balance | (instance note) | A grinder can beat the 4-hour D3 target because friendlies pay 30 XP on a 75 s cooldown. Balance, not UX. | `INSTANCE-LOG.md` §3 | Diminishing returns or a daily cap on qualifying-friendly XP. |
