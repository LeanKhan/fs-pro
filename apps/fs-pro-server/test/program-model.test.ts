import { describe, expect, it } from 'vitest';
import {
  ATTR_MAX,
  ATTR_MIN,
  HIDDEN_SPREAD,
  INTERVIEW_FEE,
  SCOUT_FEE,
  drawStartingBalance,
  effectiveManagerFee,
  managerFee,
  managerOverall,
  managerWage,
  maskRange,
} from '../src/services/program/manager-model';
import {
  PROGRAM_REWARD_XP,
  PROGRAM_XP_CAP,
  activeStepOf,
  programXpFromStars,
} from '../src/services/program/program-constants';

/**
 * Pure owner-program arithmetic: the manager overall/fee/wage curves
 * (OWNER-PROGRAM-SPEC §5.3, §6.1), the masked reveal ranges, the starting
 * balance draw (§5.1), the capped program XP and the step mapping. No DB.
 */

describe('managerOverall', () => {
  it('matches the spec weights', () => {
    // 0.40*60 + 0.20*60 + 0.25*60 + 0.15*60 = 60
    expect(managerOverall({ tactics: 60, motivation: 60, development: 60, discipline: 60 })).toBe(60);
    // 0.40*80 + 0.20*40 + 0.25*50 + 0.15*60 = 32+8+12.5+9 = 61.5 -> 62
    expect(managerOverall({ tactics: 80, motivation: 40, development: 50, discipline: 60 })).toBe(62);
  });
});

describe('fee and wage curves', () => {
  it('follows the §5.3 bands at every boundary', () => {
    expect(managerFee(45)).toBe(40_000);
    expect(managerFee(49)).toBe(40_000);
    expect(managerFee(50)).toBe(90_000);
    expect(managerFee(55)).toBe(180_000);
    expect(managerFee(60)).toBe(360_000);
    expect(managerFee(65)).toBe(650_000);
    expect(managerFee(70)).toBe(1_100_000);
    expect(managerFee(75)).toBe(2_000_000);
    expect(managerFee(90)).toBe(2_000_000);
  });

  it('sets the wage to the §5.3 per-year values', () => {
    expect(managerWage(45)).toBe(2_000);
    expect(managerWage(55)).toBe(9_000);
    expect(managerWage(70)).toBe(55_000);
    expect(managerWage(80)).toBe(100_000);
  });

  it('discounts the fee 10% after an interview, and only then', () => {
    expect(effectiveManagerFee(1_000_000, false)).toBe(1_000_000);
    expect(effectiveManagerFee(1_000_000, true)).toBe(900_000);
    expect(effectiveManagerFee(360_000, true)).toBe(324_000);
  });
});

describe('maskRange', () => {
  it('is a ±6 band clamped to the attribute bounds', () => {
    expect(maskRange(60)).toEqual({ low: 54, high: 66 });
    expect(maskRange(45)).toEqual({ low: ATTR_MIN, high: 51 });
    expect(maskRange(88)).toEqual({ low: 82, high: ATTR_MAX });
  });

  it('uses the default spread', () => {
    expect(HIDDEN_SPREAD).toBe(6);
    const r = maskRange(70);
    expect(r.high - r.low).toBe(2 * HIDDEN_SPREAD);
  });
});

describe('drawStartingBalance', () => {
  it('draws uniform V100k bands from V1.0M to V5.0M inclusive', () => {
    expect(drawStartingBalance(() => 0)).toBe(1_000_000);
    expect(drawStartingBalance(() => 0.999999)).toBe(5_000_000);
    expect(drawStartingBalance(() => 0.5)).toBe(3_000_000);
    for (let i = 0; i < 200; i++) {
      const v = drawStartingBalance(Math.random);
      expect(v).toBeGreaterThanOrEqual(1_000_000);
      expect(v).toBeLessThanOrEqual(5_000_000);
      expect(v % 100_000).toBe(0);
    }
  });
});

describe('program XP', () => {
  it('uses the {1:3,2:9,3:18} reward table and the 54 cap', () => {
    expect(PROGRAM_REWARD_XP).toEqual({ 1: 3, 2: 9, 3: 18 });
    expect(PROGRAM_XP_CAP).toBe(54);
    expect(programXpFromStars({ manager: 1 })).toBe(3);
    expect(programXpFromStars({ manager: 3, players: 3 })).toBe(36);
    expect(programXpFromStars({ manager: 3, players: 3, facilities: 3, level1: 3 })).toBe(54);
    // `level1` rewards 0, so a 3-star level1 adds nothing.
    expect(programXpFromStars({ manager: 3, players: 3, facilities: 3 })).toBe(54);
  });

  it('excludes the step being evaluated (double-count rule)', () => {
    expect(programXpFromStars({ manager: 3, facilities: 3 }, 'facilities')).toBe(18);
  });

  it('caps at 54 even if the map is corrupted with big rewards', () => {
    expect(programXpFromStars({ a: 3, b: 3, c: 3, d: 3, e: 3 })).toBe(54);
  });
});

describe('activeStepOf', () => {
  it('maps not_started to manager and done to null', () => {
    expect(activeStepOf('not_started')).toBe('manager');
    expect(activeStepOf('manager')).toBe('manager');
    expect(activeStepOf('players')).toBe('players');
    expect(activeStepOf('facilities')).toBe('facilities');
    expect(activeStepOf('level1')).toBe('level1');
    expect(activeStepOf('done')).toBeNull();
  });
});

describe('fees', () => {
  it('are the frozen contract values', () => {
    expect(INTERVIEW_FEE).toBe(25_000);
    expect(SCOUT_FEE).toBe(15_000);
  });
});
