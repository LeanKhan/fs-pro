// packages/api-contract/src/index.ts

import { initContract } from '@ts-rest/core';

import { clubsContract } from './routes/clubs';
import { metaContract } from './routes/meta';
import { fixturesContract } from './routes/fixtures';
import { playersContract } from './routes/players';
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
import { worldContract } from './routes/world';
import { competitionDefinitionsContract } from './routes/competition-definitions';
import { atlasContract } from './routes/atlas';
import { tilesContract } from './routes/tiles';
import { programContract } from './routes/program';
import { campusContract } from './routes/campus';
import { gridContract } from './routes/grid';
import { abilitiesContract, traitsContract, ordersContract } from './routes/abilities';

// The one shared Villa (V) money formatter (phase-2 L13/D2) - used by both the
// server's written text and the client so the symbol/format cannot drift.
export { formatVilla, formatVillaCompact } from './villa';

const c = initContract();

// Note: file uploads (/files/upload, /files/upload-clubs) are intentionally
// NOT part of this contract - multipart bodies are a poor fit for ts-rest's
// JSON-first model. They stay plain Express routes indefinitely.

export const apiContract = c.router({
  clubs: clubsContract,
  meta: metaContract,
  fixtures: fixturesContract,
  players: playersContract,
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
  world: worldContract,
  competitionDefinitions: competitionDefinitionsContract,
  atlas: atlasContract,
  tiles: tilesContract,
  program: programContract,
  campus: campusContract,
  grid: gridContract,
  abilities: abilitiesContract,
  traits: traitsContract,
  orders: ordersContract,
});

export * from './replay';
export type { Club } from './schemas/club';
export type { DbStatus } from './schemas/meta';
export type { Fixture } from './schemas/fixture';
export type { Player, PlayerAttributes } from './schemas/player';
export type { Season, ClubStandings, StandingLine } from './schemas/season';
export type { Manager, ManagerClubRef } from './schemas/manager';
export type {
  Calendar,
  Day,
  WorldFeed,
  WorldFeedHeadline,
} from './schemas/calendar';
export type { Place } from './schemas/place';
export type { SeasonReport, SeasonHighlight } from './schemas/season-report';
export type {
  TransferWindow,
  TransferOffer,
  ScoutedTarget,
} from './schemas/transfer';
export type { AssetState, Campus } from './schemas/facilities';
export type {
  Challenge,
  PlayState,
  MatchResult,
  MatchHighlight,
  Opponent,
  ClubStanding,
  InboxMessage,
  Inbox,
  ShopState,
  ClubLeague,
  ShopCollect,
  RaidSummary,
  BoardVaultClaim,
  DefenseEntry,
  DefenseLog,
} from './schemas/play';
export {
  RaidSummarySchema,
  BoardVaultClaimSchema,
  DefenseEntrySchema,
  DefenseLogSchema,
} from './schemas/play';
export type {
  MatchPlan,
  HalfTimeOrders,
  MatchdayFixture,
  Matchday,
  MatchPrep,
  PrepPlayer,
  ScoutReport,
  PlanPreview,
  PlanFactor,
  StyleKey,
} from './schemas/match-plan';
export {
  STYLE_KEYS,
  PLAN_FORMATIONS,
  TRAINING_KEYS,
  TEAM_TALK_KEYS,
} from './schemas/match-plan';
export type {
  ClubPerformance,
  ClubPerformanceInsight,
  ClubPerformanceStrategy,
  ClubPerformanceAdvisorSummary,
} from './schemas/club-performance';
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
  ChallengePolicy,
  EntryPolicy,
} from './schemas/open-play';
export type {
  WorldSettings,
  WorldSettingsPatch,
  YearEndSummary,
  WorldDayReport,
  PerformanceView,
} from './schemas/world';
export { ChallengePolicySchema, EntryPolicySchema } from './schemas/open-play';
export {
  CompetitionDefinitionInputSchema,
  CompetitionSummarySchema,
} from './routes/competition-definitions';
export type CompetitionDefinitionInput = import('zod').infer<
  typeof import('./routes/competition-definitions').CompetitionDefinitionInputSchema
>;
export type CompetitionSummary = import('zod').infer<
  typeof import('./routes/competition-definitions').CompetitionSummarySchema
>;

export * from './campus-grid';
export * from './grid';
export * from './world-geo';
export * from './world-calendar';
export * from './crest';
export * from './schemas/atlas';

// Campus economy + the CoC-mapping system shapes (docs/coc-mapping 02/04).
export {
  CampusCurrencySchema,
  CampusStateSchema,
  CollectorStateSchema,
  VaultStateSchema,
  CampusGroundskeeperSchema,
  CampusObstacleSchema,
  CampusAssetStateSchema,
  CampusAssetUpgradeSchema,
  CampusAssetNextSchema,
  ClubhouseStateSchema,
  UpgradeRequestSchema,
  PlaceRequestSchema,
  CollectRequestSchema,
  ClearObstacleRequestSchema,
  BuyGroundskeeperRequestSchema,
} from './schemas/coc-campus';
export type {
  CampusCurrency,
  CampusState,
  CollectorState,
  VaultState,
  CampusGroundskeeper,
  CampusObstacle,
  CampusAssetState,
  ClubhouseState,
} from './schemas/coc-campus';
export * from './schemas/layout';
export {
  AbilitySchema,
  MasterySchema,
  TraitSchema,
  OrderSchema,
  AbilityTriggerSchema,
  TraitRaritySchema,
  OrderRegionSchema,
} from './schemas/ability';
export type { Ability, Mastery, Trait, Order } from './schemas/ability';
export {
  StandingSchema,
  StandingLeagueSchema,
  StandingPoolSchema,
  FormBonusSchema,
} from './schemas/standing';
export type { Standing, StandingLeague, StandingPool, FormBonus } from './schemas/standing';
export {
  AssociationSchema,
  AssociationLoanSchema,
  DerbySchema,
  AssociationGroundsSchema,
  AssociationRoleSchema,
  DerbyPhaseSchema,
} from './schemas/association';
export type { Association, AssociationLoan, Derby, AssociationGrounds } from './schemas/association';
export {
  SeasonPassSchema,
  SeasonBankSchema,
  SeasonObjectiveSchema,
  SeasonTrackSchema,
} from './schemas/season-pass';
export type { SeasonPass, SeasonBank, SeasonObjective, SeasonTrack } from './schemas/season-pass';
export { ScoutOpponentReportSchema, ThreatReadSchema, ScoutOpponentSchema } from './schemas/scout-screen';
export type { ScoutOpponentReport, ThreatRead } from './schemas/scout-screen';

