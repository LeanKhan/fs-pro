import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { PLAN_FORMATIONS, STYLE_KEYS } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, managers, places, players, worldSeed } from '../../db/drizzle/schema';
import { generatePlayer } from '../../utils/players';
import { managerFee, managerOverall, managerWage } from '../program/manager-model';
import { generatePersonNames, type PersonName } from '../worldgen/names.service';
import {
  AGE_BANDS,
  MANAGER_OVERALL_BANDS,
  PLAYER_RATING_BANDS,
  POSITION_WEIGHTS,
  freeAgentValue,
  freeAgentWage,
  managerAgeFrom,
  pickBand,
  pickWeightedKey,
  randInt,
  rngForIndex,
  type Band,
  type Rng,
} from './market-model';

/**
 * The idempotent world seed (phase-2 L5; OWNER-PROGRAM-SPEC §6). It tops the
 * free-agent market up to 5,000 players and 1,000 managers, spread across the
 * starting countries by population weight, named by each country's worldgen
 * culture mix, with skill/age drawn from the spec's distributions and the §5.2
 * price/wage curve.
 *
 * It is safe to re-run: it counts the existing unsigned pool and only generates
 * the shortfall, under an advisory lock, so a second run is a no-op. Each
 * founding then restocks its country's pool (a squad's worth of players and one
 * manager, idempotent per club), and year-end expiry retires unsigned veterans
 * so the pool stays bounded. Running this on the dev DB `fspro` is a release
 * step; all program runs use scratch databases (PROGRESS.md Environment).
 */

const db = () => DrizzleDatabase.getInstance().database;

export const SEED_KEY = 'free_agents_v1';
export const TARGET_FREE_AGENTS = 5_000;
export const TARGET_FREE_MANAGERS = 1_000;
/** Hard ceiling on the unsigned pool so a founding burst cannot explode it. */
export const MAX_FREE_AGENTS = 8_000;
export const RESTOCK_PLAYERS = 6;
export const RESTOCK_MANAGERS = 1;
/** Unsigned players retire after this many game days in the pool (spec §6.4). */
export const FREE_AGENT_TTL_DAYS = 84;
/** Age at which an unsigned free-agent manager leaves the pool. */
export const MANAGER_RETIRE_AGE = 70;

/** Population weights by worldgen country key (spec §6.2). The DB rows are
 * matched to these by code/name/fullname - the seed never hard-codes a uuid. */
interface StartingCountry {
  key: string;
  weight: number;
  matches: string[];
}

export const STARTING_COUNTRIES: readonly StartingCountry[] = [
  { key: 'bellean', weight: 22, matches: ['bellean', 'bel'] },
  { key: 'kev', weight: 20, matches: ['kev'] },
  { key: 'ekhastan', weight: 12, matches: ['ekhastan', 'ekastan', 'ekh'] },
  // UPP carries Galli's 0.5 (STARTER names Galli as a separate Inga country,
  // but it has no Places row; its players fall back to UPP - spec §6.2).
  { key: 'upp', weight: 12.5, matches: ['upp', 'palaba', 'united provinces of palaba', 'galli'] },
  { key: 'ashter', weight: 8, matches: ['ashter', 'ash'] },
  { key: 'simeone', weight: 8, matches: ['simeone', 'simeon', 'leg'] },
  { key: 'kiyoto', weight: 8, matches: ['kiyoto', 'kiy'] },
  { key: 'hunteerland', weight: 5, matches: ['hunteerland', 'hunterland', 'hun'] },
  { key: 'proland', weight: 3, matches: ['proland', 'pro'] },
  { key: 'pregge', weight: 1.5, matches: ['pregge', 'prg'] },
];

interface CountryRow {
  id: string;
  Code: string;
  Name: string;
  Fullname: string;
}

export interface ResolvedCountry extends CountryRow {
  key: string;
  weight: number;
}

function specForCountry(row: CountryRow): StartingCountry | null {
  const name = row.Name.toLowerCase();
  const code = row.Code.toLowerCase();
  const full = row.Fullname.toLowerCase();
  return (
    STARTING_COUNTRIES.find(
      (s) =>
        s.matches.includes(name) ||
        s.matches.includes(code) ||
        s.matches.some((m) => full.endsWith(` ${m}`))
    ) ?? null
  );
}

