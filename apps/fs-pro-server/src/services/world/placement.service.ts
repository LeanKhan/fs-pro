import { randomBytes } from 'crypto';
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  REGION_RADIUS,
  suggestCountrySpot,
  suggestRegionSpot,
  suggestTownSpot,
  type AtlasPoint,
  type Placement,
  type TownTerrain,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, places, townInvites } from '../../db/drizzle/schema';

/**
 * Where new clubs go (docs/WORLD-PYRAMID-SPEC.md, "Geography and
 * placement"). The world fills in order: holes in existing towns first, then
 * a new town in the filling region, a new region in the filling country,
 * and only then a new country. The filling country is the newest one that
 * still has room, so the world grows from one place and early players share
 * towns. An invite link puts a friend in the inviter's town instead.
 *
 * nextSpot only decides; club-founding.service.ts creates the places and
 * the club in the same transaction, under PLACEMENT_LOCK, so two foundings
 * can never overfill a town.
 */

const db = () => DrizzleDatabase.getInstance().database;
type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type PlaceRow = typeof places.$inferSelect;

/** pg_advisory_xact_lock key shared by everything that adds clubs to towns. */
export const PLACEMENT_LOCK = 0x46535050; // "FSPP"

export async function lockPlacement(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${PLACEMENT_LOCK})`);
}

export interface WorldSizes {
  townSize: number;
  regionTowns: number;
  countryRegions: number;
}

export async function worldSizes(tx: Tx | Db = db()): Promise<WorldSizes> {
  const [cal] = await tx
    .select({ t: calendars.TownSize, r: calendars.RegionTowns, c: calendars.CountryRegions })
    .from(calendars)
    .limit(1);
  return { townSize: cal?.t ?? 6, regionTowns: cal?.r ?? 8, countryRegions: cal?.c ?? 6 };
}

export type Spot =
  | { kind: 'town'; town: PlaceRow; region: PlaceRow | null; country: PlaceRow }
  | { kind: 'new-town'; region: PlaceRow; country: PlaceRow; town: AtlasPoint }
  | { kind: 'new-region'; country: PlaceRow; region: AtlasPoint; town: AtlasPoint }
  | { kind: 'new-country'; country: AtlasPoint; region: AtlasPoint; town: AtlasPoint };

export interface InviteCheck {
  valid: boolean;
  problem: string | null;
  invite: typeof townInvites.$inferSelect | null;
  townName: string | null;
  byClubName: string | null;
}

const pt = (p: PlaceRow): AtlasPoint => ({ x: p.MapX ?? 0, y: p.MapY ?? 0 });

/** Every placed country, region and town, plus club counts per town. */
async function loadWorld(tx: Tx | Db) {
  const rows = await tx.select().from(places).where(isNotNull(places.MapX));
  const counts = await tx
    .select({ townId: clubs.TownId, n: sql<number>`count(*)::int` })
    .from(clubs)
    .where(isNotNull(clubs.TownId))
    .groupBy(clubs.TownId);
  const clubsIn = new Map(counts.map((c) => [c.townId!, c.n]));
  const byAge = (a: PlaceRow, b: PlaceRow) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  return {
    countries: rows.filter((p) => p.Type === 'country').sort(byAge),
    regions: rows.filter((p) => p.Type === 'region' && p.ParentId).sort(byAge),
    towns: rows.filter((p) => p.Type === 'town' && p.ParentId).sort(byAge),
    clubsIn: (townId: string) => clubsIn.get(townId) ?? 0,
  };
}
type World = Awaited<ReturnType<typeof loadWorld>>;

/** A free spot for a new town in `region`, or null when it has no room. */
function townSpotIn(w: World, region: PlaceRow, country: PlaceRow): AtlasPoint | null {
  const others = w.countries.filter((c) => c.id !== country.id).map(pt);
  return suggestTownSpot(pt(country), w.towns.map(pt), others, w.towns.length, pt(region), REGION_RADIUS);
}

/** A new town, else a new region, in `country`; null when it is full. */
function growCountry(w: World, country: PlaceRow, sizes: WorldSizes): Spot | null {
  const regions = w.regions.filter((r) => r.ParentId === country.id);
  const townCount = (r: PlaceRow) => w.towns.filter((t) => t.RegionId === r.id).length;
  const open = regions
    .filter((r) => townCount(r) < sizes.regionTowns)
    .sort((a, b) => townCount(a) - townCount(b));
  for (const region of open) {
    const town = townSpotIn(w, region, country);
    if (town) return { kind: 'new-town', region, country, town };
  }
  if (regions.length >= sizes.countryRegions) return null;
  const others = w.countries.filter((c) => c.id !== country.id).map(pt);
  const regionSpot = suggestRegionSpot(pt(country), regions.map(pt), others, regions.length * 0.37);
  if (!regionSpot) return null;
  const town = suggestTownSpot(pt(country), w.towns.map(pt), others, w.towns.length, regionSpot, REGION_RADIUS);
  return town ? { kind: 'new-region', country, region: regionSpot, town } : null;
}

function newCountry(w: World): Spot {
  const spot = suggestCountrySpot(w.countries.map(pt));
  const others = w.countries.map(pt);
  const region = suggestRegionSpot(spot, [], others) ?? { x: spot.x + 60, y: spot.y };
  const town = suggestTownSpot(spot, w.towns.map(pt), others, 0, region, REGION_RADIUS) ?? region;
  return { kind: 'new-country', country: spot, region, town };
}

/** Is this invite usable right now? */
export async function checkInvite(tx: Tx | Db, token: string): Promise<InviteCheck> {
  const [row] = await tx
    .select({ invite: townInvites, townName: places.Name, byClubName: clubs.Name })
    .from(townInvites)
    .innerJoin(places, eq(places.id, townInvites.TownId))
    .innerJoin(clubs, eq(clubs.id, townInvites.ByClubId))
    .where(eq(townInvites.Token, token))
    .limit(1);
  if (!row) return { valid: false, problem: 'That invite link is not valid', invite: null, townName: null, byClubName: null };
  const base = { invite: row.invite, townName: row.townName, byClubName: row.byClubName };
  if (row.invite.ExpiresAt.getTime() < Date.now()) return { ...base, valid: false, problem: 'That invite has expired' };
  if (row.invite.Uses >= row.invite.MaxUses) return { ...base, valid: false, problem: 'That invite has been used up' };
  return { ...base, valid: true, problem: null };
}

/** Where the invite's town can take one more club: the town, another town of
 * its region, or a new town in that region (one over RegionTowns at most). */
function inviteSpot(w: World, townId: string, sizes: WorldSizes): Spot | null {
  const town = w.towns.find((t) => t.id === townId);
  if (!town) return null;
  const country = w.countries.find((c) => c.id === town.ParentId);
  if (!country) return null;
  const region = town.RegionId ? (w.regions.find((r) => r.id === town.RegionId) ?? null) : null;
  if (w.clubsIn(town.id) < sizes.townSize) return { kind: 'town', town, region, country };
  if (!region) return null;
  const sameRegion = w.towns.filter((t) => t.RegionId === region.id && w.clubsIn(t.id) < sizes.townSize);
  if (sameRegion[0]) return { kind: 'town', town: sameRegion[0], region, country };
  const towns = w.towns.filter((t) => t.RegionId === region.id).length;
  if (towns > sizes.regionTowns) return null;
  const spot = townSpotIn(w, region, country);
  return spot ? { kind: 'new-town', region, country, town: spot } : null;
}

/**
 * The spot for the next club. Run inside the founding transaction after
 * lockPlacement() for a binding answer; outside it, it's a preview.
 */
export async function nextSpot(
  tx: Tx | Db,
  opts: { invite?: string | null } = {}
): Promise<{ spot: Spot; invite: InviteCheck | null }> {
  const [w, sizes] = await Promise.all([loadWorld(tx), worldSizes(tx)]);

  let invite: InviteCheck | null = null;
  if (opts.invite) {
    invite = await checkInvite(tx, opts.invite);
    if (invite.valid && invite.invite) {
      const spot = inviteSpot(w, invite.invite.TownId, sizes);
      if (spot) return { spot, invite };
      invite = { ...invite, problem: `${invite.townName} and its region are full, so you'll start nearby` };
    }
  }

  // 1. Holes: the oldest town with room.
  const hole = w.towns.find((t) => w.clubsIn(t.id) < sizes.townSize);
  if (hole) {
    const country = w.countries.find((c) => c.id === hole.ParentId);
    if (country) {
      const region = hole.RegionId ? (w.regions.find((r) => r.id === hole.RegionId) ?? null) : null;
      return { spot: { kind: 'town', town: hole, region, country }, invite };
    }
  }

  // 2-3. Grow the newest country that still has room.
  for (const country of [...w.countries].reverse()) {
    const spot = growCountry(w, country, sizes);
    if (spot) return { spot, invite };
  }

  // 4. A new country.
  return { spot: newCountry(w), invite };
}

