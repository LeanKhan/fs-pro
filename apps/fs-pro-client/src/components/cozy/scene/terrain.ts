import * as THREE from 'three';
import type { TownTerrain } from '@repo/api-contract';
import { mat } from './models';
import {
  apartment, barn, bush, cabin, chalet, cottage, house, M, pick, rock, Scatter, seaHouse, shade, shops, terrace, tower, TREE,
  type Lot, type Rand,
} from './kit';
import { landmark, type Spinner } from './landmarks';

/** City around the campus. The campus grid spans x -28..28, z -24..24; the
 * ring road runs just outside it and avenues lead off in four directions.
 * Each town terrain is its own biome: landform, water, architecture,
 * vegetation and a landmark (see BIOMES). */
export type CityVariant = TownTerrain;

export const RING = { x: 31.5, z: 27.5 };
const ROAD_HALF = 2.2;
const WALK = 3.3;
const FAR = 100;
/** The seafront in the coastal variant: sea east of about this x. */
const SEA_X = 50;

/** World places in the city: the newsstand (world news) by the south gate and
 * the billboard (transfer highlights) on the south avenue. */
export const CITY_PLACES = { newsstand: { x: 6, z: 31.4 }, billboard: { x: 9, z: 40 } } as const;
const nearPlace = (x: number, z: number, r: number) =>
  Object.values(CITY_PLACES).some((p) => Math.hypot(x - p.x, z - p.z) < r);

export const riverX = (z: number) => -48 + 2.5 * Math.sin(z * 0.09 + 1);

export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Biomes -------------------------------------------------------------------------------
/** Palette the campus buildings take from their town (see models.ts). */
export interface CampusStyle { wall: string; wallAlt: string; plinth: string; /** Snow on pitched roofs. */ snow?: boolean }

interface Biome {
  sky: [string, string];
  fog: [number, number];
  grass: [string, string];
  /** Accent patches in the grass: wildflowers, heather, dune grass. */
  meadow: string;
  water: string;
  /** The canal crossing the west avenue. */
  canal: boolean;
  campus: CampusStyle;
  landmark: { kind: Parameters<typeof landmark>[0]; x: number; z: number; ry: number; clear: number };
}

export const BIOMES: Record<CityVariant, Biome> = {
  city: {
    sky: ['#7cc0ee', '#d8eef8'], fog: [120, 240], grass: ['#72bf4a', '#5ba83d'], meadow: '#8acb5a', water: '#4aa8e0', canal: true,
    campus: { wall: '#f3e6c8', wallAlt: '#efe0c0', plinth: '#9a8f84' },
    landmark: { kind: 'townhall', x: -16, z: -43, ry: 0, clear: 9 },
  },
  coastal: {
    sky: ['#5fb6ef', '#e3f4fb'], fog: [130, 250], grass: ['#86c556', '#73b549'], meadow: '#c9d77a', water: '#2fa3d6', canal: false,
    campus: { wall: '#fbf8f1', wallAlt: '#f4efe4', plinth: '#c9bfae' },
    landmark: { kind: 'lighthouse', x: 58, z: -30, ry: 0.4, clear: 6 },
  },
  hillside: {
    sky: ['#8ac6ec', '#eef3dc'], fog: [120, 230], grass: ['#7cbf4c', '#64aa3e'], meadow: '#b4cf62', water: '#4aa0d0', canal: true,
    campus: { wall: '#e8dcc4', wallAlt: '#ddd0b5', plinth: '#8a8278' },
    landmark: { kind: 'windmill', x: 22, z: -48, ry: 0.5, clear: 6 },
  },
  woodland: {
    sky: ['#8cc3dc', '#e6efe0'], fog: [100, 210], grass: ['#5fa845', '#4b9238'], meadow: '#7fb24a', water: '#3a8fa8', canal: true,
    campus: { wall: '#e9d6b4', wallAlt: '#dcc39b', plinth: '#7d6a55' },
    landmark: { kind: 'watermill', x: -43.5, z: -24, ry: 0, clear: 6 },
  },
  alpine: {
    sky: ['#5ca8e6', '#e9f3fb'], fog: [150, 300], grass: ['#7cbc5a', '#68a94d'], meadow: '#a9c96a', water: '#5cc2d8', canal: true,
    campus: { wall: '#f5efe2', wallAlt: '#e3d2b5', plinth: '#8e8a84', snow: true },
    landmark: { kind: 'chapel', x: 16, z: -44, ry: 0, clear: 7 },
  },
};
export const biomeOf = (v: string): Biome => BIOMES[v as CityVariant] ?? BIOMES.city;

