import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  ATLAS_W,
  FOUNDING_LIMITS,
  atlasSize,
  TOWN_TERRAINS,
  codeProblem,
  countrySpotProblem,
  isCrestDesign,
  nameProblem,
  tidyName,
  townSpotProblem,
  type Atlas,
  type AtlasClub,
  type AtlasCountry,
  type AtlasRegion,
  type AtlasTown,
  type CrestDesign,
  type FoundCountry,
  type FoundTown,
  type TownTerrain,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, places, users } from '../../db/drizzle/schema';

/**
 * The world atlas (packages/api-contract world-geo.ts): countries with a spot
 * on the map, their regions, towns, and clubs in towns. Clubs are founded
 * through placement (club-founding.service.ts, placement.service.ts), which
 * opens new towns, regions and countries as the world fills; founding a
 * country or town directly is admin-only. The atlas sends every place with
 * club counts, and club lists only for a small world or the country asked
 * for, so its size grows with places, not clubs.
 */

/** Up to this many clubs, the atlas carries every club list. */
const FULL_ATLAS_CLUBS = 600;

const db = () => DrizzleDatabase.getInstance().database;

/** A founding request the rules refuse (sent back as 400/409 with the reason). */
export class FoundingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400
  ) {
    super(message);
  }
}

type PlaceRow = typeof places.$inferSelect;

const terrainOf = (t: string | null): TownTerrain =>
  (TOWN_TERRAINS as readonly string[]).includes(t ?? '') ? (t as TownTerrain) : 'city';

function toCountry(p: PlaceRow, founders: Map<string, string>): AtlasCountry {
  return {
    id: p.id,
    name: p.Name,
    code: p.Code,
    region: p.Region,
    colors: (p.Colors as [string, string] | null) ?? ['#8a5a3b', '#f2f2ee'],
    motto: p.Motto,
    x: p.MapX ?? 0,
    y: p.MapY ?? 0,
    founder: p.FoundedBy ? { userId: p.FoundedBy, name: founders.get(p.FoundedBy) ?? 'A manager' } : null,
    foundedAt: p.FoundedBy ? p.createdAt.toISOString() : null,
  };
}

function toTown(p: PlaceRow, founders: Map<string, string>, clubList: AtlasClub[], clubCount = clubList.length): AtlasTown {
  return {
    id: p.id,
    countryId: p.ParentId!,
    regionId: p.RegionId ?? null,
    name: p.Name,
    terrain: terrainOf(p.Terrain),
    x: p.MapX ?? 0,
    y: p.MapY ?? 0,
    founder: p.FoundedBy ? { userId: p.FoundedBy, name: founders.get(p.FoundedBy) ?? 'A manager' } : null,
    foundedAt: p.FoundedBy ? p.createdAt.toISOString() : null,
    clubCount,
    clubs: clubList,
  };
}

function toRegion(p: PlaceRow, founders: Map<string, string>): AtlasRegion {
  return {
    id: p.id,
    countryId: p.ParentId!,
    name: p.Name,
    x: p.MapX ?? 0,
    y: p.MapY ?? 0,
    founder: p.FoundedBy ? { userId: p.FoundedBy, name: founders.get(p.FoundedBy) ?? 'A manager' } : null,
    foundedAt: p.FoundedBy ? p.createdAt.toISOString() : null,
  };
}

/** Countries (with a map spot), regions and towns, as rows. */
async function loadPlaces() {
  const rows = await db().select().from(places).where(isNotNull(places.MapX));
  return {
    countries: rows.filter((p) => p.Type === 'country'),
    regions: rows.filter((p) => p.Type === 'region' && p.ParentId),
    towns: rows.filter((p) => p.Type === 'town' && p.ParentId),
  };
}

