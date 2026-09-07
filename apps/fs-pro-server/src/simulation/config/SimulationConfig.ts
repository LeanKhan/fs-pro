/**
 * Milestone 19 (Simulation Config And Calibration) - the tracker's own
 * target structure names `packages/simulation/config/` - that package
 * doesn't exist yet (Milestone 2's extraction is still not started; every
 * simulation module today lives under `apps/fs-pro-server/src/simulation/`
 * with the rest of the engine). Same "revise scope, document why"
 * treatment prior milestones gave their own aspirational target
 * structures: this lives at `src/simulation/config/` instead, right next
 * to every sibling module (`decision/`, `passing/`, `randomness/`, ...) -
 * moving straight to `packages/simulation` when Milestone 2 actually
 * happens.
 *
 * This file is the SHAPE only (a pure type, no runtime values, no
 * imports) - see `defaultSimulationConfig.ts` for the actual hand-tuned
 * numbers and the get/set/merge accessors, matching the split
 * `randomness/RandomSource.ts` already established (type + factories in
 * one place, `index.ts` re-exporting both).
 *
 * Deliberately NOT exhaustive over every magic number in the engine.
 * Covers the tracker's own seven named categories (shooting/passing/
 * dribbling/tackling/fouls/pressing/movement) with the real, previously-
 * hardcoded values that drive them - but `resolver/PassResolver.ts`'s five
 * pass-type branches (each with 3-5 individually attribute-weighted
 * duel params, empirically justified inline against real attribute-
 * distribution findings - see that file's own doc comments) are
 * deliberately NOT flattened into config entries here. Turning ~50
 * tightly-reasoned, individually-commented numbers into generic config
 * keys would strip the load-bearing "why" each one carries without
 * meaningfully improving on "one config surface" - the other ~30
 * constants below already make that true for the levers a calibration
 * pass would actually reach for first (shot/tackle/dribble/foul duel
 * weights, pass-shape geometry, pressing radii, marking/space rules).
 */

export interface ShootProfileBand {
  /** Fed into `confidenceThreshold()` as the base confidence (0-100)
   * before composure/pressure/tempo adjustments - despite the name, a
   * HIGHER value means MORE likely to shoot, not a gate to clear. */
  threshold: number;
  /** Max shooting distance, in `CO.co.scaleDistance()` units. */
  distance: number;
}

export interface OutfieldShootProfile {
  shoot: { withMindset: ShootProfileBand; without: ShootProfileBand };
  longShot: { withMindset: ShootProfileBand; without: ShootProfileBand };
}

export interface ShootingConfig {
  /** `Decider.ts`'s `SHOOT_PROFILES` - per-position shoot/long-shot bands. */
  profiles: Record<'ATT' | 'MID' | 'DEF', OutfieldShootProfile>;
  /** Milestone 15's per-player shooting-tendency swing on top of a
   * profile's threshold - `Decider.shootUtility()`. */
  confidenceSwing: number;
  /** `ShotResolver.resolve()`'s shooter-vs-keeper duel skill weights
   * (the two `getResult()` power args, 0-100 each). */
  duel: { shooterPower: number; keeperPower: number };
  /** `ShotResolver.isNearScoringPost()`'s "close enough to just aim at
   * goal" distance, in `scaleDistance()` units. */
  nearPostDistance: number;
}

export interface PassingConfig {
  /** `PassingOption.classifyPassType()`'s geometry thresholds, each in
   * `scaleDistance()` units (except `wideLateral`, a raw lateral-offset
   * threshold in the same units). */
  classification: {
    backward: number;
    through: number;
    wideLateral: number;
    shortMax: number;
    longMin: number;
  };
  /** `PassingOption.scorePassingOption()`'s directness-driven coefficients -
   * `retentionWeight = retentionBase + directness * retentionDirectnessCoeff`,
   * same pattern for `threatWeight`/`riskWeight`. */
  scoringWeights: {
    retentionBase: number;
    retentionDirectnessCoeff: number;
    threatBase: number;
    threatDirectnessCoeff: number;
    riskBase: number;
    riskDirectnessCoeff: number;
  };
  /** `Actions.pass()`'s interceptor-search distance, by pass type -
   * `INTERCEPTOR_DISTANCE_BY_PASS_TYPE`, plus a `default` for any type
   * not explicitly listed. */
  interceptorDistanceByType: Record<string, number> & { default: number };
}

