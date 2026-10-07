import { and, eq, sql } from 'drizzle-orm';
import {
  FOUNDING_LIMITS,
  codeProblem,
  isCrestDesign,
  nameProblem,
  tidyName,
  type CrestDesign,
  type FoundClub,
  type FoundedClub,
  type PlacementSpot,
  type TownTerrain,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubMessages, clubs, entries, managers, places, players, pools, users } from '../../db/drizzle/schema';
import { type ClubInterface } from '../../controllers/clubs/club.model';
import { generatePlayer } from '../../utils/players';
import { pickPlaceholderName } from '../../utils/placeholder-names';
import { getNextCounterId } from '../../utils/counter';
import { updateClubFields } from '../../controllers/clubs/club.service';
import { FoundingError } from './atlas.service';
import {
  advanceFrontier,
  inviteByToken,
  lockPlacement,
  nextSpot,
  regionName,
  uniquePlaceCode,
  useInvite,
  type Tx,
} from './placement.service';
import { placeInPyramid } from '../competitions/world-competitions.service';
import { postNews } from './news-scope.service';

/**
 * Founding a club (docs/perfect/WORLD-HIERARCHY-SPEC.md §3-§4; docs/WORLD-
 * PYRAMID-SPEC.md, "Geography and placement"): the Go world-service decides
 * where it goes (a district with a hole, or a new district/city/region/country
 * the founder names), or an invite puts it in a friend's district. Placement
 * runs inside this transaction while holding PLACEMENT_LOCK; Node creates the
 * places the spot opens and inserts the club. A new club starts at Level 0
 * with no facilities, a raw squad of amateurs, a small budget, a handful of
 * fans and its owner as manager, and joins its country's pyramid league
 * straight away. No AI clubs are created.
 *
 * The contract (docs/perfect/WORLD-SERVICE-CONTRACT.md §1) carries a single
 * anchor point per spot; every new level is created at that anchor (B2-2A
 * Q-C). New districts are auto-named "<City> <Compass word>" (DECISIONS Q3/Q8);
 * new cities/regions/countries are named by the founder.
 */

const db = () => DrizzleDatabase.getInstance().database;

export const STARTING_BUDGET = 1_500_000;
const STARTING_FANS = 150;
const STARTING_REPUTATION = 5;

/** 16 players: 2 GK, 5 DEF, 5 MID, 4 ATT. */
const SQUAD_SHAPE = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT', 'ATT'];

/** Attribute ranges of a starting squad (rates about 57; the original
 * world's clubs rate 65-78). */
const STARTER = { attr: [35, 55] as [number, number], pos: [52, 64] as [number, number] };

/** The existing rows a contract spot resolves to (see `resolveSpotPlaces`). */
type ResolvedPlaces = {
  district: typeof places.$inferSelect | null;
  city: typeof places.$inferSelect | null;
  region: typeof places.$inferSelect | null;
  country: typeof places.$inferSelect | null;
};

async function placeRow(id: string | null): Promise<typeof places.$inferSelect | null> {
  if (!id) return null;
  const [p] = await db().select().from(places).where(eq(places.id, id)).limit(1);
  return p ?? null;
}

/**
 * `resolvePlaces` (placement.service.ts:194) but the four point reads run
 * together when the Go spot carries the ids (it always does for a filled spot);
 * the sequential fallbacks only fire for a level the spot opens. Saves ~2 ms
 * per founding of serialised round trips.
 */
async function resolveSpotPlaces(spot: PlacementSpot): Promise<ResolvedPlaces> {
  const [district, cityGiven, regionGiven, countryGiven] = await Promise.all([
    placeRow(spot.districtId),
    placeRow(spot.cityId),
    placeRow(spot.regionId),
    placeRow(spot.countryId),
  ]);
  const city = cityGiven ?? (district ? await placeRow(district.ParentId) : null);
  const region =
    regionGiven ?? (city ? await placeRow(city.RegionId) : null) ?? (district ? await placeRow(district.RegionId) : null);
  const country =
    countryGiven ?? (city ? await placeRow(city.ParentId) : null) ?? (region ? await placeRow(region.ParentId) : null);
  return { district, city, region, country };
}

