import { Router } from 'express';
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

const router = Router();

/** Fetch all Clubs, optionally narrowed to a comma-separated list of ids
 * (e.g. `?ids=a,b,c`, used by the client to resolve "my clubs" from the ids
 * stored on the logged-in user) or to clubs with no owning User yet
 * (`?unclaimed=true`, registration's "pick a club" list). Neither of these
 * needs Players/Manager populated. */
router.get('/all', (req, res) => {
  const { ids, unclaimed } = req.query;
  const idList =
    typeof ids === 'string' ? ids.split(',').filter(Boolean) : undefined;

  const response = idList
    ? getClubs({ ids: idList })
    : unclaimed === 'true'
      ? getClubs({ unclaimed: true })
      : getClubs(undefined, { withPlayersAndManager: true });

  response
    .then((clubs: any) => {
      respond.success(res, 200, 'Clubs fetched successfully', clubs);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Clubs', err.toString());
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
  // ?populate= is now just a boolean flag for withPlayersAndManager -
  // Address.Country comes back populated either way.
  const populate =
    typeof req.query.populate === 'string' && req.query.populate !== 'false';

  getClubById(req.params.id, { withPlayersAndManager: populate })
    .then((club) => {
      respond.success(res, 200, 'Club fetched successfully', club);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error fetching Club', err.toString());
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
