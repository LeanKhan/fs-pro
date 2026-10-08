import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { places } from '../../db/drizzle/schema';
import { generateMixedNames, generateNames } from './client';

/**
 * The **one** Node module that talks to worldgen for names (phase-2 L12,
 * CULTURES-SPEC §9). Every caller that used to own a syllable table or a
 * placeholder pool goes through here:
 *
 * - youth intake (`player-lifecycle.service.ts`),
 * - foreign intake (`foreign-intake.service.ts`),
 * - founding place names (`club-founding.service.ts`),
 * - the world seed (`world-seed.service.ts`).
 *
 * Fallback rule (L12): worldgen is tried first; only when it is **down** does
 * this module fall back to a local frozen pool, and that fallback is **logged**
 * once per function per process - never silently. The old Node syllable tables
 * and placeholder pools were deleted; the frozen pool below is the only
 * surviving copy, and only this module can reach it.
 *
 * `countryIdForCulture`/`cultureForCountry` do not call worldgen: the culture
 * is already cached on `Places.CultureId` (migration 0043 + founding
 * assignment), so the DB is the single store Node reads. No new worldgen HTTP
 * surface is needed for them.
 */

export interface PersonName {
  firstName: string;
  lastName: string;
}

/** Frozen fallback pool (the retired `utils/placeholder-names.ts`), only
 * reachable when worldgen is down. Kept small and local on purpose. */
const FALLBACK_FIRST_NAMES = [
  'Aiden', 'Beckett', 'Callum', 'Dorian', 'Elio', 'Finnegan', 'Gideon',
  'Hartley', 'Idris', 'Jasper', 'Kellan', 'Lior', 'Marcus', 'Nolan',
  'Oisin', 'Percy', 'Quinlan', 'Reuben', 'Silas', 'Tobias', 'Ulric',
  'Vance', 'Wesley', 'Xavier', 'Yusuf', 'Zane', 'Amos', 'Brendan',
  'Cyrus', 'Declan',
];
const FALLBACK_LAST_NAMES = [
  'Ashworth', 'Blackwood', 'Carrow', 'Dunmore', 'Ellery', 'Fairweather',
  'Gantry', 'Halloway', 'Ivester', 'Jorvik', 'Kestrel', 'Lockhart',
  'Marrow', 'Norwick', 'Osgood', 'Pembrook', 'Quarrington', 'Ravenscar',
  'Stonebridge', 'Thackery', 'Underhill', 'Vexley', 'Wrenfield',
  'Yardley', 'Ashgrove', 'Blythe', 'Corvin', 'Draven', 'Everhart',
  'Fenwick',
];

const warned = new Set<string>();
/** After a failure, skip the network for this long. The world seed/restock
 * calls names.service thousands of times; when worldgen is down we must not
 * pay a failed connection per call (the 100k founding benchmark). */
const DOWN_COOLDOWN_MS = 5_000;
let downUntil = 0;

function worldgenDown(): boolean {
  return Date.now() < downUntil;
}

/** Log a fallback exactly once per function per process (L12). */
function logFallbackOnce(fn: string, err: unknown) {
  if (!warned.has(fn)) {
    warned.add(fn);
    console.warn(`[worldgen] down; ${fn} falling back (${err instanceof Error ? err.message : String(err)})`);
  }
  downUntil = Date.now() + DOWN_COOLDOWN_MS;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function fallbackPersonNames(count: number): PersonName[] {
  return Array.from({ length: count }, () => ({
    firstName: pick(FALLBACK_FIRST_NAMES),
    lastName: pick(FALLBACK_LAST_NAMES),
  }));
}

/** `"first__last"` (worldgen's split marker) or a plain spaced name. */
export function splitFullName(full: string): PersonName {
  const [first, ...rest] = full.split('__');
  if (rest.length) return { firstName: first!.trim(), lastName: rest.join('__').trim() };
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? full, lastName: parts.slice(1).join(' ') };
}

/**
 * Generate `count` person names from a country's culture mix. Used by the
 * world seed and the foreign intake.
 */
