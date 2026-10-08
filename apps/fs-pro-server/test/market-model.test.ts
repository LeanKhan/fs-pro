import { describe, it, expect } from 'vitest';
import {
  AGE_BANDS,
  MANAGER_OVERALL_BANDS,
  PLAYER_RATING_BANDS,
  POSITION_WEIGHTS,
  expectedCounts,
  freeAgentValue,
  freeAgentWage,
  managerAgeFrom,
  mulberry32,
  pickBand,
  pickWeightedKey,
  randInt,
  rngForIndex,
} from '../src/services/world/market-model';
import { STARTING_COUNTRIES, allocateByWeight, type ResolvedCountry } from '../src/services/world/world-seed.service';

describe('seeded RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('per-index RNGs are stable and in [0,1)', () => {
    const rng = rngForIndex(7, 3);
    const again = rngForIndex(7, 3);
    for (let i = 0; i < 10; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(again()).toBe(v);
    }
  });

  it('different indices give different streams', () => {
    expect(rngForIndex(1, 0)()).not.toBe(rngForIndex(1, 1)());
  });
});

describe('freeAgentValue (spec §5.2)', () => {
  it('applies the rating band and age multiplier', () => {
    expect(freeAgentValue(45, 20)).toBe(32_500); // 25,000 * 1.30
    expect(freeAgentValue(52, 26)).toBe(55_000); // 55,000 * 1.00
    expect(freeAgentValue(72, 24)).toBe(1_920_000); // 1,600,000 * 1.20
    expect(freeAgentValue(76, 30)).toBe(2_400_000); // 3,200,000 * 0.75
    expect(freeAgentValue(85, 36)).toBe(3_600_000); // 12,000,000 * 0.30
  });

  it('rises with rating and falls with age', () => {
    expect(freeAgentValue(60, 26)).toBeGreaterThan(freeAgentValue(52, 26));
    expect(freeAgentValue(60, 22)).toBeGreaterThan(freeAgentValue(60, 34));
  });

  it('wage is 15% of value', () => {
    expect(freeAgentWage(120_000)).toBe(18_000);
  });
});

describe('band sampling', () => {
  it('matches the player rating weights over 100k draws', () => {
    const rng = mulberry32(1234);
    const counts = new Map<string, number>();
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const b = pickBand(rng, PLAYER_RATING_BANDS);
      counts.set(`${b.min}`, (counts.get(`${b.min}`) ?? 0) + 1);
    }
    const expected = expectedCounts(PLAYER_RATING_BANDS, N);
    PLAYER_RATING_BANDS.forEach((b, i) => {
      const got = counts.get(`${b.min}`) ?? 0;
      expect(Math.abs(got - expected[i]!)).toBeLessThan(N * 0.02);
    });
  });

  it('manager bands cover the target range', () => {
    expect(MANAGER_OVERALL_BANDS[0]!.min).toBe(45);
    expect(MANAGER_OVERALL_BANDS[MANAGER_OVERALL_BANDS.length - 1]!.max).toBe(84);
  });

  it('positions are weighted GK 10 / DEF 34 / MID 34 / ATT 22', () => {
    const rng = mulberry32(99);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const k = pickWeightedKey(rng, POSITION_WEIGHTS);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(Math.abs(counts.GK! / 20_000 - 0.1)).toBeLessThan(0.02);
    expect(Math.abs(counts.DEF! / 20_000 - 0.34)).toBeLessThan(0.02);
    expect(Math.abs(counts.MID! / 20_000 - 0.34)).toBeLessThan(0.02);
    expect(Math.abs(counts.ATT! / 20_000 - 0.22)).toBeLessThan(0.02);
  });

  it('age bands and randInt stay in range', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 1000; i++) {
      const b = pickBand(rng, AGE_BANDS);
      const age = randInt(rng, b.min, b.max);
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(39);
    }
  });
});

describe('managers', () => {
  it('manager age is player age + 12 clipped to 30-65', () => {
    expect(managerAgeFrom(18)).toBe(30);
    expect(managerAgeFrom(24)).toBe(36);
    expect(managerAgeFrom(60)).toBe(65);
  });
});

describe('allocation', () => {
  const countries: ResolvedCountry[] = STARTING_COUNTRIES.map((c) => ({
    id: c.key, Code: c.key.toUpperCase(), Name: c.key, Fullname: c.key, key: c.key, weight: c.weight,
  }));

  it('sums exactly to the requested total', () => {
    for (const total of [0, 1, 5_000, 1_000, 137]) {
      const alloc = allocateByWeight(countries, total);
      if (total === 0) {
        expect(alloc.reduce((s, a) => s + a.count, 0)).toBe(0);
      } else {
        expect(alloc.reduce((s, a) => s + a.count, 0)).toBe(total);
      }
    }
  });

  it('gives bigger countries more players', () => {
    const alloc = allocateByWeight(countries, 5_000);
    const byKey = new Map(alloc.map((a) => [a.country.key, a.count]));
    expect(byKey.get('bellean')!).toBeGreaterThan(byKey.get('proland')!);
    expect(byKey.get('kev')!).toBeGreaterThan(byKey.get('pregge')!);
  });

  it('the spec weights total 100', () => {
    expect(STARTING_COUNTRIES.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
});
