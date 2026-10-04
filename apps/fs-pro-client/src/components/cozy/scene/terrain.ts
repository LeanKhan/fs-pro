import * as THREE from 'three';
import { mat } from './models';

/** City around the campus. The campus grid spans x -28..28, z -24..24; the
 * ring road runs just outside it, avenues lead off in four directions and a
 * canal crosses the west avenue under a bridge. */
export type CityVariant = 'city' | 'coastal' | 'hillside';

export const RING = { x: 31.5, z: 27.5 };
const ROAD_HALF = 2.2;
const WALK = 3.3;
const FAR = 100;
/** The seafront in the coastal variant: sea east of this x. */
const SEA_X = 54;

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

function segDist(x: number, z: number, [ax, az, bx, bz]: Seg) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
const minDist = (x: number, z: number, segs: Seg[]) => segs.reduce((m, s) => Math.min(m, segDist(x, z, s)), Infinity);

/** Paved walkways inside the campus, from the plaza to the ring. */
const WALKWAYS: Seg[] = [[0, 0, 0, -RING.z], [0, 0, 0, RING.z], [0, 0, -RING.x, 0], [0, 0, RING.x, 0]];

// --- Height ---------------------------------------------------------------------------
function landH(x: number, z: number, variant: CityVariant) {
  const out = Math.max(Math.abs(x) - (RING.x + 6), Math.abs(z) - (RING.z + 6), 0);
  const n = noise(x * 0.05, z * 0.05);
  if (variant === 'hillside') return smoothstep(0, 40, out) * (4 + n * 9);
  if (variant === 'coastal') return mix(0, -1.2, smoothstep(SEA_X - 2, SEA_X + 3, x));
  return 0;
}

export function terrainH(x: number, z: number, variant: CityVariant) {
  const h = landH(x, z, variant);
  const d = Math.abs(x - riverX(z));
  return mix(WATER_Y - 0.9, h, smoothstep(0.5, 1, d / 3.4));
}

function ground(variant: CityVariant, roads: Seg[]) {
  const size = 220, seg = 230;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#72bf4a'), grassB = new THREE.Color('#5ba83d');
  const asphalt = new THREE.Color('#5b5d66'), walk = new THREE.Color('#c9c3b8'), paving = new THREE.Color('#ddd5c4');
  const sand = new THREE.Color('#e3cf95'), stone = new THREE.Color('#9a958c');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainH(x, z, variant));
    c.copy(grassA).lerp(grassB, noise(x * 0.3, z * 0.3));
    const rd = minDist(x, z, roads);
    if (rd < ROAD_HALF) c.copy(asphalt);
    else if (rd < WALK) c.copy(walk);
    else if (Math.abs(x) < RING.x - ROAD_HALF && Math.abs(z) < RING.z - ROAD_HALF && (minDist(x, z, WALKWAYS) < 1 || Math.hypot(x, z) < 3.4)) c.copy(paving);
    if (Math.abs(x - riverX(z)) < 3.4 && rd >= ROAD_HALF) c.copy(stone);
    if (variant === 'coastal' && x > SEA_X - 2) c.copy(sand);
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
  x.fillStyle = '#4aa8e0';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.25})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 10 + Math.random() * 24);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const waterMat = (tex: THREE.Texture) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, transparent: true, opacity: 0.92 });

function canal(tex: THREE.Texture) {
  const pts: number[] = [], uvs: number[] = [], idx: number[] = [];
  const half = 2.7, steps = 200;
  for (let i = 0; i <= steps; i++) {
    const z = -FAR - 10 + (i / steps) * (2 * FAR + 20);
    const x = riverX(z);
    pts.push(x - half, WATER_Y, z, x + half, WATER_Y, z);
    uvs.push(0, z / 6, 1, z / 6);
    if (i < steps) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, waterMat(tex));
}

function sea(tex: THREE.Texture) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80, 240), waterMat(tex));
  m.rotation.x = -Math.PI / 2;
  m.position.set(SEA_X + 42, WATER_Y, 0);
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

// --- Scatter (instanced) -----------------------------------------------------------------
class Scatter {
  private parts = new Map<string, { geo: THREE.BufferGeometry; color: string; mats: THREE.Matrix4[]; tints: THREE.Color[] }>();
  add(key: string, geo: () => THREE.BufferGeometry, color: string, m: THREE.Matrix4, tint: number | THREE.Color = 1) {
    if (!this.parts.has(key)) this.parts.set(key, { geo: geo(), color, mats: [], tints: [] });
    const p = this.parts.get(key)!;
    p.mats.push(m);
    p.tints.push(typeof tint === 'number' ? new THREE.Color(1, 1, 1).multiplyScalar(tint) : tint);
  }
  build(group: THREE.Group) {
    for (const p of this.parts.values()) {
      const im = new THREE.InstancedMesh(p.geo, mat(p.color), p.mats.length);
      p.mats.forEach((m, i) => {
        im.setMatrixAt(i, m);
        im.setColorAt(i, p.tints[i]);
      });
      im.castShadow = im.receiveShadow = true;
      group.add(im);
    }
  }
}