// --- Noise ------------------------------------------------------------------------
function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const WATER_Y = -0.35;

// --- Roads --------------------------------------------------------------------------
type Seg = [number, number, number, number];
export function roadSegments(variant: CityVariant): Seg[] {
  const { x: rx, z: rz } = RING;
  const east = variant === 'coastal' ? SEA_X - 4 : FAR;
  const segs: Seg[] = [
    [-rx, -rz, rx, -rz], [rx, -rz, rx, rz], [rx, rz, -rx, rz], [-rx, rz, -rx, -rz],
    [0, -rz, 0, -FAR], [0, rz, 0, FAR], [rx, 0, east, 0], [-rx, 0, -FAR, 0],
  ];
  // The promenade along the seafront.
  if (variant === 'coastal') segs.push([SEA_X - 4, -FAR, SEA_X - 4, FAR]);
  return segs;
}
const roadCache = new Map<string, Seg[]>();
const roadsOf = (v: CityVariant) => {
  if (!roadCache.has(v)) roadCache.set(v, roadSegments(v));
  return roadCache.get(v)!;
};

function segDist(x: number, z: number, [ax, az, bx, bz]: Seg) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
const minDist = (x: number, z: number, segs: Seg[]) => segs.reduce((m, s) => Math.min(m, segDist(x, z, s)), Infinity);

/** Paved walkways inside the campus, from the plaza to the ring. */
const WALKWAYS: Seg[] = [[0, 0, 0, -RING.z], [0, 0, 0, RING.z], [0, 0, -RING.x, 0], [0, 0, RING.x, 0]];

// --- Height ---------------------------------------------------------------------------
const LAKE = { x: -60, z: -52 };
/** Signed distance-ish to the woodland lake's wobbly shore (negative inside). */
const lakeD = (x: number, z: number) => Math.hypot((x - LAKE.x) / 1.3, z - LAKE.z) + (noise(x * 0.08, z * 0.08) - 0.5) * 7 - 15;
const coastX = (z: number) => SEA_X + (noise(z * 0.05, 3.7) - 0.5) * 7;

/** Land outside the town flattens towards the roads, so avenues run along valleys. */
const valley = (x: number, z: number, v: CityVariant) => mix(0.1, 1, smoothstep(4, 18, minDist(x, z, roadsOf(v))));

function landH(x: number, z: number, variant: CityVariant) {
  const out = Math.max(Math.abs(x) - (RING.x + 6), Math.abs(z) - (RING.z + 6), 0);
  const n = noise(x * 0.05, z * 0.05);
  switch (variant) {
    case 'hillside': {
      let h = smoothstep(0, 50, out) * (9 + n * 17);
      // Terraced slopes: flat steps joined by short risers.
      const k = h / 1.7;
      h = (Math.floor(k) + smoothstep(0.7, 1, k - Math.floor(k))) * 1.7;
      return h * valley(x, z, variant);
    }
    case 'alpine': {
      const m = smoothstep(0, 42, out);
      const ridge = 1 - Math.abs(noise(x * 0.035 + 7, z * 0.035) * 2 - 1);
      let h = Math.pow(m, 1.6) * (24 + ridge * 36 + n * 10) + smoothstep(0, 18, out) * n * 2.5;
      // Lower on the camera's side so the peaks stay behind the town.
      h *= mix(0.35, 1, smoothstep(45, -15, z));
      return h * valley(x, z, variant);
    }
    case 'woodland': {
      const h = smoothstep(0, 30, out) * (1.2 + n * 4.5) * valley(x, z, variant);
      return mix(WATER_Y - 1.3, h, smoothstep(-2, 1.5, lakeD(x, z)));
    }
    case 'coastal': {
      const head = Math.hypot(x - BIOMES.coastal.landmark.x, z - BIOMES.coastal.landmark.z);
      const land = smoothstep(0, 40, out) * n * 3 * smoothstep(SEA_X - 14, SEA_X - 30, x);
      const sea = mix(land, -1.5, smoothstep(coastX(z) - 2.5, coastX(z) + 2.5, x));
      // A rocky headland for the lighthouse.
      return Math.max(sea, 2.4 * smoothstep(8, 2.5, head + (noise(x * 0.4, z * 0.4) - 0.5) * 2));
    }
    default:
      return 0;
  }
}

