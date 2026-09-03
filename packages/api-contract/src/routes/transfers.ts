// packages/api-contract/src/routes/transfers.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { PlayerSchema } from '../schemas/player';
import { ClubSchema } from '../schemas/club';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();

export const transfersContract = c.router(
  {
    /** MVP transfer-market purchase: instant if affordable, no offer/
     * negotiation/AI-accept step (see FUTURE-PLANS.md's "Manager mode and
     * owner mode" entry for the deferred full version). `offerAmount` must
     * be at least the player's Value; the buying club's Budget must cover
     * it. Buying a free agent works the same way, minus the seller credit
     * (sellingClub comes back null). */
    purchasePlayer: {
      method: 'POST',
      path: '/purchase',
      body: z.object({
        playerId: z.string(),
        buyingClubId: z.string(),
        offerAmount: z.number().positive(),
      }),
      responses: {
        200: successEnvelope(
          z.object({
            player: PlayerSchema,
            buyingClub: ClubSchema,
            sellingClub: ClubSchema.nullable(),
            amount: z.number(),
          })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/transfers', strictStatusCodes: true }
);
