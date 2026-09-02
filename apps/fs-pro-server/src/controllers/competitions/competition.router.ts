import { Router, Request, Response } from 'express';
import {
  getCompetitions,
  getCompetitionById,
  getCompetitionWithClubsAndSeasons,
  createCompetition,
  updateCompetitionFields,
  deleteCompetitionById,
} from './competition.service';
import { getSeasons } from '../seasons/season.service';
import respond from '../../helpers/responseHandler';
import { incrementCounter, getCurrentCounter } from '../../utils/counter';
import { addClubToCompetition } from './competition.controller';

const router = Router();

/** Get all Competitions - `id`/`type` are the only real client filters
 * (the previous arbitrary `?query={...}` JSON blob had no other caller). */
router.get('/all', (req: Request, res: Response) => {
  const { id, type } = req.query;

  const response =
    typeof id === 'string'
      ? getCompetitionById(id).then((c) => (c ? [c] : []))
      : getCompetitions({ Type: typeof type === 'string' ? type : undefined });

  response
    .then((competitions: any) => {
      return respond.success(
        res,
        200,
        'Competitions fetched successfully',
        competitions
      );
    })
    .catch((err: any) => {
      return respond.fail(res, 400, 'Error fetching Competitions', err);
    });
});

/** Get Competition by id */
router.get('/:id', (req: Request, res: Response) => {
  const { populate } = req.query;
  // populate defaults to true (populates Clubs/Seasons via the reverse
  // Clubs.League/Seasons.Competition FKs, since neither array exists on
  // Postgres) - both branches are repository-backed now.
  const response =
    populate === 'false'
      ? getCompetitionById(req.params.id)
      : getCompetitionWithClubsAndSeasons(req.params.id);

  response
    .then((competition: any) => {
      respond.success(
        res,
        200,
        'Competition fetched successfully',
        competition
      );
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Competition', err);
    });
});

/** Get all the seasons */
router.get('/:id/seasons/all', (req: Request, res: Response) => {
  const response = getSeasons({ Competition: req.params.id });

  response
    .then((seasons: any) => {
      respond.success(
        res,
        200,
        'Seasons in competition fetched successfully',
        seasons
      );
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching seasons in competition', err);
    });
});

/** Update Competition by id - plain fields only, no Mongo $push/$addToSet */
router.post('/:id/update', (req: Request, res: Response) => {
  const response = updateCompetitionFields(req.params.id, req.body.data);

  response
    .then((competition: any) => {
      respond.success(
        res,
        200,
        'Competition updated successfully',
        competition
      );
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error in updating Competition', err);
    });
});

/** Delete Competition by id */
router.delete('/:id', (req: Request, res: Response) => {
  deleteCompetitionById(req.params.id)
    .then((data: any) => {
      respond.success(res, 200, 'Competition deleted successfully', data);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error deleting Competition', err);
    });
});

/** Create new Competition */
router.post('/new', getCurrentCounter, async (req: Request, res: Response) => {
  try {
    const competition = await createCompetition(req.body.data);
    // incrementCounter before respond.success - if it throws, the catch
    // below must still be the only response sent (see FUTURE-PLANS.md for
    // the double-response crash this ordering used to cause).
    void incrementCounter('competition_counter');
    respond.success(res, 200, 'Competition created successfully', competition);
  } catch (error) {
    respond.fail(res, 400, 'Error creating competition', error);
  }
});

/** Add Club to Competition */
router.post('/:id/add-club', addClubToCompetition);

export default router;
