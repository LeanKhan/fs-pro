import Field, { IBlock } from '../ImmutableState/FieldGrid';

/**
 * A formation slot, defined independently of grid size.
 *
 * x/y are fractions of the pitch (0-1), always expressed as if the team
 * is attacking left-to-right:
 *   x: 0   = own goal line
 *   x: 1   = opponent's goal line
 *   y: 0   = one flank
 *   y: 1   = other flank
 *
 * Resolving a slot to a real block on the current grid (and flipping it
 * for a team attacking right-to-left) happens in resolveFormation().
 */
export interface FormationSlot {
  positions: string[];
  x: number;
  y: number;
}

export interface FormationShapes {
  [formationName: string]: FormationSlot[];
}

export type AttackingDirection = 'left-to-right' | 'right-to-left';

export interface ResolvedFormationSlot {
  positions: string[];
  block: IBlock;
}

/**
 * Canonical formation shapes.
 *
 * Previously HOME-433 and AWAY-433 were two separate hardcoded arrays of
 * block numbers, tied to a 15x11 grid, and mirrored by hand. That broke the
 * moment the grid size changed, and duplicated every tweak across both
 * arrays. Now there's a single '433' shape, and resolveFormation() derives
 * both sides' actual positions from it for whatever grid is in play.
 */
export const formationShapes: FormationShapes = {
  '433': [
    { positions: ['GK'], x: 0.04, y: 0.5 },

    { positions: ['DEF'], x: 0.18, y: 0.15 },
    { positions: ['DEF'], x: 0.18, y: 0.38 },
    { positions: ['DEF', 'MID'], x: 0.18, y: 0.62 },
    { positions: ['DEF', 'MID'], x: 0.18, y: 0.85 },

    { positions: ['MID', 'DEF'], x: 0.45, y: 0.3 },
    { positions: ['MID', 'DEF', 'ATT'], x: 0.45, y: 0.5 },
    { positions: ['MID', 'ATT'], x: 0.45, y: 0.7 },

    { positions: ['ATT', 'MID'], x: 0.75, y: 0.2 },
    { positions: ['ATT', 'MID'], x: 0.75, y: 0.8 },
    { positions: ['ATT', 'MID'], x: 0.75, y: 0.5 },
  ],

  '442': [
    { positions: ['GK'], x: 0.04, y: 0.5 },

    { positions: ['DEF'], x: 0.18, y: 0.15 },
    { positions: ['DEF'], x: 0.18, y: 0.38 },
    { positions: ['DEF'], x: 0.18, y: 0.62 },
    { positions: ['DEF'], x: 0.18, y: 0.85 },

    { positions: ['MID', 'DEF'], x: 0.45, y: 0.15 },
    { positions: ['MID'], x: 0.45, y: 0.38 },
    { positions: ['MID'], x: 0.45, y: 0.62 },
    { positions: ['MID', 'ATT'], x: 0.45, y: 0.85 },

    { positions: ['ATT', 'MID'], x: 0.75, y: 0.35 },
    { positions: ['ATT', 'MID'], x: 0.75, y: 0.65 },
  ],

  '4231': [
    { positions: ['GK'], x: 0.04, y: 0.5 },

    { positions: ['DEF'], x: 0.15, y: 0.15 },
    { positions: ['DEF'], x: 0.15, y: 0.38 },
    { positions: ['DEF', 'MID'], x: 0.15, y: 0.62 },
    { positions: ['DEF', 'MID'], x: 0.15, y: 0.85 },

    { positions: ['MID', 'DEF'], x: 0.38, y: 0.35 },
    { positions: ['MID', 'DEF'], x: 0.38, y: 0.65 },

    { positions: ['MID', 'ATT'], x: 0.62, y: 0.2 },
    { positions: ['MID', 'ATT'], x: 0.62, y: 0.5 },
    { positions: ['MID', 'ATT'], x: 0.62, y: 0.8 },

    { positions: ['ATT', 'MID'], x: 0.82, y: 0.5 },
  ],

  '352': [
    { positions: ['GK'], x: 0.04, y: 0.5 },

    { positions: ['DEF'], x: 0.18, y: 0.25 },
    { positions: ['DEF'], x: 0.18, y: 0.5 },
    { positions: ['DEF'], x: 0.18, y: 0.75 },

    { positions: ['MID', 'DEF'], x: 0.4, y: 0.08 },
    { positions: ['MID'], x: 0.45, y: 0.3 },
    { positions: ['MID'], x: 0.45, y: 0.5 },
    { positions: ['MID'], x: 0.45, y: 0.7 },
    { positions: ['MID', 'DEF'], x: 0.4, y: 0.92 },

    { positions: ['ATT', 'MID'], x: 0.78, y: 0.35 },
    { positions: ['ATT', 'MID'], x: 0.78, y: 0.65 },
  ],
};

