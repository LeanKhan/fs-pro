// packages/api-contract/src/routes/meta.ts

import { initContract } from '@ts-rest/core';
import { DbStatusSchema } from '../schemas/meta';
import { successEnvelope } from '../schemas/envelope';

const c = initContract();

export const metaContract = c.router(
  {
    getDbStatus: {
      method: 'GET',
      path: '/db',
      responses: {
        200: successEnvelope(DbStatusSchema),
      },
    },
  },
  { pathPrefix: '/meta', strictStatusCodes: true }
);
