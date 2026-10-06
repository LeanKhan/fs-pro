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

/** One club's line in an edition's flat table. */
export const StandingLineSchema = ClubStandingsSchema.extend({
  Position: z.number(),
  Rank: z.number().nullable(),
  Group: z.string().nullable(),
});

// A season row is an open-play edition (docs/OPEN-PLAY-COMPETITIONS-SPEC.md).
export const SeasonSchema = z.object({
  _id: z.string().optional(),
  SeasonCode: z.string(),
  Title: z.string().optional(),
  CompetitionId: z.string().nullable().optional(),
  CompetitionCode: z.string(),
  WinnerId: z.string().nullable().optional(),
  Status: z.string(),
  StartDate: z.string().nullable().optional(),
  EndDate: z.string().nullable().optional(),
  EditionNumber: z.number().nullable().optional(),
  StartDay: z.number().nullable().optional(),
  EndDay: z.number().nullable().optional(),
  CurrentStage: z.number().optional(),
  // Populated on GET /seasons/:id only - undefined (not an empty array)
  // whenever it wasn't fetched, e.g. off the list route.
  Fixtures: z.array(FixtureSchema).optional(),
  Logs: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Season = z.infer<typeof SeasonSchema>;
export type ClubStandings = z.infer<typeof ClubStandingsSchema>;
export type StandingLine = z.infer<typeof StandingLineSchema>;
