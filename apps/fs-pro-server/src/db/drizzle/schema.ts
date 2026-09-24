import { sql } from 'drizzle-orm';
import { numeric, real } from 'drizzle-orm/pg-core';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import type {
  CompetitionDefinition,
  EntryConditions,
  LeagueRules,
  Outcome,
  Recurrence,
  Rewards,
  StageDefinition,
  WinCondition,
} from '@repo/api-contract';

/** Clubs.Form: recent results, most recent first. */
export interface ClubForm {
  recent: ('W' | 'D' | 'L')[];
  streak: { type: 'W' | 'D' | 'L'; length: number } | null;
}

const timestamps = {
  createdAt: timestamp('createdAt', { precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
};

/**
 * For "list of ids" fields that have no single FK-able owner column to hang
 * a `relations()` reverse lookup off (see schema notes on Seasons.Promoted/
 * Relegated below) - typed as uuid so the values are at least shaped like
 * the ids they hold, but deliberately not `.references()`'d since Postgres
 * can't enforce a foreign key on individual array elements anyway.
 */
const uuidArray = (name: string) =>
  uuid(name)
    .array()
    .notNull()
    .default(sql`ARRAY[]::uuid[]`);

const jsonArray = (name: string) =>
  jsonb(name)
    .$type<Record<string, unknown>[]>()
    .notNull()
    .default(sql`'[]'::jsonb`);

export const places = pgTable('Places', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Fullname: text('Fullname').notNull(),
  Name: text('Name').notNull(),
  Code: text('Code').notNull().unique(),
  Region: text('Region'),
  Type: text('Type'),
  Picture: text('Picture'),
  /** Universal entity id of the matching `country` place in the Imaginations world. */
  entity_id: text('entity_id').unique(),
  /** Latest world revision seen at the last sync; a higher world revision means this snapshot is stale. */
  WorldRevision: integer('WorldRevision'),
  WorldSyncedAt: timestamp('WorldSyncedAt', { withTimezone: true }),
  /** The world no longer knows this place (deleted); last known values are kept. */
  WorldStale: boolean('WorldStale').notNull().default(false),
  ...timestamps,
});

export const users = pgTable('Users', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  FullName: text('FullName').notNull(),
  Password: text('Password').notNull(),
  Age: integer('Age'),
  Username: text('Username').notNull().unique(),
  Avatar: text('Avatar').notNull().default('default-avatar.png'),
  Alerts: jsonb('Alerts').$type<Record<string, unknown> | null>(),
  isAdmin: boolean('isAdmin').notNull().default(false),
  Session: text('Session'),
  /** The imagination account this user signs in as (its accounts.id). Null for
   * users who have not moved to imagination login yet. */
  accountId: text('accountId').unique(),
  ...timestamps,
  // Clubs (array of owned club ids) dropped - it's the exact inverse of
  // clubs.User below. See clubsRelations.user / usersRelations.clubs.
});

export const managers = pgTable('Managers', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Key: text('Key').notNull().unique(),
  FirstName: text('FirstName').notNull(),
  LastName: text('LastName').notNull(),
  Age: integer('Age').notNull(),
  Picture: text('Picture'),
  ClubId: uuid('ClubId').references((): AnyPgColumn => clubs.id),
  PreferredFormation: text('PreferredFormation'),
  PreferredStyle: text('PreferredStyle'),
  NationalityId: uuid('NationalityId').references(() => places.id),
  NationalTeam: boolean('NationalTeam').notNull().default(false),
  Records: jsonArray('Records'),
  isEmployed: boolean('isEmployed').notNull().default(false),
  ...timestamps,
});

export const competitions = pgTable('Competitions', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Name: text('Name').notNull(),
  Type: text('Type').notNull(),
  CompetitionCode: text('CompetitionCode').notNull().unique(),
  CompetitionID: text('CompetitionID').notNull().unique(),
  League: boolean('League').notNull().default(false),
  Tournament: boolean('Tournament').notNull().default(false),
  Cup: boolean('Cup').notNull().default(false),
  Division: integer('Division').notNull().default(0),
  NumberOfTeams: integer('NumberOfTeams').notNull(),
  NumberOfWeeks: integer('NumberOfWeeks').notNull(),
  /** League pyramid position (services/competitions/pyramid-config.ts): Tier
   * 1 = top flight, higher = lower; Pod = which parallel league within the
   * tier. Both null for cups/tournaments and for any league not yet placed
   * in the pyramid (those keep the legacy two-division promotion rules).
   * Deliberately separate from Division, which is 0 for every cup. */
  Tier: integer('Tier'),
  Pod: integer('Pod'),
  TeamsPromoted: integer('TeamsPromoted'),
  TeamsRelegated: integer('TeamsRelegated'),
  CountryId: uuid('CountryId').references(() => places.id),
  /** Open-play definition (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Shapes and
   * defaults: services/competitions/definition.ts. Nullable until the data
   * script has filled every row; the League/Cup/Division/Tier... columns
   * above are legacy and get dropped after it. */
  Description: text('Description'),
  Prestige: integer('Prestige').notNull().default(2),
  Entry: jsonb('Entry').$type<EntryConditions | null>(),
  Stages: jsonb('Stages').$type<StageDefinition[] | null>(),
  WinCondition: jsonb('WinCondition').$type<WinCondition | null>(),
  Rewards: jsonb('Rewards').$type<Rewards | null>(),
  Outcomes: jsonb('Outcomes').$type<Outcome[] | null>(),
  Recurrence: jsonb('Recurrence').$type<Recurrence | null>(),
  Archived: boolean('Archived').notNull().default(false),
  ...timestamps,
  // Clubs dropped in favor of the competitionClubs join table below (a club
  // can sit in more than one competition at once - its league AND a cup -
  // so a single FK column on either side can't express it).
  // Seasons dropped - it's the exact inverse of seasons.Competition below.
});

