// packages/api-contract/src/world-geo.ts
//
// The world atlas: where countries and towns sit, and the rules for founding
// new ones. Shared by the client (to preview a spot before asking) and the
// server (which has the final say), like campus-grid.ts.
//
// Coordinates are atlas units. ATLAS_W x ATLAS_H is the smallest sea; the
// world grows right and down as placement opens countries
// (docs/WORLD-PYRAMID-SPEC.md, "Map"), and the atlas sends its real size.
// A country is a point (its capital area) with up to COUNTRY_MAX_REGIONS
// regions around it; each region holds towns around its own centre, so a
// country grows on the map as its regions fill.

export const ATLAS_W = 1600;
export const ATLAS_H = 900;
/** Keep places this far from the edge of the sea. */
export const ATLAS_MARGIN = 70;

/** Region centres sit this far from their country's centre. */
export const REGION_RING = 125;
/** Towns sit within this distance of their region's centre. */
export const REGION_RADIUS = 70;
/** Towns sit within this distance of their country's centre. */
export const COUNTRY_RADIUS = REGION_RING + REGION_RADIUS + 5;
/** Two country centres must be at least this far apart, so full countries
 * never overlap. */
export const COUNTRY_MIN_GAP = 2 * COUNTRY_RADIUS + 20;
/** Two towns (in any country) must be at least this far apart. */
export const TOWN_MIN_GAP = 32;
/** Default capacities (world settings TownSize / RegionTowns /
 * CountryRegions override them): clubs per town, towns per region, regions
 * per country. */
export const TOWN_MAX_CLUBS = 6;
export const REGION_MAX_TOWNS = 8;
export const COUNTRY_MAX_REGIONS = 6;

/** How many clubs one user may run. Places are founded only by being the
 * first club placed there (docs/WORLD-PYRAMID-SPEC.md, "Fill order"). */
export const FOUNDING_LIMITS = { countries: 1, towns: 3, clubs: 2 } as const;

/** Town terrain; it decides the campus scene of every club founded there. */
export const TOWN_TERRAINS = ['city', 'coastal', 'hillside', 'woodland', 'alpine'] as const;
export type TownTerrain = (typeof TOWN_TERRAINS)[number];

export interface AtlasPoint {
  x: number;
  y: number;
}

const dist = (a: AtlasPoint, b: AtlasPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Places keep off the top and left edges; the sea has no right or bottom
 * edge (it grows). */
function inBounds(p: AtlasPoint) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= ATLAS_MARGIN && p.y >= ATLAS_MARGIN;
}

/** Why a new country can't go at `spot`, or null if it can. */
export function countrySpotProblem(spot: AtlasPoint, countries: AtlasPoint[]): string | null {
  if (!inBounds(spot)) return 'Too close to the edge of the world';
  const near = countries.find((c) => dist(c, spot) < COUNTRY_MIN_GAP);
  return near ? 'Too close to another country' : null;
}

/** Why a new town can't go at `spot` in `country`, or null if it can.
 * `towns` is every town in the world: towns of different countries must not
 * touch either. A town must also be nearer its own country than any other. */
