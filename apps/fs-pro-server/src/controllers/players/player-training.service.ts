import {
  attributesToIncrease,
  ratingDampeningMultiplier,
  calculatePlayerRating,
  calculatePlayerValue,
  distributeAttributePoints,
  liveAttributePool,
  poolSizeScale,
} from '../../utils/players';
import type { PlayerInterface } from '../../interfaces/Player';

/**
 * Broad training-focus categories - deliberately NOT per-individual-
 * attribute (locked scope). Every club, human-managed or not, gets the
 * exact same size of yearly training bonus (see TRAINING_BASE_POINTS_BY_AGE)
 * regardless of whether a focus is set - a category only steers WHICH
 * attributes benefit, never whether or how much. See
 * effectiveTrainingCategory().
 */
export type TrainingCategory =
  | 'Attacking'
  | 'Defending'
  | 'Physical'
  | 'Technical';

export const TRAINING_CATEGORIES: TrainingCategory[] = [
  'Attacking',
  'Defending',
  'Physical',
  'Technical',
];

/** Real attribute names (interfaces/Player.ts's IPlayerAttributes) grouped
 * into the 4 broad categories above. Only intersected against a player's own
 * attributesToIncrease[Position] pool at training time (utils/players.ts) -
 * a category listing an attribute irrelevant to a player's Position/role
 * simply contributes nothing for them, same "some slots are dead weight"
 * shape the existing match-growth system already has (see
 * calculateTotal/AllMultipliers in utils/players.ts). */
export const TRAINING_CATEGORY_ATTRIBUTES: Record<TrainingCategory, string[]> = {
  Attacking: ['Shooting', 'Dribbling', 'SetPiece', 'ShotPower', 'LongShot', 'Crossing'],
  Defending: ['Tackling', 'Marking', 'Interception', 'Aggression', 'Positioning'],
  Physical: ['Speed', 'Strength', 'Stamina', 'Agility'],
  Technical: ['LongPass', 'ShortPass', 'Control', 'Mental', 'Vision', 'Keeping'],
};

/** Auto-default category by Role (not the coarser Position), used whenever
 * a player has no explicit TrainingFocus set - which is almost every
 * player, since most clubs are AI-run. Each Role maps to whichever category
 * captures the largest combined weight in that Role's real AllMultipliers
 * table (interfaces/Player.ts) - computed directly from those tables, not
 * guessed:
 *   - CDM: Tackling alone is 0.42, more than any other category's sum -
 *     Defending, distinctly different from the rest of MID (was previously
 *     keyed off the coarse Position, which gave every midfielder the same
 *     Technical default - wrong for CDM specifically. See
 *     training_system_feature.md in memory for the full weight breakdown).
 *   - CM/CAM/RM/LM: passing/control/vision dominate (CM combined 0.72,
 *     CAM 0.58, RM/LM 0.46) - Technical.
 *   - ST/LW/RW: finishing/dribbling/crossing dominate - Attacking.
 *   - CB/LB/RB: tackling/marking/interception dominate - Defending.
 *   - GK: Keeping alone (0.44) is the single highest weight anywhere in the
 *     whole multiplier system - Technical (the only category containing
 *     Keeping at all).
 * No Role's real weight table has Physical (Speed/Strength/Stamina/Agility)
 * as its largest bucket - Physical stays a fully valid manual choice, just
 * never the computed best-fit default for any Role today. */
export const DEFAULT_TRAINING_CATEGORY_BY_ROLE: Record<string, TrainingCategory> = {
  GK: 'Technical',
  ST: 'Attacking',
  LW: 'Attacking',
  RW: 'Attacking',
  CB: 'Defending',
  LB: 'Defending',
  RB: 'Defending',
  CM: 'Technical',
  CAM: 'Technical',
  CDM: 'Defending',
  RM: 'Technical',
  LM: 'Technical',
};

export function effectiveTrainingCategory(player: PlayerInterface): TrainingCategory {
  return (
    (player.TrainingFocus as TrainingCategory | null | undefined) ??
    DEFAULT_TRAINING_CATEGORY_BY_ROLE[player.Role] ??
    'Technical'
  );
}