const M = (x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

const WALLS = ['#f3e6c8', '#f2d0b5', '#e8c9a0', '#d9e4ee', '#f5f1e6', '#e9b8a8', '#cfe3c8', '#f2e2a8'];
const ROOFS = ['#d9483b', '#3a6fd8', '#8a5a3b', '#5d6470', '#3aa655'];

function city(variant: CityVariant, roads: Seg[]) {
  const g = new THREE.Group();
  const sc = new Scatter();
  const r = mulberry32(variant.length * 97 + 11);
  const unit = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const trunk = () => new THREE.CylinderGeometry(0.15, 0.22, 1, 6).translate(0, 0.5, 0);
  const blob = () => new THREE.IcosahedronGeometry(1, 0);
  const tree = (x: number, z: number, s: number) => {
    const y = terrainH(x, z, variant);
    sc.add('trunk', trunk, '#6b4a2e', M(x, y, z, s));
    sc.add('leafA', blob, '#4f9e3f', M(x, y + 1.6 * s, z, 0.95 * s, 0.95 * s, 0.95 * s, r() * 6), 0.85 + r() * 0.3);
    sc.add('leafB', blob, '#5db04a', M(x + 0.45 * s, y + 2 * s, z + 0.2 * s, 0.65 * s, 0.65 * s, 0.65 * s, r() * 6), 0.85 + r() * 0.3);
  };
  const blocked = (x: number, z: number, margin: number) =>
    (Math.abs(x) < RING.x + WALK + margin && Math.abs(z) < RING.z + WALK + margin) ||
    minDist(x, z, roads) < WALK + margin ||
    Math.abs(x - riverX(z)) < 3.6 + margin ||
    nearPlace(x, z, 4 + margin) ||
    (variant === 'coastal' && x > SEA_X - 3 - margin);

  // Lots on a loose grid: mostly buildings, some little parks.
  for (let gx = -FAR; gx <= FAR; gx += 7.5) {
    for (let gz = -FAR; gz <= FAR; gz += 7.5) {
      const x = gx + (r() - 0.5) * 1.5, z = gz + (r() - 0.5) * 1.5;
      const w = 4 + r() * 2.2, d = 4 + r() * 2.2;
      if (blocked(x, z, Math.max(w, d) / 2)) continue;
      const far = Math.hypot(x, z);
      if (r() < 0.22) {
        for (let k = 0; k < 3; k++) tree(x + (r() - 0.5) * 4, z + (r() - 0.5) * 4, 0.8 + r() * 0.6);
        continue;
      }
      const floors = variant === 'city' ? 1 + Math.floor(r() * (2 + far / 20)) : 1 + Math.floor(r() * 2.5);
      const h = 1.2 + floors * 1.4;
      const y = terrainH(x, z, variant);
      const ry = Math.round(r() * 3) * (Math.PI / 2);
      sc.add('wall', unit, '#ffffff', M(x, y, z, w, h, d, ry), new THREE.Color(WALLS[Math.floor(r() * WALLS.length)]));
      sc.add('roof', unit, '#ffffff', M(x, y + h, z, w + 0.3, 0.35, d + 0.3, ry), new THREE.Color(ROOFS[Math.floor(r() * ROOFS.length)]));
      for (let f = 0; f < floors; f++) sc.add('windows', unit, '#5b8fd6', M(x, y + 1.3 + f * 1.4, z, w + 0.06, 0.45, d + 0.06, ry));
    }
  }
  // Street trees along the outer sidewalks.
  for (const [ax, az, bx, bz] of roads) {
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let t = 3; t < len; t += 7) {
      for (const side of [-1, 1]) {
        const x = ax + ((bx - ax) * t) / len + nx * side * (WALK + 0.8);
        const z = az + ((bz - az) * t) / len + nz * side * (WALK + 0.8);
        if (Math.abs(x) < RING.x && Math.abs(z) < RING.z) continue; // inside the campus
        if (minDist(x, z, roads) < WALK || Math.abs(x - riverX(z)) < 4 || nearPlace(x, z, 4) || (variant === 'coastal' && x > SEA_X - 3)) continue;
        tree(x, z, 0.7 + r() * 0.3);
      }
    }
  }
  // Dashed lane markings.
  const dash = () => new THREE.BoxGeometry(1, 0.04, 0.18);
  for (const [ax, az, bx, bz] of roads) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = -Math.atan2(bz - az, bx - ax);
    for (let t = 4; t < len - 2; t += 3) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      if (Math.abs(Math.abs(x) - RING.x) < 3 && Math.abs(Math.abs(z) - RING.z) < 3) continue; // corners
      sc.add('dash', dash, '#f5f1e6', M(x, terrainH(x, z, variant) + 0.03, z, 1.2, 1, 1, ry));
    }
  }
  sc.build(g);
  return g;
}

export interface Terrain { group: THREE.Group; water: THREE.Texture; roads: Seg[] }

export function buildTerrain(variant: CityVariant): Terrain {
  const group = new THREE.Group();
  const roads = roadSegments(variant);
  const water = waterTexture();
  group.add(ground(variant, roads), canal(water), bridge(), city(variant, roads));
  if (variant === 'coastal') group.add(sea(water));
  return { group, water, roads };
}
