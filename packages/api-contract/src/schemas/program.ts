import { z } from 'zod';
import { AdvisorLineSchema } from './program-service';

/**
 * Client-facing owner-program shapes (phase-2 OWNER-PROGRAM-SPEC §10.1). These
 * are served by the Node API (`/program/*`), unlike the Go-boundary shapes in
 * `program-service.ts`. Money is stored Villa units (L13); the client formats.
 */

/** The persisted step, including the two states that never cross the Go
 * boundary: `not_started` and `done`. */
export const ProgramStepSchema = z.enum([
  'not_started',
  'manager',
  'players',
  'facilities',
  'level1',
  'done',
]);

/** 1-3 stars per completed step, keyed by step id. */
export const ProgramStepStarsSchema = z.record(z.string(), z.number().int().min(1).max(3));

/** A hidden attribute shown as a scouted range until the owner pays to reveal
 * it (OWNER-PROGRAM-SPEC §4 step 1/2). */
export const AttributeRangeSchema = z.object({
  low: z.number().int(),
  high: z.number().int(),
});

export const ProgramManagerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().int(),
  nationalityId: z.string().nullable(),
  preferredFormation: z.string().nullable(),
  preferredStyle: z.string().nullable(),
  /** Hidden until an interview reveals the exact values. */
  overall: AttributeRangeSchema,
  tactics: AttributeRangeSchema,
  motivation: AttributeRangeSchema,
  development: AttributeRangeSchema,
  discipline: AttributeRangeSchema,
  interviewed: z.boolean(),
  signingFee: z.number(),
  /** The fee actually payable now (negotiated down 10% after an interview). */
  effectiveFee: z.number(),
  wage: z.number(),
});

export const ProgramPlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().int().nullable(),
  position: z.string().nullable(),
  nationalityId: z.string().nullable(),
  /** Hidden until scouted: the true rating is never shown to a Level-0
   * program club, only the range. */
  rating: AttributeRangeSchema,
  scouted: z.boolean(),
  value: z.number(),
  wage: z.number(),
});

/** The exact attributes returned after paying for a reveal. */
export const ProgramScoutRevealSchema = z.object({
  managers: z
    .object({
      id: z.string(),
      overall: z.number().int(),
      tactics: z.number().int(),
      motivation: z.number().int(),
      development: z.number().int(),
      discipline: z.number().int(),
      signingFee: z.number(),
      wage: z.number(),
    })
    .optional(),
  players: z
    .object({
      id: z.string(),
      rating: z.number(),
      attributes: z.record(z.string(), z.number()),
      value: z.number(),
      wage: z.number(),
    })
    .optional(),
});

export const ProgramStateSchema = z.object({
  clubId: z.string(),
  step: ProgramStepSchema,
  stepStars: ProgramStepStarsSchema,
  programXp: z.number().int(),
  startingBalance: z.number(),
  budget: z.number(),
  /** The current step's live evaluation (contract §3). */
  completed: z.boolean(),
  stars: z.number().int().min(0).max(3),
  xp: z.number().int(),
  reasons: z.array(z.string()),
  advisor: AdvisorLineSchema.nullable(),
  chapter: z.string().nullable(),
});

export const ProgramManagerListSchema = z.object({
  managers: z.array(ProgramManagerSchema),
  /** The owner's cash, so the client can show affordability without a second read. */
  budget: z.number(),
  interviewFee: z.number(),
});

export const ProgramPlayerListSchema = z.object({
  players: z.array(ProgramPlayerSchema),
  budget: z.number(),
  scoutFee: z.number(),
  /** How many more legal-XI players the club still needs (0 once legal). */
  needed: z.number().int(),
});

export const ProgramSignResultSchema = z.object({
  state: ProgramStateSchema,
  /** The fee actually paid (after any interview negotiation). */
  paid: z.number(),
});

export const ProgramDismissTipSchema = z.object({
  dismissed: z.array(z.string()),
});

export const ProgramChapterSchema = z.object({
  chapter: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  /** The chapter's target description and whether it is met. */
  target: z.string().nullable(),
  complete: z.boolean(),
});

export const ProgramLoanSchema = z.object({
  granted: z.boolean(),
  amount: z.number(),
  state: ProgramStateSchema,
});

export type ProgramStep = z.infer<typeof ProgramStepSchema>;
export type ProgramStepStars = z.infer<typeof ProgramStepStarsSchema>;
export type AttributeRange = z.infer<typeof AttributeRangeSchema>;
export type ProgramManager = z.infer<typeof ProgramManagerSchema>;
export type ProgramPlayer = z.infer<typeof ProgramPlayerSchema>;
export type ProgramScoutReveal = z.infer<typeof ProgramScoutRevealSchema>;
export type ProgramState = z.infer<typeof ProgramStateSchema>;
export type ProgramManagerList = z.infer<typeof ProgramManagerListSchema>;
export type ProgramPlayerList = z.infer<typeof ProgramPlayerListSchema>;
export type ProgramSignResult = z.infer<typeof ProgramSignResultSchema>;
export type ProgramDismissTip = z.infer<typeof ProgramDismissTipSchema>;
export type ProgramChapter = z.infer<typeof ProgramChapterSchema>;
export type ProgramLoan = z.infer<typeof ProgramLoanSchema>;
