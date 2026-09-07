import { IFieldPlayer } from '../../../../interfaces/Player';
import { MatchSide } from '../../../classes/MatchSide';
import CO from '../../../utils/coordinates';
import { getResult } from '../../../utils/probability';
import {
  createRandomSource,
  RandomInput,
  RandomSource,
} from '../../../randomness';
import { getPressure } from '../../../spatial/PressureAnalyzer';
import { getPassingLane } from '../../../spatial/PassingAnalyzer';
import { getNearestTeammates } from '../../../spatial/SpatialAnalyzer';
import {
  generatePassingOptions,
  selectBestPass,
} from '../../../passing/PassingOption';
import { deriveTendencies } from '../../../player/PlayerRole';
import { MatchPhase } from '../../../possession/MatchPhase';
import {
  CandidateAction,
  CandidateActionType,
  chooseCandidate,
} from '../../../decision/CandidateAction';
import { recordDecision } from '../../../decision/decisionLog';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Milestone 18 - `TeamIntent.phase` (`possession/MatchPhase.ts`) nudges
 * a candidate's score by a small, additive amount per type. Deliberately
 * small (<= 0.15) relative to the 0-1 score scale - phase should tilt the
 * balance among otherwise-competitive options, not override what the
 * player's own pressure/ability/tendencies already say. Only the phases an
 * ATTACKING side's own intent can actually be (see `getAttackingPhase()` -
 * never 'chance'/'press'/'defensive-shape'/'defensive-transition', those
 * are the defending side's or retroactive) have entries; anything else
 * falls through to no bias. */
const PHASE_BIAS: Partial<
  Record<MatchPhase, Partial<Record<CandidateActionType, number>>>
> = {
  counter: { carry: 0.15, dribble: 0.1, shoot: 0.05 },
  'attacking-transition': { carry: 0.1, pass: 0.05 },
  'final-third': { shoot: 0.15, dribble: 0.05 },
  'build-up': { support: 0.1, hold: 0.05 },
  restart: { pass: 0.1 },
};

/** Milestone 15 - how far a player's own `PlayerTendencies.shooting` can
 * shift their shot-attempt confidence threshold (see `chanceToShoot()`) -
 * kept separate from the shared `confidenceThreshold()` helper below,
 * which is also used by the pass-vs-move roll and shouldn't inherit a
 * shooting-specific bias. */
const SHOOTING_CONFIDENCE_SWING = 30;

interface IShootProfile {
  threshold: number;
  distance: number;
}

interface IOutfieldShootProfile {
  shoot: { withMindset: IShootProfile; without: IShootProfile };
  longShot: { withMindset: IShootProfile; without: IShootProfile };
}

/**
 * Base shoot/long-shot thresholds and distances per outfield position.
 * These are still hand-tuned constants, but centralising them here means
 * makeDecision no longer repeats the same shoot/long-shot branch three
 * times with inline magic numbers - and `confidenceThreshold` below is
 * what actually adjusts them per-attempt (composure, pressure).
 */
/**
 * Milestone 18 - raised from the pre-M18 values (MID 50/70, ATT 60/90,
 * DEF 30/40 for the "shoot" band) once candidates started genuinely
 * competing for selection instead of the old sequential chain locking in
 * the FIRST check to pass with zero competition. Under `chooseCandidate`'s
 * weighted draw, a shoot score has to clear a real bar relative to
 * pass/carry/dribble/hold/support just to get a comparable slice of the
 * probability mass - these are that bar, re-tuned against
 * `simRealismCheck.ts`'s shots-per-team/shots-on-target bands the same
 * way every other threshold in this file was tuned, not a return to the
 * old "first-to-pass-wins" behavior. */
const SHOOT_PROFILES: Record<'ATT' | 'MID' | 'DEF', IOutfieldShootProfile> = {
  MID: {
    shoot: {
      withMindset: { threshold: 85, distance: 2 },
      without: { threshold: 65, distance: 2 },
    },
    longShot: {
      withMindset: { threshold: 65, distance: 3 },
      without: { threshold: 45, distance: 3 },
    },
  },
  ATT: {
    shoot: {
      withMindset: { threshold: 100, distance: 3 },
      without: { threshold: 75, distance: 3 },
    },
    longShot: {
      withMindset: { threshold: 75, distance: 5 },
      without: { threshold: 55, distance: 5 },
    },
  },
  DEF: {
    shoot: {
      withMindset: { threshold: 55, distance: 3 },
      without: { threshold: 45, distance: 2 },
    },
    longShot: {
      withMindset: { threshold: 85, distance: 5 },
      without: { threshold: 55, distance: 3 },
    },
  },
};

