// packages/api-contract/src/routes/calendar.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CalendarSchema, DaySchema, WorldFeedSchema } from '../schemas/calendar';
import { SeasonSchema } from '../schemas/season';
import { SeasonReportSchema } from '../schemas/season-report';
import { successEnvelope, failEnvelope } from '../schemas/envelope';

const c = initContract();

export const calendarContract = c.router(
  {
    getCurrentCalendar: {
      method: 'GET',
      path: '/current',
      responses: {
        200: successEnvelope(CalendarSchema),
        400: failEnvelope(),
      },
    },

    // What changed when each season cycle ended (promotions/relegations,
    // champions, retirements, breakouts) - newest cycle first.
    getSeasonReports: {
      method: 'GET',
      path: '/season-reports',
      responses: {
        200: successEnvelope(z.array(SeasonReportSchema)),
        400: failEnvelope(),
      },
    },

    getSeasonReport: {
      method: 'GET',
      path: '/season-reports/:year',
      pathParams: z.object({
        year: z.string(),
      }),
      responses: {
        200: successEnvelope(SeasonReportSchema),
        404: failEnvelope(),
        400: failEnvelope(),
      },
    },

    getWorldFeed: {
      method: 'GET',
      path: '/world-feed',
      responses: {
        200: successEnvelope(WorldFeedSchema),
        400: failEnvelope(),
      },
    },

    // Calendar events (not matches) scheduled within an inclusive day
    // range - fixtures on a given day come from GET /fixtures?scheduledDay=
    // instead.
    getDays: {
      method: 'GET',
      path: '/days',
      query: z.object({
        from: z.coerce.number().optional(),
        to: z.coerce.number().optional(),
      }),
      responses: {
        200: successEnvelope(z.array(DaySchema)),
        400: failEnvelope(),
      },
    },

    deleteDay: {
      method: 'DELETE',
      path: '/days/:id',
      pathParams: z.object({
        id: z.string(),
      }),
      responses: {
        200: successEnvelope(DaySchema),
        400: failEnvelope(),
      },
    },

    // Start the next season cycle - one Season per Competition, fixtures
    // generated and scheduled from the Calendar's current day.
    startNextSeasonCycle: {
      method: 'POST',
      path: '/seasons/next',
      body: z.object({
        Year: z.string(),
      }),
      responses: {
        200: successEnvelope(z.array(SeasonSchema)),
        400: failEnvelope(),
      },
    },

    // End a season cycle - prolegates every Season in :year once they're
    // all finished, then progresses Player/Club ratings for the new cycle.
    endSeasonCycle: {
      method: 'POST',
      path: '/end-season/:year',
      pathParams: z.object({
        year: z.string(),
      }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(z.object({})),
        400: failEnvelope(),
      },
    },

    healCalendar: {
      method: 'POST',
      path: '/heal',
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(
          z.object({
            healedCount: z.number(),
            currentDay: z.number(),
          })
        ),
        400: failEnvelope(),
      },
    },

    simulateToDate: {
      method: 'POST',
      path: '/simulate-to-date',
      body: z.object({
        targetDay: z.number().optional(),
        targetDate: z.string().optional(),
        includeTargetDay: z.boolean().optional(),
      }),
      responses: {
        200: successEnvelope(
          z.object({
            startDay: z.number(),
            currentDay: z.number(),
            currentDate: z.string(),
            simulatedFixtures: z.number(),
            simulatedDays: z.number(),
          })
        ),
        400: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/calendar', strictStatusCodes: true }
);
