import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PYRAMID_STAGE,
  isPyramid,
  poolRules,
  pyramidShape,
  pyramidStage,
} from '../src/services/competitions/pyramid.service';

/**
 * Unit tests for the pure shape/rules helpers in
 * src/services/competitions/pyramid.service.ts. The draw itself needs the DB;
 * `pyramidShape` (line 104) and `poolRules` (line 73) do not.
 */

const shape = (clubs: number, fill = 0.8) => pyramidShape(clubs, 10, fill);

describe('pyramidShape', () => {
  it('handles the empty and single-pool worlds', () => {
    expect(shape(0)).toEqual([{ division: 1, clubs: 0, poolSizes: [10], poolClubs: [0] }]);
    expect(shape(1)).toEqual([{ division: 1, clubs: 1, poolSizes: [10], poolClubs: [1] }]);
    expect(shape(10)).toEqual([{ division: 1, clubs: 10, poolSizes: [10], poolClubs: [10] }]);
    // A world just too big for one pool gets an oversized single pool.
    expect(shape(11)).toEqual([{ division: 1, clubs: 11, poolSizes: [11], poolClubs: [11] }]);
  });

  it('fills full divisions top down while 2 clubs would be left over', () => {
    expect(shape(12)).toEqual([
      { division: 1, clubs: 10, poolSizes: [10], poolClubs: [10] },
      { division: 2, clubs: 2, poolSizes: [10], poolClubs: [2] },
    ]);
  });

  it('spreads the bottom division over enough pools to reach bottomFill', () => {
    expect(shape(22)).toEqual([
      { division: 1, clubs: 10, poolSizes: [10], poolClubs: [10] },
      { division: 2, clubs: 12, poolSizes: [10, 10], poolClubs: [6, 6] },
    ]);
    expect(shape(100)).toEqual([
      { division: 1, clubs: 10, poolSizes: [10], poolClubs: [10] },
      { division: 2, clubs: 20, poolSizes: [10, 10], poolClubs: [10, 10] },
      { division: 3, clubs: 40, poolSizes: [10, 10, 10, 10], poolClubs: [10, 10, 10, 10] },
      { division: 4, clubs: 30, poolSizes: [10, 10, 10, 10], poolClubs: [8, 8, 7, 7] },
    ]);
  });

  it('lets bottomFill change only the bottom division spread', () => {
    expect(shape(100, 0.5).at(-1)).toEqual({ division: 4, clubs: 30, poolSizes: [10, 10, 10, 10, 10, 10], poolClubs: [5, 5, 5, 5, 5, 5] });
    expect(shape(100, 1).at(-1)).toEqual({ division: 4, clubs: 30, poolSizes: [10, 10, 10], poolClubs: [10, 10, 10] });
  });

  it('200 clubs become 5 divisions', () => {
    const out = shape(200);
    expect(out.map((d) => d.clubs)).toEqual([10, 20, 40, 80, 50]);
    expect(out.map((d) => d.division)).toEqual([1, 2, 3, 4, 5]);
  });

  it('holds the totals invariant for every size from 1 to 500', () => {
    for (let n = 1; n <= 500; n++) {
      const out = shape(n);
      const total = out.reduce((sum, d) => sum + d.clubs, 0);
      expect(total).toBe(n);
      expect(out.map((d) => d.division)).toEqual(out.map((_, i) => i + 1));
      for (const d of out) {
        expect(d.poolSizes).toHaveLength(d.poolClubs.length);
        expect(d.poolClubs.reduce((a, b) => a + b, 0)).toBe(d.clubs);
        expect(d.clubs).toBeGreaterThan(0);
      }
      // Full divisions are exactly poolSize per pool; only the bottom (or the
      // one-pool small world) is partial.
      for (const d of out.slice(0, -1)) {
        expect(d.poolClubs.every((c) => c === 10)).toBe(true);
      }
    }
  });
});

describe('poolRules', () => {
  it('uses points for the pyramid and ppg in the bottom division', () => {
    const top = poolRules(DEFAULT_PYRAMID_STAGE, false);
    expect(top.metric).toBe('points');
    expect(top.minGamesToRank).toBe(0);
    expect(top.maxGames).toBeNull();
    expect(top.pointsForWin).toBe(3);

    const bottom = poolRules(DEFAULT_PYRAMID_STAGE, true);
    expect(bottom.metric).toBe('ppg');
    expect(bottom.minGamesToRank).toBe(4);
    expect(bottom.maxGames).toBeNull();
  });

  it('lets the stage rules win over the code defaults and world defaults', () => {
    const stage = { ...DEFAULT_PYRAMID_STAGE, rules: { maxGames: 5, pointsForWin: 2 } };
    const rules = poolRules(stage, false, { maxGames: 10, pointsForWin: 4 });
    expect(rules.maxGames).toBe(5);
    expect(rules.pointsForWin).toBe(2);
    // DEFAULT_PYRAMID_RULES overrides a world default of maxGames.
    expect(poolRules(DEFAULT_PYRAMID_STAGE, false, { maxGames: 10 }).maxGames).toBeNull();
  });
});

describe('isPyramid / pyramidStage', () => {
  it('detects a single pyramid stage', () => {
    const def = { Stages: [DEFAULT_PYRAMID_STAGE] };
    expect(isPyramid(def)).toBe(true);
    expect(pyramidStage(def)).toEqual(DEFAULT_PYRAMID_STAGE);
  });

  it('rejects no stage, several stages, or a non-pyramid stage', () => {
    expect(isPyramid(null)).toBe(false);
    expect(isPyramid({ Stages: [] })).toBe(false);
    expect(isPyramid({ Stages: [{ type: 'knockout' } as never] })).toBe(false);
    expect(pyramidStage({ Stages: [{ type: 'knockout' } as never] })).toBeNull();
  });
});
