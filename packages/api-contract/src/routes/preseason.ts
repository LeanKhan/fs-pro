// packages/api-contract/src/routes/preseason.ts
//
// The Pre-Season Tour routes (docs/coc-mapping/05 §3, 02 §J, 06 P9): the club's
// onboarding-rail progress, resolving one stage against its server-owned AI
// opponent, and claiming a cleared stage's guaranteed reward once.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { PreseasonClaimResultSchema, PreseasonPlayResultSchema, PreseasonProgressSchema } from '../schemas/preseason';

const clubParam = z.object({ clubId: z.string() });

const c = initContract();

export const preseasonContract = c.router(
  {
    /** The club's Pre-Season Tour progress: the fixed ladder with per-stage
     * best stars/claim state and the scripted onboarding checklist. */
    get: {
      method: 'GET',
      path: '/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(PreseasonProgressSchema),
        404: failEnvelope(),
      },
    },

    /** Resolve one stage against its server-owned AI opponent through the raid
     * path. Clears the stage with a 3★ result; a locked stage is a 409. */
    play: {
      method: 'POST',
      path: '/:clubId/play',
      pathParams: clubParam,
      body: z.object({
        stage: z.number().int().min(1),
        watch: z.boolean().optional(),
        orders: z.array(z.unknown()).optional(),
        layout: z.unknown().optional(),
        effects: z.record(z.array(z.unknown())).optional(),
      }),
      responses: {
        200: successEnvelope(PreseasonPlayResultSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Claim a cleared stage's guaranteed reward. Once per stage: a second
     * claim is a 409. Every currency gets a TransferLedger row. */
    claim: {
      method: 'POST',
      path: '/:clubId/claim',
      pathParams: clubParam,
      body: z.object({ stage: z.number().int().min(1) }),
      responses: {
        200: successEnvelope(PreseasonClaimResultSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/preseason', strictStatusCodes: true }
);