export function townSpotProblem(
  spot: AtlasPoint,
  country: AtlasPoint,
  towns: AtlasPoint[],
  otherCountries: AtlasPoint[] = []
): string | null {
  if (!inBounds(spot)) return 'Too close to the edge of the world';
  if (dist(spot, country) > COUNTRY_RADIUS) return 'Outside the country';
  if (otherCountries.some((c) => dist(c, spot) < dist(country, spot))) {
    return 'That land belongs to another country';
  }
  return towns.some((t) => dist(t, spot) < TOWN_MIN_GAP) ? 'Too close to another town' : null;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** A free spot for a town around `centre` (its region's centre; the country's
 * own centre by default), walking out on a golden-angle spiral; null when
 * there is no room within `radius`. */
export function suggestTownSpot(
  country: AtlasPoint,
  towns: AtlasPoint[],
  otherCountries: AtlasPoint[] = [],
  seed = 0,
  centre: AtlasPoint = country,
  radius = centre === country ? COUNTRY_RADIUS : REGION_RADIUS
): AtlasPoint | null {
  const start = centre === country ? 34 : 6;
  for (let i = 0; i < 240; i++) {
    const r = start + 11 * Math.sqrt(i);
    if (r > radius) break;
    const a = (i + seed) * GOLDEN;
    const spot = { x: Math.round(centre.x + r * Math.cos(a)), y: Math.round(centre.y + r * Math.sin(a)) };
    if (!townSpotProblem(spot, country, towns, otherCountries)) return spot;
  }
  return null;
}

/** Centre for a new region of `country`: one of COUNTRY_MAX_REGIONS slots on
 * a ring around it (then the slots half way between), away from its other
 * regions and nearer to it than to any other country; null when none is
 * free. */
export function suggestRegionSpot(
  country: AtlasPoint,
  regions: AtlasPoint[],
  otherCountries: AtlasPoint[] = [],
  seed = 0
): AtlasPoint | null {
  const slots = COUNTRY_MAX_REGIONS;
  for (let k = 0; k < slots * 2; k++) {
    const a = ((k % slots) + (k >= slots ? 0.5 : 0)) * ((2 * Math.PI) / slots) + seed;
    const spot = { x: Math.round(country.x + REGION_RING * Math.cos(a)), y: Math.round(country.y + REGION_RING * Math.sin(a)) };
    if (!inBounds(spot)) continue;
    if (regions.some((r) => dist(r, spot) < REGION_RADIUS * 1.5)) continue;
    if (otherCountries.some((c) => dist(c, spot) < dist(country, spot))) continue;
    return spot;
  }
  return null;
}

/** Centre for a new country: the first spot on a golden-angle spiral out
 * from the middle of the first sea that keeps COUNTRY_MIN_GAP from every
 * country and leaves room for its regions above and left of it. The world
 * only grows right and down, so atlas coordinates stay positive. */
export function suggestCountrySpot(countries: AtlasPoint[]): AtlasPoint {
  const centre = { x: ATLAS_W / 2, y: ATLAS_H / 2 };
  const edge = ATLAS_MARGIN + COUNTRY_RADIUS;
  for (let i = 0; ; i++) {
    const r = 60 * Math.sqrt(i);
    const a = i * GOLDEN;
    const spot = { x: Math.round(centre.x + r * Math.cos(a)), y: Math.round(centre.y + r * Math.sin(a)) };
    if (spot.x < edge || spot.y < edge) continue;
    if (countries.every((c) => dist(c, spot) >= COUNTRY_MIN_GAP)) return spot;
  }
}

/** Size of the sea that holds every place, with room around the edges. */
export function atlasSize(points: AtlasPoint[]): { width: number; height: number } {
  let width = ATLAS_W;
  let height = ATLAS_H;
  for (const p of points) {
    width = Math.max(width, Math.ceil(p.x + COUNTRY_RADIUS + ATLAS_MARGIN));
    height = Math.max(height, Math.ceil(p.y + COUNTRY_RADIUS + ATLAS_MARGIN));
  }
  return { width, height };
}

// --- Names -----------------------------------------------------------------

const NAME_RE = /^[\p{L}][\p{L}\p{M}0-9 .'&-]*[\p{L}\p{M}0-9.]$/u;

/** Why a place or club name is not acceptable, or null. */
export function nameProblem(name: string, what = 'Name', min = 3, max = 30): string | null {
  const n = name.trim();
  if (n.length < min) return `${what} needs at least ${min} characters`;
  if (n.length > max) return `${what} can have at most ${max} characters`;
  if (!NAME_RE.test(n)) return `${what} can only use letters, numbers, spaces and . ' & -`;
  if (/\s{2,}/.test(n)) return `${what} has double spaces`;
  return null;
}

/** Short codes: 2-4 capital letters or digits, starting with a letter. */
export function codeProblem(code: string, what = 'Code'): string | null {
  return /^[A-Z][A-Z0-9]{1,3}$/.test(code) ? null : `${what} must be 2-4 capital letters or digits`;
}

/** A tidy display name: trimmed, single spaces. */
export const tidyName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** A starting short code from a name ("Port Ellis Rovers" -> "PER"). */
export function suggestCode(name: string): string {
  const words = tidyName(name)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean);
  if (!words.length) return '';
  const code = words.length >= 2 ? words.map((w) => w[0]).join('') : words[0]!;
  return code.slice(0, words.length >= 2 ? 4 : 3);
}