export function terrainH(x: number, z: number, variant: CityVariant) {
  const h = landH(x, z, variant);
  if (!biomeOf(variant).canal) return h;
  const d = Math.abs(x - riverX(z));
  return mix(WATER_Y - 0.9, h, smoothstep(0.5, 1, d / 3.4));
}

// --- Ground -------------------------------------------------------------------------------
const FIELDS = ['#d9c06a', '#8fbf4a', '#a8805a', '#b4c95e', '#9f8ad0', '#c9b25a'];

function ground(variant: CityVariant, roads: Seg[]) {
  const b = biomeOf(variant);
  const size = 220, seg = 170;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const H = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) H[i] = terrainH(pos.getX(i), pos.getZ(i), variant);
  const row = seg + 1, step = size / seg;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color(b.grass[0]), grassB = new THREE.Color(b.grass[1]), meadow = new THREE.Color(b.meadow);
  const lawnA = new THREE.Color('#6fc04a'), lawnB = new THREE.Color('#62b341');
  const asphalt = new THREE.Color('#5b5d66'), walk = new THREE.Color('#c9c3b8'), paving = new THREE.Color('#ddd5c4');
  const sand = new THREE.Color('#ecd9a0'), wetSand = new THREE.Color('#cdb683'), stone = new THREE.Color('#9a958c');
  const rockC = new THREE.Color('#8f8a84'), snow = new THREE.Color('#f4f8fc'), soil = new THREE.Color('#7d6a4a');
  const lm = b.landmark;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = H[i]!;
    pos.setY(i, h);
    const ix = i % row, iz = Math.floor(i / row);
    const hx = H[i + (ix < seg ? 1 : -1)]! - h, hz = H[i + (iz < seg ? row : -row)]! - h;
    const slope = Math.hypot(hx, hz) / step;
    const n = noise(x * 0.3, z * 0.3);
    c.copy(grassA).lerp(grassB, n);
    if (noise(x * 0.07 + 11, z * 0.07) > 0.68) c.lerp(meadow, 0.55);
    const inCampus = Math.abs(x) < RING.x - ROAD_HALF && Math.abs(z) < RING.z - ROAD_HALF;
    // Campus lawn: mown stripes.
    if (inCampus) c.copy(Math.floor((x + 200) / 4) % 2 ? lawnA : lawnB).lerp(grassB, n * 0.25);
    const out = Math.max(Math.abs(x) - (RING.x + 6), Math.abs(z) - (RING.z + 6), 0);

    if (variant === 'hillside' && out > 3 && slope < 0.5 && h < 14) {
      // Patchwork fields with crop rows.
      const fx = Math.floor((x + 300) / 11), fz = Math.floor((z + 300) / 8);
      const f = hash2(fx, fz);
      if (f < 0.62) {
        c.set(FIELDS[Math.floor(f * 97) % FIELDS.length]!);
        c.multiplyScalar(0.94 + 0.08 * Math.sin((f > 0.31 ? x : z) * 2.2));
      }
    }
    if (variant === 'woodland' && !inCampus) c.lerp(new THREE.Color('#3f7d33'), smoothstep(0.4, 0.8, noise(x * 0.05, z * 0.05 + 9)) * 0.5);
    if (slope > 0.75 || (variant === 'alpine' && h > 12)) c.lerp(rockC, Math.min(1, smoothstep(0.75, 1.3, slope) + (variant === 'alpine' ? smoothstep(12, 18, h) * 0.8 : 0)));
    if (variant === 'alpine' && h > 14 + noise(x * 0.1, z * 0.1) * 6) c.copy(snow);
    if (variant === 'woodland' && lakeD(x, z) < 1.5) c.copy(wetSand);
    if (variant === 'coastal') {
      const cx = coastX(z);
      if (x > cx - 9) c.copy(sand);
      if (x > cx - 2.5) c.copy(wetSand);
      if (h > 0.6 && Math.hypot(x - lm.x, z - lm.z) < 9) c.copy(rockC);
    }

    const rd = minDist(x, z, roads);
    if (rd < ROAD_HALF) c.copy(asphalt);
    else if (rd < WALK) c.copy(walk);
    else if (inCampus && (minDist(x, z, WALKWAYS) < 1 || Math.hypot(x, z) < 3.4)) c.copy(paving);
    // A paved square (city) or a gravel yard round the landmark.
    if (Math.hypot(x - lm.x, z - lm.z) < lm.clear && rd >= ROAD_HALF && variant !== 'coastal') c.copy(variant === 'city' ? paving : soil).lerp(walk, variant === 'city' ? 0 : 0.5);
    if (b.canal && Math.abs(x - riverX(z)) < 3.4 && rd >= ROAD_HALF) c.copy(stone);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  m.receiveShadow = true;
  return m;
}

