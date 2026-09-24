/**
 * Level: a club's progression, derived from Clubs.XP and never stored
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). It decides which competitions a
 * club may enter. Clubs start at Level 0.
 *
 * `thresholds[n]` is the XP needed for Level n (so thresholds[0] is 0). The
 * world's thresholds live in Calendars.LevelThresholds; when unset, or past
 * its end, the curve below applies (Level n needs 100 * n^2 XP).
 */
const curve = (level: number) => 100 * level * level;

export const DEFAULT_LEVEL_THRESHOLDS: readonly number[] = Array.from(
  { length: 51 },
  (_, n) => curve(n)
);

export function xpForLevel(
  level: number,
  thresholds: readonly number[] = DEFAULT_LEVEL_THRESHOLDS
) {
  const n = Math.max(0, Math.floor(level));
  return n < thresholds.length ? thresholds[n]! : curve(n);
}

export function levelForXp(
  xp: number,
  thresholds: readonly number[] = DEFAULT_LEVEL_THRESHOLDS
) {
  const value = Math.max(0, xp);
  let level = 0;
  while (xpForLevel(level + 1, thresholds) <= value) level++;
  return level;
}

/** XP after a promotion (+1) or relegation (-1), per the spec: promotion
 * lifts XP to the next Level's threshold, relegation drops it to the
 * previous Level's threshold. Never below Level 0. */
export function xpAfterLevelChange(
  xp: number,
  change: 1 | -1,
  thresholds: readonly number[] = DEFAULT_LEVEL_THRESHOLDS
) {
  const level = levelForXp(xp, thresholds);
  if (change === 1) return xpForLevel(level + 1, thresholds);
  return level === 0 ? xp : xpForLevel(level - 1, thresholds);
}
