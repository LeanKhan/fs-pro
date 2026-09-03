// packages/api-contract/src/routes/places.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { PlaceSchema } from '../schemas/place';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();

const PlaceWriteSchema = PlaceSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const placesContract = c.router(
  {
    // `options` used to be an arbitrary JSON-blob query param - replaced
    // with plain typed params matching IPlaceFilter (same treatment as
    // clubs/competitions/managers/fixtures' former JSON-blob filters).
    getPlaces: {
      method: 'GET',
      path: '/',
      query: z.object({
        type: z.string().optional(),
        code: z.string().optional(),
        name: z.string().optional(),
        region: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(PlaceSchema)),
        400: failEnvelope(),
      },
    },

    getCountries: {
      method: 'GET',
      path: '/country',
      responses: {
        200: successEnvelope(z.array(PlaceSchema)),
        400: failEnvelope(),
      },
    },

    getPlace: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(PlaceSchema),
        400: failEnvelope(),
      },
    },

    /** Matched against both Name and Code. */
    getPlaceByName: {
      method: 'GET',
      path: '/name/:name',
      pathParams: z.object({
        name: z.string(),
      }),
      responses: {
        200: successEnvelope(PlaceSchema),
        400: failEnvelope(),
      },
    },

    updatePlace: {
      method: 'PUT',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      body: PlaceWriteSchema,
      responses: {
        200: successEnvelope(PlaceSchema),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/places', strictStatusCodes: true }
);
