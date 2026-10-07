import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import { getTile } from '../../services/world/world-service.client';

const s = initServer();

/**
 * Zoomable world map tiles (docs/perfect/WORLD-HIERARCHY-SPEC.md §7). Node does
 * not own the data: it proxies to the Go world-service so the client keeps a
 * typed, bounded per-viewport API (D2 forbids a whole-world payload).
 */
export const tilesTsRestRoutes = s.router(contract.tiles, {
  getTile: async ({ params }) => {
    try {
      const tile = await getTile(params.z, params.x, params.y);
      return { status: 200, body: { success: true as const, message: 'Tile', payload: tile } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 400, body: { success: false as const, message } };
    }
  },
});
