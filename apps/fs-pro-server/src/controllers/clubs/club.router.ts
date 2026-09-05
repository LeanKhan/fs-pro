import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Club as ContractClub,
  Player as ContractPlayer,
} from '@repo/api-contract';

import {
  getClubById,
  getClubs,
  createClub,
  updateClubFields,
  deleteClubById,
  calculateAndUpdateClubRating,
  refreshAllClubsRatings,
} from './club.service';
import type { ClubInterface } from './club.model';
import { hireManagerForClub, fireManagerFromClub } from './club.controller';
import {
  toggleSigned,
  signManyPlayersToClub,
} from '../players/player.service';
import { recruitYouthPlayersForClub } from '../players/player-lifecycle.service';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Fetch all Clubs, optionally narrowed to a comma-separated list of ids
 * (e.g. `?ids=a,b,c`, used by the client to resolve "my clubs" from the ids
 * stored on the logged-in user) or to clubs with no owning User yet
 * (`?unclaimed=true`, registration's "pick a club" list). Neither of these
 * needs Players/Manager populated. */
export const clubTsRestRoutes = s.router(contract.clubs, {
  getClubs: async ({ query }) => {
    try {
      const idList = query.ids?.split(',').filter(Boolean);
      const clubs = idList?.length
        ? await getClubs({ ids: idList })
        : query.unclaimed
          ? await getClubs({ unclaimed: true })
          : await getClubs(undefined, {
              withPlayersAndManager: query.withPlayersAndManager ?? true,
            });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Clubs fetched successfully',
          payload: clubs as unknown as ContractClub[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Clubs',
          payload: fail(err),
        },
      };
    }
  },

  getClub: async ({ params, query }) => {
    try {
      const populate =
        typeof query.populate === 'string' && query.populate !== 'false';
      const club = await getClubById(params.id, {
        withPlayersAndManager: populate,
      });

      if (!club) {
        return {
          status: 404,
          body: {
            success: false,
            message: 'Club not found',
          },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          message: 'Club fetched successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 404,
        body: {
          success: false,
          message: fail(err),
        },
      };
    }
  },

  createClub: async ({ body }) => {
    try {
      const club = await createClub(body as Partial<ClubInterface>);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Club created successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error creating club',
          payload: fail(err),
        },
      };
    }
  },

  /** Plain fields only, no Mongo $set/$push/$unset operators. */
  updateClub: async ({ params, body }) => {
    try {
      const club = await updateClubFields(
        params.id,
        body as Partial<ClubInterface>
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Club updated successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating Club',
          payload: fail(err),
        },
      };
    }
  },

  // TODO: add protection to prevent this from deleting without
  // confirmation.
  deleteClub: async ({ params }) => {
    try {
      const club = await deleteClubById(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Club deleted successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Club',
          payload: fail(err),
        },
      };
    }
  },

  /** Add Player to Club - extracted from the old 3-fn Express middleware
   * chain (updatePlayerSigning -> addPlayerToClubMiddleware ->
   * calculateClubRating). The middle step was already a no-op on Postgres
   * (Club.Players doesn't exist there - ownership lives on the Player row),
   * so it's dropped rather than ported. */
  addPlayerToClub: async ({ params, query, body }) => {
    try {
      const signed = query.remove
        ? await toggleSigned(body.playerId, body.isSigned, null, null)
        : await toggleSigned(
            body.playerId,
            body.isSigned,
            body.clubCode ?? null,
            body.clubId ?? null
          );

      if (!signed) {
        throw new Error('Error adding player to club');
      }

      const club = await calculateAndUpdateClubRating(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: query.remove
            ? 'Player removed from Club successfully'
            : 'Player added to Club successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating Players and Clubs',
          payload: fail(err),
        },
      };
    }
  },

  /** Add many Players to Club (send a list of Player ids). Same
   * extract-and-sequence treatment as addPlayerToClub. */
  addManyPlayersToClub: async ({ params, body }) => {
    try {
      await signManyPlayersToClub(body.playerIds, body.clubCode, body.clubId);
      const club = await calculateAndUpdateClubRating(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Players added to Club successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error adding player to club',
          payload: fail(err),
        },
      };
    }
  },

  // ! THIS WAS FOR DEVELOPMENT !
  refreshAllClubsRatings: async () => {
    try {
      await refreshAllClubsRatings();
      console.log('Calendar Year Ended Successfully!');
      return {
        status: 200,
        body: {
          success: true,
          message: 'Players and Clubs updated successfully! Year ENDED :)',
          payload: {},
        },
      };
    } catch (err) {
      console.error('Error updating Clubs!', err);
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Club',
          payload: fail(err),
        },
      };
    }
  },

  hireManager: async ({ params, body }) => {
    try {
      await hireManagerForClub(params.id, body.manager, body.details);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Hired new manager successfully!',
          payload: {},
        },
      };
    } catch (err) {
      const message = fail(err);
      return {
        status: message.includes('already has a manager') ? 401 : 400,
        body: {
          success: false,
          message: 'Error hiring new manager!',
          payload: message,
        },
      };
    }
  },

  // There can only be one main manager per time so just remove that one...
  fireManager: async ({ params, query }) => {
    try {
      await fireManagerFromClub(params.id, query.reason);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Removed Manager successfully!',
          payload: {},
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error removing Manager!',
          payload: fail(err),
        },
      };
    }
  },

  /** Admin-only on-demand youth scouting - see
   * player-lifecycle.service.ts's recruitYouthPlayersForClub doc comment
   * for how this differs from the automatic yearly intake. */
  recruitYouthPlayers: async ({ params, body }) => {
    try {
      const club = await getClubById(params.id);
      if (!club) {
        return {
          status: 400,
          body: { success: false, message: 'Club not found', payload: 'Club not found' },
        };
      }

      const recruits = await recruitYouthPlayersForClub(
        { _id: params.id, ClubCode: club.ClubCode },
        body.count ?? 1
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Youth player(s) recruited successfully',
          payload: recruits as unknown as ContractPlayer[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error recruiting youth players',
          payload: fail(err),
        },
      };
    }
  },

  /** Same 3-fn chain as addPlayerToClub, reused for removal. */
  removePlayerFromClub: async ({ params, query, body }) => {
    try {
      const signed = query.remove
        ? await toggleSigned(body.playerId, body.isSigned, null, null)
        : await toggleSigned(
            body.playerId,
            body.isSigned,
            body.clubCode ?? null,
            body.clubId ?? null
          );

      if (!signed) {
        throw new Error('Error adding player to club');
      }

      const club = await calculateAndUpdateClubRating(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: query.remove
            ? 'Player removed from Club successfully'
            : 'Player added to Club successfully',
          payload: club as unknown as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating Players and Clubs',
          payload: fail(err),
        },
      };
    }
  },
});
