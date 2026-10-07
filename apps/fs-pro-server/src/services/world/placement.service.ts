import { randomBytes, randomUUID } from 'crypto';
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { type AtlasPoint, type Placement, type PlacementSpot, type TownTerrain } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, placeInvites, placeStats, places } from '../../db/drizzle/schema';
import { getPlacementSpot } from './world-service.client';

/**
 * Where new clubs go (docs/perfect/WORLD-HIERARCHY-SPEC.md §3-§4). The place
 * tree is country > region > city > district and clubs belong to a district.
 * The binding decision is made by the Go world-service (`POST /placement/spot`,
 * services/world-service) and is a pure read; Node keeps the founding
 * transaction and the PLACEMENT_LOCK and creates the places the spot opens.
 *
 * Migration 0038 renamed the old `town` level to `city`, added `district`,
 * renamed `Clubs.TownId` to `Clubs.DistrictId`, and moved the capacities to
 * `DistrictClubs`/`CityDistricts`/`RegionCities`/`CountryRegions`.
 *
 * `nextSpot` is a thin caller of the Go client. `previewPlacement` maps the
 * same client call back onto the existing client-facing `Placement` shape
 * (packages/api-contract schemas/atlas.ts): the frozen world-service contract
 * has no names/flags, so Node resolves the existing place names here and maps
 * the contract's `hole`/`district`/`city`/`region`/`country` onto the UI's
 * `town`/`new-town`/`new-region`/`new-country`.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type PlaceRow = typeof places.$inferSelect;
type InviteRow = typeof placeInvites.$inferSelect;

/** pg_advisory_xact_lock key shared by everything that adds clubs to places. */
export const PLACEMENT_LOCK = 0x46535050; // "FSPP"

