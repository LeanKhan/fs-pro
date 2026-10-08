/**
 * The manager model's pure arithmetic (phase-2 OWNER-PROGRAM-SPEC §5.3, §6.1,
 * §8.1): overall, fee/wage curves, the paid reveals, and the negociated fee.
 * No DB, no clock - table-testable and shared by the manager market, the
 * program facts builder and the simulator client.
 */

/** Interview (scout a manager) fee, contract §2 `fees.interview`. */
export const INTERVIEW_FEE = 25_000;
/** Scout a free-agent player, contract §2 `fees.scout`. */
export const SCOUT_FEE = 15_000;
/** Signing after an interview is 10% cheaper (the relationship). */
export const NEGOTIATION_BONUS = 0.1;
/** Half-width of the masked range shown before a reveal. */
export const HIDDEN_SPREAD = 6;
export const ATTR_MIN = 40;
export const ATTR_MAX = 90;

/** `round(0.40*Tactics + 0.20*Motivation + 0.25*Development + 0.15*Discipline)`. */
export function managerOverall(a: {
  tactics: number;
  motivation: number;
  development: number;
  discipline: number;
}): number {
  return Math.round(
    0.4 * a.tactics + 0.2 * a.motivation + 0.25 * a.development + 0.15 * a.discipline
  );
}

/** Fee for an overall, per §5.3. */
export function managerFee(overall: number): number {
  if (overall >= 75) return 2_000_000;
  if (overall >= 70) return 1_100_000;
  if (overall >= 65) return 650_000;
  if (overall >= 60) return 360_000;
  if (overall >= 55) return 180_000;
  if (overall >= 50) return 90_000;
  return 40_000;
}

/** Per-Year wage for an overall, per §5.3. */
export function managerWage(overall: number): number {
  if (overall >= 75) return 100_000;
  if (overall >= 70) return 55_000;
  if (overall >= 65) return 32_500;
  if (overall >= 60) return 18_000;
  if (overall >= 55) return 9_000;
  if (overall >= 50) return 4_500;
  return 2_000;
}

/** The fee payable now: 10% off once interviewed. */
export function effectiveManagerFee(signingFee: number, interviewed: boolean): number {
  return Math.round(interviewed ? signingFee * (1 - NEGOTIATION_BONUS) : signingFee);
}

/** A stable masked range around a hidden value (used until a paid reveal). */
export function maskRange(
  value: number,
  spread = HIDDEN_SPREAD,
  min = ATTR_MIN,
  max = ATTR_MAX
): { low: number; high: number } {
  const low = Math.max(min, Math.round(value) - spread);
  const high = Math.min(max, Math.round(value) + spread);
  return { low, high };
}

/**
 * The founding balance draw: uniform over V1.0M-V5.0M in V100k bands (§5.1).
 * Takes a random in [0, 1) so the draw stays deterministic per caller seed.
 */
export function drawStartingBalance(random: () => number = Math.random): number {
  const bands = 41; // V1.0M .. V5.0M inclusive, V100k steps
  return 1_000_000 + Math.min(bands - 1, Math.floor(random() * bands)) * 100_000;
}
