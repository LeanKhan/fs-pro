import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Player as ContractPlayer,
  Club as ContractClub,
} from '@repo/api-contract';

import { executePurchase } from './transfer.service';
import {
  getTransferWindow,
  openTransferWindow,
  closeTransferWindow,
} from '../../services/transfers/transfer-window.service';
import {
  placeBid,
  respondToOffer,
  listOffers,
  listPlayerForSale,
} from '../../services/transfers/transfer-market.service';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Business-rule failures are the caller's problem (400), missing rows a 404. */
function errorResponse(err: unknown) {
  const message = fail(err);
  return {
    status: /not found/i.test(message) ? (404 as const) : (400 as const),
    body: { success: false as const, message, payload: message },
  };
}

/** The offer as the acting club sees it (direction / whose turn). */
async function offerFor(clubId: string, offerId: string) {
  const offer = (await listOffers(clubId)).find((o) => o.id === offerId);
  if (!offer) throw new Error('Offer not found');
  return offer;
}

export const transferTsRestRoutes = s.router(contract.transfers, {
  getTransferWindow: async () => {
    try {
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Transfer window', payload: await getTransferWindow() },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  setTransferWindow: async ({ body }) => {
    try {
      const state = body.open ? await openTransferWindow(body.days) : await closeTransferWindow();
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: state.open ? 'Transfer window opened' : 'Transfer window closed',
          payload: state,
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  placeBid: async ({ body }) => {
    try {
      const offer = await placeBid(body);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Bid placed',
          payload: await offerFor(body.biddingClubId, offer.id),
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  getOffers: async ({ query }) => {
    try {
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Offers fetched',
          payload: await listOffers(query.clubId, {
            limit: query.limit,
            offset: query.offset,
            currentSeasonOnly: query.currentSeasonOnly,
          }),
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  respondToOffer: async ({ params, body }) => {
    try {
      const offer = await respondToOffer({ offerId: params.id, clubId: body.clubId, action: body.action });
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: body.action === 'accept' ? 'Offer accepted' : 'Offer declined',
          payload: await offerFor(body.clubId, offer.id),
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },

  purchasePlayer: async ({ body }) => {
    try {
      const result = await executePurchase(
        body.playerId,
        body.buyingClubId,
        body.offerAmount
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Player purchased successfully!',
          payload: {
            player: result.player as unknown as ContractPlayer,
            buyingClub: result.buyingClub as unknown as ContractClub,
            sellingClub: result.sellingClub as unknown as ContractClub | null,
            amount: body.offerAmount,
          },
        },
      };
    } catch (err) {
      const message = fail(err);

      return {
        status: /not found/i.test(message) ? (404 as const) : (400 as const),
        body: { success: false, message, payload: message },
      };
    }
  },

  listPlayerForSale: async ({ body }) => {
    try {
      const result = await listPlayerForSale(body);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: body.isListed ? 'Player listed for sale' : 'Player unlisted',
          payload: {
            player: result.player as unknown as ContractPlayer,
            reaction: result.reaction,
            marketInterest: result.marketInterest,
            newOffer: result.newOffer,
          },
        },
      };
    } catch (err) {
      return errorResponse(err) as any;
    }
  },
});