/**
 * Join table for Competitions<->Clubs. Genuinely many-to-many: a club's
 * `League` FK (below) only ever points at its one primary league, but a
 * Cup/Tournament's member list can and does pull clubs from several
 * different leagues at once, and a club can simultaneously appear in its
 * league's member list and a cup's. Replaces the old `competitions.Clubs`
 * array, which could hold ids but never enforce they existed.
 */
export const competitionClubs = pgTable(
  'CompetitionClubs',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    CompetitionId: uuid('CompetitionId')
      .notNull()
      .references(() => competitions.id),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    ...timestamps,
  },
  (t) => [unique().on(t.CompetitionId, t.ClubId)]
);

export const clubs = pgTable('Clubs', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Name: text('Name').notNull().unique(),
  ClubCode: text('ClubCode').notNull().unique(),
  AttackingClass: real('AttackingClass'),
  DefensiveClass: real('DefensiveClass'),
  Rating: real('Rating').notNull().default(0.0),
  GK_Rating: real('GK_Rating').notNull().default(0.0),
  ATT_Rating: real('ATT_Rating').notNull().default(0.0),
  DEF_Rating: real('DEF_Rating').notNull().default(0.0),
  MID_Rating: real('MID_Rating').notNull().default(0.0),
  ManagerId: uuid('ManagerId').references(() => managers.id),
  assets: jsonb('assets').$type<Record<string, unknown> | null>(),
  Stats: jsonb('Stats').$type<Record<string, unknown> | null>(),
  /** Section/City only now - Country moved to its own FK column below (it
   * was the one part of this blob that was ever a real Mongo ref). Its
   * raw `Country` sub-field is legacy/unused going forward - the FK lives
   * only in AddressCountryId now, never mutated in place. */
  Address: jsonb('Address').$type<Record<string, unknown> | null>(),
  AddressCountryId: uuid('AddressCountryId').references(() => places.id),
  /** A club's transaction/transfer history now lives in the real
   * TransferLedger table (query by BuyerClubId/SellerClubId) - this used to
   * be a dead `Transactions` jsonb column, dropped since nothing ever read
   * or wrote it. */
  Budget: real('Budget'),
  Records: jsonArray('Records'),
  Stadium: jsonb('Stadium').$type<Record<string, unknown> | null>(),
  LeagueCode: text('LeagueCode'),
  LeagueId: uuid('LeagueId').references(() => competitions.id),
  UserId: uuid('UserId').references(() => users.id),
  Lineup: jsonb('Lineup').$type<{ startingXI: string[]; bench: string[] } | null>(),
  Tactic: jsonb('Tactic').$type<{ formationName: string; styleName: string } | null>(),
  Finances: jsonb('Finances').$type<Record<string, unknown> | null>(),
  /** Universal entity id of the club in the Imaginations world. */
  entity_id: text('entity_id'),
  /** Imagination world place UUID – the club's home city/HQ polygon on the world map. */
  homePlaceId: text('homePlaceId'),
  /** Imagination world place UUID – the stadium polygon on the world map. */
  stadiumPlaceId: text('stadiumPlaceId'),
  /** Club XP earned from matches/challenges (services/play/play.service.ts);
   * Club Level is derived from it. */
  XP: integer('XP').notNull().default(0),
  /** World standing, moved by every result through services/world/
   * club-standing.service.ts's applyMatchOutcome (the one seam, called from
   * game/functions.ts's updateFixture). Fans drive attendance, Reputation
   * gates the transfer market, BoardConfidence gates budget requests. */
  Fans: integer('Fans').notNull().default(0),
  Reputation: integer('Reputation').notNull().default(0),
  BoardConfidence: integer('BoardConfidence').notNull().default(60),
  Form: jsonb('Form').$type<ClubForm | null>(),
  /** Competitive Elo: every competition result moves it, friendlies don't. */
  Elo: real('Elo').notNull().default(1500),
  /** Human clubs' auto-accept / auto-register policies (null = manual). */
  ChallengePolicy: jsonb('ChallengePolicy').$type<Record<
    string,
    unknown
  > | null>(),
  EntryPolicy: jsonb('EntryPolicy').$type<Record<string, unknown> | null>(),
  /** Campus scene variant: 'city' | 'coastal' | 'hillside'. */
  CampusLayout: text('CampusLayout'),
  ...timestamps,
  // Players dropped - it's the exact inverse of players.Club below.
});

