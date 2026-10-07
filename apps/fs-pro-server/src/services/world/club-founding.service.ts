import { and, eq, sql } from 'drizzle-orm';
import { ensureDefaultLineup } from '../play/default-lineup';
import {
  FOUNDING_LIMITS,
  codeProblem,
  isCrestDesign,
  nameProblem,
  tidyName,
  type CrestDesign,
  type FoundClub,
  type FoundedClub,
  type TownTerrain,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubMessages, clubs, entries, managers, places, players, pools, users } from '../../db/drizzle/schema';
import { generatePlayer } from '../../utils/players';
import { pickPlaceholderName } from '../../utils/placeholder-names';
import { getNextCounterId } from '../../utils/counter';
import { calculateAndUpdateClubRating } from '../../controllers/clubs/club.service';
import { FoundingError, clubNameTaken } from './atlas.service';
import { lockPlacement, nextSpot, uniquePlaceCode, useInvite, type Spot, type Tx } from './placement.service';
import { placeInPyramid } from '../competitions/world-competitions.service';
import { postNews } from './news-scope.service';

/**
 * Founding a club (docs/WORLD-PYRAMID-SPEC.md, "Geography and placement"):
 * placement decides where it goes (the next town with room, or a new town,
 * region or country, which the founder names), or an invite puts it in a
 * friend's town. A new club starts at Level 0 with no facilities, a raw
 * squad of amateurs, a small budget, a handful of fans and its owner as
 * manager, and joins its country's pyramid league straight away. No AI
 * clubs are created.
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
  await db().insert(players).values(rows as (typeof players.$inferInsert)[]);
  await calculateAndUpdateClubRating(club.id);
}

/** Names the body must carry for the places `spot` opens. */
function missingNames(spot: Spot, body: FoundClub): string | null {
  const needTown = spot.kind !== 'town';
  const needRegion = spot.kind === 'new-region' || spot.kind === 'new-country';
  const needCountry = spot.kind === 'new-country';
  if (needCountry && !body.newCountry) return 'Your club opens a new country: name it';
  if (needRegion && !body.newRegion) return 'Your club opens a new region: name it';
  if (needTown && !body.newTown) return 'Your club opens a new town: name it';
  return null;
}

