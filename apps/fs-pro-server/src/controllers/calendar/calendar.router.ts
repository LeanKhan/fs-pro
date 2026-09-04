import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Calendar as ContractCalendar,
  Day as ContractDay,
  Season as ContractSeason,
} from '@repo/api-contract';

import { getCalendar } from './calendar.service';
import { getEvents, deleteDayById } from '../days/day.service';
import { getCompetitions } from '../competitions/competition.service';
import { create as createSeason } from '../../middleware/seasons';
import {
  getSeasons,
  getSeasonById,
  updateSeasonFields,
} from '../seasons/season.service';
import { updateFixtureFields } from '../fixtures/fixture.service';
import { prolegate } from '../seasons/season.controller';
import { updateAllPlayerDetailsForYear } from '../players/player.controller';
import { deductWagesForYear } from '../transfers/transfer.service';
import {
  retireEligiblePlayersForYear,
  runYouthIntakeForYear,
} from '../players/player-lifecycle.service';
import { refreshAllClubsRatings } from '../clubs/club.service';
import type { SeasonInterface } from '../seasons/season.model';

const s = initServer();

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * `getSeasons()` (list) doesn't populate `Fixtures` the way `getSeasonById()`
 * (single) always does - each Season the fixture-arrangement pass below
 * processes needs the fully-hydrated version.
 */
async function hydrateSeasonFixtures(
  seasonStubs: { _id?: string }[]
): Promise<SeasonInterface[]> {
  const hydrated = await Promise.all(
    seasonStubs.map((season) => getSeasonById(season._id as string))
  );
  return hydrated.filter((season): season is SeasonInterface => !!season);
}

/**
 * Arranges every given Season's Fixtures across days, writing
 * ScheduledDay/ScheduledDate directly onto each Fixture - "N matches per
 * week, skip every other day". `startDay` anchors the arrangement to the
 * Calendar's current position, so a new cycle's days never collide with a
 * past cycle's.
 */
function arrangeSeasonFixturesAcrossDays(
  seasons: SeasonInterface[],
  startDay: number
): { fixtureId: string; day: number }[] {
  const scheduled: { fixtureId: string; day: number }[] = [];

  seasons.forEach((season) => {
    const seasonFixtures = season.Fixtures ?? [];
    const matchesPerWeek = seasonFixtures.length / season.Standings.length;
    const numberOfWeeks = season.Standings.length;

    function arrange(
      matchesInWeek: number,
      fixtureIdx: number,
      day: number
    ): { fixtureIdx: number; day: number } {
      if (matchesInWeek > 0 && matchesInWeek <= 3) {
        for (let a = 0; a < matchesInWeek; a++) {
          scheduled.push({
            fixtureId: seasonFixtures[fixtureIdx - 1]._id as unknown as string,
            day: startDay + day,
          });
          fixtureIdx++;
        }
        matchesInWeek -= matchesInWeek;
      }

      if (matchesInWeek >= 5) {
        for (let b = 0; b < 5; b++) {
          scheduled.push({
            fixtureId: seasonFixtures[fixtureIdx - 1]._id as unknown as string,
            day: startDay + day,
          });
          fixtureIdx++;
        }
        matchesInWeek -= 5;
      }

      day += 1;
      if (day % 2 === 0) {
        day += 1; // skip a day
      }

      if (matchesInWeek !== 0) {
        return arrange(matchesInWeek, fixtureIdx, day);
      }

      return { fixtureIdx, day };
    }

    let day = 1;
    let fixtureIdx = 1;
    const totalFixtures = matchesPerWeek * numberOfWeeks;

    while (fixtureIdx <= totalFixtures) {
      ({ fixtureIdx, day } = arrange(matchesPerWeek, fixtureIdx, day));
    }
  });

  return scheduled;
}