async function foundedCounts(userId: string) {
  const [row] = await db()
    .select({
      countries: sql<number>`count(*) filter (where ${places.Type} = 'country')::int`,
      towns: sql<number>`count(*) filter (where ${places.Type} = 'town')::int`,
    })
    .from(places)
    .where(eq(places.FoundedBy, userId));
  const [owned] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(clubs)
    .where(eq(clubs.UserId, userId));
  return { countries: row?.countries ?? 0, towns: row?.towns ?? 0, clubs: owned?.n ?? 0 };
}

export async function getAtlas(userId?: string | null, opts: { countryId?: string } = {}): Promise<Atlas> {
  const { countries, regions, towns } = await loadPlaces();
  const counts = await db()
    .select({ townId: clubs.TownId, n: sql<number>`count(*)::int` })
    .from(clubs)
    .where(and(isNotNull(clubs.TownId), isNull(clubs.ReleasedAt)))
    .groupBy(clubs.TownId);
  const countOf = new Map(counts.map((c) => [c.townId!, c.n]));
  const total = counts.reduce((s, c) => s + c.n, 0);
  const all = total <= FULL_ATLAS_CLUBS;
  // A big world lists the clubs of the country asked for, else the user's own.
  let wanted = opts.countryId;
  if (!all && !wanted && userId) {
    const [own] = await db()
      .select({ country: clubs.AddressCountryId })
      .from(clubs)
      .where(and(eq(clubs.UserId, userId), isNull(clubs.ReleasedAt)))
      .limit(1);
    wanted = own?.country ?? undefined;
  }
  const countryId = !all && wanted && countries.some((c) => c.id === wanted) ? wanted : null;
  const listTownIds = all ? null : countryId ? towns.filter((t) => t.ParentId === countryId).map((t) => t.id) : [];

  const clubRows = listTownIds && !listTownIds.length ? [] : await db()
    .select({
      id: clubs.id,
      name: clubs.Name,
      code: clubs.ClubCode,
      crest: clubs.Crest,
      xp: clubs.XP,
      elo: clubs.Elo,
      rating: clubs.Rating,
      fans: clubs.Fans,
      userId: clubs.UserId,
      townId: clubs.TownId,
      ownerName: users.FullName,
    })
    .from(clubs)
    .leftJoin(users, eq(users.id, clubs.UserId))
    .where(and(isNull(clubs.ReleasedAt), listTownIds ? inArray(clubs.TownId, listTownIds) : undefined));

  const founderIds = [...new Set([...countries, ...regions, ...towns].map((p) => p.FoundedBy).filter((x): x is string => !!x))];
  const founders = new Map(
    founderIds.length
      ? (await db().select({ id: users.id, name: users.FullName }).from(users).where(inArray(users.id, founderIds))).map(
          (u) => [u.id, u.name] as [string, string]
        )
      : []
  );

  const byTown = new Map<string, AtlasClub[]>();
  const unplaced: AtlasClub[] = [];
  const townIds = new Set(towns.map((t) => t.id));
  for (const c of clubRows) {
    const club: AtlasClub = {
      id: c.id,
      name: c.name,
      code: c.code,
      crest: isCrestDesign(c.crest) ? c.crest : null,
      xp: c.xp,
      elo: Math.round(c.elo),
      rating: Math.round(c.rating * 10) / 10,
      fans: c.fans,
      human: !!c.userId,
      ownerName: c.userId ? (c.ownerName ?? null) : null,
      founded: isCrestDesign(c.crest),
    };
    if (c.townId && townIds.has(c.townId)) byTown.set(c.townId, [...(byTown.get(c.townId) ?? []), club]);
    else unplaced.push(club);
  }

  let me: Atlas['me'] = null;
  if (userId) {
    const mine = await db()
      .select({ id: clubs.id })
      .from(clubs)
      .where(and(eq(clubs.UserId, userId), isNull(clubs.ReleasedAt)));
    me = {
      userId,
      founded: await foundedCounts(userId),
      limits: { ...FOUNDING_LIMITS },
      clubIds: mine.map((c) => c.id),
    };
  }

  const size = atlasSize([...countries, ...regions, ...towns].map((p) => ({ x: p.MapX ?? 0, y: p.MapY ?? 0 })));
  return {
    width: size.width,
    height: Math.max(size.height, Math.round(size.width * 0.5625)),
    countries: countries.map((p) => toCountry(p, founders)),
    regions: regions.map((p) => toRegion(p, founders)),
    towns: towns.map((p) => toTown(p, founders, byTown.get(p.id) ?? [], countOf.get(p.id) ?? 0)),
    clubsLoaded: all ? 'all' : countryId ? { countryId } : null,
    unplaced: all ? unplaced : [],
    me,
  };
}

