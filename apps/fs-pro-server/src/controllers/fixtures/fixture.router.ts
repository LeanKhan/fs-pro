import { Router } from 'express';
import respond from '../../helpers/responseHandler';
import { getFixtureById, getFixtures, deleteFixtureById } from './fixture.service';

const router = Router();

/** List Fixtures by typed filters - `season`, an exact `scheduledDay`, or a
 * `scheduledDayFrom`/`scheduledDayTo` range (optionally narrowed to
 * `played`) - powers the client's "upcoming days" dashboard view. */
router.get('/', (req, res) => {
  const { season, scheduledDay, scheduledDayFrom, scheduledDayTo, played } = req.query;

  getFixtures({
    Season: typeof season === 'string' ? season : undefined,
    Played: typeof played === 'string' ? played === 'true' : undefined,
    scheduledDay: typeof scheduledDay === 'string' ? parseInt(scheduledDay, 10) : undefined,
    scheduledDayFrom: typeof scheduledDayFrom === 'string' ? parseInt(scheduledDayFrom, 10) : undefined,
    scheduledDayTo: typeof scheduledDayTo === 'string' ? parseInt(scheduledDayTo, 10) : undefined,
  })
    .then((fixtures) => {
      respond.success(res, 200, 'Fixtures fetched successfully', fixtures);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Fixtures', err.toString());
    });
});

/** Get Fixture by id - always comes back with HomeSideDetails/
 * AwaySideDetails+PlayerStats populated, see IFixtureRepository. */
router.get('/:id', (req, res) => {
  getFixtureById(req.params.id)
    .then((fixture: any) => {
      respond.success(res, 200, 'Fixture fetched successfully', fixture);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Fixture', err);
    });
});

router.delete('/:id', (req, res) => {
  deleteFixtureById(req.params.id)
    .then((calendar: any) => {
      respond.success(res, 200, 'Fixture deleted successfully :)', calendar);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error deleting Fixture', err.toString());
    });
});

export default router;
