// packages/api-contract/src/routes/campus.ts
//
// The campus economy routes (docs/coc-mapping/05 §3, 04): read the campus, run
// the crossed-currency upgrade, place a building, collect the collectors, clear
// a Derelict Grounds obstacle and buy the next Groundskeeper. All timers in the
// payload are absolute UTC ISO-8601 timestamps (04 §12).

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  CampusStateSchema,
  ClearObstacleRequestSchema,
  CollectRequestSchema,
  BuyGroundskeeperRequestSchema,
  PlaceRequestSchema,
  UpgradeRequestSchema,
  UsePerkRequestSchema,
} from '../schemas/coc-campus';

const clubParam = z.object({ clubId: z.string() });

const c = initContract();

export const campusContract = c.router(
  {
    /** A club's full campus: Clubhouse tier, collectors, vaults, groundskeepers,
     * obstacles, facility levels and every running upgrade's readyAt. */
    get: {
      method: 'GET',
      path: '/:clubId',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(CampusStateSchema),
        404: failEnvelope(),
      },
    },

    /** Pay the crossed currency and start the next level of a campus facility.
     * Only the club's owner (or an admin) may do this. */
    upgrade: {
      method: 'POST',
      path: '/:clubId/upgrade',
      pathParams: clubParam,
      body: UpgradeRequestSchema,
      responses: {
        200: successEnvelope(CampusStateSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Move one campus building; the whole layout is validated before it saves. */
    place: {
      method: 'POST',
      path: '/:clubId/place',
      pathParams: clubParam,
      body: PlaceRequestSchema,
      responses: {
        200: successEnvelope(CampusStateSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Bank every collector's lazy accrual in one tap. Returns the updated
     * campus; a second collect with nothing accrued is a 409. */
    collect: {
      method: 'POST',
      path: '/:clubId/collect',
      pathParams: clubParam,
      body: CollectRequestSchema,
      responses: {
        200: successEnvelope(CampusStateSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Clear a Derelict Grounds obstacle for a small Fan bonus and free space. */
    clearObstacle: {
      method: 'POST',
      path: '/:clubId/obstacle/clear',
      pathParams: clubParam,
      body: ClearObstacleRequestSchema,
      responses: {
        200: successEnvelope(CampusStateSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Buy the next purchasable Groundskeeper with Sponsor Credits (04 §2). */
    buyGroundskeeper: {
      method: 'POST',
      path: '/:clubId/groundskeeper/buy',
      pathParams: clubParam,
      body: BuyGroundskeeperRequestSchema,
      responses: {
        200: successEnvelope(CampusStateSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Redeem one quick consumable Board Perk (04 §7). `instanceId`, when
     * supplied, makes a retried request idempotent. */
    usePerk: {
      method: 'POST',
      path: '/:clubId/perk/use',
      pathParams: clubParam,
      body: UsePerkRequestSchema,
      responses: {
        200: successEnvelope(CampusStateSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/campus', strictStatusCodes: true }
);