// --- Water ----------------------------------------------------------------------------
function waterTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 10 + Math.random() * 24);
  }
  // Streaks over a slightly darker base read as glints once tinted.
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = '#d9e2e8';
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(36, 36);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One water sheet under the whole map: rivers, lakes and the sea are wherever the land dips below it. */
function water(variant: CityVariant, tex: THREE.Texture) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ map: tex, color: biomeOf(variant).water, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.9 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = WATER_Y;
  m.receiveShadow = true;
  return m;
}

/** The west avenue's road bridge over the canal. */
function bridge() {
  const g = new THREE.Group();
  const x0 = riverX(0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 2 * WALK), mat('#9a958c'));
  deck.position.set(x0, 0.05, 0);
  const road = new THREE.Mesh(new THREE.BoxGeometry(9, 0.32, 2 * ROAD_HALF), mat('#5b5d66'));
  road.position.set(x0, 0.06, 0);
  g.add(deck, road);
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 0.18), mat('#d8d2c6'));
    rail.position.set(x0, 0.45, sz * (WALK - 0.1));
    g.add(rail);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  return g;
}

// --- Districts -------------------------------------------------------------------------------
const CITY_WALLS = ['#f3e6c8', '#f2d0b5', '#e8c9a0', '#d9e4ee', '#f5f1e6', '#e9b8a8', '#cfe3c8', '#f2e2a8', '#c98e64', '#b5654a'];
const CITY_ROOFS = ['#d9483b', '#3a6fd8', '#8a5a3b', '#5d6470', '#3aa655', '#b8553a'];
const AWNINGS = ['#d9483b', '#3a6fd8', '#3aa655', '#f2b632', '#8e4fd1'];
const SEA_WALLS = ['#fbf8f1', '#f6efe2', '#fdf3d8', '#e8f2f6', '#f8e3d6'];
const SEA_ACCENTS = ['#2f6fb8', '#3a8ee0', '#2fa3a0'];
const STONE_WALLS = ['#d8cdb6', '#cbbfa6', '#e2d6bd', '#bfb39c'];
const SLATE = ['#5d6470', '#4f5662', '#6b5a4a', '#7a4f3a'];
const LOGS = ['#a8743f', '#9a6a3a', '#b98450', '#8c5e34'];
const TIMBER = ['#9a6a3a', '#8a5a32', '#a8743f'];

interface Ctx { sc: Scatter; r: Rand; v: CityVariant; far: number; y: number; roadD: number }

