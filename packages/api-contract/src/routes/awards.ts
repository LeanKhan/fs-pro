// packages/api-contract/src/routes/awards.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { AwardSchema } from '../schemas/award';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();

export const awardsContract = c.router(
  {
    getSeasonAwards: {
      method: 'GET',
      path: '/season/:season_id',
      pathParams: z.object({
        season_id: z.string(),
      }),
      query: z.object({
        recipient: z.enum(['player', 'manager']),
        populate: z.enum(['club', 'club-season']).optional(),
      }),
      responses: {
        200: successEnvelope(z.array(AwardSchema)),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/awards', strictStatusCodes: true }
);
