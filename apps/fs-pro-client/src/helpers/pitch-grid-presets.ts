/**
 * The Pitch Grid presets (docs/coc-mapping/08 §3.2, 03 §1.8): first-class start
 * points a manager can drop in and then drag. A preset is a list of cells and
 * the band each cell expects; it becomes a real `GridSlot[]` only once squad
 * players are assigned (`presetToGrid`), so a preset is never a fake player list.
 *
 * Pure and deterministic. Each shipped preset is a legal XI (exactly one keeper
 * in X0, no outfield in X0, no shared cells) at its `presetMinTier`, which is
 * asserted by the preset test against the shared `validateGrid`.
 */
import type { GridPosition, GridSlot } from '@repo/api-contract';
import { minTierForCells, type GridCell, toGridPosition } from './pitch-grid';

/** One preset cell: where a player of `position` should stand. */
export interface PresetCell extends GridCell {
  position: GridPosition;
}

/** A named, editable start point. */
export interface GridPreset {
  id: string;
  name: string;
  blurb: string;
  cells: readonly PresetCell[];
}

const gk = (col: number, row: number): PresetCell => ({
  col,
  row,
  position: 'GK',
});
const def = (col: number, row: number): PresetCell => ({
  col,
  row,
  position: 'DEF',
});
const mid = (col: number, row: number): PresetCell => ({
  col,
  row,
  position: 'MID',
});
const att = (col: number, row: number): PresetCell => ({
  col,
  row,
  position: 'ATT',
});

/**
 * The six shipped presets. `minTier` (computed) spreads them across the
 * Clubhouse bands so every tier has at least one good shape:
 * Low Block (T1) · 4-4-2 (T2) · 4-3-3 / Wing Overload / Bunker+Poacher (T3) ·
 * High Press (T4).
 */
export const GRID_PRESETS: readonly GridPreset[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    blurb: 'Balanced default: back four, three in midfield, a front three.',
    cells: [
      gk(0, 3),
      def(2, 0),
      def(2, 2),
      def(2, 4),
      def(2, 6),
      mid(4, 1),
      mid(4, 3),
      mid(4, 5),
      att(6, 0),
      att(6, 3),
      att(6, 6),
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    blurb: 'Two flat banks of four with a strike pair — solid, direct.',
    cells: [
      gk(0, 3),
      def(2, 0),
      def(2, 2),
      def(2, 4),
      def(2, 6),
      mid(4, 0),
      mid(4, 2),
      mid(4, 4),
      mid(4, 6),
      att(5, 2),
      att(5, 4),
    ],
  },
  {
    id: 'low-block',
    name: 'Low Block',
    blurb: 'Defend deep in your own half and hit on the break.',
    cells: [
      gk(0, 3),
      def(1, 0),
      def(1, 2),
      def(1, 4),
      def(1, 6),
      mid(3, 0),
      mid(3, 2),
      mid(3, 3),
      mid(3, 4),
      mid(3, 6),
      att(4, 3),
    ],
  },
  {
    id: 'wing-overload',
    name: 'Wing Overload',
    blurb: 'Stack one flank and cross — overload the left lane.',
    cells: [
      gk(0, 3),
      def(2, 1),
      def(2, 3),
      def(2, 5),
      mid(4, 0),
      mid(4, 1),
      mid(4, 3),
      mid(4, 5),
      mid(4, 6),
      att(6, 0),
      att(6, 1),
    ],
  },
  {
    id: 'bunker-poacher',
    name: 'Bunker + Poacher',
    blurb: 'Park the bus and leave one target man marooned up top.',
    cells: [
      gk(0, 3),
      def(1, 0),
      def(1, 2),
      def(1, 4),
      def(1, 6),
      mid(2, 1),
      mid(2, 3),
      mid(2, 5),
      mid(3, 2),
      mid(3, 4),
      att(6, 2),
    ],
  },
  {
    id: 'high-press',
    name: 'High Press',
    blurb: 'A high line and a front three hunting the ball in their half.',
    cells: [
      gk(0, 3),
      def(4, 1),
      def(4, 3),
      def(4, 5),
      mid(5, 0),
      mid(5, 2),
      mid(5, 4),
      mid(5, 6),
      att(7, 1),
      att(7, 3),
      att(7, 5),
    ],
  },
];

/** The lowest Clubhouse tier at which every cell of a preset is unlocked. */
export function presetMinTier(preset: GridPreset): number {
  return minTierForCells(preset.cells);
}

/** A squad player as the preset filler sees it. */
export interface SquadCandidate {
  id: string;
  position: GridPosition;
  rating: number;
  injured?: boolean;
}

/**
 * Turn a preset into draft slots by greedily assigning the best available,
 * un-injured player of the matching band to each cell (highest rating wins),
 * falling back to any un-injured outfielder for outfield cells. The keeper cell
 * is only ever filled by a keeper, so a keeper-less squad yields a visibly
 * incomplete grid rather than an illegal one. Cells with no candidate are left
 * empty — a preset is a start point, not a forced XI.
 */
export function presetToGrid(
  preset: GridPreset,
  pool: readonly SquadCandidate[]
): GridSlot[] {
  const used = new Set<string>();
  const avail = pool.filter((p) => !p.injured);
  const slots: GridSlot[] = [];
  for (const cell of preset.cells) {
    const sameBand = avail
      .filter((p) => !used.has(p.id) && p.position === cell.position)
      .sort((a, b) => b.rating - a.rating);
    let pick = sameBand[0];
    if (!pick && cell.position !== 'GK') {
      pick = avail
        .filter((p) => !used.has(p.id) && p.position !== 'GK')
        .sort((a, b) => b.rating - a.rating)[0];
    }
    if (!pick) continue;
    used.add(pick.id);
    slots.push({
      col: cell.col,
      row: cell.row,
      playerId: pick.id,
      position: pick.position,
    });
  }
  return slots;
}

/** Map a raw club player (`getClub` shape) onto a preset candidate. */
export function candidateFromPlayer(player: {
  _id?: string;
  Position?: string;
  Rating?: number;
  Injury?: { daysRemaining?: number } | null;
}): SquadCandidate | null {
  const id = player._id;
  if (!id) return null;
  return {
    id,
    position: toGridPosition(player.Position),
    rating: typeof player.Rating === 'number' ? player.Rating : 0,
    injured: (player.Injury?.daysRemaining ?? 0) > 0,
  };
}
