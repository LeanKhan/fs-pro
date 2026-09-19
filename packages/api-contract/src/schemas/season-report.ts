import { z } from 'zod';

export const HIGHLIGHT_TYPES = [
  'champion',
  'cup-winner',
  'continental-winner',
  'promotion',
  'relegation',
  'retirement',
  'breakout',
] as const;

/** One ranked headline picked out of a season change. */
export const SeasonHighlightSchema = z.object({
  id: z.string(),
  type: z.enum(HIGHLIGHT_TYPES),
  /** 0-100, higher = more important; the list is sorted by this. */
  importance: z.number(),
  title: z.string(),
  detail: z.string(),
  clubCode: z.string().nullable().optional(),
  playerId: z.string().nullable().optional(),
});

export const SeasonReportCompetitionSchema = z.object({
  code: z.string(),
  name: z.string(),
  kind: z.enum(['league', 'cup', 'continental']),
  division: z.number(),
  championId: z.string().nullable(),
  championName: z.string().nullable(),
  championCode: z.string().nullable(),
});

export const SeasonReportMovementSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  clubCode: z.string(),
  direction: z.enum(['promoted', 'relegated']),
  from: z.string(),
  to: z.string(),
});

export const SeasonReportRetirementSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  age: z.number().nullable(),
  position: z.string().nullable(),
  rating: z.number().nullable(),
  clubCode: z.string().nullable(),
});

export const SeasonReportBreakoutSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  age: z.number().nullable(),
  position: z.string().nullable(),
  clubCode: z.string().nullable(),
  oldRating: z.number(),
  newRating: z.number(),
  delta: z.number(),
  /** Set when the training system rolled a breakout year for this player. */
  breakoutYear: z.boolean(),
});

/** What changed when a season cycle ended. */
export const SeasonReportSchema = z.object({
  year: z.string(),
  generatedAt: z.string(),
  competitions: z.array(SeasonReportCompetitionSchema),
  movements: z.array(SeasonReportMovementSchema),
  retirements: z.array(SeasonReportRetirementSchema),
  breakouts: z.array(SeasonReportBreakoutSchema),
  highlights: z.array(SeasonHighlightSchema),
});

export type SeasonReport = z.infer<typeof SeasonReportSchema>;
export type SeasonHighlight = z.infer<typeof SeasonHighlightSchema>;
