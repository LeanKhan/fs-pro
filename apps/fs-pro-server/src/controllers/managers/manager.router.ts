import { Router } from 'express';
import {
  deleteManagerById,
  getManagers,
  getManagerById,
  createManager,
  updateManager,
} from './manager.service';
import respond from '../../helpers/responseHandler';
import { incrementCounter, getCurrentCounter } from '../../utils/counter';
import { appendClubRecord } from '../clubs/club.service';
import { ManagerInterface } from './manager.model';
import log from '../../helpers/logger';

const router = Router();

/** FETCH ALL MANAGERS */
router.get('/', (req, res) => {
  let options = req.query.options;
  // This prevents the app from crashing if there's
  // an error parsing object :)

  try {
    if (options && typeof options === 'string') {
      options = JSON.parse(options);
    }
  } catch (err) {
  return  respond.fail(res, 400, 'Error fetching players', (err as Error).toString());
    log(`Error parsing JSON => ${err}`);
  }

  // populate=Club now goes through the repository too, with Club selected
  // down to Name/ClubCode/LeagueCode (see IManagerReadOptions.withClub) -
  // same projection the old raw `.populate('Club', 'Name ClubCode
  // LeagueCode')` call used.
  const populate = typeof req.query.populate === 'string' ? req.query.populate : undefined;
  const response =
    populate === 'Club'
      ? getManagers(options as Record<string, unknown>, { withClub: true })
      : getManagers(options as Record<string, unknown>);

  response
    .then((managers) => {
      respond.success(res, 200, 'Managers fetched successfully', managers);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error fetching Managers', err.toString());
    });
});

router.get('/unemployed', (req, res) => {

  getManagers({ isEmployed: false }, { withClub: true })
    .then((managers) => {
      respond.success(res, 200, 'Managers fetched successfully', managers);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error fetching players', err);
    });
});

/** GET MANAGER BY ID */
router.get('/:id', (req, res) => {
  // Get Manager by name slug
  const { id } = req.params;
  let po = false;
  try {
    po = req.query.populate && typeof req.query.populate === 'string' && JSON.parse(req.query.populate);
  } catch (err) {
    console.error('Error fetching manager, ', (err as Error).toString());
    return respond.fail(
      res,
      400,
      'Error fetching Manager: Error populating field(s)',
      err
    );
  }

  const response = po ? getManagerById(id, { withClub: true }) : getManagerById(id);

  response
    .then((m) => {
      respond.success(res, 200, 'Manager fetched successfully', m);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error fetching Manager', err);
    });
});

/** DELETE MANAGER BY ID */
router.delete('/:id', (req, res) => {
  // Delete Manager by name
  const { id } = req.params;

  // Find the club(s) that they are employed and remove them...
  // if manager is signed to a club, remove them from that arrangement...
  const getManager = () => {
    return getManagerById(id)
      .then((m) => {
        if (m?.isEmployed && m.Club) {
          return m;
        }

        return false;
      })
      .catch((err) => {
        throw err;
      });
  };

  const _updateClub = (manager: ManagerInterface | false) => {
    const { Club, FirstName, LastName } = manager as ManagerInterface;
    if (Club) {
      // TODO: finish this, refer to manager when adding record
      // (returned, not fire-and-forget - deleteManager below must wait for
      // this to finish, and a failure here must stop the delete from
      // running rather than being silently swallowed)
      return appendClubRecord(
        Club,
        { Manager: null },
        {
          type: 'hired',
          title: `${FirstName} ${LastName} just left the club and the system :/`,
          date: new Date(),
          details: 'Manager is no longer in the system',
        }
      );
    }
  };

  const deleteManager = () => {
    return deleteManagerById(id);
  };

  // hey, link up!
  getManager()
    .then(_updateClub)
    .then(deleteManager)
    .then((m) => {
      respond.success(res, 200, 'Manager deleted successfully', m);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error deleting Manager', err);
    });
});

/** UPDATE MANAGER BY id */
router.put('/:id', (req, res) => {
  // Update manager by id

  const { id } = req.params;
  const { data } = req.body;

  updateManager(id, data)
    .then((manager) => {
      respond.success(res, 200, 'Manager updated successfully', manager);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error updating Manager', err);
    });
});

/** CREATE NEW MANAGER */
router.post('/', getCurrentCounter, async (req, res) => {
  // Create a new Manager
  try {
    const manager = await createManager(req.body.data);
    void incrementCounter('manager_counter');
    respond.success(res, 200, 'Manger created successfully', manager);
  } catch (error) {
    respond.fail(res, 400, 'Error creating Manager', error);
  }
});

export default router;