/**
 * Indexed equivalent of `clubNameTaken` (atlas.service.ts:253) for the founding
 * hot path. That helper compares `lower(Name) = lower(?) OR upper(ClubCode) =
 * upper(?)`, which cannot use either unique index and seq-scans the whole
 * Clubs table on every founding - the dominant cost as the world grows (B2-2E
 * measured ~1.4 ms per 1,000 clubs, i.e. O(N)). Both indexes exist:
 * `Clubs_name_ci_unique` on `lower(Name)` and `Clubs_ClubCode_unique` on
 * `ClubCode`, and this OR form makes Postgres BitmapOr them (~0.1 ms).
 * `codeProblem` forces codes to [A-Z][A-Z0-9]{1,3} and `foundClub` uppercases
 * before insert, so every code this path stores is uppercase; an exact-match
 * code probe is therefore the same set (the live `fspro` Clubs table has 0
 * non-uppercase codes). The transaction still catches the 23505 race.
 */
async function clubIdentityTaken(name: string, code: string): Promise<boolean> {
  const rows = await db()
    .select({ id: clubs.id })
    .from(clubs)
    .where(sql`lower(${clubs.Name}) = lower(${name}) OR ${clubs.ClubCode} = ${code}`)
    .limit(1);
  return rows.length > 0;
}

/** The default team sheet's slots, matching services/play/default-lineup.ts
 * (SLOTS_433/BENCH_SIZE are module-private there, so kept in step here). */
const SLOTS_433 = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] as const;
const BENCH_SIZE = 7;

/**
 * The same best-fit XI `ensureDefaultLineup` (default-lineup.ts:18) picks, but
 * from the rows just inserted instead of two more reads: every starter is a
 * healthy player if 11 are available, otherwise the best overall. Folding it
 * into createSquad's single Club update removes that function's two selects
 * and its update per founding.
 */
function defaultLineup(squad: { id: string; pos: string | null; rating: number | null; injury: unknown }[]) {
  const injured = (x: unknown) => Number((x as { daysRemaining?: number } | null)?.daysRemaining) > 0;
  const byRating = (a: { rating: number | null }, b: { rating: number | null }) => (b.rating ?? 0) - (a.rating ?? 0);
  const fit = squad.filter((p) => !injured(p.injury)).sort(byRating);
  const pool = fit.length >= 11 ? fit : [...squad].sort(byRating);
  const used = new Set<string>();
  const take = (pos?: string) => {
    const p = pool.find((x) => !used.has(x.id) && (!pos || x.pos === pos));
    if (p) used.add(p.id);
    return p?.id;
  };
  const startingXI = SLOTS_433.map((pos) => take(pos) ?? take()).filter((id): id is string => !!id);
  const bench: string[] = [];
  while (bench.length < BENCH_SIZE) {
    const id = take();
    if (!id) break;
    bench.push(id);
  }
  return { startingXI, bench };
}

/** The Rating/AttackingClass/DefensiveClass/`<POS>_Rating` fields for a set of
 * per-position averages - the exact arithmetic of calculateAndUpdateClubRating
 * (club.service.ts:121) so the stored numbers are unchanged. */
function clubRatingFields(ratings: { position: string | null; avg_rating: number }[]) {
  const total = ratings.reduce((sum, r) => sum + r.avg_rating, 0);
  const att =
    (ratings.find((r) => r.position === 'ATT')?.avg_rating ?? 0) +
    (ratings.find((r) => r.position === 'MID')?.avg_rating ?? 0) / 2;
  const def =
    (ratings.find((r) => r.position === 'GK')?.avg_rating ?? 0) +
    (ratings.find((r) => r.position === 'DEF')?.avg_rating ?? 0) / 2;
  const data: Partial<ClubInterface> & Record<string, unknown> = {
    Rating: ratings.length ? total / ratings.length : 0,
    AttackingClass: att,
    DefensiveClass: def,
  };
  for (const r of ratings) data[`${r.position}_Rating`] = r.avg_rating;
  return data;
}

