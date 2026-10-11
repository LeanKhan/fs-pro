// packages/api-contract/src/routes/league.ts
//
// The Standing-ladder routes (docs/coc-mapping/05 §3, 04 §4-§5): the club's
// Standing (points, league, multiplier), its weekly tournament pool, the
// signup that joins the week's pool, and the rolling Form Bonus window. All
// timers in the payload are absolute UTC ISO-8601 timestamps (04 §12).

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  FormBonusSchema,
  LeagueSignupRequestSchema,
  StandingPoolSchema,
  StandingSchema,
} from '../schemas/standing';

const clubParam = z.object({ clubId: z.string() });

const c = initContract();

export const leagueContract = c.router(
  {
    /** The club's Standing: points, its league code/division, the loot
     * multiplier (x100) and its global ladder rank. */
    standing: {
      method: 'GET',
      path: '/standing/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(StandingSchema),
        404: failEnvelope(),
      },
    },

    /** The club's weekly tournament pool (04 §4.3). 404 when the club has not
     * signed up for the current week. */
    pool: {
      method: 'GET',
      path: '/pool/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(StandingPoolSchema),
        404: failEnvelope(),
      },
    },

    /** Join this week's tournament pool (04 §4.3). Owner only (the club id is
     * in the body); a club below Bronze III is refused (409). */
    signup: {
      method: 'POST',
      path: '/signup',
      body: LeagueSignupRequestSchema,
      responses: {
        200: successEnvelope(StandingPoolSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** The rolling Form Bonus window (04 §5.3): stars earned within ~24h, the
     * 5-star requirement, whether the bonus is ready, and when the window
     * resets. */
    formBonus: {
      method: 'GET',
      path: '/form-bonus/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(FormBonusSchema),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/league', strictStatusCodes: true }
);
