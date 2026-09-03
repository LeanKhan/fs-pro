import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { Award as ContractAward } from '@repo/api-contract';

import { fetchAll } from '.';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const awardTsRestRoutes = s.router(contract.awards, {
  getSeasonAwards: async ({ params, query }) => {
    try {
      const awards = await fetchAll(
        { SeasonId: params.season_id },
        query.recipient,
        query.populate ?? ''
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season Awards fetched successfully',
          payload: awards as unknown as ContractAward[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Season Awards',
          payload: fail(err),
        },
      };
    }
  },
});
