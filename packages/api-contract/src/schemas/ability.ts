// Gated abilities, traits and Manager Orders (docs/coc-mapping/02 §C, §D, §F;
// 03 §2). The Go registry is internal/abilities; these are the shared wire
// shapes a client reads, and the in-match order payload sim-core consumes.
import { z } from 'zod';

export const AbilityTriggerSchema = z.enum([
  'always',
  'inPossession',
  'outOfPossession',
  'minuteAtLeast',
  'trailing',
  'leading',
]);

export const AbilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  family: z.string(),
  minMastery: z.number().int().min(1).max(5),
  trigger: AbilityTriggerSchema,
});

export const MasterySchema = z.object({
  abilityId: z.string(),
  xp: z.number().int().min(0),
  tier: z.number().int().min(0).max(5),
  slots: z.number().int().min(0),
});

export const TraitRaritySchema = z.enum(['shiny', 'glowy', 'starry']);

export const TraitSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rarity: TraitRaritySchema,
});

export const OrderRegionSchema = z.object({
  x0: z.number(),
  x1: z.number(),
  y0: z.number(),
  y1: z.number(),
});

export const OrderSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  region: OrderRegionSchema.optional(),
  trigger: AbilityTriggerSchema.optional(),
});

export type Ability = z.infer<typeof AbilitySchema>;
export type Mastery = z.infer<typeof MasterySchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type Order = z.infer<typeof OrderSchema>;
