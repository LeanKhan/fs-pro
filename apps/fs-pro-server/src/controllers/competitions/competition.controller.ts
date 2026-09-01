import { Request, Response, NextFunction } from 'express';
import respond from '../../helpers/responseHandler';
import {
  update,
  addSeason,
  getCompetitionById,
} from '../../controllers/competitions/competition.service';
import { updateClub, updateClubFields } from '../clubs/club.service';
import { CompetitionInterface } from './competition.model';
import DB from '../../db';

export function addClubToCompetition(req: Request, res: Response) {
  const { id } = req.params;
  const { clubId: club, leagueCode } = req.body;

  if(!club) {
    return respond.fail(res, 400, 'No Club sent to add!');
  }

  if (DB.ormType === 'drizzle') {
    // Competition.Clubs doesn't exist on Postgres - a club's league is a
    // direct Clubs.League/LeagueCode FK/column (see
    // ICompetitionRepository's doc comment for why that's the only
    // mechanism this write needs, not the currently-unused
    // `competitionClubs` join table), so that's the only write that
    // matters; the reverse "clubs in this competition" lookup is a query,
    // not a stored array to also update here.
    getCompetitionById(id)
      .then((comp) => {
        if (!comp) {
          throw new Error('Competition does not exist!');
        }
        return updateClubFields(club, { LeagueCode: comp.CompetitionCode, League: comp._id });
      })
      .then(() => {
        respond.success(
          res,
          200,
          'Club has been added to Competition successfully!'
        );
      })
      .catch((err) => {
        respond.fail(res, 400, 'Error adding Club to Competition', err);
      });
    return;
  }

  // check if the club already in the Competition kini

  const up = {
    $addToSet: { Clubs: club }, // only add unique items...
  };

  const addClub = () => {
    return update(id, up);
  };

  const addCompetitionToClub = (comp: CompetitionInterface) => {
    const up2 = {
      $set: { LeagueCode: comp.CompetitionCode, League: comp._id },
    };

    return updateClub(club, up2);
  };

  addClub()
    .then(addCompetitionToClub)
    .then(() => {
      respond.success(
        res,
        200,
        'Club has been added to Competition successfully!'
      );

    })
    .catch((err) => {
      respond.fail(res, 400, 'Error adding Club to Competition', err);
    });
}

export function addSeasonToCompetition(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (DB.ormType === 'drizzle') {
    // Competition.Seasons doesn't exist on Postgres - Seasons.Competition
    // (set at season-creation time, see middleware/seasons.ts's `create`)
    // already carries this relationship, nothing left to write.
    respond.success(res, 200, 'Season added to competition successfully!');
    return;
  }

  addSeason(req.body.data.Competition, req.body.seasonMongoID)
    .then(() => {
      respond.success(res, 200, 'Season added to competition successfully!');
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error adding sesason to competition', err);
    });
}
