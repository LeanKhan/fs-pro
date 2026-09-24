import { z } from 'zod';

/**
 * Open-play competition definitions (docs/OPEN-PLAY-COMPETITIONS-SPEC.md).
 * A competition is built by the admin from entry conditions, one or more
 * stages (league / groups / knockout), a win condition, rewards and optional
 * outcomes. Every field that has a sensible default is optional here; the
 * server fills defaults in services/competitions/definition.ts.
 */

export const RankingMetricSchema = z.enum([
  'points',
  'ppg',
  'wins',
  'win-rate',
  'gd',
  'gf',
  'ga-low',
  'clean-sheets',
  'unbeaten-run',
  'elo-gain',
  'played',
]);

const count = z.number().int().min(0);
const positive = z.number().int().min(1);
const day = z.number().int().min(0);

export const LeagueRulesSchema = z.object({
  metric: RankingMetricSchema,
  tiebreakers: z.array(RankingMetricSchema),
  pointsForWin: count,
  pointsForDraw: count,
  minGamesToRank: count,
  maxGames: positive.nullable(),
  maxVsSameOpponent: positive,
  rematchCooldownDays: count,
  /** Challenge only clubs within N Ranks (0 = anyone). */
  challengeRange: count,
  respondWithinDays: positive,
  maxOpenChallenges: positive,
  minDeclinesBeforeForfeit: count,
});

export const AdvanceSchema = z.object({
  top: positive,
  perGroup: z.boolean().optional(),
  bestRunnersUp: count.optional(),
});

export const StageDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('league'),
    days: positive,
    rules: LeagueRulesSchema.partial().optional(),
    advance: AdvanceSchema.optional(),
  }),
  z.object({
    type: z.literal('groups'),
    days: positive,
    groupSize: z.number().int().min(2),
    rules: LeagueRulesSchema.partial().optional(),
    advance: AdvanceSchema,
  }),
  z.object({
    type: z.literal('knockout'),
    legs: z.union([z.literal(1), z.literal(2)]),
    tieDays: positive,
    seeding: z.enum(['elo', 'random', 'previous-stage']),
    drawAtEnd: z.enum(['penalties', 'higher-seed', 'away-goals']),
  }),
]);

export const EntryConditionsSchema = z.object({
  mode: z.enum(['open', 'invite']),
  minClubs: z.number().int().min(2),
  maxClubs: z.number().int().min(2).nullable(),
  minLevel: positive.optional(),
  maxLevel: positive.optional(),
  minElo: z.number().optional(),
  maxElo: z.number().optional(),
  minRating: z.number().optional(),
  maxRating: z.number().optional(),
  countryIds: z.array(z.string()).optional(),
  requiresWinOf: z.array(z.string()).optional(),
  excludesEntrantsOf: z.array(z.string()).optional(),
  entryFee: z.number().min(0).optional(),
  lateEntryUntilDay: day.nullable().optional(),
});

export const WinConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('final-stage') }),
  z.object({
    type: z.literal('first-to'),
    metric: z.enum(['points', 'wins', 'gf']),
    target: positive,
  }),
  z.object({ type: z.literal('best-at-end'), metric: RankingMetricSchema }),
  z.object({ type: z.literal('last-standing') }),
]);

const byPosition = z.array(
  z.object({ position: positive, amount: z.number().min(0) })
);

export const RewardsSchema = z.object({
  prizeMoney: byPosition,
  participationFee: z.number().min(0).optional(),
  eloBonus: z.number().min(0).optional(),
  trophy: z.string().optional(),
  /** XP by final Rank (or round reached for knockouts). */
  xp: byPosition,
  xpPerMatch: z.object({ win: count, draw: count, loss: count }).optional(),
});

const rankRange = z
  .tuple([positive, positive])
  .refine(
    ([from, to]) => from <= to,
    'Rank range must be [from, to] with from <= to'
  );

export const OutcomeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('qualify'),
    positions: rankRange,
    targetCompetitionId: z.string(),
  }),
  z.object({
    type: z.literal('bar'),
    positions: rankRange,
    targetCompetitionId: z.string(),
    editions: positive,
  }),
  z.object({
    type: z.literal('level'),
    positions: rankRange,
    change: z.union([z.literal(1), z.literal(-1)]),
  }),
]);

export const RecurrenceSchema = z.object({
  everyDays: positive,
  registrationDays: positive,
});