/** Resolve the DB's country rows to the spec's weighted starting countries. */
export async function resolveStartingCountries(): Promise<ResolvedCountry[]> {
  const rows = await db()
    .select({ id: places.id, Code: places.Code, Name: places.Name, Fullname: places.Fullname })
    .from(places)
    .where(eq(places.Type, 'country'));
  const out: ResolvedCountry[] = [];
  for (const row of rows) {
    const spec = specForCountry(row);
    if (spec) out.push({ ...row, key: spec.key, weight: spec.weight });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Allocate `total` items across countries by weight (largest-remainder). */
export function allocateByWeight(countries: ResolvedCountry[], total: number): { country: ResolvedCountry; count: number }[] {
  const weightSum = countries.reduce((s, c) => s + c.weight, 0);
  if (!countries.length || weightSum <= 0 || total <= 0) return [];
  const exact = countries.map((c) => ({ country: c, value: (c.weight / weightSum) * total }));
  const base = exact.map((e) => ({ ...e, count: Math.floor(e.value) }));
  // Hand the rounding remainder to the largest fractional parts first.
  const byFraction = [...base].sort((a, b) => (b.value - b.count) - (a.value - a.count));
  let assigned = base.reduce((s, e) => s + e.count, 0);
  for (const e of byFraction) {
    if (assigned >= total) break;
    e.count++;
    assigned++;
  }
  return base;
}

/** Run `fn` with `Math.random` replaced by a seeded RNG (the real
 * `generatePlayer` is not rng-injectable; the seed job is single-threaded, so
 * this keeps its output deterministic per index without touching that code). */
function withRng<T>(rng: Rng, fn: () => T): T {
  const original = Math.random;
  Math.random = rng as () => number;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

interface PlayerRow {
  FirstName: string;
  LastName: string;
  NationalityId: string;
  Age: number;
  Position: string;
  Role: string;
  Attributes: Record<string, unknown>;
  Rating: number;
  Value: number;
  Wage: number;
  isSigned: false;
  isRetired: false;
  FreeAgentSince: number;
  Morale: string;
  Fitness: number;
  updatedAt: Date;
}

function buildFreeAgentPlayer(
  index: number,
  name: PersonName,
  nationalityId: string,
  currentDay: number,
  rngSeed: number
): PlayerRow {
  const rng = rngForIndex(rngSeed, index);
  const band = pickBand(rng, PLAYER_RATING_BANDS);
  const ageBand = pickBand(rng, AGE_BANDS);
  const age = randInt(rng, ageBand.min, ageBand.max);
  const position = pickWeightedKey(rng, POSITION_WEIGHTS);
  const generated = withRng(rng, () =>
    generatePlayer({
      position,
      firstname: name.firstName,
      lastname: name.lastName,
      nationality: '',
      nationalityId,
      ageRange: [age, age],
      attributeRange: [band.min, band.max],
      positionAttributeRange: [band.min, band.max],
    })
  );
  const rating = Math.round(generated.Rating);
  const value = freeAgentValue(rating, age);
  return {
    FirstName: name.firstName,
    LastName: name.lastName,
    NationalityId: nationalityId,
    Age: age,
    Position: generated.Position,
    Role: generated.Role,
    Attributes: generated.Attributes as unknown as Record<string, unknown>,
    Rating: rating,
    Value: value,
    Wage: freeAgentWage(value),
    isSigned: false,
    isRetired: false,
    // Stagger the entry day so year-end expiry does not cliff (spec §6.4).
    FreeAgentSince: currentDay - Math.floor(rng() * FREE_AGENT_TTL_DAYS),
    Morale: 'Content',
    Fitness: 100,
    updatedAt: new Date(),
  };
}

interface ManagerRow {
  Key: string;
  FirstName: string;
  LastName: string;
  Age: number;
  NationalityId: string;
  PreferredFormation: string;
  PreferredStyle: string;
  Tactics: number;
  Motivation: number;
  Development: number;
  Discipline: number;
  Overall: number;
  SigningFee: number;
  Wage: number;
  isEmployed: false;
  ClubId: null;
  ContractYears: 0;
  updatedAt: Date;
}

function buildFreeAgentManager(index: number, name: PersonName, nationalityId: string, rngSeed: number): ManagerRow {
  const rng = rngForIndex(rngSeed, index);
  const band = pickBand(rng, MANAGER_OVERALL_BANDS);
  const tactics = randInt(rng, band.min, band.max);
  const motivation = randInt(rng, band.min, band.max);
  const development = randInt(rng, band.min, band.max);
  const discipline = randInt(rng, band.min, band.max);
  const overall = managerOverall({ tactics, motivation, development, discipline });
  const fee = managerFee(overall);
  const playerAge = randInt(rng, AGE_BANDS[0]!.min, AGE_BANDS[AGE_BANDS.length - 1]!.max);
  return {
    Key: `seed-mgr-${randomUUID()}`,
    FirstName: name.firstName,
    LastName: name.lastName,
    Age: managerAgeFrom(playerAge),
    NationalityId: nationalityId,
    PreferredFormation: PLAN_FORMATIONS[randInt(rng, 0, PLAN_FORMATIONS.length - 1)]!,
    PreferredStyle: STYLE_KEYS[randInt(rng, 0, STYLE_KEYS.length - 1)]!,
    Tactics: tactics,
    Motivation: motivation,
    Development: development,
    Discipline: discipline,
    Overall: overall,
    SigningFee: fee,
    Wage: managerWage(overall),
    isEmployed: false,
    ClubId: null,
    ContractYears: 0,
    updatedAt: new Date(),
  };
}

async function insertPlayers(rows: PlayerRow[]): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db().insert(players).values(rows.slice(i, i + CHUNK) as never);
  }
}

async function insertManagers(rows: ManagerRow[]): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db().insert(managers).values(rows.slice(i, i + CHUNK) as never);
  }
}

