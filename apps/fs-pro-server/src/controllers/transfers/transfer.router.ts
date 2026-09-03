import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Player as ContractPlayer,
  Club as ContractClub,
} from '@repo/api-contract';

import { executePurchase } from './transfer.service';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const transferTsRestRoutes = s.router(contract.transfers, {
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
});