/** Validate the place names in the body (only those this spot needs). */
async function placeNameProblem(tx: Tx, spot: Spot, body: FoundClub): Promise<string | null> {
  if (spot.kind === 'new-country') {
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
  const countryId = spot.kind === 'new-country' ? null : spot.country.id;
  const sameNameIn = async (name: string) => {
    if (!countryId) return false;
    const [row] = await tx
      .select({ id: places.id })
      .from(places)
      .where(sql`${places.ParentId} = ${countryId} AND lower(${places.Name}) = lower(${name})`)
      .limit(1);
    return !!row;
  };
  if (spot.kind === 'new-region' || spot.kind === 'new-country') {
    const name = tidyName(body.newRegion!.name);
    const problem = nameProblem(name, 'Region name');
    if (problem) return problem;
    if (await sameNameIn(name)) return 'There is already a place with that name in this country';
  }
  if (spot.kind !== 'town') {
    const name = tidyName(body.newTown!.name);
    const problem = nameProblem(name, 'Town name');
    if (problem) return problem;
    if (spot.kind !== 'new-country' && (await sameNameIn(name))) return 'There is already a place with that name in this country';
    if (spot.kind === 'new-country' || spot.kind === 'new-region') {
      if (tidyName(body.newRegion!.name).toLowerCase() === name.toLowerCase()) return 'The town and its region need different names';
    }
  }
  return null;
}

/** Create the places `spot` opens and return the town, region and country. */
async function openPlaces(tx: Tx, spot: Spot, body: FoundClub, userId: string) {
  const now = new Date();
  let country: typeof places.$inferSelect;
  let region: typeof places.$inferSelect | null;
  if (spot.kind === 'new-country') {
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
        MapX: spot.country.x,
        MapY: spot.country.y,
        Colors: c.colors,
        Motto: c.motto?.trim() || null,
        updatedAt: now,
      })
      .returning()) as [typeof places.$inferSelect];
  } else {
    country = spot.country;
  }

  if (spot.kind === 'new-country' || spot.kind === 'new-region') {
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
        MapX: spot.region.x,
        MapY: spot.region.y,
        updatedAt: now,
      })
      .returning()) as [typeof places.$inferSelect];
  } else {
    region = spot.region;
  }

  if (spot.kind === 'town') return { town: spot.town, region, country, opened: [] as ('town' | 'region' | 'country')[] };

  const t = body.newTown!;
  const name = tidyName(t.name);
  const [town] = await tx
    .insert(places)
    .values({
      Fullname: `${name}, ${country.Name}`,
      Name: name,
      Code: await uniquePlaceCode(`${country.Code}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10)}`, tx),
      Region: country.Region,
      Type: 'town',
      ParentId: country.id,
      RegionId: region!.id,
      FoundedBy: userId,
      MapX: spot.town.x,
      MapY: spot.town.y,
      Terrain: t.terrain as TownTerrain,
      updatedAt: now,
    })
    .returning();
  const opened: ('town' | 'region' | 'country')[] =
    spot.kind === 'new-country' ? ['country', 'region', 'town'] : spot.kind === 'new-region' ? ['region', 'town'] : ['town'];
  return { town: town!, region, country, opened };
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
  if (await clubNameTaken(name, code)) throw new FoundingError('That name or code is taken', 409);
  const crest: CrestDesign = { ...body.crest, initials: body.crest.initials || code };

  const { id: managerKey } = await getNextCounterId('manager');
  const [first, ...rest] = tidyName(user.FullName || user.Username).split(' ');

  let placed: Awaited<ReturnType<typeof openPlaces>>;
  let clubId: string;
  try {
    ({ placed, clubId } = await db().transaction(async (tx) => {
      await lockPlacement(tx);
      const { spot, invite } = await nextSpot(tx, { invite: body.invite });
      const missing = missingNames(spot, body);
      if (missing) throw new FoundingError(missing, 409);
      const badName = await placeNameProblem(tx, spot, body);
      if (badName) throw new FoundingError(badName, 409);

      const where = await openPlaces(tx, spot, body, user.id);
      // An honoured invite counts one use (a fallback placement doesn't).
      if (invite?.valid && invite.invite && !invite.problem) await useInvite(tx, invite.invite.id);

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
          TownId: where.town.id,
          AddressCountryId: where.country.id,
          Address: { City: where.town.Name, Section: '' },
          Budget: STARTING_BUDGET,
          CampusLayout: where.town.Terrain ?? 'city',
          Crest: crest as unknown as Record<string, unknown>,
          Stadium: { Name: body.stadiumName?.trim() || `${where.town.Name} Park`, Capacity: 1000 },
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

  await createSquad({ id: clubId, code }, placed.country.id);
  await ensureDefaultLineup(clubId).catch((err) => console.warn('[founding] default lineup failed', err));

  let pool: FoundedClub['pool'] = null;
  try {
    const joined = await placeInPyramid(clubId, placed.country.id);
    if (joined && 'poolId' in joined) pool = { id: joined.poolId, name: joined.name, division: joined.division };
    else if (joined) pool = await poolOf(joined.seasonId, clubId);
  } catch (err) {
    console.warn('[founding] pyramid placement failed', err);
  }

  await db()
    .insert(clubMessages)
    .values({
      ClubId: clubId,
      Kind: 'board',
      Tone: 'good',
      Title: `Welcome to ${placed.town.Name}`,
      Body:
        `${name} is official. You have a dirt pitch, ${SQUAD_SHAPE.length} hopeful amateurs and ` +
        `${STARTING_BUDGET.toLocaleString('en-US')} in the bank.` +
        (pool ? ` You start in ${pool.name}: your fixtures are already on the calendar.` : '') +
        ' Win matches to earn money and XP, then build up the grounds.',
      updatedAt: new Date(),
    });

  const opener = placed.opened[0];
  await postNews({
    kind: 'founded',
    importance: opener === 'country' ? 40 : 20,
    title:
      opener === 'country'
        ? `A new nation: ${placed.country.Name}`
        : opener === 'region'
          ? `${placed.region?.Name} is on the map`
          : opener === 'town'
            ? `${placed.town.Name} founded`
            : `${name} join ${placed.town.Name}`,
    body:
      opener === 'country'
        ? `${name} found ${placed.town.Name}, the first town of ${placed.country.Name}.`
        : `${name} kick off in ${placed.town.Name}${placed.region ? `, ${placed.region.Name}` : ''}.`,
    clubIds: [clubId],
  }).catch((err) => console.warn('[founding] news', err));

  return {
    clubId,
    code,
    town: { id: placed.town.id, name: placed.town.Name },
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
