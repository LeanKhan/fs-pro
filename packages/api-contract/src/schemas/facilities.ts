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

export const MedicalPlayerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string(),
  age: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  fitness: z.number(),
  injury: z
    .object({
      type: z.string(),
      daysRemaining: z.number(),
    })
    .nullable()
    .optional(),
});

export const MedicalStatusSchema = z.object({
  facilityLevel: z.number(),
  treatmentBays: z.number(),
  baysAvailable: z.number(),
  squadRecovery: z.object({
    available: z.boolean(),
    cooldownSeconds: z.number(),
    cost: z.number(),
  }),
  costs: z.object({
    squadRecovery: z.number(),
    rehab: z.number(),
    hyperbaric: z.number(),
    surgery: z.number(),
  }),
  injuredPlayers: z.array(MedicalPlayerSummarySchema),
  fatiguedPlayers: z.array(MedicalPlayerSummarySchema),
});

export const PlayerTreatmentRequestSchema = z.object({
  playerId: z.string(),
  treatmentType: z.enum(['rehab', 'hyperbaric', 'surgery']),
});

export const PlayerTreatmentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cost: z.number(),
  player: MedicalPlayerSummarySchema,
  remainingBudget: z.number(),
});

export const SquadRecoveryResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cost: z.number(),
  playersRecovered: z.number(),
  remainingBudget: z.number(),
});

export type MedicalPlayerSummary = z.infer<typeof MedicalPlayerSummarySchema>;
export type MedicalStatus = z.infer<typeof MedicalStatusSchema>;
export type PlayerTreatmentRequest = z.infer<typeof PlayerTreatmentRequestSchema>;
export type PlayerTreatmentResponse = z.infer<typeof PlayerTreatmentResponseSchema>;
export type SquadRecoveryResponse = z.infer<typeof SquadRecoveryResponseSchema>;