/**
 * One perpetual timeline shared by the whole game world (no multi-tenancy
 * anywhere - Clubs are globally unique, only claimed by Users via a nullable
 * FK), so there's exactly one row here, ever - not one per real-world year
 * the way Mongo's Calendar was. `singleton` exists purely to carry a real
 * UNIQUE constraint enforcing that at the database level; nothing ever sets
 * it to anything but `true`. `calendar.service.ts`'s `getCalendar()` is the
 * only code that should read/write this table.
 */
export const calendars = pgTable('Calendars', {
  id: uuid('_id').primaryKey().defaultRandom(),
  singleton: boolean('singleton').notNull().default(true).unique(),
  CurrentDay: integer('CurrentDay').notNull().default(0),
  CurrentDate: timestamp('CurrentDate', { precision: 3 }).notNull(),
  /** Transfer window: purchases and bids are refused while it is closed.
   * `TransferWindowClosesDay` is the last game day it stays open (null = open
   * until closed explicitly / by the next cycle's scheduling). See
   * services/transfers/transfer-window.service.ts. */
  TransferWindowOpen: boolean('TransferWindowOpen').notNull().default(false),
  TransferWindowClosesDay: integer('TransferWindowClosesDay'),
  /** Live clock (services/calendar/calendar-clock.service.ts): 'live' = the
   * server advances the day on its own at NextTickAt; 'paused' = only admin
   * actions move it. NextTickAt doubles as a short lease while a tick runs. */
  ClockMode: text('ClockMode').notNull().default('paused'),
  NextTickAt: timestamp('NextTickAt', { precision: 3 }),
  LastTickAt: timestamp('LastTickAt', { precision: 3 }),
  /** Real minutes a match day lasts, plus per skipped off-day in the gap. */
  MatchdaySlotMinutes: integer('MatchdaySlotMinutes').notNull().default(180),
  OffDaySlotMinutes: integer('OffDaySlotMinutes').notNull().default(10),
  /** World settings (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). The year is a
   * fixed run of days that only drives ageing, wages, retirement, youth
   * intake, reports and transfer windows. */
  YearLengthDays: integer('YearLengthDays').notNull().default(360),
  CurrentYear: integer('CurrentYear').notNull().default(1),
  YearStartDay: integer('YearStartDay').notNull().default(0),
  AutoRollover: boolean('AutoRollover').notNull().default(true),
  /** Day-of-year ranges the transfer window is open. */
  TransferWindows: jsonb('TransferWindows')
    .$type<{ fromDay: number; toDay: number }[]>()
    .notNull()
    .default(
      sql`'[{"fromDay":1,"toDay":30},{"fromDay":180,"toDay":210}]'::jsonb`
    ),
  DefaultRules: jsonb('DefaultRules').$type<Partial<LeagueRules> | null>(),
  /** XP needed for each Level, ascending (index 0 = Level 1). */
  LevelThresholds: jsonb('LevelThresholds').$type<number[] | null>(),
  XPPerMatch: jsonb('XPPerMatch').$type<{
    win: number;
    draw: number;
    loss: number;
  } | null>(),
  /** Board's expected performance score per Level (index 0 = Level 1). */
  LevelTargets: jsonb('LevelTargets').$type<number[] | null>(),
  LevelReview: jsonb('LevelReview').$type<{
    enabled: boolean;
    promoteCount: number;
    relegateCount: number;
  } | null>(),
  MaxConcurrentEntries: integer('MaxConcurrentEntries').notNull().default(3),
  ...timestamps,
});

/**
 * Sparse - a row only exists for a day that actually needs one (a real,
 * non-match calendar event). Matches are no longer embedded here at all
 * (see fixtures.ScheduledDay/ScheduledDate below) - that was the entire
 * reason `day.service.ts` needed jsonb-array workarounds for every query
 * the calendar/game loop made. `Index` is a global absolute day number
 * (counts up forever from the start of the game world), not scoped to any
 * particular year.
 */
export const days = pgTable('Days', {
  id: uuid('_id').primaryKey().defaultRandom(),
  Index: integer('Index').notNull().unique(),
  Date: timestamp('Date', { precision: 3 }).notNull(),
  Events: jsonArray('Events'),
  ...timestamps,
});

