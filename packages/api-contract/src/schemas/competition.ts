import { z } from 'zod';
import { ClubSchema } from './club';
import { SeasonSchema } from './season';
import { PlaceSchema } from './place';

// Verified against real GET /competitions/all and GET /competitions/:id
// (populated) responses.
export const CompetitionSchema = z.object({
  _id: z.string().optional(),
  Type: z.string(),
  Name: z.string(),
  CompetitionID: z.string().optional(),
  CompetitionCode: z.string(),
  CountryId: z.string().nullable().optional(),
  Country: PlaceSchema.nullable().optional(),
  League: z.boolean(),
  Tournament: z.boolean(),
  Cup: z.boolean(),
  Division: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  NumberOfTeams: z.number(),
  NumberOfWeeks: z.number(),
  TeamsRelegated: z.number().nullable().optional(),
  TeamsPromoted: z.number().nullable().optional(),
  // Composed from reverse lookups (Clubs.League / Seasons.Competition) on
  // GET /:id - absent on the /all listing.
  Clubs: z.array(ClubSchema).optional(),
  Seasons: z.array(SeasonSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Competition = z.infer<typeof CompetitionSchema>;
