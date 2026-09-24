/**
 * One knob for every real-time wait in the club game: facility upgrades, the
 * match cooldown and challenge windows. GAME_TIME_SCALE=2 makes everything
 * twice as fast, 0.5 twice as slow. Timers are tuned for fun, not retention
 * (see GAME-PHILOSOPHY.md), so turn it up freely.
 */
export const GAME_TIME_SCALE = Math.max(Number(process.env.GAME_TIME_SCALE) || 1, 0.01);

/** A design-time duration in the current game speed. */
export const scaled = (amount: number) => amount / GAME_TIME_SCALE;

/** "24 hours", "90 minutes" - for copy that names a scaled duration. */
export function describeHours(hours: number): string {
  if (hours >= 1) {
    const h = Math.round(hours * 10) / 10;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const m = Math.max(Math.round(hours * 60), 1);
  return `${m} minute${m === 1 ? '' : 's'}`;
}