export const seasons = pgTable(
  'Seasons',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    SeasonCode: text('SeasonCode').notNull().unique(),
    Title: text('Title').notNull(),
    StartDate: timestamp('StartDate', { precision: 3 }).notNull(),
    EndDate: timestamp('EndDate', { precision: 3 }).notNull(),
    WinnerId: uuid('WinnerId').references(() => clubs.id),
    /** Episodic historical snapshots (which clubs were promoted/relegated at
     * the end of this season) - there's no natural single "many"-side owner
     * column on Clubs to hang a relations() reverse lookup off without
     * inventing new schema concepts, so these stay untyped uuid arrays
     * (no referential integrity on the elements) rather than a join table.
     * Deliberate scope cut, not an oversight. */
    Promoted: uuidArray('Promoted'),
    Relegated: uuidArray('Relegated'),
    isFinished: boolean('isFinished').notNull().default(false),
    isStarted: boolean('isStarted').notNull().default(false),
    Status: text('Status').notNull().default('Pending'),
    /** The game-world "year cycle" this season belongs to (was
     * `Calendar`-derived - a singleton Calendar has nothing left to derive it
     * from, so callers pass it directly - see `calendar.controller.ts`'s
     * `startNextSeasonCycle`). */
    Year: text('Year'),
    CompetitionId: uuid('CompetitionId').references(() => competitions.id),
    CompetitionCode: text('CompetitionCode').notNull(),
    Standings: jsonArray('Standings'),
    Logs: jsonArray('Logs'),
    /** Edition fields (open play). Status moves draft -> registration ->
     * running -> finished | cancelled. Days are Calendar Day.Index values.
     * Definition is the competition's definition snapshotted at publish, so
     * editing a competition never changes a running edition. */
    EditionNumber: integer('EditionNumber'),
    RegistrationOpensDay: integer('RegistrationOpensDay'),
    RegistrationClosesDay: integer('RegistrationClosesDay'),
    StartDay: integer('StartDay'),
    EndDay: integer('EndDay'),
    CurrentStage: integer('CurrentStage').notNull().default(0),
    StageStartedDay: integer('StageStartedDay'),
    Definition: jsonb('Definition').$type<CompetitionDefinition | null>(),
    ...timestamps,
    // Fixtures dropped - it's the exact inverse of fixtures.Season below.
    // Calendar dropped - redundant once Calendar is a singleton.
  },
  (t) => [
    unique('seasons_competition_edition_uq').on(
      t.CompetitionId,
      t.EditionNumber
    ),
    index('seasons_status_idx').on(t.Status),
  ]
);

/** A club registered in an edition. Replaces CompetitionClubs. Status:
 * invited | registered | active | eliminated | withdrawn. */
export const entries = pgTable(
  'Entries',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    SeasonId: uuid('SeasonId')
      .notNull()
      .references(() => seasons.id),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    Status: text('Status').notNull().default('registered'),
    Seed: integer('Seed'),
    Group: text('Group'),
    FeePaid: real('FeePaid').notNull().default(0),
    EliminatedAtStage: integer('EliminatedAtStage'),
    ...timestamps,
  },
  (t) => [
    unique('entries_season_club_uq').on(t.SeasonId, t.ClubId),
    index('entries_club_status_idx').on(t.ClubId, t.Status),
  ]
);

/** One club's record in one stage of an edition. Its position in the
 * stage's table is the club's Rank. */
export const rankings = pgTable(
  'Rankings',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    SeasonId: uuid('SeasonId')
      .notNull()
      .references(() => seasons.id),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    StageIndex: integer('StageIndex').notNull().default(0),
    Group: text('Group'),
    Played: integer('Played').notNull().default(0),
    Wins: integer('Wins').notNull().default(0),
    Draws: integer('Draws').notNull().default(0),
    Losses: integer('Losses').notNull().default(0),
    GF: integer('GF').notNull().default(0),
    GA: integer('GA').notNull().default(0),
    GD: integer('GD').notNull().default(0),
    Points: integer('Points').notNull().default(0),
    CleanSheets: integer('CleanSheets').notNull().default(0),
    Forfeits: integer('Forfeits').notNull().default(0),
    UnbeatenRun: integer('UnbeatenRun').notNull().default(0),
    BestUnbeatenRun: integer('BestUnbeatenRun').notNull().default(0),
    EloStart: real('EloStart').notNull().default(1500),
    LastPlayedDay: integer('LastPlayedDay'),
    ...timestamps,
  },
  (t) => [
    unique('rankings_season_stage_club_uq').on(
      t.SeasonId,
      t.StageIndex,
      t.ClubId
    ),
  ]
);

