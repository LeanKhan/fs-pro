import { z } from 'zod';

const RecordSchema = z.object({
  played: z.number(),
  won: z.number(),
  drawn: z.number(),
  lost: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  points: z.number(),
  /** Points the match model expected from these games given both squads. */
  expectedPoints: z.number(),
});

export const ClubPerformanceMatchSchema = z.object({
  fixtureId: z.string(),
  day: z.number().nullable(),
  competition: z.string(),
  venue: z.enum(['home', 'away']),
  opponent: z.string(),
  opponentRating: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  result: z.enum(['W', 'D', 'L']),
  expectedGoalsFor: z.number(),
  expectedGoalsAgainst: z.number(),
  expectedPoints: z.number(),
});

export const ClubPerformanceUnitSchema = z.object({
  unit: z.enum(['Attack', 'Midfield', 'Defence', 'Goalkeeper']),
  rating: z.number(),
  leagueAverage: z.number(),
  /** 1 = best in the league. */
  rank: z.number(),
  of: z.number(),
});

export const ClubPerformancePlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  rating: z.number(),
  age: z.number().nullable(),
  appearances: z.number(),
  goals: z.number(),
  assists: z.number(),
  /** Average match points (the game's own performance score). */
  averagePoints: z.number(),
});

export const ClubPerformanceInsightSchema = z.object({
  severity: z.enum(['problem', 'warning', 'info', 'good']),
  title: z.string(),
  detail: z.string(),
});

/** Why a club is (not) winning, built from its results and its squad. */
export const ClubPerformanceSchema = z.object({
  clubId: z.string(),
  clubName: z.string(),
  year: z.string(),
  availableYears: z.array(z.string()),
  leagueCode: z.string().nullable(),
  overall: RecordSchema,
  home: RecordSchema,
  away: RecordSchema,
  vsStronger: RecordSchema,
  vsWeaker: RecordSchema,
  /** Most recent first, e.g. ['L', 'L', 'W']. */
  form: z.array(z.enum(['W', 'D', 'L'])),
  leagueGoalsPerGame: z.object({ scored: z.number(), conceded: z.number() }),
  units: z.array(ClubPerformanceUnitSchema),
  squad: z.object({
    size: z.number(),
    startingAverage: z.number(),
    benchAverage: z.number(),
    averageAge: z.number(),
    injured: z.number(),
    hasSavedLineup: z.boolean(),
    formation: z.string().nullable(),
    style: z.string().nullable(),
  }),
  matches: z.array(ClubPerformanceMatchSchema),
  topPlayers: z.array(ClubPerformancePlayerSchema),
  weakestStarters: z.array(ClubPerformancePlayerSchema),
  insights: z.array(ClubPerformanceInsightSchema),
});

export type ClubPerformance = z.infer<typeof ClubPerformanceSchema>;
export type ClubPerformanceInsight = z.infer<typeof ClubPerformanceInsightSchema>;
