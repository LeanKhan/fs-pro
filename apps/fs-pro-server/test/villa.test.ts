import { describe, it, expect } from 'vitest';
import { formatVilla, formatVillaCompact } from '@repo/api-contract';
import { QUALIFYING_FRIENDLY_XP } from '../src/services/play/qualifying';

/**
 * The one shared Villa formatter (L13/D2) and the qualifying-friendly XP
 * constant (L6).
 */

describe('formatVilla (D2: V1.5M / V1,500,000)', () => {
  it('formats millions with one decimal and trims a whole .0', () => {
    expect(formatVilla(1_000_000)).toBe('V1M');
    expect(formatVilla(1_500_000)).toBe('V1.5M');
    expect(formatVilla(2_500_000)).toBe('V2.5M');
    expect(formatVilla(1_550_000)).toBe('V1.6M');
  });

  it('formats below a million with thousands separators', () => {
    expect(formatVilla(500_000)).toBe('V500,000');
    expect(formatVilla(999)).toBe('V999');
    expect(formatVilla(0)).toBe('V0');
  });

  it('keeps a negative sign', () => {
    expect(formatVilla(-1_500_000)).toBe('-V1.5M');
    expect(formatVilla(-2_000)).toBe('-V2,000');
  });

  it('tolerates null/undefined', () => {
    expect(formatVilla(null)).toBe('V0');
    expect(formatVilla(undefined)).toBe('V0');
  });
});

describe('formatVillaCompact', () => {
  it('uses M/k suffixes', () => {
    expect(formatVillaCompact(1_500_000)).toBe('V1.5M');
    expect(formatVillaCompact(500_000)).toBe('V500k');
    expect(formatVillaCompact(750)).toBe('V750');
  });
});

describe('qualifying-friendly XP (L6)', () => {
  it('is the match reward table', () => {
    expect(QUALIFYING_FRIENDLY_XP).toEqual({ win: 30, draw: 10, loss: 5 });
  });
});