export const players = pgTable('Players', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  FirstName: text('FirstName').notNull(),
  LastName: text('LastName').notNull(),
  NationalityId: uuid('NationalityId').references(() => places.id),
  Age: integer('Age'),
  PlayerID: text('PlayerID').unique(),
  Position: text('Position'),
  Role: text('Role'),
  PositionNumber: integer('PositionNumber'),
  Attributes: jsonb('Attributes').$type<Record<string, unknown> | null>(),
  Rating: real('Rating'),
  ShirtNumber: text('ShirtNumber'),
  Value: real('Value'),
  /** Annual wage, deducted from the owning Club's Budget once per game Year
   * (see transfers/transfer.service.ts's deductWagesForYear, called from
   * calendar.router.ts's endSeasonCycle). Null is treated as 0. */
  Wage: real('Wage'),
  Form: real('Form').notNull().default(6),
  isReserve: boolean('isReserve').notNull().default(false),
  /** Avatars are now generated on demand from worldgen-service, keyed by
   * this row's own _id (see controllers/players/player-face.router.ts) -
   * deterministic and cacheable, nothing to store here anymore. This used
   * to be a dead `Appearance` jsonb column (one PNG-layer-composite asset
   * per feature existed, no real picker ever wrote to it, always null on
   * every real row) - dropped. */
  RatingsHistory: jsonArray('RatingsHistory'),
  isSigned: boolean('isSigned').notNull().default(false),
  /** Set once by yearly age-based retirement (see
   * controllers/players/player-lifecycle.service.ts's
   * retireEligiblePlayersForYear). Never unset - matches this codebase's
   * never-hard-delete philosophy for historical entities. A retired
   * Player's row/RatingsHistory/match-stats stay; they're just excluded
   * from every "active player" read path by default (see
   * DrizzlePlayerRepository.findAll) and can never be transferred again
   * (see transfers/transfer.service.ts's executePurchase guard). */
  isRetired: boolean('isRetired').notNull().default(false),
  /** Manager-chosen yearly training focus - one of TRAINING_CATEGORIES
   * (player-training.service.ts). Null means "no explicit choice, use the
   * Position-based auto-default" - NOT "no training", see that file's
   * effectiveTrainingCategory(). Settable via the same generic
   * POST /players/:id/update route as isRetired - no dedicated route, see
   * player-training.service.ts's doc comment for why. */
  TrainingFocus: text('TrainingFocus'),
  Fitness: real('Fitness').notNull().default(100),
  Injury: jsonb('Injury').$type<{ type: string; daysRemaining: number } | null>(),
  ClubCode: text('ClubCode'),
  ClubId: uuid('ClubId').references(() => clubs.id),
  isTransferListed: boolean('isTransferListed').notNull().default(false),
  AskingPrice: real('AskingPrice'),
  Morale: text('Morale'),
  /** 0-100, moved by results (club-standing.service.ts) and read by the match
   * sim as a small bounded Rating nudge. `Morale` above is a legacy label. */
  MoraleValue: integer('MoraleValue').notNull().default(60),
  isYouth: boolean('isYouth').notNull().default(false),
  ...timestamps,
});

export const fixtures = pgTable(
  'Fixtures',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    mongoId: text('mongoId').unique(),
    Title: text('Title'),
    FixtureCode: text('FixtureCode'),
    SeasonCode: text('SeasonCode'),
    LeagueCode: text('LeagueCode'),
    Week: integer('Week'),
    SeasonId: uuid('SeasonId').references(() => seasons.id),
    Stadium: text('Stadium'),
    Played: boolean('Played').notNull().default(false),
    Tie: text('Tie'),
    Stage: text('Stage').notNull().default('lg-match'),
    ReverseFixtureId: uuid('ReverseFixtureId').references(
      (): AnyPgColumn => fixtures.id
    ),
    PlayedAt: timestamp('PlayedAt', { precision: 3 }),
    Home: text('Home'),
    Away: text('Away'),
    HomeTeamId: uuid('HomeTeamId').references(() => clubs.id),
    AwayTeamId: uuid('AwayTeamId').references(() => clubs.id),
    Details: jsonb('Details').$type<Record<string, unknown> | null>(),
    Events: jsonArray('Events'),
    Type: text('Type'),
    HomeSideDetailsId: uuid('HomeSideDetailsId').references(
      (): AnyPgColumn => clubMatchDetails.id
    ),
    AwaySideDetailsId: uuid('AwaySideDetailsId').references(
      (): AnyPgColumn => clubMatchDetails.id
    ),
    HomeManagerId: uuid('HomeManagerId').references(() => managers.id),
    AwayManagerId: uuid('AwayManagerId').references(() => managers.id),
    HomeTactic: text('HomeTactic'),
    AwayTactic: text('AwayTactic'),
    /** Whether this match's result should count toward permanent player/club
     * stats history. Only meaningful for friendlies - real fixtures are
     * always persisted in full regardless of this field. */
    SaveStats: boolean('SaveStats'),
    isFinalMatch: boolean('isFinalMatch').notNull().default(false),
    /** The Day.Index this fixture is scheduled to play on - replaces the old
     * `Day.Matches` embedded array (this Fixture owning its own schedule
     * makes "which day is this on"/"what's playing on day N" plain column
     * reads/filters instead of jsonb queries). Nullable - friendlies and
     * not-yet-scheduled fixtures have neither this nor ScheduledDate. */
    ScheduledDay: integer('ScheduledDay'),
    ScheduledDate: timestamp('ScheduledDate', { precision: 3 }),
    /** Open play. A challenge is a Fixture with ChallengeStatus set
     * (proposed | accepted | declined | expired | forfeited | cancelled |
     * played); a knockout tie has Round/Leg/PlayBy instead. RespondBy and
     * PlayBy are Calendar Day.Index values. */
    CompetitionId: uuid('CompetitionId').references(() => competitions.id),
    StageIndex: integer('StageIndex'),
    Round: integer('Round'),
    Leg: integer('Leg'),
    ChallengeStatus: text('ChallengeStatus'),
    ChallengerClubId: uuid('ChallengerClubId').references(() => clubs.id),
    ProposedAt: timestamp('ProposedAt', { precision: 3 }),
    RespondBy: integer('RespondBy'),
    PlayBy: integer('PlayBy'),
    ...timestamps,
  },
  (t) => [
    index('fixtures_scheduled_day_idx').on(t.ScheduledDay),
    index('fixtures_season_scheduled_day_idx').on(t.SeasonId, t.ScheduledDay),
    index('fixtures_competition_challenge_idx').on(
      t.CompetitionId,
      t.ChallengeStatus
    ),
    index('fixtures_season_stage_round_idx').on(
      t.SeasonId,
      t.StageIndex,
      t.Round
    ),
  ]
);

