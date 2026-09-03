// packages/api-contract/src/routes/fixtures.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { FixtureSchema } from '../schemas/fixture';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';

const c = initContract();

export const fixturesContract = c.router(
  {
    getFixtures: {
      method: 'GET',
      path: '/',
      query: z.object({
        season: z.string().optional(),
        scheduledDay: z.coerce.number().optional(),
        scheduledDayFrom: z.coerce.number().optional(),
        scheduledDayTo: z.coerce.number().optional(),
        played: booleanQuery().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(FixtureSchema)),
        400: failEnvelope(),
      },
    },

    getFixture: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(FixtureSchema),
        400: failEnvelope(),
      },
    },

    deleteFixture: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(FixtureSchema),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/fixtures', strictStatusCodes: true }
);
