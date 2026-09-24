// packages/api-contract/src/routes/play.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { InboxSchema, MatchResultSchema, OpponentSchema, PlayStateSchema } from '../schemas/play';

const c = initContract();

export const playContract = c.router(
  {
    /** The club's play screen: level/XP, match cooldown, the active challenge
     * (issued on demand) and the last few matchmade results. */
    getPlayState: {
      method: 'GET',
      path: '/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(PlayStateSchema),
        404: failEnvelope(),
      },
    },

    /** Matchmaking preview: 1 + Scouting-level opponent options of similar
     * power, the first being the recommended one. Nothing is played or reserved. */
    findOpponents: {
      method: 'GET',
      path: '/:clubId/opponents',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(z.array(OpponentSchema)),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Press PLAY: matchmake an opponent of similar power, play the match now
     * and pay out rewards (cash + XP, stadium gate, challenge progress).
     * Only the club's owner (or an admin) may do this; refused during the
     * post-match cooldown. */
    playMatch: {
      method: 'POST',
      path: '/:clubId/match',
      pathParams: z.object({ clubId: z.string() }),
      /** Optional: fight a specific opponent from the matchmaking preview. */
      body: z.object({ opponentId: z.string().optional() }).optional(),
      responses: {
        200: successEnvelope(MatchResultSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** The club's inbox: how fans, the board and the dressing room reacted
     * to results. Owner (or admin) only. */
    getInbox: {
      method: 'GET',
      path: '/:clubId/inbox',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(InboxSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Mark every inbox message read. */
    markInboxRead: {
      method: 'POST',
      path: '/:clubId/inbox/read',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(InboxSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/play', strictStatusCodes: true }
);