export async function lockPlacement(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${PLACEMENT_LOCK})`);
}

export interface WorldSizes {
  districtClubs: number;
  cityDistricts: number;
  regionCities: number;
  countryRegions: number;
  metropolisDistricts: number;
}

export async function worldSizes(tx: Tx | Db = db()): Promise<WorldSizes> {
  const [cal] = await tx
    .select({
      districtClubs: calendars.DistrictClubs,
      cityDistricts: calendars.CityDistricts,
      regionCities: calendars.RegionCities,
      countryRegions: calendars.CountryRegions,
      metropolisDistricts: calendars.MetropolisDistricts,
    })
    .from(calendars)
    .limit(1);
  return {
    districtClubs: cal?.districtClubs ?? 10,
    cityDistricts: cal?.cityDistricts ?? 2,
    regionCities: cal?.regionCities ?? 8,
    countryRegions: cal?.countryRegions ?? 6,
    metropolisDistricts: cal?.metropolisDistricts ?? 40,
  };
}

/** The Go contract's spot shape, re-exported for callers (club-founding). */
export type Spot = PlacementSpot;

export interface InviteCheck {
  valid: boolean;
  problem: string | null;
  invite: InviteRow | null;
  placeName: string | null;
  byClubName: string | null;
}

const pt = (p: PlaceRow): AtlasPoint => ({ x: p.MapX ?? 0, y: p.MapY ?? 0 });

async function placeById(id: string | null, tx: Tx | Db = db()): Promise<PlaceRow | null> {
  if (!id) return null;
  const [p] = await tx.select().from(places).where(eq(places.id, id)).limit(1);
  return p ?? null;
}

/**
 * The spot for the next club, from the Go world-service. Run inside the
 * founding transaction after lockPlacement() for a binding answer.
 */
export async function nextSpot(opts: { invite?: string | null } = {}): Promise<PlacementSpot> {
  return getPlacementSpot({ clubId: randomUUID(), inviteToken: opts.invite ?? null });
}

/**
 * The founding form's preview of nextSpot, in the client's `Placement` shape.
 * The Go service is a pure read, so calling it outside the lock is safe.
 */
export async function previewPlacement(invite?: string | null): Promise<Placement> {
  const spot = await getPlacementSpot({ clubId: randomUUID(), inviteToken: invite ?? null });
  const resolved = await resolvePlaces(spot);
  const colors = (p: PlaceRow | null) =>
    ((p?.Colors as [string, string] | null) ?? ['#8a5a3b', '#f2f2ee']) as [string, string];

  let inv: InviteCheck | null = null;
  if (invite) inv = await checkInvite(db(), invite);
  const inviteOut = inv
    ? { valid: inv.valid, problem: inv.problem, townName: inv.placeName, byClubName: inv.byClubName }
    : null;

  const countryOut = resolved.country
    ? { id: resolved.country.id, name: resolved.country.Name, code: resolved.country.Code, colors: colors(resolved.country) }
    : null;
  const regionOut = resolved.region ? { id: resolved.region.id, name: resolved.region.Name } : null;
  const terrain = (p: PlaceRow | null): TownTerrain => ((p?.Terrain ?? 'city') as TownTerrain);

  switch (spot.kind) {
    // An existing district: the club joins it as-is.
    case 'hole': {
      const d = resolved.district!;
      const city = resolved.city;
      return {
        kind: 'town',
        town: { id: d.id, name: d.Name, terrain: terrain(d), clubCount: await districtClubCount(d.id) },
        region: regionOut,
        country: countryOut,
        needs: { town: false, region: false, country: false },
        x: spot.x,
        y: spot.y,
        invite: inviteOut,
      };
    }
    // A new (auto-named) district in an existing city: no founder names.
    case 'district': {
      const city = resolved.city;
      return {
        kind: 'town',
        town: {
          id: '',
          name: city ? `${city.Name} Central` : 'New district',
          terrain: terrain(city),
          clubCount: 0,
        },
        region: regionOut,
        country: countryOut,
        needs: { town: false, region: false, country: false },
        x: spot.x,
        y: spot.y,
        invite: inviteOut,
      };
    }
    // A new city, named by the founder (the form's "Town" field).
    case 'city':
      return {
        kind: 'new-town',
        town: null,
        region: regionOut,
        country: countryOut,
        needs: { town: true, region: false, country: false },
        x: spot.x,
        y: spot.y,
        invite: inviteOut,
      };
    // A new region and its first city.
    case 'region':
      return {
        kind: 'new-region',
        town: null,
        region: null,
        country: countryOut,
        needs: { town: true, region: true, country: false },
        x: spot.x,
        y: spot.y,
        invite: inviteOut,
      };
    // A brand new country, region and city.
    case 'country':
    default:
      return {
        kind: 'new-country',
        town: null,
        region: null,
        country: null,
        needs: { town: true, region: true, country: true },
        x: spot.x,
        y: spot.y,
        invite: inviteOut,
      };
  }
}

/** Resolve the existing rows a contract spot refers to (district -> city ->
 * region -> country; any level the spot opens stays null). */
export async function resolvePlaces(spot: PlacementSpot): Promise<{
  district: PlaceRow | null;
  city: PlaceRow | null;
  region: PlaceRow | null;
  country: PlaceRow | null;
}> {
  const district = await placeById(spot.districtId);
  const cityId = spot.cityId ?? district?.ParentId ?? null;
  const city = await placeById(cityId);
  const regionId = spot.regionId ?? city?.RegionId ?? district?.RegionId ?? null;
  const region = await placeById(regionId);
  const countryId = spot.countryId ?? city?.ParentId ?? region?.ParentId ?? null;
  const country = await placeById(countryId);
  return { district, city, region, country };
}

async function districtClubCount(districtId: string) {
  const [row] = await db().select({ n: placeStats.Clubs }).from(placeStats).where(eq(placeStats.PlaceId, districtId)).limit(1);
  return row?.n ?? 0;
}

/** Is this invite usable right now? (The Go service re-checks it; Node needs
 * the row to count the use.) */
export async function checkInvite(tx: Tx | Db, token: string): Promise<InviteCheck> {
  const [row] = await tx
    .select({ invite: placeInvites, placeName: places.Name, byClubName: clubs.Name })
    .from(placeInvites)
    .innerJoin(places, eq(places.id, placeInvites.PlaceId))
    .innerJoin(clubs, eq(clubs.id, placeInvites.ByClubId))
    .where(eq(placeInvites.Token, token))
    .limit(1);
  if (!row) return { valid: false, problem: 'That invite link is not valid', invite: null, placeName: null, byClubName: null };
  const base = { invite: row.invite, placeName: row.placeName, byClubName: row.byClubName };
  if (row.invite.ExpiresAt.getTime() < Date.now()) return { ...base, valid: false, problem: 'That invite has expired' };
  if (row.invite.Uses >= row.invite.MaxUses) return { ...base, valid: false, problem: 'That invite has been used up' };
  return { ...base, valid: true, problem: null };
}

// --- Invites ---------------------------------------------------------------

const INVITE_DAYS = 14;
const INVITE_USES = 5;
const MAX_LIVE_INVITES = 5;

export class InviteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
  }
}

function toInvite(row: InviteRow, placeName: string) {
  return {
    // The client-facing TownInvite shape keeps its town* field names.
    token: row.Token,
    townId: row.PlaceId,
    townName: placeName,
    expiresAt: row.ExpiresAt.toISOString(),
    usesLeft: Math.max(0, row.MaxUses - row.Uses),
  };
}

async function ownedClubPlace(userId: string | undefined, clubId: string, isAdmin: boolean) {
  if (!userId) throw new InviteError('Not logged in', 403);
  const [club] = await db()
    .select({ id: clubs.id, userId: clubs.UserId, districtId: clubs.DistrictId, placeName: places.Name })
    .from(clubs)
    .leftJoin(places, eq(places.id, clubs.DistrictId))
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!club) throw new InviteError('Club not found', 404);
  if (club.userId !== userId && !isAdmin) throw new InviteError('Not your club', 403);
  if (!club.districtId || !club.placeName) throw new InviteError('That club has no district', 409);
  return { ...club, districtId: club.districtId, placeName: club.placeName };
}

const live = (clubId: string) =>
  and(eq(placeInvites.ByClubId, clubId), gt(placeInvites.ExpiresAt, new Date()), sql`${placeInvites.Uses} < ${placeInvites.MaxUses}`);

export async function listInvites(userId: string | undefined, clubId: string, isAdmin = false) {
  const club = await ownedClubPlace(userId, clubId, isAdmin);
  const rows = await db().select().from(placeInvites).where(live(clubId)).orderBy(desc(placeInvites.createdAt));
  return rows.map((r) => toInvite(r, club.placeName));
}

export async function createInvite(userId: string | undefined, clubId: string, isAdmin = false) {
  const club = await ownedClubPlace(userId, clubId, isAdmin);
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(placeInvites)
    .where(live(clubId));
  if (n >= MAX_LIVE_INVITES) throw new InviteError(`You can have ${MAX_LIVE_INVITES} live invites at most`, 409);
  const [row] = await db()
    .insert(placeInvites)
    .values({
      Token: randomBytes(12).toString('base64url'),
      // A club invites into its own district (WORLD-HIERARCHY-SPEC §3.6).
      PlaceId: club.districtId,
      Level: 'district',
      ByClubId: club.id,
      ExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000),
      MaxUses: INVITE_USES,
    })
    .returning();
  return toInvite(row!, club.placeName);
}

/** Count one use of an invite (inside the founding transaction). */
export async function useInvite(tx: Tx, inviteId: string) {
  await tx
    .update(placeInvites)
    .set({ Uses: sql`${placeInvites.Uses} + 1` })
    .where(eq(placeInvites.id, inviteId));
}

/** Look an invite row up by token (inside the founding transaction), so Node
 * can count the use the Go service reported as honoured. */
export async function inviteByToken(tx: Tx, token: string): Promise<InviteRow | null> {
  const [row] = await tx.select().from(placeInvites).where(eq(placeInvites.Token, token)).limit(1);
  return row ?? null;
}

// --- Regions for existing countries ------------------------------------------

/**
 * Give every country regions and every regionless city (and its districts) a
 * region: cities with no region are grouped by angle around their country,
 * `regionCities` per region, and each group becomes a region centred on its
 * cities. Idempotent: cities that already have a region are left alone. Used
 * by the migration script (scripts/migration/start-world-pyramid.ts). The
 * second return field keeps its legacy `towns` name for that script; it now
 * counts cities.
 */
export async function backfillRegions(): Promise<{ regions: number; towns: number }> {
  const sizes = await worldSizes();
  const rows = await db().select().from(places).where(isNotNull(places.MapX));
  const countries = rows.filter((p) => p.Type === 'country');
  const regions = rows.filter((p) => p.Type === 'region' && p.ParentId);
  const cities = rows.filter((p) => p.Type === 'city' && p.ParentId);
  let made = 0;
  let moved = 0;
  for (const country of countries) {
    const loose = cities.filter((c) => c.ParentId === country.id && !c.RegionId);
    if (!loose.length) continue;
    const c = pt(country);
    loose.sort((a, b) => Math.atan2(pt(a).y - c.y, pt(a).x - c.x) - Math.atan2(pt(b).y - c.y, pt(b).x - c.x));
    const groups: PlaceRow[][] = [];
    for (let i = 0; i < loose.length; i += sizes.regionCities) groups.push(loose.slice(i, i + sizes.regionCities));
    const existing = regions.filter((r) => r.ParentId === country.id).length;
    for (const [i, group] of groups.entries()) {
      const x = Math.round(group.reduce((s, t) => s + pt(t).x, 0) / group.length);
      const y = Math.round(group.reduce((s, t) => s + pt(t).y, 0) / group.length);
      const name = regionName(country.Name, existing + i);
      const [region] = await db()
        .insert(places)
        .values({
          Fullname: `${name}, ${country.Name}`,
          Name: name,
          Code: await uniquePlaceCode(`${country.Code}-R${existing + i + 1}`),
          Region: country.Region,
          Type: 'region',
          ParentId: country.id,
          MapX: x,
          MapY: y,
          updatedAt: new Date(),
        })
        .returning({ id: places.id });
      const cityIds = group.map((t) => t.id);
      await db().update(places).set({ RegionId: region!.id, updatedAt: new Date() }).where(inArray(places.id, cityIds));
      // Districts share their city's region (WORLD-HIERARCHY-SPEC §2.1).
      await db()
        .update(places)
        .set({ RegionId: region!.id, updatedAt: new Date() })
        .where(and(eq(places.Type, 'district'), inArray(places.ParentId, cityIds)));
      made++;
      moved += group.length;
    }
  }
  return { regions: made, towns: moved };
}

const COMPASS = ['Central', 'North', 'East', 'South', 'West', 'Highlands', 'Coast', 'Valley', 'Lowlands', 'Uplands'];
/** "Ardenia Central", "Ardenia North"... for regions/districts nobody named.
 * A new district is auto-named via this (DECISIONS Q3/Q8). */
export function regionName(countryName: string, i: number) {
  const word = COMPASS[i % COMPASS.length]!;
  return i < COMPASS.length ? `${countryName} ${word}` : `${countryName} ${word} ${Math.floor(i / COMPASS.length) + 1}`;
}

/** A Places.Code that isn't taken: `base`, then `base2`, `base3`... */
export async function uniquePlaceCode(base: string, tx: Tx | Db = db()) {
  const taken = new Set(
    (await tx.select({ code: places.Code }).from(places).where(sql`${places.Code} LIKE ${`${base}%`}`)).map((r) => r.code)
  );
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}${n}`;
  return code;
}