export const calendarTsRestRoutes = s.router(contract.calendar, {
  getCurrentCalendar: async () => {
    try {
      const calendar = await getCalendar();
      return {
        status: 200,
        body: {
          success: true,
          message: 'Fetched current Calendar successfully! :)',
          payload: calendar as unknown as ContractCalendar,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching current Calendar',
          payload: fail(err),
        },
      };
    }
  },

  /** Calendar events (not matches) scheduled within an inclusive day
   * range - fixtures on a given day come from GET /fixtures?scheduledDay=
   * instead. */
  getDays: async ({ query }) => {
    try {
      const from = query.from ?? 0;
      const to = query.to ?? from;
      const days = await getEvents(from, to);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Calendar events fetched successfully!',
          payload: days as unknown as ContractDay[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Calendar events',
          payload: fail(err),
        },
      };
    }
  },

  deleteDay: async ({ params }) => {
    try {
      const day = await deleteDayById(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Calendar Day deleted successfully :)',
          payload: day as unknown as ContractDay,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Calendar Day',
          payload: fail(err),
        },
      };
    }
  },

  /** Starts a new season cycle: creates one Season per Competition for
   * Year, arranges every fixture across days from the Calendar's current
   * position, and marks the new seasons started. */
  startNextSeasonCycle: async ({ body }) => {
    const Year = body.Year?.trim().toUpperCase();
    if (!Year) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Year is required to start a new season cycle',
        },
      };
    }

    try {
      const competitions = await getCompetitions();
      const calendar = await getCalendar();

      await Promise.all(
        competitions.map((comp) =>
          createSeason(comp.CompetitionCode, comp._id as string, Year)
        )
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
        seasons.map((season) =>
          updateSeasonFields(season._id as string, {
            isStarted: true,
            StartDate: new Date(),
            Status: 'started',
          })
        )
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Next season cycle started successfully!',
          payload: seasons as unknown as ContractSeason[],
        },
      };
    } catch (err) {
      console.error(err);
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error starting next season cycle',
          payload: fail(err),
        },
      };
    }
  },

  /** Ends a season cycle: prolegates (promotes/relegates) every Season in
   * :year once all are finished, then progresses Player/Club state for the
   * new cycle - extracted from the old endSeasonCycle -> updatePlayersDetails
   * -> updateAllClubsRating Express middleware chain.
   *
   * Order matters here, deliberately:
   * 1. updateAllPlayerDetailsForYear - recomputes Rating/Value/RatingsHistory
   *    AND increments Age (its own last internal step) - every later step in
   *    this sequence that reads Age sees this year's post-increment value.
   * 2. deductWagesForYear - runs BEFORE retirement so a retiring player's
   *    final year of wages still gets charged to their outgoing club (they
   *    were on the books nearly the whole year) - deductWagesForYear sums
   *    Wage by ClubId/isSigned, which retirement would otherwise have
   *    already cleared.
   * 3. retireEligiblePlayersForYear - rolls this year's post-increment Age
   *    against the retirement-chance table, frees retiring players' club
   *    slots.
   * 4. runYouthIntakeForYear - tops up any club now below target squad size
   *    (including ones that just lost players to step 3 THIS SAME cycle,
   *    since intake counts rosters fresh from the DB, not a stale snapshot).
   * 5. refreshAllClubsRatings - runs LAST, after every roster-changing step
   *    above, so no club is left with stale Rating/AttackingClass/etc from
   *    a squad that's since changed (retirement/intake both mutate rosters;
   *    nothing else in this sequence reads a club's Rating mid-way, so this
   *    reordering is safe).
   */
  endSeasonCycle: async ({ params }) => {
    const year = params.year?.trim().toUpperCase();
    if (!year) {
      return {
        status: 400,
        body: { success: false, message: 'Year is required to end a season cycle' },
      };
    }

    const allSeasons = await getSeasons({ Year: year });
    if (allSeasons.length === 0) {
      return {
        status: 400,
        body: { success: false, message: 'No Seasons found for that Year!' },
      };
    }

    const allFinished = allSeasons.every((s) => s.isFinished && s.isStarted);
    if (!allFinished) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Not all Seasons for that Year are finished yet!',
        },
      };
    }

    try {
      await Promise.all(allSeasons.map((season) => prolegate(season._id as string)));
      console.log('Seasons prolegated Successfully!');

      await updateAllPlayerDetailsForYear(year);
      await deductWagesForYear(year);
      await retireEligiblePlayersForYear(year);
      await runYouthIntakeForYear(year);
      await refreshAllClubsRatings();
      console.log('Calendar Year Ended Successfully!');

      return {
        status: 200,
        body: {
          success: true,
          message: 'Players and Clubs updated successfully! Year ENDED :)',
          payload: {},
        },
      };
    } catch (err) {
      console.error(err);
      console.log('Could not prolegate Seasons...');
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error prolegating Seasons!',
          payload: fail(err),
        },
      };
    }
  },
});
