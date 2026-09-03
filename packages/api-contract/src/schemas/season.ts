import { z } from 'zod';
import { FixtureSchema } from './fixture';

export const ClubStandingsSchema = z
  .object({
    ClubCode: z.string(),
    ClubID: z.string(),
    Points: z.number(),
    Played: z.number(),
    Wins: z.number(),
    Losses: z.number(),
    Draws: z.number(),
    GF: z.number(),
    GA: z.number(),
    GD: z.number(),
  })
  .passthrough();

export const WeekStandingsSchema = z.object({
  Week: z.number(),
  Table: z.array(ClubStandingsSchema),
});

// Verified against real GET /seasons?current=true and GET /seasons/:id
// responses.
export const SeasonSchema = z.object({
  _id: z.string().optional(),
  SeasonCode: z.string(),
  Title: z.string().optional(),
  CompetitionId: z.string().nullable().optional(),
  CompetitionCode: z.string(),
  WinnerId: z.string().nullable().optional(),
  Promoted: z.array(z.string()).optional(),
  Relegated: z.array(z.string()).optional(),
  isFinished: z.boolean(),
  isStarted: z.boolean(),
  Status: z.string(),
  StartDate: z.string().nullable().optional(),
  EndDate: z.string().nullable().optional(),
  Year: z.string(),
  // Populated on GET /seasons/:id only - undefined (not an empty array)
  // whenever it wasn't fetched, e.g. off the list route.
  Fixtures: z.array(FixtureSchema).optional(),
  Standings: z.array(WeekStandingsSchema),
  // GET /seasons/:id computes this from Standings server-side (see
  // compileStandings) - not a stored field.
  CompiledStandings: z.array(ClubStandingsSchema).optional(),
  Logs: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Season = z.infer<typeof SeasonSchema>;
export type ClubStandings = z.infer<typeof ClubStandingsSchema>;
export type WeekStandings = z.infer<typeof WeekStandingsSchema>;