/** Base training points pool by age bracket, BEFORE rating-dampening and
 * BEFORE any breakout multiplier. Halved from an initial single-year-only
 * calibration (50/35/20/10/5) after multi-year simulation showed that
 * scale saturated a trained attribute pool (4-6 attributes) for 100% of
 * players by age 23 and erased ALL distinction between breakout and
 * non-breakout careers (gap ~0) - any fixed yearly rate into a small fixed
 * pool eventually saturates given enough years (expected/realistic on its
 * own), but the original scale made that happen far too fast, before a
 * "breakout star" story could ever play out. At this halved scale,
 * breakout vs non-breakout still shows a real +6 point Rating gap through
 * the meaningful development window (age 16-23, ~65% saturated by then vs
 * 100% before) - see training_system_feature.md in memory for the full
 * sweep. Flag for sign-off like every other placeholder constant here. */
export const TRAINING_BASE_POINTS_BY_AGE: { max: number; points: number }[] = [
  { max: 19, points: 25 },
  { max: 22, points: 17 },
  { max: 27, points: 10 },
  { max: 31, points: 5 },
  { max: Infinity, points: 2 },
];

/** Rare, age-tapered chance of an amplified "breakout" training year -
 * directly answers the user's original "chance of breakout stars" question
 * with a designed mechanic, rather than relying on natural variance alone
 * (simulation showed the existing match-growth system alone can never
 * produce one - max observed single-year jump was +3 across 2000 trials).
 * Flag for sign-off, same as TRAINING_BASE_POINTS_BY_AGE. */
export const BREAKOUT_CHANCE_BY_AGE: { max: number; chance: number }[] = [
  { max: 17, chance: 0.1 },
  { max: 19, chance: 0.08 },
  { max: 22, chance: 0.05 },
  { max: 25, chance: 0.02 },
  { max: 28, chance: 0.01 },
  { max: Infinity, chance: 0 },
];
export const BREAKOUT_MULTIPLIER = 3;

function basePointsForAge(age: number): number {
  return TRAINING_BASE_POINTS_BY_AGE.find((b) => age <= b.max)!.points;
}

function breakoutChanceForAge(age: number): number {
  return BREAKOUT_CHANCE_BY_AGE.find((b) => age <= b.max)!.chance;
}

/**
 * Applies one yearly training-growth pass to `player` - mutates
 * player.Attributes in place (same style as newAttributeRatings, so it
 * composes for free when layered with match-based growth on the same
 * object, see updateAllPlayerDetailsForYear). Free (no Budget cost, no
 * TransferLedger entry - locked scope), and applies to every signed player
 * every year regardless of human management (see effectiveTrainingCategory).
 */
export function applyTrainingGrowth(player: PlayerInterface): {
  attributes: typeof player.Attributes;
  new_rating: number;
  new_value: number;
  category: TrainingCategory;
  breakout: boolean;
} {
  const category = effectiveTrainingCategory(player);
  const positionPool = attributesToIncrease[player.Position] ?? [];

  let pool = TRAINING_CATEGORY_ATTRIBUTES[category].filter((a) =>
    positionPool.includes(a)
  );
  // GK+Attacking (and any other zero-overlap combination) has no intersection
  // - fall back to the player's full position pool rather than wasting the
  // points pool entirely.
  if (pool.length === 0) pool = positionPool;

  const livePool = liveAttributePool(player.Role, pool);

  let points = basePointsForAge(player.Age);
  points *= ratingDampeningMultiplier(player.Rating);
  points *= poolSizeScale(livePool.length);

  const breakout = Math.random() < breakoutChanceForAge(player.Age);
  if (breakout) points *= BREAKOUT_MULTIPLIER;

  distributeAttributePoints(player.Attributes, livePool, Math.round(points));

  const new_rating = Math.round(
    calculatePlayerRating(player.Attributes, player.Position, player.Role)
  );
  const new_value = calculatePlayerValue(player.Position, new_rating, player.Age);

  return { attributes: player.Attributes, new_rating, new_value, category, breakout };
}
