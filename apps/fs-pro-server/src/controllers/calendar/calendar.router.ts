import { Router, Request, Response } from 'express';
import respond from '../../helpers/responseHandler';
import {
  getCurrentCalendar,
  startNextSeasonCycle,
  endSeasonCycle,
} from './calendar.controller';
import { getEvents, deleteDayById } from '../days/day.service';
import { updatePlayersDetails } from '../players/player.controller';
import { updateAllClubsRating } from '../../middleware/club';

const router = Router();

/** Get the singleton Calendar */
router.get('/current', getCurrentCalendar);

/** Calendar events (not matches) scheduled within an inclusive day range -
 * fixtures on a given day come from `GET /fixtures?scheduledDay=...`
 * instead, see `fixture.router.ts`. */
router.get('/days', (req: Request, res: Response) => {
  const from = parseInt(String(req.query.from ?? '0'), 10);
  const to = parseInt(String(req.query.to ?? from), 10);

  getEvents(from, to)
    .then((days) => {
      return respond.success(
        res,
        200,
        'Calendar events fetched successfully!',
        days
      );
    })
    .catch((err: any) => {
      return respond.fail(
        res,
        400,
        'Error fetching Calendar events',
        err.toString()
      );
    });
});

router.delete('/days/:id', (req, res) => {
  deleteDayById(req.params.id)
    .then((day: any) => {
      respond.success(res, 200, 'Calendar Day deleted successfully :)', day);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error deleting Calendar Day', err.toString());
    });
});

/** Start the next season cycle - one Season per Competition, fixtures
 * generated and scheduled from the Calendar's current day. */
router.post('/seasons/next', startNextSeasonCycle);

/** End a season cycle - prolegates every Season in `:year` once they're all
 * finished, then progresses Player/Club ratings for the new cycle. */
router.post(
  '/end-season/:year',
  endSeasonCycle,
  updatePlayersDetails,
  updateAllClubsRating
);

router.get('/:year/update-ages', updatePlayersDetails);

export default router;
