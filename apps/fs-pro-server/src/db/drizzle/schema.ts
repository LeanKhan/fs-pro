import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('createdAt', { precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
};

const stringArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`);

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

export const awards = pgTable('Awards', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Name: text('Name').notNull(),
  Type: text('Type').notNull(),
  Period: text('Period').notNull(),
  Category: text('Category').notNull(),
  Recipient: text('Recipient').notNull(),
  Club: text('Club'),
  Remarks: text('Remarks'),
  Season: text('Season'),
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
  Clubs: stringArray('Clubs'),
  isAdmin: boolean('isAdmin').notNull().default(false),
  Session: text('Session'),
  ...timestamps,
});

export const managers = pgTable('Managers', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Key: text('Key').notNull().unique(),
  FirstName: text('FirstName').notNull(),
  LastName: text('LastName').notNull(),
  Age: integer('Age').notNull(),
  Picture: text('Picture'),
  Club: text('Club'),
  Nationality: text('Nationality'),
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
  Country: text('Country'),
  Clubs: stringArray('Clubs'),
  Seasons: stringArray('Seasons'),
  ...timestamps,
});

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
  Manager: text('Manager'),
  assets: jsonb('assets').$type<Record<string, unknown> | null>(),
  Stats: jsonb('Stats').$type<Record<string, unknown> | null>(),
  Address: jsonb('Address').$type<Record<string, unknown> | null>(),
  Budget: integer('Budget'),
  Transactions: jsonb('Transactions').$type<Record<string, unknown> | null>(),
  Records: jsonArray('Records'),
  Stadium: jsonb('Stadium').$type<Record<string, unknown> | null>(),
  LeagueCode: text('LeagueCode'),
  League: text('League'),
  Players: stringArray('Players'),
  User: text('User'),
  ...timestamps,
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
  Days: stringArray('Days'),
  ...timestamps,
});

export const days = pgTable('Days', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Matches: jsonArray('Matches'),
  isFree: boolean('isFree').notNull(),
  Day: integer('Day'),
  Year: text('Year').notNull(),
  Calendar: text('Calendar'),
  ...timestamps,
});

export const seasons = pgTable('Seasons', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  SeasonCode: text('SeasonCode').notNull().unique(),
  Title: text('Title').notNull(),
  StartDate: timestamp('StartDate', { precision: 3 }).notNull(),
  EndDate: timestamp('EndDate', { precision: 3 }).notNull(),
  Winner: text('Winner'),
  Promoted: stringArray('Promoted'),
  Relegated: stringArray('Relegated'),
  isFinished: boolean('isFinished').notNull().default(false),
  isStarted: boolean('isStarted').notNull().default(false),
  Status: text('Status').notNull().default('Pending'),
  Year: text('Year'),
  Calendar: text('Calendar'),
  Competition: text('Competition'),
  CompetitionCode: text('CompetitionCode').notNull(),
  Fixtures: stringArray('Fixtures'),
  Standings: jsonArray('Standings'),
  Logs: jsonArray('Logs'),
  ...timestamps,
});

export const players = pgTable('Players', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  FirstName: text('FirstName').notNull(),
  LastName: text('LastName').notNull(),
  Nationality: text('Nationality'),
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
  Club: text('Club'),
  ...timestamps,
});

export const playerMatchDetails = pgTable('PlayerMatchDetails', {
  id: uuid('_id').primaryKey().defaultRandom(),
  mongoId: text('mongoId').unique(),
  Player: text('Player'),
  Fixture: text('Fixture'),
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
  Club: text('Club'),
  Fixture: text('Fixture'),
  Possession: integer('Possession').notNull().default(0),
  Goals: integer('Goals').notNull().default(0),
  ShotsOnTarget: integer('ShotsOnTarget').notNull().default(0),
  ShotsOffTarget: integer('ShotsOffTarget').notNull().default(0),
  Fouls: integer('Fouls').notNull().default(0),
  YellowCards: integer('YellowCards').notNull().default(0),
  RedCards: integer('RedCards').notNull().default(0),
  Passes: integer('Passes').notNull().default(0),
  PlayerStats: stringArray('PlayerStats'),
  Won: boolean('Won').notNull().default(false),
  Drew: boolean('Drew').notNull().default(false),
  Events: jsonArray('Events'),
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
  Season: text('Season'),
  Stadium: text('Stadium'),
  Played: boolean('Played').notNull().default(false),
  Tie: text('Tie'),
  Stage: text('Stage').notNull().default('lg-match'),
  ReverseFixture: text('ReverseFixture'),
  PlayedAt: timestamp('PlayedAt', { precision: 3 }),
  Home: text('Home'),
  Away: text('Away'),
  HomeTeam: text('HomeTeam'),
  AwayTeam: text('AwayTeam'),
  Details: jsonb('Details').$type<Record<string, unknown> | null>(),
  Events: jsonArray('Events'),
  Type: text('Type'),
  HomeSideDetails: text('HomeSideDetails'),
  AwaySideDetails: text('AwaySideDetails'),
  HomeManager: text('HomeManager'),
  AwayManager: text('AwayManager'),
  isFinalMatch: boolean('isFinalMatch').notNull().default(false),
  ...timestamps,
});

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
