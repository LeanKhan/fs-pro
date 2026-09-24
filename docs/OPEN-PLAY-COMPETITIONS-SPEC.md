# Spec: Open-Play Competitions (rankings without pre-scheduled fixtures)

## Goal

Let clubs belong to several leagues and competitions at once and be ranked in each,
**without** a fixture list generated up front. Matches are arranged on demand
(challenges), a season is a time window, and the world runs on a fixed-length
year that rolls over by itself.

This **replaces** the scheduled system on this branch. The two never run side by
side: no mode flag, no dual code paths.

## Legacy

The current scheduled system (round-robin leagues, week tables, manual season
cycles) is preserved only in git:

- Before any of this work merges, branch `legacy/scheduled-seasons` (and tag
  `legacy-scheduled-v1`) from the last `main` commit that has it.
- Switching back = checking out that branch against a database that was never
  migrated (or a restored backup). There is no in-app switch and no down
  migration.
- Legacy code is deleted on this branch once its replacement lands (see
  "Removed").

## Terms

| Term | Meaning |
| --- | --- |
| Year | Fixed run of `YearLengthDays` calendar days. Drives ageing, wages, retirement, youth intake, reports. |
| Season | One competition's window (`StartDay`..`EndDay`) inside a year. |
| Challenge | A proposed match between two members of a competition. Becomes a normal Fixture once accepted. |
| Ranking row | One club's aggregate record in one season. |

## What changes from today

- `middleware/seasons.ts` `create()` no longer generates league fixtures
  (`RoundRobin` for leagues). Cups and tournaments keep their pre-scheduled
  fixtures (`createCupInitialFixtures`, `createGroupStageInitialFixtures`); see
  "Formats".
- `arrangeSeasonFixturesAcrossDays` (`controllers/calendar/calendar.controller.ts`)
  goes: league fixtures get a day when accepted, cup fixtures get the fixed
  round days described below.
- `Seasons.Standings` week tables (`controllers/game/functions.ts`
  `updateStandings`/`batchUpdateStandings`, `utils/seasons.ts`
  `compileStandings`) are replaced by the `Rankings` table.
- A season ends when its window closes, not when every fixture is played
  (`finishSeasonPlain`).
- The clock no longer jumps to the next scheduled fixture
  (`calendar.service.ts` `advanceDayIfDone` → `findNextUnplayedDay`); with no
  schedule that stalls forever. It advances day by day.
- The hand-typed `Year` label and the manual start/end season cycle
  (`startNextSeasonCycle`, `endSeasonCycle`) are replaced by automatic year
  rollover.

## Data model changes

One Drizzle migration plus a one-off data script (see "Migrating existing data").

### `Calendars` (world settings)

| Column | Type | Notes |
| --- | --- | --- |
| `YearLengthDays` | integer, not null, default 360 | |
| `CurrentYear` | integer, not null, default 1 | Shown as `Y1`, `Y2`… |
| `YearStartDay` | integer, not null, default 0 | `Day.Index` the current year began. |
| `AutoRollover` | boolean, not null, default true | Off = admin must end the year by hand. |
| `SeasonGapDays` | integer, not null, default 0 | Days between year start and season start. |
| `TransferWindows` | jsonb, not null | `[{ fromDay, toDay }]`, day-of-year ranges. Default `[{1,30},{180,210}]`. |
| `DefaultRules` | jsonb, nullable | Competition rules used when a competition sets none. |

`TransferWindowOpen`/`TransferWindowClosesDay` stay as the live state; the clock
sets them from `TransferWindows`, and the admin override still writes them.

### `Competitions`

| Column | Type | Notes |
| --- | --- | --- |
| `Format` | text, not null, default `'league'` | `'league'` \| `'knockout'` \| `'groups-knockout'`. Replaces the `League`/`Cup`/`Tournament` booleans. |
| `Rules` | jsonb, nullable | Merged over `Calendars.DefaultRules` and code defaults. |

Dropped: `NumberOfWeeks`, `League`, `Cup`, `Tournament`. `Type` is kept as a
display label only.

### `Seasons`

| Column | Type | Notes |
| --- | --- | --- |
| `StartDay` | integer, not null | |
| `EndDay` | integer, not null | Last day matches may be played. |
| `YearNumber` | integer, not null | Replaces the text `Year` label. |

Dropped: `Standings`, `Year`. `SeasonCode` becomes `<COMP>-Y<n>`.

