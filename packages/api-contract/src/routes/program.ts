// packages/api-contract/src/routes/program.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  ProgramChapterSchema,
  ProgramDismissTipSchema,
  ProgramLoanSchema,
  ProgramManagerListSchema,
  ProgramPlayerListSchema,
  ProgramScoutRevealSchema,
  ProgramSignResultSchema,
  ProgramStateSchema,
} from '../schemas/program';
import { ProgramAdvisorStateSchema, ProgramTipResponseSchema } from '../schemas/program-service';

const c = initContract();

const errors = {
  400: failEnvelope(),
  401: failEnvelope(),
  403: failEnvelope(),
  404: failEnvelope(),
  409: failEnvelope(),
} as const;

/**
 * The owner program (phase-2 OWNER-PROGRAM-SPEC §10.1): the server-side,
 * per-club onboarding state plus the manager and free-agent markets it drives.
 * Every money write is transactional; the Go program engine is called only to
 * evaluate/score, never to write.
 */
export const programContract = c.router(
  {
    /** The program state: step, stars, XP, the live evaluation of the current
     * step and the advisor's framing line. */
    getProgram: {
      method: 'GET',
      path: '/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      responses: { 200: successEnvelope(ProgramStateSchema), ...errors },
    },

    /** Re-check the current step's predicate and advance one step when it
     * holds (idempotent). */
    advanceProgram: {
      method: 'POST',
      path: '/:clubId/advance',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramStateSchema), ...errors },
    },

    /** Dismiss an advisor tip server-side (L9). */
    dismissTip: {
      method: 'POST',
      path: '/:clubId/tips/:tipId/dismiss',
      pathParams: z.object({ clubId: z.string(), tipId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramDismissTipSchema), ...errors },
    },

    /**
     * The one highest-priority eligible contextual advisor tip
     * (OWNER-PROGRAM-SPEC §4; PROGRAM-SERVICE-CONTRACT §6). Node is a thin
     * proxy: it re-derives the club's `StepFacts` from the DB and forwards the
     * owner's advisor memory to the pure Go `POST /program/tip` engine, so the
     * tip rules stay the single source of truth (L9). The client's advisor
     * store (components/cozy/advisor/use-advisor.ts) is the only caller.
     */
    tip: {
      method: 'POST',
      path: '/:clubId/tip',
      pathParams: z.object({ clubId: z.string() }),
      body: ProgramAdvisorStateSchema.extend({
        now: z.number(),
        /** Session events the DB cannot know (optional; the server derives
         * `playBlocked` from the PLAY-gate ledger when omitted). */
        events: z
          .object({
            playBlocked: z.boolean().optional(),
            sessionMinutes: z.number().optional(),
          })
          .optional(),
      }),
      responses: { 200: successEnvelope(ProgramTipResponseSchema), ...errors },
    },

    /** Browse the seeded manager pool; attributes masked to scouted ranges. */
    browseManagers: {
      method: 'GET',
      path: '/:clubId/managers',
      pathParams: z.object({ clubId: z.string() }),
      responses: { 200: successEnvelope(ProgramManagerListSchema), ...errors },
    },

    /** Pay INTERVIEW_FEE to reveal a manager's exact attributes; adds the
     * negotiation bonus to their signing fee. */
    interviewManager: {
      method: 'POST',
      path: '/:clubId/managers/:managerId/interview',
      pathParams: z.object({ clubId: z.string(), managerId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramScoutRevealSchema), ...errors },
    },

    /** Negotiate and sign a manager (money write; conditional budget debit). */
    signManager: {
      method: 'POST',
      path: '/:clubId/managers/:managerId/sign',
      pathParams: z.object({ clubId: z.string(), managerId: z.string() }),
      body: z.object({ contractYears: z.number().int().min(1).max(5).optional() }).optional(),
      responses: { 200: successEnvelope(ProgramSignResultSchema), ...errors },
    },

    /** Release the club's manager back into the pool. */
    releaseManager: {
      method: 'POST',
      path: '/:clubId/managers/:managerId/release',
      pathParams: z.object({ clubId: z.string(), managerId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramStateSchema), ...errors },
    },

    /** Browse free agents; ratings masked to ranges until scouted. */
    browsePlayers: {
      method: 'GET',
      path: '/:clubId/players',
      pathParams: z.object({ clubId: z.string() }),
      responses: { 200: successEnvelope(ProgramPlayerListSchema), ...errors },
    },

    /** Pay SCOUT_FEE to reveal a free agent's exact attributes. */
    scoutPlayer: {
      method: 'POST',
      path: '/:clubId/players/:playerId/scout',
      pathParams: z.object({ clubId: z.string(), playerId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramScoutRevealSchema), ...errors },
    },

    /** Sign a free agent at their Value (conditional budget + squad writes). */
    signPlayer: {
      method: 'POST',
      path: '/:clubId/players/:playerId/sign',
      pathParams: z.object({ clubId: z.string(), playerId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramSignResultSchema), ...errors },
    },

    /** Board advance (L7 recovery path): a thin wrapper over the existing
     * budget request. */
    requestLoan: {
      method: 'POST',
      path: '/:clubId/loan',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}).optional(),
      responses: { 200: successEnvelope(ProgramLoanSchema), ...errors },
    },

    /** Post-Level-1 chapter state (L8). */
    getProgramChapter: {
      method: 'GET',
      path: '/:clubId/chapter',
      pathParams: z.object({ clubId: z.string() }),
      responses: { 200: successEnvelope(ProgramChapterSchema), ...errors },
    },
  },
  { pathPrefix: '/program', strictStatusCodes: true }
);