/** Fills one lot with whatever the biome builds there. Returns false if left as greenery. */
function buildLot(c: Ctx, l: Lot) {
  const { sc, r, v, far, roadD } = c;
  const roll = r();
  switch (v) {
    case 'city': {
      const downtown = smoothstep(0.45, 0.7, noise(l.x * 0.02 + 5, l.z * 0.02)) * smoothstep(40, 70, far);
      if (roll < 0.12) return false;
      if (downtown > 0.3 && roll < 0.2 + downtown * 0.6) tower(sc, r, l, { wall: pick(r, ['#d9e4ee', '#c7d3dc', '#e8e2d6', '#b8c4cc']), floors: 6 + Math.floor(r() * 4 + downtown * 8) });
      else if (roadD < 9 && roll < 0.55) shops(sc, r, l, { wall: pick(r, CITY_WALLS), awning: pick(r, AWNINGS) });
      else if (roll < 0.55) apartment(sc, r, l, { wall: pick(r, CITY_WALLS), floors: 3 + Math.floor(r() * (2 + far / 30)) });
      else if (roll < 0.82) terrace(sc, r, l, CITY_WALLS, CITY_ROOFS);
      else house(sc, r, { ...l, w: l.w * 0.75, d: l.d * 0.75 }, { wall: pick(r, CITY_WALLS), roof: pick(r, CITY_ROOFS), floors: 2, hip: r() < 0.4 });
      return true;
    }
    case 'coastal': {
      if (roll < 0.18) return false;
      if (roll < 0.8) seaHouse(sc, r, { ...l, w: l.w * 0.8, d: l.d * 0.8 }, { wall: pick(r, SEA_WALLS), roof: pick(r, ['#c8643c', '#d77a4a', '#b8553a']), accent: pick(r, SEA_ACCENTS) });
      else house(sc, r, { ...l, w: l.w * 0.8, d: l.d * 0.75 }, { wall: pick(r, SEA_WALLS), roof: pick(r, ['#c8643c', '#3a8ee0']), floors: 2, hip: true, style: 'med' });
      return true;
    }
    case 'hillside': {
      const rural = smoothstep(4, 16, Math.max(Math.abs(l.x) - RING.x, Math.abs(l.z) - RING.z));
      if (roll < 0.25 + rural * 0.45) return false;
      if (rural > 0.5 && r() < 0.3) barn(sc, r, { ...l, w: 3.2, d: 4.4 }, { wall: pick(r, ['#b5483a', '#a8402f', '#c9b48a']), roof: pick(r, SLATE) });
      else if (rural < 0.4 && r() < 0.4) terrace(sc, r, l, STONE_WALLS, SLATE);
      else cottage(sc, r, { ...l, w: l.w * 0.72, d: l.d * 0.6 }, { wall: pick(r, STONE_WALLS), roof: pick(r, SLATE) });
      return true;
    }
    case 'woodland': {
      if (roadD > 12 || roll < 0.45) return false;
      cabin(sc, r, { ...l, w: l.w * 0.6, d: l.d * 0.5 }, { wall: pick(r, LOGS), roof: pick(r, ['#3f6b3a', '#5a3a22', '#6b4a2e', '#8a3a2a']) });
      return true;
    }
    case 'alpine': {
      if (c.y > 9 || roll < 0.35 || roadD > 16) return false;
      chalet(sc, r, { ...l, w: l.w * 0.7, d: l.d * 0.6 }, { timber: pick(r, TIMBER), roof: '#5a3a22' });
      return true;
    }
  }
}

