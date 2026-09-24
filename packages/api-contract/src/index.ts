// packages/api-contract/src/index.ts

import { initContract } from '@ts-rest/core';

import { clubsContract } from './routes/clubs';
import { metaContract } from './routes/meta';
import { fixturesContract } from './routes/fixtures';
import { playersContract } from './routes/players';
import { competitionsContract } from './routes/competitions';
import { managersContract } from './routes/managers';
import { calendarContract } from './routes/calendar';
import { placesContract } from './routes/places';
import { awardsContract } from './routes/awards';
import { seasonsContract } from './routes/seasons';
import { usersContract } from './routes/users';
import { gameContract } from './routes/game';
import { transfersContract } from './routes/transfers';
import { facilitiesContract } from './routes/facilities';
import { playContract } from './routes/play';
import { editionsContract } from './routes/editions';
import { challengesContract } from './routes/challenges';

const c = initContract();

// Note: file uploads (/files/upload, /files/upload-clubs) are intentionally
// NOT part of this contract - multipart bodies are a poor fit for ts-rest's
// JSON-first model. They stay plain Express routes indefinitely.

export const apiContract = c.router({
  clubs: clubsContract,
  meta: metaContract,
  fixtures: fixturesContract,
  players: playersContract,
  competitions: competitionsContract,
  managers: managersContract,
  calendar: calendarContract,
  places: placesContract,
  awards: awardsContract,
  seasons: seasonsContract,
  users: usersContract,
  game: gameContract,
  transfers: transfersContract,
  facilities: facilitiesContract,
  play: playContract,
  editions: editionsContract,
  challenges: challengesContract,
});

export type { Club } from './schemas/club';
export type { DbStatus } from './schemas/meta';
export type { Fixture } from './schemas/fixture';
export type { Player, PlayerAttributes } from './schemas/player';
export type { Competition } from './schemas/competition';
export type { Season, ClubStandings, WeekStandings } from './schemas/season';
export type { Manager, ManagerClubRef } from './schemas/manager';
export type { Calendar, Day, WorldFeed, WorldFeedHeadline } from './schemas/calendar';
export type { Place } from './schemas/place';
export type { SeasonReport, SeasonHighlight } from './schemas/season-report';
export type { TransferWindow, TransferOffer, ScoutedTarget } from './schemas/transfer';
export type { AssetState, Campus } from './schemas/facilities';
export type {
  Challenge,
  PlayState,
  MatchResult,
  Opponent,
  ClubStanding,
  InboxMessage,
  Inbox,
} from './schemas/play';
export type { ClubPerformance, ClubPerformanceInsight, ClubPerformanceStrategy, ClubPerformanceAdvisorSummary } from './schemas/club-performance';
export type { Award } from './schemas/award';
export type { User } from './schemas/user';
export type { Tactic, PlayResult, GameResults } from './schemas/game';
export type { MediaItem } from './schemas/media';
export {
  CompetitionDefinitionSchema,
  LeagueRulesSchema,
  StageDefinitionSchema,
  EntryConditionsSchema,
  WinConditionSchema,
  RewardsSchema,
  OutcomeSchema,
  RecurrenceSchema,
  RankingMetricSchema,
} from './schemas/competition-definition';
export type {
  CompetitionDefinition,
  LeagueRules,
  StageDefinition,
  EntryConditions,
  WinCondition,
  Rewards,
  Outcome,
  Recurrence,
  RankingMetric,
  Advance,
} from './schemas/competition-definition';
export type {
  Edition,
  EditionDetail,
  EditionListItem,
  EditionStatus,
  Entry,
  Eligibility,
  RankingTableRow,
  StageTable,
  OpponentOption,
  MatchChallenge,
  Bracket,
} from './schemas/open-play';
