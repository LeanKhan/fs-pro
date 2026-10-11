/**
 * The Pitch Grid — the spatial lineup canvas (docs/coc-mapping/03). Shared by the
 * client (grid editor validation/preview) and mirrored by the Go server
 * (`apps/fs-pro-server-go/internal/grid`), which is authoritative. Coordinates
 * match sim-core: x 0 = own goal line → 1 = opponent goal line; y 0 = left
 * touchline → 1 = right touchline.
 *
 * Validity rules and their reason strings are identical on both sides.
 */
export const PITCH_GRID = { w: 9, h: 7 } as const;

/** The matchday XI size. */
export const GRID_STARTERS = 11;

/** The required number of goalkeepers. */
export const GRID_KEEPERS = 1;

/** The highest Clubhouse tier (unlocks every column). */
export const GRID_MAX_TIER = 5;

/** Mirrors sim-core's PositionCategory string. */
export type GridPosition = 'GK' | 'DEF' | 'MID' | 'ATT';

export interface GridSlot {
  col: number;
  row: number;
  playerId: string;
  position: GridPosition;
}

/** A club's layout: exactly 11 slots, at most one per cell. */
export interface PitchGrid {
  slots: GridSlot[];
}

/** A compiled sim-core formation anchor in normalized pitch coordinates. */
export interface GridAnchor {
  playerId: string;
  position: GridPosition;
  x: number;
  y: number;
}

/** Highest unlocked column for a Clubhouse tier: tier 1 → X0..X4, … tier 5+ → X0..X8. */
export function maxColumnForTier(tier: number): number {
  const t = Math.min(GRID_MAX_TIER, Math.max(1, Math.floor(tier)));
  return t + 3;
}

/** The band a cell implies (X0 keeper; X1-2 DEF; X3-5 MID; X6-8 ATT). */
export function positionForColumn(col: number): GridPosition {
  if (col <= 0) return 'GK';
  if (col <= 2) return 'DEF';
  if (col <= 5) return 'MID';
  return 'ATT';
}

/** Cell centre in the normalized pitch coordinates sim-core uses. */
export function cellToNorm(col: number, row: number): { x: number; y: number } {
  return { x: (col + 0.5) / PITCH_GRID.w, y: (row + 0.5) / PITCH_GRID.h };
}

/** Null when the grid is legal for a Clubhouse tier, otherwise why not. */
export function validateGrid(
  grid: PitchGrid,
  clubhouseTier: number
): string | null {
  if (grid.slots.length !== GRID_STARTERS) {
    return `A grid needs exactly ${GRID_STARTERS} players - you have ${grid.slots.length}`;
  }
  const maxCol = maxColumnForTier(clubhouseTier);
  const taken = new Set<string>();
  let keepers = 0;
  for (const s of grid.slots) {
    if (
      s.col < 0 ||
      s.col >= PITCH_GRID.w ||
      s.row < 0 ||
      s.row >= PITCH_GRID.h
    ) {
      return 'A player is off the pitch';
    }
    if (s.col > maxCol)
      return 'That column is locked until your Clubhouse reaches a higher tier';
    const cell = `${s.col},${s.row}`;
    if (taken.has(cell)) return 'Two players cannot stand in the same cell';
    taken.add(cell);
    if (s.position === 'GK') {
      keepers++;
      if (s.col !== 0)
        return 'The goalkeeper must stand in the goal zone (column X0)';
    } else if (s.col === 0) {
      return 'Only the goalkeeper may stand in the goal zone';
    }
  }
  if (keepers !== GRID_KEEPERS) return 'A grid needs exactly one goalkeeper';
  return null;
}

/** Compile a grid to the XI's sim-core anchors, in slot order (pure, deterministic). */
export function compileGrid(grid: PitchGrid): GridAnchor[] {
  return grid.slots.map((s) => {
    const { x, y } = cellToNorm(s.col, s.row);
    return { playerId: s.playerId, position: s.position, x, y };
  });
}