export class Decider {
  public teams: MatchSide[];

  public strategy: IStrategy = { type: 'move', detail: 'normal' };
  /** Public since Milestone 8's `ShotResolver` (resolver/ShotResolver.ts)
   * shares this exact instance (not a fresh fork) so its shot-target roll
   * stays in the same temporal draw order as every other roll this
   * Decider instance makes - see that file's own doc comment. */
  public readonly random: RandomSource;
  /** Milestone 18 - every candidate action considered for the LAST
   * decision this instance made (empty for a GK decision - see
   * `makeDecision`'s own doc comment on why goalkeepers stay on the older
   * `keeperPass` path). Public for the same reason `strategy` above is:
   * a verification script or future consumer can read it straight off the
   * instance without re-deriving it. */
  public lastCandidates: CandidateAction[] = [];
  private readonly matchId: string;

  constructor(teams: MatchSide[], random?: RandomInput, matchId = 'unknown') {
    this.teams = teams;
    this.random = createRandomSource(random);
    this.matchId = matchId;
  }

  /**
   * MakeDecision
   *
   * Milestone 18 (Score-Based Decisions) - previously a position-keyed
   * switch of sequential threshold checks ("can I shoot? no - am I closest
   * to the post? no - do I have an attacking mindset? ..."), where the
   * first check to pass WON outright and everything else was never even
   * considered. Now: generate every plausible candidate action (shoot,
   * pass, carry, dribble, hold, support - see `generateCandidates`), score
   * each 0-1 by context/ability/role/tendencies/team phase, and choose
   * among ALL of them in one weighted random draw (`chooseCandidate`) - a
   * highly-scored option is likely, not guaranteed, so two players facing
   * near-identical situations can still make different, individually
   * defensible choices ("players show variation without pure randomness",
   * this milestone's own acceptance criterion). Execution - whether a
   * chosen pass actually arrives, a chosen shot actually scores, a chosen
   * dribble actually beats the marker - is entirely unchanged, still the
   * separate resolver/execution machinery `Actions.ts` already had
   * (`passResolver`/`shotResolver`/the dribble-contest in `Actions.move()`)
   * - this method only ever decides WHAT to attempt, never whether it
   * succeeds.
   *
   * GK is deliberately NOT run through the scorer: a goalkeeper in
   * possession only ever has "which pass" to decide (no shoot/carry/
   * dribble/hold/support of its own), so `keeperPass` - unchanged since
   * before this milestone - stays its own narrow path rather than being
   * forced through six candidate types built for outfield decisions.
   *
   * @param player
   * @param attackingSide
   * @param defendingSide
   * @param phase Milestone 18 - `TeamIntent.phase`, now genuinely
   * consumed (see `PHASE_BIAS`) rather than merely threaded through
   * unused, closing the gap `RuleBasedPlayerPolicy`'s own doc comment
   * flagged since Milestone 7.
   * @returns {IStrategy} Strategy player will take
   */
  public makeDecision(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): IStrategy {
    if (!player.WithBall) {
      return this.strategy;
    }

    if (player.Position === 'GK') {
      this.strategy = this.keeperPass(
        player,
        attackingSide,
        defendingSide,
        80
        // player.Attributes.Keeping
      );
      this.lastCandidates = [];
      return this.strategy;
    }

    const candidates = this.generateCandidates(
      player,
      attackingSide,
      defendingSide,
      player.Position as 'ATT' | 'MID' | 'DEF',
      phase
    );
    const chosen = chooseCandidate(candidates, this.random.next());

    this.lastCandidates = candidates;
    this.strategy = this.candidateToStrategy(chosen);

    recordDecision({
      matchId: this.matchId,
      playerId: player._id ?? '',
      position: player.Position,
      candidates,
      chosen,
    });

    return this.strategy;
  }

