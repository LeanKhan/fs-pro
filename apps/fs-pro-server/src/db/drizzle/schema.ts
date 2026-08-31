import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

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
  Club: uuid('Club').references((): AnyPgColumn => clubs.id),
  PreferredFormation: text('PreferredFormation'),
  PreferredStyle: text('PreferredStyle'),
  Nationality: uuid('Nationality').references(() => places.id),
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
  TeamsPromoted: integer('TeamsPromoted'),
  TeamsRelegated: integer('TeamsRelegated'),
  Country: uuid('Country').references(() => places.id),
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
    Competition: uuid('Competition')
      .notNull()
      .references(() => competitions.id),
    Club: uuid('Club')
      .notNull()
      .references(() => clubs.id),
    ...timestamps,
  },
  (t) => [unique().on(t.Competition, t.Club)]
);

export const clubs = pgTable('Clubs', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Name: text('Name').notNull().unique(),
  ClubCode: text('ClubCode').notNull().unique(),
  AttackingClass: integer('AttackingClass'),
  DefensiveClass: integer('DefensiveClass'),
  Rating: integer('Rating').notNull().default(0),
  GK_Rating: integer('GK_Rating').notNull().default(0),
  ATT_Rating: integer('ATT_Rating').notNull().default(0),
  DEF_Rating: integer('DEF_Rating').notNull().default(0),
  MID_Rating: integer('MID_Rating').notNull().default(0),
  Manager: uuid('Manager').references(() => managers.id),
  assets: jsonb('assets').$type<Record<string, unknown> | null>(),
  Stats: jsonb('Stats').$type<Record<string, unknown> | null>(),
  /** Section/City only now - Country moved to its own FK column below (it
   * was the one part of this blob that was ever a real Mongo ref). */
  Address: jsonb('Address').$type<Record<string, unknown> | null>(),
  AddressCountry: uuid('AddressCountry').references(() => places.id),
  Budget: integer('Budget'),
  Transactions: jsonb('Transactions').$type<Record<string, unknown> | null>(),
  Records: jsonArray('Records'),
  Stadium: jsonb('Stadium').$type<Record<string, unknown> | null>(),
  LeagueCode: text('LeagueCode'),
  League: uuid('League').references(() => competitions.id),
  User: uuid('User').references(() => users.id),
  ...timestamps,
  // Players dropped - it's the exact inverse of players.Club below.
});

export const calendars = pgTable('Calendars', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Name: text('Name').notNull(),
  YearString: text('YearString').notNull(),
  YearDigits: text('YearDigits').notNull(),
  CurrentDay: integer('CurrentDay'),
  isActive: boolean('isActive').notNull().default(false),
  isEnded: boolean('isEnded').notNull().default(false),
  allSeasonsCompleted: boolean('allSeasonsCompleted').notNull().default(false),
  ...timestamps,
  // Days dropped - it's the exact inverse of days.Calendar below.
});

export const days = pgTable('Days', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  /** Array of embedded match summaries (Mongo subdocuments, not a separate
   * collection) - each entry already carries its own Fixture/CompetitionId
   * as plain data, so this stays jsonb rather than a child table. */
  Matches: jsonArray('Matches'),
  isFree: boolean('isFree').notNull(),
  Day: integer('Day'),
  Year: text('Year').notNull(),
  Calendar: uuid('Calendar').references(() => calendars.id),
  ...timestamps,
});

export const seasons = pgTable('Seasons', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  SeasonCode: text('SeasonCode').notNull().unique(),
  Title: text('Title').notNull(),
  StartDate: timestamp('StartDate', { precision: 3 }).notNull(),
  EndDate: timestamp('EndDate', { precision: 3 }).notNull(),
  Winner: uuid('Winner').references(() => clubs.id),
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
  Year: text('Year'),
  Calendar: uuid('Calendar').references(() => calendars.id),
  Competition: uuid('Competition').references(() => competitions.id),
  CompetitionCode: text('CompetitionCode').notNull(),
  Standings: jsonArray('Standings'),
  Logs: jsonArray('Logs'),
  ...timestamps,
  // Fixtures dropped - it's the exact inverse of fixtures.Season below.
});