const DefinitionShape = z.object({
  Name: z.string().min(1),
  Description: z.string().optional(),
  Prestige: z.number().int().min(1).max(5),
  Entry: EntryConditionsSchema,
  Stages: z.array(StageDefinitionSchema).min(1),
  WinCondition: WinConditionSchema,
  Rewards: RewardsSchema,
  Outcomes: z.array(OutcomeSchema).optional(),
  Recurrence: RecurrenceSchema.nullable().optional(),
});

/** How many clubs leave a stage for the next one (null = unknown here). */
function clubsAdvancing(
  stage: z.infer<typeof StageDefinitionSchema>,
  clubsIn: number | null
): number | null {
  if (stage.type === 'knockout') return 1;
  if (!stage.advance) return clubsIn;
  if (stage.type === 'groups' && stage.advance.perGroup) {
    if (clubsIn == null) return null;
    const groups = Math.ceil(clubsIn / stage.groupSize);
    return groups * stage.advance.top + (stage.advance.bestRunnersUp ?? 0);
  }
  return stage.advance.top + (stage.advance.bestRunnersUp ?? 0);
}

/** Full, validated definition. Rejects setups that can't run. */
export const CompetitionDefinitionSchema = DefinitionShape.superRefine(
  (def, ctx) => {
    const { Entry, Stages, WinCondition } = def;

    if (Entry.maxClubs != null && Entry.maxClubs < Entry.minClubs) {
      ctx.addIssue({
        code: 'custom',
        path: ['Entry', 'maxClubs'],
        message: 'maxClubs is below minClubs',
      });
    }
    if (
      Entry.minLevel != null &&
      Entry.maxLevel != null &&
      Entry.minLevel > Entry.maxLevel
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['Entry', 'minLevel'],
        message: 'minLevel is above maxLevel',
      });
    }
    if (
      Entry.minElo != null &&
      Entry.maxElo != null &&
      Entry.minElo > Entry.maxElo
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['Entry', 'minElo'],
        message: 'minElo is above maxElo',
      });
    }

    let clubsIn: number | null = Entry.maxClubs;
    Stages.forEach((stage, i) => {
      const isLast = i === Stages.length - 1;

      if (stage.type === 'knockout' && !isLast) {
        ctx.addIssue({
          code: 'custom',
          path: ['Stages', i],
          message: 'A knockout stage must be the last stage',
        });
      }
      if (
        stage.type === 'groups' &&
        Entry.maxClubs != null &&
        stage.groupSize > Entry.maxClubs
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['Stages', i, 'groupSize'],
          message: 'Group size is larger than the maximum number of clubs',
        });
      }
      if (!isLast && stage.type !== 'knockout' && !stage.advance) {
        ctx.addIssue({
          code: 'custom',
          path: ['Stages', i, 'advance'],
          message: 'Every stage except the last must say who advances',
        });
      }

      const out = clubsAdvancing(stage, clubsIn);
      if (!isLast && stage.type !== 'knockout' && out != null && out < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['Stages', i, 'advance'],
          message: 'At least 2 clubs must advance into the next stage',
        });
      }
      if (
        clubsIn != null &&
        out != null &&
        stage.type !== 'knockout' &&
        out > clubsIn
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['Stages', i, 'advance'],
          message: 'More clubs advance than can enter this stage',
        });
      }
      clubsIn = out;
    });

    const onlyKnockout = Stages.every((s) => s.type === 'knockout');
    if (
      onlyKnockout &&
      (WinCondition.type === 'first-to' || WinCondition.type === 'best-at-end')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['WinCondition'],
        message:
          'A knockout-only competition can only be won by the final stage (last standing)',
      });
    }
    if (
      WinCondition.type === 'last-standing' &&
      Stages[Stages.length - 1]?.type !== 'knockout'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['WinCondition'],
        message: 'Last standing needs a knockout as the final stage',
      });
    }
  }
);

export type RankingMetric = z.infer<typeof RankingMetricSchema>;
export type LeagueRules = z.infer<typeof LeagueRulesSchema>;
export type Advance = z.infer<typeof AdvanceSchema>;
export type StageDefinition = z.infer<typeof StageDefinitionSchema>;
export type EntryConditions = z.infer<typeof EntryConditionsSchema>;
export type WinCondition = z.infer<typeof WinConditionSchema>;
export type Rewards = z.infer<typeof RewardsSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type Recurrence = z.infer<typeof RecurrenceSchema>;
export type CompetitionDefinition = z.infer<typeof CompetitionDefinitionSchema>;