/** The position averages of a freshly generated squad, in the same shape
 * `calculateClubsTotalRatings` returns: a `WHERE ClubId = ? GROUP BY Position`
 * read of Players. Players has no ClubId index, so that read seq-scans the
 * whole (1.6M-row at 100k-club) table on every founding; the rows were just
 * inserted, so computing the averages from them removes the scan. */
function positionAverages(rows: { Position: string | null; Rating: number | null }[]) {
  const groups = new Map<string, { sum: number; count: number }>();
  for (const p of rows) {
    if (!p.Position) continue;
    const g = groups.get(p.Position) ?? { sum: 0, count: 0 };
    g.sum += p.Rating ?? 0;
    g.count++;
    groups.set(p.Position, g);
  }
  return [...groups.entries()].map(([position, g]) => ({ position, avg_rating: g.sum / g.count }));
}

/**
 * The raw squad (16 players, bulk-inserted in one statement) plus the Club's
 * Rating fields and its default 4-3-3 team sheet, written in a single Club
 * update. Previously this was the insert + calculateAndUpdateClubRating
 * (select+update) + ensureDefaultLineup (2 selects + update): four fewer
 * round trips per founded club (B2-2E measured ~7 ms/club).
 */
async function createSquad(club: { id: string; code: string }, nationalityId: string) {
  const rows = SQUAD_SHAPE.map((position) => {
    const { firstName, lastName } = pickPlaceholderName();
    const p = generatePlayer({
      position,
      firstname: firstName,
      lastname: lastName,
      nationality: '',
      nationalityId,
      ageRange: [17, 30],
      attributeRange: STARTER.attr,
      positionAttributeRange: STARTER.pos,
    });
    return {
      ...p,
      Attributes: p.Attributes as unknown as Record<string, unknown>,
      isSigned: true,
      ClubId: club.id,
      ClubCode: club.code,
      updatedAt: new Date(),
    };
  });
  const inserted = await db()
    .insert(players)
    .values(rows as (typeof players.$inferInsert)[])
    .returning({ id: players.id, Position: players.Position, Rating: players.Rating, Injury: players.Injury });
  const lineup = defaultLineup(inserted.map((p) => ({ id: p.id, pos: p.Position, rating: p.Rating, injury: p.Injury })));
  await updateClubFields(club.id, {
    ...clubRatingFields(positionAverages(inserted)),
    Lineup: lineup,
    Tactic: { formationName: '433', styleName: 'Balanced' },
  });
}

/** Names the body must carry for the levels `spot.needsNames` opens. */
function missingNames(spot: PlacementSpot, body: FoundClub): string | null {
  const needs = new Set(spot.needsNames);
  if (needs.has('country') && !body.newCountry) return 'Your club opens a new country: name it';
  if (needs.has('region') && !body.newRegion) return 'Your club opens a new region: name it';
  if (needs.has('city') && !body.newTown) return 'Your club opens a new city: name it';
  return null;
}

/** Validate the place names in the body (only those this spot needs). The
 * caller passes the spot's already-resolved places so founding resolves the
 * (up to four) place rows once, not once here and again in openPlaces. */
async function placeNameProblem(
  tx: Tx,
  spot: PlacementSpot,
  body: FoundClub,
  existing: ResolvedPlaces
): Promise<string | null> {
  const needs = new Set(spot.needsNames);
  const countryId = existing.country?.id ?? null;
  const sameNameIn = async (name: string) => {
    if (!countryId) return false;
    const [row] = await tx
      .select({ id: places.id })
      .from(places)
      .where(sql`${places.ParentId} = ${countryId} AND lower(${places.Name}) = lower(${name})`)
      .limit(1);
    return !!row;
  };
  if (needs.has('country')) {
    const c = body.newCountry!;
    const problem = nameProblem(tidyName(c.name), 'Country name') ?? codeProblem(c.code.trim().toUpperCase(), 'Country code');
    if (problem) return problem;
    const [taken] = await tx
      .select({ id: places.id })
      .from(places)
      .where(sql`(${places.Type} = 'country' AND lower(${places.Name}) = lower(${tidyName(c.name)})) OR ${places.Code} = ${c.code.trim().toUpperCase()}`)
      .limit(1);
    if (taken) return 'That country name or code is taken';
  }
  if (needs.has('region')) {
    const name = tidyName(body.newRegion!.name);
    const problem = nameProblem(name, 'Region name');
    if (problem) return problem;
    if (await sameNameIn(name)) return 'There is already a place with that name in this country';
  }
  if (needs.has('city')) {
    const name = tidyName(body.newTown!.name);
    const problem = nameProblem(name, 'City name');
    if (problem) return problem;
    if (await sameNameIn(name)) return 'There is already a place with that name in this country';
    if (needs.has('region') && tidyName(body.newRegion!.name).toLowerCase() === name.toLowerCase()) {
      return 'The city and its region need different names';
    }
  }
  return null;
}