export interface DribblingConfig {
  /** `Decider.scoreDribble()`'s DECISION-layer weights - whether a player
   * would even be inclined to try, not whether they'd win it. */
  decision: {
    base: number;
    tendencyWeight: number;
    abilityWeight: number;
    abilityFloor: number;
    abilityCeiling: number;
  };
  /** `TackleResolver.resolveDribble()`'s EXECUTION-layer duel - whether
   * the attempt actually beats the marker. */
  contest: {
    dribblerDribblingWeight: number;
    dribblerSpeedWeight: number;
    dribblerPower: number;
    opponentPower: number;
  };
}

export interface TacklingConfig {
  /** `TackleResolver.resolveTackle()`'s duel skill weights. */
  contest: { tacklerPower: number; ballHolderPower: number };
}

export interface FoulsConfig {
  /** `Actions.tackle()`'s foul-chance roll -
   * `base + (Aggression - Tackling) * aggressionCoefficient`, clamped
   * 0-100. */
  chance: { base: number; aggressionCoefficient: number };
  /** `Referee.foul()`'s three-way card-severity split (0-100 roll,
   * multiplied by the match's difficulty setting). */
  cardThresholds: { red: number; yellow: number };
}

export interface PressingConfig {
  /** `Decider`'s own pressure-radius calls (`scoreCarry`/`scoreDribble`'s
   * "is a marker RIGHT next to me" check vs the wider "how contested is
   * this area" check every scorer uses), in `scaleDistance()` units. */
  tightRadius: number;
  wideRadius: number;
  /** `OffBallPolicy.decideAttackingOffBallIntent()`'s own pressure check. */
  offBallRadius: number;
  /** `OffBallPolicy.planDefensiveAssignments()`'s man-marking rules. */
  markingRange: number;
  maxMarkedThreats: number;
}

export interface MovementConfig {
  /** `OffBallPolicy.isWideAnchor()`'s flank band, as a fraction of pitch
   * height either side of the centre line. */
  wideAnchorBandFraction: number;
  /** `OffBallPolicy.decideAttackingOffBallIntent()`'s `getSpaceAhead()`
   * radii for its 'move-between-lines'/'make-run' checks. */
  spaceAheadNear: number;
  spaceAheadFar: number;
}

