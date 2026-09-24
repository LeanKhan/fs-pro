# Spec: Open-Play Competitions (admin-built competitions, no pre-scheduled games)

## Goal

Competitions are built by the admin whenever they like ("Summer Rumble",
"Underdog Cup", "Coastal League"), each with its own entry conditions, format,
dates, win condition and rewards. Clubs enter the ones they're eligible for and
can be in several at once. **No game is ever scheduled in advance**: nothing is
known when the year starts, and matches only exist once a challenge is accepted
or a knockout round is drawn.

"Cup" is not a separate system. It's a competition whose format happens to be
knockout, groups, or a mix. League, group and knockout are the building blocks.

This **replaces** the scheduled system on this branch. No coexistence, no mode
flag.

## Legacy

The current scheduled system (fixed divisions, round-robin fixtures, week
tables, manual season cycles, pre-drawn cups) is preserved only in git:

- Before any of this merges, branch `legacy/scheduled-seasons` (and tag
  `legacy-scheduled-v1`) from the last `main` commit that has it.
- Switching back = checking out that branch against a database that was never
  migrated (or a restored backup). No in-app switch, no down migration.
- Legacy code is deleted on this branch once its replacement lands (see
  "Removed").

## Terms

| Term | Meaning |
| --- | --- |
| Competition | The admin's definition: name, entry conditions, stages, win condition, rewards. Reusable. |
| Edition | One run of a competition with its own dates, entrants, tables and winner ("Summer Rumble Y3"). Stored in the existing `Seasons` table. |
| Stage | One phase of an edition: `league`, `groups` or `knockout`. An edition has 1+ stages run in order. |
| Entry | A club registered in an edition. |
| Challenge | A proposed match inside a league or group stage. Becomes a normal Fixture once accepted. |
| Tie | A knockout pairing, drawn when its round opens, with a play-by deadline. |
| Year | Fixed run of `YearLengthDays` days. Only drives ageing, wages, retirement, youth intake, reports, transfer windows. Creates no competitions. |

## What changes from today

- Nothing is created at year or season start. `startNextSeasonCycle`,
  `endSeasonCycle`, `seedDefaultTournaments` and the text `Year` label go.
- No fixtures are generated up front: `RoundRobin`,
  `arrangeSeasonFixturesAcrossDays`, `createCupInitialFixtures`,
  `createGroupStageInitialFixtures` go. League/group matches come from
  challenges; knockout ties are drawn round by round from whoever is still in.
- Fixed divisions and automatic promotion/relegation go. A competition can
  still restrict entry by division or country, and can feed its top/bottom
  finishers into other competitions (see "Outcomes").
- `Seasons.Standings` week tables are replaced by a `Rankings` table.
- The clock advances day by day instead of jumping to the next scheduled
  fixture (with no schedule, `findNextUnplayedDay` would stall forever).

## Competition definition

Stored on `Competitions`. Everything the admin sets when building a
competition:

```ts
interface CompetitionDefinition {
  Name: string;                   // "Summer Rumble"
  Description?: string;
  Entry: EntryConditions;
  Stages: StageDefinition[];      // run in order; at least one
  WinCondition: WinCondition;     // how the edition's winner is decided
  Rewards: Rewards;
  Outcomes?: Outcome[];           // optional links to other competitions
  Recurrence?: { everyDays: number; registrationDays: number } | null; // auto-create the next edition
}

interface EntryConditions {
  mode: 'open' | 'invite';        // invite = admin picks, open = clubs register
  minClubs: number;               // edition is cancelled if not reached by registration close
  maxClubs: number | null;
  minElo?: number;  maxElo?: number;        // e.g. an underdog cup: maxElo 1400
  minRating?: number; maxRating?: number;   // Clubs.Rating
  countryIds?: string[];          // AddressCountryId filter
  requiresWinOf?: string[];       // competition ids: only past winners may enter
  excludesEntrantsOf?: string[];  // can't be in these at the same time
  entryFee?: number;              // taken from Budget on registration, refunded if cancelled
  lateEntryUntilDay?: number | null; // relative to start; league/groups stages only
}

type StageDefinition =
  | { type: 'league'; days: number; rules: LeagueRules; advance?: Advance }
  | { type: 'groups'; days: number; groupSize: number; rules: LeagueRules; advance: Advance }
  | { type: 'knockout'; legs: 1 | 2; tieDays: number; seeding: 'elo' | 'random' | 'previous-stage'; drawAtEnd: 'penalties' | 'higher-seed' | 'away-goals' };

interface Advance { top: number; perGroup?: boolean; bestRunnersUp?: number }

interface LeagueRules {
  metric: RankingMetric;          // what the table is ordered by
  tiebreakers: RankingMetric[];   // default ['gd', 'gf', 'wins']
  pointsForWin: number;           // default 3
  pointsForDraw: number;          // default 1
  minGamesToRank: number;         // default 10
  maxGames: number | null;        // per club in the stage
  maxVsSameOpponent: number;      // default 2
  rematchCooldownDays: number;    // default 14
  challengeRange: number;         // within N places (0 = any); default 5
  respondWithinDays: number;      // default 3
  maxOpenChallenges: number;      // default 3
  minDeclinesBeforeForfeit: number; // default 3
}

type RankingMetric =
  | 'points' | 'ppg' | 'wins' | 'win-rate' | 'gd' | 'gf' | 'ga-low'
  | 'clean-sheets' | 'unbeaten-run' | 'elo-gain' | 'played';

type WinCondition =
  | { type: 'final-stage' }                         // top of the last stage's table, or knockout winner (default)
  | { type: 'first-to'; metric: 'points' | 'wins' | 'gf'; target: number } // ends early when reached
  | { type: 'best-at-end'; metric: RankingMetric }  // e.g. most goals over the whole edition
  | { type: 'last-standing' };                      // knockout-only editions

interface Rewards {
  prizeMoney: { position: number; amount: number }[];
  participationFee?: number;      // paid per match played
  eloBonus?: number;              // added to the winner's Clubs.Elo
  trophy?: string;                // award name for the Awards table
}

type Outcome =
  | { type: 'qualify'; positions: [number, number]; targetCompetitionId: string } // top N get an invite to the next edition of X
  | { type: 'bar'; positions: [number, number]; targetCompetitionId: string; editions: number }; // bottom N can't enter X for K editions
```

Defaults live in `services/competitions/definition.ts` (code defaults, then
`Calendars.DefaultRules`, then the competition's own values), validated with
the same schema the API contract uses.

Examples:

- **Summer Rumble**: open entry, max 16, maxElo 1600; stage 1 `groups` (4 of
  4, 20 days, top 2 advance); stage 2 `knockout` (1 leg, 5 tie days, seeded by
  previous stage). Winner = final stage.
- **Goal Rush**: open entry, one `league` stage of 30 days, metric `gf`,
  maxGames 10. Winner = `best-at-end` `gf`.
- **First to Ten**: invite, one `league` stage, win condition `first-to` 10
  wins; ends the day someone gets there.

## Edition lifecycle

```
draft ──publish──► registration ──(close day, ≥ minClubs)──► running ──► finished
                          │                                    │
                          └──(< minClubs)──► cancelled         └─ admin cancel ─► cancelled
```

1. **Draft**: admin builds the competition and creates an edition with
   `RegistrationOpensDay`, `RegistrationClosesDay` and `StartDay`. Nothing is
   visible to clubs.
2. **Registration**: eligible clubs register (humans in the UI, AI clubs via
   the AI pass). Invite mode: the admin adds clubs; invited human clubs
   accept or decline. Entry fees are taken here.
3. **Start** (`StartDay`): if fewer than `minClubs`, cancel and refund.
   Otherwise zeroed `Rankings` rows are created and stage 1 opens. **This is
   the first moment any pairing can exist.**
4. **Stages** run in order. Each stage ends on its day limit (league/groups)
   or when its last tie is played (knockout); qualifiers per `advance` move on,
   the rest become `eliminated`.
5. **Finish**: when the last stage ends, or earlier if a `first-to` target is
   hit. Winner decided by `WinCondition`, rewards paid (`prize-money.service.ts`,
   `giveSeasonAwards`), outcomes applied, next edition created if `Recurrence`
   is set.

An edition never depends on the year: it can start and end on any day, and
run across a year boundary.

## Stages

### League stage (and group stages)

Challenges only; see "Challenges". The stage table is the `Rankings` rows for
that stage, ordered by `rules.metric` then `tiebreakers`; clubs under
`minGamesToRank` sort last and can't advance or win. When the stage's days run
out: expire proposed challenges, cancel accepted-but-unplayed ones, freeze the
table, apply `advance`.

### Groups stage

On the stage's first day, entrants are split into groups of `groupSize` (by
Elo pots, or random). Each group is a league stage where challenges are only
allowed within the group. `advance.perGroup` takes the top N of each group,
plus `bestRunnersUp` across groups.