interface OpenedPlaces {
  district: typeof places.$inferSelect;
  city: typeof places.$inferSelect;
  region: typeof places.$inferSelect | null;
  country: typeof places.$inferSelect;
  opened: ('town' | 'region' | 'country')[];
}

/**
 * Create the levels `spot.needsNames` opens at the spot's anchor and return
 * the district the club goes in. The legacy `opened` labels keep their old
 * values (the client reads them): a new city counts as `town`.
 */
async function openPlaces(
  tx: Tx,
  spot: PlacementSpot,
  body: FoundClub,
  userId: string,
  existing: ResolvedPlaces
): Promise<OpenedPlaces> {
  const now = new Date();
  const needs = new Set(spot.needsNames);
  const opened: ('town' | 'region' | 'country')[] = [];

  let country = existing.country;
  if (needs.has('country')) {
    const c = body.newCountry!;
    const name = tidyName(c.name);
    [country] = (await tx
      .insert(places)
      .values({
        Fullname: `Republic of ${name}`,
        Name: name,
        Code: c.code.trim().toUpperCase(),
        Region: 'world',
        Type: 'country',
        FoundedBy: userId,
        MapX: spot.x,
        MapY: spot.y,
        Colors: c.colors,
        Motto: c.motto?.trim() || null,
        updatedAt: now,
      })
      .returning()) as [typeof places.$inferSelect];
    opened.push('country');
  }
  if (!country) throw new Error('Placement returned no country');

  let region = existing.region;
  if (needs.has('region')) {
    const name = tidyName(body.newRegion!.name);
    [region] = (await tx
      .insert(places)
      .values({
        Fullname: `${name}, ${country.Name}`,
        Name: name,
        Code: await uniquePlaceCode(`${country.Code}-R-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10)}`, tx),
        Region: country.Region,
        Type: 'region',
        ParentId: country.id,
        FoundedBy: userId,
        MapX: spot.x,
        MapY: spot.y,
        updatedAt: now,
      })
      .returning()) as [typeof places.$inferSelect];
    opened.push('region');
  }

  let city = existing.city;
  if (needs.has('city')) {
    const c = body.newTown!;
    const name = tidyName(c.name);
    [city] = (await tx
      .insert(places)
      .values({
        Fullname: `${name}, ${country.Name}`,
        Name: name,
        Code: await uniquePlaceCode(`${country.Code}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10)}`, tx),
        Region: country.Region,
        // Migration 0038: the old `town` level is `city`.
        Type: 'city',
        ParentId: country.id,
        RegionId: region?.id ?? null,
        FoundedBy: userId,
        MapX: spot.x,
        MapY: spot.y,
        Terrain: c.terrain as TownTerrain,
        updatedAt: now,
      })
      .returning()) as [typeof places.$inferSelect];
    opened.push('town');
  }
  if (!city) throw new Error('Placement returned no city');

  let district = existing.district;
  if (!district) {
    // Auto-name the new district "<City> <Compass word>" (DECISIONS Q3/Q8).
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(places)
      .where(and(eq(places.Type, 'district'), eq(places.ParentId, city.id)));
    const name = regionName(city.Name, n);
    [district] = (await tx
      .insert(places)
      .values({
        Fullname: `${name}, ${city.Name}`,
        Name: name,
        Code: await uniquePlaceCode(`${city.Code}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8)}`, tx),
        Region: city.Region,
        Type: 'district',
        ParentId: city.id,
        RegionId: city.RegionId ?? region?.id ?? null,
        FoundedBy: userId,
        MapX: spot.x,
        MapY: spot.y,
        Terrain: city.Terrain,
        updatedAt: now,
      })
      .returning()) as [typeof places.$inferSelect];
    if (!opened.includes('town')) opened.push('town');
  }
  return { district, city, region: region ?? null, country, opened };
}

