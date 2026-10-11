// packages/api-contract/src/schemas/preseason.ts
//
// The Pre-Season Tour onboarding rail (docs/coc-mapping/02 §J, 04 §8, 06 P9):
// a fixed ladder of AI stages with escalating difficulty, 3★ per stage and
// guaranteed, ledgered rewards. Mirrors internal/preseason's read model exactly.
import { z } from 'zod';

export const PreseasonRewardSchema = z.object({
  cash: z.number(),
  fans: z.number().int(),
  scoutTokens: z.number().int(),
  sponsorCredits: z.number().int(),
});

export const PreseasonStageSchema = z.object({
  index: z.number().int().min(1),
  code: z.string(),
  name: z.string(),
  opponent: z.string(),
  /** The opponent's squad rating; the escalating difficulty signal. */
  rating: z.number().int().min(0),
  requiredStars: z.number().int().min(1).max(3),
  reward: PreseasonRewardSchema,
  bestStars: z.number().int().min(0).max(3),
  attempts: z.number().int().min(0),
  cleared: z.boolean(),
  claimed: z.boolean(),
  unlocked: z.boolean(),
});

export const PreseasonOnboardingStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  hint: z.string(),
  done: z.boolean(),
});

export const PreseasonProgressSchema = z.object({
  clubId: z.string(),
  name: z.string(),
  stages: z.array(PreseasonStageSchema),
  /** Consecutive stages cleared from stage 1. */
  cleared: z.number().int().min(0),
  total: z.number().int().min(0),
  totalStars: z.number().int().min(0),
  onboarding: z.array(PreseasonOnboardingStepSchema),
  onboardingComplete: z.boolean(),
  /** The next playable stage, or null when the ladder is complete. */
  nextStage: z.number().int().min(1).nullable(),
});

export const PreseasonPlayRequestSchema = z.object({
  stage: z.number().int().min(1),
  watch: z.boolean().optional(),
  orders: z.array(z.unknown()).optional(),
  layout: z.unknown().optional(),
  effects: z.record(z.array(z.unknown())).optional(),
});

export const PreseasonClaimRequestSchema = z.object({
  stage: z.number().int().min(1),
});

export const PreseasonPlayResultSchema = z.object({
  stage: z.number().int().min(1),
  cleared: z.boolean(),
  stars: z.number().int().min(0).max(3),
  bestStars: z.number().int().min(0).max(3),
  score: z.object({ you: z.number().int(), them: z.number().int() }),
  reward: PreseasonRewardSchema,
  claimable: z.boolean(),
  progress: PreseasonProgressSchema,
});

export const PreseasonClaimResultSchema = z.object({
  stage: z.number().int().min(1),
  granted: PreseasonRewardSchema,
  progress: PreseasonProgressSchema,
});

export type PreseasonReward = z.infer<typeof PreseasonRewardSchema>;
export type PreseasonStage = z.infer<typeof PreseasonStageSchema>;
export type PreseasonOnboardingStep = z.infer<typeof PreseasonOnboardingStepSchema>;
export type PreseasonProgress = z.infer<typeof PreseasonProgressSchema>;
export type PreseasonPlayResult = z.infer<typeof PreseasonPlayResultSchema>;
export type PreseasonClaimResult = z.infer<typeof PreseasonClaimResultSchema>;
