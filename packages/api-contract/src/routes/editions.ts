// packages/api-contract/src/routes/editions.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  EditionDetailSchema,
  EditionListItemSchema,
  EditionSchema,
  EligibilitySchema,
  EntrySchema,
  OpponentOptionSchema,
  StageTableSchema,
  BracketSchema,
} from '../schemas/open-play';

const c = initContract();

/** Open-play editions (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Admin-only
 * routes are marked; club routes need the club's owner (or an admin). */
export const editionsContract = c.router(
  {
    /** Browse editions. `eligibleFor` adds that club's eligibility to each. */
    list: {
      method: 'GET',
      path: '/',
      query: z.object({
        status: z.string().optional(),
        competitionId: z.string().optional(),
        eligibleFor: z.string().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(EditionListItemSchema)),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Admin: new draft edition of a competition. */
    create: {
      method: 'POST',
      path: '/',
      body: z.object({
        competitionId: z.string(),
        registrationOpensDay: z.number().int(),
        registrationClosesDay: z.number().int(),
        startDay: z.number().int(),
      }),
      responses: {
        201: successEnvelope(EditionSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    get: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: successEnvelope(EditionDetailSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Admin: publish a draft (snapshots the definition) or cancel. */
    action: {
      method: 'POST',
      path: '/:id/status/:action',
      pathParams: z.object({
        id: z.string(),
        action: z.enum(['publish', 'cancel']),
      }),
      body: z.object({ reason: z.string().optional() }).optional(),
      responses: {
        200: successEnvelope(EditionSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Admin: invite clubs. */
    invite: {
      method: 'POST',
      path: '/:id/invite',
      pathParams: z.object({ id: z.string() }),
      body: z.object({ clubIds: z.array(z.string()).min(1) }),
      responses: {
        200: successEnvelope(z.array(EntrySchema)),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    eligibility: {
      method: 'GET',
      path: '/:id/eligibility/:clubId',
      pathParams: z.object({ id: z.string(), clubId: z.string() }),
      responses: {
        200: successEnvelope(EligibilitySchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Register (or accept an invite). Refused with reasons when ineligible. */
    register: {
      method: 'POST',
      path: '/:id/entries/:clubId',
      pathParams: z.object({ id: z.string(), clubId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(EntrySchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Withdraw, or decline an invite. */
    withdraw: {
      method: 'DELETE',
      path: '/:id/entries/:clubId',
      pathParams: z.object({ id: z.string(), clubId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(z.object({ ok: z.literal(true) })),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    rankings: {
      method: 'GET',
      path: '/:id/rankings',
      pathParams: z.object({ id: z.string() }),
      query: z.object({ stage: z.coerce.number().int().min(0).optional() }),
      responses: {
        200: successEnvelope(StageTableSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    bracket: {
      method: 'GET',
      path: '/:id/bracket',
      pathParams: z.object({ id: z.string() }),
      query: z.object({ stage: z.coerce.number().int().min(0).optional() }),
      responses: {
        200: successEnvelope(BracketSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    eligibleOpponents: {
      method: 'GET',
      path: '/:id/opponents/:clubId',
      pathParams: z.object({ id: z.string(), clubId: z.string() }),
      responses: {
        200: successEnvelope(z.array(OpponentOptionSchema)),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** A club's current and past entries. */
    clubEntries: {
      method: 'GET',
      path: '/club/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(
          z.array(EntrySchema.extend({ edition: EditionListItemSchema }))
        ),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/editions', strictStatusCodes: true }
);
