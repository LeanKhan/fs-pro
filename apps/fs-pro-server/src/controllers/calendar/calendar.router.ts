import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  Calendar as ContractCalendar,
  Day as ContractDay,
} from '@repo/api-contract';
import { getCalendar, healCalendar } from './calendar.service';
import {
  getClockState,
  setClock,
  tickNow,
} from '../../services/calendar/calendar-clock.service';
import { getEvents, deleteDayById } from '../days/day.service';
import { WorldFeedService } from '../../services/world/world-feed.service';
import {
  getSeasonReport,
  listSeasonReports,
} from '../../services/world/season-report.service';
import { runWorldDaysUntil } from '../../services/world/world-day.service';

const s = initServer();

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
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

  getSeasonReports: async () => {
    try {
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season reports fetched successfully',
          payload: await listSeasonReports(),
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching season reports',
          payload: fail(err),
        },
      };
    }
  },

  getSeasonReport: async ({ params }) => {
    try {
      const report = await getSeasonReport(params.year.trim().toUpperCase());
      if (!report) {
        return {
          status: 404,
          body: { success: false, message: 'No report for that season cycle' },
        };
      }
      return {
        status: 200,
        body: {
          success: true,
          message: 'Season report fetched successfully',
          payload: report,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching season report',
          payload: fail(err),
        },
      };
    }
  },

  getWorldFeed: async () => {
    try {
      const feed = await WorldFeedService.generateWorldFeed();
      return {
        status: 200,
        body: {
          success: true,
          message: 'World feed fetched successfully',
          payload: feed,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching world feed',
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

  getClock: async () => {
    try {
      return {
        status: 200,
        body: {
          success: true,
          message: 'Clock state',
          payload: await getClockState(),
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error reading clock',
          payload: fail(err),
        },
      };
    }
  },

  setClock: async ({ body }) => {
    try {
      const state = await setClock(body);
      return {
        status: 200,
        body: { success: true, message: `Clock ${state.mode}`, payload: state },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating clock',
          payload: fail(err),
        },
      };
    }
  },

  tickClock: async () => {
    try {
      const result = await tickNow();
      return {
        status: 200,
        body: {
          success: true,
          message: `Advanced day ${result.fromDay} -> ${result.toDay}`,
          payload: result,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error running tick',
          payload: fail(err),
        },
      };
    }
  },

  healCalendar: async () => {
    try {
      const result = await healCalendar();
      return {
        status: 200,
        body: {
          success: true,
          message: `Calendar healed successfully! Auto-resolved ${result.healedCount} unplayed fixtures.`,
          payload: result,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error healing calendar',
          payload: fail(err),
        },
      };
    }
  },

  simulateToDate: async ({ body }) => {
    try {
      const calendar = await getCalendar();
      const targetDay =
        body.targetDay ??
        (body.targetDate
          ? calendar.CurrentDay +
            Math.round(
              (new Date(body.targetDate).getTime() -
                new Date(calendar.CurrentDate).getTime()) /
                DAY_MS
            )
          : calendar.CurrentDay);
      const result = await runWorldDaysUntil(
        targetDay,
        body.includeTargetDay !== false
      );

      return {
        status: 200,
        body: {
          success: true,
          message: `Simulation complete! Simulated ${result.simulatedFixtures} match(es) across ${result.simulatedDays} day(s).`,
          payload: result,
        },
      };
    } catch (err) {
      console.error('[simulateToDate] Error:', err);
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error simulating to target date',
          payload: fail(err),
        },
      };
    }
  },
});