/** The founding form's preview of nextSpot. */
export async function previewPlacement(invite?: string | null): Promise<Placement> {
  const { spot, invite: inv } = await nextSpot(db(), { invite });
  const colors = (p: PlaceRow) => ((p.Colors as [string, string] | null) ?? ['#8a5a3b', '#f2f2ee']) as [string, string];
  const inviteOut = inv
    ? { valid: inv.valid, problem: inv.problem, townName: inv.townName, byClubName: inv.byClubName }
    : null;
  switch (spot.kind) {
    case 'town':
      return {
        kind: 'town',
        town: {
          id: spot.town.id,
          name: spot.town.Name,
          terrain: (spot.town.Terrain ?? 'city') as TownTerrain,
          clubCount: (await clubCount(spot.town.id)) ?? 0,
        },
        region: spot.region ? { id: spot.region.id, name: spot.region.Name } : null,
        country: { id: spot.country.id, name: spot.country.Name, code: spot.country.Code, colors: colors(spot.country) },
        needs: { town: false, region: false, country: false },
        x: spot.town.MapX ?? 0,
        y: spot.town.MapY ?? 0,
        invite: inviteOut,
      };
    case 'new-town':
      return {
        kind: 'new-town',
        town: null,
        region: { id: spot.region.id, name: spot.region.Name },
        country: { id: spot.country.id, name: spot.country.Name, code: spot.country.Code, colors: colors(spot.country) },
        needs: { town: true, region: false, country: false },
        x: spot.town.x,
        y: spot.town.y,
        invite: inviteOut,
      };
    case 'new-region':
      return {
        kind: 'new-region',
        town: null,
        region: null,
        country: { id: spot.country.id, name: spot.country.Name, code: spot.country.Code, colors: colors(spot.country) },
        needs: { town: true, region: true, country: false },
        x: spot.town.x,
        y: spot.town.y,
        invite: inviteOut,
      };
    case 'new-country':
      return {
        kind: 'new-country',
        town: null,
        region: null,
        country: null,
        needs: { town: true, region: true, country: true },
        x: spot.town.x,
        y: spot.town.y,
        invite: inviteOut,
      };
  }
}