### `Fixtures`

| Column | Type | Notes |
| --- | --- | --- |
| `CompetitionId` | uuid FK → Competitions, nullable | Null only for friendlies. |
| `ChallengeStatus` | text, nullable | `proposed` \| `accepted` \| `declined` \| `expired` \| `forfeited` \| `cancelled` \| `played`. Null for friendlies. |
| `ChallengerClubId` | uuid FK → Clubs, nullable | Null for cup fixtures (drawn, not challenged). |
| `ProposedAt` | timestamp, nullable | |
| `RespondBy` | integer, nullable | Last day to accept before it expires. |

`Week` is kept for cup group-stage matchdays only. `ScheduledDay`/`ScheduledDate`
are set on acceptance for league fixtures and at creation for cup fixtures.

### `Seasons.RoundDays`

integer array, nullable. Cup formats only: the fixed day of every round (group
matchdays then knockout rounds), set at season start.

A proposed challenge **is** a Fixture row, so acceptance is a status flip plus a
day assignment, and every downstream reader (runner, replays, player/club match
details) already understands it.

Index: `(CompetitionId, ChallengeStatus)`.

### New table `Rankings`

One row per (season, club).

| Column | Type |
| --- | --- |
| `_id` | uuid PK |
| `SeasonId` | uuid FK → Seasons, not null |
| `CompetitionId` | uuid FK → Competitions, not null |
| `ClubId` | uuid FK → Clubs, not null |
| `Group` | text, nullable (groups-knockout only) |
| `Played`, `Wins`, `Draws`, `Losses`, `GF`, `GA`, `GD`, `Points` | integer, default 0 |
| `Forfeits` | integer, default 0 |
| `Rating` | real, default from rules |
| `LastPlayedDay` | integer, nullable |
| timestamps | |

Unique `(SeasonId, ClubId)`.

### New table `RankingResults`

Idempotency ledger so a replayed or retried match can never count twice.

| Column | Type |
| --- | --- |
| `FixtureId` | uuid PK, FK → Fixtures |
| `SeasonId` | uuid FK |
| `AppliedAt` | timestamp |

The result writer inserts here and updates both `Rankings` rows **in one
transaction**. A conflict on insert means it was already applied; skip.

### `Clubs`

| Column | Type | Notes |
| --- | --- | --- |
| `Elo` | real, not null, default 1500 | Updated by competition results; friendlies don't count. Used for matchmaking and AI choices, never for a competition's table. |
| `ChallengePolicy` | jsonb, nullable | Human club's auto-accept policy. Null = manual. |

## Competition rules (`Competitions.Rules`)

```ts
interface CompetitionRules {
  windowDays: number | null;     // season length; null = rest of the year (default)
  ranking: 'points' | 'ppg' | 'elo'; // table ordering, default 'ppg'
  pointsForWin: number;          // default 3
  pointsForDraw: number;         // default 1
  minGamesToRank: number;        // below this, listed but unranked; default 10
  maxGamesPerSeason: number;     // per club; default 40
  maxVsSameOpponent: number;     // per season; default 2
  rematchCooldownDays: number;   // default 14
  challengeRange: number;        // may challenge clubs within N ranking places (0 = any); default 5
  respondWithinDays: number;     // after this, challenge expires; default 3
  maxOpenChallenges: number;     // outgoing proposed per club; default 3
  minDeclinesBeforeForfeit: number; // declines inside the window before the next becomes a forfeit; default 3
  maxMatchesPerClubPerDay: number;  // default 1
  initialRating: number;         // default 1500
  eloK: number;                  // default 24
  // knockout / groups-knockout only
  roundSpacingDays: number;      // days between cup rounds; default 14
  groupCount: number;            // groups-knockout; default 4
  qualifiersPerGroup: number;    // groups-knockout; default 2
}
```

Defaults live in `services/competitions/rules.ts`: code defaults, then
`Calendars.DefaultRules`, then `Competitions.Rules`.

### Ranking order

- `points`: Points, GD, GF, Wins. Rewards volume; only sensible with a tight
  `maxGamesPerSeason`.
- `ppg` (default): Points ÷ Played, then GD per game, then Played (more games
  first), then GF. Clubs under `minGamesToRank` sort below all ranked clubs.
- `elo`: `Rating` from that competition's own Elo, then Played.

## Formats