/** Greenery on a lot left unbuilt: woods, orchards, gardens, rocks. */
function greenLot(c: Ctx, x: number, z: number) {
  const { sc, r, v } = c;
  const H = (px: number, pz: number) => terrainH(px, pz, v);
  const scatter = (n: number, spread: number, f: (px: number, py: number, pz: number) => void) => {
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * spread, pz = z + (r() - 0.5) * spread;
      if (H(px, pz) < WATER_Y + 0.3) continue;
      f(px, H(px, pz), pz);
    }
  };
  switch (v) {
    case 'city':
      scatter(3, 4.5, (px, py, pz) => (r() < 0.7 ? TREE.round : TREE.poplar)(sc, r, px, py, pz, 0.8 + r() * 0.5));
      scatter(3, 5, (px, py, pz) => bush(sc, r, px, py, pz, 1, '#4f9e3f', pick(r, ['#f2b632', '#e5402f', '#f5f1e6', '#c45ab3'])));
      break;
    case 'coastal':
      scatter(3, 5, (px, py, pz) => (r() < 0.6 ? TREE.palm(sc, r, px, py, pz, 0.9 + r() * 0.4) : TREE.round(sc, r, px, py, pz, 0.7, '#7f9e4a')));
      scatter(2, 5, (px, py, pz) => bush(sc, r, px, py, pz, 0.9, '#6f9e44', '#e86fa8'));
      break;
    case 'hillside': {
      if (c.y > 6 || r() < 0.3) scatter(4, 6, (px, py, pz) => TREE.pine(sc, r, px, py, pz, 0.8 + r() * 0.5, '#2f6e44'));
      else if (r() < 0.5) {
        // An orchard: a little grid of fruit trees.
        for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
          const px = x + a * 2, pz = z + b2 * 2;
          TREE.round(sc, r, px, H(px, pz), pz, 0.55, r() < 0.5 ? '#6aa84a' : '#7fb34f');
        }
      } else scatter(5, 6, (px, py, pz) => sheep(sc, r, px, py, pz));
      if (r() < 0.4) scatter(2, 6, (px, py, pz) => rock(sc, r, px, py, pz, 0.6 + r() * 0.5));
      break;
    }
    case 'woodland':
      scatter(7, 7, (px, py, pz) => {
        const t = r();
        if (t < 0.45) TREE.pine(sc, r, px, py, pz, 0.9 + r() * 0.7, pick(r, ['#2f6e44', '#2a5f3c', '#3a7a48']));
        else if (t < 0.7) TREE.birch(sc, r, px, py, pz, 0.8 + r() * 0.4, pick(r, ['#9cc94a', '#e0b23a', '#d9822f']));
        else TREE.round(sc, r, px, py, pz, 0.9 + r() * 0.5, pick(r, ['#4f9e3f', '#c9752f', '#e0a53a', '#b5432f']));
      });
      if (r() < 0.5) scatter(2, 6, (px, py, pz) => bush(sc, r, px, py, pz, 0.9, '#3f7d33'));
      break;
    case 'alpine':
      if (c.y < 22) scatter(c.y > 12 ? 2 : 5, 7, (px, py, pz) => TREE.pine(sc, r, px, py, pz, 0.8 + r() * 0.6, '#25603c', py > 8));
      if (c.y > 6 || r() < 0.3) scatter(3, 7, (px, py, pz) => rock(sc, r, px, py, pz, 0.6 + r() * 0.8, '#8f8a84'));
      break;
  }
}

function sheep(sc: Scatter, r: Rand, x: number, y: number, z: number) {
  const ry = r() * 6;
  sc.add('blob', 'flat', M(x, y + 0.45, z, 0.45, 0.35, 0.6, ry), '#f7f4ec', false);
  sc.add('box', 'flat', M(x + Math.sin(ry) * 0.55, y + 0.45, z + Math.cos(ry) * 0.55, 0.22, 0.26, 0.26, ry), '#2b2b3a', false);
}

/** Street furniture along a road: lamp posts on both sidewalks. */
function lamps(sc: Scatter, v: CityVariant, [ax, az, bx, bz]: Seg) {
  const len = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  for (let t = 6; t < Math.min(len, 70); t += 12) {
    for (const side of [-1, 1]) {
      const x = ax + ((bx - ax) * t) / len + nx * side * (ROAD_HALF + 0.5);
      const z = az + ((bz - az) * t) / len + nz * side * (ROAD_HALF + 0.5);
      if (nearPlace(x, z, 3)) continue;
      const y = terrainH(x, z, v);
      sc.add('cyl', 'flat', M(x, y, z, 0.12, 2.6, 0.12), '#3b4a5a', false);
      sc.add('box', 'flat', M(x, y + 2.6, z, 0.4, 0.22, 0.4), '#fff1c4', false);
    }
  }
}