export const players = pgTable('Players', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  FirstName: text('FirstName').notNull(),
  LastName: text('LastName').notNull(),
  Nationality: uuid('Nationality').references(() => places.id),
  Age: integer('Age'),
  PlayerID: text('PlayerID').unique(),
  Position: text('Position'),
  Role: text('Role'),
  PositionNumber: integer('PositionNumber'),
  Attributes: jsonb('Attributes').$type<Record<string, unknown> | null>(),
  Rating: integer('Rating'),
  ShirtNumber: text('ShirtNumber'),
  Value: integer('Value'),
  Form: integer('Form').notNull().default(6),
  isReserve: boolean('isReserve').notNull().default(false),
  Appearance: jsonb('Appearance').$type<Record<string, unknown> | null>(),
  TransferHistory: jsonArray('TransferHistory'),
  RatingsHistory: jsonArray('RatingsHistory'),
  isSigned: boolean('isSigned').notNull().default(false),
  ClubCode: text('ClubCode'),
  Club: uuid('Club').references(() => clubs.id),
  ...timestamps,
});

export const fixtures = pgTable('Fixtures', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Title: text('Title'),
  FixtureCode: text('FixtureCode'),
  SeasonCode: text('SeasonCode'),
  LeagueCode: text('LeagueCode'),
  Week: integer('Week'),
  Season: uuid('Season').references(() => seasons.id),
  Stadium: text('Stadium'),
  Played: boolean('Played').notNull().default(false),
  Tie: text('Tie'),
  Stage: text('Stage').notNull().default('lg-match'),
  ReverseFixture: uuid('ReverseFixture').references((): AnyPgColumn => fixtures.id),
  PlayedAt: timestamp('PlayedAt', { precision: 3 }),
  Home: text('Home'),
  Away: text('Away'),
  HomeTeam: uuid('HomeTeam').references(() => clubs.id),
  AwayTeam: uuid('AwayTeam').references(() => clubs.id),
  Details: jsonb('Details').$type<Record<string, unknown> | null>(),
  Events: jsonArray('Events'),
  Type: text('Type'),
  HomeSideDetails: uuid('HomeSideDetails').references((): AnyPgColumn => clubMatchDetails.id),
  AwaySideDetails: uuid('AwaySideDetails').references((): AnyPgColumn => clubMatchDetails.id),
  HomeManager: uuid('HomeManager').references(() => managers.id),
  AwayManager: uuid('AwayManager').references(() => managers.id),
  HomeTactic: text('HomeTactic'),
  AwayTactic: text('AwayTactic'),
  /** Whether this match's result should count toward permanent player/club
   * stats history. Only meaningful for friendlies - real fixtures are
   * always persisted in full regardless of this field. */
  SaveStats: boolean('SaveStats'),
  isFinalMatch: boolean('isFinalMatch').notNull().default(false),
  ...timestamps,
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
  Fixture: uuid('Fixture').notNull().unique().references(() => fixtures.id),
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
  Player: uuid('Player').references(() => players.id),
  Fixture: uuid('Fixture').references(() => fixtures.id),
  /** Doesn't exist as a field in the current Mongoose model - added so
   * clubMatchDetails.PlayerStats (an array with no referential integrity)
   * can be dropped in favor of this one-to-many FK instead. */
  ClubMatchDetails: uuid('ClubMatchDetails').references(() => clubMatchDetails.id),
  Goals: integer('Goals').notNull().default(0),
  Saves: integer('Saves').notNull().default(0),
  YellowCards: integer('YellowCards').notNull().default(0),
  Fouls: integer('Fouls').notNull().default(0),
  RedCards: integer('RedCards').notNull().default(0),
  Passes: integer('Passes').notNull().default(0),
  Tackles: integer('Tackles').notNull().default(0),
  Assists: integer('Assists').notNull().default(0),
  CleanSheets: integer('CleanSheets').notNull().default(0),
  Points: integer('Points').notNull().default(0),
  Dribbles: integer('Dribbles').notNull().default(0),
  Interceptions: integer('Interceptions').notNull().default(0),
  Form: integer('Form').notNull().default(0),
  ...timestamps,
});

export const clubMatchDetails = pgTable('ClubMatchDetails', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Club: uuid('Club').references(() => clubs.id),
  Fixture: uuid('Fixture').references(() => fixtures.id),
  Possession: integer('Possession').notNull().default(0),
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
  Recipient: uuid('Recipient').notNull(),
  Club: uuid('Club').references(() => clubs.id),
  Remarks: text('Remarks'),
  Season: uuid('Season').references(() => seasons.id),
  ...timestamps,
});

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