async function clubCount(townId: string) {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(clubs)
    .where(eq(clubs.TownId, townId));
  return row?.n;
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

function toInvite(row: typeof townInvites.$inferSelect, townName: string) {
  return {
    token: row.Token,
    townId: row.TownId,
    townName,
    expiresAt: row.ExpiresAt.toISOString(),
    usesLeft: Math.max(0, row.MaxUses - row.Uses),
  };
}

async function ownedClubTown(userId: string | undefined, clubId: string, isAdmin: boolean) {
  if (!userId) throw new InviteError('Not logged in', 403);
  const [club] = await db()
    .select({ id: clubs.id, userId: clubs.UserId, townId: clubs.TownId, townName: places.Name })
    .from(clubs)
    .leftJoin(places, eq(places.id, clubs.TownId))
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!club) throw new InviteError('Club not found', 404);
  if (club.userId !== userId && !isAdmin) throw new InviteError('Not your club', 403);
  if (!club.townId || !club.townName) throw new InviteError('That club has no town', 409);
  return { ...club, townId: club.townId, townName: club.townName };
}

const live = (clubId: string) =>
  and(eq(townInvites.ByClubId, clubId), gt(townInvites.ExpiresAt, new Date()), sql`${townInvites.Uses} < ${townInvites.MaxUses}`);

