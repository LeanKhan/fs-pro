/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Router, Request, Response } from 'express';
import {
  getSeasons,
  getSeasonById,
  updateSeasonFields,
  deleteSeasonById,
} from './season.service';
import { SeasonInterface } from './season.model';
import { getFixtures } from '../fixtures/fixture.service';
import {
  createSeason,
  fetchCompetitionClubs,
  generateFixtures,
  setInitialStandings,
} from '../../middleware/seasons';
import { incrementCounter, getCurrentCounter } from '../../utils/counter';
import { addSeasonToCompetition } from '../competitions/competition.controller';
import { finishSeason, getCurrentSeasons } from './season.controller';
import respond from '../../helpers/responseHandler';
import { compileStandings } from '../../utils/seasons';
import { giveAwards } from '../awards/awards.controller';

const router = Router();

/** Get all Seasons - the real client filters are Year, Competition, and
 * `current` (a competition's in-progress season - isStarted && !isFinished,
 * there's only ever one at a time) - the previous arbitrary `?query={...}`
 * JSON blob had no other caller. */
router.get('/', (req: Request, res: Response) => {
  const { year, competition, current } = req.query;

  getSeasons({
    Year: typeof year === 'string' ? year : undefined,
    CompetitionId: typeof competition === 'string' ? competition : undefined,
  })
    .then((seasons) => {
      const filtered =
        current === 'true'
          ? seasons.filter((s) => s.isStarted && !s.isFinished)
          : seasons;
      const sorted = [...filtered].sort((a, b) =>
        a.CompetitionCode.localeCompare(b.CompetitionCode)
      );
      return respond.success(res, 200, 'Seasons fetched successfully', sorted);
    })
    .catch((err: any) => {
      return respond.fail(res, 400, 'Error fetching Seasons', err);
    });
});

router.get('/:id/is-finished', (req, res) => {
  // find a fixture with the seasonCode who's Played == true and isFinalMatch == true

  if (!req.params.id) {
    return respond.fail(res, 400, 'Season ID not sent');
  }
});

/** Create new Season */
router.post('/', getCurrentCounter, createSeason, addSeasonToCompetition);

/** Generate Fixtures for Season */
router.post(
  '/:id/:code/generate-fixtures',
  fetchCompetitionClubs,
  generateFixtures,
  setInitialStandings,
  (req, res) => {
    const fixtureIds = req.body.fixtureIds;

    // Fixtures doesn't exist on Postgres - see saveFixtures's comment in
    // middleware/seasons.ts for why this is a safe no-op there.
    updateSeasonFields(req.params.id, { Fixtures: fixtureIds } as any)
      .then((season: any) => {
        respond.success(
          res,
          200,
          'Fixtures created in season successfully',
          season
        );
      })
      .catch((err: any) => {
        respond.fail(res, 400, 'Error setting fixtures in Season', err);
      });
  }
);

/** Start Season */
router.patch('/:id/start', (req, res) => {
  updateSeasonFields(req.params.id, {
    isStarted: true,
    StartDate: new Date(),
  })
    .then((season: any) => {
      respond.success(res, 200, 'Season started successfully', season);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error starting Season', err);
    });
});

/** FINISH SEASON */
router.post('/:id/finish', finishSeason, giveAwards);

/** Get all Fixtures in Season */
router.get('/:id/fixtures', (req, res) => {
  getFixtures({ SeasonId: req.params.id })
    .then((fixtures: any) => {
      respond.success(
        res,
        200,
        'Seasons Fixtures fetched successfully',
        fixtures
      );
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Season Fixtures', err);
    });
});

/** Get current Season */
router.get('/:year/current', getCurrentSeasons);

// I moved these endpoiints down here because it was matching 'seasons/current' causing an error.

/** Get Season by id */
router.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id;

  // Use validators here...
  if (!id) {
    return respond.fail(res, 404, 'Please provide valid Season ID!');
  }

  getSeasonById(id)
    .then((season: any) => {
      if (!season)
        return respond.success(res, 404, 'Season not found!', season);

      season.CompiledStandings = compileStandings(season.Standings);

      return respond.success(res, 200, 'Season fetched successfully', season);
    })
    .catch((err: any) => {
      return respond.fail(res, 400, 'Error fetching Season', err.toString());
    });
});

// get current setInitialStandings
router.get('/:id/standings', (req: Request, res: Response) => {
  getSeasonById(req.params.id)
    .then((s) => {
      if (!s) return respond.fail(res, 404, 'Season not found!');

      const standings = compileStandings(s.Standings);

      respond.success(
        res,
        200,
        'Season Standings fetched successfully',
        standings
      );
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Season Standings', err);
    });
});

/** Delete Season by id */
router.delete('/:id', (req: Request, res: Response) => {
  // fifrst delete the season, then remove the ref of the season from the competitions array
  const id = req.params.id;

  // Use validators here...
  if (!id) {
    return respond.fail(res, 404, 'Please provide valid Season ID!');
  }

  const deleteSeason = () => {
    return deleteSeasonById(id);
  };

  deleteSeason()
    .then((done) => {
      return respond.success(res, 200, 'Season deleted successfully');
    })
    .catch((err) => {
      return respond.fail(res, 400, 'Error deleting Season', err.toString());
    });
});

router.get('/:id/awards', giveAwards);

export default router;
