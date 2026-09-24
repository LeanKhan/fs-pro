import { z } from 'zod';

/**
 * Open-play editions, entries, rankings and challenges
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Ids are uuids; days are game
 * Day.Index values.
 */

export const EditionStatusSchema = z.enum([
  'draft',
  'registration',
  'running',
  'finished',
  'cancelled',
]);

export const EditionSchema = z.object({
  id: z.string(),
  competitionId: z.string().nullable(),
  code: z.string(),
  title: z.string(),
  editionNumber: z.number().nullable(),
  status: z.string(),
  published: z.boolean(),
  registrationOpensDay: z.number().nullable(),
  registrationClosesDay: z.number().nullable(),
  startDay: z.number().nullable(),
  endDay: z.number().nullable(),
  currentStage: z.number(),
  stageStartedDay: z.number().nullable(),
  winnerId: z.string().nullable(),
  definition: z.unknown().nullable(),
});

export const EntrySchema = z.object({
  seasonId: z.string(),
  clubId: z.string(),
  status: z.string(),
  seed: z.number().nullable(),
  group: z.string().nullable(),
  feePaid: z.number(),
  eliminatedAtStage: z.number().nullable(),
});

export const EditionDetailSchema = EditionSchema.extend({
  entries: z.array(
    EntrySchema.extend({ clubName: z.string(), clubCode: z.string() })
  ),
});

export const EligibilitySchema = z.object({
  eligible: z.boolean(),
  reasons: z.array(z.string()),
  fee: z.number(),
});

export const EditionListItemSchema = EditionSchema.extend({
  competitionName: z.string().nullable(),
  eligibility: EligibilitySchema.optional(),
});

export const RankingRowSchema = z.object({
  clubId: z.string(),
  rank: z.number().nullable(),
  gamesNeeded: z.number(),
  played: z.number(),
  wins: z.number(),
  draws: z.number(),
  losses: z.number(),
  gf: z.number(),
  ga: z.number(),
  gd: z.number(),
  points: z.number(),
  cleanSheets: z.number(),
  forfeits: z.number(),
  bestUnbeatenRun: z.number(),
});

export const StageTableSchema = z.object({
  seasonId: z.string(),
  stageIndex: z.number(),
  metric: z.string(),
  tiebreakers: z.array(z.string()),
  minGamesToRank: z.number(),
  groups: z.array(
    z.object({ group: z.string().nullable(), rows: z.array(RankingRowSchema) })
  ),
});

export const OpponentOptionSchema = z.object({
  clubId: z.string(),
  name: z.string(),
  clubCode: z.string(),
  rank: z.number().nullable(),
  elo: z.number(),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
});

export const MatchChallengeSchema = z.object({
  id: z.string(),
  seasonId: z.string().nullable(),
  competitionId: z.string().nullable(),
  competitionName: z.string().nullable().optional(),
  stageIndex: z.number().nullable(),
  status: z.string().nullable(),
  direction: z.enum(['incoming', 'outgoing']).optional(),
  challengerClubId: z.string().nullable(),
  homeClubId: z.string().nullable(),
  awayClubId: z.string().nullable(),
  title: z.string().nullable(),
  respondBy: z.number().nullable(),
  scheduledDay: z.number().nullable(),
  played: z.boolean(),
});

export const BracketSchema = z.object({
  seasonId: z.string(),
  stageIndex: z.number(),
  rounds: z.array(
    z.object({
      round: z.number(),
      byeClubId: z.string().nullable(),
      ties: z.array(
        z.object({
          highSeedClubId: z.string(),
          lowSeedClubId: z.string(),
          playBy: z.number().nullable(),
          winnerId: z.string().nullable(),
          decidedBy: z.string().nullable(),
          legs: z.array(
            z.object({
              fixtureId: z.string(),
              leg: z.number(),
              homeClubId: z.string(),
              awayClubId: z.string(),
              scheduledDay: z.number().nullable(),
              played: z.boolean(),
              homeGoals: z.number().nullable(),
              awayGoals: z.number().nullable(),
            })
          ),
        })
      ),
    })
  ),
});

export type EditionStatus = z.infer<typeof EditionStatusSchema>;
export type Edition = z.infer<typeof EditionSchema>;
export type EditionDetail = z.infer<typeof EditionDetailSchema>;
export type EditionListItem = z.infer<typeof EditionListItemSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type Eligibility = z.infer<typeof EligibilitySchema>;
export type RankingTableRow = z.infer<typeof RankingRowSchema>;
export type StageTable = z.infer<typeof StageTableSchema>;
export type OpponentOption = z.infer<typeof OpponentOptionSchema>;
export type MatchChallenge = z.infer<typeof MatchChallengeSchema>;
export type Bracket = z.infer<typeof BracketSchema>;