export async function listInvites(userId: string | undefined, clubId: string, isAdmin = false) {
  const club = await ownedClubTown(userId, clubId, isAdmin);
  const rows = await db().select().from(townInvites).where(live(clubId)).orderBy(desc(townInvites.createdAt));
  return rows.map((r) => toInvite(r, club.townName));
}

export async function createInvite(userId: string | undefined, clubId: string, isAdmin = false) {
  const club = await ownedClubTown(userId, clubId, isAdmin);
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(townInvites)
    .where(live(clubId));
  if (n >= MAX_LIVE_INVITES) throw new InviteError(`You can have ${MAX_LIVE_INVITES} live invites at most`, 409);
  const [row] = await db()
    .insert(townInvites)
    .values({
      Token: randomBytes(12).toString('base64url'),
      TownId: club.townId,
      ByClubId: club.id,
      ExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000),
      MaxUses: INVITE_USES,
    })
    .returning();
  return toInvite(row!, club.townName);
}

/** Count one use of an invite (inside the founding transaction). */
export async function useInvite(tx: Tx, inviteId: string) {
  await tx
    .update(townInvites)
    .set({ Uses: sql`${townInvites.Uses} + 1` })
    .where(eq(townInvites.id, inviteId));
}

// --- Regions for existing countries ------------------------------------------

/**
 * Give every placed country regions and every town a region: towns with no
 * region are grouped by angle around their country, `regionTowns` per
 * region, and each group becomes a region centred on its towns. Idempotent:
 * towns that already have a region are left alone. Used by the migration
 * script (scripts/migration/start-world-pyramid.ts).
 */
export async function backfillRegions(): Promise<{ regions: number; towns: number }> {
  const sizes = await worldSizes();
  const w = await loadWorld(db());
  let made = 0;
  let moved = 0;
  for (const country of w.countries) {
    const loose = w.towns.filter((t) => t.ParentId === country.id && !t.RegionId);
    if (!loose.length) continue;
    const c = pt(country);
    loose.sort((a, b) => Math.atan2(pt(a).y - c.y, pt(a).x - c.x) - Math.atan2(pt(b).y - c.y, pt(b).x - c.x));
    const groups: PlaceRow[][] = [];
    for (let i = 0; i < loose.length; i += sizes.regionTowns) groups.push(loose.slice(i, i + sizes.regionTowns));
    const existing = w.regions.filter((r) => r.ParentId === country.id).length;
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
      await db()
        .update(places)
        .set({ RegionId: region!.id, updatedAt: new Date() })
        .where(inArray(places.id, group.map((t) => t.id)));
      made++;
      moved += group.length;
    }
  }
  return { regions: made, towns: moved };
}

const COMPASS = ['Central', 'North', 'East', 'South', 'West', 'Highlands', 'Coast', 'Valley', 'Lowlands', 'Uplands'];
/** "Ardenia Central", "Ardenia North"... for regions nobody named. */
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

/** Towns of a region, oldest first (for the town page and tests). */
export async function townsOfRegion(regionId: string) {
  return db().select().from(places).where(and(eq(places.Type, 'town'), eq(places.RegionId, regionId))).orderBy(asc(places.createdAt));
}
