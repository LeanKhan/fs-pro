import type { ClubLite } from '@/helpers/open-play';

/**
 * Where things go on the world map (docs/WORLD-VIEW-UI-PLAN.md, "World
 * map"). Clubs sit at their home place; there are no map coordinates for
 * places yet, so each place gets a stable spot from a hash of its id on a
 * jittered grid, and its clubs ring around it. Level is a badge, never a
 * position. Clubs with no home place go to the "Unplaced clubs" tray.
 */

export const WORLD_W = 1600;
export const WORLD_H = 900;

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export interface PlaceSpot {
  id: string;
  name: string;
  x: number;
  y: number;
  clubs: { club: ClubLite; x: number; y: number }[];
}

/** Grid cells the map is split into; places take cells in hash order, venues
 * use the cells left over (so they never cover a town). */
function cells(n: number, pad = 90, top = 170) {
  const cols = Math.max(2, Math.ceil(Math.sqrt((n * WORLD_W) / WORLD_H)));
  const rows = Math.max(2, Math.ceil(n / cols));
  const cw = (WORLD_W - 2 * pad) / cols;
  const ch = (WORLD_H - top - pad) / rows;
  const out: { x: number; y: number; cw: number; ch: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: pad + cw * (c + 0.5), y: top + ch * (r + 0.5), cw, ch });
  return out;
}

/** Radius of the ring a place's clubs sit on (pins are ~100 units wide). */
export function ringRadius(n: number) {
  return n > 1 ? 50 + n * 12 : 0;
}

export function layoutWorld(clubs: ClubLite[], venueIds: string[]) {
  const byPlace = new Map<string, ClubLite[]>();
  const unplaced: ClubLite[] = [];
  for (const c of clubs) {
    if (!c.homePlaceId) unplaced.push(c);
    else byPlace.set(c.homePlaceId, [...(byPlace.get(c.homePlaceId) ?? []), c]);
  }
  const placeIds = [...byPlace.keys()].sort((a, b) => hash(a) - hash(b));
  const grid = cells(placeIds.length + venueIds.length);
  // Spread places over the grid by stepping with a stride coprime to its size.
  const stride = [7, 5, 3, 11, 13].find((s) => grid.length % s !== 0) ?? 1;
  const order = grid.map((_, i) => (i * stride) % grid.length);
  const places: PlaceSpot[] = placeIds.map((id, i) => {
    const cell = grid[order[i]!]!;
    const h = hash(id);
    const x = cell.x + (((h & 0xff) / 255 - 0.5) * cell.cw) / 2;
    const y = cell.y + ((((h >> 8) & 0xff) / 255 - 0.5) * cell.ch) / 2;
    const members = byPlace.get(id)!.sort((a, b) => a.Name.localeCompare(b.Name));
    const r = ringRadius(members.length);
    const a = members.length ? (2 * Math.PI) / members.length : 0;
    const first = members[0]?.Address;
    return {
      id,
      name: first?.City || first?.Section || first?.Country || 'Home place',
      x,
      y,
      clubs: members.map((club, k) => ({ club, x: x + r * Math.cos(a * k - Math.PI / 2), y: y + r * Math.sin(a * k - Math.PI / 2) })),
    };
  });
  const venues = new Map<string, { x: number; y: number }>();
  venueIds.forEach((id, i) => {
    const cell = grid[order[placeIds.length + i]!]!;
    venues.set(id, { x: cell.x, y: cell.y + cell.ch * 0.15 });
  });
  return { places, unplaced, venues };
}
