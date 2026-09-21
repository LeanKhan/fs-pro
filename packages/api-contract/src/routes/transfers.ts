// packages/api-contract/src/routes/transfers.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { PlayerSchema } from '../schemas/player';
import { ClubSchema } from '../schemas/club';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { TransferOfferSchema, TransferWindowSchema } from '../schemas/transfer';
import { booleanQuery } from '../schemas/query';

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

    /** Whether transfers are currently allowed. Purchases and bids are refused
     * while the window is closed. */
    getTransferWindow: {
      method: 'GET',
      path: '/window',
      responses: {
        200: successEnvelope(TransferWindowSchema),
        400: failEnvelope(),
      },
    },

    /** Admin: open the window (optionally for N game days) or close it. */
    setTransferWindow: {
      method: 'POST',
      path: '/window',
      body: z.object({
        open: z.boolean(),
        days: z.number().int().positive().optional(),
      }),
      responses: {
        200: successEnvelope(TransferWindowSchema),
        400: failEnvelope(),
      },
    },

    /** Bid for a player who belongs to another club. An AI club answers at
     * once (accept - the transfer happens now -, counter, or refuse); a
     * human club gets it in their offers inbox. */
    placeBid: {
      method: 'POST',
      path: '/bids',
      body: z.object({
        playerId: z.string(),
        biddingClubId: z.string(),
        amount: z.number().positive(),
      }),
      responses: {
        200: successEnvelope(TransferOfferSchema),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** A club's bids: ones it has made and ones made for its players. */
    getOffers: {
      method: 'GET',
      path: '/offers',
      query: z.object({
        clubId: z.string(),
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional(),
        currentSeasonOnly: booleanQuery().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(TransferOfferSchema)),
        400: failEnvelope(),
      },
    },

    /** Answer an offer when it is the club's turn (owner of a pending bid, or
     * bidder of a countered one). Accepting executes the transfer. */
    respondToOffer: {
      method: 'POST',
      path: '/offers/:id/respond',
      pathParams: z.object({ id: z.string() }),
      body: z.object({
        clubId: z.string(),
        action: z.enum(['accept', 'reject']),
      }),
      responses: {
        200: successEnvelope(TransferOfferSchema),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** List a player for sale or update asking price / unlist. Also returns Jev's reaction
     * and potential market interest / immediate AI offers. */
    listPlayerForSale: {
      method: 'POST',
      path: '/list',
      body: z.object({
        playerId: z.string(),
        clubId: z.string(),
        isListed: z.boolean(),
        askingPrice: z.number().positive().optional().nullable(),
      }),
      responses: {
        200: successEnvelope(
          z.object({
            player: PlayerSchema,
            reaction: z.object({
              sentiment: z.string(),
              quote: z.string(),
              morale: z.string(),
            }),
            marketInterest: z.string(),
            newOffer: TransferOfferSchema.nullable().optional(),
          })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Jev AI Transfer Scouting Analysis: evaluates target player's tactical fit,
     * financial value, and squad impact for the manager's club. */
    scoutPlayerTransfer: {
      method: 'POST',
      path: '/scout',
      body: z.object({
        playerId: z.string(),
        clubId: z.string(),
      }),
      responses: {
        200: successEnvelope(
          z.object({
            player: PlayerSchema,
            recommendation: z.enum(['MUST_BUY', 'RECOMMENDED', 'ROTATION', 'OVERPRICED', 'HIGH_RISK']),
            dealRating: z.number(),
            confidence: z.number(),
            verdict: z.string(),
            tacticalFit: z.string(),
            tacticalFitLevel: z.enum(['EXCELLENT', 'GOOD', 'NEUTRAL', 'POOR']),
            financialAssessment: z.string(),
            squadRole: z.string(),
            squadRoleLevel: z.enum(['STARTER_UPGRADE', 'KEY_DEPTH', 'FUTURE_PROSPECT', 'SURPLUS']),
            comparisonWithSquad: z.object({
              currentBestRating: z.number().nullable(),
              ratingDelta: z.number(),
              samePositionCount: z.number(),
            }),
            source: z.enum(['jev', 'local']),
          })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Request budget increase from club board of directors evaluated by Jev AI. */
    requestBudgetIncrease: {
      method: 'POST',
      path: '/budget-request',
      body: z.object({
        clubId: z.string(),
        amount: z.number().positive(),
        justification: z.enum(['TITLE_CHALLENGE', 'SQUAD_DEPTH', 'REINVEST_PROFITS', 'PROMOTION_PUSH']),
      }),
      responses: {
        200: successEnvelope(
          z.object({
            status: z.enum(['ACCEPTED', 'COMPROMISE', 'REJECTED']),
            requestedAmount: z.number(),
            grantedAmount: z.number(),
            newBudget: z.number(),
            boardStatement: z.string(),
            confidence: z.number(),
            financialContext: z.object({
              currentBudget: z.number(),
              netMatchdayProfit: z.number(),
              annualWageBill: z.number(),
              wageToBudgetRatio: z.number(),
            }),
            source: z.enum(['jev', 'local']),
          })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/transfers', strictStatusCodes: true }
);
