// packages/api-contract/src/routes/legacy.ts
//
// Club Legacy (docs/coc-mapping/02 §K, 04 §2): the long-horizon objective chain
// that grants the 6th Groundskeeper, plus the Club Honours list (02 §I).

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const clubParam = z.object({ clubId: z.string() });

const c = initContract();

export const legacyContract = c.router(
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
    claim: {
      method: 'POST',
      path: '/:clubId/claim',
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
  { pathPrefix: '/legacy', strictStatusCodes: true }
);

export const honoursContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(z.unknown()),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/honours', strictStatusCodes: true }
);
