import type { AttributeRange } from '@repo/api-contract';

/**
 * Small pure helpers shared by the owner-program screens. No state, no DOM:
 * anything that formats or classifies the program's data lives here so the
 * components stay presentational.
 */

/** The facility code still says `level`; every new UI string says Tier (R5′). */
export function tierWording(text: string | null | undefined): string {
  return (text ?? '').replace(/\blevels?\b/gi, (m) => (m.endsWith('s') ? 'Tiers' : 'Tier'));
}

/** "54-66" while hidden, "61" once revealed. */
export function rangeLabel(range: AttributeRange | null | undefined): string {
  if (!range) return '—';
  return range.low === range.high ? String(range.low) : `${range.low}–${range.high}`;
}

/** Midpoint of a hidden range, for a bar length. */
export function rangeMid(range: AttributeRange | null | undefined): number {
  if (!range) return 0;
  return (range.low + range.high) / 2;
}

export function isRevealed(range: AttributeRange | null | undefined): boolean {
  return !!range && range.low === range.high;
}

/** Position → a colour class (matches the cozy palette). */
export function positionKind(position: string | null | undefined): 'gk' | 'def' | 'mid' | 'att' {
  const p = (position ?? '').toUpperCase();
  if (p === 'GK') return 'gk';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF', 'SW'].some((x) => p.includes(x))) return 'def';
  if (['ST', 'CF', 'LW', 'RW', 'ATT', 'FW'].some((x) => p.includes(x))) return 'att';
  return 'mid';
}

/** Sort keys offered in the markets. */
export type SortKey = 'price' | 'rating' | 'age';

export function playerSortValue(
  p: { value: number; rating: AttributeRange; age: number | null },
  key: SortKey
): number {
  if (key === 'price') return p.value;
  if (key === 'age') return p.age ?? 99;
  return rangeMid(p.rating);
}