/** Idempotency ledger: a fixture's result is applied to Rankings/Elo only
 * if inserting its row here succeeds (same transaction). */
export const rankingResults = pgTable('RankingResults', {
  FixtureId: uuid('FixtureId')
    .primaryKey()
    .references(() => fixtures.id),
  SeasonId: uuid('SeasonId')
    .notNull()
    .references(() => seasons.id),
  AppliedAt: timestamp('AppliedAt', { precision: 3 }).defaultNow().notNull(),
});

/**
 * One record per Fixture (see match-replays/match-replay.model.ts), holding
 * the per-tick Frames a finished match was simulated with so it can be
 * re-streamed on demand later (see realtime/matchBroadcaster.ts /
 * restRewatchMatch) without re-simulating it. `Home`/`Away` are denormalized
 * snapshots of the club names/codes at kickoff time (Mixed in Mongoose, not
 * a ref) rather than FKs - they exist so a rewatch doesn't need a second
 * join just to label the pitch, and are deliberately allowed to drift from
 * the live Club row if a club is later renamed.
 */
export const matchReplays = pgTable('MatchReplays', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  FixtureId: uuid('FixtureId')
    .notNull()
    .unique()
    .references(() => fixtures.id),
  Home: jsonb('Home').$type<Record<string, unknown> | null>(),
  Away: jsonb('Away').$type<Record<string, unknown> | null>(),
  Frames: jsonArray('Frames'),
  Details: jsonb('Details').$type<Record<string, unknown> | null>(),
  TickMs: integer('TickMs'),
  ...timestamps,
});

export const playerMatchDetails = pgTable('PlayerMatchDetails', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  PlayerId: uuid('PlayerId').references(() => players.id),
  FixtureId: uuid('FixtureId').references(() => fixtures.id),
  /** Doesn't exist as a field in the current Mongoose model - added so
   * clubMatchDetails.PlayerStats (an array with no referential integrity)
   * can be dropped in favor of this one-to-many FK instead. */
  ClubMatchDetailsId: uuid('ClubMatchDetailsId').references(
    () => clubMatchDetails.id
  ),
  Goals: integer('Goals').notNull().default(0),
  Saves: integer('Saves').notNull().default(0),
  YellowCards: integer('YellowCards').notNull().default(0),
  Fouls: integer('Fouls').notNull().default(0),
  RedCards: integer('RedCards').notNull().default(0),
  Passes: integer('Passes').notNull().default(0),
  Tackles: integer('Tackles').notNull().default(0),
  Assists: integer('Assists').notNull().default(0),
  CleanSheets: integer('CleanSheets').notNull().default(0),
  Points: real('Points').notNull().default(0),
  Dribbles: integer('Dribbles').notNull().default(0),
  Interceptions: integer('Interceptions').notNull().default(0),
  Form: real('Form').notNull().default(0),
  ...timestamps,
});

