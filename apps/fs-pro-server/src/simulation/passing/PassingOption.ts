import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { IPlayingStyle } from '../state/PersistentState/Formations';
import CO from '../utils/coordinates';
import { getPressure } from '../spatial/PressureAnalyzer';
import { getPassingLane } from '../spatial/PassingAnalyzer';
import { getGoalDistance } from '../spatial/SpatialAnalyzer';
import { getSimulationConfig } from '../config';

/**
 * Milestone 13 (Passing Options And Decision Evaluation) - the five pass
 * shapes the tracker names, classified from real passer/receiver geometry
 * (see `classifyPassType`) rather than invented labels layered on top of
 * an unrelated mechanic.
 */
export type PassType = 'short' | 'long' | 'backward' | 'through' | 'wide';

/**
 * One candidate pass, scored. Matches the tracker's own sketch
 * (`playerId`/`distance`/`forwardProgress`/`laneRisk`/`receiverPressure`/
 * `expectedRetention`/`expectedThreat`) plus `passType`/`position` (needed
 * to actually classify and filter candidates, not in the plan doc's
 * minimal sketch but a direct requirement of this milestone's own task
 * list) and `score` (the plan's own next section, Phase 18/`evaluateX()`,
 * sketches a bare number - `scorePassingOption` is that for passing
 * specifically, computed eagerly here rather than deferred to Milestone
 * 18, since "score each pass" is explicitly this milestone's own task).
 */
export interface PassingOption {
  playerId: string;
  passType: PassType;
  position: string;
  distance: number;
  forwardProgress: number;
  laneRisk: number;
  receiverPressure: number;
  expectedRetention: number;
  expectedThreat: number;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Classify the shape of a pass from passer to teammate, purely from
 * geometry - no reference to distance thresholds Decider.ts used to hand-
 * roll per call site. `forwardProgress` is how much closer to
 * `attackingSide`'s scoring post the receiver is than the passer (negative
 * means the receiver is further back); `lateralOffset` is how far across
 * the pitch the pass travels.
 */
function classifyPassType(
  passerPosition: { x: number; y: number },
  teammatePosition: { x: number; y: number },
  attackingSide: MatchSide
): PassType {
  const distance = CO.co.calculateDistance(passerPosition, teammatePosition);
  const forwardProgress =
    getGoalDistance(passerPosition, attackingSide.ScoringSide) -
    getGoalDistance(teammatePosition, attackingSide.ScoringSide);
  const lateralOffset = Math.abs(teammatePosition.y - passerPosition.y);

  // Milestone 19 - relocated from hardcoded literals into config, values
  // unchanged (a pure refactor - see defaultSimulationConfig.ts's own doc
  // comment).
  const classification = getSimulationConfig().passing.classification;
  const backwardThreshold = CO.co.scaleDistance(classification.backward);
  const throughThreshold = CO.co.scaleDistance(classification.through);
  const wideLateralThreshold = CO.co.scaleDistance(classification.wideLateral);
  const shortMax = CO.co.scaleDistance(classification.shortMax);
  const longMin = CO.co.scaleDistance(classification.longMin);

  if (forwardProgress < -backwardThreshold) return 'backward';
  if (forwardProgress > throughThreshold && distance > shortMax) return 'through';
  if (lateralOffset > wideLateralThreshold && forwardProgress < throughThreshold) {
    return 'wide';
  }
  if (distance >= longMin) return 'long';
  return 'short';
}