  /**
   * Milestone 18 - every candidate this outfield player could plausibly
   * attempt right now, each scored but not yet chosen among (see
   * `makeDecision`). Always non-empty: `scoreCarry`/`scoreDribble`/
   * `scoreHold`/`scoreSupport` never bail out early (unlike shoot/pass,
   * which only exist as candidates when actually in range / a receiver
   * exists), so there's always at least a legitimate "keep the ball"
   * fallback - the same guarantee the old switch's final `whatKindaPass`
   * -> 'move' fallback gave, just no longer positioned as a last resort.
   */
  private generateCandidates(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    position: 'ATT' | 'MID' | 'DEF',
    phase?: MatchPhase
  ): CandidateAction[] {
    const candidates: CandidateAction[] = [
      ...this.scoreShootCandidates(player, attackingSide, defendingSide, position, phase),
      ...this.scorePassCandidates(player, attackingSide, defendingSide, phase),
      this.scoreCarry(player, attackingSide, defendingSide, phase),
      this.scoreDribble(player, attackingSide, defendingSide, phase),
      this.scoreHold(player, attackingSide, defendingSide, phase),
      this.scoreSupport(player, attackingSide, defendingSide, phase),
    ];

    const passToPost = this.scorePassToPost(player, attackingSide, defendingSide, phase);
    if (passToPost) {
      candidates.push(passToPost);
    }

    return candidates;
  }

  private applyPhaseBias(
    type: CandidateActionType,
    score: number,
    phase?: MatchPhase
  ): number {
    if (!phase) {
      return score;
    }

    return clamp01(score + (PHASE_BIAS[phase]?.[type] ?? 0));
  }

  /** Lossless mapper from a chosen `CandidateAction` to the older
   * `IStrategy` shape `Actions.takeAction()`'s execution switch still
   * reads - see `decision/CandidateAction.ts`'s module doc comment for
   * why 'carry'/'dribble'/'hold'/'support' all become `type: 'move'`
   * here (execution genuinely doesn't distinguish them today). `detail`
   * still carries the original candidate type through for logging - it
   * was already unread by the execution switch for 'move' before this
   * milestone (confirmed when `PlayerIntent.ts` was first written). */
  private candidateToStrategy(candidate: CandidateAction): IStrategy {
    if (candidate.type === 'shoot') {
      return { type: 'shoot', detail: candidate.detail };
    }

    if (candidate.type === 'pass') {
      return {
        type: 'pass',
        detail: candidate.detail,
        target: candidate.targetId,
      };
    }

    return { type: 'move', detail: candidate.type };
  }

  /**
   * Milestone 18 - shoot utility for both the normal and long-range
   * profile of the given outfield position, as up to two separate
   * candidates (either can be absent - `shootUtility` returns undefined
   * when out of range, same distance gating `tryShoot`/`chanceToShoot`
   * used before this milestone).
   */
  private scoreShootCandidates(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    position: 'ATT' | 'MID' | 'DEF',
    phase?: MatchPhase
  ): CandidateAction[] {
    const profile = SHOOT_PROFILES[position];
    const mindset = player.Attributes.AttackingMindset
      ? 'withMindset'
      : 'without';
    const candidates: CandidateAction[] = [];

    const shootScore = this.shootUtility(
      player,
      attackingSide,
      defendingSide,
      profile.shoot[mindset]
    );
    if (shootScore !== undefined) {
      candidates.push({
        type: 'shoot',
        detail: 'normal',
        score: this.applyPhaseBias('shoot', shootScore, phase),
      });
    }

    const longScore = this.shootUtility(
      player,
      attackingSide,
      defendingSide,
      profile.longShot[mindset]
    );
    if (longScore !== undefined) {
      candidates.push({
        type: 'shoot',
        detail: 'long',
        score: this.applyPhaseBias('shoot', longScore, phase),
      });
    }

    return candidates;
  }

  /**
   * A 0-1 shot-desirability estimate for one shoot profile - the exact
   * same composure/pressure/tempo/shooting-tendency inputs the pre-M18
   * `chanceToShoot()` rolled dice against, just returned as the estimate
   * itself instead of a win/lose roll (the roll now happens once, in
   * `chooseCandidate`, across every candidate at once - not per shot
   * profile in isolation like before).
   */
  private shootUtility(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    profile: IShootProfile
  ): number | undefined {
    const inRange =
      CO.co.calculateDistance(
        player.BlockPosition,
        attackingSide.ScoringSide
      ) <= CO.co.scaleDistance(profile.distance);

    if (!inRange) {
      return undefined;
    }

    const shootingBias =
      (deriveTendencies(player).shooting - 0.5) * SHOOTING_CONFIDENCE_SWING;
    const confidence =
      this.confidenceThreshold(player, attackingSide, defendingSide, profile.threshold) +
      shootingBias;

    return clamp01(confidence / 100);
  }