export const clubMatchDetails = pgTable('ClubMatchDetails', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  ClubId: uuid('ClubId').references(() => clubs.id),
  FixtureId: uuid('FixtureId').references(() => fixtures.id),
  Possession: real('Possession').notNull().default(0),
  Goals: integer('Goals').notNull().default(0),
  ShotsOnTarget: integer('ShotsOnTarget').notNull().default(0),
  ShotsOffTarget: integer('ShotsOffTarget').notNull().default(0),
  Fouls: integer('Fouls').notNull().default(0),
  YellowCards: integer('YellowCards').notNull().default(0),
  RedCards: integer('RedCards').notNull().default(0),
  Passes: integer('Passes').notNull().default(0),
  Won: boolean('Won').notNull().default(false),
  Drew: boolean('Drew').notNull().default(false),
  Events: jsonArray('Events'),
  ...timestamps,
  // PlayerStats dropped - it's the exact inverse of
  // playerMatchDetails.ClubMatchDetails above.
});

export const awards = pgTable('Awards', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Name: text('Name').notNull(),
  Type: text('Type').notNull(),
  Period: text('Period').notNull(),
  Category: text('Category').notNull(),
  /** Polymorphic - a Player or Manager id depending on `Type`. Postgres
   * can't FK a single column against two different tables, so this stays a
   * plain uuid with no `.references()`; the migration script resolves it
   * against whichever table `Type` points to. */
  RecipientId: uuid('RecipientId').notNull(),
  ClubId: uuid('ClubId').references(() => clubs.id),
  Remarks: text('Remarks'),
  SeasonId: uuid('SeasonId').references(() => seasons.id),
  ...timestamps,
});

/**
 * Every money-moving event in the game: a paid player transfer (free-agent
 * signing or a purchase from another club) or a club's periodic wage bill.
 * Real relational table, not jsonb - replaces the dead `players.
 * TransferHistory`/`clubs.Transactions` columns this superseded. Doubles as
 * both "this player's transfer history" (query by PlayerId) and "this
 * club's transactions" (query by BuyerClubId OR SellerClubId) - no need for
 * two separate tables/schemas for what the old dead columns split in two.
 */
export const transferLedger = pgTable(
  'TransferLedger',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    /** 'transfer' (a purchase - free-agent or from another club) | 'wage'
     * (one lump-sum per-club deduction for one game Year). */
    Type: text('Type').notNull(),
    PlayerId: uuid('PlayerId').references(() => players.id),
    BuyerClubId: uuid('BuyerClubId').references(() => clubs.id),
    SellerClubId: uuid('SellerClubId').references(() => clubs.id),
    Amount: real('Amount').notNull(),
    /** The game-world Year cycle (Season.Year convention) - only populated
     * on 'wage' rows, where it doubles as the double-deduction guard key
     * (see transfers/transfer.service.ts's deductWagesForYear). */
    Year: text('Year'),
    Note: text('Note'),
    ...timestamps,
  },
  (t) => [
    index('transfer_ledger_player_idx').on(t.PlayerId),
    index('transfer_ledger_buyer_idx').on(t.BuyerClubId),
    index('transfer_ledger_seller_idx').on(t.SellerClubId),
    index('transfer_ledger_type_year_idx').on(t.Type, t.Year),
  ]
);

/**
 * One row per finished season cycle (Season.Year label): what changed when
 * the cycle ended - champions, promotions/relegations, retirements, breakout
 * players - plus the ranked highlights derived from them. Written by
 * endSeasonCycle (services/world/season-report.service.ts); the Data column
 * holds a SeasonReportData snapshot, kept as jsonb because it is read whole and never
 * queried by field.
 */
export const seasonReports = pgTable('SeasonReports', {
  id: uuid('_id').primaryKey().defaultRandom(),
  Year: text('Year').notNull().unique(),
  Data: jsonb('Data').$type<Record<string, unknown>>().notNull(),
  ...timestamps,
});

/**
 * A bid for a player between two clubs. `Initiator` says who made it:
 * 'user' (a human club bidding for a player) or 'ai' (an AI club bidding for
 * a human club's player). `Status`: 'pending' (waiting for the owning club
 * to respond), 'countered' (owner asked for `CounterAmount`; waiting for the
 * bidder), then the terminal 'accepted' | 'rejected' | 'expired' | 'failed'
 * (e.g. the bidder could no longer afford it). Days are game days
 * (Calendar.CurrentDay).
 */
export const transferOffers = pgTable(
  'TransferOffers',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    PlayerId: uuid('PlayerId')
      .notNull()
      .references(() => players.id),
    FromClubId: uuid('FromClubId')
      .notNull()
      .references(() => clubs.id),
    ToClubId: uuid('ToClubId')
      .notNull()
      .references(() => clubs.id),
    Amount: real('Amount').notNull(),
    CounterAmount: real('CounterAmount'),
    Status: text('Status').notNull().default('pending'),
    Initiator: text('Initiator').notNull(),
    Note: text('Note'),
    CreatedDay: integer('CreatedDay').notNull(),
    ExpiresDay: integer('ExpiresDay').notNull(),
    ...timestamps,
  },
  (t) => [
    index('transfer_offers_to_status_idx').on(t.ToClubId, t.Status),
    index('transfer_offers_from_status_idx').on(t.FromClubId, t.Status),
    index('transfer_offers_player_idx').on(t.PlayerId),
  ]
);

