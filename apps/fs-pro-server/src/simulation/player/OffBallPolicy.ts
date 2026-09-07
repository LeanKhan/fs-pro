import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { ICoordinate } from '../state/ImmutableState/FieldGrid';
import CO from '../utils/coordinates';
import { MatchPhase } from '../possession/MatchPhase';
import { getPressure } from '../spatial/PressureAnalyzer';
import { getSpaceAhead } from '../spatial/SpatialAnalyzer';
import { generatePassingOptions, selectBestPass } from '../passing/PassingOption';
import { getSimulationConfig } from '../config';

/**
 * Milestone 14 (Off-Ball Behavior) - the tracker's own two intent lists,
 * unchanged from its sketch. `decideAttackingOffBallIntent`/
 * `decideDefensiveIntent`/`planDefensiveAssignments` below are this
 * milestone's `decideWithoutBall()` - `Decider.makeDecision()` was already
 * effectively `decideWithBall()` (the plan doc's own diagnosis: it only
 * ever runs real logic when `player.WithBall`), so nothing needed
 * renaming there. This module is what off-ball players (everyone else on
 * the pitch, every tick) never had before: an actual per-player reason to
 * be somewhere specific, instead of the whole non-carrier group moving as
 * one homogeneous blob (Milestone 12's `getShapeTarget`, applied
 * team-wide with one shared bias).
 */
export type AttackingOffBallIntent =
  | 'support'
  | 'make-run'
  | 'overlap'
  | 'underlap'
  | 'hold-width'
  | 'move-between-lines'
  | 'attack-box'
  | 'drop-deep';

export type DefensiveIntent =
  | 'press'
  | 'mark'
  | 'cover'
  | 'track-run'
  | 'hold-line'
  | 'drop'
  | 'block-lane';

export type OffBallIntent = AttackingOffBallIntent | DefensiveIntent;

/** Is this position out toward a flank rather than central? Grid-relative
 * (not a hardcoded block count), same treatment as every other
 * resolution-independent threshold in this codebase. */
function isWideAnchor(position: ICoordinate): boolean {
  const centerY = (CO.co.Field.mapHeight - 1) / 2;
  const band =
    CO.co.Field.mapHeight * getSimulationConfig().movement.wideAnchorBandFraction;
  return Math.abs(position.y - centerY) > band;
}

/** Milestone 20 - the three genuinely energetic attacking intents this
 * module can produce, downgraded to `'support'` for a heavily fatigued
 * player (see `decideAttackingOffBallIntent`'s wrapper below) - "fatigue
 * affects movement" made concrete at the DECISION layer (whether a tired
 * player even attempts the run), not just execution quality. */
const ENERGETIC_ATTACKING_INTENTS = new Set<AttackingOffBallIntent>([
  'make-run',
  'overlap',
  'attack-box',
]);

/** Milestone 20 - thin wrapper around `decideAttackingOffBallIntentRaw()`
 * (the original Milestone 14 logic, unchanged) applying the fatigue
 * downgrade above. */
export function decideAttackingOffBallIntent(
  player: IFieldPlayer,
  ballCarrier: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide,
  phase: MatchPhase
): AttackingOffBallIntent {
  const intent = decideAttackingOffBallIntentRaw(
    player,
    ballCarrier,
    attackingSide,
    defendingSide,
    phase
  );

  const fatigueConfig = getSimulationConfig().fatigue;
  if (
    ENERGETIC_ATTACKING_INTENTS.has(intent) &&
    player.Condition.fatigue > fatigueConfig.lowEnergyThreshold
  ) {
    return 'support';
  }

  return intent;
}

/**
 * What should this off-ball attacking player be doing right now? Pure
 * function of geometry/phase - reuses Milestone 10's spatial reads
 * (`getPressure`/`getSpaceAhead`) and Milestone 11's phase, rather than
 * inventing new signals. Checked in priority order, falling back to
 * `'support'` (stay involved as a short-pass option - what every off-ball
 * player effectively did before this milestone).
 */