export async function foundClub(userId: string | undefined, body: FoundClub): Promise<FoundedClub> {
  if (!userId) throw new FoundingError('Not logged in', 403);
  const [user] = await db().select().from(users).where(eq(users.id, userId));
  if (!user) throw new FoundingError('Not logged in', 403);
  // Bots fill the world for free without this. Admins and imagination-login
  // accounts (verified there) are exempt. Set REQUIRE_VERIFIED_EMAIL=true.
  if (process.env.REQUIRE_VERIFIED_EMAIL?.trim() === 'true' && !user.isAdmin && !user.accountId && !user.EmailVerifiedAt) {
    throw new FoundingError('Confirm your email first - check your inbox for the link we sent.', 403);
  }

  const [{ owned }] = await db()
    .select({ owned: sql<number>`count(*)::int` })
    .from(clubs)
    .where(sql`${clubs.UserId} = ${user.id} AND ${clubs.ReleasedAt} IS NULL`);
  if (!user.isAdmin && owned >= FOUNDING_LIMITS.clubs) {
    throw new FoundingError(`You can run ${FOUNDING_LIMITS.clubs} clubs at most`, 403);
  }

  const name = tidyName(body.name);
  const code = body.code.trim().toUpperCase();
  const problem = nameProblem(name, 'Club name', 3, 40) ?? codeProblem(code, 'Short code');
  if (problem) throw new FoundingError(problem);
  if (!isCrestDesign(body.crest)) throw new FoundingError('That crest is not valid');
  if (await clubIdentityTaken(name, code)) throw new FoundingError('That name or code is taken', 409);
  const crest: CrestDesign = { ...body.crest, initials: body.crest.initials || code };

  const { id: managerKey } = await getNextCounterId('manager');
  const [first, ...rest] = tidyName(user.FullName || user.Username).split(' ');

  let placed: OpenedPlaces;
  let clubId: string;
  try {
    ({ placed, clubId } = await db().transaction(async (tx) => {
      await lockPlacement(tx);
      // The Go world-service returns a pure-read recommendation; the lock is
      // held for the whole founding so no two founders pick the same slot.
      const spot = await nextSpot({ invite: body.invite });
      const missing = missingNames(spot, body);
      if (missing) throw new FoundingError(missing, 409);
      // Resolve the spot's existing places once and share them with both the
      // name validation and openPlaces (they each used to re-resolve them).
      const existing = await resolveSpotPlaces(spot);
      const badName = await placeNameProblem(tx, spot, body, existing);
      if (badName) throw new FoundingError(badName, 409);

      const where = await openPlaces(tx, spot, body, user.id, existing);
      // An honoured invite counts one use (a fallback placement doesn't): the
      // Go service only sets `invite` when it actually honoured it.
      if (spot.invite && body.invite) {
        const invite = await inviteByToken(tx, body.invite);
        if (invite) await useInvite(tx, invite.id);
      }

      const [manager] = await tx
        .insert(managers)
        .values({
          Key: managerKey,
          FirstName: first || user.Username,
          LastName: rest.join(' ') || 'Manager',
          Age: user.Age ?? 35,
          NationalityId: where.country.id,
          isEmployed: true,
          updatedAt: new Date(),
        })
        .returning({ id: managers.id });
      const [row] = await tx
        .insert(clubs)
        .values({
          Name: name,
          ClubCode: code,
          UserId: user.id,
          ManagerId: manager!.id,
          // Migration 0038 renamed TownId -> DistrictId; clubs belong to a district.
          DistrictId: where.district.id,
          AddressCountryId: where.country.id,
          Address: { City: where.city.Name, Section: '' },
          Budget: STARTING_BUDGET,
          CampusLayout: where.city.Terrain ?? 'city',
          Crest: crest as unknown as Record<string, unknown>,
          Stadium: { Name: body.stadiumName?.trim() || `${where.district.Name} Park`, Capacity: 1000 },
          Fans: STARTING_FANS,
          Reputation: STARTING_REPUTATION,
          BoardConfidence: 60,
          LastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: clubs.id });
      await tx.update(managers).set({ ClubId: row!.id, updatedAt: new Date() }).where(eq(managers.id, manager!.id));
      return { placed: where, clubId: row!.id };
    }));
  } catch (err) {
    if (err instanceof FoundingError) throw err;
    // Lost a race with someone founding the same name.
    if ((err as { code?: string; cause?: { code?: string } })?.cause?.code === '23505' || (err as { code?: string })?.code === '23505') {
      throw new FoundingError('That name or code is taken', 409);
    }
    throw err;
  }

  const opener = placed.opened[0];
  const news = postNews({
    kind: 'founded',
    importance: opener === 'country' ? 40 : 20,
    title:
      opener === 'country'
        ? `A new nation: ${placed.country.Name}`
        : opener === 'region'
          ? `${placed.region?.Name} is on the map`
          : opener === 'town'
            ? `${placed.district.Name} founded`
            : `${name} join ${placed.district.Name}`,
    body:
      opener === 'country'
        ? `${name} found ${placed.city.Name}, the first city of ${placed.country.Name}.`
        : `${name} kick off in ${placed.district.Name}${placed.region ? `, ${placed.region.Name}` : ''}.`,
    clubIds: [clubId],
  }).catch((err) => {
    console.warn('[founding] news', err);
    return null;
  });

  // These steps touch different tables and are independent of each other, so
  // run them together: the Go round-trip inside placeInPyramid overlaps the
  // squad insert, the Club rating/lineup update, the frontier update and the
  // news write instead of serialising (B2-2E measured 42 ms sequential vs
  // 37 ms overlapped per club at 1,000).
  const [, joined] = await Promise.all([
    createSquad({ id: clubId, code }, placed.country.id),
    placeInPyramid(clubId, placed.country.id).catch((err) => {
      console.warn('[founding] pyramid placement failed', err);
      return null;
    }),
    news,
    // Keep the frontier pointer moving for the Go service's O(1) fast path
    // (B2-2A Q-D); it is a validated hint, so a failure here is not fatal. It
    // records the newest country/region/capital, which can only change when a
    // founding opens places - so skip the three full-Places scans on the common
    // join-an-existing-district path. The Go service recomputes from counts
    // when the hint is stale, so skipping is not a correctness risk.
    placed.opened.length > 0
      ? advanceFrontier().catch((err) => console.warn('[founding] frontier', err))
      : Promise.resolve(),
  ]);

  let pool: FoundedClub['pool'] = null;
  if (joined && 'poolId' in joined) pool = { id: joined.poolId, name: joined.name, division: joined.division };
  else if (joined) pool = await poolOf(joined.seasonId, clubId);

  await db()
    .insert(clubMessages)
    .values({
      ClubId: clubId,
      Kind: 'board',
      Tone: 'good',
      Title: `Welcome to ${placed.district.Name}`,
      Body:
        `${name} is official. You have a dirt pitch, ${SQUAD_SHAPE.length} hopeful amateurs and ` +
        `${STARTING_BUDGET.toLocaleString('en-US')} in the bank.` +
        (pool ? ` You start in ${pool.name}: your fixtures are already on the calendar.` : '') +
        ' Win matches to earn money and XP, then build up the grounds.',
      updatedAt: new Date(),
    });

  return {
    clubId,
    code,
    // The client-facing field is still `town`; it is the club's district now.
    town: { id: placed.district.id, name: placed.district.Name },
    region: placed.region ? { id: placed.region.id, name: placed.region.Name } : null,
    country: { id: placed.country.id, name: placed.country.Name },
    opened: placed.opened,
    pool,
  };
}

async function poolOf(seasonId: string, clubId: string): Promise<FoundedClub['pool']> {
  const [row] = await db()
    .select({ id: pools.id, name: pools.Name, division: pools.Division })
    .from(entries)
    .innerJoin(pools, sql`${pools.id}::text = ${entries.Group}`)
    .where(and(eq(entries.SeasonId, seasonId), eq(entries.ClubId, clubId)));
  return row ?? null;
}