// --- Names ------------------------------------------------------------------

async function countryNameTaken(name: string, code?: string) {
  const rows = await db()
    .select({ id: places.id })
    .from(places)
    .where(
      code
        ? sql`(${places.Type} = 'country' AND lower(${places.Name}) = lower(${name})) OR ${places.Code} = ${code}`
        : sql`${places.Type} = 'country' AND lower(${places.Name}) = lower(${name})`
    )
    .limit(1);
  return rows.length > 0;
}

async function townNameTaken(countryId: string, name: string) {
  const rows = await db()
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.ParentId, countryId), sql`lower(${places.Name}) = lower(${name})`))
    .limit(1);
  return rows.length > 0;
}

export async function clubNameTaken(name: string, code?: string) {
  const rows = await db()
    .select({ id: clubs.id })
    .from(clubs)
    .where(
      code
        ? sql`lower(${clubs.Name}) = lower(${name}) OR upper(${clubs.ClubCode}) = upper(${code})`
        : sql`lower(${clubs.Name}) = lower(${name})`
    )
    .limit(1);
  return rows.length > 0;
}

/** For the founding forms' live checks. Towns and regions share one name
 * space per country. */
export async function checkName(q: {
  kind: 'country' | 'region' | 'town' | 'club';
  name: string;
  code?: string;
  countryId?: string;
}): Promise<{ ok: boolean; problem: string | null }> {
  const what = q.kind === 'club' ? 'Club name' : q.kind === 'town' ? 'Town name' : q.kind === 'region' ? 'Region name' : 'Country name';
  const problem =
    nameProblem(q.name, what) ??
    (q.code !== undefined ? codeProblem(q.code, 'Short code') : null) ??
    (q.kind === 'country' && (await countryNameTaken(tidyName(q.name), q.code)) ? 'That name or code is taken' : null) ??
    ((q.kind === 'town' || q.kind === 'region') && q.countryId && (await townNameTaken(q.countryId, tidyName(q.name)))
      ? 'There is already a place with that name there'
      : null) ??
    (q.kind === 'club' && (await clubNameTaken(tidyName(q.name), q.code)) ? 'That name or code is taken' : null);
  return { ok: !problem, problem };
}

// --- Founding ---------------------------------------------------------------

async function requireUser(userId: string | undefined) {
  if (!userId) throw new FoundingError('Not logged in', 403);
  const [user] = await db().select().from(users).where(eq(users.id, userId));
  if (!user) throw new FoundingError('Not logged in', 403);
  return user;
}

