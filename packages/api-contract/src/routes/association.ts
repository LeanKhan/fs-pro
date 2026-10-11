// packages/api-contract/src/routes/association.ts
//
// Associations & Derbies (docs/coc-mapping/02 §G, 05 §3): the <=50-club social
// group, loans, the Derby lifecycle, the Association League, weekly Directives,
// and the shared Association Grounds / Festival Weekend. Mutating route inputs
// are validated server-side; the request bodies are permissive here because the
// authoritative shape lives in internal/association.

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();
const looseBody = z.object({}).passthrough();

export const associationContract = c.router(
  {
    create: {
      method: 'POST',
      path: '/associations',
      body: looseBody,
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        409: failEnvelope(),
      },
    },
    get: {
      method: 'GET',
      path: '/associations/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: successEnvelope(z.unknown()),
        404: failEnvelope(),
      },
    },
    join: {
      method: 'POST',
      path: '/associations/:id/join',
      pathParams: z.object({ id: z.string() }),
      body: looseBody,
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    leave: {
      method: 'POST',
      path: '/associations/:id/leave',
      pathParams: z.object({ id: z.string() }),
      body: looseBody,
      responses: {
        200: successEnvelope(z.unknown()),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },
    loan: {
      method: 'POST',
      path: '/associations/:id/loans',
      pathParams: z.object({ id: z.string() }),
      body: looseBody,
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    derby: {
      method: 'POST',
      path: '/associations/:id/derby/:derbyId',
      pathParams: z.object({ id: z.string(), derbyId: z.string() }),
      body: looseBody,
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    directives: {
      method: 'GET',
      path: '/associations/:id/directives',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: successEnvelope(z.unknown()),
        404: failEnvelope(),
      },
    },
    claimDirective: {
      method: 'POST',
      path: '/associations/:id/directives/:directiveId/claim',
      pathParams: z.object({ id: z.string(), directiveId: z.string() }),
      body: looseBody,
      responses: {
        200: successEnvelope(z.unknown()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    grounds: {
      method: 'POST',
      path: '/associations/:id/grounds',
      pathParams: z.object({ id: z.string() }),
      body: looseBody,
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
  { strictStatusCodes: true }
);
