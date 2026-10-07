/**
 * Thin HTTP client for the world-service (services/world-service, Go) - the
 * in-repo Go service that owns placement, the place hierarchy queries,
 * prominence ranking, pyramid pool assignment and map tiles (D4). Node calls
 * it over HTTP; the shapes are the zod schemas in
 * packages/api-contract/src/schemas/world-service.ts, frozen in
 * docs/perfect/WORLD-SERVICE-CONTRACT.md.
 *
 * Keep every call to the service in this file rather than scattering `fetch`
 * calls through the codebase. Base URL is configurable via
 * WORLD_SERVICE_URL (defaults to the service's local-dev default,
 * http://localhost:3006) - never hardcode the URL at a call site. No SDK, no
 * axios: plain fetch, same as services/worldgen/client.ts.
 *
 * Non-2xx responses throw; response bodies are parsed with the contract's
 * zod schema so a drifted Go response fails loudly at the boundary.
 */

import {
  PlaceChildrenSchema,
  PlacementSpotSchema,
  ProminenceRecomputeResultSchema,
  ProminenceSchema,
  PyramidDrawSchema,
  PyramidJoinSchema,
  TileSchema,
  WorldServiceHealthSchema,
} from '@repo/api-contract';
import type {
  PlaceChildren,
  PlacementSpot,
  PlacementSpotRequest,
  Prominence,
  ProminenceRecompute,
  ProminenceRecomputeResult,
  PyramidDraw,
  PyramidJoin,
  PyramidJoinRequest,
  Tile,
  WorldServiceHealth,
} from '@repo/api-contract';

const DEFAULT_BASE_URL = 'http://localhost:3006';

function getBaseUrl(): string {
  return process.env.WORLD_SERVICE_URL || DEFAULT_BASE_URL;
}

/** Minimal structural type for a zod schema's parse, so the helper does not
 * import `z` at the call sites. */
interface Parser<T> {
  parse(value: unknown): T;
}

async function call<T>(
  label: string,
  path: string,
  schema: Parser<T>,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, init);

  if (!response.ok) {
    throw new Error(`world-service ${label} failed (${response.status})`);
  }

  return schema.parse(await response.json());
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * POST /placement/spot - the binding/preview spot. Called by Node's founding
 * transaction WHILE HOLDING PLACEMENT_LOCK; the Go handler must not take that
 * lock itself (WORLD-SERVICE-CONTRACT.md §1).
 */
export function getPlacementSpot(request: PlacementSpotRequest): Promise<PlacementSpot> {
  return call(
    'POST /placement/spot',
    '/placement/spot',
    PlacementSpotSchema,
    postJson(request)
  );
}

/** GET /places/{id}/children?type=... - the place hierarchy, `clubs` from
 * PlaceStats. */
export function getPlaceChildren(
  placeId: string,
  type?: 'city' | 'district' | 'region'
): Promise<PlaceChildren> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const path = `/places/${encodeURIComponent(placeId)}/children${query}`;
  return call('GET /places/:id/children', path, PlaceChildrenSchema);
}

/** GET /prominence/{clubId} - one club's cached prominence score. */
export function getProminence(clubId: string): Promise<Prominence> {
  const path = `/prominence/${encodeURIComponent(clubId)}`;
  return call('GET /prominence/:clubId', path, ProminenceSchema);
}

/** POST /prominence/recompute - batch recompute, returns how many rows moved. */
export function recomputeProminence(
  request: ProminenceRecompute
): Promise<ProminenceRecomputeResult> {
  return call(
    'POST /prominence/recompute',
    '/prominence/recompute',
    ProminenceRecomputeResultSchema,
    postJson(request)
  );
}

/** POST /pyramid/draw/{competitionId} - the ordered pool assignment for one
 * competition; Node persists entries/pools/fixtures. No request body. */
export function drawPyramid(competitionId: string): Promise<PyramidDraw> {
  const path = `/pyramid/draw/${encodeURIComponent(competitionId)}`;
  return call('POST /pyramid/draw/:competitionId', path, PyramidDrawSchema, {
    method: 'POST',
  });
}

/** POST /pyramid/join - the bottom-division slot for a mid-season joiner. */
export function joinPyramid(request: PyramidJoinRequest): Promise<PyramidJoin> {
  return call('POST /pyramid/join', '/pyramid/join', PyramidJoinSchema, postJson(request));
}

/** GET /tiles/{z}/{x}/{y} - one bounded map tile (zoom 0..5). */
export function getTile(z: number, x: number, y: number): Promise<Tile> {
  return call('GET /tiles/:z/:x/:y', `/tiles/${z}/${x}/${y}`, TileSchema);
}

/** GET /health - the service's typed health payload. */
export function worldServiceHealth(): Promise<WorldServiceHealth> {
  return call('GET /health', '/health', WorldServiceHealthSchema);
}

/** True when the world-service answers its /health endpoint successfully
 * (matches worldgen's `worldgenHealthy` precedent). */
export async function worldServiceHealthy(): Promise<boolean> {
  try {
    return (await worldServiceHealth()).status === 'ok';
  } catch {
    return false;
  }
}
