// packages/api-contract/src/fixtures.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ClubSchema } from '../schemas/club';

const c = initContract();

export const clubsContract = c.router({
  getClubs: {
    method: 'GET',
    path: '/all',
    query: z.object({
      ids: z.string().optional(),
      unclaimed: z.coerce.boolean().optional(),
      withPlayersAndManager: z.coerce.boolean().optional(),
    }),
    responses: {
      200: z.object({
        success: z.literal(true),
        message: z.string(),
        payload: z.array(ClubSchema),
      }),

      400: z.object({
        success: z.literal(false),
        message: z.string(),
        payload: z.unknown().optional(),
      }),
    },
  },

  getClub: {
    method: 'GET',
    path: '/:id',
    pathParams: z.object({
      id: z.string(),
    }),
    query: z.object({
      populate: z.string().optional(),
    }),
    responses: {
      200: z.object({
        success: z.literal(true),
        message: z.string(),
        payload: ClubSchema,
      }),

      404: z.object({
        success: z.literal(false),
        message: z.string(),
      }),
    },
  },
});
