# ISSUES.md — UX pass, merged triage (Pass 2)

Lead: the orchestrator. Sources: the playtest reports written during Pass 1 on
the shared `fspro_playtest` instance — **A01, P01–P10** (11 reports, 163 raw
rows). This file merges, dedupes and maps them to code and a fix plan.

> **Scope note (2026-10-09).** The owner asked for Pass 2 to run against the
> issues **already surfaced**, without resuming the paused playtesters or
> spawning further sub-agents. This triage therefore covers A01, P01–P06
> (full reports) plus P07–P10 (reports written before the Pass-1 pause / interop
> outage #2). Personas P01/P03/P07/P08/P09/P10 are marked **partial** where the
> outage cut their run before the D5 stop rule.

## Method

1. Every raw row from the 11 `playtest/<id>/ISSUES.md` files is merged into one
   **canonical issue** (`U-nn`); the `Reports` column lists every reporter, so
   the personas that hit it and the count both survive.
2. Each canonical issue is mapped to code with `file:line` (Pass 2's job is to
   turn UI observations into an implementable location).
3. Each is tagged **fix** (Pass 3), **backlog** (U8: new feature / balance /
   spec) or **won't-fix** (with the reason). Reproductions that need the running
   instance (down: interop outage #2, `OQ-UX-2`) are marked **fix\*** — the code
   change is made, runtime verification is deferred to the resumed instance.
4. Fixes are grouped into **clusters by file ownership** (R11: no two clusters
   edit one file), ordered by severity, in `DECISIONS.md` §"Pass 2 cluster plan".
5. S1/S2 rows are re-checked against the code where possible; the environment
   blocker (U-02) is excluded from the game counts.

### Counts

| | Raw rows | Canonical |
| --- | --- | --- |
| S1 (game) | 3 (P02-12, P02-13/P02-20, A01-12 env) | 1 game (U-01) + 1 env (U-02) |
| S2 | 21 | 15 |
| S3 | 96 | 15 grouped |
| S4 | 33 | 6 grouped |

Raw by reporter: A01 16 · P01 6 · P02 22 · P03 22 · P04 13 · P05 21 · P06 5 ·
P07 39 · P08 7 · P09 4 · P10 8.

---

## Canonical issues

`Sev` = highest severity across reporters. `Reports` = raw reporter IDs.
`Disposition` = fix / fix\* / backlog / won't-fix.

| ID | Sev | Cat | Issue | Reports | Code map | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| U-01 | **S1** | flow / functional | The owner's first required action — hiring a manager — cannot be completed from the Owner's office: "Hire Head Coach" calls the admin-only `clubs.hireManager` and gets `403 Admins only`, while the client claims success; with no manager, *every* match is refused (409) and there is **no path to XP**. | P02-13, P02-20 | `apps/fs-pro-client/src/components/clubzone/manager-picker.vue:142`; `apps/fs-pro-client/src/views/user/club/zones/owner-zone.vue:167`; `apps/fs-pro-server/src/middleware/route-policy.ts:52` | **fix** (C1) |
| U-02 | S1 | env | WSL→Windows interop outage + wedged API DB pool (login hangs, `/healthz` 503). Not a game defect. | P02-12, A01-12, P03/P04/P06 env notes | n/a (instance) | **won't-fix** (operator; resolved once 23:08Z, recurred — `OQ-UX-2`) |
| U-03 | S2 | flow / copy | The founded town/country differs from the "Your home" preview (Sdev Central → Philamentia Central). Root cause: `getPlacement`/`nextSpot` is re-decided inside the founding transaction, so a shared world under concurrent founding moves the slot. | P01-01, P04-01, P07-09, P08-05, P09-01 | `apps/fs-pro-server/src/services/world/placement.service.ts:99,91`; `services/world-service/internal/placement/placement.go:112`; `packages/api-contract/src/schemas/atlas.ts` | **fix\*** (C3 — bind the previewed slot as a preference) |
| U-04 | S2 | flow | Reopening `/start` shows the full founding wizard again (with a *different* random home) to a user who already owns a club; only a small "Back to my club" escapes. | P02-03, P07-10, P08-05, P09-01 | `apps/fs-pro-client/src/views/game/found-club.vue:26,263` (has `hasClub` but does not gate the wizard) | **fix** (C8) |
| U-05 | S2 | flow | The first required step ("Sign a manager") is buried 4 taps deep behind the bobbing "First steps" chip; the bottom-dock **Manager** button opens Owner's office, which has no hire action. A first-timer cannot find it. | P01-03, P04-04, P07-18 | `apps/fs-pro-client/src/views/game/club-game.vue` (dock vs First-steps chip); overlaps C1 | **fix** (C1) |
| U-06 | S2 | feedback / functional | A refused match (409 "Sign a manager before your first match") is not surfaced: the dialog just closes. The play contract does not declare `409`, so the client cannot read the gate message. | P02-19, P04-11, P09-04 | `packages/api-contract/src/routes/play.ts:50`; `apps/fs-pro-client/src/composables/use-club-game.ts:258`; server `controllers/play/play.router.ts:33` | **fix** (C2) |
| U-07 | S2 | feedback / functional | No post-match summary (final score, W/D/L, reward breakdown) after the Matchzone closes; the replay can also 500 ("Error fetching match replay") on the first match. | P03-15, P03-19, P04-11 | `apps/fs-pro-client/src/views/game/club-game.vue` (Matchzone close → rewards); matchzone replay fetch | **fix** (C2) |
| U-08 | S2 | functional / copy | Transfer window state disagrees with itself: "open until day 471" but closed on day 470; the flag, `TransferWindowClosesDay` and the `transferWindows` schedule use different day bases. | P02-11, P02-10 | `apps/fs-pro-server/src/services/transfers/transfer-window.service.ts:25`; client banner `club-game.vue:206` | **fix** (C6) |
| U-09 | S2 | functional / data | Test fixtures leak into the live world: player **"HTTP PgTest"** (OVR 0, V0) at the top of every cheap free-agent list; club **"E2E United xqchx9"** / manager **"E2E Manager"** in matchmaking. | P02-07, P03-07, P03-17, P04-07, P07-30, P09-02, P10-08 | live DB rows in `fspro_playtest` (dump); guard in `apps/fs-pro-server/src/services/program/free-agent-market.service.ts:52` | **fix** (C7: migration + market guard) |
| U-10 | S2 | functional / data | Duplicate entities in the markets (a page shows the same player/manager multiple times; 1014 manager rows but 1004 unique names). Legacy `manager-picker`/market joins fan out. | P02-08, P02-14 | `apps/fs-pro-client/src/components/clubzone/manager-picker.vue:164` (legacy list) — superseded by C1's program market | **fix** (C1 removes the fanned-out path) |
| U-11 | S2 | functional bug / admin | The admin **Managers** screen crashes into the global "Error!" overlay and renders a headerless table: the template reads `item.Club.Name` / `item.Nationality.Name` for unemployed/managers with no nationality → render throw → `errorOverlay`. | A01-10, A01-14 | `apps/fs-pro-client/src/components/managers/managers-table.vue:40,45`; `main.ts:91`; `repositories/drizzle/ManagerRepository.ts:30` | **fix** (C9) |
| U-12 | S2 | admin / feature | No governance surface at all: no Users, Reports, Chat or News moderation; no way to see a club's owner or suspend/ban. The only assignment control is buried in player Account settings with no user picker. | A01-15, A01-16, A01-08 | new screens (no location) | **backlog** (U8: new feature) |
| U-13 | S2 | accessibility | Campus overlays / drawers are not dialogs: no `role="dialog"`/`aria-modal`, focus is not moved or trapped, Escape does nothing, focus is lost on close, and the "While you were away" modal blocks the campus on every load. | P05-01, P05-02, P02-09, P05-17, P05-18, P05-21, P04-05, P08-06 | `apps/fs-pro-client/src/components/cozy/cozy-modal.vue` (14-line component, no a11y) | **fix** (C4) |
| U-14 | S2 | accessibility | Manager/player market cards expose identical action names ("Sign this manager" ×200) and a reversed tab order; facilities buttons are all "Build Tier 1". | P05-07, P05-08, P05-19 | program manager/squad/facilities cards (`components/program/**`) | **fix** (C5) |
| U-15 | S2 | feedback / functional | The program squad counters do not update after signing (0/11, 0 keepers) until a full reload. | P03-06, P04-10 | `components/program/**` squad step | **fix** (C5) |
| U-16 | S2 | performance | The 3D campus runs at ~1.7–2.9 fps idle, 0.8 fps panning on a low-end phone (360×740, CPU 4×, Slow 4G). | P06-01, P06-04 | `components/cozy/**` (three.js campus) | **fix\*** (C10 — budgeted reductions; deep perf work to backlog) |
| U-17 | S3 | accessibility | `prefers-reduced-motion: reduce` is ignored: collect bubbles bob, the online LED pulses, the PLAY button spins. | P06-03 | `components/cozy/cozy.scss:86,106,290,493,499,513` | **fix** (C10) |
| U-18 | S3 | feedback / juice | Interactive bubbles animate continuously, so a normal click/tap is unreliable ("element is not stable"); the primary CTA on the campus is a moving target. | P02-04, P03-08, P03-14, P04-08, P08-07 | `components/cozy/cozy.scss` (`.bubble`) | **fix** (C10) |
| U-19 | S3 | copy | The "Negotiate & sign" dialog shows only the signing fee, never wage × contract length; the Contract buttons have no unit. | P03-10, P07-23, P07-24 | program negotiate dialog | **fix** (C5) |
| U-20 | S2 | copy | The owner-program splash says "Funds can't do all three well. That choice is the game." but the three costs total ~10% of the opening balance — the stated trade-off is false. | P03-03, P07-17 | owner-program splash copy | **fix** (copy) |
| U-21 | S3 | copy | The same XP is shown against two different targets (Program 54 / Level 1 100) with no legend. | P03-11 | owner-program header / campus HUD | **fix** (copy) |
| U-22 | S3 | accessibility / copy | HUD pills are unlabelled runs of digits (balance, fans, star, bolt, Board, rank, XP): no visible label/tooltip/aria name. | P03-05, P03-18, P03-20, P03-22, P04-13, P07-11 | `components/cozy/**` HUD | **fix** (C4/C5) |
| U-23 | S3 | layout / functional | The transfer-market table clips its Actions column at 1440×900 (no scrollbar); the table intermittently renders empty. | P02-06, P02-10 | legacy recruitment market | **fix** (C6) |
| U-24 | S3 | visual | The "Scouted Shortlist" card is dark-on-dark and a stray tooltip sticks over the list. | P02-05, P04-06, P10-05 | legacy recruitment market | **fix** (C6) |
| U-25 | S3 | layout / responsive | The Owner's-office tab strip overflows silently on phone/tablet; off-screen tabs are unreachable. | P06-05, P08-03 | `views/user/club/**` tab strip | **fix** (C10) |
| U-26 | S3 | layout / responsive | `/u/settings` account page is overlaid by a fixed 256px nav rail at 390px; forms unusable. | P08-02 | `views/user/settings/**` | **fix** (C10) |
| U-27 | S3 | flow / copy | The League screen is an empty state for the whole first season; the Level-1 carrot ("Earn the league place") has no date. | P02-21, P04-12 | league drawer | **fix** (copy) |
| U-28 | S2 | flow / feature | The invite flow promised by the founding card is unreachable: no invite field, no "town page", no create/copy/accept affordance. | P08-01 | atlas invites (`services/world/placement.service.ts:281`) exist server-side, no UI door | **backlog** (U8: feature) |
| U-29 | S3 | admin | Admin console UX debt: no door from login (A01-01); static Home (A01-02); deep-link header shows "No club yet"/"Day 1" (A01-03/06); clock not live in place (A01-13); "Save pacing" feedback (A01-07); empty League column (A01-11); **"Pools · undefinedd"** (A01-05); no moderation on club detail (A01-08/09). | A01-01..09, A01-11, A01-13 | `views/admin/**` | **fix** (C9 partial: undefinedd, headers, login door, live clock) / **backlog** rest |
| U-30 | S3 | accessibility / copy | Founding form debt: "Code" unlabelled (P01-02/P02-02/P07-04); fields look prefilled but are placeholders (P04-02); reload discards everything (P05-05/P07-07); swatches announce hex (P05-04); hidden colour inputs focusable/unnamed (P05-03); map pins not focusable (P05-06); icon-only crest pickers (P10-03). | P01-02, P02-02, P04-02, P04-03, P05-03..06, P07-04, P07-07, P10-03 | `views/game/found-club.vue`, `components/atlas/**` | **fix** (C8 partial) / **backlog** |
| U-31 | S3/S4 | copy | Non-native English copy: idioms/jargon across the founding flow, advisor, owner program, and match dialogs ("Found a club", "legal XI", "drew you", "compounds", "the range is not the truth", "ATT", "yr", unlabelled fee/wage). | P07-01..39 (many), P05-13 | copy strings throughout the client | **backlog** (copy pass; a few fixed incidentally) |
| U-32 | S3 | performance / feedback | Slow feedback: world map "Unrolling the map…" for seconds; taps take ~8–12 s to show UI. | P06-02, P06-04, P09-04 | atlas tiles load, program list load | **fix\*** (spinners — C2/C5) / **backlog** perf |
| U-33 | S3 | functional bug | "Analysis" shows templated advice ("conceding 1.2 goals/match", "ranked 3 of 11") that contradicts the same panel's "No matches yet", 0-0. | P10-06 | analysis component | **backlog** (needs product decision) |
| U-34 | S3/S4 | visual | Magenta/dark-navy surfaces break the cream/wood art direction (Year Calendar "SIM TO DATE", JEV advisor panel, dark admin console). | P10-02, P10-07, A01 dark console | `views/**` | **backlog** (art-direction pass) |
| U-35 | S3 | feedback | Committing a build (-V300,000) has no confirmation, unlike manager signing. | P03-13 | build panel | **fix** (C9) |

---

## Clusters (fix plan — file ownership, R11)

Ordered by severity. One owner per file across the whole plan.

| Cluster | Sev | Files (owner) | Canonical issues | Verify against |
| --- | --- | --- | --- | --- |
| **C1 manager-hire / first-hour** | S1 | `apps/fs-pro-client/src/components/clubzone/manager-picker.vue`; `apps/fs-pro-client/src/views/user/club/zones/owner-zone.vue` | U-01, U-05, U-10 | P02 |
| **C2 play refusal + summary** | S2 | `packages/api-contract/src/routes/play.ts`; `apps/fs-pro-server/src/controllers/play/play.router.ts`; `apps/fs-pro-client/src/composables/use-club-game.ts` (+`views/game/club-game.vue`) | U-06, U-07, U-32 | P02, P03, P04 |
| **C3 placement binding** | S2 | `packages/api-contract/src/**` (atlas/founding schema); `services/world-service/internal/placement/placement.go`; `apps/fs-pro-server/src/services/world/placement.service.ts`,`club-founding.service.ts` | U-03 | P01, P04, P07, P08, P09 |
| **C4 cozy modal a11y** | S2 | `apps/fs-pro-client/src/components/cozy/cozy-modal.vue`; `components/cozy/cozy.scss` | U-13, U-22 (part) | P05, P02 |
| **C5 program cards (counters, names, wage)** | S2 | `apps/fs-pro-client/src/components/program/**` | U-14, U-15, U-19, U-21, U-22 (part) | P03, P05, P07 |
| **C6 transfer window + recruitment table** | S2 | `apps/fs-pro-server/src/services/transfers/transfer-window.service.ts`; legacy recruitment market components | U-08, U-23, U-24 | P02, P03, P10 |
| **C7 test-data hygiene** | S2 | new migration `apps/fs-pro-server/src/db/drizzle/migrations/0044_remove_test_fixtures.sql`; `services/program/free-agent-market.service.ts` | U-09 | P02, P03, P04, P07, P09, P10 |
| **C8 founding guard + form** | S2 | `apps/fs-pro-client/src/views/game/found-club.vue`; `components/atlas/**` | U-04, U-30 (part) | P02, P07, P08, P09 |
| **C9 admin console debt** | S2 | `apps/fs-pro-client/src/components/managers/managers-table.vue`; `views/admin/competitions/**`; `views/admin/**`; `views/user/club/zones/build` | U-11, U-29 (part), U-35 | A01, P03 |
| **C10 campus motion + responsive** | S3 | `components/cozy/cozy.scss`; `views/user/club/**` tab strip; `views/user/settings/**` | U-17, U-18, U-25, U-26, U-16 (part) | P06, P08 |
| **Backlog** | — | — | U-12, U-16 (deep), U-28, U-31, U-33, U-34, U-29 (rest), U-30 (rest) | — |

> **Backlog** is tracked in `BACKLOG.md` (created alongside this file) with the
> evidence, per U8. Anything that is a new feature, a balance change or a spec
> change is backlogged unless it is the only way to fix an S1/S2 (none needed
> here beyond C1–C10).

---

## Pass 2 exit criteria (FOR-AGENTS §5)

- [x] 11 reports read; every row merged and deduped with reporters kept.
- [x] Every S1/S2 mapped to code with `file:line`.
- [x] Each issue tagged fix / backlog / won't-fix with a reason.
- [x] Fixes grouped into clusters by file ownership (R11), ordered by severity.
- [x] `FINDINGS.md` written (owner readout).
- [ ] Re-check each S1/S2 on the instance — **blocked** by interop outage #2
      (`OQ-UX-2`); deferred to the resumed instance. Marked `fix*` where the
      code change does not depend on it.
