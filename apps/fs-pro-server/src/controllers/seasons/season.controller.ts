/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

/**
 * 1. Get the latest seasons of the Competitions involved ...
 * 2. Create Calendar Days by pushing Season fixtures to Calendar with maybe
 *    some free days inbetween..
 * 3. Let's gooo!
 */
export async function getCurrentSeasonsForYear(year: string) {
  return getSeasons({ Year: year });
}

/** Errors specific to finishing a Season - thrown so the ts-rest handler
 * can pick the right status code, matching the original's distinct 404 vs
 * 400 branches. */
export class FinishSeasonError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404
  ) {
    super(message);
  }
}

/** Finish Season: prolegates the Season's Standings into Promoted/Relegated,
 * marks it finished. Plain function (not Express middleware) so it can be
 * called directly from a ts-rest handler - see season.router.ts's
 * finishSeason. Returns the data giveAwards needs (extracted from what used
 * to be passed via req.body.seasonChampions/standings/updatedSeason). */
export async function finishSeasonPlain(season_id: string) {
  const season = await getSeasonById(season_id);
  const competition = season
    ? await getCompetitionById(season.CompetitionId as string)
    : null;

  if (!season || !season.isStarted || !competition) {
    // Either: Id is wrong, Season is not started yet, or is already finished.
    throw new FinishSeasonError(
      'Either, Id is wrong, Season is not started yet or is already finished',
      404
    );
  }

  if (!(season.Fixtures ?? []).every((f) => f.Played)) {
    throw new FinishSeasonError('Not all Fixtures have been played yet! :7', 404);
  }

  const standings = compileStandings(season.Standings);
  const cmp = competition;
  // TODO: Do Best Player etc...

  const prolegated =
    cmp.Division == 1 && cmp.League
      ? {
          Relegated: standings
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .slice(standings.length - cmp.TeamsRelegated!)
            .map((s) => s.ClubID),
        }
      : {
          Promoted: standings.slice(0, cmp.TeamsPromoted).map((s) => s.ClubID),
        };

  const seasonChampions = standings[0].ClubID;

  const updatedSeason = await updateSeasonFields(season_id, {
    isStarted: true,
    isFinished: true,
    Status: 'finished',
    EndDate: new Date(),
    WinnerId: seasonChampions, // Winner of the League
    Logs: [
      ...(season.Logs ?? []),
      {
        title: `Season finished`,
        content: 'Season finished!',
        date: new Date(),
      },
    ],
    ...prolegated,
  } as Partial<SeasonInterface>);

  return { updatedSeason, standings, seasonChampions };
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
