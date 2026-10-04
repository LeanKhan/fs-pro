// packages/api-contract/src/routes/atlas.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  AtlasCountrySchema,
  AtlasSchema,
  AtlasTownSchema,
  FoundClubSchema,
  FoundCountrySchema,
  FoundedClubSchema,
  FoundTownSchema,
  NameCheckSchema,
} from '../schemas/atlas';

const c = initContract();

const writeErrors = {
  400: failEnvelope(),
  401: failEnvelope(),
  403: failEnvelope(),
  404: failEnvelope(),
  409: failEnvelope(),
};

/** The world atlas, and founding countries, towns and clubs in it. Anyone
 * signed in may found, within FOUNDING_LIMITS (world-geo.ts). */
export const atlasContract = c.router(
  {
    getAtlas: {
      method: 'GET',
      path: '',
      responses: { 200: successEnvelope(AtlasSchema), 400: failEnvelope() },
    },

    /** Live validation for the founding forms: is this name/code free? */
    checkName: {
      method: 'GET',
      path: '/check',
      query: z.object({
        kind: z.enum(['country', 'town', 'club']),
        name: z.string(),
        code: z.string().optional(),
        countryId: z.string().optional(),
      }),
      responses: { 200: successEnvelope(NameCheckSchema), 400: failEnvelope() },
    },

    foundCountry: {
      method: 'POST',
      path: '/countries',
      body: FoundCountrySchema,
      responses: { 200: successEnvelope(AtlasCountrySchema), ...writeErrors },
    },

    foundTown: {
      method: 'POST',
      path: '/towns',
      body: FoundTownSchema,
      responses: { 200: successEnvelope(AtlasTownSchema), ...writeErrors },
    },

    /** Found a club in a town: Level 0, a raw starting squad, a small budget
     * and the user as its owner. */
    foundClub: {
      method: 'POST',
      path: '/clubs',
      body: FoundClubSchema,
      responses: { 200: successEnvelope(FoundedClubSchema), ...writeErrors },
    },
  },
  { pathPrefix: '/atlas' }
);
