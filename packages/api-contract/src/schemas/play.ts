import { z } from 'zod';

export const ChallengeSchema = z.object({
  id: z.string(),
  title: z.string(),
  targetWins: z.number(),
  wins: z.number(),
  matchesPlayed: z.number(),
  /** active | completed | failed */
  status: z.string(),
  expiresAt: z.string(),
  secondsLeft: z.number(),
  rewardCash: z.number(),
  rewardXP: z.number(),
});

export const ClubSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  rating: z.number(),
  /** Matchmaking power (club rating, rounded). */
  power: z.number(),
  xp: z.number(),
  level: z.number(),
  xpIntoLevel: z.number(),
  xpForNext: z.number(),
  budget: z.number(),
});

export const OutcomeSchema = z.enum(['win', 'draw', 'loss']);

export const RecentMatchSchema = z.object({
  fixtureId: z.string(),
  opponent: z.string(),
  score: z.string(),
  outcome: OutcomeSchema,
  playedAt: z.string(),
});

export const OpponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  /** Matchmaking power on the game-style scale (rating x 2.5). */
  power: z.number(),
});

export const PlayStateSchema = z.object({
  club: ClubSummarySchema,
  /** Seconds until the squad can play again (0 = ready). */
  cooldownSeconds: z.number(),
  challenge: ChallengeSchema,
  recent: z.array(RecentMatchSchema),
});

export const MatchResultSchema = z.object({
  fixtureId: z.string(),
  opponent: OpponentSchema,
  score: z.object({ you: z.number(), them: z.number() }),
  outcome: OutcomeSchema,
  rewards: z.object({ cash: z.number(), xp: z.number() }),
  /** Stadium income from this home match. */
  gate: z
    .object({
      attendance: z.number(),
      revenue: z.number(),
      costs: z.number(),
      net: z.number(),
    })
    .nullable(),
  challengeCompleted: z.boolean(),
  state: PlayStateSchema,
});

export type Opponent = z.infer<typeof OpponentSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type PlayState = z.infer<typeof PlayStateSchema>;
export type MatchResult = z.infer<typeof MatchResultSchema>;