export async function foundCountry(userId: string | undefined, body: FoundCountry): Promise<AtlasCountry> {
  const user = await requireUser(userId);
  const counts = await foundedCounts(user.id);
  if (!user.isAdmin && counts.countries >= FOUNDING_LIMITS.countries) {
    throw new FoundingError(`You can found ${FOUNDING_LIMITS.countries} country`, 403);
  }
  const name = tidyName(body.name);
  const code = body.code.trim().toUpperCase();
  const problem = nameProblem(name, 'Country name') ?? codeProblem(code, 'Country code');
  if (problem) throw new FoundingError(problem);
  if (await countryNameTaken(name, code)) throw new FoundingError('That name or code is taken', 409);

  const { countries } = await loadPlaces();
  const spot = { x: Math.round(body.x), y: Math.round(body.y) };
  const where = countrySpotProblem(
    spot,
    countries.map((c) => ({ x: c.MapX!, y: c.MapY! }))
  );
  if (where) throw new FoundingError(where, 409);

  const [row] = await db()
    .insert(places)
    .values({
      Fullname: `Republic of ${name}`,
      Name: name,
      Code: code,
      Region: spot.x < ATLAS_W / 2 ? 'world-west' : 'world-east',
      Type: 'country',
      FoundedBy: user.id,
      MapX: spot.x,
      MapY: spot.y,
      Colors: body.colors,
      Motto: body.motto?.trim() || null,
      updatedAt: new Date(),
    })
    .returning();
  return toCountry(row!, new Map([[user.id, user.FullName]]));
}

export async function foundTown(
  userId: string | undefined,
  body: FoundTown,
  opts: { skipLimit?: boolean } = {}
): Promise<AtlasTown> {
  const user = await requireUser(userId);
  const counts = await foundedCounts(user.id);
  if (!user.isAdmin && !opts.skipLimit && counts.towns >= FOUNDING_LIMITS.towns) {
    throw new FoundingError(`You can found ${FOUNDING_LIMITS.towns} towns`, 403);
  }
  const { countries, towns } = await loadPlaces();
  const country = countries.find((c) => c.id === body.countryId);
  if (!country) throw new FoundingError('Country not found', 404);

  const name = tidyName(body.name);
  const problem = nameProblem(name, 'Town name');
  if (problem) throw new FoundingError(problem);
  if (await townNameTaken(country.id, name)) throw new FoundingError('There is already a town with that name there', 409);

  const spot = { x: Math.round(body.x), y: Math.round(body.y) };
  const where = townSpotProblem(
    spot,
    { x: country.MapX!, y: country.MapY! },
    towns.map((t) => ({ x: t.MapX!, y: t.MapY! })),
    countries.filter((c) => c.id !== country.id).map((c) => ({ x: c.MapX!, y: c.MapY! }))
  );
  if (where) throw new FoundingError(where, 409);

  const base = `${country.Code}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10)}`;
  const codes = new Set(
    (await db().select({ code: places.Code }).from(places).where(sql`${places.Code} LIKE ${`${base}%`}`)).map((r) => r.code)
  );
  let code = base;
  for (let n = 2; codes.has(code); n++) code = `${base}${n}`;

  // Admin towns join the country's nearest region.
  const nearest = (await loadPlaces()).regions
    .filter((r) => r.ParentId === country.id)
    .sort((a, b) => Math.hypot(a.MapX! - spot.x, a.MapY! - spot.y) - Math.hypot(b.MapX! - spot.x, b.MapY! - spot.y))[0];
  const [row] = await db()
    .insert(places)
    .values({
      Fullname: `${name}, ${country.Name}`,
      Name: name,
      Code: code,
      Region: country.Region,
      Type: 'town',
      ParentId: country.id,
      RegionId: nearest?.id ?? null,
      FoundedBy: user.id,
      MapX: spot.x,
      MapY: spot.y,
      Terrain: body.terrain,
      updatedAt: new Date(),
    })
    .returning();
  return toTown(row!, new Map([[user.id, user.FullName]]), []);
}

/** A town row with its country, or a 404. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTown(townId: string) {
  if (!UUID.test(townId)) throw new FoundingError('Town not found', 404);
  const [town] = await db()
    .select()
    .from(places)
    .where(and(eq(places.id, townId), eq(places.Type, 'town')));
  if (!town?.ParentId) throw new FoundingError('Town not found', 404);
  const [country] = await db().select().from(places).where(eq(places.id, town.ParentId));
  if (!country) throw new FoundingError('Town not found', 404);
  return { town, country };
}

export type { CrestDesign };