- **league**: challenges only, as below.
- **knockout** (cups): pre-scheduled, no challenges. At season start
  `Seasons.RoundDays` is fixed: one day per round, `roundSpacingDays` apart,
  inside the window. The first round is drawn and its fixtures created on its
  day (`createCupInitialFixtures`, seeded by `Clubs.Elo`). Each later round is
  drawn when the previous one finishes (`checkAndAdvanceTournaments`) and
  placed on its pre-set day. Reuses `tournament-engine.service.ts` as is, apart
  from reading round days from `RoundDays`.
- **groups-knockout** (tournaments): pre-scheduled. Groups drawn at season
  start (Elo-seeded, `Rankings.Group`), a round robin within each group
  (`createGroupStageInitialFixtures`, one group matchday per round day), group
  tables kept in `Rankings`, then the top `qualifiersPerGroup` go into a
  knockout stage as above.

### Cup days vs. league challenges

A cup round day is **reserved** for every club still in that cup, even before
the round is drawn: the challenge scheduler never puts a league match on it,
and `eligible-opponents` explains the clash. Cup fixtures are never moved or
declined. If a league window and a cup overlap heavily, the rules form warns
when a club's free days fall below what `minGamesToRank` needs.

## Challenge lifecycle (league and group stage)

```
propose ──► proposed ──accept──► accepted ──(clock plays it)──► played
               │  │                   │
               │  └─decline─► declined (counts toward forfeit threshold)
               │                      └─ cancel (admin / club left comp) ─► cancelled
               └─ RespondBy passes ─► expired  (counts as a decline)
declines ≥ minDeclinesBeforeForfeit ─► next decline is recorded as forfeited:
  challenger gets a 3-0 win, decliner a 0-3 loss + Forfeits++
```

### Validation on propose (all must pass)

1. Both clubs are members of the competition (`CompetitionClubs`); same group
   for a group stage.
2. The competition has an active season whose window covers today.
3. Not the same club. Neither club is over `maxGamesPerSeason`.
4. Pair count this season (played + accepted) < `maxVsSameOpponent`.
5. Last meeting was ≥ `rematchCooldownDays` ago.
6. Within `challengeRange` places of each other (skip while either is under
   `minGamesToRank`).
7. Challenger has < `maxOpenChallenges` proposed.
8. No existing proposed/accepted challenge between the pair in this competition.

### Accept / scheduling

Find the first day ≥ `CurrentDay + 1` and ≤ `EndDay` where neither club
already has `maxMatchesPerClubPerDay` fixtures in any competition and neither
has a reserved cup day. Set
`ScheduledDay`/`ScheduledDate`, `ChallengeStatus = 'accepted'`. No slot → reject
the accept with a clear error.

Home side = challenged club (the challenger travels).

## Result writing

`RankingService.applyResult(fixtureId)` (ledger + both rows + both clubs' Elo,
one transaction) replaces `updateStandings`/`batchUpdateStandings` in
`game.controller.ts` and `matchday-runner.service.ts`. Group-stage fixtures
go through it too (group table); knockout fixtures skip the table and the
tournament engine advances the bracket as today. Friendlies unchanged.

## Year and season lifecycle

- **Year start** (rollover or first boot): `CurrentYear++`, `YearStartDay =
  CurrentDay`. For every competition, create a Season with `StartDay =
  YearStartDay + SeasonGapDays`, `EndDay = StartDay + windowDays` (or the last
  day of the year), a zeroed `Rankings` row per member, and for cup formats
  `RoundDays` plus the first-round draw / group fixtures.
- **Membership changes mid-season**: joining inserts a zero row (not allowed
  once a knockout has started); leaving cancels the club's proposed/accepted
  challenges and keeps its row.
- **Season close** (day passes `EndDay`): expire proposed challenges, cancel
  accepted-but-unplayed ones, then `finishSeason` reads the final table from
  `Rankings`, sets the winner, pays prizes, and runs promotion/relegation.
  Clubs under `minGamesToRank` can't win or be promoted, but can be relegated.
  `prolegate` takes that ordered list as input.
- **Year end** (day reaches `YearStartDay + YearLengthDays`): close any season
  still open, then run the existing year-end steps in the same order as
  `calendar.router.ts` does today: `updateAllPlayerDetailsForYear`,
  `deductWagesForYear`, `retireEligiblePlayersForYear`,
  `runYouthIntakeForYear`, `generateSeasonReport` (all re-keyed from the text
  `Year` to `YearNumber`). Then start the next year. With `AutoRollover` off the
  clock pauses here and the admin ends the year by hand.

