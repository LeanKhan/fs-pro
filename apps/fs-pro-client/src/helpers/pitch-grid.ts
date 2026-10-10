/**
 * The Pitch Grid client helpers (docs/coc-mapping/08 §3, 03 Part 1).
 *
 * Two jobs, both pure and deterministic:
 *
 * 1. **Validity vocabulary.** The *authoritative* validity check lives in the
 *    shared contract (`@repo/api-contract` `validateGrid`) and is mirrored by
 *    the Go server (`apps/fs-pro-server-go/internal/grid`). This module never
 *    re-implements those rules; it only names the server's exact reason strings
 *    once, so the editor can show a locked column's reason verbatim and a test
 *    can pin the strings against `validateGrid`.
 *
 * 2. **Advisory preview.** Aura shading, passing-link lines, connectivity and
 *    synergies are a client convenience (08 §3.3): the authoritative values are
 *    whatever the server returns on save/validate. `buildPreview` mirrors the Go
 *    `internal/grid.BuildPreview` semantics exactly (1-cell Chebyshev auras,
 *    weight `1/(1+dist)`; links ≤2 cells; connectivity from the keeper;
 *    directness `0.3 + 0.5·(1 − reachableFraction)`; the three named synergies).
 *
 * No Vue, no DOM, no clock: everything here is unit-testable in Node.
 */
import {
  GRID_STARTERS,
  GRID_KEEPERS,
  GRID_MAX_TIER,
  PITCH_GRID,
  maxColumnForTier,
  positionForColumn,
  type GridPosition,
  type GridSlot,
  type PitchGrid,
} from '@repo/api-contract';

export {
  GRID_STARTERS,
  GRID_KEEPERS,
  GRID_MAX_TIER,
  PITCH_GRID,
  maxColumnForTier,
};

/**
 * The server's exact reason strings, named once. `validateGrid` (shared
 * contract) and the Go `grid.Validate` return these verbatim; the parity test
 * asserts each constant equals the contract's output so the editor can never
 * show a stale string.
 */
export const GRID_REASON = {
  offPitch: 'A player is off the pitch',
  lockedColumn:
    'That column is locked until your Clubhouse reaches a higher tier',
  occupied: 'Two players cannot stand in the same cell',
  keeperZone: 'The goalkeeper must stand in the goal zone (column X0)',
  onlyKeeper: 'Only the goalkeeper may stand in the goal zone',
  oneKeeper: 'A grid needs exactly one goalkeeper',
} as const;

/** A grid cell coordinate. `col` runs X0 (own goal) → X8; `row` runs Y0..Y6. */
export interface GridCell {
  col: number;
  row: number;
}

/** Bounds of the pitch in cells. */
export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < PITCH_GRID.w && row >= 0 && row < PITCH_GRID.h;
}