### Knockout stage

Rounds are drawn **when the round opens**, from the clubs still in:

1. Round opens (first day of the stage, or the day after the previous round's
   last tie is played). Pair the remaining clubs per `seeding`; an odd club out
   gets a bye (highest seed).
2. Each tie is a Fixture with `PlayBy = today + tieDays` (two fixtures if
   `legs: 2`). The scheduler (below) puts it on the first day before `PlayBy`
   when both clubs are free. Higher seed at home.
3. A tie still unplayed on `PlayBy` is played that day; any accepted league
   challenge on that day for either club is moved to its next free day.
4. Draws resolve per `drawAtEnd`.
5. Round done → draw the next one. One club left → stage over.

## Challenges (league and group stages)

```
propose ──► proposed ──accept──► accepted ──(clock plays it)──► played
               │  │                   │
               │  └─decline─► declined (counts toward forfeit threshold)
               │                      └─ cancel (admin / club withdrew) ─► cancelled
               └─ RespondBy passes ─► expired  (counts as a decline)
declines ≥ minDeclinesBeforeForfeit ─► next decline is recorded as forfeited:
  challenger gets a 3-0 win, decliner a 0-3 loss + Forfeits++
```

### Validation on propose (all must pass)

1. Both clubs have an active entry in the edition, in the same stage (and
   group, for groups).
2. The stage is a league/groups stage and open today.
3. Not the same club. Neither is at `maxGames`.
4. Pair count in this stage (played + accepted) < `maxVsSameOpponent`.
5. Last meeting in this stage was ≥ `rematchCooldownDays` ago.
6. Within `challengeRange` places (skipped while either is under
   `minGamesToRank`).
7. Challenger has < `maxOpenChallenges` proposed.
8. No proposed/accepted challenge already between the pair in this edition.

### Scheduling

One scheduler for challenges and ties: first day ≥ `CurrentDay + 1` and before
the stage end (or `PlayBy`) where neither club has a fixture in **any**
competition. Knockout ties outrank challenges (see knockout step 3). No slot →
the accept is refused with the reason.

Home side for challenges = challenged club.

## Data model changes

One Drizzle migration plus a one-off data script.

### `Competitions` (definition)

| Column | Type | Notes |
| --- | --- | --- |
| `Description` | text, nullable | |
| `Entry` | jsonb, not null | `EntryConditions` |
| `Stages` | jsonb, not null | `StageDefinition[]` |
| `WinCondition` | jsonb, not null | |
| `Rewards` | jsonb, not null | |
| `Outcomes` | jsonb, nullable | |
| `Recurrence` | jsonb, nullable | |
| `Archived` | boolean, default false | Hidden from admin lists, editions kept. |

Dropped: `League`, `Cup`, `Tournament`, `Division`, `NumberOfTeams`,
`NumberOfWeeks`, `TeamsPromoted`, `TeamsRelegated`, `CountryId` (moves into
`Entry.countryIds`). `Type` kept as a free display label ("Cup", "League").

### `Seasons` (editions)

