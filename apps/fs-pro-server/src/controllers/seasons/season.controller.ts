/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NextFunction, Request, Response } from 'express';
import respond from '../../helpers/responseHandler';
import {
  getSeasons,
  getSeasonById,
  updateSeasonFields,
} from '../../controllers/seasons/season.service';
import { SeasonInterface } from './season.model';
import { compileStandings } from '../../utils/seasons';
import { CompetitionInterface } from '../competitions/competition.model';
import {
  getCompetitionById,
  getCompetitions,
} from '../competitions/competition.service';
import { appendClubRecord } from '../clubs/club.service';

export async function getCurrentSeasons(req: Request, res: Response) {
  /**
   * 1. Get the latest seasons of the Competitions involved ...
   * 2. Create Calendar Days by pushing Season fixtures to Calendar with maybe some free days inbetween..
   * 3. Let's gooo!
   */

  const year = req.params.year;

  try {
    const seasons = await getSeasons({ Year: year });
    if (seasons.length == 0) {
      return respond.fail(res, 404, 'No Seasons found!', seasons);
    }
    return respond.success(res, 200, 'Found seasons', seasons);
  } catch (error) {
    return respond.fail(res, 400, 'Failed to get seasons \n ' + error, error);
  }
}

/**
 * Finish Season!
 * @param req
 * @param res
 * @returns
 */
export async function finishSeason(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id: season_id } = req.params;

  if (!season_id) {
    // SEND IT BACK!
    return respond.fail(res, 404, 'No Season ID sent! Cannot end season...', {
      matchErrorResponseCode: 1,
    });
  }

  let season: SeasonInterface | null;
  let competition: CompetitionInterface | null;

  try {
    season = await getSeasonById(season_id);
    competition = season
      ? await getCompetitionById(season.CompetitionId as string)
      : null;
  } catch (error) {
    console.log(`Error! => ${error}`);

    return respond.fail(
      res,
      400,
      'Error ending Season, could not fetch Season',
      {
        error,
        matchErrorResponseCode: 1,
      }
    );
  }

  if (!season || !season.isStarted || !competition) {
    /**
     * This means:
     * - Id is wrong,
     * - Season is not started yet, therefore cannot be ended,
     * - Season is already finished...
     */
    return respond.fail(
      res,
      404,
      'Either, Id is wrong, Season is not started yet or is already finished',
      {
        seasonErrorResponseCode: '404 - Season not found',
      }
    );
  }

  // Now do the things...
  // check if all the matches have actually been played
  try {
    if (!(season.Fixtures ?? []).every((f) => f.Played)) {
      return respond.fail(
        res,
        404,
        'Not all Fixtures have been played yet! :7',
        {
          seasonErrorResponseCode:
            '400 - Not all matches in Season have been played! ',
        }
      );
    }

    const standings = compileStandings(season.Standings);
    const cmp = competition;
    // TODO: Do Best Player etc...

    const updateSeason = () => {
      const prolegated =
        cmp.Division == 1 && cmp.League
          ? {
              Relegated: standings
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .slice(standings.length - cmp.TeamsRelegated!)
                .map((s) => s.ClubID),
            }
          : {
              Promoted: standings
                .slice(0, cmp.TeamsPromoted)
                .map((s) => s.ClubID),
            };

      req.body.seasonChampions = standings[0].ClubID;

      return updateSeasonFields(season_id, {
        isStarted: true,
        isFinished: true,
        Status: 'finished',
        EndDate: new Date(),
        WinnerId: standings[0].ClubID, // Winner of the League
        Logs: [
          ...(season!.Logs ?? []),
          {
            title: `Season finished`,
            content: 'Season finished!',
            date: new Date(),
          },
        ],
        ...prolegated,
      } as Partial<SeasonInterface>);
    };

    updateSeason()
      .then((updatedSeason: any) => {
        req.body.updatedSeason = updatedSeason;
        req.body.standings = standings;
        return next();
      })
      .catch((err: any) => {
        console.error(err);
        console.log('Error ending Season!');

        return respond.fail(res, 400, 'Error ending Season!', err);
      });
  } catch (error) {
    console.error(error);
    return respond.fail(res, 400, 'Error doing something', error);
  }
}

/**
 * Prolegate: (Pro)mote or Re(legate)
 *
 * This function promotes or relegates the clubs in the Season...
 * @param season_id
 * @returns
 */
export async function prolegate(season_id: string) {
  const season = await getSeasonById(season_id);
  if (!season) {
    throw new Error(`Season [${season_id}] does not exist`);
  }
  const cmp = await getCompetitionById(season.CompetitionId as string);
  if (!cmp) {
    throw new Error(`Competition for Season [${season_id}] does not exist`);
  }

  const moveClub = async (
    club_id: string,
    old_comp: CompetitionInterface,
    type: 'up' | 'down'
  ) => {
    let diff: number;

    console.log('Inside MoveClub');

    switch (type) {
      case 'up':
        diff = -1;
        console.log('Promoting Club...', club_id);
        break;
      case 'down':
        diff = 1;
        // adding becasue the lower leagues have higher division numbers i.e
        // League 1 is higher than League 2
        console.log('Relegating Club...', club_id);
    }

    // find the new Competition that is higher than current comp but
    // in the same country.
    const [new_comp] = await getCompetitions({
      Division: old_comp.Division + diff,
      CountryId: old_comp.CountryId,
    });

    if (!new_comp) {
      throw new Error(
        `No competition found for Division ${old_comp.Division + diff} in the same country as ${old_comp.Name}`
      );
    }

    const record_msg = `Got ${type == 'up' ? 'Promoted' : 'Relegated'} to ${
      new_comp.Name
    }`;

    try {
      // Competition.Clubs doesn't exist on Postgres (dropped in favor of
      // the reverse Clubs.League FK, set right below) - nothing to update
      // on either Competition row.
      await appendClubRecord(
        club_id,
        { LeagueId: new_comp._id, LeagueCode: new_comp.CompetitionCode },
        {
          title: 'League Movement',
          data: `From (${old_comp.Name}) ${old_comp._id} to (${new_comp.Name}) ${new_comp._id}`,
          content: record_msg,
          date: new Date(),
        }
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  let move_type: 'up' | 'down';
  switch (cmp.Division) {
    case 1:
      move_type = 'down';

      return Promise.all(
        season.Relegated.map((c) => moveClub(c, cmp, move_type))
      );
    case 2:
      move_type = 'up';

      return Promise.all(
        season.Promoted.map((c) => moveClub(c, cmp, move_type))
      );
  }
}