function buildOption(
  player: IFieldPlayer,
  teammate: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide
): PassingOption {
  const distance = CO.co.calculateDistance(
    player.BlockPosition,
    teammate.BlockPosition
  );
  const forwardProgress =
    getGoalDistance(player.BlockPosition, attackingSide.ScoringSide) -
    getGoalDistance(teammate.BlockPosition, attackingSide.ScoringSide);
  const passType = classifyPassType(
    player.BlockPosition,
    teammate.BlockPosition,
    attackingSide
  );

  const lane = getPassingLane(
    player.BlockPosition,
    teammate.BlockPosition,
    defendingSide
  );
  // Never quite zero even on a clear lane - an opponent can still step
  // into the lane between now and the ball arriving; keeps `expectedRetention`
  // from ever reading as a false-certain 100%.
  const laneRisk = lane.clear
    ? 0.1
    : Math.min(1, 0.5 + lane.blockers.length * 0.25);

  const receiverPressure = getPressure(teammate, defendingSide, 3);

  const pitchLength =
    getGoalDistance(attackingSide.KeepingSide, attackingSide.ScoringSide) || 1;
  const expectedThreat = clamp(forwardProgress / pitchLength, -1, 1);

  const pressurePenalty = Math.min(1, receiverPressure * 0.15);
  const distancePenalty = Math.min(1, distance / pitchLength) * 0.2;
  const expectedRetention = clamp(
    1 - laneRisk * 0.6 - pressurePenalty - distancePenalty,
    0,
    1
  );

  return {
    playerId: teammate._id!,
    passType,
    position: teammate.Position,
    distance,
    forwardProgress,
    laneRisk,
    receiverPressure,
    expectedRetention,
    expectedThreat,
    score: 0,
  };
}

/**
 * Every realistic candidate pass from `player` right now - every other
 * active outfield teammate (GK excluded; the specific "lay it back to your
 * own keeper" situation stays `Decider.isNearPost()`'s own narrow special
 * case, not something this general scorer should also recommend into),
 * each scored on the axes above. Doesn't decide anything - see
 * `selectBestPass`.
 *
 * Deliberately NOT limited to the nearest few - a squad only has ~10
 * outfield teammates, cheap to score all of them, and a "nearest N" filter
 * would silently exclude every genuine long-ball/through-ball candidate
 * (by definition further away than the nearest few), which would leave
 * `style.directness` nothing real to select toward - confirmed live while
 * tuning: with a nearest-5 filter, a Direct-style tactic's higher
 * `directness` weighting had almost no measurable effect on the actual
 * pass-type mix, because 'long'/'through' candidates were rarely even in
 * the pool to begin with.
 */
export function generatePassingOptions(
  player: IFieldPlayer,
  attackingSide: MatchSide,
  defendingSide: MatchSide
): PassingOption[] {
  const teammates = attackingSide.ActivePlayers.filter(
    (p) => p !== player && p.Position !== 'GK'
  );

  return teammates.map((teammate) =>
    buildOption(player, teammate, attackingSide, defendingSide)
  );
}

/**
 * Milestone 13's "let team intent adjust pass scoring" - `style.directness`
 * (0 = short-passing bias, 1 = direct/long-passing bias, see
 * `IPlayingStyle`) shifts how heavily retention/risk vs forward threat are
 * weighted. A safe (low-directness) tactic values keeping the ball highly
 * and penalizes risk hard; a direct (high-directness) tactic chases
 * progress and tolerates far more risk to get it - this is the actual
 * mechanism behind "riskier tactics produce more direct passes and more
 * turnovers; safer tactics produce higher retention and longer
 * possessions" (this milestone's acceptance criteria).
 */
export function scorePassingOption(
  option: PassingOption,
  style: IPlayingStyle
): number {
  const directness = style.directness;
  // Milestone 19 - relocated from hardcoded literals into config, values
  // unchanged.
  const w = getSimulationConfig().passing.scoringWeights;
  const retentionWeight = w.retentionBase + directness * w.retentionDirectnessCoeff;
  const threatWeight = w.threatBase + directness * w.threatDirectnessCoeff;
  const riskWeight = w.riskBase + directness * w.riskDirectnessCoeff;

  return (
    option.expectedRetention * retentionWeight +
    option.expectedThreat * threatWeight -
    option.laneRisk * riskWeight
  );
}

/**
 * Milestone 13's "separate pass selection from pass execution success" -
 * this picks WHICH pass to attempt (deterministically, the highest-scored
 * candidate; choosing probabilistically among scored options instead of
 * always the top one is explicitly Milestone 18's job, not invented here).
 * Whether the attempt actually succeeds is still entirely
 * `PassResolver`'s job, unchanged by this milestone - this function never
 * rolls any dice.
 */
export function selectBestPass(
  options: PassingOption[],
  style: IPlayingStyle
): PassingOption | undefined {
  if (options.length === 0) {
    return undefined;
  }

  let best: PassingOption | undefined;

  for (const option of options) {
    const scored = { ...option, score: scorePassingOption(option, style) };
    if (!best || scored.score > best.score) {
      best = scored;
    }
  }

  return best;
}
