/**
 * The campus grid shared by client (3D campus) and server (placement
 * validation). Buildings are placed by their top-left cell; odd `rot` swaps the
 * footprint. The plaza cells are scenery and can't be built on.
 */
export const CAMPUS_GRID = { minX: -14, maxX: 13, minZ: -12, maxZ: 11 };

/** The seven campus buildings. The Office is the Clubhouse and the Stadium
 * grounds are the Stadium; each upgrades one primary asset (BUILDING_PRIMARY)
 * and carries the older assets it absorbed (server: clubhouse/buildings.go). */
export const CAMPUS_BUILDINGS = {
  office: [3, 3],
  stadium_grounds: [7, 5],
  club_shop: [3, 2],
  cash_vault: [2, 2],
  training_ground: [4, 3],
  youth_academy: [3, 3],
  medical_centre: [3, 2],
} as const satisfies Record<string, readonly [number, number]>;

export type CampusBuilding = keyof typeof CAMPUS_BUILDINGS;
export const CAMPUS_BUILDING_KEYS = Object.keys(CAMPUS_BUILDINGS) as CampusBuilding[];

export interface Placed { x: number; z: number; rot: number }
export type CampusPlacement = Record<CampusBuilding, Placed>;

const PLAZA = { x: -1, z: -1, w: 2, d: 2 };

export const DEFAULT_PLACEMENT: CampusPlacement = {
  office: { x: -2, z: -8, rot: 0 },
  stadium_grounds: { x: 4, z: -1, rot: 0 },
  club_shop: { x: 0, z: 6, rot: 0 },
  cash_vault: { x: -4, z: 6, rot: 0 },
  training_ground: { x: 4, z: -9, rot: 0 },
  youth_academy: { x: -8, z: 2, rot: 0 },
  medical_centre: { x: -7, z: -4, rot: 0 },
};

/** Each building's display name and the asset its upgrade raises. Assets
 * marked `eco` upgrade through campus.upgrade (crossed costs), the rest
 * through facilities.startUpgrade. */
export const BUILDING_PRIMARY: Record<CampusBuilding, { name: string; asset: string; eco: boolean }> = {
  office: { name: 'Clubhouse', asset: 'clubhouse', eco: true },
  stadium_grounds: { name: 'Stadium', asset: 'turnstiles', eco: true },
  club_shop: { name: 'Club Shop', asset: 'club_shop', eco: true },
  cash_vault: { name: 'Club Vault', asset: 'cash_vault', eco: true },
  training_ground: { name: 'Training Ground', asset: 'training_ground', eco: false },
  youth_academy: { name: 'Youth Academy', asset: 'youth_academy', eco: false },
  medical_centre: { name: 'Medical Centre', asset: 'medical_centre', eco: false },
};

export function footprint(key: CampusBuilding, rot: number): [number, number] {
  const [w, d] = CAMPUS_BUILDINGS[key];
  return rot % 2 ? [d, w] : [w, d];
}

/** Every cell a building covers, as "x,z" strings. */
export function cellsOf(key: CampusBuilding, p: Placed): string[] {
  const [w, d] = footprint(key, p.rot);
  const out: string[] = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) out.push(`${p.x + x},${p.z + z}`);
  return out;
}

/** Null when the layout is valid, otherwise why it isn't. */
export function validatePlacement(p: Partial<Record<string, Placed>>): string | null {
  const taken = new Set<string>();
  for (let x = 0; x < PLAZA.w; x++) for (let z = 0; z < PLAZA.d; z++) taken.add(`${PLAZA.x + x},${PLAZA.z + z}`);
  for (const key of CAMPUS_BUILDING_KEYS) {
    const at = p[key];
    if (!at) return `Missing ${key}`;
    if (![at.x, at.z, at.rot].every(Number.isInteger) || at.rot < 0 || at.rot > 3) return `Bad position for ${key}`;
    const [w, d] = footprint(key, at.rot);
    for (let x = at.x; x < at.x + w; x++) for (let z = at.z; z < at.z + d; z++) {
      const cell = `${x},${z}`;
      if (x < CAMPUS_GRID.minX || x > CAMPUS_GRID.maxX || z < CAMPUS_GRID.minZ || z > CAMPUS_GRID.maxZ) return `${key} is off the campus`;
      if (taken.has(cell)) return `${key} overlaps another building`;
      taken.add(cell);
    }
  }
  return null;
}
