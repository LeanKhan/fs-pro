import { relations } from 'drizzle-orm';
import {
  places,
  users,
  managers,
  competitions,
  competitionClubs,
  clubs,
  seasons,
  players,
  fixtures,
  matchReplays,
  playerMatchDetails,
  clubMatchDetails,
  awards,
} from './schema';

export const placesRelations = relations(places, ({ many }) => ({
  managers: many(managers),
  competitions: many(competitions),
  clubs: many(clubs),
  players: many(players),
}));

export const usersRelations = relations(users, ({ many }) => ({
  clubs: many(clubs),
}));

export const managersRelations = relations(managers, ({ one, many }) => ({
  club: one(clubs, { fields: [managers.Club], references: [clubs.id] }),
  nationality: one(places, { fields: [managers.Nationality], references: [places.id] }),
  managedClub: many(clubs, { relationName: 'clubManager' }),
  homeFixtures: many(fixtures, { relationName: 'fixtureHomeManager' }),
  awayFixtures: many(fixtures, { relationName: 'fixtureAwayManager' }),
}));

export const competitionsRelations = relations(competitions, ({ one, many }) => ({
  country: one(places, { fields: [competitions.Country], references: [places.id] }),
  seasons: many(seasons),
  memberships: many(competitionClubs),
  clubs: many(clubs, { relationName: 'clubLeague' }),
}));

export const competitionClubsRelations = relations(competitionClubs, ({ one }) => ({
  competition: one(competitions, {
    fields: [competitionClubs.Competition],
    references: [competitions.id],
  }),
  club: one(clubs, { fields: [competitionClubs.Club], references: [clubs.id] }),
}));

export const clubsRelations = relations(clubs, ({ one, many }) => ({
  manager: one(managers, {
    fields: [clubs.Manager],
    references: [managers.id],
    relationName: 'clubManager',
  }),
  league: one(competitions, {
    fields: [clubs.League],
    references: [competitions.id],
    relationName: 'clubLeague',
  }),
  user: one(users, { fields: [clubs.User], references: [users.id] }),
  addressCountry: one(places, { fields: [clubs.AddressCountry], references: [places.id] }),
  players: many(players),
  competitionMemberships: many(competitionClubs),
  seasonsWon: many(seasons, { relationName: 'seasonWinner' }),
  homeFixtures: many(fixtures, { relationName: 'fixtureHomeTeam' }),
  awayFixtures: many(fixtures, { relationName: 'fixtureAwayTeam' }),
  matchDetails: many(clubMatchDetails),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  winner: one(clubs, {
    fields: [seasons.Winner],
    references: [clubs.id],
    relationName: 'seasonWinner',
  }),
  competition: one(competitions, {
    fields: [seasons.Competition],
    references: [competitions.id],
  }),
  fixtures: many(fixtures),
  awards: many(awards),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  club: one(clubs, { fields: [players.Club], references: [clubs.id] }),
  nationality: one(places, { fields: [players.Nationality], references: [places.id] }),
  matchDetails: many(playerMatchDetails),
}));

export const fixturesRelations = relations(fixtures, ({ one, many }) => ({
  season: one(seasons, { fields: [fixtures.Season], references: [seasons.id] }),
  reverseFixture: one(fixtures, {
    fields: [fixtures.ReverseFixture],
    references: [fixtures.id],
  }),
  homeTeam: one(clubs, {
    fields: [fixtures.HomeTeam],
    references: [clubs.id],
    relationName: 'fixtureHomeTeam',
  }),
  awayTeam: one(clubs, {
    fields: [fixtures.AwayTeam],
    references: [clubs.id],
    relationName: 'fixtureAwayTeam',
  }),
  homeManager: one(managers, {
    fields: [fixtures.HomeManager],
    references: [managers.id],
    relationName: 'fixtureHomeManager',
  }),
  awayManager: one(managers, {
    fields: [fixtures.AwayManager],
    references: [managers.id],
    relationName: 'fixtureAwayManager',
  }),
  homeSideDetails: one(clubMatchDetails, {
    fields: [fixtures.HomeSideDetails],
    references: [clubMatchDetails.id],
    relationName: 'fixtureHomeSideDetails',
  }),
  awaySideDetails: one(clubMatchDetails, {
    fields: [fixtures.AwaySideDetails],
    references: [clubMatchDetails.id],
    relationName: 'fixtureAwaySideDetails',
  }),
  playerMatchDetails: many(playerMatchDetails),
  clubMatchDetails: many(clubMatchDetails),
  /** 1:1 - the FK lives on matchReplays.Fixture; see matchReplaysRelations. */
  replay: one(matchReplays),
}));

export const matchReplaysRelations = relations(matchReplays, ({ one }) => ({
  fixture: one(fixtures, { fields: [matchReplays.Fixture], references: [fixtures.id] }),
}));

export const playerMatchDetailsRelations = relations(playerMatchDetails, ({ one }) => ({
  player: one(players, { fields: [playerMatchDetails.Player], references: [players.id] }),
  fixture: one(fixtures, { fields: [playerMatchDetails.Fixture], references: [fixtures.id] }),
  clubMatchDetails: one(clubMatchDetails, {
    fields: [playerMatchDetails.ClubMatchDetails],
    references: [clubMatchDetails.id],
  }),
}));

export const clubMatchDetailsRelations = relations(clubMatchDetails, ({ one, many }) => ({
  club: one(clubs, { fields: [clubMatchDetails.Club], references: [clubs.id] }),
  fixture: one(fixtures, { fields: [clubMatchDetails.Fixture], references: [fixtures.id] }),
  playerStats: many(playerMatchDetails),
  asHomeSideOf: many(fixtures, { relationName: 'fixtureHomeSideDetails' }),
  asAwaySideOf: many(fixtures, { relationName: 'fixtureAwaySideDetails' }),
}));

export const awardsRelations = relations(awards, ({ one }) => ({
  club: one(clubs, { fields: [awards.Club], references: [clubs.id] }),
  season: one(seasons, { fields: [awards.Season], references: [seasons.id] }),
}));