/**
 * A team's playing style - behavioral parameters independent of formation
 * shape, so e.g. a 4-3-3 can play High Press or Low Block. These are what
 * Actions.ts/Decider.ts read to decide how many players press the ball,
 * how tightly players hold their formation slot, how high the defensive
 * line sits, etc. - replacing the old "every ATT/MID player beelines for
 * the same single point" behavior with something tactic-tunable.
 */
export interface IPlayingStyle {
  name: string;
  /** How many of the nearest outfield players actively close down the ball
   * carrier - the rest hold their formation shape instead of piling on. */
  pressingIntensity: number;
  /** 0 = drifts freely toward the ball, 1 = strictly holds formation slot. */
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

/**
 * Starting values - tunable constants, not load-bearing precision. Adjust
 * freely while play-testing.
 */
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

/** The tiny, storable choice - a future "upload a tactic doc" endpoint
 * just needs to validate something shaped like this (or a custom
 * IFormationShape/IPlayingStyle pair) before it's usable here. */
export interface ITactic {
  formationName: string;
  styleName: string;
}

/** The resolved, in-play state a MatchSide actually holds. */
export interface IActiveTactic {
  formationName: string;
  styleName: string;
  slots: ResolvedFormationSlot[];
  style: IPlayingStyle;
}

export const DEFAULT_TACTIC: ITactic = {
  formationName: '433',
  styleName: 'Balanced',
};

/**
 * Pure fallback-to-default resolution, shared by every call site that
 * fetches a Manager doc (App.setupGame for the synchronous path,
 * jobs/matchQueue.ts for the queued-worker path) so both fall back the
 * same way when a manager has no preference set (or doesn't exist).
 */
export function tacticFromManager(
  manager:
    | { PreferredFormation?: string; PreferredStyle?: string }
    | null
    | undefined
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
 * Resolve a canonical formation shape into actual field blocks for the
 * current grid, given which direction the team attacks.
 *
 * Usage:
 *   const homeXI = resolveFormation('433', field, 'left-to-right');
 *   const awayXI = resolveFormation('433', field, 'right-to-left');
 *
 * Change the grid's xBlocks/yBlocks (in FieldGrid.ts) and formations still
 * line up correctly - nothing here is tied to a specific cell count.
 */
export function resolveFormation(
  formationName: string,
  field: Field,
  attackingDirection: AttackingDirection
): ResolvedFormationSlot[] {
  const shape = formationShapes[formationName];

  if (!shape) {
    throw new Error(`Unknown formation: "${formationName}"`);
  }

  return shape.map((slot) => {
    const xFrac = attackingDirection === 'left-to-right' ? slot.x : 1 - slot.x;

    return {
      positions: slot.positions,
      block: field.getBlockByFraction(xFrac, slot.y),
    };
  });
}

/**
 * Resolve a tactic (formation + playing style) into the in-play state a
 * MatchSide holds for the rest of a match (or until changeTactic() swaps
 * it again).
 */
export function resolveTactic(
  tactic: ITactic,
  field: Field,
  attackingDirection: AttackingDirection
): IActiveTactic {
  const style = PLAYING_STYLES[tactic.styleName];

  if (!style) {
    throw new Error(`Unknown playing style: "${tactic.styleName}"`);
  }

  return {
    formationName: tactic.formationName,
    styleName: tactic.styleName,
    slots: resolveFormation(tactic.formationName, field, attackingDirection),
    style,
  };
}

// --- Legacy types, kept for backwards compatibility with existing imports ---
// Prefer FormationSlot / resolveFormation() above for anything new.

export interface FormationItem {
  positions: string[];
  block: number;
}

export interface FormationsList {
  'AWAY-433': FormationItem[];
  'HOME-433': FormationItem[];
  [key: string]: any[];
}
