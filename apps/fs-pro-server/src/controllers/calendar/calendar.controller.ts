import { Request, Response, NextFunction } from 'express';
import respond from '../../helpers/responseHandler';
import {
  getSeasons,
  getSeasonById,
  updateSeasonFields,
} from '../seasons/season.service';
import { updateFixtureFields } from '../fixtures/fixture.service';
import { getCalendar } from './calendar.service';
import { CompetitionInterface } from '../competitions/competition.model';
import { SeasonInterface } from '../seasons/season.model';
import { getCompetitions } from '../competitions/competition.service';
import { create } from '../../middleware/seasons';
import { prolegate } from '../seasons/season.controller';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `getSeasons()` (list) doesn't populate `Fixtures` the way `getSeasonById()`
 * (single) always does - Postgres has no stored `Season.Fixtures` array at
 * all (reverse `fixtures.Season` FK instead), so a season fetched via
 * `getSeasons()` has no `Fixtures` key whatsoever. The fixture-arrangement
 * pass below reads `.Fixtures` off every season it processes, so each needs
 * the fully-hydrated version.
 */
async function hydrateSeasonFixtures(
  seasonStubs: { _id?: string }[]
): Promise<SeasonInterface[]> {
  const hydrated = await Promise.all(
    seasonStubs.map((s) => getSeasonById(s._id as string))
  );
  return hydrated.filter((s): s is SeasonInterface => !!s);
}

/**
 * Arranges every given Season's Fixtures across days, writing
 * `ScheduledDay`/`ScheduledDate` directly onto each Fixture - the same
 * "N matches per week, skip every other day" algorithm the old
 * `setupDaysInYear2`'s `arrangeFixturesInDays`/`arrange()` used, just
 * targeting Fixture columns instead of building a separate `Days[].Matches`
 * structure. `startDay`/`startDate` anchor the arrangement to the Calendar's
 * current position, so a new cycle's days never collide with a past cycle's.
 */
function arrangeSeasonFixturesAcrossDays(
  seasons: SeasonInterface[],
  startDay: number
): { fixtureId: string; day: number }[] {
  const scheduled: { fixtureId: string; day: number }[] = [];

  seasons.forEach((s) => {
    const MatchesPerWeek = s.Fixtures.length / s.Standings.length;
    const NumberOfWeeks = s.Standings.length;

    function arrange(
      matchesInWeek: number,
      Fixture: number,
      Day: number
    ): { Fixture: number; Day: number } {
      if (matchesInWeek > 0 && matchesInWeek <= 3) {
        for (let a = 0; a < matchesInWeek; a++) {
          scheduled.push({
            fixtureId: s.Fixtures[Fixture - 1]._id as unknown as string,
            day: startDay + Day,
          });
          Fixture++;
        }
        matchesInWeek -= matchesInWeek;
      }

      if (matchesInWeek >= 5) {
        for (let b = 0; b < 5; b++) {
          scheduled.push({
            fixtureId: s.Fixtures[Fixture - 1]._id as unknown as string,
            day: startDay + Day,
          });
          Fixture++;
        }
        matchesInWeek -= 5;
      }

      Day += 1;
      if (Day % 2 === 0) {
        Day += 1; // skip a day
      }

      if (matchesInWeek !== 0) {
        return arrange(matchesInWeek, Fixture, Day);
      }

      return { Fixture, Day };
    }

    let Day = 1;
    let Fixture = 1;
    const TotalFixtures = MatchesPerWeek * NumberOfWeeks;

    while (Fixture <= TotalFixtures) {
      ({ Fixture, Day } = arrange(MatchesPerWeek, Fixture, Day));
    }
  });

  return scheduled;
}

/**
 * Starts a new season cycle: creates one Season per Competition for `Year`
 * (fixtures + initial standings, via `middleware/seasons.ts`'s `create()`),
 * arranges every fixture across days from the Calendar's current position,
 * and marks the new seasons started. Replaces `createSeasonsInTheYear` +
 * `setupDaysInYear2` + `startYear` + `activateCalendarYear` in one step -
 * there's no more per-year Calendar to create/activate.
 */
export async function startNextSeasonCycle(req: Request, res: Response) {
  const Year: string | undefined = (req.body?.data?.Year ?? req.body?.Year)
    ?.trim()
    .toUpperCase();

  if (!Year) {
    return respond.fail(
      res,
      400,
      'Year is required to start a new season cycle'
    );
  }

  try {
    const competitions: CompetitionInterface[] = await getCompetitions();
    const calendar = await getCalendar();

    await Promise.all(
      competitions.map((c) => create(c.CompetitionCode, c._id as string, Year))
    );

    const seasonStubs = await getSeasons({ Year });
    const seasons = await hydrateSeasonFixtures(seasonStubs);

    const scheduled = arrangeSeasonFixturesAcrossDays(
      seasons,
      calendar.CurrentDay
    );

    await Promise.all(
      scheduled.map(({ fixtureId, day }) =>
        updateFixtureFields(fixtureId, {
          ScheduledDay: day,
          ScheduledDate: new Date(
            calendar.CurrentDate.getTime() +
              (day - calendar.CurrentDay) * DAY_MS
          ),
        })
      )
    );

    await Promise.all(
      seasons.map((s) =>
        updateSeasonFields(s._id as string, {
          isStarted: true,
          StartDate: new Date(),
          Status: 'started',
        })
      )
    );

    return respond.success(
      res,
      200,
      'Next season cycle started successfully!',
      seasons
    );
  } catch (err: any) {
    console.error(err);
    return respond.fail(
      res,
      400,
      'Error starting next season cycle',
      err.toString()
    );
  }
}

export async function getCurrentCalendar(req: Request, res: Response) {
  try {
    const calendar = await getCalendar();
    return respond.success(
      res,
      200,
      'Fetched current Calendar successfully! :)',
      calendar
    );
  } catch (error: any) {
    return respond.fail(
      res,
      400,
      'Error fetching current Calendar',
      error.toString()
    );
  }
}

/**
 * Ends a season cycle: prolegates (promotes/relegates) every Season in
 * `Year`, once every one of them has finished. Replaces `endYear` - there's
 * no Calendar-level `isActive`/`isEnded`/`allSeasonsCompleted` flag to flip
 * anymore, so this is scoped purely by Year.
 */
export async function endSeasonCycle(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const year = req.params.year?.trim().toUpperCase();

  if (!year) {
    return respond.fail(res, 400, 'Year is required to end a season cycle');
  }

  const all_seasons = await getSeasons({ Year: year });

  if (all_seasons.length === 0) {
    return respond.fail(res, 400, 'No Seasons found for that Year!');
  }

  const all_finished = all_seasons.every((s) => s.isFinished && s.isStarted);

  if (!all_finished) {
    return respond.fail(
      res,
      400,
      'Not all Seasons for that Year are finished yet!'
    );
  }

  try {
    await Promise.all(all_seasons.map((s) => prolegate(s._id as string)));
    console.log('Seasons prolegated Successfully!');
    req.params.year = year;
    return next();
  } catch (err: any) {
    console.error(err);
    console.log('Could not prolegate Seasons...');
    return respond.fail(res, 400, 'Error prolegating Seasons!', err.toString());
  }
}
