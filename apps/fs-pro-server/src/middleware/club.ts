import { Request, Response, NextFunction } from 'express';
import {
  updateClubFields,
  refreshAllClubsRatings,
} from '../controllers/clubs/club.service';
import respond from '../helpers/responseHandler';

/** Still used by calendar.router.ts's /end-season/:year chain - clubs' own
 * ts-rest /refresh-ratings route calls refreshAllClubsRatings() directly
 * instead (see club.router.ts). */
export function updateAllClubsRating(req: Request, res: Response) {
  refreshAllClubsRatings()
    .then(() => {
      console.log('Calendar Year Ended Successfully!');
      return respond.success(
        res,
        200,
        'Players and Clubs updated successfully! Year ENDED :)'
      );
    })
    .catch((err) => {
      console.log('Error updating Clubs!');
      console.error(err);
      return respond.fail(res, 400, 'Error fetching Club', err.toString());
    });
}

export async function addLeagueToClub(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const club = await updateClubFields(req.body.clubId, {
      LeagueCode: req.body.leagueCode,
      LeagueId: req.params.league_id,
    });
    return respond.success(
      res,
      200,
      'Club added to competition successfully!',
      club
    );
  } catch (err: any) {
    return respond.fail(
      res,
      400,
      'Error adding player to club',
      err.toString()
    );
  }
}
