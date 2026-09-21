import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { places, players, transferLedger } from '../../db/drizzle/schema';
import { generatePlayer } from '../../utils/players';
import { pickRandomFromArray, randomBetween } from '../../helpers/misc';
import { generateSystemCountryName } from './system-country-names.service';

export const FOREIGN_LEAGUES = [
  'Continental Premiership',
  'Trans-Oceanic Super League',
  'Grand Atlantic Championship',
  'Meridian First Division',
  'Alpine Elite Liga',
  'Pacific Premier Division',
  'Austral League One',
  'Equatorial Superliga',
  'Crown Trophy Championship',
  'Balkan Superliga',
];

export interface ForeignIntakeOptions {
  count?: number;
  reason?: string;
}

/**
 * Generates a batch of unattached players arriving from fictional/non-existent
 * overseas leagues with nationalities from the in-universe system countries.
 * Spans all positions (GK, DEF, MID, ATT) with varied ages (18-34) and random attributes.
 */
export async function generateForeignLeagueIntake(
  options: ForeignIntakeOptions = {}
): Promise<any[]> {
  const db = DrizzleDatabase.getInstance().database;

  // Load all system countries from Places table
  const systemCountries = await db
    .select({
      id: places.id,
      code: places.Code,
      name: places.Name,
    })
    .from(places)
    .where(eq(places.Type, 'country'));

  if (!systemCountries.length) {
    console.warn('[foreign-intake] No system countries found in Places table');
    return [];
  }

  // Quota distribution across positions (guaranteeing keepers and defenders)
  const positionPool: ('GK' | 'DEF' | 'MID' | 'ATT')[] = [
    'GK', 'GK', 'GK', 'GK',
    'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
    'MID', 'MID', 'MID', 'MID', 'MID',
    'ATT', 'ATT', 'ATT', 'ATT', 'ATT',
  ];

  const targetCount = options.count ?? positionPool.length;
  const positionsToGenerate = positionPool.slice(0, targetCount);

  const createdPlayers: any[] = [];

  for (const pos of positionsToGenerate) {
    const country = pickRandomFromArray(systemCountries)!;
    const { firstName, lastName } = generateSystemCountryName(country.name);
    const originLeague = pickRandomFromArray(FOREIGN_LEAGUES);

    // Varied ages: 18 to 34
    const age = randomBetween(18, 34);

    // Varied attribute distributions based on player experience/tier
    // Some are young raw talents (40-65), some in prime (55-80), some experienced (60-82)
    const baseMin = age < 22 ? 30 : age <= 28 ? 42 : 48;
    const baseMax = age < 22 ? 65 : age <= 28 ? 76 : 74;
    const posMin = age < 22 ? 48 : age <= 28 ? 62 : 66;
    const posMax = age < 22 ? 72 : age <= 28 ? 84 : 82;

    const generated = generatePlayer({
      position: pos,
      firstname: firstName,
      lastname: lastName,
      nationality: country.name,
      nationalityId: country.id,
      ageRange: [age, age],
      attributeRange: [baseMin, baseMax],
      positionAttributeRange: [posMin, posMax],
    });

    const [inserted] = await db
      .insert(players)
      .values({
        FirstName: generated.FirstName,
        LastName: generated.LastName,
        NationalityId: country.id,
        Age: generated.Age,
        Position: generated.Position,
        Role: generated.Role,
        Attributes: generated.Attributes,
        Rating: generated.Rating,
        Value: generated.Value,
        Wage: generated.Wage,
        isSigned: false,
        ClubId: null,
        ClubCode: null,
        isRetired: false,
        isTransferListed: false,
        Morale: 'Content',
        Fitness: 100,
        updatedAt: new Date(),
      })
      .returning();

    await db.insert(transferLedger).values({
      Type: 'foreign_intake',
      BuyerClubId: null,
      SellerClubId: null,
      Amount: 0,
      Note: `Arrived from ${originLeague} (${country.name})`,
      updatedAt: new Date(),
    });

    createdPlayers.push({
      ...inserted,
      originLeague,
      countryName: country.name,
    });
  }

  console.log(
    `[foreign-intake] Successfully generated ${createdPlayers.length} overseas players across all positions.`
  );

  return createdPlayers;
}

/**
 * Ensures the free-agent market never dries up.
 * If free-agent goalkeepers < 2 or total free agents < 8, triggers an intake.
 */
export async function ensureFreeAgentMarketStock(): Promise<{ replenished: boolean; added: number }> {
  const db = DrizzleDatabase.getInstance().database;

  const [gkCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .where(and(eq(players.Position, 'GK'), eq(players.isSigned, false), eq(players.isRetired, false)));

  const gkCount = Number(gkCountRow?.count ?? 0);

  const [totalCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .where(and(eq(players.isSigned, false), eq(players.isRetired, false)));

  const totalCount = Number(totalCountRow?.count ?? 0);

  if (gkCount < 2 || totalCount < 8) {
    const recruits = await generateForeignLeagueIntake({
      count: 16,
      reason: 'Low market stock replenishment',
    });
    return { replenished: true, added: recruits.length };
  }

  return { replenished: false, added: 0 };
}
