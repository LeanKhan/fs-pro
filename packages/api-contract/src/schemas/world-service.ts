import { z } from 'zod';

/**
 * World-service HTTP contract (services/world-service, Go).
 *
 * These are Go-endpoint shapes, frozen in
 * docs/perfect/WORLD-SERVICE-CONTRACT.md and mirrored field-for-field in Go
 * (R6). Node does NOT serve them as ts-rest routes: the server only calls
 * them through apps/fs-pro-server/src/services/world/world-service.client.ts
 * (the client is server-to-server). Shapes use camelCase JSON exactly as the
 * contract writes them; ids are strings (the repo's existing convention for
 * `_id`/uuid fields - see schemas/atlas.ts), not validated as UUIDs.
 */

/** PlacementSpot.needsNames - the levels Node must create and name. */
const PlacementNeedsNameSchema = z.enum(['city', 'region', 'country']);

// ---------------------------------------------------------------------------
// 1. POST /placement/spot  (called by Node while holding PLACEMENT_LOCK)
// ---------------------------------------------------------------------------

/** PlacementSpot.kind - which level the spot lives at. */
export const PlacementSpotKindSchema = z.enum([
  'hole',
  'district',
  'city',
  'region',
  'country',
]);

/** Request body of POST /placement/spot. */
export const PlacementSpotRequestSchema = z.object({
  clubId: z.string(),
  inviteToken: z.string().nullable(),
});

/** The invite used, when the founding was invited (null otherwise). */
export const PlacementInviteSchema = z.object({
  placeId: z.string(),
  level: z.enum(['district', 'city']),
});

/** Response of POST /placement/spot. */
export const PlacementSpotSchema = z.object({
  kind: PlacementSpotKindSchema,
  districtId: z.string().nullable(),
  cityId: z.string().nullable(),
  regionId: z.string().nullable(),
  countryId: z.string().nullable(),
  needsNames: z.array(PlacementNeedsNameSchema),
  x: z.number(),
  y: z.number(),
  invite: PlacementInviteSchema.nullable(),
});

// ---------------------------------------------------------------------------
// 2. GET /places/{id}/children?type=city|district|region
// ---------------------------------------------------------------------------

/** One child place. `clubs` comes from PlaceStats. */
export const PlaceChildSchema = z.object({
  id: z.string(),
  type: z.enum(['city', 'district', 'region']),
  name: z.string(),
  code: z.string(),
  parentId: z.string(),
  regionId: z.string().nullable(),
  mapX: z.number(),
  mapY: z.number(),
  clubs: z.number(),
});

/** Response of GET /places/{id}/children. */
export const PlaceChildrenSchema = z.object({ children: z.array(PlaceChildSchema) });

// ---------------------------------------------------------------------------
// 3. Prominence
// ---------------------------------------------------------------------------

/** Response of GET /prominence/{clubId}. `updatedAt` is RFC3339 or null. */
export const ProminenceSchema = z.object({
  clubId: z.string(),
  prominence: z.number(),
  updatedAt: z.string().nullable(),
});

/** Request body of POST /prominence/recompute. */
export const ProminenceRecomputeSchema = z.object({ clubIds: z.array(z.string()) });

/** Response of POST /prominence/recompute - the literal `{ "updated": n }`. */
export const ProminenceRecomputeResultSchema = z.object({ updated: z.number() });

// ---------------------------------------------------------------------------
// 4. Pyramid
// ---------------------------------------------------------------------------

/** One assigned pool; division 1 is a single national pool. */
export const PyramidPoolSchema = z.object({
  division: z.number(),
  regionKey: z.string(),
  cityKey: z.string(),
  districtKey: z.string(),
  clubIds: z.array(z.string()),
});

/** Response of POST /pyramid/draw/{competitionId}. */
export const PyramidDrawSchema = z.object({ pools: z.array(PyramidPoolSchema) });

/** Request body of POST /pyramid/join. */
export const PyramidJoinRequestSchema = z.object({
  competitionId: z.string(),
  clubId: z.string(),
});

/** Response of POST /pyramid/join. `poolId` null + `newPool:true` means Node
 * must create the pool the service describes. */
export const PyramidJoinSchema = z.object({
  division: z.number(),
  poolId: z.string().nullable(),
  slot: z.number(),
  newPool: z.boolean(),
});

// ---------------------------------------------------------------------------
// 5. Health (GET /health, unchanged shape)
// ---------------------------------------------------------------------------

export const WorldServiceHealthSchema = z.object({
  status: z.string(),
  service: z.string(),
  version: z.string(),
  database: z.string(),
  uptimeSeconds: z.number(),
  time: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PlacementSpotKind = z.infer<typeof PlacementSpotKindSchema>;
export type PlacementSpotRequest = z.infer<typeof PlacementSpotRequestSchema>;
export type PlacementInvite = z.infer<typeof PlacementInviteSchema>;
export type PlacementSpot = z.infer<typeof PlacementSpotSchema>;
export type PlaceChild = z.infer<typeof PlaceChildSchema>;
export type PlaceChildren = z.infer<typeof PlaceChildrenSchema>;
export type Prominence = z.infer<typeof ProminenceSchema>;
export type ProminenceRecompute = z.infer<typeof ProminenceRecomputeSchema>;
export type ProminenceRecomputeResult = z.infer<typeof ProminenceRecomputeResultSchema>;
export type PyramidPool = z.infer<typeof PyramidPoolSchema>;
export type PyramidDraw = z.infer<typeof PyramidDrawSchema>;
export type PyramidJoinRequest = z.infer<typeof PyramidJoinRequestSchema>;
export type PyramidJoin = z.infer<typeof PyramidJoinSchema>;
export type WorldServiceHealth = z.infer<typeof WorldServiceHealthSchema>;