/** Cities of a region, oldest first. */
export async function citiesOfRegion(regionId: string) {
  return db().select().from(places).where(and(eq(places.Type, 'city'), eq(places.RegionId, regionId))).orderBy(asc(places.createdAt));
}

/**
 * Advance the frontier pointer (Calendars.FrontierCountryId/RegionId/CityId)
 * after a founding that opened places (B2-2A Q-D): the newest country, its
 * newest region and its capital city (its oldest city). O(1) point reads; the
 * Go service recomputes the pointer from counts when it is stale, so this is
 * an optimisation, not a correctness requirement.
 */
export async function advanceFrontier(tx: Tx | Db = db()) {
  await tx.execute(sql`
    WITH newest_country AS (
      SELECT "_id" AS id FROM "Places" WHERE "Type" = 'country'
      ORDER BY "createdAt" DESC, "_id" DESC LIMIT 1
    ),
    newest_region AS (
      SELECT r."_id" AS id FROM "Places" r, newest_country nc
      WHERE r."Type" = 'region' AND r."ParentId" = nc.id
      ORDER BY r."createdAt" DESC, r."_id" DESC LIMIT 1
    ),
    capital AS (
      SELECT ci."_id" AS id FROM "Places" ci, newest_country nc
      WHERE ci."Type" = 'city' AND ci."ParentId" = nc.id
      ORDER BY ci."createdAt" ASC, ci."_id" ASC LIMIT 1
    )
    UPDATE "Calendars" SET
      "FrontierCountryId" = (SELECT id FROM newest_country),
      "FrontierRegionId"  = (SELECT id FROM newest_region),
      "FrontierCityId"    = (SELECT id FROM capital)`);
}