## Calendar clock

Replace the jump-to-next-fixture logic in `advanceDayIfDone`:

- Advance **one day** at a time. Days with matches take `MatchdaySlotMinutes`,
  empty days `OffDaySlotMinutes`.
- Each day, before advancing: expire challenges past `RespondBy`, draw the
  next cup round if the previous one finished, run the AI and auto-accept pass, apply
  transfer windows from `TransferWindows`, close seasons past `EndDay`, and run
  year end at the boundary.

## AI clubs

Without a schedule, AI clubs play nothing unless they act. Each day, per
competition, for each AI-controlled club (`Clubs.UserId` null):

- **Respond**: accept incoming challenges unless fatigued (average squad fitness
  below a threshold, via `PlayerFitnessService`) or already at the daily cap.
  Accept ~85% by default, weighted by rating gap. Never let declines reach the
  forfeit threshold.
- **Propose**: if the club is under its pace target
  (`maxGamesPerSeason × elapsedFraction`), challenge one valid opponent, chosen
  by closest rating with some randomness.
- Deterministic heuristics first, per `docs/MANAGER-OWNER-MODE-PLAN.md`'s
  gatekeeper approach; no LLM calls in this loop.

## Human clubs

Human clubs get incoming challenges in the dashboard; if they don't respond
before `RespondBy` they get the normal expiry/forfeit rules.

A human club can set an auto-accept policy, evaluated in the daily pass and
immediately when a challenge arrives:

```ts
interface ChallengePolicy {
  autoAccept: boolean;
  competitionIds?: string[];  // limit to these competitions; omitted = all
  maxRatingGap?: number;      // only opponents within this Elo gap
  minSquadFitness?: number;   // skip if average squad fitness is below this (0-100)
  maxPerWeek?: number;        // stop auto-accepting after N accepted in 7 days
  declineOutsidePolicy: boolean; // false = leave for the user to decide
}
```

A challenge matching the policy is accepted exactly like a manual accept.
Auto-declines count toward the forfeit threshold. The policy never proposes
challenges.

## API (ts-rest, `packages/api-contract`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/competitions/:id/challenges` | Propose `{ challengerClubId, opponentClubId }`. |
| POST | `/challenges/:fixtureId/accept` | Accept; returns the scheduled day. |
| POST | `/challenges/:fixtureId/decline` | Decline. |
| POST | `/challenges/:fixtureId/cancel` | Challenger or admin withdraws a proposed one. |
| GET | `/clubs/:id/challenges?status=` | Incoming and outgoing challenges. |
| GET | `/competitions/:id/eligible-opponents?clubId=` | Opponents passing validation, plus ineligible ones with the failing rule. |
| GET | `/seasons/:id/rankings` | Ordered table + ranked/unranked split (+ groups). |
| GET | `/seasons/:id/bracket` | Knockout rounds and ties. |
| PUT | `/clubs/:id/challenge-policy` | Set or clear the auto-accept policy (own club only). |
| GET / PATCH | `/world/settings` | Year length, rollover, season gap, transfer windows, default rules (admin). |
| POST | `/world/end-year` | Admin: run year end now. |
| POST | `/seasons/:id/close` | Admin: close a season now. |
| PATCH | `/competitions/:id` | Existing; now takes `Format` and `Rules`. `Format` can't change during an active season. |

Removed: `startNextSeasonCycle`, `endSeasonCycle`, arrange/setup-days routes.

User-auth checks: a user may act only for their own club (`middleware/club.ts`).

## UI (`apps/fs-pro-client`, Vue 3 + Vuetify 3 + Pinia)

New components go in `src/components/open-play/`.

### New components

