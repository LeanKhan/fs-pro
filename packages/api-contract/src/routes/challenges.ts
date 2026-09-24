// packages/api-contract/src/routes/challenges.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  ChallengePolicySchema,
  MatchChallengeSchema,
} from '../schemas/open-play';

const c = initContract();

/** Open-play match challenges (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). All
 * need the acting club's owner (or an admin). */
export const challengesContract = c.router(
  {
    propose: {
      method: 'POST',
      path: '/',
      body: z.object({
        editionId: z.string(),
        challengerClubId: z.string(),
        opponentClubId: z.string(),
      }),
      responses: {
        201: successEnvelope(MatchChallengeSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** The challenged club accepts or declines; the challenger (or an admin)
     * cancels. */
    respond: {
      method: 'POST',
      path: '/:fixtureId/:action',
      pathParams: z.object({
        fixtureId: z.string(),
        action: z.enum(['accept', 'decline', 'cancel']),
      }),
      body: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(
          z.object({
            challenge: MatchChallengeSchema,
            forfeited: z.boolean().optional(),
          })
        ),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Incoming and outgoing challenges of a club, across editions. */
    forClub: {
      method: 'GET',
      path: '/club/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      query: z.object({ status: z.string().optional() }),
      responses: {
        200: successEnvelope(z.array(MatchChallengeSchema)),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** A club's auto-accept policy (null = answer every challenge by hand). */
    getPolicy: {
      method: 'GET',
      path: '/policy/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(ChallengePolicySchema.nullable()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Set or clear (null) the policy. Owner only. */
    setPolicy: {
      method: 'PUT',
      path: '/policy/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({ policy: ChallengePolicySchema.nullable() }),
      responses: {
        200: successEnvelope(ChallengePolicySchema.nullable()),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/challenges', strictStatusCodes: true }
);
