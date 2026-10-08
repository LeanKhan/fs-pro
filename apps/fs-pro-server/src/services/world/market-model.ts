import { managerFee, managerWage } from '../program/manager-model';

/**
 * Pure model for the seeded free-agent market (phase-2 OWNER-PROGRAM-SPEC §5.2,
 * §5.3, §6.1-§6.3). No DB and no `Math.random`: every function takes an
 * explicit RNG so the seed job is reproducible per (seed, index). Table-tested
 * in `test/market-model.test.ts`.
 *
 * Rating = weighted average of attributes (role weights sum to ~1.00,
 * `interfaces/Player.ts` AllMultipliers), so attributes drawn inside a band
 * produce a Rating inside that band - no rejection loop needed for the
 * histogram to be honest.
 */

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) - small, fast, good enough for seed data. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable per-index RNG: `mulberry32(seed ^ hash(index))`. */
export function rngForIndex(seed: number, index: number): Rng {
  // Mix the index well enough that consecutive indices don't correlate.
  let h = (seed >>> 0) ^ Math.imul(index + 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return mulberry32(h);
}

export interface Band {
  min: number;
  max: number;
  /** Relative weight; weights need not sum to 100. */
  weight: number;
}

/** Free-agent player Rating histogram (spec §6.1), 5,000 players. */
export const PLAYER_RATING_BANDS: readonly Band[] = [
  { min: 45, max: 49, weight: 12.0 },
  { min: 50, max: 54, weight: 22.0 },
  { min: 55, max: 59, weight: 26.0 },
  { min: 60, max: 64, weight: 20.0 },
  { min: 65, max: 69, weight: 12.0 },
  { min: 70, max: 74, weight: 5.0 },
  { min: 75, max: 79, weight: 2.5 },
  { min: 80, max: 84, weight: 0.4 },
  { min: 85, max: 88, weight: 0.1 },
];

/** Manager Overall histogram (spec §6.1), 1,000 managers. */
export const MANAGER_OVERALL_BANDS: readonly Band[] = [
  { min: 45, max: 49, weight: 14 },
  { min: 50, max: 54, weight: 24 },
  { min: 55, max: 59, weight: 27 },
  { min: 60, max: 64, weight: 17 },
  { min: 65, max: 69, weight: 11 },
  { min: 70, max: 74, weight: 5 },
  { min: 75, max: 84, weight: 2 },
];

/** Age histogram (spec §6.1), both pools. */
export const AGE_BANDS: readonly Band[] = [
  { min: 18, max: 20, weight: 12 },
  { min: 21, max: 24, weight: 20 },
  { min: 25, max: 28, weight: 22 },
  { min: 29, max: 31, weight: 16 },
  { min: 32, max: 34, weight: 12 },
  { min: 35, max: 39, weight: 16 },
];

/** Position split (spec §6.1): GK 10, DEF 34, MID 34, ATT 22. */
export const POSITION_WEIGHTS: Record<string, number> = {
  GK: 10,
  DEF: 34,
  MID: 34,
  ATT: 22,
};

/** Managers are players + 12 years, clipped to a working age (spec §6.1). */
export const MANAGER_AGE_OFFSET = 12;
export const MANAGER_MIN_AGE = 30;
export const MANAGER_MAX_AGE = 65;

/** The free-agent Value curve (spec §5.2). */
const PLAYER_PRICE: readonly { min: number; base: number }[] = [
  { min: 85, base: 12_000_000 },
  { min: 80, base: 6_500_000 },
  { min: 75, base: 3_200_000 },
  { min: 70, base: 1_600_000 },
  { min: 65, base: 750_000 },
  { min: 60, base: 320_000 },
  { min: 55, base: 120_000 },
  { min: 50, base: 55_000 },
  { min: 45, base: 25_000 },
];

function ageMultiplier(age: number): number {
  if (age <= 20) return 1.3;
  if (age <= 24) return 1.2;
  if (age <= 28) return 1.0;
  if (age <= 31) return 0.75;
  if (age <= 34) return 0.5;
  return 0.3;
}

/** `round(PRICE[band(rating)] * AGE_MULT[band(age)])` (spec §5.2). */
export function freeAgentValue(rating: number, age: number): number {
  const base = PLAYER_PRICE.find((p) => rating >= p.min)?.base ?? PLAYER_PRICE[PLAYER_PRICE.length - 1]!.base;
  return Math.round(base * ageMultiplier(age));
}

/** Player Wage = `round(Value * 0.15)` (spec §5.2 / utils/players.ts:46). */
export const WAGE_RATIO = 0.15;
export function freeAgentWage(value: number): number {
  return Math.round(value * WAGE_RATIO);
}

export { managerFee, managerWage };

/** Pick a band by relative weight. */
export function pickBand<T extends Band>(rng: Rng, bands: readonly T[]): T {
  const total = bands.reduce((s, b) => s + b.weight, 0);
  let roll = rng() * total;
  for (const band of bands) {
    roll -= band.weight;
    if (roll < 0) return band;
  }
  return bands[bands.length - 1]!;
}

/** Pick a key by relative weight (e.g. a position). */
export function pickWeightedKey(rng: Rng, weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1]![0];
}

/** Uniform integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function managerAgeFrom(playerAge: number): number {
  return Math.min(MANAGER_MAX_AGE, Math.max(MANAGER_MIN_AGE, playerAge + MANAGER_AGE_OFFSET));
}

/** Target counts per band for `total` draws (for the report histograms). */
export function expectedCounts(bands: readonly Band[], total: number): number[] {
  const sum = bands.reduce((s, b) => s + b.weight, 0);
  return bands.map((b) => Math.round((b.weight / sum) * total));
}
