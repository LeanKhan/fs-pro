import { Router } from 'express';
import respond from '../../helpers/responseHandler';
import {
  fetchSingleClubById,
  fetchClubs,
  getClubById,
  getClubs,
  createClub,
  updateClubFields,
  deleteClubById,
} from './club.service';
import { updateManyPlayerSigning, updatePlayerSigning } from '../../middleware/player';
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
import { setupRoutes } from '../../helpers/queries';

const router = Router();

/** Fetch all Clubs */
router.get('/all', (req, res) => {
  const response = getClubs(undefined, { withPlayersAndManager: true });

  response
    .then((clubs: any) => {
      respond.success(res, 200, 'Clubs fetched successfully', clubs);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Clubs', err.toString());
    });
});

/** Fetch Club by query */
router.get('/fetch', (req, res) => {
  // fetch clubs with query and all
  let query;
  let select: any;
  try {
    query = req.query.q || "{}";
    query = JSON.parse(req.query.q as any);
    select = req.query.select || {};
    select = JSON.parse(select);
  } catch (err) {
    return respond.fail(res, 400, 'Error parsing JSON for Clubs query =>', {
      error: err,
      query,
      select,
    });
  }

  fetchClubs(query, select)
    .then((clubs) => {
      return respond.success(res, 200, 'Clubs fetched successfully', clubs);
    })
    .catch((err) => {
      return respond.fail(res, 400, 'Error fetching Clubs', err.toString());
    });
});

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

/** Fetch Club by id */
router.get('/:id', (req, res) => {
  try {
    const populate = typeof req.query.populate === 'string' ? req.query.populate : false;
    // An explicit ?populate= needs an arbitrary Mongo populate spec
    // (`JSON.parse`d, can be any field/array of fields) - no repository
    // equivalent for that, stays on the raw path. Plain fetches go through
    // the repository (Address.Country still comes back populated either way).
    const response = populate ? fetchSingleClubById(req.params.id, populate) : getClubById(req.params.id);
    response
      .then((club) => {
        respond.success(res, 200, 'Club fetched successfully', club);
      })
      .catch((err) => {
        respond.fail(res, 400, 'Error fetching Club', err.toString());
      });
  } catch (err: any) {
    respond.fail(res, 400, 'Error fetching Club', err.toString());
  }
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

setupRoutes(router, 'Club');

export default router;

/**
 * 79.5025
 */
