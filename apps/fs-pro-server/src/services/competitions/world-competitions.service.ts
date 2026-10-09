import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, competitions, places, seasons } from '../../db/drizzle/schema';
import { buildDefinition, type CompetitionDefinitionInput } from './definition';
import { createEdition, publishEdition, tickEditions } from './edition.service';
import { DEFAULT_PYRAMID_STAGE, countriesWithClubs, drawPyramid, joinPyramid, runningPyramid, type DrawSummary, type JoinedPool } from './pyramid.service';

/**
 * The competitions every world needs so a new club always has something to
 * play (docs/WORLD-PYRAMID-SPEC.md):
 *
 *  - one pyramid league per country with clubs (pyramid.service.ts), drawn
 *    each Year and joined mid-season by new clubs;
 *  - the worldwide Amateur Cup, a knockout for clubs up to Level 2, on cup
 *    days, kept coming back by its Recurrence.
 *
 * They are ordinary competitions: the admin can edit, archive or replace
 * them like any other. Everything here is idempotent (keyed by
 * CompetitionCode) and never touches competitions it didn't create.
 */

const db = () => DrizzleDatabase.getInstance().database;

const REGISTRATION_DAYS = 5;

export const AMATEUR_CUP_CODE = 'AMATEUR-CUP';
/** Code of a country's pyramid league. (The open-play national leagues
 * used NAT-<code>; the pyramid replaced them.) */
export const nationalLeagueCode = (countryCode: string) => `PYR-${countryCode.toUpperCase()}`;

function nationalLeague(country: { id: string; Name: string }): CompetitionDefinitionInput {
  return {
    Name: `${country.Name} League`,
    Description: `The football pyramid of ${country.Name}. Every club in ${country.Name} plays here: pools of local rivals, a full fixture list each year, the top two of every pool go up and the bottom two go down.`,
    Prestige: 3,
    Entry: { mode: 'invite', minClubs: 2, maxClubs: null, countryIds: [country.id] },
    Stages: [DEFAULT_PYRAMID_STAGE],
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
    Recurrence: null,
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
  // Race-safe: two concurrent owners reaching Level 1 in the same country both
  // try to create the league (L2 trigger). ON CONFLICT keeps exactly one row;
  // the loser re-reads it.
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
    // No target: both CompetitionCode and CompetitionID are unique, and a
    // concurrent create can trip either index.
    .onConflictDoNothing()
    .returning({ id: competitions.id });
  if (row) return { id: row.id, created: true };
  const [again] = await db().select({ id: competitions.id }).from(competitions).where(eq(competitions.CompetitionCode, code));
  if (!again) throw new Error(`Competition ${code} vanished after a create race`);
  return { id: again.id, created: false };
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

/** The pyramid league competition of `countryId` (created once). */
export async function ensureNationalLeague(countryId: string) {
  const [country] = await db().select().from(places).where(eq(places.id, countryId));
  if (!country || country.Type !== 'country') return null;
  return ensureCompetition(nationalLeagueCode(country.Code), nationalLeague({ id: country.id, Name: country.Name }));
}

/**
 * Put a newly founded club into its country's pyramid: a spare slot of the
 * running edition, or a fresh draw (from today to the year's end) when the
 * country has none yet, which places the club along with everyone else.
 */
export async function placeInPyramid(clubId: string, countryId: string): Promise<JoinedPool | DrawSummary | null> {
  const league = await ensureNationalLeague(countryId);
  if (!league) return null;
  if (await runningPyramid(league.id)) return joinPyramid(league.id, clubId);
  const [cal] = await db().select({ day: calendars.CurrentDay }).from(calendars).limit(1);
  return (await drawPyramid(league.id, { fromDay: (cal?.day ?? 0) + 1 })) ?? joinPyramid(league.id, clubId);
}

/** Year end: a fresh draw for every country with clubs. */
export async function drawAllPyramids() {
  const out: DrawSummary[] = [];
  for (const { countryId } of await countriesWithClubs()) {
    if (!countryId) continue;
    try {
      const league = await ensureNationalLeague(countryId);
      if (!league) continue;
      const drawn = await drawPyramid(league.id);
      if (drawn) out.push(drawn);
    } catch (err) {
      console.error(`[pyramid] draw for country ${countryId} failed`, err);
    }
  }
  return out;
}

export async function ensureAmateurCup() {
  const { id, created } = await ensureCompetition(AMATEUR_CUP_CODE, AMATEUR_CUP);
  const edition = await ensureLiveEdition(id);
  return { competitionId: id, created, edition };
}

/** Every country with clubs gets its pyramid (drawn if none is running);
 * plus the Amateur Cup. */
export async function ensureWorldCompetitions() {
  const leagues = await drawAllPyramids();
  return { leagues, amateurCup: await ensureAmateurCup() };
}
