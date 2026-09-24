// packages/api-contract/src/routes/world.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  PerformanceViewSchema,
  WorldDayReportSchema,
  WorldSettingsPatchSchema,
  WorldSettingsSchema,
  YearEndSummarySchema,
} from '../schemas/world';

const c = initContract();

/** World settings and the open-play year (admin only, except reading). */
export const worldContract = c.router(
  {
    getSettings: {
      method: 'GET',
      path: '/settings',
      responses: {
        200: successEnvelope(WorldSettingsSchema),
        400: failEnvelope(),
      },
    },

    updateSettings: {
      method: 'PATCH',
      path: '/settings',
      body: WorldSettingsPatchSchema,
      responses: {
        200: successEnvelope(WorldSettingsSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** End the year now (normally the clock does it on the boundary day). */
    endYear: {
      method: 'POST',
      path: '/end-year',
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(YearEndSummarySchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Run one game day now, whatever the clock mode. */
    advanceDay: {
      method: 'POST',
      path: '/advance-day',
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(WorldDayReportSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** A club's performance score for a year (current year by default). */
    performance: {
      method: 'GET',
      path: '/performance/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      query: z.object({ year: z.coerce.number().int().min(1).optional() }),
      responses: {
        200: successEnvelope(PerformanceViewSchema),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/world', strictStatusCodes: true }
);
