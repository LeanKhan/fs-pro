# Spec: Open-Play Competitions (rankings without pre-scheduled fixtures)

## Goal

Let clubs belong to several leagues and competitions at once and be ranked in each,
**without** a round-robin fixture list generated up front. Matches are arranged
on demand (challenges), and a season is a time window, not a fixture list.

The current scheduled system stays, unchanged, as **legacy mode**. Every
competition picks one mode; both run side by side on the same calendar.

## Terms

| Term | Meaning |
| --- | --- |
| Scheduled mode (legacy) | Current behaviour: round-robin / cup / group fixtures generated at season start and laid across days. |
| Open mode | New behaviour: no fixtures at season start; matches come from accepted challenges. |
| Challenge | A proposed match between two members of an open competition. Becomes a normal Fixture once accepted. |
| Window | An open season's `StartDay`..`EndDay` range on the global calendar. |
| Ranking row | One club's aggregate record in one open season. |

## Current system (what legacy mode is)

- `middleware/seasons.ts` `create()` builds every fixture at season start:
  `RoundRobin` for leagues, `TournamentEngineService.createCupInitialFixtures` /
  `createGroupStageInitialFixtures` for cups and tournaments.
- `controllers/calendar/calendar.controller.ts` `arrangeSeasonFixturesAcrossDays`
  gives every fixture a `ScheduledDay`/`ScheduledDate`.
- Standings live in `Seasons.Standings` as one table per week. Results are
  written into the week given by `fixture.Week`
  (`controllers/game/functions.ts` `updateStandings`, `batchUpdateStandings`)
  and summed by `utils/seasons.ts` `compileStandings`.
- `finishSeasonPlain` (`controllers/seasons/season.controller.ts`) refuses to
  finish until every fixture is played, then `prolegate` moves clubs between
  divisions.
- The clock (`services/calendar/calendar-clock.service.ts` →
  `calendar.service.ts` `advanceDayIfDone`) jumps `CurrentDay` straight to
  `findNextUnplayedDay`. **With no scheduled fixtures it never advances.**

None of this is removed. Open mode adds parallel paths and gates on
`Competition.Mode`.

## Data model changes

All additive; one Drizzle migration. Existing rows default to legacy.

### `Competitions`

| Column | Type | Notes |
| --- | --- | --- |
| `Mode` | text, not null, default `'scheduled'` | `'scheduled'` \| `'open'`. |
| `Rules` | jsonb, nullable | Open-mode rules (below). Ignored in scheduled mode. |

`NumberOfWeeks` stays not-null for legacy; open competitions store `0`.

### `Seasons`

| Column | Type | Notes |
| --- | --- | --- |
| `StartDay` | integer, nullable | Calendar `Day.Index` the window opens. Open mode only. |
| `EndDay` | integer, nullable | Last day matches may be played. Open mode only. |

`Standings` stays for legacy; open seasons leave it empty.

### `Fixtures`

| Column | Type | Notes |
| --- | --- | --- |
| `CompetitionId` | uuid FK → Competitions, nullable | Set on open-mode fixtures (legacy reaches it via Season). |
| `ChallengeStatus` | text, nullable | `proposed` \| `accepted` \| `declined` \| `expired` \| `forfeited` \| `cancelled`. Null for legacy and friendlies. |
| `ChallengerClubId` | uuid FK → Clubs, nullable | Who proposed it. |
| `ProposedAt` | timestamp, nullable | |
| `RespondBy` | integer, nullable | Last calendar day to accept before it expires. |

`Week` stays null for open fixtures. `Stage` = `'open-match'`. `Type` = `'league'`.
`ScheduledDay`/`ScheduledDate` are set only on acceptance.

A proposed challenge **is** a Fixture row (not a separate table), so acceptance
is a status flip plus a day assignment, and every downstream reader (runner,
replays, player/club match details) already understands it.

Index: `(CompetitionId, ChallengeStatus)`.

### New table `Rankings`

One row per (open season, club).

| Column | Type |
| --- | --- |
| `_id` | uuid PK |
| `SeasonId` | uuid FK → Seasons, not null |
| `CompetitionId` | uuid FK → Competitions, not null |
| `ClubId` | uuid FK → Clubs, not null |
| `Played`, `Wins`, `Draws`, `Losses`, `GF`, `GA`, `GD`, `Points` | integer, default 0 |
| `Forfeits` | integer, default 0 |
| `Rating` | real, default from rules (Elo) |
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

