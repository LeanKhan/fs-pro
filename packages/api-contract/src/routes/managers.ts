// packages/api-contract/src/routes/managers.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ManagerSchema } from '../schemas/manager';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';

const c = initContract();

// Writable subset of Manager - excludes populate-only/server-computed
// fields.
const ManagerWriteSchema = ManagerSchema.omit({
  _id: true,
  Club: true,
  Nationality: true,
  Records: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const managersContract = c.router(
  {
    // `options` used to be an arbitrary JSON-blob query param - the only
    // real caller only ever sent { isEmployed }, so this is now a plain
    // typed param (same treatment as clubs/competitions/fixtures' own
    // former JSON-blob filters).
    getManagers: {
      method: 'GET',
      path: '/',
      query: z.object({
        isEmployed: booleanQuery().optional(),
        clubId: z.string().optional(),
        populate: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(ManagerSchema)),
        400: failEnvelope(),
      },
    },

    getUnemployedManagers: {
      method: 'GET',
      path: '/unemployed',
      responses: {
        200: successEnvelope(z.array(ManagerSchema)),
        400: failEnvelope(),
      },
    },

    getManager: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      query: z.object({
        populate: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(ManagerSchema),
        400: failEnvelope(),
      },
    },

    /** Deletes the Manager, and if they're currently employed, records
     * their departure on the Club they're leaving first. */
    deleteManager: {
      method: 'DELETE',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(ManagerSchema),
        400: failEnvelope(),
      },
    },

    updateManager: {
      method: 'PUT',
      path: '/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      body: ManagerWriteSchema,
      responses: {
        200: successEnvelope(ManagerSchema),
        400: failEnvelope(),
      },
    },

    createManager: {
      method: 'POST',
      path: '/',
      body: ManagerWriteSchema,
      responses: {
        200: successEnvelope(ManagerSchema),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/managers', strictStatusCodes: true }
);