export interface FatigueConfig {
  /** `PlayerCondition.updatePlayerConditionTick()`'s flat per-tick stamina
   * drain, before pressing/ability adjustments - applied to every active
   * player, every tick, regardless of whether they're currently on the
   * ball. */
  baseDrainPerTick: number;
  /** Extra per-tick drain, scaled by the DEFENDING side's own
   * `Tactic.style.pressingIntensity` and applied only to that side (the
   * one actually out of possession and doing the pressing) - the literal
   * mechanism behind "high pressing has a visible cost" (this milestone's
   * own acceptance criterion). NOT a 0-1 fraction despite most other
   * `IPlayingStyle` fields being one - `pressingIntensity` is a small
   * player COUNT (`state/PersistentState/Formations.ts`'s own
   * `PLAYING_STYLES` table ranges 1-4, and `Actions.ts` genuinely
   * `.slice(0, pressingIntensity)`s with it) - found live while
   * calibrating this value (an initial 0-1-scale guess drained everyone
   * to near-zero by full time; see the tracker's own Milestone 20 notes). */
  pressingDrainScale: number;
  /** How much the player's own `Attributes.Stamina` rating reduces drain -
   * 0 = no effect, 1 = a 100-Stamina player takes zero drain at all. */
  abilityMitigation: number;
  /** Fraction of LOST stamina restored at half-time (0-1) - a real but
   * partial recovery, not a full reset (`Game.ts`'s half-time
   * transition). */
  halfTimeRecoveryFraction: number;
  /** `sharpness = stamina * this + confidence * (1 - this)` - how much of
   * match sharpness is physical (stamina) vs mental (confidence). */
  sharpnessStaminaWeight: number;
  /** Max fractional reduction to an EXECUTION-layer attribute read at full
   * (100) fatigue - `PlayerCondition.getFatigueMultiplier()`, consumed by
   * `TackleResolver`/`ShotResolver`. Bounded so a fully gassed player is
   * meaningfully worse, never functionally useless. */
  executionImpact: number;
  /** Fatigue (0-100) above which `OffBallPolicy` downgrades an energetic
   * off-ball intent ('make-run'/'overlap'/'attack-box'/'press') to a
   * lower-effort one ('support'/'cover') - the "fatigue affects movement
   * [and] pressing" task, at the DECISION layer (whether a tired player
   * even attempts the run), separate from `executionImpact` above (how
   * well an attempt executes). */
  lowEnergyThreshold: number;
  injuryRisk: {
    /** `injuryRisk += fatigue * this` (fatigue 0-100 -> risk 0-100). */
    fatigueScale: number;
    /** `injuryRisk += max(0, Age - ageBaseline) * this`. */
    ageScale: number;
    ageBaseline: number;
  };
  confidence: {
    /** Starting/neutral confidence (0-100) - also the value confidence
     * slowly drifts back toward each tick. */
    initial: number;
    /** Fraction of the gap to `initial` closed per tick - a recent hot/
     * cold streak fades over time rather than permanently sticking. */
    driftPerTick: number;
    /** Applied by `PlayerCondition.nudgeConfidence()` on a successful
     * shot/pass/dribble/tackle. */
    successDelta: number;
    /** Same, on a failed one - deliberately more negative than
     * `successDelta` is positive: a real "confidence is easier to lose
     * than build" asymmetry. */
    failureDelta: number;
  };
  /** How much `Condition.confidence`'s distance from neutral (0-100)
   * shifts `Decider.shootUtility()`/`scoreDribble()`'s score, on the same
   * 0-1 scale those scores use - "let repeated success/failure nudge...
   * action preference" (this milestone's own task). */
  decisionConfidenceWeight: number;
  /** Per-consecutive-failed-dribble score penalty in `Decider.scoreDribble()`
   * (`Memory.recentFailedDribbles`) - the plan doc's own "three
   * unsuccessful dribbles -> confidence falls -> slightly more likely to
   * pass" example, as a concrete number. */
  recentFailedDribblePenalty: number;
  /** Score bonus in `Decider.scoreDribble()` when the player's current
   * tight marker is the same opponent `Memory.opponentBeatenRecently`
   * names - the plan doc's own "winger repeatedly beats the same
   * fullback -> more willingness to attack him" example. */
  opponentBeatenBonus: number;
}

export interface SimulationConfig {
  shooting: ShootingConfig;
  passing: PassingConfig;
  dribbling: DribblingConfig;
  tackling: TacklingConfig;
  fouls: FoulsConfig;
  pressing: PressingConfig;
  movement: MovementConfig;
  fatigue: FatigueConfig;
}

/** Recursive partial - lets a caller override a single leaf (e.g. just
 * `shooting.confidenceSwing`) without repeating the entire tree. Plain
 * nested objects only (every leaf in `SimulationConfig` is a number or a
 * flat `Record<string, number>`) - no arrays, so this doesn't need to
 * handle them. */
export type DeepPartialSimulationConfig = {
  [K in keyof SimulationConfig]?: {
    [P in keyof SimulationConfig[K]]?: SimulationConfig[K][P] extends object
      ? Partial<SimulationConfig[K][P]>
      : SimulationConfig[K][P];
  };
};