| Component | Purpose |
| --- | --- |
| `rankings-table.vue` | Season table. Columns: Pos, Club, P, W, D, L, GF, GA, GD, Pts, PPG, Rating (when `ranking = 'elo'`), Forfeits. A divider separates ranked clubs from clubs under `minGamesToRank`, which show a "needs N more" chip instead of a position. Promotion/relegation zones tinted. The user's club is highlighted. One table per group for group stages. Replaces `standings-component.vue` / `standings-scroller.vue`. |
| `season-window-bar.vue` | Day X of Y in the season, days left, and the user club's games played vs the `minGamesToRank` line and the pace target. |
| `challenge-card.vue` | One challenge: both crests, competition badge (reuse `calendar/competition-badge.vue`), ratings and ranking places, status chip, `RespondBy` countdown, and actions for the viewer (Accept / Decline for incoming, Cancel for outgoing proposed). Accepted shows the scheduled day. |
| `challenge-inbox.vue` | Tabs: Incoming, Outgoing, Upcoming (accepted challenges and cup fixtures), History. Filter by competition. Badge count on Incoming. |
| `challenge-dialog.vue` | Propose a challenge: pick competition, then an opponent from `eligible-opponents`. Ineligible clubs are greyed out with the failing rule ("played twice already", "cooldown: 6 days", "outside range"). Shows remaining open-challenge slots. |
| `challenge-policy-form.vue` | Edit `Clubs.ChallengePolicy`: auto-accept switch, competition multi-select, max rating gap, min squad fitness slider, max per week, "decline outside policy" switch. Explains that declines count toward forfeits. |
| `rules-form.vue` | Admin editor for competition rules (and the world default rules), prefilled with inherited values, a short help line per field. |
| `year-progress.vue` | Year N, day X of `YearLengthDays`, transfer windows and season windows drawn on one bar. |

### Changed screens

| Screen | Change |
| --- | --- |
| `views/user/dashboard.vue` | "Challenges" card (right column, above the season list): Incoming count, next 3 incoming as `challenge-card`s, "Challenge a club" button. The "League Standings" tabs become "Standings" and render `rankings-table` + `season-window-bar` (knockouts: `knockout-bracket`). `year-progress` in the header. |
| `components/user-dashboard/fixture-card.vue`, `day-fixtures-list.vue` | "Challenge" / "Cup" label; "Forfeit" instead of a score on forfeits. |
| `views/user/calendar/year-calendar.vue` | Driven by `YearLengthDays` instead of months of a real year. Empty days read "No matches. Open challenges: N" with a link to the inbox. Season windows, transfer windows and cup round days marked. |
| New `views/user/club/zones/challenges-zone.vue` (registered in `zones/index.ts`) | Full `challenge-inbox` plus `challenge-policy-form`. |
| `views/user/seasons/fixtures.vue` | Filter by competition; challenge fixtures list the challenger. |
| `views/misc/end-of-season.vue`, `views/user/history/season-history.vue` | Final table from `/seasons/:id/rankings`; "unranked (N games)" for clubs under the minimum. |
| `views/misc/end-of-year.vue` | Route becomes `/finish/year/:yearNumber`; content unchanged (season report). |
| `views/game/friendly-setup.vue` | Hint linking to "Challenge a club" when both clubs share a competition, since friendlies don't count. |
| `views/admin/competitions/competition-form.vue` | "Format" select (League / Knockout / Groups + knockout) replaces the Type → League/Cup/Tournament flag juggling. `NumberOfWeeks` removed. `rules-form` below. Format disabled during an active season. |
| `views/admin/competitions/view-competition.vue` | League: `season-window-bar`, `rankings-table`, and an admin list of all challenges with Cancel. Knockout / groups: existing `knockout-bracket` / `group-stage-view`, fed from the new endpoints. "Close season now" action. |
| `views/admin/seasons/view-season.vue` | Same table / bracket as above. |
| `views/admin/calendar/calendar.vue` → **World settings** | See below. |

### Admin: World settings (`views/admin/calendar/calendar.vue`)

Replaces the "Next step" season-cycle card, the "Year label" input and "Start
Next Season Cycle":

- **Clock**: unchanged (live/paused, match-day and off-day slot minutes,
  advance now). "Target day" jump stays.
- **Year**: `year-progress`, `YearLengthDays`, `AutoRollover` switch,
  `SeasonGapDays`, "End year now" (confirm dialog listing what will run).
- **Transfer windows**: editable list of day-of-year ranges; the existing
  open/close buttons stay as a manual override for the current window.
- **Default rules**: `rules-form` for `Calendars.DefaultRules`.
- **Seasons this year**: every competition's window, status, and "Close now".

### Realtime

Socket.IO events from the server (`realtime/io.ts`), consumed in a new Pinia
store `store/challenges.ts` (replacing the placeholder in `store/socket.ts`):

- `challenge:received`, `challenge:updated` (accepted, declined, expired,
  forfeited, cancelled, auto-accepted) → update inbox and badge, snackbar.