| Column | Type | Notes |
| --- | --- | --- |
| `Status` | text | now `draft` \| `registration` \| `running` \| `finished` \| `cancelled` |
| `EditionNumber` | integer, not null | Per competition, 1, 2, 3… `SeasonCode` = `<COMP>-E<n>`. |
| `RegistrationOpensDay`, `RegistrationClosesDay`, `StartDay` | integer, not null | |
| `EndDay` | integer, nullable | Set when finished. |
| `CurrentStage` | integer, not null, default 0 | |
| `StageStartedDay` | integer, nullable | |
| `Definition` | jsonb, not null | Snapshot of the competition definition at publish, so editing a competition never changes a running edition. |

Dropped: `Standings`, `Year`, `Promoted`, `Relegated`, `isStarted`,
`isFinished` (all derivable from `Status`).

### New table `Entries` (replaces `CompetitionClubs`)

| Column | Type |
| --- | --- |
| `_id` | uuid PK |
| `SeasonId` | uuid FK → Seasons |
| `ClubId` | uuid FK → Clubs |
| `Status` | `invited` \| `registered` \| `active` \| `eliminated` \| `withdrawn` |
| `Seed` | integer, nullable |
| `Group` | text, nullable |
| `FeePaid` | real, default 0 |
| `EliminatedAtStage` | integer, nullable |
| timestamps | |

Unique `(SeasonId, ClubId)`.

### `Fixtures`

| Column | Type | Notes |
| --- | --- | --- |
| `CompetitionId` | uuid FK, nullable | Null only for friendlies. |
| `StageIndex` | integer, nullable | |
| `Round` | integer, nullable | Knockout round (1 = first). |
| `Leg` | integer, nullable | 1 or 2. |
| `ChallengeStatus` | text, nullable | `proposed` \| `accepted` \| `declined` \| `expired` \| `forfeited` \| `cancelled` \| `played`. Null for ties and friendlies. |
| `ChallengerClubId` | uuid FK, nullable | |
| `ProposedAt` | timestamp, nullable | |
| `RespondBy` | integer, nullable | |
| `PlayBy` | integer, nullable | Knockout ties. |

Dropped: `Week`. `ScheduledDay`/`ScheduledDate` set when a challenge is
accepted or a tie is scheduled.

A challenge **is** a Fixture row, so every downstream reader (runner, replays,
match details) already understands it.

### New table `Rankings`

One row per (edition, stage, club).

| Column | Type |
| --- | --- |
| `_id` | uuid PK |
| `SeasonId`, `ClubId` | uuid FK |
| `StageIndex` | integer |
| `Group` | text, nullable |
| `Played`, `Wins`, `Draws`, `Losses`, `GF`, `GA`, `GD`, `Points`, `CleanSheets`, `Forfeits` | integer, default 0 |
| `UnbeatenRun`, `BestUnbeatenRun` | integer, default 0 |
| `EloStart` | real |
| `LastPlayedDay` | integer, nullable |

Unique `(SeasonId, StageIndex, ClubId)`. An edition-wide total (for
`best-at-end` win conditions) is summed across stages at read time.

### New table `RankingResults`

Idempotency ledger: `FixtureId` PK, `SeasonId`, `AppliedAt`. The result writer
inserts here and updates both rows and both clubs' Elo **in one transaction**;
a conflict means already applied.

### `Clubs`

| Column | Type | Notes |
| --- | --- | --- |
| `Elo` | real, not null, default 1500 | Updated by every competitive result; friendlies don't count. |
| `ChallengePolicy` | jsonb, nullable | Auto-accept policy (human clubs). |
| `EntryPolicy` | jsonb, nullable | Auto-register policy (human clubs, optional). |

`LeagueId`/`LeagueCode` (the single "primary league") are dropped; see
"Primary league" under open questions.

### `Calendars` (world settings)

| Column | Type | Notes |
| --- | --- | --- |
| `YearLengthDays` | integer, default 360 | |
| `CurrentYear` | integer, default 1 | |
| `YearStartDay` | integer, default 0 | |
| `AutoRollover` | boolean, default true | |
| `TransferWindows` | jsonb | `[{ fromDay, toDay }]` day-of-year ranges. |
| `DefaultRules` | jsonb, nullable | Defaults for new competitions. |