/** The founding country row itself, with the worldgen key to name from. Works
 * for any country (including user-founded ones, whose names worldgen will not
 * resolve and whose names.service fallback takes over). */
async function countryById(id: string): Promise<{ id: string; key: string } | null> {
  const [row] = await db()
    .select({ id: places.id, Code: places.Code, Name: places.Name, Fullname: places.Fullname })
    .from(places)
    .where(eq(places.id, id))
    .limit(1);
  if (!row) return null;
  const spec = specForCountry(row);
  return { id: row.id, key: spec?.key ?? row.Name };
}

async function currentDay(): Promise<number> {
  const [cal] = await db().select({ day: calendars.CurrentDay }).from(calendars).limit(1);
  return cal?.day ?? 0;
}

/** `count(*)` of unsigned, non-retired players (the market's supply). */
export async function freeAgentPlayerCount(): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(players)
    .where(and(eq(players.isSigned, false), eq(players.isRetired, false)));
  return Number(row?.n ?? 0);
}

/** `count(*)` of unsigned free-agent managers. */
export async function freeAgentManagerCount(): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(managers)
    .where(
      and(eq(managers.isEmployed, false), isNull(managers.ClubId), sql`${managers.Age} < ${MANAGER_RETIRE_AGE}`)
    );
  return Number(row?.n ?? 0);
}

export interface SeedResult {
  playersAdded: number;
  managersAdded: number;
  playerTotal: number;
  managerTotal: number;
}

/**
 * Top the market up to the targets. Idempotent: counts the existing pool and
 * only fills the difference, under an advisory lock so concurrent runs cannot
 * double-insert.
 */
