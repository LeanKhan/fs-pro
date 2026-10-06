import {
  DeepPartialSimulationConfig,
  SimulationConfig,
} from './SimulationConfig';

/**
 * Milestone 19 (Simulation Config And Calibration) - every value below is
 * relocated, not retuned: each one is the exact number that previously
 * lived as a hardcoded constant in the file named in its comment. Moving
 * them here changes WHERE behavior is tuned from, not what the behavior
 * IS - verified via `simRealismCheck.ts --compare` showing byte-identical
 * aggregate output before/after this milestone (a pure refactor, unlike
 * Milestone 18's mechanism change, which genuinely needed re-tuning).
 *
 * Calibration notes: the real-world bands every one of these was
 * ultimately tuned against live in `simRealismCheck.ts`'s own
 * `REFERENCE_RANGES` (goals/shots/passes/tackles/fouls/cards per match) -
 * not duplicated here. A tuning pass should change a value below, then
 * run `simRealismCheck.ts --compare` against a pre-change baseline (see
 * that script's own usage comment) - this file is the SURFACE to tune
 * from, that script is still the JUDGE of whether a change helped.
 */
export const defaultSimulationConfig: SimulationConfig = {
  // Outcome models - see OutcomesConfig and resolver/outcomeModel.ts.
  // Calibrated with scripts/agencyCheck.ts (does quality/tactics move
  // results?) and scripts/simRealismCheck.ts (does it look like football?).
  outcomes: {
    pitch: { lengthMetres: 105, widthMetres: 68, goalWidthMetres: 7.32 },
    shot: {
      // Solved from ~0.50 xG at 6m and ~0.07 at 20m (central, angle
      // coefficient fixed at 1) - lands ~0.25 at the penalty spot.
      intercept: -0.7,
      angleCoeff: 1,
      distanceCoeff: -0.132,
      blockerLogit: -0.6,
      pressureLogit: -0.35,
      oneOnOneLogit: 0.5,
      penaltyXg: 0.76,
      freeKickXg: 0.07,
      skillPivot: 60,
      shooterScale: 25,
      keeperScale: 30,
      maxGoalProbability: 0.9,
      onTarget: {
        base: 0.3,
        skillScale: 200,
        pressurePenalty: 0.05,
        distancePenaltyPerMetre: 0.004,
      },
    },
    pass: {
      base: { short: 0.95, backward: 0.97, wide: 0.88, long: 0.78, through: 0.62, default: 0.9 },
      comfortableMetres: 15,
      distanceLogitPerMetre: -0.02,
      passerPressureLogit: -0.25,
      receiverPressureLogit: -0.2,
      blockerLogit: -0.6,
      passerScale: 25,
      interceptorScale: 30,
      throughBallLineLogit: 1.2,
    },
    duel: {
      tackleBase: 0.5,
      dribbleBase: 0.38,
      skillScale: 20,
      engageBase: 0.45,
      engageAggressionScale: 200,
      engagePressingStep: 0.08,
    },
  },
  decisions: {
    temperatureMax: 0.16,
    temperatureMin: 0.06,
    qualityFloor: 35,
    qualityCeiling: 85,
    passValueBase: 0.6,
    passThreatWeight: 0.8,
    style: {
      tempoHold: -0.3,
      tempoSupport: -0.2,
      tempoCarry: 0.15,
      tempoShoot: 0.1,
      directnessForward: 0.4,
      directnessSafe: -0.2,
      widthWide: 0.3,
    },
  },
  shooting: {
    // Decider.ts's SHOOT_PROFILES, as of Milestone 18's re-tuning (the
    // values a shoot candidate now competes on, not the pre-M18
    // sequential-gate values).
    profiles: {
      MID: {
        shoot: {
          withMindset: { threshold: 85, distance: 2 },
          // Shots-per-team realism gap fix. `calculateDistance()` is
          // Manhattan (|dx|+|dy|), and `getAttackingPhase()`'s own
          // 'final-third' cutoff is defined against the SAME metric
          // (fraction of `pitchLength`, itself a pure Manhattan distance
          // between the two goal points) - so a player sitting at the
          // OUTER edge of the final third, dead-central (zero Y offset),
          // is already close to `pitchLength / 3` blocks from goal. On
          // this 33-wide grid that's ~10.7 blocks - distance:2 or :3
          // (scaled ~4.4/6.6 blocks) left most of that zone unreachable
          // regardless of scoring; confirmed live via a first pass at
          // distance:3 and :4 (behaviorRegressionSuite.ts's shot
          // conversion funnel) - MID's shoot-candidate rate stayed flat at
          // ~14-18% either way, both still short of covering the outer
          // final-third band. Widened to :5 (scaled ~11 blocks, matching
          // ATT's own longShot distance) to actually cover the zone this
          // phase is named for - re-verify against a larger sample before
          // calling this settled.
          without: { threshold: 65, distance: 5 },
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
    },
    // Decider.ts's SHOOTING_CONFIDENCE_SWING.
    confidenceSwing: 30,
    // ~0.15 for a 0.02 xG speculative effort, ~0.8 for a 0.2 xG chance in
    // the box - players work the ball closer instead of shooting on sight.
    selection: { xgSensitivity: 7, chanceWeight: 0.75 },
  },

  passing: {
    // PassingOption.ts's classifyPassType() thresholds.
    classification: {
      backward: 1,
      through: 3,
      wideLateral: 3,
      shortMax: 4,
      longMin: 7,
    },
    // PassingOption.ts's scorePassingOption() coefficients.
    scoringWeights: {
      retentionBase: 1,
      retentionDirectnessCoeff: -0.9,
      threatBase: 0.3,
      threatDirectnessCoeff: 1.5,
      riskBase: 1,
      riskDirectnessCoeff: -0.8,
    },
    // Actions.ts's INTERCEPTOR_DISTANCE_BY_PASS_TYPE, plus its own
    // `?? 2` fallback for any unlisted type as `default`.
    interceptorDistanceByType: {
      short: 2,
      backward: 2,
      long: 3,
      'pass to post': 3,
      through: 3,
      wide: 3,
      default: 2,
    },
  },

  dribbling: {
    // Decider.scoreDribble()'s decision-layer weights.
    decision: {
      base: 0.35,
      tendencyWeight: 0.4,
      abilityWeight: 0.25,
      abilityFloor: 30,
      abilityCeiling: 70,
      // Dribble desire x P(beat this marker) x successWeight: ~0.37 for an
      // average dribbler, ~0.8 for a gifted one, ~0.18 for a poor one.
      successWeight: 1,
      // 'hold' is a last resort under heavy pressure, not a default.
      holdScale: 0.6,
    },
  },


  fouls: {
    // Actions.tackle()'s foulChance roll.
    // Per tackle ATTEMPT; lowered from 30 when the match clock went from
    // 2 to 8 ticks/minute (more, smaller contests).
    chance: { base: 20, aggressionCoefficient: 0.3 },
    // Referee.foul()'s card-severity split.
    // ~0.6% of fouls a straight red, ~14% a yellow (real-world rates).
    cardThresholds: { red: 0.6, yellow: 15 },
  },

  pressing: {
    // Decider's own scoreCarry/scoreDribble (tight, radius 1) vs
    // scoreCarry/scoreHold/scoreSupport (wide, radius 3) pressure checks.
    tightRadius: 1,
    wideRadius: 3,
    // OffBallPolicy.decideAttackingOffBallIntent()'s pressure check.
    offBallRadius: 2,
    // OffBallPolicy.planDefensiveAssignments()'s man-marking rules.
    markingRange: 2.5,
    maxMarkedThreats: 2,
  },

  movement: {
    // OffBallPolicy.isWideAnchor()'s flank band.
    wideAnchorBandFraction: 0.2,
    // OffBallPolicy.decideAttackingOffBallIntent()'s getSpaceAhead radii.
    spaceAheadNear: 3,
    spaceAheadFar: 4,
    // Shots-per-team realism gap fix - a central MID's 'support-box' pull
    // toward goal, shallower than ATT's 'attack-box' (0.7).
    supportBoxBias: 0.45,
    supportBoxLateralWeight: 0.75,
  },

  // Milestone 20 (Fatigue, Confidence, And Player Memory) - see
  // PlayerCondition.ts's own doc comments for the exact formulas each of
  // these feeds. Over a full 180-tick match, a player on the side that
  // spends roughly half the match defending at a HighPress-style
  // `pressingIntensity` (4, see `FatigueConfig.pressingDrainScale`'s own
  // doc comment on why this is a small count, not a 0-1 fraction) ends up
  // meaningfully more drained than one on a LowBlock-style side (1) - the
  // whole point of `pressingDrainScale` existing as its own separate term
  // from `baseDrainPerTick`.
  fatigue: {
    // Per match MINUTE (were per 30-second tick: 0.2 / 0.07 / 0.01) so the
    // match clock's resolution can change without retuning fatigue.
    baseDrainPerMinute: 0.4,
    pressingDrainScale: 0.14,
    abilityMitigation: 0.3,
    halfTimeRecoveryFraction: 0.3,
    sharpnessStaminaWeight: 0.6,
    executionImpact: 0.25,
    lowEnergyThreshold: 65,
    injuryRisk: {
      fatigueScale: 0.4,
      ageScale: 1.5,
      ageBaseline: 30,
    },
    confidence: {
      initial: 50,
      driftPerMinute: 0.02,
      successDelta: 4,
      failureDelta: -5,
    },
    decisionConfidenceWeight: 0.15,
    recentFailedDribblePenalty: 0.08,
    opponentBeatenBonus: 0.1,
  },
};

let simulationConfig: SimulationConfig = defaultSimulationConfig;

/** Milestone 19 - "config override support for scripts/tests", the same
 * module-singleton pattern `randomness/RandomSource.ts` already
 * established for `setSimulationRandomSource`/`getSimulationRandomSource`.
 * Every consumer below reads `getSimulationConfig()` fresh at the moment
 * it's needed (never cached in a constructor), so a script/test can swap
 * configs mid-run - e.g. simulate the same fixture twice, once per
 * tactic-sensitivity variant, without constructing anything new. */
export function setSimulationConfig(config: SimulationConfig): SimulationConfig {
  simulationConfig = config;
  return simulationConfig;
}

export function getSimulationConfig(): SimulationConfig {
  return simulationConfig;
}

export function resetSimulationConfig(): SimulationConfig {
  simulationConfig = defaultSimulationConfig;
  return simulationConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merges `overrides` onto the CURRENT config (not always the
 * default - stacking a second override doesn't discard the first) and
 * installs the result. The common case for a calibration script: change
 * one or two leaves, leave everything else at its tuned default. */
export function mergeSimulationConfig(
  overrides: DeepPartialSimulationConfig
): SimulationConfig {
  const merged = deepMerge(
    simulationConfig as unknown as Record<string, unknown>,
    overrides as unknown as Record<string, unknown>
  ) as unknown as SimulationConfig;

  return setSimulationConfig(merged);
}

function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(overrides)) {
    const overrideValue = overrides[key];
    const baseValue = base[key];

    result[key] =
      isPlainObject(overrideValue) && isPlainObject(baseValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue;
  }

  return result;
}