## Result writing

`RankingService.applyResult(fixtureId)` replaces
`updateStandings`/`batchUpdateStandings` in `game.controller.ts` and
`matchday-runner.service.ts`: ledger insert, both `Rankings` rows, both clubs'
Elo, then checks a `first-to` win condition. Knockout fixtures also update
`Rankings` (so goals/clean-sheets metrics work) and then resolve the tie.
Friendlies unchanged.

## Year

Only a timekeeping period. At `YearStartDay + YearLengthDays`: run the year-end
steps in today's order (`updateAllPlayerDetailsForYear`, `deductWagesForYear`,
`retireEligiblePlayersForYear`, `runYouthIntakeForYear`,
`generateSeasonReport`, re-keyed from the text `Year` to `CurrentYear`), then
`CurrentYear++`. Editions keep running across the boundary. With
`AutoRollover` off the clock pauses there for the admin.

The season report covers editions that **finished** during that year.

## Calendar clock

Replace the jump-to-next-fixture logic in `advanceDayIfDone`: advance one day
at a time (match days take `MatchdaySlotMinutes`, empty days
`OffDaySlotMinutes`). Daily pass, in order:

1. Edition transitions: open/close registration, start editions (or cancel
   under `minClubs`), end stages on their last day, open knockout rounds.
2. Expire challenges past `RespondBy`; play ties at `PlayBy`.
3. AI pass: register for editions, respond to and propose challenges.
   Human auto-accept / auto-register policies.
4. Transfer windows from `TransferWindows`.
5. Year end at the boundary.
6. Play the day's fixtures (`MatchdayRunnerService.simulateDay`).

## AI clubs

Each day, for each AI club (`Clubs.UserId` null):