export async function seedFreeAgentMarket(options: { rngSeed?: number } = {}): Promise<SeedResult> {
  const rngSeed = options.rngSeed ?? 20261008;
  const day = await currentDay();

  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`world_seed:${SEED_KEY}`}))`);

    const [playerCountRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(players)
      .where(and(eq(players.isSigned, false), eq(players.isRetired, false)));
    const existingPlayers = Number(playerCountRow?.n ?? 0);
    const [managerCountRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(managers)
      .where(and(eq(managers.isEmployed, false), isNull(managers.ClubId)));
    const existingManagers = Number(managerCountRow?.n ?? 0);

    const countries = await resolveStartingCountries();
    if (!countries.length) throw new Error('No starting countries in Places - cannot seed the market');

    // ---- players ----------------------------------------------------------
    const needPlayers = Math.max(0, TARGET_FREE_AGENTS - existingPlayers);
    const playerAlloc = allocateByWeight(countries, needPlayers);
    let playerIndex = 0;
    const playerRows: PlayerRow[] = [];
    for (const { country, count } of playerAlloc) {
      if (count <= 0) continue;
      const names = await generatePersonNames(country.key, count, rngSeed + playerIndex);
      for (let i = 0; i < count; i++) {
        const name = names[i] ?? names[names.length - 1]!;
        playerRows.push(buildFreeAgentPlayer(playerIndex, name, country.id, day, rngSeed));
        playerIndex++;
      }
    }
    const CHUNK = 300;
    for (let i = 0; i < playerRows.length; i += CHUNK) {
      await tx.insert(players).values(playerRows.slice(i, i + CHUNK) as never);
    }

    // ---- managers ---------------------------------------------------------
    const needManagers = Math.max(0, TARGET_FREE_MANAGERS - existingManagers);
    const managerAlloc = allocateByWeight(countries, needManagers);
    let managerIndex = 0;
    const managerRows: ManagerRow[] = [];
    for (const { country, count } of managerAlloc) {
      if (count <= 0) continue;
      const names = await generatePersonNames(country.key, count, rngSeed + 100_000 + managerIndex);
      for (let i = 0; i < count; i++) {
        const name = names[i] ?? names[names.length - 1]!;
        managerRows.push(buildFreeAgentManager(managerIndex, name, country.id, rngSeed));
        managerIndex++;
      }
    }
    for (let i = 0; i < managerRows.length; i += CHUNK) {
      await tx.insert(managers).values(managerRows.slice(i, i + CHUNK) as never);
    }

    await tx
      .insert(worldSeed)
      .values({ Key: SEED_KEY, Version: 1, AppliedAt: new Date() })
      .onConflictDoUpdate({ target: worldSeed.Key, set: { Version: 1, AppliedAt: new Date() } });

    return {
      playersAdded: playerRows.length,
      managersAdded: managerRows.length,
      playerTotal: existingPlayers + playerRows.length,
      managerTotal: existingManagers + managerRows.length,
    };
  });
}

/**
 * Restock a country's pool after a club is founded (L5 default: a squad's
 * worth of players and one manager). Idempotent per club via the `WorldSeed`
 * ledger (`restock:<clubId>`); skipped when the global pool is at its cap so a
 * 10k-founding burst cannot explode the market.
 */
export async function restockAfterFounding(
  clubId: string,
  countryId: string | null
): Promise<{ players: number; managers: number; skipped: boolean }> {
  const key = `restock:${clubId}`;
  const claimed = await db()
    .insert(worldSeed)
    .values({ Key: key, Version: 1, AppliedAt: new Date() })
    .onConflictDoNothing()
    .returning({ key: worldSeed.Key });
  if (!claimed.length) return { players: 0, managers: 0, skipped: true };

  const current = await freeAgentPlayerCount();
  if (current >= MAX_FREE_AGENTS) return { players: 0, managers: 0, skipped: true };

  // Restock the country the club was founded in (not a spec-only lookup, so a
  // user-founded country is restocked too).
  const country = countryId
    ? await countryById(countryId)
    : (await resolveStartingCountries())[0] ?? null;
  if (!country) return { players: 0, managers: 0, skipped: true };

  const day = await currentDay();
  const rngSeed = 0x5eed ^ (clubId.length * 2654435761);
  const toAdd = Math.min(RESTOCK_PLAYERS, MAX_FREE_AGENTS - current);
  const names = await generatePersonNames(country.key, toAdd + RESTOCK_MANAGERS, rngSeed);
  const playerRows = Array.from({ length: toAdd }, (_, i) =>
    buildFreeAgentPlayer(i, names[i] ?? names[0]!, country.id, day, rngSeed)
  );
  if (playerRows.length) await insertPlayers(playerRows);
  const managerRows = Array.from({ length: RESTOCK_MANAGERS }, (_, i) =>
    buildFreeAgentManager(i, names[toAdd + i] ?? names[0]!, country.id, rngSeed)
  );
  if (managerRows.length) await insertManagers(managerRows);
  return { players: playerRows.length, managers: managerRows.length, skipped: false };
}

/**
 * Year-end expiry (spec §6.4): unsigned players who have been in the pool for
 * `FREE_AGENT_TTL_DAYS` are marked retired (never deleted). Managers have no
 * retired flag, so `freeAgentManagerCount` excludes over-age ones instead and
 * the manager pool is bounded by the restock cap. Wired into `year.service.ts`.
 */
export async function expireFreeAgents(day: number): Promise<{ players: number; managers: number }> {
  const retiredPlayers = await db()
    .update(players)
    .set({ isRetired: true, updatedAt: new Date() })
    .where(
      and(
        eq(players.isSigned, false),
        eq(players.isRetired, false),
        sql`${players.FreeAgentSince} IS NOT NULL AND ${day} - ${players.FreeAgentSince} >= ${FREE_AGENT_TTL_DAYS}`
      )
    )
    .returning({ id: players.id });

  return { players: retiredPlayers.length, managers: 0 };
}

/** Rating histogram of the unsigned pool (the seed report). */
export async function freeAgentHistogram(): Promise<{ bucket: string; count: number }[]> {
  const rows = await db()
    .select({ rating: players.Rating })
    .from(players)
    .where(and(eq(players.isSigned, false), eq(players.isRetired, false)));
  return histogramize(rows.map((r) => Math.floor(r.rating ?? 0)), PLAYER_RATING_BANDS);
}

/** Overall histogram of the free-agent managers. */
export async function managerHistogram(): Promise<{ bucket: string; count: number }[]> {
  const rows = await db()
    .select({ overall: managers.Overall })
    .from(managers)
    .where(and(eq(managers.isEmployed, false), isNull(managers.ClubId)));
  return histogramize(rows.map((r) => Math.floor(r.overall ?? 0)), MANAGER_OVERALL_BANDS);
}

function histogramize(values: number[], bands: readonly Band[]): { bucket: string; count: number }[] {
  const counts = bands.map((b) => ({ bucket: `${b.min}-${b.max}`, count: 0 }));
  for (const v of values) {
    const idx = bands.findIndex((b) => v >= b.min && v <= b.max);
    if (idx >= 0) counts[idx]!.count++;
  }
  return counts;
}