### Global club rating (optional, phase 5)

`Clubs.Elo` real, default 1500. Every competitive result (either mode) updates
it. Used for matchmaking and AI challenge choice, never for a competition's
table.

## Competition rules (`Competitions.Rules`)

```ts
interface OpenCompetitionRules {
  windowDays: number;            // season length, e.g. 120
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
  minDeclinesBeforeForfeit: number; // declines inside the window that turn into forfeits; default 3
  maxMatchesPerClubPerDay: number;  // default 1
  initialRating: number;         // default 1500
  eloK: number;                  // default 24
}
```

Defaults live in one module, `services/competitions/open-rules.ts`, merged over
whatever is stored.

### Ranking order

- `points`: Points, GD, GF, Wins. Rewards volume; only sensible with a tight
  `maxGamesPerSeason`.
- `ppg` (default): Points ÷ Played, then GD per game, then Played (more games
  first), then GF. Clubs under `minGamesToRank` sort below all ranked clubs.
- `elo`: `Rating` from that competition's own Elo, then Played.

## Challenge lifecycle

```
propose ──► proposed ──accept──► accepted ──(clock plays it)──► played
               │  │                   │
               │  └─decline─► declined (counts toward forfeit threshold)
               │                      └─ cancel (admin / club left comp) ─► cancelled
               └─ RespondBy passes ─► expired  (counts as a decline)
declines ≥ minDeclinesBeforeForfeit ─► next decline is recorded as forfeited:
  challenger gets a win (3-0 by default), decliner a loss + Forfeits++
```

### Validation on propose (all must pass)

1. Both clubs are members of the competition (`CompetitionClubs`).
2. The competition is `Mode = 'open'` and has an active season whose window
   covers today.
3. Not the same club. Neither club is over `maxGamesPerSeason`.
4. Pair count this season (played + accepted) < `maxVsSameOpponent`.
5. Last meeting was ≥ `rematchCooldownDays` ago.
6. Within `challengeRange` places of each other (skip while either is under
   `minGamesToRank`).
7. Challenger has < `maxOpenChallenges` proposed.
8. No existing proposed/accepted challenge between the pair in this competition.

### Accept

Find the first day ≥ `CurrentDay + 1` and ≤ `EndDay` where neither club already
has `maxMatchesPerClubPerDay` fixtures in **any** competition (both modes). Set
`ScheduledDay`/`ScheduledDate`, `ChallengeStatus = 'accepted'`. No slot → reject
the accept with a clear error.

Home side = challenged club (the challenger travels).

## Result writing

In `game.controller.ts` after a match, branch on the fixture:

- Friendly → unchanged.
- Legacy (Season with `Mode = 'scheduled'`) → unchanged `updateStandings` /
  `batchUpdateStandings`.
- Open (`fixture.CompetitionId` set, `Stage = 'open-match'`) → new
  `RankingService.applyResult(fixtureId)` (ledger + both rows + Elo, one
  transaction).

`matchday-runner.service.ts` splits its `fulfilledResults` the same way before
calling `batchUpdateStandings`.

## Season lifecycle (open mode)

- **Start**: `startNextSeasonCycle` skips fixture generation and arrangement for
  open competitions. It creates the Season with `StartDay = CurrentDay`,
  `EndDay = CurrentDay + windowDays`, and a zeroed `Rankings` row per member.
- **Membership changes mid-season**: joining inserts a zero row; leaving cancels
  the club's proposed/accepted challenges and keeps its row (marked in history).
- **Close**: when `CurrentDay > EndDay`: expire outstanding proposed challenges,
  cancel accepted-but-unplayed ones, then call a new `finishOpenSeason` that
  takes the table from `Rankings` instead of `compileStandings`. Clubs under
  `minGamesToRank` are not eligible for title or promotion, but can be relegated.
- **Promotion/relegation**: `prolegate` takes a standings list as input instead
  of reading `Season.Standings` itself, so both modes share it.
- `endSeasonCycle` (year-based) keeps working because open seasons still carry
  `Year`.

## Calendar clock

`advanceDayIfDone` currently returns `null` when there's no future scheduled
fixture, which stalls the world. Change:

- If any open season is active (`StartDay <= day <= EndDay`), advance **one day**
  when nothing is scheduled sooner, instead of stopping.
- Before advancing each day: expire challenges past `RespondBy`, close any open
  season whose `EndDay` has passed, and run the AI challenge pass (below).
