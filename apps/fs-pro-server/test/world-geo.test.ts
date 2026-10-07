import { describe, expect, it } from 'vitest';
import {
  ATLAS_H,
  ATLAS_MARGIN,
  ATLAS_W,
  atlasSize,
  codeProblem,
  COUNTRY_MIN_GAP,
  COUNTRY_RADIUS,
  countrySpotProblem,
  FOUNDING_LIMITS,
  nameProblem,
  suggestCode,
  suggestCountrySpot,
  suggestRegionSpot,
  suggestTownSpot,
  tidyName,
  TOWN_MIN_GAP,
  TOWN_TERRAINS,
  townSpotProblem,
  type AtlasPoint,
} from '@repo/api-contract';

/**
 * Unit tests for the pure world-geo rules (packages/api-contract/src/world-geo.ts).
 * The constants these tests lean on: ATLAS_MARGIN 70, COUNTRY_RADIUS 200,
 * COUNTRY_MIN_GAP 420, TOWN_MIN_GAP 32, REGION_RING 125 (lines 14-35).
 */

const P = (x: number, y: number): AtlasPoint => ({ x, y });

describe('constants', () => {
  it('keeps the documented atlas geometry', () => {
    expect(ATLAS_W).toBe(1600);
    expect(ATLAS_H).toBe(900);
    expect(ATLAS_MARGIN).toBe(70);
    expect(COUNTRY_MIN_GAP).toBe(2 * COUNTRY_RADIUS + 20);
    expect(TOWN_MIN_GAP).toBe(32);
    expect(TOWN_TERRAINS).toEqual(['city', 'coastal', 'hillside', 'woodland', 'alpine']);
    expect(FOUNDING_LIMITS).toEqual({ countries: 1, towns: 3, clubs: 2 });
  });
});

describe('countrySpotProblem', () => {
  it('rejects spots off the top/left edge and non-finite points', () => {
    expect(countrySpotProblem(P(50, 500), [])).toBe('Too close to the edge of the world');
    expect(countrySpotProblem(P(500, 50), [])).toBe('Too close to the edge of the world');
    expect(countrySpotProblem(P(NaN, 500), [])).toBe('Too close to the edge of the world');
  });

  it('rejects spots within the minimum gap of another country', () => {
    expect(countrySpotProblem(P(500, 500), [P(500, 500)])).toBe('Too close to another country');
    expect(countrySpotProblem(P(500, 500), [P(900, 500)])).toBe('Too close to another country'); // 400 < 420
    expect(countrySpotProblem(P(500, 500), [P(920, 500)])).toBeNull(); // exactly 420 apart
  });

  it('accepts a free spot', () => {
    expect(countrySpotProblem(P(500, 500), [])).toBeNull();
  });
});

describe('townSpotProblem', () => {
  const country = P(500, 500);
  it('checks edge, country radius, other countries and town spacing', () => {
    expect(townSpotProblem(P(50, 500), country)).toBe('Too close to the edge of the world');
    expect(townSpotProblem(P(500, 720), country)).toBe('Outside the country'); // 220 > 200
    expect(townSpotProblem(P(500, 600), P(400, 500), [], [P(550, 600)])).toBe(
      'That land belongs to another country'
    );
    expect(townSpotProblem(P(500, 500), country, [P(500, 500)])).toBe('Too close to another town');
  });

  it('accepts an in-country spot clear of others', () => {
    expect(townSpotProblem(P(500, 650), country, [])).toBeNull();
  });
});

describe('suggestTownSpot', () => {
  const country = P(500, 500);
  it('returns a valid in-country spot with no problem', () => {
    const spot = suggestTownSpot(country, []);
    expect(spot).not.toBeNull();
    expect(townSpotProblem(spot!, country, [])).toBeNull();
  });

  it('is deterministic for a seed and expands with the seed', () => {
    expect(suggestTownSpot(country, [], [], 0)).toEqual(suggestTownSpot(country, [], [], 0));
    expect(suggestTownSpot(country, [], [], 1)).not.toEqual(suggestTownSpot(country, [], [], 0));
  });

  it('returns null when the radius is smaller than the first ring', () => {
    expect(suggestTownSpot(country, [], [], 0, country, 10)).toBeNull();
  });

  it('returns null when the whole country is full of towns', () => {
    // Fill the country disc with towns on a dense grid; the spiral must fail.
    const towns: AtlasPoint[] = [];
    for (let x = 300; x <= 700; x += TOWN_MIN_GAP - 1) {
      for (let y = 300; y <= 700; y += TOWN_MIN_GAP - 1) towns.push(P(x, y));
    }
    expect(suggestTownSpot(country, towns)).toBeNull();
  });
});

