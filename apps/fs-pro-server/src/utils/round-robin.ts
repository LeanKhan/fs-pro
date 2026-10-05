/**
 * Round-robin schedules by the circle (Berger) method, over slot indices
 * 0..size-1 (docs/WORLD-PYRAMID-SPEC.md, "The draw"). Ported in spirit from
 * the legacy RoundRobin class (legacy/scheduled-seasons branch,
 * utils/seasons.ts), with home and away alternating each round.
 *
 * Deterministic: the same size and legs always give the same rounds, so a
 * club taking an empty slot mid-season gets exactly that slot's remaining
 * fixtures.
 */

export interface Pairing {
  home: number;
  away: number;
}

/** Rounds of pairings; an odd size gives each slot one bye per leg. */
export function roundRobin(size: number, legs: 1 | 2 = 2): Pairing[][] {
  if (size < 2) return [];
  const n = size % 2 === 0 ? size : size + 1; // n-1 is the bye slot when odd
  const bye = size % 2 === 0 ? -1 : n - 1;
  const first: Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = i === 0 ? n - 1 : (r + i) % (n - 1);
      const b = (r + n - 1 - i) % (n - 1);
      if (a === bye || b === bye) continue;
      // Alternate the fixed slot's venue by round, the rest by position.
      const flip = i === 0 ? r % 2 === 1 : (i + r) % 2 === 1;
      round.push(flip ? { home: b, away: a } : { home: a, away: b });
    }
    first.push(round);
  }
  if (legs === 1) return first;
  return [...first, ...first.map((round) => round.map((p) => ({ home: p.away, away: p.home })))];
}

/** Rounds needed: (size-1) per leg for even sizes, size per leg for odd. */
export function roundCount(size: number, legs: 1 | 2): number {
  if (size < 2) return 0;
  return (size % 2 === 0 ? size - 1 : size) * legs;
}