/** Beach dressing: umbrellas, loungers, huts, a pier and moored boats. */
function seafront(sc: Scatter, r: Rand) {
  for (let z = -90; z < 90; z += 6 + r() * 4) {
    const x = coastX(z) - 6 + r() * 2;
    if (Math.abs(z) < 5 || Math.hypot(x - BIOMES.coastal.landmark.x, z - BIOMES.coastal.landmark.z) < 10) continue;
    const y = terrainH(x, z, 'coastal');
    if (r() < 0.6) {
      sc.add('cyl', 'flat', M(x, y, z, 0.07, 1.8, 0.07), '#f5f1e6', false);
      sc.add('cone', 'flat', M(x, y + 1.6, z, 1.9, 0.5, 1.9, r() * 6), pick(r, ['#e5402f', '#f2b632', '#3a8ee0', '#3aa655']));
      sc.add('box', 'flat', M(x + 0.9, y, z + 0.4, 0.5, 0.18, 1.4, 0.2), '#fbf8f1', false);
    } else {
      // A striped beach hut.
      sc.add('box', 'flat', M(x - 1.5, y, z, 1.4, 1.5, 1.2), pick(r, ['#e5402f', '#3a8ee0', '#f2b632', '#3aa655', '#f5f1e6']));
      sc.add('gable', 'flat', M(x - 1.5, y + 1.5, z, 1.6, 0.6, 1.4), '#f5f1e6');
    }
  }
  // Pier at z=12 with boats.
  const pz = 14, px0 = coastX(pz) - 3;
  for (let x = px0; x < px0 + 22; x += 1.5) {
    sc.add('box', 'flat', M(x, 0.25, pz, 1.55, 0.2, 2.2), '#b98450');
    if (Math.round(x * 2) % 3 === 0) for (const s of [-1, 1]) sc.add('cyl', 'flat', M(x, WATER_Y - 0.5, pz + s * 1.05, 0.22, 1.0, 0.22), '#7a4f2c', false);
  }
  for (let i = 0; i < 4; i++) {
    const bx = px0 + 6 + i * 4.5, bz = pz + (i % 2 ? 3 : -3);
    const ry = (i % 2 ? 0.2 : -0.2) + Math.PI / 2;
    sc.add('box', 'flat', M(bx, WATER_Y - 0.15, bz, 1.2, 0.55, 3, ry), pick(r, ['#f5f1e6', '#e5402f', '#3a8ee0', '#f2b632']));
    sc.add('box', 'flat', M(bx, WATER_Y + 0.4, bz, 0.9, 0.5, 1.1, ry), '#f5f1e6');
    sc.add('cyl', 'flat', M(bx, WATER_Y + 0.4, bz, 0.06, 2.4, 0.06), '#d8d2c6', false);
  }
}

