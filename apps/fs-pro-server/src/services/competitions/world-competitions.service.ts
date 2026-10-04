import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, competitions, places, seasons } from '../../db/drizzle/schema';
import { buildDefinition, type CompetitionDefinitionInput } from './definition';
import { createEdition, publishEdition, tickEditions } from './edition.service';

/**
 * The competitions every world needs so a new club always has something to
 * enter (docs/OPEN-PLAY-COMPETITIONS-SPEC.md: competitions are definitions,
 * and Recurrence keeps them coming back):
 *
 *  - one national Open League per country with clubs, open to that country's
 *    clubs only (created when the country's first club is founded);
 *  - the worldwide Amateur Cup, a knockout for clubs up to Level 2.
 *
 * They are ordinary competitions: the admin can edit, archive or replace
 * them like any other. Everything here is idempotent (keyed by
 * CompetitionCode) and never touches competitions it didn't create.
 */

const db = () => DrizzleDatabase.getInstance().database;

const REGISTRATION_DAYS = 5;

export const AMATEUR_CUP_CODE = 'AMATEUR-CUP';
export const nationalLeagueCode = (countryCode: string) => `NAT-${countryCode.toUpperCase()}`;

function nationalLeague(country: { id: string; Name: string }): CompetitionDefinitionInput {
  return {
    Name: `${country.Name} Open League`,
    Description: `The national league of ${country.Name}. Any club from ${country.Name} can enter. Challenge the clubs near you in the table; the best record after the season wins.`,
    Prestige: 2,
    Entry: { mode: 'open', minClubs: 3, maxClubs: 20, countryIds: [country.id] },
    Stages: [{ type: 'league', days: 24, rules: { minGamesToRank: 4, maxGames: 16, challengeRange: 0 } }],
    Rewards: {
      prizeMoney: [
        { position: 1, amount: 400_000 },
        { position: 2, amount: 200_000 },
        { position: 3, amount: 100_000 },
      ],
      xp: [
        { position: 1, amount: 250 },
        { position: 2, amount: 120 },
        { position: 3, amount: 60 },
      ],
      trophy: `${country.Name} Shield`,
    },
    Recurrence: { everyDays: 30, registrationDays: REGISTRATION_DAYS },
  } as CompetitionDefinitionInput;
}

const AMATEUR_CUP: CompetitionDefinitionInput = {
  Name: 'Amateur Cup',
  Description: 'A knockout for young clubs from anywhere in the world, up to Level 2. One leg, penalties if level.',
  Prestige: 1,
  Entry: { mode: 'open', minClubs: 4, maxClubs: 16, maxLevel: 2 },
  Stages: [{ type: 'knockout', legs: 1, tieDays: 2, seeding: 'random', drawAtEnd: 'penalties' }],
  Rewards: {
    prizeMoney: [
      { position: 1, amount: 250_000 },
      { position: 2, amount: 100_000 },
    ],
    xp: [
      { position: 1, amount: 200 },
      { position: 2, amount: 80 },
    ],
    trophy: 'Amateur Cup',
  },
  Recurrence: { everyDays: 21, registrationDays: REGISTRATION_DAYS },
} as CompetitionDefinitionInput;

async function ensureCompetition(code: string, input: CompetitionDefinitionInput) {
  const [existing] = await db().select().from(competitions).where(eq(competitions.CompetitionCode, code));
  if (existing) return { id: existing.id, created: false };
  const built = buildDefinition(input);
  if (!built.ok) throw new Error(`Bad definition for ${code}: ${JSON.stringify(built.errors)}`);
  const d = built.definition;
  const [row] = await db()
    .insert(competitions)
    .values({
      Name: d.Name,
      Description: d.Description ?? null,
      Type: d.Stages.every((s) => s.type === 'knockout') ? 'Cup' : 'League',
      Prestige: d.Prestige,
      Entry: d.Entry,
      Stages: d.Stages,
      WinCondition: d.WinCondition,
      Rewards: d.Rewards,
      Outcomes: d.Outcomes ?? null,
      Recurrence: d.Recurrence ?? null,
      CompetitionCode: code,
      CompetitionID: code,
      updatedAt: new Date(),
    })
    .returning({ id: competitions.id });
  return { id: row!.id, created: true };
}

/** A first edition, open for entry now, unless one is already on the way. */
export async function ensureLiveEdition(competitionId: string) {
  const [live] = await db()
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.CompetitionId, competitionId), inArray(seasons.Status, ['draft', 'registration', 'running'])))
    .limit(1);
  if (live) return null;
  const [cal] = await db().select({ day: calendars.CurrentDay }).from(calendars).limit(1);
  const today = cal?.day ?? 1;
  const season = await createEdition(competitionId, {
    registrationOpensDay: today,
    registrationClosesDay: today + REGISTRATION_DAYS,
    startDay: today + REGISTRATION_DAYS + 1,
  });
  await publishEdition(season.id);
  // Open registration today rather than waiting for the next world day.
  await tickEditions(today);
  return season.id;
}

/** The national league for `countryId`, with a live edition. */
export async function ensureNationalLeague(countryId: string) {
  const [country] = await db().select().from(places).where(eq(places.id, countryId));
  if (!country || country.Type !== 'country') return null;
  const { id, created } = await ensureCompetition(nationalLeagueCode(country.Code), nationalLeague({ id: country.id, Name: country.Name }));
  const edition = await ensureLiveEdition(id);
  return { competitionId: id, created, edition };
}

export async function ensureAmateurCup() {
  const { id, created } = await ensureCompetition(AMATEUR_CUP_CODE, AMATEUR_CUP);
  const edition = await ensureLiveEdition(id);
  return { competitionId: id, created, edition };
}

/** Every country with at least `minClubs` clubs gets its league; plus the Amateur Cup. */
export async function ensureWorldCompetitions(minClubs = 3) {
  const counts = await db()
    .select({ country: clubs.AddressCountryId, n: sql<number>`count(*)::int` })
    .from(clubs)
    .groupBy(clubs.AddressCountryId);
  const out = [];
  for (const { country, n } of counts) {
    if (country && n >= minClubs) out.push({ country, ...(await ensureNationalLeague(country)) });
  }
  return { leagues: out, amateurCup: await ensureAmateurCup() };
}
