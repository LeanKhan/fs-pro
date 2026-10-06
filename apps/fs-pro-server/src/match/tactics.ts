/**
 * Tactics a manager can pick: a formation and a playing style. The match
 * engine (crates/sim-core tactics.rs) turns them into positions and
 * behaviour - keep the names here in step with what it accepts.
 */

/** Formations the engine has shapes for (tactics.rs get_formation_anchors). */
export const FORMATIONS = ['433', '442', '4231', '352', '343', '532', '541', '4141', '451', '41212'] as const;

/** A playing style's sliders, as shown to managers. The engine has its own
 * copy of the defaults per style name (tactics.rs match_style_defaults). */
export interface IPlayingStyle {
  name: string;
  /** How many players close the ball down (1 = sit off, 4 = swarm). */
  pressingIntensity: number;
  /** 0 = drifts freely, 1 = strictly holds position. */
  positionalDiscipline: number;
  /** 0 = deep/low block, 1 = high defensive line. */
  defensiveLineHeight: number;
  /** 0 = narrow, 1 = stretches play across the full pitch width. */
  width: number;
  /** 0 = patient, 1 = fast-paced. */
  tempo: number;
  /** 0 = short-passing bias, 1 = direct/long-passing bias. */
  directness: number;
}

export const PLAYING_STYLES: Record<string, IPlayingStyle> = {
  Balanced: {
    name: 'Balanced',
    pressingIntensity: 2,
    positionalDiscipline: 0.5,
    defensiveLineHeight: 0.5,
    width: 0.6,
    tempo: 0.5,
    directness: 0.5,
  },
  HighPress: {
    name: 'High Press',
    pressingIntensity: 4,
    positionalDiscipline: 0.3,
    defensiveLineHeight: 0.8,
    width: 0.55,
    tempo: 0.7,
    directness: 0.5,
  },
  LowBlock: {
    name: 'Low Block',
    pressingIntensity: 1,
    positionalDiscipline: 0.8,
    defensiveLineHeight: 0.15,
    width: 0.5,
    tempo: 0.3,
    directness: 0.6,
  },
  Possession: {
    name: 'Possession',
    pressingIntensity: 2,
    positionalDiscipline: 0.6,
    defensiveLineHeight: 0.55,
    width: 0.7,
    tempo: 0.4,
    directness: 0.25,
  },
  Direct: {
    name: 'Direct',
    pressingIntensity: 3,
    positionalDiscipline: 0.4,
    defensiveLineHeight: 0.45,
    width: 0.5,
    tempo: 0.8,
    directness: 0.85,
  },
};

/** The storable choice. */
export interface ITactic {
  formationName: string;
  styleName: string;
}

export const DEFAULT_TACTIC: ITactic = {
  formationName: '433',
  styleName: 'Balanced',
};

/** A manager's preferred tactic, falling back to the default. */
export function tacticFromManager(
  manager: { PreferredFormation?: string; PreferredStyle?: string } | null | undefined
): ITactic {
  if (!manager) {
    return DEFAULT_TACTIC;
  }
  return {
    formationName: manager.PreferredFormation || DEFAULT_TACTIC.formationName,
    styleName: manager.PreferredStyle || DEFAULT_TACTIC.styleName,
  };
}

/**
 * Maps a style name as stored or typed ("High Press", "high press",
 * "HighPress") onto its PLAYING_STYLES key. Undefined when nothing matches.
 */
export function findPlayingStyleKey(styleName: string | undefined | null): string | undefined {
  if (!styleName) return undefined;
  if (PLAYING_STYLES[styleName]) return styleName;
  const squash = (name: string) => name.replace(/[\s_-]+/g, '').toLowerCase();
  return Object.keys(PLAYING_STYLES).find((key) => squash(key) === squash(styleName));
}