// World-service (Go) endpoint shapes - see docs/perfect/WORLD-SERVICE-CONTRACT.md.
// Node does not serve these; it calls them via
// apps/fs-pro-server/src/services/world/world-service.client.ts.
export {
  PlacementSpotKindSchema,
  PlacementSpotRequestSchema,
  PlacementInviteSchema,
  PlacementSpotSchema,
  PlaceChildSchema,
  PlaceChildrenSchema,
  ProminenceSchema,
  ProminenceRecomputeSchema,
  ProminenceRecomputeResultSchema,
  PyramidPoolSchema,
  PyramidDrawSchema,
  PyramidJoinRequestSchema,
  PyramidJoinSchema,
  WorldServiceHealthSchema,
  TilePlaceSchema,
  TileClubSchema,
  TileSchema,
} from './schemas/world-service';
export type {
  PlacementSpotKind,
  PlacementSpotRequest,
  PlacementInvite,
  PlacementSpot,
  PlaceChild,
  PlaceChildren,
  Prominence,
  ProminenceRecompute,
  ProminenceRecomputeResult,
  PyramidPool,
  PyramidDraw,
  PyramidJoinRequest,
  PyramidJoin,
  WorldServiceHealth,
  TilePlace,
  TileClub,
  Tile,
} from './schemas/world-service';

// Owner-program engine (Go) endpoint shapes - see
// docs/perfect/phase-2/PROGRAM-SERVICE-CONTRACT.md. Node does not serve these;
// it calls them via services/world/world-service.client.ts.
export {
  ProgramStepSchema,
  ProgramNextStepSchema,
  ProgramManagerFactsSchema,
  ProgramSquadFactsSchema,
  ProgramAssetFactsSchema,
  ProgramFriendlyFactsSchema,
  ProgramScoutFactsSchema,
  ProgramEventFactsSchema,
  ProgramStepFactsSchema,
  AdvisorExprSchema,
  AdvisorPoseSchema,
  AdvisorLineSchema,
  ProgramStepInfoSchema,
  ProgramMatchXpSchema,
  ProgramFeesSchema,
  ProgramStepsConfigSchema,
  ProgramEvaluateRequestSchema,
  ProgramEvaluationSchema,
  ProgramNextRequestSchema,
  ProgramNextResponseSchema,
  ProgramAdvisorStateSchema,
  ProgramTipRequestSchema,
  ProgramTipResponseSchema,
  ProgramStrategySchema,
  ProgramSimulateRequestSchema,
  ProgramPercentilesSchema,
  ProgramHistogramBucketSchema,
  ProgramSimulationReportSchema,
} from './schemas/program-service';
export type {
  ProgramStep,
  ProgramNextStep,
  ProgramManagerFacts,
  ProgramSquadFacts,
  ProgramAssetFacts,
  ProgramFriendlyFacts,
  ProgramScoutFacts,
  ProgramEventFacts,
  ProgramStepFacts,
  AdvisorExpr,
  AdvisorPose,
  AdvisorLine,
  ProgramStepInfo,
  ProgramStepsConfig,
  ProgramEvaluateRequest,
  ProgramEvaluation,
  ProgramNextRequest,
  ProgramNextResponse,
  ProgramAdvisorState,
  ProgramTipRequest,
  ProgramTipResponse,
  ProgramStrategy,
  ProgramSimulateRequest,
  ProgramPercentiles,
  ProgramHistogramBucket,
  ProgramSimulationReport,
} from './schemas/program-service';

// Client-facing owner-program shapes and routes (Node serves these; phase-2
// OWNER-PROGRAM-SPEC §10.1). The Go-boundary shapes above are separate.
export {
  ProgramStepSchema as OwnerProgramStepSchema,
  ProgramStepStarsSchema,
  AttributeRangeSchema,
  ProgramManagerSchema,
  ProgramPlayerSchema,
  ProgramScoutRevealSchema,
  ProgramStateSchema,
  ProgramManagerListSchema,
  ProgramPlayerListSchema,
  ProgramSignResultSchema,
  ProgramDismissTipSchema,
  ProgramChapterSchema,
  ProgramLoanSchema,
} from './schemas/program';
export type {
  ProgramStep as OwnerProgramStep,
  ProgramStepStars as OwnerProgramStepStars,
  AttributeRange,
  ProgramManager,
  ProgramPlayer,
  ProgramScoutReveal,
  ProgramState,
  ProgramManagerList,
  ProgramPlayerList,
  ProgramSignResult,
  ProgramDismissTip,
  ProgramChapter,
  ProgramLoan,
} from './schemas/program';