function decideAttackingOffBallIntentRaw(
  player: IFieldPlayer,
  ballCarrier: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide,
  phase: MatchPhase
): AttackingOffBallIntent {
  const config = getSimulationConfig();
  const pressureOnPlayer = getPressure(
    player,
    defendingSide,
    config.pressing.offBallRadius
  );

  if (pressureOnPlayer > 0 && (phase === 'build-up' || phase === 'restart')) {
    return 'drop-deep';
  }

  if (
    player.Position === 'ATT' &&
    (phase === 'final-third' ||
      phase === 'attacking-transition' ||
      phase === 'counter')
  ) {
    return 'attack-box';
  }

  const playerWide = isWideAnchor(player.StartingPosition);
  const carrierWide = isWideAnchor(ballCarrier.BlockPosition);

  if (player.Position !== 'DEF' && playerWide && !carrierWide) {
    return 'overlap';
  }

  if (player.Position !== 'DEF' && !playerWide && carrierWide) {
    return 'underlap';
  }

  if (player.Position === 'DEF' && playerWide) {
    return 'hold-width';
  }

  if (
    player.Position === 'MID' &&
    (phase === 'progression' || phase === 'build-up') &&
    getSpaceAhead(player, attackingSide, defendingSide, config.movement.spaceAheadNear) === 0
  ) {
    return 'move-between-lines';
  }

  if (
    player.Position !== 'DEF' &&
    pressureOnPlayer === 0 &&
    getSpaceAhead(player, attackingSide, defendingSide, config.movement.spaceAheadFar) === 0
  ) {
    return 'make-run';
  }

  return 'support';
}

export interface DefensiveAssignment {
  blockLaneDefenderId?: string;
  blockLaneTarget?: ICoordinate;
  /** defender id -> marked opponent id. */
  markAssignments: Map<string, string>;
}

/**
 * Computed once per tick for the whole defending side (not independently
 * per player) - deciding WHO blocks the most dangerous lane and WHO marks
 * which opponent is inherently a whole-side assignment problem, not
 * something each player can answer in isolation without duplicating or
 * leaving gaps.
 *
 * Block-lane reuses Milestone 13's own `generatePassingOptions`/
 * `selectBestPass` - run from the ATTACKING side's perspective, this is
 * "the pass the attacking side is most likely to make right now" -
 * exactly the lane worth denying. This is Milestone 14's "make passing
 * options depend on off-ball movement" acceptance criterion working in
 * both directions: off-ball attacking movement changes what
 * `generatePassingOptions` sees (better positioning -> better-scored
 * options), and here, defensive off-ball movement reads that same scoring
 * to decide what to deny.
 *
 * Marking is a simple greedy nearest-pairing (closest available defender
 * to each dangerous opponent, capped at a realistic tracking distance) -
 * not an optimal assignment solver, which would be real complexity this
 * tick-based engine has no use for.
 */
