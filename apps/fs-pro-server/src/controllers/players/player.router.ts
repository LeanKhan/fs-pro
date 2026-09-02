/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Request, Response, Router } from 'express';
import respond from '../../helpers/responseHandler';
import {
  getPlayers,
  getSpecificPlayerStats,
  PlayerStatSortKey,
  getPlayerById,
  updatePlayerFields,
  deletePlayerById,
  createPlayer,
} from './player.service';
import { PlayerInterface } from './player.model';
import { generatePlayers } from './player.controller';
import { incrementCounter, getCurrentCounter } from '../../utils/counter';
import {
  calculatePlayerRating,
  calculatePlayerValue,
} from '../../utils/players';
import { fetchAppearance } from '../../utils/appearance';
import { runSpawn } from '../../utils/scripts';
import { titleCase } from '../../helpers/misc';

const router = Router();

/**
 * Fetch all Players, optionally filtered by Club/ClubCode/isSigned
 */
router.get('/all', (req, res) => {
  const filter: { Club?: string; ClubCode?: string; isSigned?: boolean } = {};
  if (typeof req.query.club === 'string') filter.Club = req.query.club;
  if (typeof req.query.clubCode === 'string') filter.ClubCode = req.query.clubCode;
  if (typeof req.query.isSigned === 'string') filter.isSigned = req.query.isSigned === 'true';

  getPlayers(filter)
    .then((players: any) => {
      return respond.success(res, 200, 'Players fetched successfully', players);
    })
    .catch((err: any) => {
      return respond.fail(res, 400, 'Error fetching players', err.toString());
    });
});

// router.get('/club', (req, res) => {
//   let options = req.query.options || {};
//   // This prevents the app from crashing if there's
//   // an error parsing object :)
//   try {
//     if (req.query.options) {
//       options = JSON.parse(req.query.options);
//     }
//   } catch (err) {
//     log(`Error parsing JSON => ${err}`);
//   }

//   fetchAll(options)
//     .then((players: any) => {
//       respond.success(res, 200, 'Players fetched successfully', players);
//     })
//     .catch((err: any) => {
//       respond.fail(res, 400, 'Error fetching players', err);
//     });
// });

/**
 * Update a Player
 */
router.post('/:id/update', (req, res) => {
  const { id } = req.params;
  const { data } = req.body;

  updatePlayerFields(id, data)
    .then((player: any) => {
      respond.success(res, 200, 'Player updated successfully', player);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error updating Player', err);
    });
});

/**
 * Create new player
 * Format to create new player
 */
router.post('/new', getCurrentCounter, async (req, res) => {
  const player = req.body.data as PlayerInterface;
  // const player_rating = calculatePlayerRating(req.body.data.Attributes, req.body.data.Position);
  const new_rating = Math.round(
    calculatePlayerRating(player.Attributes, player.Position, player.Role)
  );

  const new_value = calculatePlayerValue(
    req.body.data.Position,
    new_rating,
    req.body.data.Age
  );

  try {
    const created = await createPlayer({
      ...req.body.data,
      Rating: new_rating,
      Value: new_value,
    });
    // incrementCounter before respond.success - if it throws, the catch
    // below must still be the only response sent (see FUTURE-PLANS.md for
    // the double-response crash this ordering used to cause).
    void incrementCounter('player_counter');
    respond.success(res, 200, 'Player created successfully', created);
  } catch (error) {
    respond.fail(res, 400, 'Error creating player', error);
  }
});

router.get('/:id/rating', async (req, res) => {
  const { id } = req.params;

  const player = (await getPlayerById(id)) as PlayerInterface;

  if (!player) return respond.fail(res, 400, 'Player not found!');

  // const player_rating = calculatePlayerRating(req.body.data.Attributes, req.body.data.Position);
  const new_rating = Math.round(
    calculatePlayerRating(player.Attributes, player.Position, player.Role)
  );

  const new_value = calculatePlayerValue(
    player.Position,
    new_rating,
    player.Age
  );

  return respond.success(res, 200, 'Player Rating and Value successfully', {
    new_rating,
    new_value,
  });
});

router.get('/appearance', (req, res) => {
  fetchAppearance()
    .then((features: any) => {
      respond.success(res, 200, 'Fetched Appearance successfully', features);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching appearance features', err);
    });
});

/**
 * Use like this -> {{url}}/players/stats?competitionCode=EFL&sortBy=goals&sortDir=desc
 */
router.get('/stats', async (req: Request, res: Response) => {
  const competitionCode = typeof req.query.competitionCode === 'string' ? req.query.competitionCode : undefined;
  const sortBy = (typeof req.query.sortBy === 'string' ? req.query.sortBy : 'points') as PlayerStatSortKey;
  const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

  await getSpecificPlayerStats(competitionCode, sortBy, sortDir)
    .then((updated: any) => {
      // get only the top 5
      return respond.success(
        res,
        200,
        `The Best 5 Players by ${sortBy.toUpperCase()}`,
        updated.slice(0, 5)
      );
    })
    .catch((err: any) => {
      return respond.fail(res, 400, 'Error fetching Player stats', err);
    });
});

router.put('/works/add-roles/:id', (req, res) => {
  const { id } = req.params;

  getPlayerById(id)
    .then((player: any) => {
      respond.success(res, 200, 'Player fetched successfully', player);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Player', err);
    });
});

router.get('/generate-players', generatePlayers);

// router.post('/add-clubcodes', async (req, res) => {
//   const all_clubs = await fetchClubs({}, 'ClubCode');

//   const po = all_clubs.map((c) => {
//     return updatePlayers({ ClubCode: c.ClubCode }, { Club: c._id });
//   });

//   Promise.all(po)
//     .then((players: any) => {
//       respond.success(res, 200, 'Players updated successfully', players);
//     })
//     .catch((err: any) => {
//       respond.fail(res, 400, 'Error updating Players', err);
//     });
// });

/**
 * fetch one Player
 */

router.get('/:id', (req, res) => {
  const { id } = req.params;

  getPlayerById(id)
    .then((player: any) => {
      respond.success(res, 200, 'Player fetched successfully', player);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Player', err);
    });
});

/** Delete Player by id */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  deletePlayerById(id)
    .then((player: any) => {
      respond.success(res, 200, 'Player deleted successfully', player);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error deleting Player => ', err.toString());
    });
});

export default router;
