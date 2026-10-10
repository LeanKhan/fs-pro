/**
 * The scout screen's pure core (docs/coc-mapping/03 §1.7, 08 §6.1, 02 §B2).
 *
 * The server (`play.scoutOpponent`) is authoritative: it returns the opponent's
 * Home Grid, their tier/league, a **masked** power band and a coarse threat read
 * (loaded width lanes + per-column occupancy). This module coerces that untrusted
 * payload into a render-safe view model and — critically — **drops the exact
 * rating**, so the screen can only ever show a band (03 §1.7: the scout never
 * reveals a player list or a single rating).
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `scout-report.test.ts`.
 */
import {
  PITCH_GRID,
  type GridPosition,
  type GridSlot,
} from '@repo/api-contract';

/** A loaded width lane, strongest first (the server's order). */
export interface ScoutLane {
  name: string;
  players: number;
  share: number;
}

/**
 * The masked power band. `low`/`high` are the server's inclusive range; `label`
 * is the one string the UI shows. There is deliberately no single exact value.
 */
export interface ScoutPowerBand {
  low: number;
  high: number;
  /** Human band, e.g. `45–75`. Never one exact rating. */
  label: string;
}

/** The render-safe scout report. */
export interface ScoutReportView {
  opponent: { id: string; name: string; code: string };
  tier: number;
  league: string;
  scoutingLevel: number;
  band: ScoutPowerBand;
  /** The opponent's Home Grid slots, or null when they have not set one. */
  homeGrid: GridSlot[] | null;
  /** Outfield occupancy per column X0..X8 (always length 9). */
  occupancy: number[];
  /** Loaded width lanes, strongest first. */
  lanes: ScoutLane[];
  /** Outfield players in the final third (columns X6..X8). */
  attacking: number;
  /** Whether the deepest outfield player stands at X3 or beyond. */
  highLine: boolean;
  notes: string[];
  /** Whether a Home Grid was revealed (drives the board vs the empty state). */
  hasGrid: boolean;
}

const GRID_POSITIONS: readonly GridPosition[] = ['GK', 'DEF', 'MID', 'ATT'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function int(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `45–75` — the masked band as one label. Normalises an inverted range. */
export function powerBand(low: number, high: number): ScoutPowerBand {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return { low: lo, high: hi, label: `${lo}–${hi}` };
}

/** Human copy for a lane name (`left` → `Left flank`). */
export function laneLabel(name: string): string {
  if (name === 'left') return 'Left flank';
  if (name === 'right') return 'Right flank';
  if (name === 'centre') return 'Centre';
  return name;
}

/** A length-9 column occupancy array (X0..X8), padding/truncating and clamping. */
export function normalizeOccupancy(raw: unknown): number[] {
  const out = Array.from({ length: PITCH_GRID.w }, () => 0);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < PITCH_GRID.w; i++) out[i] = Math.max(0, int(raw[i], 0));
  return out;
}

/**
 * Outfield occupancy derived from a grid — the same rule as Go `ThreatReadOf`
 * (the keeper projects nothing). A fallback for a payload whose `threat` is
 * absent but whose Home Grid is present.
 */
export function occupancyOfGrid(slots: readonly GridSlot[]): number[] {
  const out = Array.from({ length: PITCH_GRID.w }, () => 0);
  for (const s of slots) {
    if (s.position === 'GK') continue;
    if (s.col >= 0 && s.col < PITCH_GRID.w) out[s.col] += 1;
  }
  return out;
}

function coerceGrid(raw: unknown): GridSlot[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.slots)) return null;
  const out: GridSlot[] = [];
  for (const item of raw.slots) {
    if (!isRecord(item)) continue;
    const col = int(item.col, -1);
    const row = int(item.row, -1);
    if (col < 0 || col >= PITCH_GRID.w || row < 0 || row >= PITCH_GRID.h)
      continue;
    const position = item.position;
    if (typeof position !== 'string') continue;
    if (!GRID_POSITIONS.includes(position as GridPosition)) continue;
    out.push({
      col,
      row,
      playerId: str(item.playerId),
      position: position as GridPosition,
    });
  }
  return out.length ? out : null;
}

function coerceLanes(raw: unknown): ScoutLane[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoutLane[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    out.push({
      name: str(item.name),
      players: int(item.players, 0),
      share: num(item.share, 0),
    });
  }
  return out;
}

/**
 * Coerce a raw `play.scoutOpponent` payload into a render-safe view, or `null`
 * when it is not a usable report. The exact `power`/`rating` are never carried
 * through — only `band`.
 */
export function coerceScoutReport(raw: unknown): ScoutReportView | null {
  if (!isRecord(raw)) return null;
  const opp = raw.opponent;
  if (!isRecord(opp) || typeof opp.id !== 'string') return null;

  const rating = isRecord(raw.rating) ? raw.rating : {};
  const band = powerBand(int(rating.low, 0), int(rating.high, 0));

  const homeGrid = coerceGrid(raw.homeGrid);
  const threat = isRecord(raw.threat) ? raw.threat : null;
  // The threat read is authoritative; derive occupancy from the grid only when
  // the server sent no read at all, so the overlay still renders.
  const occupancy = threat
    ? normalizeOccupancy(threat.occupancy)
    : homeGrid
      ? occupancyOfGrid(homeGrid)
      : normalizeOccupancy(null);

  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((n): n is string => typeof n === 'string')
    : [];

  return {
    opponent: {
      id: opp.id,
      name: str(opp.name, 'Opponent'),
      code: str(opp.code),
    },
    tier: int(raw.tier, 1),
    league: str(raw.league, 'Unranked'),
    scoutingLevel: int(raw.scoutingLevel, 0),
    band,
    homeGrid,
    occupancy,
    lanes: threat ? coerceLanes(threat.lanes) : [],
    attacking: threat ? int(threat.attacking, 0) : 0,
    highLine: threat ? threat.highLine === true : false,
    notes,
    hasGrid: homeGrid !== null,
  };
}