- **Register**: for editions in registration that it's eligible for, register
  if it's in fewer than `maxConcurrentEntries` (world setting, default 3),
  the fee is under a share of `Budget`, and the competition suits it (Elo near
  the entry band's middle scores higher). Fill order is random so the same
  clubs don't take every slot.
- **Respond**: accept incoming challenges unless fatigued (average squad
  fitness under a threshold, via `PlayerFitnessService`) or busy that day;
  ~85% by default, weighted by rating gap; never let declines reach the
  forfeit threshold.
- **Propose**: if under its pace target for the stage (`maxGames` or the
  metric's needs × elapsed fraction), challenge one valid opponent chosen by
  closest Elo with some randomness.
- Deterministic heuristics only, per `docs/MANAGER-OWNER-MODE-PLAN.md`'s
  gatekeeper approach; no LLM calls in this loop.

## Human clubs

- Browse competitions in registration they're eligible for and register (fee
  shown up front), or accept an invite.
- Incoming challenges in the dashboard; unanswered by `RespondBy` → normal
  expiry/forfeit rules.
- **Auto-accept policy** (`Clubs.ChallengePolicy`), evaluated in the daily
  pass and when a challenge arrives:

  ```ts
  interface ChallengePolicy {
    autoAccept: boolean;
    competitionIds?: string[];     // omitted = all
    maxEloGap?: number;
    minSquadFitness?: number;      // 0-100
    maxPerWeek?: number;
    declineOutsidePolicy: boolean; // false = leave for the user
  }
  ```

  Auto-declines count toward the forfeit threshold. The policy never proposes.
- **Auto-register policy** (`Clubs.EntryPolicy`, optional): register for any
  eligible competition whose fee is under X and that doesn't overlap more than
  N current entries.

## API (ts-rest, `packages/api-contract`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST / PATCH | `/competitions`, `/competitions/:id` | Admin CRUD of definitions (validated). |
| POST | `/competitions/:id/editions` | Admin: create an edition with its registration and start days. |
| PATCH | `/editions/:id` | Admin: edit dates while in draft/registration; publish; cancel. |
| POST | `/editions/:id/invite` | Admin: invite clubs (invite mode). |
| GET | `/editions?status=registration&eligibleFor=:clubId` | Browse open competitions. |
| POST / DELETE | `/editions/:id/entries` | Register / withdraw a club (own club only). |
| POST | `/editions/:id/entries/:clubId/respond` | Accept or decline an invite. |
| GET | `/editions/:id` | Edition overview: stages, current stage, entries, status. |
| GET | `/editions/:id/rankings?stage=` | Table(s) for a stage, ranked/unranked split, groups. |
| GET | `/editions/:id/bracket` | Knockout rounds and ties. |
| POST | `/editions/:id/challenges` | Propose `{ challengerClubId, opponentClubId }`. |
| GET | `/editions/:id/eligible-opponents?clubId=` | Eligible opponents + ineligible ones with the failing rule. |
| POST | `/challenges/:fixtureId/accept` \| `decline` \| `cancel` | |
| GET | `/clubs/:id/challenges?status=` | Incoming/outgoing across all editions. |
| GET | `/clubs/:id/entries` | The club's current and past entries. |
| PUT | `/clubs/:id/challenge-policy`, `/clubs/:id/entry-policy` | Own club only. |
| GET / PATCH | `/world/settings` | Admin: year, rollover, transfer windows, default rules, AI entry cap. |
| POST | `/world/end-year` | Admin: run year end now. |

Removed: season-cycle start/end, arrange/setup-days, season create/start/finish
routes. User-auth checks: a user acts only for their own club
(`middleware/club.ts`).

## UI (`apps/fs-pro-client`, Vue 3 + Vuetify 3 + Pinia)

New components in `src/components/open-play/`.

### Admin

| Screen | Content |
| --- | --- |
| **Competition builder** (replaces `views/admin/competitions/competition-form.vue`) | Stepper: 1 Basics (name, label, description, badge) → 2 Entry (open/invite, min/max clubs, Elo/rating bands, countries, requires-win-of, exclusions, fee, late entry) → 3 Stages (add/reorder league, groups, knockout cards; each with its own days, rules, advance) → 4 Win condition → 5 Rewards (prize table, trophy, Elo bonus) → 6 Outcomes and recurrence → Review (plain-English summary, e.g. "16 clubs under 1600 Elo, 4 groups of 4 over 20 days, top 2 into a single-leg knockout"). Presets: "Classic league", "Knockout cup", "Groups + knockout", "Goal rush". |
| **Competitions list** (`views/admin/competitions/dashboard.vue`) | Definitions with their latest edition's status, "New edition", archive. |
| **Edition view** (`views/admin/competitions/view-competition.vue`) | Status timeline (registration → stages → finished), entries with invite/remove, current stage's table or bracket, all challenges with Cancel, "Cancel edition". |
| **New edition dialog** | Registration open/close days and start day on a mini calendar, with other editions' windows drawn for overlap. |
| **World settings** (`views/admin/calendar/calendar.vue`) | Clock (unchanged: live/paused, slot minutes, advance now, target day). Year: progress, `YearLengthDays`, auto-rollover, "End year now". Transfer window ranges (manual open/close override stays). Default rules. AI max concurrent entries. **Timeline**: every edition as a bar across the coming days, coloured by status. Removes the Year-label input and "Start Next Season Cycle". |

### User

| Screen | Content |
| --- | --- |
| New **Competitions** page (`views/user/competitions.vue`, nav item) | Tabs: Open for entry (eligible first, ineligible greyed with the reason; fee, dates, format summary, "Enter"), My competitions (active entries with stage and position), Past. |
| `views/user/dashboard.vue` | "My competitions" strip (one chip per active entry: name, stage, position, days left). "Challenges" card: incoming count, next 3 as `challenge-card`s, "Challenge a club". Standings tabs become one tab per active entry, rendering `rankings-table`, `group-tables` or `knockout-bracket` for the current stage. `year-progress` in the header. |
| New `views/user/club/zones/challenges-zone.vue` | `challenge-inbox`, `challenge-policy-form`, `entry-policy-form`. |
| `views/user/calendar/year-calendar.vue` | Built from `YearLengthDays`; shows the club's fixtures, tie deadlines, registration closing days for eligible competitions, and transfer windows. Empty days: "No matches. Open challenges: N". |
| `components/user-dashboard/fixture-card.vue`, `day-fixtures-list.vue` | Competition name + stage chip ("Summer Rumble · QF"), "Forfeit" instead of a score on forfeits, tie deadline for unscheduled ties. |
| `views/misc/end-of-season.vue` → **edition finished** screen | Route `/finish/edition/:id`: winner, final table/bracket, rewards paid. |
| `views/misc/end-of-year.vue` | Route `/finish/year/:number`; season report of editions finished that year. |
| `views/user/history/season-history.vue` | Past entries across all competitions, with finishing position or round reached. |
| `views/game/friendly-setup.vue` | Hint to challenge instead when both clubs share a league stage (friendlies don't count). |

### New components

| Component | Purpose |
| --- | --- |
| `rankings-table.vue` | Stage table. Columns follow the stage's metric and tiebreakers (e.g. a `gf` competition leads with GF). Ranked/unranked divider with "needs N more" chips, advance line, user club highlighted. Replaces `standings-component.vue` / `standings-scroller.vue`. |
| `group-tables.vue` | Grid of `rankings-table` per group, qualifying places marked. Replaces `group-stage-view.vue`. |
| `knockout-bracket.vue` | Existing component, fed from `/bracket`; undrawn rounds show "Drawn when round opens", unscheduled ties show their deadline. |
| `stage-timeline.vue` | An edition's stages as segments with today's position, days left in the stage. |
| `competition-card.vue` | Summary for browsing: name, format summary, entry band, fee, dates, spots left, eligibility reason. |
| `challenge-card.vue`, `challenge-inbox.vue`, `challenge-dialog.vue` | As before: challenge details and actions; inbox tabs Incoming / Outgoing / Upcoming (accepted challenges and ties) / History; dialog picks edition then opponent from `eligible-opponents` with reasons for ineligible clubs. |
| `challenge-policy-form.vue`, `entry-policy-form.vue` | Policy editors. |
| `stage-editor.vue`, `entry-conditions-form.vue`, `win-condition-form.vue`, `rewards-form.vue` | Builder steps. |
| `year-progress.vue` | Year N, day X of Y, transfer windows. |

### Realtime

Socket.IO (`realtime/io.ts`) → new Pinia store `store/competitions.ts`
(replacing the placeholder in `store/socket.ts`):

- `edition:updated` (registration opened/closed, started, stage changed,
  round drawn, finished, cancelled)
- `challenge:received`, `challenge:updated`
- `rankings:updated` `{ editionId, stage }`
- `world:day`, `world:year-ended`

Without sockets, poll on dashboard focus.

### States to design for

- No competitions open for entry: Competitions page says so and shows the next
  registration opening.
- Club in no active edition: dashboard shows "Enter a competition" instead of
  tables and challenges.
- Registration closed short of `minClubs`: entry shows "Cancelled, fee
  refunded".
- Eliminated: entry moves to Past with the round/stage reached.
- Knockout round not drawn yet / tie not scheduled yet.
- `first-to` finish: edition ends mid-stage with a banner.
- Mobile: tables scroll horizontally inside their card; cards stack.

## Migrating existing data

One-off script `src/scripts/migration/run-00xx-open-play.ts`, after the schema
migration. Back up first.

1. Refuse to run while any season is started and unfinished, unless
   `--abandon` (cancel unplayed fixtures, mark it `cancelled`).
2. Turn each existing competition into a definition: leagues → one `league`
   stage (metric `points`); cups → one `knockout` stage; tournaments → `groups`
   + `knockout`. Entry = `invite`, with the current `CompetitionClubs` members
   as the invite list for its next edition (created as `draft`, not
   published).
3. Finished seasons become finished editions: `EditionNumber` in `StartDate`
   order; `Standings` compiled (old `compileStandings`, inlined) into one
   `Rankings` stage; `CompetitionClubs` + fixtures → `Entries`.
4. `Calendars.CurrentYear` = number of distinct old `Year` labels + 1, starting
   at `CurrentDay`.
5. `Clubs.Elo` = 1500.

A follow-up migration drops the old columns and `CompetitionClubs`.

## Removed

`RoundRobin`, `generateWeekTable`, `generateFixtureObject`, `compileStandings`
(moved into the migration script), `middleware/seasons.ts` `create`,
`arrangeSeasonFixturesAcrossDays`, `hydrateSeasonFixtures`,
`startNextSeasonCycle`, `endSeasonCycle`, `prolegate`, `updateStandings`,
`batchUpdateStandings`, `finishSeasonPlain`, `findNextUnplayedDay`,
`TournamentEngineService.seedDefaultTournaments`,
`createCupInitialFixtures`, `createGroupStageInitialFixtures`,
`computeContinentalQualifiers` (its bracket/pairing helpers are reused by the
knockout stage), `standings-component.vue`, `standings-scroller.vue`,
`group-stage-view.vue`.

## Build order

1. `legacy/scheduled-seasons` branch + tag. DB backup.
2. Migration (new columns/tables; old ones kept) + definition schema and
   defaults module, shared with `packages/api-contract`.
3. `RankingService` (`applyResult`, ledger, Elo, metrics, ordering, first-to).
4. Edition lifecycle: create, publish, registration, entries, start/cancel,
   stage transitions, finish with rewards and outcomes, recurrence.
5. Scheduler + challenges + endpoints.
6. Knockout stage (round draw, ties, deadlines, legs) and groups stage.
7. Clock: day-by-day daily pass; year end re-keyed to `CurrentYear`.
8. AI register/respond/propose; human policies.
9. Data migration script; delete removed code; drop old columns.
10. UI: rankings/group/bracket read-only views and dashboard → admin
    competition builder and edition view → World settings → Competitions page
    and entry flow → challenges → policies → socket events.

## Testing

- Definition validation: every field's bounds; impossible setups rejected
  (knockout after a stage that advances 1 club, groups larger than max clubs,
  `first-to` on a knockout-only edition).
- Rankings: ordering for every metric and tiebreaker; unranked split;
  `first-to` ends the edition the same day.
- Idempotency: apply the same result twice → counted once.
- Knockout: byes with odd counts, two-leg aggregate, draw resolution, tie at
  `PlayBy` bumps a conflicting challenge.
- Scripted sim (`src/scripts/`), all-AI, two years, the four example
  competitions plus overlapping editions: registrations fill, no club plays
  twice in a day, no pair exceeds `maxVsSameOpponent`, every stage ends on
  time, every edition finishes or is cancelled, rewards paid once, year end
  runs once per year.
- Migration script against a copy of a real DB: history pages show the same
  final tables before and after.

## Decisions

1. No coexistence: this branch replaces the scheduled system; legacy lives on
   a git branch.
2. Competitions are admin-built at any time, each with its own entry
   conditions, stages, win condition and rewards; nothing is created at year
   start.
3. Cup is a label, not a system: league, groups and knockout are stage types
   any competition can combine.
4. No game exists before it's needed: league/group matches come from accepted
   challenges; knockout ties are drawn when their round opens, from the clubs
   still in.
5. `Clubs.Elo` is fed by competitive results only (no friendlies).
6. A forfeit is recorded as a fixed 3-0.
7. Human clubs can set auto-accept (and optional auto-register) policies.
8. A match counts for exactly one competition.
9. The year stays as a fixed-length timekeeping period that rolls over
   automatically; editions run independently of it.

## Open questions

1. **Primary league.** `Clubs.LeagueId` feeds the board budget
   (`services/ai/board-budget.service.ts`) and club performance analytics.
   Without fixed divisions, what does the board judge a club on: average
   finishing position across all entries, Elo change over the year, or a
   competition the club marks as its main one?
2. **Promotion/relegation.** Should `Outcomes` also be able to move clubs
   between tiered competitions automatically (a real ladder), or is
   qualify/bar enough?
3. **Entry fees and budget.** Should the board block entries the club can't
   afford, or allow going negative?
4. **Concurrent entry cap for humans.** Same `maxConcurrentEntries` as AI, or
   unlimited?