  /**
   * Milestone 18 - the single best-scored pass, as one candidate (not one
   * candidate per teammate - the plan doc's own Phase 21 example lists
   * exactly one 'pass' option alongside 'shoot'/'carry', not a full
   * teammate-by-teammate breakdown). Still reuses every teammate's scored
   * `PassingOption` under the hood via `selectBestPass` - this only
   * changes how the WINNER is surfaced to the wider candidate pool, not
   * how passes are individually evaluated (unchanged from Milestone 13).
   */
  private scorePassCandidates(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): CandidateAction[] {
    const options = generatePassingOptions(player, attackingSide, defendingSide);
    const best = selectBestPass(options, this.blendedPassingStyle(player, attackingSide));

    if (!best) {
      return [];
    }

    // scorePassingOption's own raw scale runs roughly [-1.3, 1.9]
    // (retention/threat/risk weights, see PassingOption.ts) - rescaled
    // onto the same 0-1 scale every other candidate type uses so they're
    // directly comparable in `chooseCandidate`, not because that raw
    // scale means anything different.
    const normalized = clamp01(best.score / 2 + 0.5);

    return [
      {
        type: 'pass',
        detail: best.passType,
        targetId: best.playerId,
        score: this.applyPhaseBias('pass', normalized, phase),
      },
    ];
  }

  /** Milestone 18 - the pre-M13 "pinned near your own goal, lay it back
   * to the keeper" special case (`Decider.whatKindaPass()`'s old near-post
   * branch), now a real scored candidate instead of a standalone 50%
   * dice-roll short-circuit that skipped every other option outright.
   * Kept as its own narrow case rather than something the general
   * `scorePassCandidates` above should also be free to recommend into -
   * `generatePassingOptions()` still excludes the GK from its own
   * teammate pool (see that function's doc comment), so nothing else
   * would ever produce this pass. */
  private scorePassToPost(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): CandidateAction | undefined {
    if (!this.isNearPost(player, attackingSide, 5, true)) {
      return undefined;
    }

    const pressure = getPressure(player, defendingSide, 3);
    const score = clamp01(0.35 + pressure * 0.15);

    return {
      type: 'pass',
      detail: 'pass to post',
      score: this.applyPhaseBias('pass', score, phase),
    };
  }

  /**
   * Milestone 18 - an uncontested advance: favored by open space (low
   * pressure) and no marker close enough to immediately contest it. Also
   * folds in the old switch's "closest player to the scoring post keeps
   * moving forward" bias (`isClosestToPost`, unchanged) as a smaller
   * additive nudge rather than an outright branch.
   */
  private scoreCarry(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): CandidateAction {
    const tightPressure = getPressure(player, defendingSide, 1);
    const widePressure = getPressure(player, defendingSide, 3);
    const openness = clamp01(1 - widePressure / 4);
    const noCloseMarker = clamp01(1 - tightPressure);
    const advanced = this.isClosestToPost(player, attackingSide) ? 0.15 : 0;

    const score = clamp01(openness * 0.5 + noCloseMarker * 0.35 + advanced);

    return { type: 'carry', score: this.applyPhaseBias('carry', score, phase) };
  }

  /**
   * Milestone 18 - attempting to beat a marker 1v1, as opposed to a plain
   * carry: the OPPOSITE bias from `scoreCarry` - favored precisely when a
   * marker IS close, scaled by the player's own dribbling tendency
   * (Milestone 15) and raw `Dribbling` attribute. Whether the attempt
   * actually succeeds is still entirely `Actions.move()`'s existing
   * dribble-contest formula, untouched by this milestone - this is only
   * "would this player be inclined to try", not "would they win it".
   */
  private scoreDribble(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): CandidateAction {
    const tightPressure = getPressure(player, defendingSide, 1);
    const tendencies = deriveTendencies(player);
    const engaged = clamp01(tightPressure);
    const ability = clamp01((player.Attributes.Dribbling - 30) / 70);

    const score = clamp01(
      engaged * (0.35 + tendencies.dribbling * 0.4 + ability * 0.25)
    );

    return { type: 'dribble', score: this.applyPhaseBias('dribble', score, phase) };
  }

