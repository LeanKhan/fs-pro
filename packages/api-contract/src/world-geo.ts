// packages/api-contract/src/world-geo.ts
//
// The world atlas: where countries and towns sit, and the rules for founding
// new ones. Shared by the client (to preview a spot before asking) and the
// server (which has the final say), like campus-grid.ts.
//
// Coordinates are atlas units on a fixed ATLAS_W x ATLAS_H sea. A country is
// a point (its capital area); its land is drawn around its towns, so a
// country grows on the map as towns are founded in it.

export const ATLAS_W = 1600;
export const ATLAS_H = 900;
/** Keep places this far from the edge of the sea. */
export const ATLAS_MARGIN = 70;

/** Two country centres must be at least this far apart. */
export const COUNTRY_MIN_GAP = 190;
/** Towns sit within this distance of their country's centre. */
export const COUNTRY_RADIUS = 160;
/** Two towns (in any country) must be at least this far apart. */
export const TOWN_MIN_GAP = 42;
/** A town holds this many clubs before a new town is needed. */
export const TOWN_MAX_CLUBS = 6;

/** How many of each thing one user may found. */
export const FOUNDING_LIMITS = { countries: 1, towns: 3, clubs: 2 } as const;

/** Town terrain; it decides the campus scene of every club founded there. */
export const TOWN_TERRAINS = ['city', 'coastal', 'hillside'] as const;
export type TownTerrain = (typeof TOWN_TERRAINS)[number];

export interface AtlasPoint {
  x: number;
  y: number;
}

const dist = (a: AtlasPoint, b: AtlasPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function inBounds(p: AtlasPoint) {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= ATLAS_MARGIN &&
    p.x <= ATLAS_W - ATLAS_MARGIN &&
    p.y >= ATLAS_MARGIN &&
    p.y <= ATLAS_H - ATLAS_MARGIN
  );
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

/** A free spot for a town around `country`, walking out on a golden-angle
 * spiral; null when the country is full. Used for backfills and AI towns. */
export function suggestTownSpot(
  country: AtlasPoint,
  towns: AtlasPoint[],
  otherCountries: AtlasPoint[] = [],
  seed = 0
): AtlasPoint | null {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 240; i++) {
    const r = 34 + 13 * Math.sqrt(i);
    if (r > COUNTRY_RADIUS) break;
    const a = (i + seed) * golden;
    const spot = { x: Math.round(country.x + r * Math.cos(a)), y: Math.round(country.y + r * Math.sin(a)) };
    if (!townSpotProblem(spot, country, towns, otherCountries)) return spot;
  }
  return null;
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
