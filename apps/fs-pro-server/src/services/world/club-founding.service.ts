import { eq, sql } from 'drizzle-orm';
import {
  FOUNDING_LIMITS,
  TOWN_MAX_CLUBS,
  codeProblem,
  isCrestDesign,
  nameProblem,
  randomCrest,
  suggestCode,
  tidyName,
  type CrestDesign,
  type FoundClub,
  type FoundedClub,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubMessages, clubs, managers, players, users } from '../../db/drizzle/schema';
import { generatePlayer } from '../../utils/players';
import { pickPlaceholderName } from '../../utils/placeholder-names';
import { getNextCounterId } from '../../utils/counter';
import { calculateAndUpdateClubRating } from '../../controllers/clubs/club.service';
import { FoundingError, clubNameTaken, getTown } from './atlas.service';
import { ensureNationalLeague } from '../competitions/world-competitions.service';

/**
 * Founding a club (docs: PERSISTENT-STRATEGY-GAME-TRACKER.md, "World atlas"):
 * a new club starts at Level 0 with no facilities, a raw squad of amateurs, a
 * small budget, a handful of fans and its owner as manager. If the world has
 * too few clubs of a similar standard, local amateur AI clubs spring up in
 * the same town, so a new club always has fair first opponents.
 */

const db = () => DrizzleDatabase.getInstance().database;

export const STARTING_BUDGET = 1_500_000;
const STARTING_FANS = 150;
const STARTING_REPUTATION = 5;
const AI_RIVAL_BUDGET = 800_000;

/** 16 players: 2 GK, 5 DEF, 5 MID, 4 ATT. */
const SQUAD_SHAPE = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT', 'ATT'];

/** Attribute ranges by squad standard; "starter" squads rate about 57,
 * while the original world's clubs rate 65-78. */
const STANDARDS = {
  weak: { attr: [30, 50] as [number, number], pos: [48, 60] as [number, number] },
  starter: { attr: [35, 55] as [number, number], pos: [52, 64] as [number, number] },
  strong: { attr: [38, 58] as [number, number], pos: [55, 66] as [number, number] },
};

/** How many clubs within this Rating of a new club count as "peers". */
const PEER_BAND = 6;
const MIN_PEERS = 3;

const RIVAL_PATTERNS = ['{t} Athletic', '{t} Rovers', 'AFC {t}', '{t} Wanderers', 'Real {t}', '{t} Town', 'Sporting {t}', '{t} Albion', '{t} Rangers', 'Inter {t}'];

