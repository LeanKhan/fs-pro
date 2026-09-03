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
  transferLedger,
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
  club: one(clubs, { fields: [managers.ClubId], references: [clubs.id] }),
  nationality: one(places, {
    fields: [managers.NationalityId],
    references: [places.id],
  }),
  managedClub: many(clubs, { relationName: 'clubManager' }),
  homeFixtures: many(fixtures, { relationName: 'fixtureHomeManager' }),
  awayFixtures: many(fixtures, { relationName: 'fixtureAwayManager' }),
}));

export const competitionsRelations = relations(
  competitions,
  ({ one, many }) => ({
    country: one(places, {
      fields: [competitions.CountryId],
      references: [places.id],
    }),
    seasons: many(seasons),
    memberships: many(competitionClubs),
    clubs: many(clubs, { relationName: 'clubLeague' }),
  })
);

export const competitionClubsRelations = relations(
  competitionClubs,
  ({ one }) => ({
    competition: one(competitions, {
      fields: [competitionClubs.CompetitionId],
      references: [competitions.id],
    }),
    club: one(clubs, {
      fields: [competitionClubs.ClubId],
      references: [clubs.id],
    }),
  })
);

export const clubsRelations = relations(clubs, ({ one, many }) => ({
  manager: one(managers, {
    fields: [clubs.ManagerId],
    references: [managers.id],
    relationName: 'clubManager',
  }),
  league: one(competitions, {
    fields: [clubs.LeagueId],
    references: [competitions.id],
    relationName: 'clubLeague',
  }),
  user: one(users, { fields: [clubs.UserId], references: [users.id] }),
  addressCountry: one(places, {
    fields: [clubs.AddressCountryId],
    references: [places.id],
  }),
  players: many(players),
  competitionMemberships: many(competitionClubs),
  seasonsWon: many(seasons, { relationName: 'seasonWinner' }),
  homeFixtures: many(fixtures, { relationName: 'fixtureHomeTeam' }),
  awayFixtures: many(fixtures, { relationName: 'fixtureAwayTeam' }),
  matchDetails: many(clubMatchDetails),
  purchasesMade: many(transferLedger, { relationName: 'ledgerBuyerClub' }),
  salesMade: many(transferLedger, { relationName: 'ledgerSellerClub' }),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  winner: one(clubs, {
    fields: [seasons.WinnerId],
    references: [clubs.id],
    relationName: 'seasonWinner',
  }),
  competition: one(competitions, {
    fields: [seasons.CompetitionId],
    references: [competitions.id],
  }),
  fixtures: many(fixtures),
  awards: many(awards),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  club: one(clubs, { fields: [players.ClubId], references: [clubs.id] }),
  nationality: one(places, {
    fields: [players.NationalityId],
    references: [places.id],
  }),
  matchDetails: many(playerMatchDetails),
  transferLedger: many(transferLedger),
}));

export const fixturesRelations = relations(fixtures, ({ one, many }) => ({
  season: one(seasons, {
    fields: [fixtures.SeasonId],
    references: [seasons.id],
  }),
  reverseFixture: one(fixtures, {
    fields: [fixtures.ReverseFixtureId],
    references: [fixtures.id],
  }),
  homeTeam: one(clubs, {
    fields: [fixtures.HomeTeamId],
    references: [clubs.id],
    relationName: 'fixtureHomeTeam',
  }),
  awayTeam: one(clubs, {
    fields: [fixtures.AwayTeamId],
    references: [clubs.id],
    relationName: 'fixtureAwayTeam',
  }),
  homeManager: one(managers, {
    fields: [fixtures.HomeManagerId],
    references: [managers.id],
    relationName: 'fixtureHomeManager',
  }),
  awayManager: one(managers, {
    fields: [fixtures.AwayManagerId],
    references: [managers.id],
    relationName: 'fixtureAwayManager',
  }),
  homeSideDetails: one(clubMatchDetails, {
    fields: [fixtures.HomeSideDetailsId],
    references: [clubMatchDetails.id],
    relationName: 'fixtureHomeSideDetails',
  }),
  awaySideDetails: one(clubMatchDetails, {
    fields: [fixtures.AwaySideDetailsId],
    references: [clubMatchDetails.id],
    relationName: 'fixtureAwaySideDetails',
  }),
  playerMatchDetails: many(playerMatchDetails),
  clubMatchDetails: many(clubMatchDetails),
  /** 1:1 - the FK lives on matchReplays.FixtureId; see matchReplaysRelations. */
  replay: one(matchReplays),
}));

export const matchReplaysRelations = relations(matchReplays, ({ one }) => ({
  fixture: one(fixtures, {
    fields: [matchReplays.FixtureId],
    references: [fixtures.id],
  }),
}));

export const playerMatchDetailsRelations = relations(
  playerMatchDetails,
  ({ one }) => ({
    player: one(players, {
      fields: [playerMatchDetails.PlayerId],
      references: [players.id],
    }),
    fixture: one(fixtures, {
      fields: [playerMatchDetails.FixtureId],
      references: [fixtures.id],
    }),
    clubMatchDetails: one(clubMatchDetails, {
      fields: [playerMatchDetails.ClubMatchDetailsId],
      references: [clubMatchDetails.id],
    }),
  })
);

export const clubMatchDetailsRelations = relations(
  clubMatchDetails,
  ({ one, many }) => ({
    club: one(clubs, {
      fields: [clubMatchDetails.ClubId],
      references: [clubs.id],
    }),
    fixture: one(fixtures, {
      fields: [clubMatchDetails.FixtureId],
      references: [fixtures.id],
    }),
    playerStats: many(playerMatchDetails),
    asHomeSideOf: many(fixtures, { relationName: 'fixtureHomeSideDetails' }),
    asAwaySideOf: many(fixtures, { relationName: 'fixtureAwaySideDetails' }),
  })
);

export const awardsRelations = relations(awards, ({ one }) => ({
  club: one(clubs, { fields: [awards.ClubId], references: [clubs.id] }),
  season: one(seasons, { fields: [awards.SeasonId], references: [seasons.id] }),
}));

export const transferLedgerRelations = relations(transferLedger, ({ one }) => ({
  player: one(players, {
    fields: [transferLedger.PlayerId],
    references: [players.id],
  }),
  buyerClub: one(clubs, {
    fields: [transferLedger.BuyerClubId],
    references: [clubs.id],
    relationName: 'ledgerBuyerClub',
  }),
  sellerClub: one(clubs, {
    fields: [transferLedger.SellerClubId],
    references: [clubs.id],
    relationName: 'ledgerSellerClub',
  }),
}));
