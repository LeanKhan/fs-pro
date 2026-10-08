import { z } from 'zod';

/**
 * Owner-program engine HTTP contract (services/world-service/internal/program,
 * Go). These are Go-endpoint shapes, frozen in
 * docs/perfect/phase-2/PROGRAM-SERVICE-CONTRACT.md and mirrored field-for-field
 * in Go (R6). Node does NOT serve them as ts-rest routes: it calls them through
 * services/world/world-service.client.ts (server-to-server). Shapes use
 * camelCase JSON exactly as the contract writes them; ids are strings.
 */

/** The four active program steps; `done` is a `nextStep` answer only. */
export const ProgramStepSchema = z.enum(['manager', 'players', 'facilities', 'level1']);
export const ProgramNextStepSchema = z.enum(['manager', 'players', 'facilities', 'level1', 'done']);

export const ProgramManagerFactsSchema = z.object({
  overall: z.number().int(),
  tactics: z.number().int(),
  motivation: z.number().int(),
  development: z.number().int(),
  discipline: z.number().int(),
  signingFee: z.number(),
  wage: z.number(),
  contractYears: z.number().int(),
});

export const ProgramSquadFactsSchema = z.object({
  total: z.number().int(),
  gk: z.number().int(),
  def: z.number().int(),
  mid: z.number().int(),
  att: z.number().int(),
  medianRating: z.number(),
});

export const ProgramAssetFactsSchema = z.object({
  type: z.string(),
  tier: z.number().int(),
  upgradingTo: z.number().int().nullable(),
  hasEffect: z.boolean(),
});

export const ProgramFriendlyFactsSchema = z.object({
  wins: z.number().int(),
  draws: z.number().int(),
  losses: z.number().int(),
});

export const ProgramScoutFactsSchema = z.object({
  managersBrowsed: z.number().int(),
  interviewedManagerIds: z.array(z.string()),
  scoutedPlayerIds: z.array(z.string()),
});

export const ProgramEventFactsSchema = z.object({
  playBlocked: z.boolean(),
  sessionMinutes: z.number(),
  programCompletedOnce: z.boolean(),
});

/** The pure input snapshot (contract §1.2). */
export const ProgramStepFactsSchema = z.object({
  step: ProgramStepSchema,
  startingBalance: z.number(),
  budget: z.number(),
  manager: ProgramManagerFactsSchema.nullable(),
  squad: ProgramSquadFactsSchema,
  assets: z.array(ProgramAssetFactsSchema),
  programXp: z.number().int(),
  clubXp: z.number().int(),
  friendlies: ProgramFriendlyFactsSchema,
  scout: ProgramScoutFactsSchema,
  events: ProgramEventFactsSchema,
});

export const AdvisorExprSchema = z.enum(['neutral', 'happy', 'excited', 'worried', 'thinking']);
export const AdvisorPoseSchema = z.enum(['idle', 'point-right', 'point-left']);

/** One advisor line (contract §1.3). */
export const AdvisorLineSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  expr: AdvisorExprSchema,
  pose: AdvisorPoseSchema,
  target: z.string().nullable(),
  priority: z.number().int(),
  dismissible: z.boolean(),
  maxShows: z.number().int(),
  cooldownSeconds: z.number().int(),
  once: z.boolean(),
});

// ---------------------------------------------------------------------------
// GET /program/steps
// ---------------------------------------------------------------------------

export const ProgramStepInfoSchema = z.object({
  id: ProgramStepSchema,
  order: z.number().int(),
  rewards: z.record(z.string(), z.number().int()),
  starLabels: z.record(z.string(), z.string()),
  advisorRules: z.array(z.string()),
});

export const ProgramMatchXpSchema = z.object({
  win: z.number().int(),
  draw: z.number().int(),
  loss: z.number().int(),
});

export const ProgramFeesSchema = z.object({
  interview: z.number().int(),
  scout: z.number().int(),
});

export const ProgramStepsConfigSchema = z.object({
  steps: z.array(ProgramStepInfoSchema),
  programXpCap: z.number().int(),
  level1Xp: z.number().int(),
  matchXp: ProgramMatchXpSchema,
  fees: ProgramFeesSchema,
});

// ---------------------------------------------------------------------------
// POST /program/evaluate
// ---------------------------------------------------------------------------

export const ProgramEvaluateRequestSchema = z.object({
  step: ProgramStepSchema,
  facts: ProgramStepFactsSchema,
});

export const ProgramEvaluationSchema = z.object({
  step: ProgramStepSchema,
  completed: z.boolean(),
  stars: z.number().int().min(0).max(3),
  xp: z.number().int(),
  programXp: z.number().int(),
  reasons: z.array(z.string()),
  advisor: z.array(AdvisorLineSchema),
});