describe('suggestRegionSpot', () => {
  const country = P(500, 500);
  it('puts a region on the ring around the country', () => {
    const spot = suggestRegionSpot(country, []);
    expect(spot).not.toBeNull();
    const d = Math.hypot(spot!.x - country.x, spot!.y - country.y);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(150);
  });

  it('avoids existing regions and is deterministic for a seed', () => {
    const first = suggestRegionSpot(country, [], [], 0)!;
    const second = suggestRegionSpot(country, [first], [], 0)!;
    expect(second).not.toEqual(first);
    expect(suggestRegionSpot(country, [first], [], 0)).toEqual(second);
  });
});

describe('suggestCountrySpot', () => {
  it('returns the first sea centre when the world is empty', () => {
    expect(suggestCountrySpot([])).toEqual(P(ATLAS_W / 2, ATLAS_H / 2));
  });

  it('keeps COUNTRY_MIN_GAP from every existing country, inside bounds', () => {
    const countries: AtlasPoint[] = [];
    for (let i = 0; i < 6; i++) {
      const spot = suggestCountrySpot(countries);
      expect(spot.x).toBeGreaterThanOrEqual(ATLAS_MARGIN + COUNTRY_RADIUS);
      expect(spot.y).toBeGreaterThanOrEqual(ATLAS_MARGIN + COUNTRY_RADIUS);
      for (const c of countries) {
        expect(Math.hypot(c.x - spot.x, c.y - spot.y)).toBeGreaterThanOrEqual(COUNTRY_MIN_GAP);
      }
      countries.push(spot);
    }
  });
});

describe('atlasSize', () => {
  it('never shrinks below the smallest sea', () => {
    expect(atlasSize([])).toEqual({ width: ATLAS_W, height: ATLAS_H });
  });

  it('grows to hold the furthest place with room around it', () => {
    expect(atlasSize([P(2000, 1000)])).toEqual({
      width: Math.ceil(2000 + COUNTRY_RADIUS + ATLAS_MARGIN),
      height: Math.ceil(1000 + COUNTRY_RADIUS + ATLAS_MARGIN),
    });
  });
});

describe('nameProblem', () => {
  it('enforces length', () => {
    expect(nameProblem('Al')).toBe('Name needs at least 3 characters');
    expect(nameProblem('A'.repeat(31))).toBe('Name can have at most 30 characters');
  });

  it('enforces the allowed characters and single spaces', () => {
    expect(nameProblem('Bad@Name')).toBe("Name can only use letters, numbers, spaces and . ' & -");
    expect(nameProblem('9 Port')).toBe("Name can only use letters, numbers, spaces and . ' & -");
    expect(nameProblem('Two  Spaces')).toBe('Name has double spaces');
    expect(nameProblem('Port Ellis')).toBeNull();
    expect(nameProblem('  Port  ')).toBeNull();
  });

  it('accepts unicode letters and honours custom labels/limits', () => {
    expect(nameProblem('Ĉlub Ünïted')).toBeNull();
    expect(nameProblem('Jo', 'Club', 2, 10)).toBeNull();
    expect(nameProblem('J', 'Club', 2, 10)).toBe('Club needs at least 2 characters');
  });
});

describe('codeProblem', () => {
  it('accepts 2-4 capitals/digits starting with a letter', () => {
    expect(codeProblem('AB')).toBeNull();
    expect(codeProblem('ABCD')).toBeNull();
    expect(codeProblem('A1B2')).toBeNull();
  });

  it('rejects anything else', () => {
    const message = 'Code must be 2-4 capital letters or digits';
    expect(codeProblem('A')).toBe(message);
    expect(codeProblem('ABCDE')).toBe(message);
    expect(codeProblem('1AB')).toBe(message);
    expect(codeProblem('ab')).toBe(message);
    expect(codeProblem('A-B')).toBe(message);
    expect(codeProblem('')).toBe(message);
  });
});

describe('tidyName', () => {
  it('trims and collapses whitespace', () => {
    expect(tidyName('  Port   Ellis ')).toBe('Port Ellis');
    expect(tidyName('One')).toBe('One');
  });
});

describe('suggestCode', () => {
  it('builds initials for multi-word names, capped at 4', () => {
    expect(suggestCode('Port Ellis Rovers')).toBe('PER');
    expect(suggestCode('Real Madrid CF')).toBe('RMC');
    expect(suggestCode('A B C D E')).toBe('ABCD');
  });

  it('truncates single-word names to 3', () => {
    expect(suggestCode('Manchester')).toBe('MAN');
    expect(suggestCode('FC')).toBe('FC');
  });

  it('strips punctuation and handles unusable names', () => {
    expect(suggestCode("St. Mary's")).toBe('SM');
    expect(suggestCode('!!!')).toBe('');
  });
});
