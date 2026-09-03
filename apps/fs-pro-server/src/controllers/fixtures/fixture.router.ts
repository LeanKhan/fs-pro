import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { Fixture as ContractFixture } from '@repo/api-contract';

import {
  getFixtureById,
  getFixtures,
  deleteFixtureById,
} from './fixture.service';

const s = initServer();

export const fixtureTsRestRoutes = s.router(contract.fixtures, {
  /** List Fixtures by typed filters - `season`, an exact `scheduledDay`, or
   * a `scheduledDayFrom`/`scheduledDayTo` range (optionally narrowed to
   * `played`) - powers the client's "upcoming days" dashboard view. */
  getFixtures: async ({ query }) => {
    try {
      const fixtures = await getFixtures({
        SeasonId: query.season,
        Played: query.played,
        scheduledDay: query.scheduledDay,
        scheduledDayFrom: query.scheduledDayFrom,
        scheduledDayTo: query.scheduledDayTo,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Fixtures fetched successfully',
          payload: fixtures as unknown as ContractFixture[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Fixtures',
          payload: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },

  /** Get Fixture by id - always comes back with HomeSideDetails/
   * AwaySideDetails+PlayerStats populated, see IFixtureRepository. Also
   * populates HomeTeam/AwayTeam with the full Club (Players + Manager) -
   * only this single-fixture route needs it (Matchzone). */
  getFixture: async ({ params }) => {
    try {
      const fixture = await getFixtureById(params.id, { withClub: true });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Fixture fetched successfully',
          payload: fixture as unknown as ContractFixture,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Fixture',
          payload: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },

  deleteFixture: async ({ params }) => {
    try {
      const fixture = await deleteFixtureById(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Fixture deleted successfully :)',
          payload: fixture as unknown as ContractFixture,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Fixture',
          payload: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },
});
