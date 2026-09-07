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
  shooting: {
    // Decider.ts's SHOOT_PROFILES, as of Milestone 18's re-tuning (the
    // values a shoot candidate now competes on, not the pre-M18
    // sequential-gate values).
    profiles: {
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
    },
    // Decider.ts's SHOOTING_CONFIDENCE_SWING.
    confidenceSwing: 30,
    // ShotResolver.ts's shooter-vs-keeper getResult() call.
    duel: { shooterPower: 80, keeperPower: 70 },
    // ShotResolver.ts's isNearScoringPost() distance.
    nearPostDistance: 2,
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
    },
    // TackleResolver.resolveDribble()'s execution-layer duel.
    contest: {
      dribblerDribblingWeight: 60,
      dribblerSpeedWeight: 40,
      dribblerPower: 65,
      opponentPower: 80,
    },
  },

  tackling: {
    // TackleResolver.resolveTackle()'s duel.
    contest: { tacklerPower: 80, ballHolderPower: 70 },
  },

  fouls: {
    // Actions.tackle()'s foulChance roll.
    chance: { base: 30, aggressionCoefficient: 0.3 },
    // Referee.foul()'s card-severity split.
    cardThresholds: { red: 3, yellow: 25 },
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
    baseDrainPerTick: 0.2,
    pressingDrainScale: 0.07,
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
      driftPerTick: 0.01,
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
