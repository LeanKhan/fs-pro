// packages/api-contract/src/routes/tiles.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { TileSchema } from '../schemas/world-service';

const c = initContract();

/** Zod schema for the world map tiles (docs/perfect/WORLD-HIERARCHY-SPEC.md
 * §7). The Node server proxies these to the Go world-service, so the client
 * stays typed. Zoom z is 0 (world) .. 5 (club). */
export const tilesContract = c.router(
  {
    /** One bounded tile: the level's places with their club counts and the
     * top-K clubs by prominence. */
    getTile: {
      method: 'GET',
      path: '/:z/:x/:y',
      pathParams: z.object({
        z: z.coerce.number().int().min(0).max(5),
        x: z.coerce.number().int().min(0),
        y: z.coerce.number().int().min(0),
      }),
      responses: { 200: successEnvelope(TileSchema), 400: failEnvelope() },
    },
  },
  { pathPrefix: '/tiles' }
);