- Legacy-only worlds behave exactly as today.

Off-day pacing uses the existing `OffDaySlotMinutes`.

## AI clubs

Without a schedule, AI clubs play nothing unless they act. On each day tick,
per open competition, for each AI-controlled club (`Clubs.UserId` null):

- **Respond**: accept incoming challenges unless fatigued (average squad fitness
  below a threshold, via `PlayerFitnessService`) or already at the daily cap.
  Accept ~85% by default, weighted by rating gap. Never let declines reach the
  forfeit threshold.
- **Propose**: if the club is under its pace target
  (`maxGamesPerSeason × elapsedFraction`), challenge one valid opponent, chosen
  by closest rating with some randomness.
- Deterministic heuristics first, per `docs/MANAGER-OWNER-MODE-PLAN.md`'s
  gatekeeper approach; no LLM calls in this loop.

Human clubs get incoming challenges in the dashboard; if they don't respond
before `RespondBy` they get the normal expiry/forfeit rules.

## API (ts-rest, `packages/api-contract`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/competitions/:id/challenges` | Propose `{ challengerClubId, opponentClubId }`. |
| POST | `/challenges/:fixtureId/accept` | Accept; returns the scheduled day. |
| POST | `/challenges/:fixtureId/decline` | Decline. |
| POST | `/challenges/:fixtureId/cancel` | Challenger or admin withdraws a proposed one. |
| GET | `/clubs/:id/challenges?status=` | Incoming and outgoing challenges. |
| GET | `/competitions/:id/eligible-opponents?clubId=` | Opponents passing validation right now. |
| GET | `/seasons/:id/rankings` | Ordered table + ranked/unranked split. |
| PATCH | `/competitions/:id` | Existing; now accepts `Mode` and `Rules`. |

User-auth checks: a user may act only for their own club (`middleware/club.ts`).

Changing `Mode` is only allowed when the competition has no active season.

## Client (`apps/fs-pro-client`)

- Rankings view for open seasons (reuse `standings-component.vue` layout;
  add Played-min badge and PPG column).
- Challenge inbox/outbox on the user dashboard, plus "Challenge" action from an
  opponent list backed by `eligible-opponents`.
- Competition admin form: Mode select + rules editor.
- Calendar/fixtures views: no change; accepted challenges are ordinary fixtures.

## Legacy mode guarantees

- `Mode` defaults to `'scheduled'`; no existing competition changes behaviour.
- `RoundRobin`, `arrangeSeasonFixturesAcrossDays`, `generateWeekTable`,
  `compileStandings`, `updateStandings`, `batchUpdateStandings`,
  `finishSeasonPlain`, and the tournament engine stay and keep being used
  for scheduled competitions.
- Cups and group tournaments stay scheduled-only. Open mode is for league-style
  ranking competitions.
- A club can be in a scheduled league and an open competition at the same time;
  the per-day match cap in "Accept" checks both modes.

## Build order

1. Migration: `Competitions.Mode/Rules`, `Seasons.StartDay/EndDay`, Fixture
   challenge columns, `Rankings`, `RankingResults`. Rules defaults module.
2. `RankingService`: row init, `applyResult` (ledger, transaction), ordering.
   Branch in `game.controller.ts` and `matchday-runner.service.ts`.
3. Challenge service + endpoints (propose/accept/decline/cancel/list/eligible).
4. Season start/close for open mode; refactor `prolegate` to take standings.
5. Clock: one-day advance while open seasons are active; expiry and close hooks.
6. AI respond/propose pass. Optional `Clubs.Elo`.
7. Client views.

## Testing

- Unit: rule validation (each rule has a pass/fail case), ranking order per
  `ranking` type, Elo update, forfeit threshold.
- Idempotency: apply the same fixture result twice → counted once.
- Scripted sim (`src/scripts/`): one open competition, all-AI, full window →
  every club reaches ≥ `minGamesToRank`, no pair exceeds `maxVsSameOpponent`,
  no club plays twice on one day, season closes, promotion runs.
- Regression: an existing scheduled-league season cycle runs start → finish →
  prolegate with identical results before and after the change.

## Open questions

1. Should the global `Clubs.Elo` feed legacy fixtures too, or open only?
2. Forfeit score: fixed 3-0, or no goals (points only)?
3. Should human clubs be able to set an auto-accept policy?
4. Can a match count for two open competitions both clubs share? This spec
   says no: one fixture, one competition.