export function planDefensiveAssignments(
  ballCarrier: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide
): DefensiveAssignment {
  const outfieldDefenders = defendingSide.ActivePlayers.filter(
    (p) => p.Position !== 'GK'
  );

  const bestPass = selectBestPass(
    generatePassingOptions(ballCarrier, attackingSide, defendingSide),
    attackingSide.Tactic.style
  );
  const receiver = bestPass
    ? attackingSide.ActivePlayers.find((p) => p._id === bestPass.playerId)
    : undefined;

  let blockLaneDefenderId: string | undefined;
  let blockLaneTarget: ICoordinate | undefined;

  if (receiver) {
    const nearest = CO.co.findClosestToSegment(
      ballCarrier.BlockPosition,
      receiver.BlockPosition,
      outfieldDefenders,
      6
    );

    if (nearest) {
      blockLaneDefenderId = nearest._id;
      blockLaneTarget = {
        x: Math.round(
          (ballCarrier.BlockPosition.x + receiver.BlockPosition.x) / 2
        ),
        y: Math.round(
          (ballCarrier.BlockPosition.y + receiver.BlockPosition.y) / 2
        ),
      };
    }
  }

  // Only the couple of most dangerous opponents (closest to goal) get a
  // dedicated marker - man-marking every single ATT/MID simultaneously
  // (tried first) packed the whole pitch with 1v1 duels at once, not just
  // near the ball, and measurably tanked shots/goals while spiking
  // dribble-contest counts far past simRealismCheck.ts's real-world band.
  const pressingConfig = getSimulationConfig().pressing;
  const threats = attackingSide.ActivePlayers.filter(
    (p) =>
      p !== ballCarrier && (p.Position === 'ATT' || p.Position === 'MID')
  )
    .sort(
      (a, b) =>
        CO.co.calculateDistance(a.BlockPosition, defendingSide.KeepingSide) -
        CO.co.calculateDistance(b.BlockPosition, defendingSide.KeepingSide)
    )
    .slice(0, pressingConfig.maxMarkedThreats);
  const available = outfieldDefenders.filter(
    (d) => d._id !== blockLaneDefenderId
  );
  const claimedDefenders = new Set<string>();
  const markAssignments = new Map<string, string>();
  const markingRange = CO.co.scaleDistance(pressingConfig.markingRange);

  for (const threat of threats) {
    const marker = available
      .filter((d) => !claimedDefenders.has(d._id!))
      .sort(
        (a, b) =>
          CO.co.calculateDistance(a.BlockPosition, threat.BlockPosition) -
          CO.co.calculateDistance(b.BlockPosition, threat.BlockPosition)
      )[0];

    if (!marker) continue;

    const distance = CO.co.calculateDistance(
      marker.BlockPosition,
      threat.BlockPosition
    );
    if (distance > markingRange) continue;

    markAssignments.set(marker._id!, threat._id!);
    claimedDefenders.add(marker._id!);
  }

  return { blockLaneDefenderId, blockLaneTarget, markAssignments };
}

/** Milestone 20 - thin wrapper around `decideDefensiveIntentRaw()` (the
 * original Milestone 11/14 logic, unchanged): a heavily fatigued presser
 * drops off into `'cover'` instead - "fatigue affects... pressing" made
 * concrete. Deliberately NOT applied to `'mark'`/`'track-run'`/
 * `'block-lane'` - those are whole-side ASSIGNED duties from
 * `planDefensiveAssignments()`, not an optional energetic choice a tired
 * player can simply skip without leaving a dangerous opponent
 * unmarked. */
export function decideDefensiveIntent(
  player: IFieldPlayer,
  phase: MatchPhase,
  assignment: DefensiveAssignment,
  isPresser: boolean
): DefensiveIntent {
  const intent = decideDefensiveIntentRaw(player, phase, assignment, isPresser);
  const fatigueConfig = getSimulationConfig().fatigue;

  if (intent === 'press' && player.Condition.fatigue > fatigueConfig.lowEnergyThreshold) {
    return 'cover';
  }

  return intent;
}

/**
 * What should this off-ball defending player be doing right now? `isPresser`
 * is decided by the caller (Milestone 11's own phase-weighted press/drop-off
 * roll, unchanged - still probabilistic per tick, not a hard switch).
 * `'track-run'` is `'mark'` specifically during a fast-developing
 * counter/attacking-transition - same underlying target (the marked
 * opponent's live position), a narrower trigger condition rather than a
 * wholly separate mechanism (this tick-based engine has no per-player
 * movement history to detect "a run" more precisely than that).
 */
function decideDefensiveIntentRaw(
  player: IFieldPlayer,
  phase: MatchPhase,
  assignment: DefensiveAssignment,
  isPresser: boolean
): DefensiveIntent {
  if (player._id === assignment.blockLaneDefenderId) {
    return 'block-lane';
  }

  if (assignment.markAssignments.has(player._id!)) {
    return phase === 'counter' || phase === 'attacking-transition'
      ? 'track-run'
      : 'mark';
  }

  if (isPresser) {
    return 'press';
  }

  if (player.Position === 'DEF') {
    return 'hold-line';
  }

  if (phase === 'defensive-shape') {
    return 'drop';
  }

  return 'cover';
}