  /**
   * Milestone 18 - shield the ball and buy time rather than committing to
   * anything: favored under heavy pressure (nothing else looks safe),
   * composure (`Mental`), and a patient team tactic (low `style.tempo`).
   * A genuinely new decision shape - the pre-M18 switch had no equivalent
   * "just hold it" branch at all, only ever pass/move/shoot.
   */
  private scoreHold(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): CandidateAction {
    const pressure = getPressure(player, defendingSide, 3);
    const composure = clamp01(player.Attributes.Mental / 100);
    const patience = 1 - attackingSide.Tactic.style.tempo;

    // Milestone 18 - pressure-WEIGHTED, not pressure-gated: 'hold' should
    // read as "nothing else looks safe right now", not a comfortable
    // baseline every player can lean on regardless of pressure. Divided by
    // 6, not 4 like `scoreCarry`'s "am I open" check - a single nearby
    // defender within the radius-3 pressure count is the common case in
    // this engine's compact grid, not yet "heavily pressured"; only
    // multiple converging defenders should meaningfully push this up.
    // Verified live via verifyScoredDecisions.ts - an earlier, flatter
    // version of this formula made 'hold' the single most-picked action
    // across a sample, well ahead of 'pass', which isn't remotely
    // realistic.
    const score = clamp01(
      clamp01(pressure / 6) * 0.7 + composure * 0.15 + patience * 0.1
    );

    return { type: 'hold', score: this.applyPhaseBias('hold', score, phase) };
  }

  /**
   * Milestone 18 - drift sideways/backward to keep possession and let the
   * shape develop, rather than forcing something forward: favored by low
   * `PlayerTendencies.directness`/high `discipline`, low pressure, and
   * (more so for DEF/MID than ATT, who have less reason to drop off) a
   * patient build-up. Also a genuinely new decision shape, same as
   * `scoreHold` above.
   */
  private scoreSupport(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    phase?: MatchPhase
  ): CandidateAction {
    const tendencies = deriveTendencies(player);
    const pressure = getPressure(player, defendingSide, 3);
    const positional = player.Position === 'ATT' ? 0.3 : 0.6;

    const score = clamp01(
      positional * (1 - tendencies.directness) * 0.55 +
        clamp01(1 - pressure / 4) * 0.25 +
        tendencies.discipline * 0.2
    );

    return { type: 'support', score: this.applyPhaseBias('support', score, phase) };
  }

  /**
   * How many opposing outfield players are pressuring this player, i.e.
   * within `radius` blocks of him. Moved to `spatial/PressureAnalyzer.ts`
   * in Milestone 10 - `ObservationBuilder` now calls the exact same
   * function, so this and `PlayerObservation.pressure` can never drift
   * apart again.
   */
  private countPressure(
    player: IFieldPlayer,
    defendingSide: MatchSide,
    radius: number
  ): number {
    return getPressure(player, defendingSide, radius);
  }

  /**
   * Adjusts a base confidence threshold by the player's composure (Mental),
   * how many opponents are pressuring him, and his own team's playing style.
   * A composed player under little pressure gets a higher effective
   * threshold (more likely to take the shot/attempt); a low-Mental player
   * swarmed by defenders gets a much lower one (more likely to bail into a
   * pass instead). A higher-tempo style nudges every such attempt more
   * eager; a patient style nudges it more cautious.
   */
  private confidenceThreshold(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    base: number,
    pressureRadius = 3
  ): number {
    const composure = (player.Attributes.Mental - 50) * 0.3;
    const pressure =
      this.countPressure(player, defendingSide, pressureRadius) * 8;
    const tempoBias = (attackingSide.Tactic.style.tempo - 0.5) * 20;

    return Math.min(100, Math.max(0, base + composure - pressure + tempoBias));
  }

  /**
   * GimmeAChance - _just give me a chance!_
   *
   * Returns a random percentage
   * @returns {number} chance threshold
   */
  public gimmeAChance(): number {
    return Math.round(this.random.next() * 100);
  }

  /**
   * Milestone 15 - blends this player's own `PlayerTendencies.directness`
   * with the team tactic's `style.directness` before scoring passing
   * options, so "tactics, role, ability, and tendencies combine" (this
   * milestone's own acceptance criterion) for pass SELECTION, not just
   * for the pass-vs-dribble threshold above. A direct-tactic team still
   * plays a deep-playmaker's passes safer than a winger's under the exact
   * same tactic.
   */
  private blendedPassingStyle(
    player: IFieldPlayer,
    attackingSide: MatchSide
  ) {
    const style = attackingSide.Tactic.style;
    const playerDirectness = deriveTendencies(player).directness;

    return {
      ...style,
      directness: Math.min(
        1,
        Math.max(0, (style.directness + playerDirectness) / 2)
      ),
    };
  }