/** A stable map key for a cell (matches the server's occupancy key). */
export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** Chebyshev (king-move) distance between two cells. */
export function chebyshev(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** The human label for a column: `X0` … `X8`. */
export function columnLabel(col: number): string {
  return `X${col}`;
}

/** The human label for a row: `Y0` … `Y6`. */
export function rowLabel(row: number): string {
  return `Y${row}`;
}

/**
 * Read a cell from an element's `data-col` / `data-row` (used by the pointer
 * drop hit-test). Returns `null` for anything that is not a live cell, so a
 * stray drop is a no-op rather than an out-of-bounds placement.
 */
export function cellFromDataset(
  dataset: { col?: unknown; row?: unknown } | null | undefined
): GridCell | null {
  if (!dataset) return null;
  const col = Number(dataset.col);
  const row = Number(dataset.row);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  if (!inBounds(col, row)) return null;
  return { col, row };
}

/** Map a squad player's stored position string onto a grid band. Mirrors the
 * `positionKind` grouping the markets/program already use. */
export function toGridPosition(
  position: string | null | undefined
): GridPosition {
  const p = (position ?? '').toUpperCase();
  if (p === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF', 'SW'].some((x) => p.includes(x)))
    return 'DEF';
  if (['ST', 'CF', 'LW', 'RW', 'ATT', 'FW'].some((x) => p.includes(x)))
    return 'ATT';
  return 'MID';
}

/** The lowest Clubhouse tier that unlocks a column (inverse of
 * `maxColumnForTier`, which is monotonic `tier + 3`). */
export function minTierForColumn(col: number): number {
  if (col <= 0) return 1;
  return Math.min(GRID_MAX_TIER, Math.max(1, col - 3));
}

/** The lowest tier at which every cell in a set is unlocked. */
export function minTierForCells(cells: readonly GridCell[]): number {
  return cells.reduce((tier, c) => Math.max(tier, minTierForColumn(c.col)), 1);
}

/** Whether a column is unlocked at a Clubhouse tier. */
export function isColumnUnlocked(tier: number, col: number): boolean {
  return col <= maxColumnForTier(tier);
}

/** The exact reason a column is locked, or `null` when it is unlocked. */
export function columnLockReason(tier: number, col: number): string | null {
  return isColumnUnlocked(tier, col) ? null : GRID_REASON.lockedColumn;
}

/** Wrap a draft slot list as the shared `PitchGrid` for validate/preview/save. */
export function gridFromSlots(slots: readonly GridSlot[]): PitchGrid {
  return { slots: slots.map((s) => ({ ...s })) };
}

/**
 * A stable signature of a grid's shape+assignment, order-independent. The
 * editor uses it to know whether a cached server preview still describes the
 * current draft (server previews win only while their signature matches).
 */
export function gridSignature(slots: readonly GridSlot[]): string {
  return slots
    .map((s) => `${s.col},${s.row},${s.playerId},${s.position}`)
    .slice()
    .sort()
    .join('|');
}

/** The cell keys currently occupied by a draft. */
export function occupiedKeys(slots: readonly GridSlot[]): Set<string> {
  return new Set(slots.map((s) => cellKey(s.col, s.row)));
}

/**
 * Advisory single-placement check: can `position` stand in `cell` given the
 * current draft and tier? Returns the server's exact reason string when not.
 * This is a *mirror* of the one-slot subset of `validateGrid` for instant
 * feedback; the shared `validateGrid` remains the authority on the whole grid.
 */
export function canPlace(
  slots: readonly GridSlot[],
  cell: GridCell,
  position: GridPosition,
  tier: number
): { ok: boolean; reason: string | null } {
  if (!inBounds(cell.col, cell.row))
    return { ok: false, reason: GRID_REASON.offPitch };
  if (!isColumnUnlocked(tier, cell.col))
    return { ok: false, reason: GRID_REASON.lockedColumn };
  if (position === 'GK' && cell.col !== 0)
    return { ok: false, reason: GRID_REASON.keeperZone };
  if (position !== 'GK' && cell.col === 0)
    return { ok: false, reason: GRID_REASON.onlyKeeper };
  return { ok: true, reason: null };
}

// --- The advisory preview (mirrors Go internal/grid/preview.go) --------------

/** Two players are linked within this many cells (Chebyshev). */
export const PREVIEW_LINK_RANGE = 2;

/** The named synergies the preview recognises (Go `synergies`). */
export const SYNERGY_IDS = ['one-two-combo', 'the-shield', 'island'] as const;
export type SynergyId = (typeof SYNERGY_IDS)[number];

/** Display copy for a synergy badge. */
export const SYNERGY_LABELS: Record<SynergyId, { name: string; hint: string }> =
  {
    'one-two-combo': {
      name: 'One-Two Combo',
      hint: '2 attackers in adjacent cells — faster quick passing in the final third.',
    },
    'the-shield': {
      name: 'The Shield',
      hint: '2 central mids in adjacent cells — higher interception on central passes.',
    },
    island: {
      name: 'Island',
      hint: 'A lone striker ≥3 cells from every teammate — target-man, aerial focus.',
    },
  };

/** An undirected passing link, by player id (Go `Link`). */
export interface GridLink {
  from: string;
  to: string;
}

/** The advisory read of a grid (Go `Preview`). */
export interface GridPreview {
  /** len w×h, row-major (`row * w + col`). */
  aura: number[];
  links: GridLink[];
  connected: boolean;
  /** Suggested team directness 0..1 (higher = longer/more direct). */
  directness: number;
  synergies: SynergyId[];
}

/** Aura strength on a cell, safely (0 when the preview is absent/short). */
export function auraAt(
  preview: GridPreview | null | undefined,
  col: number,
  row: number
): number {
  if (!preview || !inBounds(col, row)) return 0;
  return preview.aura[row * PITCH_GRID.w + col] ?? 0;
}

/**
 * Coerce an untrusted server preview (`grid.validateLayout` returns
 * `preview: unknown`) into a `GridPreview`, or `null` when it does not have the
 * expected shape. The client only ever renders server previews that pass this
 * guard, so a contract change degrades to the local advisory read rather than a
 * broken overlay.
 */
export function coercePreview(raw: unknown): GridPreview | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const aura = o.aura;
  if (
    !Array.isArray(aura) ||
    aura.length !== PITCH_GRID.w * PITCH_GRID.h ||
    !aura.every((n) => typeof n === 'number')
  )
    return null;
  if (typeof o.connected !== 'boolean') return null;
  if (typeof o.directness !== 'number') return null;

  const links: GridLink[] = [];
  if (Array.isArray(o.links)) {
    for (const item of o.links) {
      if (typeof item !== 'object' || item === null) continue;
      const l = item as Record<string, unknown>;
      if (typeof l.from === 'string' && typeof l.to === 'string')
        links.push({ from: l.from, to: l.to });
    }
  }
  const seen = Array.isArray(o.synergies) ? (o.synergies as unknown[]) : [];
  const synergies = SYNERGY_IDS.filter((id) => seen.includes(id));

  return {
    aura: aura as number[],
    links,
    connected: o.connected,
    directness: o.directness,
    synergies: [...synergies],
  };
}

/** Both slots in the central lanes (rows 2..4), as Go's `anyPair` requires. */
function inCentralLanes(slot: GridSlot): boolean {
  return slot.row >= 2 && slot.row <= 4;
}

/** Two same-`pos` slots within `within` cells; `central` restricts both rows. */
function anyPair(
  slots: readonly GridSlot[],
  pos: GridPosition,
  central: boolean,
  within: number
): boolean {
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    if (a.position !== pos || (central && !inCentralLanes(a))) continue;
    for (let j = i + 1; j < slots.length; j++) {
      const b = slots[j];
      if (b.position !== pos || (central && !inCentralLanes(b))) continue;
      if (chebyshev(a, b) <= within) return true;
    }
  }
  return false;
}