function city(variant: CityVariant, roads: Seg[], lm: Biome['landmark']) {
  const g = new THREE.Group();
  const sc = new Scatter();
  const r = mulberry32(variant.length * 97 + variant.charCodeAt(0) * 13 + 11);
  const b = biomeOf(variant);
  const blocked = (x: number, z: number, margin: number) =>
    (Math.abs(x) < RING.x + WALK + margin && Math.abs(z) < RING.z + WALK + margin) ||
    minDist(x, z, roads) < WALK + margin ||
    (b.canal && Math.abs(x - riverX(z)) < 3.6 + margin) ||
    nearPlace(x, z, 4 + margin) ||
    Math.hypot(x - lm.x, z - lm.z) < lm.clear + margin ||
    (variant === 'coastal' && x > coastX(z) - 10 - margin) ||
    (variant === 'woodland' && lakeD(x, z) < 1 + margin);

  // Lots on a loose grid: buildings where the biome builds, greenery elsewhere.
  for (let gx = -FAR; gx <= FAR; gx += 7.5) {
    for (let gz = -FAR; gz <= FAR; gz += 7.5) {
      const x = gx + (r() - 0.5) * 1.5, z = gz + (r() - 0.5) * 1.5;
      const w = 4 + r() * 2.2, d = 4 + r() * 2.2;
      if (blocked(x, z, Math.max(w, d) / 2)) continue;
      const y = terrainH(x, z, variant);
      if (y < WATER_Y + 0.3) continue;
      // Buildings need level ground; slopes get greenery.
      const level = Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => Math.abs(terrainH(x + (sx! * w) / 2, z + (sz! * d) / 2, variant) - y)));
      const ctx: Ctx = { sc, r, v: variant, far: Math.hypot(x, z), y, roadD: minDist(x, z, roads) };
      // Face the nearest road.
      const ry = Math.round(r() * 3) * (Math.PI / 2);
      if (level > 0.6 || !buildLot(ctx, { x, y: y - 0.1, z, w, d, ry })) greenLot(ctx, x, z);
    }
  }

  // Street trees along the outer sidewalks, in the biome's species.
  const street = { city: TREE.round, coastal: TREE.palm, hillside: TREE.poplar, woodland: TREE.birch, alpine: TREE.pine }[variant];
  for (const [ax, az, bx, bz] of roads) {
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let t = 3; t < len; t += 7) {
      for (const side of [-1, 1]) {
        const x = ax + ((bx - ax) * t) / len + nx * side * (WALK + 0.8);
        const z = az + ((bz - az) * t) / len + nz * side * (WALK + 0.8);
        if (Math.abs(x) < RING.x && Math.abs(z) < RING.z) continue; // inside the campus
        if (minDist(x, z, roads) < WALK || (b.canal && Math.abs(x - riverX(z)) < 4) || nearPlace(x, z, 4)) continue;
        if (variant === 'coastal' && x > coastX(z) - 3) continue;
        const y = terrainH(x, z, variant);
        if (y < WATER_Y + 0.3 || Math.hypot(x - lm.x, z - lm.z) < lm.clear) continue;
        street(sc, r, x, y, z, 0.7 + r() * 0.3);
      }
    }
  }
  for (const s of roads) lamps(sc, variant, s);
  if (variant === 'coastal') seafront(sc, r);

  // Dashed lane markings.
  for (const [ax, az, bx, bz] of roads) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    for (let t = 4; t < len - 2; t += 3) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      if (Math.abs(Math.abs(x) - RING.x) < 3 && Math.abs(Math.abs(z) - RING.z) < 3) continue; // corners
      sc.add('box', 'flat', M(x, terrainH(x, z, variant) + 0.01, z, 1.2, 0.04, 0.18, ry), '#f5f1e6', false);
    }
  }
  // Campus edge: a low hedge just inside the ring road, broken at the four gates.
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
    const hx = RING.x - ROAD_HALF - 0.6, hz = RING.z - ROAD_HALF - 0.6;
    const x0 = ax * hx, z0 = az * hz, x1 = bx * hx, z1 = bz * hz;
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0; t < len; t += 1.6) {
      const x = x0 + ((x1 - x0) * t) / len, z = z0 + ((z1 - z0) * t) / len;
      if (Math.abs(x) < 3 || Math.abs(z) < 3) continue;
      sc.add('box', 'flat', M(x, 0, z, x0 === x1 ? 0.7 : 1.62, 0.7, x0 === x1 ? 1.62 : 0.7), shade('#3f8a37', (hash2(x, z) - 0.5) * 0.08), false);
    }
  }
  sc.build(g);
  return g;
}

export interface Terrain {
  group: THREE.Group;
  water: THREE.Texture;
  roads: Seg[];
  biome: Biome;
  /** Parts that turn: windmill sails, a water wheel, the lighthouse lamp. */
  spinners: Spinner[];
}

export function buildTerrain(variant: CityVariant): Terrain {
  const v = (BIOMES[variant] ? variant : 'city') as CityVariant;
  const biome = biomeOf(v);
  const group = new THREE.Group();
  const roads = roadsOf(v);
  const tex = waterTexture();
  group.add(ground(v, roads), water(v, tex), city(v, roads, biome.landmark));
  if (biome.canal) group.add(bridge());
  const lm = biome.landmark;
  const mark = landmark(lm.kind);
  mark.root.position.set(lm.x, terrainH(lm.x, lm.z, v), lm.z);
  mark.root.rotation.y = lm.ry;
  group.add(mark.root);
  return { group, water: tex, roads, biome, spinners: mark.spinners };
}
