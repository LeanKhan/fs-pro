import { z } from 'zod';
import { LeagueRulesSchema } from './competition-definition';

/** Open-play world settings (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Calendars"). */

const TransferWindowRangeSchema = z
  .object({ fromDay: z.number().int().min(1), toDay: z.number().int().min(1) })
  .refine(
    (w) => w.fromDay <= w.toDay,
    'A window must end on or after its first day'
  );

export const WorldSettingsSchema = z.object({
  currentDay: z.number(),
  currentYear: z.number(),
  yearStartDay: z.number(),
  /** Day of the current year, 1-based. */
  dayOfYear: z.number(),
  yearLengthDays: z.number(),
  autoRollover: z.boolean(),
  transferWindows: z.array(TransferWindowRangeSchema),
  defaultRules: LeagueRulesSchema.partial().nullable(),
  levelThresholds: z.array(z.number()).nullable(),
  xpPerMatch: z
    .object({ win: z.number(), draw: z.number(), loss: z.number() })
    .nullable(),
  levelTargets: z.array(z.number()).nullable(),
  levelReview: z
    .object({
      enabled: z.boolean(),
      promoteCount: z.number().int().min(0),
      relegateCount: z.number().int().min(0),
    })
    .nullable(),
  maxConcurrentEntries: z.number(),
});

export const WorldSettingsPatchSchema = z
  .object({
    yearLengthDays: z.number().int().min(30).max(3650),
    autoRollover: z.boolean(),
    transferWindows: z.array(TransferWindowRangeSchema),
    defaultRules: LeagueRulesSchema.partial().nullable(),
    levelThresholds: z
      .array(z.number().int().min(0))
      .min(2)
      .refine((t) => t[0] === 0, 'Level 0 must start at 0 XP')
      .refine(
        (t) => t.every((x, i) => i === 0 || x > t[i - 1]!),
        'Thresholds must go up'
      )
      .nullable(),
    xpPerMatch: z
      .object({
        win: z.number().int().min(0),
        draw: z.number().int().min(0),
        loss: z.number().int().min(0),
      })
      .nullable(),
    levelTargets: z.array(z.number().min(0).max(1)).nullable(),
    levelReview: z
      .object({
        enabled: z.boolean(),
        promoteCount: z.number().int().min(0),
        relegateCount: z.number().int().min(0),
      })
      .nullable(),
    maxConcurrentEntries: z.number().int().min(1).max(50),
  })
  .partial();

export const YearEndSummarySchema = z.object({
  year: z.number(),
  label: z.string(),
  fromDay: z.number(),
  toDay: z.number(),
  retired: z.number(),
  levelReviewMoves: z.number(),
  errors: z.array(z.string()),
});

export const WorldDayReportSchema = z.object({
  day: z.number(),
  pausedForYearEnd: z.boolean(),
  yearEnded: YearEndSummarySchema.nullable(),
  healed: z.number(),
  editions: z.unknown().nullable(),
  challenges: z
    .object({ expired: z.number(), forfeited: z.number() })
    .nullable(),
  ai: z
    .object({
      registered: z.number(),
      accepted: z.number(),
      declined: z.number(),
      proposed: z.number(),
      policyAccepted: z.number(),
      policyDeclined: z.number(),
      policyRegistered: z.number(),
    })
    .nullable(),
  transferWindowOpened: z.boolean(),
  matches: z.object({
    total: z.number(),
    simulated: z.number(),
    failed: z.number(),
  }),
  advancedTo: z.number().nullable(),
});

export const PerformanceViewSchema = z.object({
  clubId: z.string(),
  year: z.number(),
  current: z.boolean(),
  level: z.number(),
  score: z.number(),
  expected: z.number(),
  gap: z.number(),
  entries: z.number(),
  trophies: z.number(),
  eloStart: z.number(),
  eloEnd: z.number(),
  levelStart: z.number(),
  levelEnd: z.number(),
  finishes: z.array(
    z.object({
      seasonId: z.string(),
      competitionName: z.string(),
      editionCode: z.string(),
      finalPosition: z.number().nullable(),
      finishScore: z.number().nullable(),
      prestige: z.number(),
      endDay: z.number().nullable(),
      won: z.boolean(),
    })
  ),
  levelMoves: z.array(
    z.object({
      day: z.number(),
      from: z.number(),
      to: z.number(),
      source: z.string(),
    })
  ),
});

export type PerformanceView = z.infer<typeof PerformanceViewSchema>;
export type WorldSettings = z.infer<typeof WorldSettingsSchema>;
export type WorldSettingsPatch = z.infer<typeof WorldSettingsPatchSchema>;
export type YearEndSummary = z.infer<typeof YearEndSummarySchema>;
export type WorldDayReport = z.infer<typeof WorldDayReportSchema>;
