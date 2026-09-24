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
import { payoutSeasonPrizes } from '../../services/economy/prize-money.service';
import {
  bottomTierOf,
  getTierInfo,
  planMoves,
  type TierInfo,
} from '../../services/competitions/pyramid.service';

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

  // Pyramid leagues (Competitions.Tier set): a pod promotes its top
  // TeamsPromoted clubs (unless top flight) and relegates its bottom
  // TeamsRelegated (unless bottom tier). Anything else keeps the legacy rules.
  const tierInfo = cmp.League ? await getTierInfo(cmp._id as string) : null;
  let pyramidMoves: { Promoted: string[]; Relegated: string[] } | null = null;
  if (tierInfo) {
    const bottom = await bottomTierOf(tierInfo.countryId);
    const up = tierInfo.tier > 1 ? tierInfo.teamsPromoted : 0;
    const down = tierInfo.tier < bottom ? tierInfo.teamsRelegated : 0;
    for (const [value, field] of [
      [up, 'TeamsPromoted'],
      [down, 'TeamsRelegated'],
    ] as const) {
      if (value == null || !Number.isInteger(value) || value < 0) {
        throw new FinishSeasonError(
          `${cmp.Name} (tier ${tierInfo.tier}) has no ${field} set, so no club would move league. Set it on the competition before finishing the season.`,
          400
        );
      }
    }
    if ((up as number) + (down as number) > standings.length) {
      throw new FinishSeasonError(
        `${cmp.Name} is set to move ${(up as number) + (down as number)} clubs but only has ${standings.length}.`,
        400
      );
    }
    pyramidMoves = {
      Promoted: standings.slice(0, up as number).map((s) => s.ClubID),
      Relegated: (down as number) > 0
        ? standings.slice(standings.length - (down as number)).map((s) => s.ClubID)
        : [],
    };
  }

  // A league with no promotion/relegation count would silently move nobody
  // (slice(len - null) and slice(0, null) both select no clubs), so refuse to
  // finish it until the slot count is configured on the competition.
  if (cmp.League && !tierInfo) {
    const slots = cmp.Division == 1 ? cmp.TeamsRelegated : cmp.TeamsPromoted;
    const slotField = cmp.Division == 1 ? 'TeamsRelegated' : 'TeamsPromoted';
    if (slots == null || !Number.isInteger(slots) || slots < 0) {
      throw new FinishSeasonError(
        `${cmp.Name} has no ${slotField} set, so no club would move league. Set it on the competition before finishing the season.`,
        400
      );
    }
    if (slots > standings.length) {
      throw new FinishSeasonError(
        `${cmp.Name} is set to move ${slots} clubs (${slotField}) but only has ${standings.length}.`,
        400
      );
    }
  }

  const prolegated = pyramidMoves
    ? pyramidMoves
    : cmp.Division == 1 && cmp.League
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

  // The season is already finished at this point, so a payout problem is
  // logged rather than failing the request (the payout is idempotent).
  try {
    await payoutSeasonPrizes(season_id);
  } catch (error) {
    console.error('Could not pay out season prize money:', error);
  }

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

  // Pyramid leagues: the destination pod comes from pyramid.service.planMoves
  // (any number of tiers/pods; middle tiers both promote and relegate).
  const tierInfo = cmp.League ? await getTierInfo(cmp._id as string) : null;
  if (tierInfo) {
    return prolegatePyramid(cmp, tierInfo, season);
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

async function prolegatePyramid(
  cmp: CompetitionInterface,
  info: TierInfo,
  season: SeasonInterface
) {
  const moves = await planMoves(info, season.Promoted ?? [], season.Relegated ?? []);

  // Refuse to move anyone if a destination league is missing, so a half
  // applied cycle can't strand clubs.
  const missing = moves.find((m) => !m.to);
  if (missing) {
    throw new Error(
      `No league at tier ${missing.toTier} pod ${missing.toPod} to ${
        missing.direction === 'promoted' ? 'promote' : 'relegate'
      } clubs from ${cmp.Name} into`
    );
  }

  return Promise.all(
    moves.map((m) => {
      const to = m.to!;
      return appendClubRecord(
        m.clubId,
        { LeagueId: to.id, LeagueCode: to.code },
        {
          title: 'League Movement',
          data: `From (${cmp.Name}) ${cmp._id} to (${to.name}) ${to.id}`,
          content: `Got ${m.direction === 'promoted' ? 'Promoted' : 'Relegated'} to ${to.name}`,
          date: new Date(),
        }
      );
    })
  );
}
