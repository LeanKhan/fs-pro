import { Router } from 'express';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { Club as ContractClub } from '@repo/api-contract';

import respond from '../../helpers/responseHandler';
import {
  getClubById,
  getClubs,
  createClub,
  updateClubFields,
  deleteClubById,
} from './club.service';
import {
  updateManyPlayerSigning,
  updatePlayerSigning,
} from '../../middleware/player';
import {
  addManyPlayersToClub,
  addPlayerToClubMiddleware,
  calculateClubRating,
  updateAllClubsRating,
} from '../../middleware/club';
import {
  addManagerToClub,
  createManyClubsFromCSV,
  removeManagerFromClub,
} from './club.controller';

const s = initServer();

const router = Router();

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
      const payload = clubs.map((club) => ({
        ...club,
      })) as ContractClub[];

      return {
        status: 200,
        body: {
          success: true,
          message: 'Clubs fetched successfully',
          payload,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Clubs',
          payload: err instanceof Error ? err.message : String(err),
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
          payload: { ...club } as ContractClub,
        },
      };
    } catch (err) {
      return {
        status: 404,
        body: {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },
});

// createExpressEndpoints(contract.clubs, clubTsRestRoutes, router);

/** Create new Club */
router.post('/new', async (req, res) => {
  try {
    const club = await createClub(req.body.data);
    respond.success(res, 200, 'Club created successfully', club);
  } catch (error) {
    respond.fail(res, 400, 'Error creating club', error);
  }
});

/** Update Club - plain fields only, no Mongo $set/$push/$unset operators */
router.post('/:id/update', (req, res) => {
  const data = req.body.data;

  updateClubFields(req.params.id, data)
    .then((club) => {
      respond.success(res, 200, 'Club updated successfully', club);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error updating Club', err.toString());
    });
});

// TODO: add protection to prevent this from deleting without
// confirmation.
/** Delete Club by id */
router.delete('/:id', (req, res) => {
  deleteClubById(req.params.id)
    .then((data: any) => {
      respond.success(res, 200, 'Club deleted successfully', data);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error deleting Club', err.toString());
    });
});

/** Add Player to Club */
router.put(
  '/:id/add-player',
  updatePlayerSigning,
  addPlayerToClubMiddleware,
  calculateClubRating
);

/** Add Players to Club
 * - send a list of Player IDs!
 */
router.put(
  '/:id/add-many-players',
  updateManyPlayerSigning,
  addManyPlayersToClub,
  calculateClubRating
);

// ! THIS WAS FOR DEVELOPMENT !
router.put('/refresh-ratings', updateAllClubsRating);

router.put('/:id/manager', addManagerToClub);

// There can only be one main manager per time so just remove
// that one...
router.delete('/:id/manager', removeManagerFromClub);

/** Remove Player from Club */
router.put(
  '/:id/remove-player',
  updatePlayerSigning,
  addPlayerToClubMiddleware,
  calculateClubRating
);

export default router;

/**
 * 79.5025
 */
