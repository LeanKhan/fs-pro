// packages/api-contract/src/routes/season.ts
//
// The monthly Season (docs/coc-mapping/04 §6, 05 §3): Objective points -> tiers,
// the Silver (free) / Gold (pass) tracks, and the Season Bank claim. The player
// season is the real calendar month (04 §12); the server resolves the season key.

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const clubParam = z.object({ clubId: z.string() });

const c = initContract();

export const seasonContract = c.router(
  {
    get: {
      method: 'GET',
      path: '/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(z.unknown()),
        404: failEnvelope(),
      },
    },
    claimObjective: {
      method: 'POST',
      path: '/:clubId/objective/:objectiveId/claim',
      pathParams: z.object({ clubId: z.string(), objectiveId: z.string() }),
      body: z.object({}).passthrough(),
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    claimPass: {
      method: 'POST',
      path: '/:clubId/pass/claim',
      pathParams: clubParam,
      body: z.object({ track: z.enum(['silver', 'gold']) }),
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    claimBank: {
      method: 'POST',
      path: '/:clubId/bank/claim',
      pathParams: clubParam,
      body: z.object({}).passthrough(),
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/season', strictStatusCodes: true }
);
