// The monthly Season: Objectives, the Silver/Gold Season Pass track and the
// Season Bank (docs/coc-mapping/04 §6). The Go core is internal/seasonpass; the
// season key is the real-time calendar month (04 §12).
import { z } from 'zod';

export const SeasonTrackSchema = z.enum(['silver', 'gold']);

export const SeasonPassSchema = z.object({
  seasonKey: z.string(),
  points: z.number().int().min(0),
  tier: z.number().int().min(0),
  maxTier: z.number().int().min(0),
  nextThreshold: z.number().int().min(0),
  hasPass: z.boolean(),
  silverClaimedTier: z.number().int().min(0),
  goldClaimedTier: z.number().int().min(0),
  endsAt: z.string().nullable(),
});

export const SeasonBankSchema = z.object({
  seasonKey: z.string(),
  accrued: z.number(),
  claimed: z.number(),
  claimable: z.number(),
});

export const SeasonObjectiveSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  points: z.number().int().min(0),
  goal: z.number().int().min(1),
  progress: z.number().int().min(0),
  complete: z.boolean(),
});

export type SeasonTrack = z.infer<typeof SeasonTrackSchema>;
export type SeasonPass = z.infer<typeof SeasonPassSchema>;
export type SeasonBank = z.infer<typeof SeasonBankSchema>;
export type SeasonObjective = z.infer<typeof SeasonObjectiveSchema>;
