import { TileSchema, type Tile } from '@repo/api-contract';
import { $axios } from '@/services/api';

/**
 * GET /api/tiles/{z}/{x}/{y} — one bounded world-map tile.
 *
 * Deliberately NOT the ts-rest route `client.tiles.getTile`: `@ts-rest/core`
 * builds a path with
 *   `path.replace(..., (m,p) => params[p] ? ... : '')`
 * so a **falsy** path param (0) is replaced by an empty segment. The quadtree
 * origin is `z=0` (the whole-world level) and cells start at `x=0`/`y=0`, so
 * every world-level tile would request `/tiles//1/1` and 404. This helper
 * builds the URL directly and still validates with the frozen `TileSchema`
 * (packages/api-contract/src/schemas/world-service.ts), so the contract stays
 * the source of truth for the payload.
 */
export async function fetchTile(z: number, x: number, y: number): Promise<Tile> {
  const res = await $axios.get(`/tiles/${z}/${x}/${y}`, { validateStatus: () => true });
  const body = res.data as { success?: boolean; message?: string; payload?: unknown } | undefined;
  if (!body || body.success !== true || body.payload == null) {
    throw new Error(body?.message || `Tile ${z}/${x}/${y} failed (${res.status})`);
  }
  return TileSchema.parse(body.payload);
}
