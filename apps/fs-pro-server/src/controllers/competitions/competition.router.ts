import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Competition as ContractCompetition,
  Season as ContractSeason,
} from '@repo/api-contract';

import {
  getCompetitions,
  getCompetitionById,
  getCompetitionWithClubsAndSeasons,
  createCompetition,
  updateCompetitionFields,
  deleteCompetitionById,
} from './competition.service';
import type { CompetitionInterface } from './competition.model';
import { getSeasons } from '../seasons/season.service';
import { updateClubFields } from '../clubs/club.service';
import { getNextCounterId } from '../../utils/counter';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const competitionTsRestRoutes = s.router(contract.competitions, {
  /** `id`/`type` are the only real client filters (the previous arbitrary
   * `?query={...}` JSON blob had no other caller). */
  getCompetitions: async ({ query }) => {
    try {
      const competitions = query.id
        ? await getCompetitionById(query.id, { withCountry: true }).then(
            (c) => (c ? [c] : [])
          )
        : await getCompetitions(
            { Type: query.type },
            { withCountry: true }
          );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Competitions fetched successfully',
          payload: competitions as unknown as ContractCompetition[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Competitions',
          payload: fail(err),
        },
      };
    }
  },

  /** populate defaults to true (populates Clubs/Seasons via the reverse
   * Clubs.League/Seasons.Competition FKs, since neither array exists on
   * Postgres) - both branches are repository-backed. */
  getCompetition: async ({ params, query }) => {
    try {
      const competition =
        query.populate === 'false'
          ? await getCompetitionById(params.id)
          : await getCompetitionWithClubsAndSeasons(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Competition fetched successfully',
          payload: competition as unknown as ContractCompetition,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Competition',
          payload: fail(err),
        },
      };
    }
  },

  getCompetitionSeasons: async ({ params }) => {
    try {
      const seasons = await getSeasons({ CompetitionId: params.id });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Seasons in competition fetched successfully',
          payload: seasons as unknown as ContractSeason[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching seasons in competition',
          payload: fail(err),
        },
      };
    }
  },

  /** Plain fields only, no Mongo $push/$addToSet. */
  updateCompetition: async ({ params, body }) => {
    try {
      const competition = await updateCompetitionFields(
        params.id,
        body as Partial<CompetitionInterface>
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Competition updated successfully',
          payload: competition as unknown as ContractCompetition,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error in updating Competition',
          payload: fail(err),
        },
      };
    }
  },

  deleteCompetition: async ({ params }) => {
    try {
      const competition = await deleteCompetitionById(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Competition deleted successfully',
          payload: competition as unknown as ContractCompetition,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Competition',
          payload: fail(err),
        },
      };
    }
  },

  createCompetition: async ({ body }) => {
    try {
      // Reserves the next CompetitionID off the Postgres sequence - the
      // real work the old getCurrentCounter middleware did (via
      // ?model=competition); incrementCounter itself is a documented no-op.
      const { field, id } = await getNextCounterId('competition');

      const competition = await createCompetition({
        ...(body as Partial<CompetitionInterface>),
        [field]: id,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Competition created successfully',
          payload: competition as unknown as ContractCompetition,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error creating competition',
          payload: fail(err),
        },
      };
    }
  },

  /** Competition.Clubs doesn't exist on Postgres - a club's league is a
   * direct Clubs.League/LeagueCode FK/column (see ICompetitionRepository's
   * doc comment for why that's the only mechanism this write needs, not
   * the currently-unused `competitionClubs` join table), so that's the
   * only write that matters; the reverse "clubs in this competition"
   * lookup is a query, not a stored array to also update here. */
  addClubToCompetition: async ({ params, body }) => {
    try {
      const comp = await getCompetitionById(params.id);
      if (!comp) {
        throw new Error('Competition does not exist!');
      }

      await updateClubFields(body.clubId, {
        LeagueCode: comp.CompetitionCode,
        LeagueId: comp._id,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Club has been added to Competition successfully!',
          payload: {},
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error adding Club to Competition',
          payload: fail(err),
        },
      };
    }
  },
});
