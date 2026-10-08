import { z } from 'zod';
import { CREST_EMBLEMS, CREST_PATTERNS, CREST_SHAPES } from '../crest';
import { TOWN_TERRAINS } from '../world-geo';

/** The world atlas: countries, their regions, towns and the clubs in each
 * town (server: services/world/atlas.service.ts, rules: world-geo.ts,
 * placement: docs/WORLD-PYRAMID-SPEC.md). */

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Colours are #rrggbb');

export const CrestDesignSchema = z.object({
  shape: z.enum(CREST_SHAPES),
  pattern: z.enum(CREST_PATTERNS),
  emblem: z.enum(CREST_EMBLEMS),
  primary: hex,
  secondary: hex,
  trim: hex,
  initials: z.string().regex(/^[A-Z0-9]{0,4}$/),
});

const FounderSchema = z.object({ userId: z.string(), name: z.string() }).nullable();

export const AtlasClubSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  crest: CrestDesignSchema.nullable(),
  xp: z.number(),
  elo: z.number(),
  rating: z.number(),
  fans: z.number(),
  /** Run by a person rather than the AI. */
  human: z.boolean(),
  ownerName: z.string().nullable(),
  /** Founded in the game (rather than one of the original clubs). */
  founded: z.boolean(),
});

export const AtlasTownSchema = z.object({
  id: z.string(),
  countryId: z.string(),
  regionId: z.string().nullable(),
  name: z.string(),
  terrain: z.enum(TOWN_TERRAINS),
  x: z.number(),
  y: z.number(),
  founder: FounderSchema,
  foundedAt: z.string().nullable(),
  /** Clubs in the town. */
  clubCount: z.number(),
  /** The clubs themselves, when this payload carries them (a small world,
   * or the country asked for); otherwise empty with clubCount set. */
  clubs: z.array(AtlasClubSchema),
});

export const AtlasRegionSchema = z.object({
  id: z.string(),
  countryId: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  founder: FounderSchema,
  foundedAt: z.string().nullable(),
});

export const AtlasCountrySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  region: z.string().nullable(),
  colors: z.tuple([hex, hex]),
  motto: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  founder: FounderSchema,
  foundedAt: z.string().nullable(),
});

/** What the signed-in user has founded so far, and may still found. */
export const AtlasMeSchema = z.object({
  userId: z.string(),
  founded: z.object({ countries: z.number(), towns: z.number(), clubs: z.number() }),
  limits: z.object({ countries: z.number(), towns: z.number(), clubs: z.number() }),
  clubIds: z.array(z.string()),
  /** The user's first active club's home, for the map's "my club" jump. */
  home: z
    .object({
      clubId: z.string(),
      countryId: z.string(),
      cityId: z.string(),
      districtId: z.string(),
      x: z.number(),
      y: z.number(),
    })
    .nullable(),
});

export const AtlasSchema = z.object({
  width: z.number(),
  height: z.number(),
  countries: z.array(AtlasCountrySchema),
  regions: z.array(AtlasRegionSchema),
  towns: z.array(AtlasTownSchema),
  /** Whose towns carry club lists: 'all', one country, or none. */
  clubsLoaded: z.union([z.literal('all'), z.object({ countryId: z.string() }), z.null()]),
  /** Clubs with no town yet (should be none once the world is backfilled). */
  unplaced: z.array(AtlasClubSchema),
  /** What the signed-in user has founded so far, and may still found. */
  me: AtlasMeSchema.nullable(),
});

/**
 * The map "chrome" that is not per-viewport: the country headers (their map
 * spot and founder-chosen flag colours, which a tile does not carry) plus the
 * signed-in user's founding summary. Small (one row per country) and stable, so
 * it is fetched once and sits alongside the bounded tiles
 * (docs/perfect/WORLD-HIERARCHY-SPEC.md §7.6: `me` comes from a small endpoint,
 * not the whole atlas).
 */
export const AtlasChromeSchema = z.object({
  countries: z.array(AtlasCountrySchema),
  me: AtlasMeSchema.nullable(),
});

/** One hit from the map search box: a place or a club, and where to zoom. */
export const AtlasSearchResultSchema = z.object({
  kind: z.enum(['country', 'region', 'city', 'district', 'club']),
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  /** The country to frame alongside, when known. */
  countryId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
});