/**
 * A club's levelled facilities (Stadium Grounds, Stands, Training Ground,
 * Youth Academy...). One row per (club, AssetType); a missing row means
 * Level 0 (the starting dirt-turf state). While an upgrade is in progress
 * `UpgradingTo`/`StartDay`/`CompleteDay` are set; the calendar advance
 * (services/facilities/facilities.service.ts's completeDueUpgrades) bumps
 * Level and clears them once CompleteDay is reached. Levels, costs, build
 * days and effects live in services/facilities/asset-config.ts.
 */
export const clubAssets = pgTable(
  'ClubAssets',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    AssetType: text('AssetType').notNull(),
    Level: integer('Level').notNull().default(0),
    UpgradingTo: integer('UpgradingTo'),
    /** Real-time upgrade window (the live model). StartDay/CompleteDay are the
     * old calendar-day columns - unused since the switch to real time. */
    StartAt: timestamp('StartAt', { precision: 3 }),
    CompleteAt: timestamp('CompleteAt', { precision: 3 }),
    StartDay: integer('StartDay'),
    CompleteDay: integer('CompleteDay'),
    ...timestamps,
  },
  (t) => [
    unique('club_assets_club_type_uniq').on(t.ClubId, t.AssetType),
    index('club_assets_upgrading_idx').on(t.CompleteDay),
    index('club_assets_complete_at_idx').on(t.CompleteAt),
  ]
);

/**
 * A timed club goal, e.g. "win N matches within T hours" (Type 'win_matches').
 * Progress is updated by the play flow and expiry is resolved lazily on read
 * (services/play/challenge.service.ts). One 'active' row per club at a time.
 */
/** A club's inbox: things the world did in reaction to the club (fans, board,
 * press). Written by services/world/club-standing.service.ts. */
export const clubMessages = pgTable(
  'ClubMessages',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    /** fans | board | press | squad */
    Kind: text('Kind').notNull(),
    /** good | bad | neutral */
    Tone: text('Tone').notNull().default('neutral'),
    Title: text('Title').notNull(),
    Body: text('Body').notNull(),
    Read: boolean('Read').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('club_messages_club_created_idx').on(t.ClubId, t.createdAt)]
);

export const clubChallenges = pgTable(
  'ClubChallenges',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    Type: text('Type').notNull(),
    Title: text('Title').notNull(),
    TargetWins: integer('TargetWins').notNull(),
    Wins: integer('Wins').notNull().default(0),
    MatchesPlayed: integer('MatchesPlayed').notNull().default(0),
    /** active | completed | failed */
    Status: text('Status').notNull().default('active'),
    ExpiresAt: timestamp('ExpiresAt', { precision: 3 }).notNull(),
    RewardCash: real('RewardCash').notNull(),
    RewardXP: integer('RewardXP').notNull(),
    ResolvedAt: timestamp('ResolvedAt', { precision: 3 }),
    ...timestamps,
  },
  (t) => [index('club_challenges_club_status_idx').on(t.ClubId, t.Status)]
);

/** The board's yearly view of a club: Prestige-weighted finish scores
 * across every edition finished that year. Frozen at year end. */
export const clubPerformance = pgTable(
  'ClubPerformance',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    Year: integer('Year').notNull(),
    Score: real('Score').notNull().default(0),
    Entries: integer('Entries').notNull().default(0),
    Trophies: integer('Trophies').notNull().default(0),
    EloStart: real('EloStart').notNull().default(1500),
    EloEnd: real('EloEnd').notNull().default(1500),
    LevelStart: integer('LevelStart').notNull().default(0),
    LevelEnd: integer('LevelEnd').notNull().default(0),
    Frozen: boolean('Frozen').notNull().default(false),
    ...timestamps,
  },
  (t) => [unique('club_performance_club_year_uq').on(t.ClubId, t.Year)]
);

/** Every Level change. Level itself is derived from Clubs.XP and never
 * stored; Source: xp | promotion | relegation | review | admin. */
export const levelHistory = pgTable(
  'LevelHistory',
  {
    id: uuid('_id').primaryKey().defaultRandom(),
    ClubId: uuid('ClubId')
      .notNull()
      .references(() => clubs.id),
    Day: integer('Day').notNull(),
    FromLevel: integer('FromLevel').notNull(),
    ToLevel: integer('ToLevel').notNull(),
    XPBefore: integer('XPBefore').notNull(),
    XPAfter: integer('XPAfter').notNull(),
    Source: text('Source').notNull(),
    SeasonId: uuid('SeasonId').references(() => seasons.id),
    createdAt: timestamp('createdAt', { precision: 3 }).defaultNow().notNull(),
  },
  (t) => [index('level_history_club_day_idx').on(t.ClubId, t.Day)]
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
