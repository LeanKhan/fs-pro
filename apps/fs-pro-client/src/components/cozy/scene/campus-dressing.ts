import * as THREE from 'three';
import { CAMPUS_BUILDING_KEYS, CAMPUS_GRID, cellsOf, type CampusPlacement } from '@repo/api-contract';
import { bush, M, pick, Scatter, TREE, type Rand } from './kit';
import { CELL } from './models';
import { mulberry32, type CityVariant } from './terrain';

type Plant = (sc: Scatter, r: Rand, x: number, y: number, z: number, s: number) => void;

/** The town's trees, so the campus belongs to its surroundings. */
const SPECIES: Record<CityVariant, Plant[]> = {
  city: [TREE.round, TREE.round, (sc, r, x, y, z, s) => TREE.poplar(sc, r, x, y, z, s)],
  coastal: [TREE.palm, TREE.palm, (sc, r, x, y, z, s) => TREE.round(sc, r, x, y, z, s * 0.85, '#7f9e4a')],
  hillside: [(sc, r, x, y, z, s) => TREE.poplar(sc, r, x, y, z, s), (sc, r, x, y, z, s) => TREE.round(sc, r, x, y, z, s * 0.8, '#6aa84a')],
  woodland: [
    (sc, r, x, y, z, s) => TREE.birch(sc, r, x, y, z, s, '#e0b23a'),
    (sc, r, x, y, z, s) => TREE.pine(sc, r, x, y, z, s, '#2f6e44'),
    (sc, r, x, y, z, s) => TREE.round(sc, r, x, y, z, s, '#c9752f'),
  ],
  alpine: [(sc, r, x, y, z, s) => TREE.pine(sc, r, x, y, z, s, '#25603c', true)],
};
const FLOWERS = ['#f2b632', '#e5402f', '#f5f1e6', '#c45ab3', '#ff8fb1', '#7b6cf0'];

const cellSeed = (cx: number, cz: number, salt: number) => (Math.imul(cx + 101, 73856093) ^ Math.imul(cz + 211, 19349663) ^ salt) >>> 0;

/**
 * Trees, flower beds, benches and lamps on the campus lawn. Everything stays a
 * cell clear of every building, so it reflows when buildings move; each cell's
 * dressing is seeded by the cell itself, so the rest of the campus stays put.
 */
export function dressCampus(variant: CityVariant, placement: CampusPlacement): THREE.Group {
  const taken = new Set<string>();
  for (const key of CAMPUS_BUILDING_KEYS) {
    for (const cell of cellsOf(key, placement[key])) {
      const [x, z] = cell.split(',').map(Number) as [number, number];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) taken.add(`${x + dx},${z + dz}`);
    }
  }
  const free = (x: number, z: number) => !taken.has(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  const sc = new Scatter();
  const species = SPECIES[variant] ?? SPECIES.city;
  const salt = variant.length * 31;

  for (let cx = CAMPUS_GRID.minX; cx <= CAMPUS_GRID.maxX; cx++) {
    for (let cz = CAMPUS_GRID.minZ; cz <= CAMPUS_GRID.maxZ; cz++) {
      const r = mulberry32(cellSeed(cx, cz, salt));
      const x = (cx + 0.2 + r() * 0.6) * CELL, z = (cz + 0.2 + r() * 0.6) * CELL;
      if (Math.abs(x) < 2 || Math.abs(z) < 2 || !free(x, z)) continue;
      const edge = cx <= CAMPUS_GRID.minX + 1 || cx >= CAMPUS_GRID.maxX - 1 || cz <= CAMPUS_GRID.minZ + 1 || cz >= CAMPUS_GRID.maxZ - 1;
      const roll = r();
      if (roll < (edge ? 0.3 : 0.07)) pick(r, species)(sc, r, x, 0, z, 0.7 + r() * 0.35);
      else if (roll < (edge ? 0.36 : 0.11)) {
        // A flower bed.
        const ry = r() < 0.5 ? 0 : Math.PI / 2;
        sc.add('box', 'flat', M(x, 0, z, 1.5, 0.16, 0.8, ry), '#7a5a3a', false);
        const c = pick(r, FLOWERS);
        for (let i = 0; i < 5; i++) {
          const u = (i - 2) * 0.28;
          sc.add('blob', 'flat', M(x + (ry ? 0 : u), 0.24, z + (ry ? u : 0), 0.15 + r() * 0.05), i % 2 ? c : '#4f9e3f', false);
        }
      } else if (roll < 0.16) bush(sc, r, x, 0, z, 0.8 + r() * 0.4, '#4f9e3f', r() < 0.5 ? pick(r, FLOWERS) : undefined);
    }
  }

  // Benches and lamps along both sides of the walkways.
  for (let t = 4.5; t < 26; t += 4.5) {
    for (const s of [-1, 1]) {
      for (const side of [-1, 1]) {
        const along = s * t, off = side * 1.7;
        for (const [x, z, ry] of [[along, off, 0], [off, along, Math.PI / 2]] as const) {
          if (Math.abs(x) > 27 || Math.abs(z) > 23 || !free(x, z)) continue;
          if (Math.round(t / 4.5) % 2) {
            sc.add('cyl', 'flat', M(x, 0, z, 0.12, 2.4, 0.12), '#3b4a5a', false);
            sc.add('box', 'flat', M(x, 2.4, z, 0.36, 0.22, 0.36), '#fff1c4', false);
          } else {
            const bx = x + (ry ? side * 0.25 : 0), bz = z + (ry ? 0 : side * 0.25);
            sc.add('box', 'flat', M(bx, 0.38, bz, 1.2, 0.09, 0.42, ry), '#a8743f');
            sc.add('box', 'flat', M(bx + (ry ? side * 0.2 : 0), 0.47, bz + (ry ? 0 : side * 0.2), 1.2, 0.4, 0.08, ry), '#a8743f', false);
            for (const e of [-0.5, 0.5]) sc.add('box', 'flat', M(bx + (ry ? 0 : e), 0, bz + (ry ? e : 0), 0.08, 0.38, 0.38, ry), '#3b3b44', false);
          }
        }
      }
    }
  }
  const g = new THREE.Group();
  sc.build(g);
  return g;
}
