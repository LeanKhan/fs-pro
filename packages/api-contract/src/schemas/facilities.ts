import { z } from 'zod';

export const AssetStateSchema = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  level: z.number(),
  maxLevel: z.number(),
  effectLabel: z.string(),
  effects: z.record(z.string(), z.number()),
  /** Set while an upgrade is being built. */
  upgrade: z
    .object({
      toLevel: z.number(),
      startAt: z.string(),
      completeAt: z.string(),
      secondsLeft: z.number(),
    })
    .nullable(),
  /** The next level's price and whether it can be started now; null at max level. */
  next: z
    .object({
      level: z.number(),
      cost: z.number(),
      minutes: z.number(),
      effectLabel: z.string(),
      blockedReason: z.string().nullable(),
    })
    .nullable(),
});

export const CampusSchema = z.object({
  clubId: z.string(),
  budget: z.number(),
  maxConcurrentUpgrades: z.number(),
  activeUpgrades: z.number(),
  assets: z.array(AssetStateSchema),
});

export type AssetState = z.infer<typeof AssetStateSchema>;
export type Campus = z.infer<typeof CampusSchema>;
