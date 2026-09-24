import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Season as ContractSeason,
  Fixture as ContractFixture,
} from '@repo/api-contract';

import { getSeasons, getSeasonById, deleteSeasonById } from './season.service';
import { getFixtures } from '../fixtures/fixture.service';
import { editionStandings } from '../../services/competitions/ranking.service';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const seasonTsRestRoutes = s.router(contract.seasons, {
  /** Filters: competition, and `current` (open for entry or running). */
  getSeasons: async ({ query }) => {
    try {
      const seasons = await getSeasons({ CompetitionId: query.competition });
      const filtered = query.current
        ? seasons.filter((season) => ['registration', 'running'].includes(season.Status))
        : seasons;
      const sorted = [...filtered].sort((a, b) =>
        a.CompetitionCode.localeCompare(b.CompetitionCode)
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Seasons fetched successfully',
          payload: sorted as unknown as ContractSeason[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Seasons',
          payload: fail(err),
        },
      };
    }
  },

  getSeasonFixtures: async ({ params }) => {
    try {
      const fixtures = await getFixtures({ SeasonId: params.id });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Seasons Fixtures fetched successfully',
          payload: fixtures as unknown as ContractFixture[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Season Fixtures',
          payload: fail(err),
        },
      };
    }
  },

  getSeason: async ({ params }) => {
    try {
      const season = await getSeasonById(params.id);
      if (!season) {
        return {
          status: 404,
          body: { success: false, message: 'Season not found!' },
        };
      }

      const payload = season;

      return {
        status: 200,
        body: {
          success: true,
          message: 'Season fetched successfully',
          payload: payload as unknown as ContractSeason,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Season',
          payload: fail(err),
        },
      };
    }
  },

  getSeasonStandings: async ({ params }) => {
    try {
      const season = await getSeasonById(params.id);
      if (!season) {
        return {
          status: 404,
          body: { success: false, message: 'Season not found!' },
        };
      }

      const standings = await editionStandings(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season Standings fetched successfully',
          payload: standings as any,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Season Standings',
          payload: fail(err),
        },
      };
    }
  },

  deleteSeason: async ({ params }) => {
    try {
      await deleteSeasonById(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season deleted successfully',
          payload: {},
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Season',
          payload: fail(err),
        },
      };
    }
  },
});
