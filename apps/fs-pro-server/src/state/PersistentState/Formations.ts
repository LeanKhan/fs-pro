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
};

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
    const xFrac =
      attackingDirection === 'left-to-right' ? slot.x : 1 - slot.x;

    return {
      positions: slot.positions,
      block: field.getBlockByFraction(xFrac, slot.y),
    };
  });
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