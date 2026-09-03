import { Request, Response, NextFunction } from 'express';
import respond from '../../helpers/responseHandler';

export function addSeasonToCompetition(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Competition.Seasons doesn't exist on Postgres - Seasons.Competition
  // (set at season-creation time, see middleware/seasons.ts's `create`)
  // already carries this relationship, nothing left to write.
  respond.success(res, 200, 'Season added to competition successfully!');
}