export const FoundCountrySchema = z.object({
  name: z.string(),
  code: z.string(),
  colors: z.tuple([hex, hex]),
  motto: z.string().max(80).optional(),
  x: z.number(),
  y: z.number(),
});

export const FoundTownSchema = z.object({
  countryId: z.string(),
  name: z.string(),
  terrain: z.enum(TOWN_TERRAINS),
  x: z.number(),
  y: z.number(),
});

/** Where placement would put a new club now (docs/WORLD-PYRAMID-SPEC.md,
 * "Fill order"), and which new places the founder must name. A hint: the
 * founding itself places again. */
export const PlacementSchema = z.object({
  kind: z.enum(['town', 'new-town', 'new-region', 'new-country']),
  town: z.object({ id: z.string(), name: z.string(), terrain: z.enum(TOWN_TERRAINS), clubCount: z.number() }).nullable(),
  region: z.object({ id: z.string(), name: z.string() }).nullable(),
  country: z.object({ id: z.string(), name: z.string(), code: z.string(), colors: z.tuple([hex, hex]) }).nullable(),
  /** New places this founding opens, which need names. */
  needs: z.object({ town: z.boolean(), region: z.boolean(), country: z.boolean() }),
  /** Map spot of the town (or of the new town). */
  x: z.number(),
  y: z.number(),
  /** The invite used, if one was given. */
  invite: z
    .object({
      valid: z.boolean(),
      problem: z.string().nullable(),
      townName: z.string().nullable(),
      byClubName: z.string().nullable(),
    })
    .nullable(),
});

export const NewTownSchema = z.object({ name: z.string(), terrain: z.enum(TOWN_TERRAINS) });
export const NewRegionSchema = z.object({ name: z.string() });
export const NewCountrySchema = z.object({
  name: z.string(),
  code: z.string(),
  colors: z.tuple([hex, hex]),
  motto: z.string().max(80).optional(),
});

export const FoundClubSchema = z.object({
  /** Invite token from a /start?invite= link. */
  invite: z.string().optional(),
  /** Names for the places this founding opens (see PlacementSchema.needs). */
  newTown: NewTownSchema.optional(),
  newRegion: NewRegionSchema.optional(),
  newCountry: NewCountrySchema.optional(),
  name: z.string(),
  code: z.string(),
  crest: CrestDesignSchema,
  stadiumName: z.string().optional(),
});

export const FoundedClubSchema = z.object({
  clubId: z.string(),
  code: z.string(),
  town: z.object({ id: z.string(), name: z.string() }),
  region: z.object({ id: z.string(), name: z.string() }).nullable(),
  country: z.object({ id: z.string(), name: z.string() }),
  /** New places this founding opened. */
  opened: z.array(z.enum(['town', 'region', 'country'])),
  /** The pyramid pool the club joined, if its country's league is running. */
  pool: z.object({ id: z.string(), name: z.string(), division: z.number() }).nullable(),
});

export const TownInviteSchema = z.object({
  token: z.string(),
  townId: z.string(),
  townName: z.string(),
  expiresAt: z.string(),
  usesLeft: z.number(),
});

export const NameCheckSchema = z.object({ ok: z.boolean(), problem: z.string().nullable() });

export type CrestDesignPayload = z.infer<typeof CrestDesignSchema>;
export type AtlasClub = z.infer<typeof AtlasClubSchema>;
export type AtlasTown = z.infer<typeof AtlasTownSchema>;
export type AtlasCountry = z.infer<typeof AtlasCountrySchema>;
export type Atlas = z.infer<typeof AtlasSchema>;
export type FoundCountry = z.infer<typeof FoundCountrySchema>;
export type FoundTown = z.infer<typeof FoundTownSchema>;
export type FoundClub = z.infer<typeof FoundClubSchema>;
export type AtlasRegion = z.infer<typeof AtlasRegionSchema>;
export type AtlasMe = z.infer<typeof AtlasMeSchema>;
export type AtlasChrome = z.infer<typeof AtlasChromeSchema>;
export type AtlasSearchResult = z.infer<typeof AtlasSearchResultSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type NewTown = z.infer<typeof NewTownSchema>;
export type NewRegion = z.infer<typeof NewRegionSchema>;
export type NewCountry = z.infer<typeof NewCountrySchema>;
export type TownInvite = z.infer<typeof TownInviteSchema>;
export type FoundedClub = z.infer<typeof FoundedClubSchema>;
