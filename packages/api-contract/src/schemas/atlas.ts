import { z } from 'zod';
import { CREST_EMBLEMS, CREST_PATTERNS, CREST_SHAPES } from '../crest';
import { TOWN_TERRAINS } from '../world-geo';

/** The world atlas: countries, their towns and the clubs in each town
 * (server: services/world/atlas.service.ts, rules: world-geo.ts). */

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
  name: z.string(),
  terrain: z.enum(TOWN_TERRAINS),
  x: z.number(),
  y: z.number(),
  founder: FounderSchema,
  foundedAt: z.string().nullable(),
  clubs: z.array(AtlasClubSchema),
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

export const AtlasSchema = z.object({
  width: z.number(),
  height: z.number(),
  countries: z.array(AtlasCountrySchema),
  towns: z.array(AtlasTownSchema),
  /** Clubs with no town yet (should be none once the world is backfilled). */
  unplaced: z.array(AtlasClubSchema),
  /** What the signed-in user has founded so far, and may still found. */
  me: z
    .object({
      userId: z.string(),
      founded: z.object({ countries: z.number(), towns: z.number(), clubs: z.number() }),
      limits: z.object({ countries: z.number(), towns: z.number(), clubs: z.number() }),
      clubIds: z.array(z.string()),
    })
    .nullable(),
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

export const FoundClubSchema = z.object({
  townId: z.string(),
  name: z.string(),
  code: z.string(),
  crest: CrestDesignSchema,
  stadiumName: z.string().optional(),
});

export const FoundedClubSchema = z.object({
  clubId: z.string(),
  code: z.string(),
  /** Local AI clubs that sprang up as the club's first rivals. */
  rivals: z.array(z.object({ id: z.string(), name: z.string() })),
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
export type FoundedClub = z.infer<typeof FoundedClubSchema>;