  /**
   * Passability
   *
   * This determines if passing is a good move for the player: is a
   * suitable teammate close enough, AND is the lane to them actually clear
   * of defenders (rather than just checking distance to the receiver).
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @param {MatchSide} defendingSide
   * @param {number} distance max distance a teammate should be
   */
  private passability(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    distance: number,
    teammatePosition: boolean
  ): boolean {
    // Check the several closest teammates, not just the single nearest one.
    // With realistic defensive shape (players spread across a formation
    // rather than swarming the ball), the single closest teammate's lane
    // being blocked is common - that shouldn't kill the whole pass
    // evaluation when another nearby teammate is completely open.
    const candidates = getNearestTeammates(
      player,
      attackingSide.ActivePlayers,
      3
    );

    const scaledDistance = CO.co.scaleDistance(distance);

    return candidates.some((teammate) => {
      const teammateIsClose =
        CO.co.calculateDistance(player.BlockPosition, teammate.BlockPosition) <=
        scaledDistance;

      if (!teammateIsClose) {
        return false;
      }

      const laneIsClear = this.laneIsClear(player, teammate, defendingSide);

      if (teammatePosition) {
        // Pass to Attackers or Midfielders
        return (
          (teammate.Position === 'ATT' || teammate.Position === 'MID') &&
          laneIsClear
        );
      }

      return laneIsClear;
    });
  }

  /**
   * Is the straight line between player and teammate free of defenders?
   * Uses actual lane geometry (perpendicular distance to the pass line)
   * rather than just proximity to the receiver. Moved to
   * `spatial/PassingAnalyzer.ts` in Milestone 10.
   */
  private laneIsClear(
    player: IFieldPlayer,
    teammate: IFieldPlayer,
    defendingSide: MatchSide,
    laneWidth = 1.5
  ): boolean {
    return getPassingLane(
      player.BlockPosition,
      teammate.BlockPosition,
      defendingSide,
      laneWidth
    ).clear;
  }

  /**
   * isNearPost
   *
   * Check if player is near the post
   * @param {IFieldPlayer} player Player in focus
   * @param {MatchSide} attackingSide Player's team
   * @returns {boolean} true/false
   */
  private isNearPost(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    distance: number,
    ownPost = false
  ): boolean {
    const scaledDistance = CO.co.scaleDistance(distance);

    if (ownPost) {
      return (
        CO.co.calculateDistance(
          player.BlockPosition,
          attackingSide.KeepingSide
        ) <= scaledDistance
      );
    } else {
      return (
        CO.co.calculateDistance(
          player.BlockPosition,
          attackingSide.ScoringSide
        ) <= scaledDistance
      );
    }
  }

  /**
   * isClosestToPost
   *
   * Check if player is the closest in his team to the post
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @returns {boolean} true/false
   */
  private isClosestToPost(
    player: IFieldPlayer,
    attackingSide: MatchSide
  ): boolean {
    return (
      CO.co.findClosestPlayerInclusive(
        attackingSide.ScoringSide,
        attackingSide.ActivePlayers
      ) === player
    );
  }

  /**
   * KeeperPass
   *
   * Determines the kind of pass keeper will make
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @param {boolean} chance
   * @returns {IStrategy} kind of pass
   */
  private keeperPass(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    chance: number
  ): IStrategy {
    let strategy: IStrategy = { type: 'pass', detail: 'long' };

    if (this.passability(player, attackingSide, defendingSide, 3, false)) {
      if (
        player.Attributes.LongPass > player.Attributes.ShortPass &&
        this.gimmeAChance() <= chance
      ) {
        strategy = { type: 'pass', detail: 'long' };
      } else {
        strategy = { type: 'pass', detail: 'short' };
      }
    } else {
      strategy = { type: 'pass', detail: 'long' };
    }

    return strategy;
  }
}

interface deciderPart {
  attribute: string;
  weight: number;
  value: number;
}
export interface IStrategy {
  type: 'pass' | 'move' | 'shoot';
  detail?: string;
  /** Milestone 13 - the chosen receiver's id, when a 'pass' strategy came
   * from `generatePassingOptions()`/`selectBestPass()` rather than the
   * older type-only paths (`keeperPass`, the near-post backpass special
   * case) - those leave this undefined, and `Actions.pass()` falls back to
   * its pre-existing type-based receiver lookup exactly as before. */
  target?: string;
}
