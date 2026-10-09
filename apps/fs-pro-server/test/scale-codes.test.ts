import { describe, expect, it } from 'vitest';
import { SCALE_CODE_ALPHABET, scaleClubCode } from '../src/scripts/scale-codes';

/**
 * The scale harness's short-code generator. It is the only club-code generator
 * that runs at 100k scale (production codes are founder-supplied and validated
 * by `codeProblem`), and its predecessor wrapped at 26^3 = 17,576 (B2-2D). The
 * 100k-club target needs it to stay injective well past that point.
 */

const CODE_RE = /^[A-Z][A-Z0-9]{1,3}$/;

/** The letters-only scheme this replaced: `Z` + three base-26 letters. */
const oldCode = (n: number) => {
  let s = '';
  for (let k = n; s.length < 3; k = Math.floor(k / 26)) s = String.fromCharCode(65 + (k % 26)) + s;
  return `Z${s}`;
};

describe('scaleClubCode', () => {
  it('is injective and format-valid for the whole 100k target', () => {
    const seen = new Set<string>();
    const malformed: number[] = [];
    for (let n = 0; n < 100_000; n++) {
      const code = scaleClubCode(n);
      if (!CODE_RE.test(code)) malformed.push(n);
      seen.add(code);
    }
    expect(malformed).toEqual([]);
    expect(seen.size).toBe(100_000);
  });

  it('does not collide at the old 26^3 = 17,576 wrap point', () => {
    expect(oldCode(0)).toBe('ZAAA');
    expect(oldCode(17_576)).toBe(oldCode(0)); // the historical collision
    expect(scaleClubCode(17_576)).not.toBe(scaleClubCode(0));
    expect(scaleClubCode(17_575)).not.toBe(scaleClubCode(17_576));
  });

  it('stays unique across the boundary and uses only the documented alphabet', () => {
    for (const n of [17_575, 17_576, 17_577, 46_655, 46_656, 99_999]) {
      const code = scaleClubCode(n);
      expect(CODE_RE.test(code)).toBe(true);
      for (const ch of code) expect(SCALE_CODE_ALPHABET).toContain(ch);
    }
    // 26 * 36^3 is the capacity; n just below it is still a valid 4-char code.
    const last = scaleClubCode(26 * 36 ** 3 - 1);
    expect(CODE_RE.test(last)).toBe(true);
  });
});
