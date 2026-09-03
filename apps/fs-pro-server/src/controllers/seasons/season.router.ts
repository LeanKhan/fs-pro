import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Season as ContractSeason,
  Fixture as ContractFixture,
} from '@repo/api-contract';

import {
  getSeasons,
  getSeasonById,
  updateSeasonFields,
  deleteSeasonById,
} from './season.service';
import { getFixtures } from '../fixtures/fixture.service';
import {
  createSeasonPlain,
  fetchCompetitionForFixtures,
  generateSeasonFixtures,
  setSeasonInitialStandings,
} from '../../middleware/seasons';
import {
  getCurrentSeasonsForYear,
  finishSeasonPlain,
  FinishSeasonError,
} from './season.controller';
import { giveSeasonAwards } from '../awards/awards.controller';
import { compileStandings } from '../../utils/seasons';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const seasonTsRestRoutes = s.router(contract.seasons, {
  /** The real client filters are Year, Competition, and `current` (a
   * competition's in-progress season - isStarted && !isFinished, there's
   * only ever one at a time). */
  getSeasons: async ({ query }) => {
    try {
      const seasons = await getSeasons({
        Year: query.year,
        CompetitionId: query.competition,
      });
      const filtered = query.current
        ? seasons.filter((season) => season.isStarted && !season.isFinished)
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

  createSeason: async ({ body }) => {
    try {
      const season = await createSeasonPlain(
        body.CompetitionCode,
        body.CompetitionId,
        body.Title,
        body.StartDate,
        body.EndDate
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season created successfully',
          payload: season as unknown as ContractSeason,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error creating Season',
          payload: fail(err),
        },
      };
    }
  },

  /** Extracted from the old fetchCompetitionClubs -> generateFixtures ->
   * setInitialStandings -> inline-handler Express middleware chain. */
  generateFixtures: async ({ params, body }) => {
    try {
      const competition = await fetchCompetitionForFixtures(body.competitionId);
      if (!competition) {
        throw new Error('Competition not found');
      }

      const fixtureIds = await generateSeasonFixtures(
        competition,
        params.id,
        params.code,
        body.leagueCode
      );
      await setSeasonInitialStandings(competition, params.id);

      // Fixtures doesn't exist on Postgres - see saveFixtures's comment in
      // middleware/seasons.ts for why this is a safe no-op there.
      const season = await updateSeasonFields(params.id, {
        Fixtures: fixtureIds,
      } as any);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Fixtures created in season successfully',
          payload: season as unknown as ContractSeason,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error setting fixtures in Season',
          payload: fail(err),
        },
      };
    }
  },

  startSeason: async ({ params }) => {
    try {
      const season = await updateSeasonFields(params.id, {
        isStarted: true,
        StartDate: new Date(),
      });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season started successfully',
          payload: season as unknown as ContractSeason,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error starting Season',
          payload: fail(err),
        },
      };
    }
  },

  /** Extracted from the old finishSeason -> giveAwards Express middleware
   * chain. */
  finishSeason: async ({ params }) => {
    try {
      const { updatedSeason, standings, seasonChampions } =
        await finishSeasonPlain(params.id);
      const awardedPlayers = await giveSeasonAwards(params.id, seasonChampions);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Season ended successfully!',
          payload: {
            awardedPlayers: awardedPlayers as unknown[],
            standings: standings as any,
            season: updatedSeason as unknown as ContractSeason,
          },
        },
      };
    } catch (err) {
      if (err instanceof FinishSeasonError) {
        return {
          status: err.status,
          body: { success: false, message: err.message },
        };
      }
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error ending Season!',
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

  getCurrentSeasonsForYear: async ({ params }) => {
    try {
      const seasons = await getCurrentSeasonsForYear(params.year);
      if (seasons.length === 0) {
        return {
          status: 404,
          body: { success: false, message: 'No Seasons found!' },
        };
      }
      return {
        status: 200,
        body: {
          success: true,
          message: 'Found seasons',
          payload: seasons as unknown as ContractSeason[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Failed to get seasons \n ' + fail(err),
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

      const payload = {
        ...season,
        CompiledStandings: compileStandings(season.Standings),
      };

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

      const standings = compileStandings(season.Standings);
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