async function createSquad(
  club: { id: string; code: string },
  nationalityId: string,
  standard: keyof typeof STANDARDS
) {
  const { attr, pos } = STANDARDS[standard];
  const rows = SQUAD_SHAPE.map((position) => {
    const { firstName, lastName } = pickPlaceholderName();
    const p = generatePlayer({
      position,
      firstname: firstName,
      lastname: lastName,
      nationality: '',
      nationalityId,
      ageRange: [17, 30],
      attributeRange: attr,
      positionAttributeRange: pos,
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

async function clubCodeTaken(code: string) {
  const rows = await db().select({ id: clubs.id }).from(clubs).where(sql`upper(${clubs.ClubCode}) = upper(${code})`).limit(1);
  return rows.length > 0;
}

async function uniqueClubIdentity(townName: string, used: Set<string>) {
  for (const pattern of RIVAL_PATTERNS) {
    const name = pattern.replace('{t}', townName);
    if (used.has(name.toLowerCase()) || nameProblem(name, 'Name', 3, 40)) continue;
    let code = suggestCode(name).slice(0, 3) || 'AFC';
    for (let n = 2; await clubCodeTaken(code); n++) code = `${code.slice(0, 2)}${n}`.slice(0, 4);
    if (await clubNameTaken(name)) continue;
    used.add(name.toLowerCase());
    return { name, code };
  }
  return null;
}

/** Local AI clubs for a new club to play: up to two in its town when the
 * world has fewer than MIN_PEERS clubs near its standard. */
async function spawnRivals(
  town: { id: string; Name: string; Terrain: string | null },
  country: { id: string },
  rating: number,
  room: number
) {
  const [{ peers }] = await db()
    .select({ peers: sql<number>`count(*)::int` })
    .from(clubs)
    .where(sql`abs(${clubs.Rating} - ${rating}) <= ${PEER_BAND}`);
  // The new club itself is one of the peers.
  const wanted = Math.min(2, Math.max(0, MIN_PEERS + 1 - peers), room);
  const out: { id: string; name: string }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < wanted; i++) {
    const identity = await uniqueClubIdentity(town.Name, used);
    if (!identity) break;
    const [row] = await db()
      .insert(clubs)
      .values({
        Name: identity.name,
        ClubCode: identity.code,
        TownId: town.id,
        AddressCountryId: country.id,
        Address: { City: town.Name, Section: '' },
        Budget: AI_RIVAL_BUDGET,
        CampusLayout: town.Terrain ?? 'city',
        Crest: randomCrest(identity.name, identity.code) as unknown as Record<string, unknown>,
        Stadium: { Name: `${town.Name} Recreation Ground`, Capacity: 1000 },
        Fans: 90 + i * 40,
        Reputation: 3,
        XP: i * 60,
        updatedAt: new Date(),
      })
      .returning({ id: clubs.id });
    await createSquad({ id: row!.id, code: identity.code }, country.id, i === 0 ? 'weak' : 'strong');
    out.push({ id: row!.id, name: identity.name });
  }
  return out;
}

export async function foundClub(userId: string | undefined, body: FoundClub): Promise<FoundedClub> {
  if (!userId) throw new FoundingError('Not logged in', 403);
  const [user] = await db().select().from(users).where(eq(users.id, userId));
  if (!user) throw new FoundingError('Not logged in', 403);

  const [{ owned }] = await db()
    .select({ owned: sql<number>`count(*)::int` })
    .from(clubs)
    .where(eq(clubs.UserId, user.id));
  if (!user.isAdmin && owned >= FOUNDING_LIMITS.clubs) {
    throw new FoundingError(`You can run ${FOUNDING_LIMITS.clubs} clubs at most`, 403);
  }

  const { town, country } = await getTown(body.townId);
  const [{ inTown }] = await db()
    .select({ inTown: sql<number>`count(*)::int` })
    .from(clubs)
    .where(eq(clubs.TownId, town.id));
  if (inTown >= TOWN_MAX_CLUBS) {
    throw new FoundingError(`${town.Name} already has ${TOWN_MAX_CLUBS} clubs - found a new town nearby`, 409);
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
  const [manager] = await db()
    .insert(managers)
    .values({
      Key: managerKey,
      FirstName: first || user.Username,
      LastName: rest.join(' ') || 'Manager',
      Age: user.Age ?? 35,
      NationalityId: country.id,
      isEmployed: true,
      updatedAt: new Date(),
    })
    .returning({ id: managers.id });

  let clubId: string;
  try {
    const [row] = await db()
      .insert(clubs)
      .values({
        Name: name,
        ClubCode: code,
        UserId: user.id,
        ManagerId: manager!.id,
        TownId: town.id,
        AddressCountryId: country.id,
        Address: { City: town.Name, Section: '' },
        Budget: STARTING_BUDGET,
        CampusLayout: town.Terrain ?? 'city',
        Crest: crest as unknown as Record<string, unknown>,
        Stadium: { Name: body.stadiumName?.trim() || `${town.Name} Park`, Capacity: 1000 },
        Fans: STARTING_FANS,
        Reputation: STARTING_REPUTATION,
        BoardConfidence: 60,
        updatedAt: new Date(),
      })
      .returning({ id: clubs.id });
    clubId = row!.id;
  } catch (err) {
    await db().delete(managers).where(eq(managers.id, manager!.id));
    // Lost a race with someone founding the same name.
    if ((err as { code?: string; cause?: { code?: string } })?.cause?.code === '23505') {
      throw new FoundingError('That name or code is taken', 409);
    }
    throw err;
  }
  await db().update(managers).set({ ClubId: clubId, updatedAt: new Date() }).where(eq(managers.id, manager!.id));
  await createSquad({ id: clubId, code }, country.id, 'starter');

  const [{ rating }] = await db().select({ rating: clubs.Rating }).from(clubs).where(eq(clubs.id, clubId));
  const rivals = await spawnRivals(town, country, rating, TOWN_MAX_CLUBS - inTown - 1);

  // A country with enough clubs gets its national league (once).
  const [{ inCountry }] = await db()
    .select({ inCountry: sql<number>`count(*)::int` })
    .from(clubs)
    .where(eq(clubs.AddressCountryId, country.id));
  if (inCountry >= 3) {
    await ensureNationalLeague(country.id).catch((err) => console.warn('[founding] national league', err));
  }

  await db()
    .insert(clubMessages)
    .values([
      {
        ClubId: clubId,
        Kind: 'board',
        Tone: 'good',
        Title: `Welcome to ${town.Name}`,
        Body:
          `${name} is official. You have a dirt pitch, ${SQUAD_SHAPE.length} hopeful amateurs and ` +
          `${STARTING_BUDGET.toLocaleString('en-US')} in the bank. Play matches to earn money and XP, then build up the grounds.`,
        updatedAt: new Date(),
      },
      ...(rivals.length
        ? [
            {
              ClubId: clubId,
              Kind: 'press',
              Tone: 'neutral',
              Title: 'Local rivals',
              Body: `${rivals.map((r) => r.name).join(' and ')} ${rivals.length > 1 ? 'have' : 'has'} also formed in ${town.Name}. The town wants a derby.`,
              updatedAt: new Date(),
            },
          ]
        : []),
    ]);

  return { clubId, code, rivals };
}