// ---------------------------------------------------------------------------
// POST /program/next
// ---------------------------------------------------------------------------

export const ProgramNextRequestSchema = z.object({
  step: ProgramNextStepSchema,
  facts: ProgramStepFactsSchema,
});

export const ProgramNextResponseSchema = z.object({
  step: ProgramNextStepSchema,
  completed: z.boolean(),
  nextStep: ProgramNextStepSchema,
});

// ---------------------------------------------------------------------------
// POST /program/tip
// ---------------------------------------------------------------------------

export const ProgramAdvisorStateSchema = z.object({
  shows: z.record(z.string(), z.number().int()),
  lastShownAt: z.record(z.string(), z.number()),
  dismissed: z.array(z.string()),
  quiet: z.boolean(),
});

export const ProgramTipRequestSchema = z.object({
  facts: ProgramStepFactsSchema,
  advisor: ProgramAdvisorStateSchema,
  now: z.number(),
});

export const ProgramTipResponseSchema = z.object({ tip: AdvisorLineSchema.nullable() });

// ---------------------------------------------------------------------------
// POST /program/simulate
// ---------------------------------------------------------------------------

export const ProgramStrategySchema = z.enum([
  'random',
  'facilities_first',
  'splurge_on_manager',
  'all_in_on_players',
  'balanced_expert',
]);

export const ProgramSimulateRequestSchema = z.object({
  balance: z.number().min(1_000_000).max(5_000_000),
  strategy: ProgramStrategySchema,
  runs: z.number().int().min(1).max(100_000),
  seed: z.number().int(),
});

export const ProgramPercentilesSchema = z.object({
  p10: z.number(),
  median: z.number(),
  p90: z.number(),
  mean: z.number(),
});

export const ProgramHistogramBucketSchema = z.object({
  bucket: z.string(),
  count: z.number().int(),
});

export const ProgramSimulationReportSchema = z.object({
  balance: z.number(),
  strategy: ProgramStrategySchema,
  runs: z.number().int(),
  seed: z.number(),
  timeToLevel1Minutes: ProgramPercentilesSchema,
  matches: ProgramPercentilesSchema,
  starDistribution: z.record(z.string(), z.number().int()),
  finalSquadRating: ProgramPercentilesSchema,
  finalCash: ProgramPercentilesSchema,
  finalTiers: z.record(z.string(), z.number().int()),
  bankrupt: z.number().int(),
  recovery: z.number().int(),
  softLocked: z.number().int(),
  histogram: z.array(ProgramHistogramBucketSchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ProgramStep = z.infer<typeof ProgramStepSchema>;
export type ProgramNextStep = z.infer<typeof ProgramNextStepSchema>;
export type ProgramManagerFacts = z.infer<typeof ProgramManagerFactsSchema>;
export type ProgramSquadFacts = z.infer<typeof ProgramSquadFactsSchema>;
export type ProgramAssetFacts = z.infer<typeof ProgramAssetFactsSchema>;
export type ProgramFriendlyFacts = z.infer<typeof ProgramFriendlyFactsSchema>;
export type ProgramScoutFacts = z.infer<typeof ProgramScoutFactsSchema>;
export type ProgramEventFacts = z.infer<typeof ProgramEventFactsSchema>;
export type ProgramStepFacts = z.infer<typeof ProgramStepFactsSchema>;
export type AdvisorExpr = z.infer<typeof AdvisorExprSchema>;
export type AdvisorPose = z.infer<typeof AdvisorPoseSchema>;
export type AdvisorLine = z.infer<typeof AdvisorLineSchema>;
export type ProgramStepInfo = z.infer<typeof ProgramStepInfoSchema>;
export type ProgramStepsConfig = z.infer<typeof ProgramStepsConfigSchema>;
export type ProgramEvaluateRequest = z.infer<typeof ProgramEvaluateRequestSchema>;
export type ProgramEvaluation = z.infer<typeof ProgramEvaluationSchema>;
export type ProgramNextRequest = z.infer<typeof ProgramNextRequestSchema>;
export type ProgramNextResponse = z.infer<typeof ProgramNextResponseSchema>;
export type ProgramAdvisorState = z.infer<typeof ProgramAdvisorStateSchema>;
export type ProgramTipRequest = z.infer<typeof ProgramTipRequestSchema>;
export type ProgramTipResponse = z.infer<typeof ProgramTipResponseSchema>;
export type ProgramStrategy = z.infer<typeof ProgramStrategySchema>;
export type ProgramSimulateRequest = z.infer<typeof ProgramSimulateRequestSchema>;
export type ProgramPercentiles = z.infer<typeof ProgramPercentilesSchema>;
export type ProgramHistogramBucket = z.infer<typeof ProgramHistogramBucketSchema>;
export type ProgramSimulationReport = z.infer<typeof ProgramSimulationReportSchema>;
