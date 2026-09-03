import { z } from 'zod';
import { PlaceSchema } from './place';

/** Narrowed to _id/Name/ClubCode/LeagueCode when populated as the Manager
 * on a fetched Club, or as the Club on a fetched Manager - see the
 * server's IManagerReadOptions/IClubReadOptions. NOT the full ClubSchema. */
export const ManagerClubRefSchema = z.object({
  _id: z.string(),
  Name: z.string(),
  ClubCode: z.string(),
  LeagueCode: z.string().nullable().optional(),
});

// Verified against real GET /managers?populate=Club responses.
export const ManagerSchema = z.object({
  _id: z.string().optional(),
  Key: z.string(),
  FirstName: z.string(),
  LastName: z.string(),
  Age: z.number(),
  Picture: z.string().nullable().optional(),
  ClubId: z.string().nullable().optional(),
  Club: ManagerClubRefSchema.nullable().optional(),
  // Observed as both real booleans and stringified booleans ("true") on
  // real data.
  NationalTeam: z.union([z.string(), z.boolean()]).nullable().optional(),
  NationalityId: z.string().nullable().optional(),
  Nationality: PlaceSchema.nullable().optional(),
  Records: z.array(z.unknown()).optional(),
  isEmployed: z.boolean(),
  PreferredFormation: z.string().nullable().optional(),
  PreferredStyle: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Manager = z.infer<typeof ManagerSchema>;
export type ManagerClubRef = z.infer<typeof ManagerClubRefSchema>;
