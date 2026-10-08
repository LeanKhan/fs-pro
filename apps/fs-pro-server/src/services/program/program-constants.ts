/**
 * The owner-program constants shared by Node (PROGRAM-SERVICE-CONTRACT.md §5.5,
 * OWNER-PROGRAM-SPEC §3.2). The Go engine owns the same table; Node uses these
 * only to store the owner program's own XP sum and to cap it.
 */

/** Reward XP per step, keyed by the achieved 1-3 stars. */
export const PROGRAM_REWARD_XP: Record<number, number> = { 1: 3, 2: 9, 3: 18 };
/** The owner program's own XP is capped at this (L6: the rest is earned). */
export const PROGRAM_XP_CAP = 54;
/** XP to reach Level 1 (the `level1` step's threshold). */
export const LEVEL1_XP = 100;
/** The order of the four active steps; `done` ends the program. */
export const ACTIVE_STEPS = ['manager', 'players', 'facilities', 'level1'] as const;
export const NEXT_STEP: Record<string, string> = {
  manager: 'players',
  players: 'facilities',
  facilities: 'level1',
  level1: 'done',
  done: 'done',
};

export type ActiveStep = (typeof ACTIVE_STEPS)[number];

/** The active step a persisted step evaluates as, or null when the program is
 * over. `not_started` behaves as the first step; `done` evaluates nothing. */
export function activeStepOf(step: string): ActiveStep | null {
  if (step === 'not_started') return 'manager';
  if (step === 'done') return null;
  return ACTIVE_STEPS.includes(step as ActiveStep) ? (step as ActiveStep) : null;
}

/** Sum the caps program XP over a Step -> stars map, excluding one step. */
export function programXpFromStars(
  stepStars: Record<string, number>,
  exclude?: string
): number {
  let total = 0;
  for (const [step, stars] of Object.entries(stepStars)) {
    if (step === exclude) continue;
    total += PROGRAM_REWARD_XP[stars] ?? 0;
  }
  return Math.min(PROGRAM_XP_CAP, total);
}