- `rankings:updated` `{ seasonId }` → refetch that table if it is on screen.
- `world:day`, `world:year-ended` → refresh `year-progress` and the dashboard.

Without sockets the inbox polls on dashboard focus.

### States to design for

- Club in no competition: hide the Challenges card.
- No eligible opponents: dialog says why (all on cooldown, cap reached, window
  closing).
- Season ended: inbox read-only for that competition, table shows "Final".
- Between seasons (`SeasonGapDays`): tables show last season's final, the
  Challenges card says when the next season opens.
- Auto-accept on: matching challenges show "Auto-accepted" in History.
- Mobile: tables scroll horizontally inside their card; cards stack.

## Migrating existing data

One-off script `src/scripts/migration/run-00xx-open-play.ts`, run once after
the schema migration. Take a DB backup first.

1. Refuse to run if any season is started and unfinished, unless `--abandon`
   is passed; with it, cancel that season's unplayed fixtures and mark it
   finished with no promotion.
2. Map `League`/`Cup`/`Tournament` → `Format`.
3. Convert finished seasons' `Standings` into `Rankings` rows (via the old
   `compileStandings`, inlined in the script) so history pages keep working.
4. Map text `Year` labels to `YearNumber` in order of `StartDate`; set
   `Calendars.CurrentYear` to the last one and start year `+1` at `CurrentDay`.
5. Seed `Clubs.Elo` at 1500.

Then drop the old columns in a follow-up migration once the script has run
everywhere.

## Removed

`RoundRobin` (league use), `generateWeekTable`, `generateFixtureObject`, `compileStandings`
(moved into the migration script), `arrangeSeasonFixturesAcrossDays`,
`hydrateSeasonFixtures`, `startNextSeasonCycle`, `endSeasonCycle`,
`updateStandings`, `batchUpdateStandings`, `finishSeasonPlain`,
`findNextUnplayedDay`, `standings-component.vue`, `standings-scroller.vue`.

Kept: `tournament-engine.service.ts` (cups stay pre-scheduled). `RoundRobin`
stays only if the group stage uses it; otherwise removed.

## Build order

1. `legacy/scheduled-seasons` branch + tag. DB backup.
2. Migration (new columns and tables; old ones kept) + rules defaults module.
3. `RankingService`: row init, `applyResult` (ledger, transaction, Elo),
   ordering. Wire into `game.controller.ts` and `matchday-runner.service.ts`.
4. Challenge service + scheduler + endpoints.
5. Year/season lifecycle: season start and close, year end, `prolegate` taking
   a ranked list.
6. Clock: day-by-day advance with the daily pass (expiry, cup round draws,
   transfer windows, season close, year end).
7. AI respond/propose pass; human auto-accept policy.
8. Cups: `RoundDays`, reserved cup days in the scheduler, group tables in
   `Rankings`.
9. Data migration script; then delete the removed code and drop old columns.
10. UI: rankings table, season window bar, year progress (read-only) → World
    settings admin → challenge inbox and dialog → policy form and rules form →
    socket events.

## Testing

- Unit: rule validation (each rule has a pass/fail case), ranking order per
  `ranking` type, Elo update, forfeit threshold, scheduler slot search.
- Idempotency: apply the same fixture result twice → counted once.
- Scripted sim (`src/scripts/`), all-AI, two full years → every club reaches
  ≥ `minGamesToRank`, no pair exceeds `maxVsSameOpponent`, no club plays twice
  on one day, no league match lands on a reserved cup day, every cup completes
  on its round days, seasons close,
  promotion runs, year end runs once per year, transfer windows open and close
  on their days.
- Migration script against a copy of a real DB: history pages show the same
  final tables before and after.

## Decisions

1. No coexistence: this branch replaces the scheduled system; legacy lives on
   a git branch.
2. `Clubs.Elo` is fed by competition results only (no friendlies).
3. A forfeit is recorded as a fixed 3-0 (goals count toward GF/GA/GD).
4. Human clubs can set an auto-accept policy (`Clubs.ChallengePolicy`).
5. A match counts for exactly one competition.
6. The year stays, as a fixed-length period that rolls over automatically;
   seasons are windows inside it.
7. Cups and tournaments stay pre-scheduled on fixed round days; only leagues
   use challenges. Cup days are reserved for clubs still in the cup.
