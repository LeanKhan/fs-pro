// packages/api-contract/src/routes/seasons.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { SeasonSchema, StandingLineSchema } from '../schemas/season';
import { FixtureSchema } from '../schemas/fixture';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';

const c = initContract();

export const seasonsContract = c.router(
  {
    // Seasons are open-play editions. Filters: competition, and `current`
    // (open for entry or running).
    getSeasons: {
      method: 'GET',
      path: '/',
      query: z.object({
        competition: z.string().optional(),
        current: booleanQuery().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(SeasonSchema)),
        400: failEnvelope(),
      },
    },

    getSeasonFixtures: {
      method: 'GET',
      path: '/:id/fixtures',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(FixtureSchema)),
        400: failEnvelope(),
      },
    },

    getSeason: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(SeasonSchema.nullable()),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** An edition's table as one flat list, best first (see
     * ranking.service.ts's editionStandings). */
    getSeasonStandings: {
      method: 'GET',
      path: '/:id/standings',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(StandingLineSchema)),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    deleteSeason: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/seasons', strictStatusCodes: true }
);