/** An attacker marooned ≥3 cells from every teammate (a lone target man). */
function attackerIsland(slots: readonly GridSlot[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i];
    if (a.position !== 'ATT') continue;
    let nearest = Number.POSITIVE_INFINITY;
    for (let j = 0; j < slots.length; j++) {
      if (i === j) continue;
      const d = chebyshev(a, slots[j]);
      if (d < nearest) nearest = d;
    }
    if (nearest >= 3) return true;
  }
  return false;
}

/** The proximity synergies that form, in the fixed Go order. */
export function findSynergies(slots: readonly GridSlot[]): SynergyId[] {
  const out: SynergyId[] = [];
  if (anyPair(slots, 'ATT', false, 1)) out.push('one-two-combo');
  if (anyPair(slots, 'MID', true, 1)) out.push('the-shield');
  if (attackerIsland(slots)) out.push('island');
  return out;
}

/**
 * The advisory read of a grid — a faithful mirror of
 * `internal/grid.BuildPreview`. Pure: the same slots always yield the same
 * preview, whatever their player ids.
 */
export function buildPreview(slots: readonly GridSlot[]): GridPreview {
  const aura = Array.from({ length: PITCH_GRID.w * PITCH_GRID.h }, () => 0);

  // Auras: every outfielder projects pressure onto its own cell (full) and its
  // 8 neighbours (weight 1/(1+chebyshev)); overlaps stack.
  for (const s of slots) {
    if (s.position === 'GK') continue;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const col = s.col + dc;
        const row = s.row + dr;
        if (!inBounds(col, row)) continue;
        const idx = row * PITCH_GRID.w + col;
        aura[idx] = aura[idx] + 1 / (1 + Math.max(Math.abs(dc), Math.abs(dr)));
      }
    }
  }

  // Passing links + adjacency over all slots (keeper included).
  const links: GridLink[] = [];
  const adj: number[][] = slots.map(() => []);
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (chebyshev(slots[i], slots[j]) <= PREVIEW_LINK_RANGE) {
        links.push({ from: slots[i].playerId, to: slots[j].playerId });
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // Connectivity from the keeper: no connector in the middle → a broken graph
  // (the "long ball only" state).
  const keeperIdx = slots.findIndex((s) => s.position === 'GK');
  let reachable = 0;
  if (keeperIdx >= 0 && slots.length > 0) {
    const seen = Array.from({ length: slots.length }, () => false);
    const queue: number[] = [keeperIdx];
    seen[keeperIdx] = true;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      reachable++;
      for (const nx of adj[cur]) {
        if (!seen[nx]) {
          seen[nx] = true;
          queue.push(nx);
        }
      }
    }
  }
  const connected = slots.length > 0 && reachable === slots.length;
  const fraction = slots.length > 0 ? reachable / slots.length : 0;
  const directness = 0.3 + 0.5 * (1 - fraction);

  return {
    aura,
    links,
    connected,
    directness,
    synergies: findSynergies(slots),
  };
}

/** Convenience: the band a column implies, re-exported for the editor rail. */
export { positionForColumn };
