import { z } from 'zod';
import { PlayerSchema } from './player';
import { ManagerSchema } from './manager';
import { PlaceSchema } from './place';

// Verified against real GET /clubs/all?withPlayersAndManager=true and
// GET /clubs/:id responses, not just club.model.ts's ClubInterface (which
// declares a `User` populate field that's never actually returned by
// club.service.ts - dropped here rather than ported). assets/Stats/
// Transactions/Budget commonly come back null, not just absent.
export const ClubSchema = z.object({
  _id: z.string().optional(),
  Name: z.string(),
  ClubCode: z.string(),
  LeagueCode: z.string().nullable().optional(),
  LeagueId: z.string().nullable().optional(),
  AttackingClass: z.number(),
  DefensiveClass: z.number(),
  Players: z.array(PlayerSchema).optional(),
  assets: z
    .object({
      Kit: z.string().optional(),
      Logo: z.string().optional(),
      Stadium: z.string().optional(),
    })
    .nullable()
    .optional(),
  Rating: z.number(),
  GK_Rating: z.number(),
  ATT_Rating: z.number(),
  DEF_Rating: z.number(),
  MID_Rating: z.number(),
  ManagerId: z.string().nullable().optional(),
  Manager: ManagerSchema.nullable().optional(),
  Stadium: z
    .object({
      Name: z.string().optional(),
      Capacity: z.union([z.string(), z.number()]).optional(),
      YearOccupied: z.union([z.string(), z.number()]).optional(),
      Location: z.string().optional(),
    })
    .nullable()
    .optional(),
  Stats: z
    .object({
      LeagueTitles: z.number().optional(),
      Cups: z.number().optional(),
      MatchesWon: z.number().optional(),
      MatchesLost: z.number().optional(),
      MatchesDrawn: z.number().optional(),
    })
    .nullable()
    .optional(),
  /** `Country` is legacy/unused per club.model.ts's own doc comment - the
   * FK lives in AddressCountryId, populated Place surfaces separately under
   * AddressCountry. Not observed on real data. */
  Address: z
    .object({
      Section: z.string().optional(),
      City: z.string().optional(),
      Country: z.string().optional(),
    })
    .nullable()
    .optional(),
  AddressCountryId: z.string().nullable().optional(),
  AddressCountry: PlaceSchema.nullable().optional(),
  UserId: z.string().nullable().optional(),
  Budget: z.number().nullable().optional(),
  Transactions: z.unknown().nullable().optional(),
  Records: z.array(z.unknown()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Club = z.infer<typeof ClubSchema>;
