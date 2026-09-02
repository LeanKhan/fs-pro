import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  calculateClubsTotalRatings,
  updateClubFields,
  getClubs,
} from '../controllers/clubs/club.service';
import respond from '../helpers/responseHandler';
import log from '../helpers/logger';
import { ClubInterface } from '../controllers/clubs/club.model';

interface RatingObject {
  avg_rating: number;
  position: string | null;
}

function getRatingValues(rating_obj: RatingObject | undefined): number {
  return rating_obj ? rating_obj.avg_rating : 0;
}

export const calculateClubRating: RequestHandler = (
  req: Request,
  res: Response
) => {
  calculateClubsTotalRatings(req.params.id)
    .then((ratings: RatingObject[]) => {
      // Now calculate the total Average rating...
      let total_rating: number | undefined;

      if (ratings.length !== 0) {
        total_rating = ratings.reduce((sum: number, { avg_rating }: { avg_rating: number }) => {
          return (sum += avg_rating);
        }, 0);
      }

      const attClass = getRatingValues(ratings.find((r: RatingObject) => r.position === 'ATT')) +
      getRatingValues(ratings.find((r: RatingObject) => r.position === 'MID')) / 2;

      const defClass = getRatingValues(ratings.find((r: RatingObject) => r.position === 'GK')) +
      getRatingValues(ratings.find((r: RatingObject) => r.position === 'DEF')) / 2;

      const avg_total_rating = total_rating ? total_rating / ratings.length : 0;

      const data: ClubRating = {
        Rating: avg_total_rating,
        AttackingClass: attClass,
        DefensiveClass: defClass,
      };

      ratings.forEach((rating: RatingObject, i: number) => {
        data[`${rating.position}_Rating`] = getRatingValues(rating);
      });

      // Now update club...

      updateClubFields(req.params.id, data)
        .then((club) => {
          respond.success(
            res,
            200,
            req.query.remove
              ? 'Player removed from Club successfully'
              : 'Player added to Club successfully',
            club
          );
        })
        .catch((err: any) => {
          log(`Error updating Club Rating => ${err}`);
          respond.fail(res, 400, 'Error updating Club Rating', err.toString());
        });
    })
    .catch((err: any) => {
      return respond.fail(res, 400, 'Error updating Players and Clubs', err.toString());
    });
};

export function updateAllClubsRating(req: Request, res: Response) {
  // now, update all the Clubs... becasue by now, all clubs should have updated Squads...
  const allClubs = () => {
    return getClubs();
  };

  const updClub = (club_id: string) => {
    return calculateClubsTotalRatings(club_id)
      .then((ratings: RatingObject[]) => {
        // Now calculate the total Average rating...
        let total_rating: number | undefined;

        if (ratings.length !== 0) {
          total_rating = ratings.reduce((sum: number, { avg_rating }: { avg_rating: number }) => {
            return (sum += avg_rating);
          }, 0);
        }

        const attClass =
          (ratings.find((r: RatingObject) => r.position === 'ATT')!.avg_rating +
            ratings.find((r: RatingObject) => r.position === 'MID')!.avg_rating) /
          2;

        const defClass =
          (ratings.find((r: RatingObject) => r.position === 'GK')!.avg_rating +
            ratings.find((r: RatingObject) => r.position === 'DEF')!.avg_rating) /
          2;

        const avg_total_rating = total_rating
          ? total_rating / ratings.length
          : 0;

        const data: ClubRating = {
          Rating: avg_total_rating,
          AttackingClass: attClass,
          DefensiveClass: defClass,
        };

        ratings.forEach((rating: RatingObject, _i: number) => {
          data[`${rating.position}_Rating`] = rating.avg_rating;
        });

        // Now update club...
        return updateClubFields(club_id, data);
      })
      .catch((err: any) => {
        throw err;
      });
  };

  const runAll = (clubs: ClubInterface[]) => {
    const t = clubs.map((c) => updClub(c._id as string));

    return Promise.all(t);
  };

  allClubs()
    .then(runAll)
    .then((c) => {
      console.log('Calendar Year Ended Successfully!')
      return respond.success(res, 200, 'Players and Clubs updated successfully! Year ENDED :)');
    })
    .catch((err) => {
      console.log('Error updating Clubs!');
      console.error(err);
      return respond.fail(res, 400, 'Error fetching Club', err.toString());
    });
}

interface ClubRating {
  Rating: number;
  [key: string]: any;
}

export function addPlayerToClubMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Club.Players doesn't exist on Postgres - ownership already lives on
  // the Player row (players.Club, just written by updatePlayerSigning
  // earlier in this same middleware chain), so there's nothing left to do
  // here.
  return next();
}

export function addManyPlayersToClub(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Same reason as addPlayerToClubMiddleware above - nothing left to do on
  // the Club row itself.
  return next();
}

export async function addLeagueToClub(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const club = await updateClubFields(req.body.clubId, {
      LeagueCode: req.body.leagueCode,
      League: req.params.league_id,
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