export async function generatePersonNames(
  country: string,
  count: number,
  seed?: number
): Promise<PersonName[]> {
  if (count <= 0) return [];
  if (worldgenDown()) return fallbackPersonNames(count);
  try {
    const { names } = await generateMixedNames(country, count, 'full', seed);
    const parsed = names.map(splitFullName).filter((n) => n.firstName);
    if (parsed.length) return parsed;
    // worldgen answered but produced nothing usable - treat as a soft failure.
    return fallbackPersonNames(count);
  } catch (err) {
    logFallbackOnce('generatePersonNames', err);
    return fallbackPersonNames(count);
  }
}

/** Generate `count` person names from one explicit culture (no mix). */
export async function generatePersonNamesForCulture(
  culture: string,
  count: number,
  seed?: number
): Promise<PersonName[]> {
  if (count <= 0) return [];
  if (worldgenDown()) return fallbackPersonNames(count);
  try {
    const names = await generateNames(count, culture, 'f_l');
    const parsed = names.map(splitFullName).filter((n) => n.firstName);
    if (parsed.length) return parsed;
    return fallbackPersonNames(count);
  } catch (err) {
    logFallbackOnce('generatePersonNamesForCulture', err);
    return fallbackPersonNames(count);
  }
}

/**
 * A generated place name of `kind` for a country's culture. Founding uses this
 * for the auto district name; the caller supplies a deterministic local
 * fallback so an offline worldgen cannot break founding.
 */
export async function generatePlaceName(
  country: string,
  kind: 'region' | 'city' | 'district',
  fallback: () => string
): Promise<string> {
  if (worldgenDown()) return fallback();
  try {
    const { names } = await generateMixedNames(country, 1, kind);
    if (names[0]?.trim()) return names[0].trim();
    return fallback();
  } catch (err) {
    logFallbackOnce('generatePlaceName', err);
    return fallback();
  }
}

/** Reset the logged-once state and the down cooldown (tests). */
export function resetFallbackLog(): void {
  warned.clear();
  downUntil = 0;
}

const db = () => DrizzleDatabase.getInstance().database;

interface CountryRow {
  id: string;
  Code: string;
  Name: string;
  Fullname: string;
  CultureId: string | null;
}

let countryCache: { rows: CountryRow[]; at: number } | null = null;
const COUNTRY_CACHE_MS = 60_000;

/** Countries are few and rarely change; cache them briefly so the seed's
 * 5,000-player loop does not read Places once per player. */
async function loadCountries(): Promise<CountryRow[]> {
  if (countryCache && Date.now() - countryCache.at < COUNTRY_CACHE_MS) return countryCache.rows;
  const rows = await db()
    .select({ id: places.id, Code: places.Code, Name: places.Name, Fullname: places.Fullname, CultureId: places.CultureId })
    .from(places)
    .where(eq(places.Type, 'country'));
  countryCache = { rows, at: Date.now() };
  return rows;
}

/** Clear the country cache (tests / after founding). */
export function resetCountryCache(): void {
  countryCache = null;
}

/**
 * The local country row for a name-generation culture (replaces the retired
 * `services/nationality.ts`). Prefers the country whose `CultureId` matches;
 * otherwise matches Code/Name/Fullname, exactly like the old helper but with no
 * hard-coded legacy uuids. Returns null when the world has no such country.
 */
export async function countryIdForCulture(culture: string): Promise<string | null> {
  const key = culture.trim().toLowerCase();
  if (!key) return null;
  const countries = await loadCountries();
  return (
    countries.find((c) => c.CultureId?.toLowerCase() === key)?.id ??
    countries.find((c) => c.Code.toLowerCase() === key || c.Name.toLowerCase() === key)?.id ??
    countries.find((c) => c.Fullname.toLowerCase().endsWith(` ${key}`))?.id ??
    null
  );
}

/**
 * The worldgen culture id of a country, read from the `Places` culture cache
 * (migration 0043 / founding). `null` for a user-founded country with no
 * culture yet - callers already tolerate a null nationality.
 */
export async function cultureForCountry(country: string): Promise<string | null> {
  const key = country.trim().toLowerCase();
  if (!key) return null;
  const countries = await loadCountries();
  const match =
    countries.find((c) => c.Code.toLowerCase() === key || c.Name.toLowerCase() === key) ??
    countries.find((c) => c.Fullname.toLowerCase().endsWith(` ${key}`));
  return match?.CultureId ?? null;
}
