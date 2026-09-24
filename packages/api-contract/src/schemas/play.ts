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

const ResultLetterSchema = z.enum(['W', 'D', 'L']);

/** The club's standing in the world, moved by every result. */
export const ClubStandingSchema = z.object({
  fans: z.number(),
  /** 1-100 */
  reputation: z.number(),
  /** 0-100; below 35 the board limits budget requests, below 20 it refuses them. */
  boardConfidence: z.number(),
  /** 0-100 fan mood, from form and board confidence. */
  fanApproval: z.number(),
  /** Average squad morale, 0-100 (60 = neutral). */
  squadMorale: z.number(),
  /** Most recent first. */
  form: z.array(ResultLetterSchema),
  streak: z.object({ type: ResultLetterSchema, length: z.number() }).nullable(),
});

export const InboxMessageSchema = z.object({
  id: z.string(),
  /** fans | board | press | squad */
  kind: z.string(),
  /** good | bad | neutral */
  tone: z.string(),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
});

export const InboxSchema = z.object({
  unread: z.number(),
  messages: z.array(InboxMessageSchema),
});

export const PlayStateSchema = z.object({
  club: ClubSummarySchema,
  standing: ClubStandingSchema,
  /** Seconds until the squad can play again (0 = ready). */
  cooldownSeconds: z.number(),
  challenge: ChallengeSchema,
  recent: z.array(RecentMatchSchema),
});

export const MatchHighlightSchema = z.object({
  minute: z.number(),
  type: z.string(),
  message: z.string(),
  side: z.enum(['you', 'them']),
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
  /** How this result moved the club's standing. */
  standingChange: z
    .object({
      fans: z.number(),
      reputation: z.number(),
      boardConfidence: z.number(),
    })
    .optional(),
  state: PlayStateSchema,
  highlights: z.array(MatchHighlightSchema).optional(),
});

export type Opponent = z.infer<typeof OpponentSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type PlayState = z.infer<typeof PlayStateSchema>;
export type MatchHighlight = z.infer<typeof MatchHighlightSchema>;
export type MatchResult = z.infer<typeof MatchResultSchema>;
export type ClubStanding = z.infer<typeof ClubStandingSchema>;
export type InboxMessage = z.infer<typeof InboxMessageSchema>;
export type Inbox = z.infer<typeof InboxSchema>;

