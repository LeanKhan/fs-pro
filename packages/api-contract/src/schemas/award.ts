import { z } from 'zod';
import { PlayerSchema } from './player';
import { ManagerSchema } from './manager';
import { ClubSchema } from './club';
import { SeasonSchema } from './season';

// Sourced from awards.model.ts's AwardInterface - no live award records
// existed in dev data to verify against directly (zero-length response for
// every season checked), so this stays close to the documented shape
// rather than claiming empirical verification.
export const AwardSchema = z.object({
  _id: z.string().optional(),
  Name: z.string(),
  Type: z.enum(['manager', 'player']),
  Period: z.enum(['season', 'year', 'all-time']),
  Category: z.string(),
  // Polymorphic - a Player or Manager depending on Type, populated only
  // when ?populate= requests it.
  RecipientId: z.string(),
  Recipient: z.union([PlayerSchema, ManagerSchema]).optional(),
  ClubId: z.string(),
  Club: ClubSchema.optional(),
  Remarks: z.string().optional(),
  SeasonId: z.string(),
  Season: SeasonSchema.optional(),
});

export type Award = z.infer<typeof AwardSchema>;
