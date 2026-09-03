// packages/api-contract/src/routes/competitions.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CompetitionSchema } from '../schemas/competition';
import { SeasonSchema } from '../schemas/season';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();

// Writable subset of Competition - excludes populate-only/server-computed
// fields.
const CompetitionWriteSchema = CompetitionSchema.omit({
  _id: true,
  Country: true,
  Clubs: true,
  Seasons: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const competitionsContract = c.router(
  {
    // `id`/`type` are the only real client filters (the previous arbitrary
    // `?query={...}` JSON blob had no other caller).
    getCompetitions: {
      method: 'GET',
      path: '/all',
      query: z.object({
        id: z.string().optional(),
        type: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(CompetitionSchema)),
        400: failEnvelope(),
      },
    },

    getCompetition: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        populate: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(CompetitionSchema),
        400: failEnvelope(),
      },
    },

    getCompetitionSeasons: {
      method: 'GET',
      path: '/:id/seasons/all',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(SeasonSchema)),
        400: failEnvelope(),
      },
    },

    // Plain fields only, no Mongo $push/$addToSet.
    updateCompetition: {
      method: 'POST',
      path: '/:id/update',
      pathParams: z.object({
        id: z.string(),
      }),
      body: CompetitionWriteSchema,
      responses: {
        200: successEnvelope(CompetitionSchema),
        400: failEnvelope(),
      },
    },

    deleteCompetition: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(CompetitionSchema),
        400: failEnvelope(),
      },
    },

    createCompetition: {
      method: 'POST',
      path: '/new',
      body: CompetitionWriteSchema,
      responses: {
        200: successEnvelope(CompetitionSchema),
        400: failEnvelope(),
      },
    },

    addClubToCompetition: {
      method: 'POST',
      path: '/:id/add-club',
      pathParams: z.object({
        id: z.string(),
      }),
      body: z.object({
        clubId: z.string(),
        leagueCode: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/competitions', strictStatusCodes: true }
);
