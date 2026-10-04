import * as THREE from 'three';
import { CAMPUS_BUILDINGS, type CampusBuilding } from '@repo/api-contract';

/** World units per campus grid cell. */
export const CELL = 2;
const size = (key: CampusBuilding) => CAMPUS_BUILDINGS[key].map((n) => n * CELL) as [number, number];

// --- Materials and primitives ---------------------------------------------------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { emissive?: string; rough?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.rough ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: 0, flatShading: true,
      emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissive ? 1.4 : 0,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);

const cyl = (rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 8) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z);

const sphere = (r: number, color: string, x = 0, y = 0, z = 0, detail = 0) =>
  mesh(new THREE.IcosahedronGeometry(r, detail), color, x, y, z);

/** A gable roof: triangular prism along z with a little overhang. */
function roof(w: number, h: number, d: number, color: string, y: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  const g = new THREE.Group();
  g.add(mesh(geo, color, 0, y, 0));
  // Darker ridge cap reads as roof tiles from a distance.
  g.add(box(0.25, 0.18, d + 0.05, shade(color, -0.25), 0, y + h - 0.08, 0));
  return g;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function windowAt(x: number, y: number, z: number, faceX = false) {
  const g = new THREE.Group();
  g.add(box(faceX ? 0.08 : 0.7, 0.75, faceX ? 0.7 : 0.08, '#f8f1e0', 0, 0, 0));
  g.add(box(faceX ? 0.1 : 0.5, 0.55, faceX ? 0.5 : 0.1, '#5b8fd6', 0, 0.1, 0));
  g.position.set(x, y, z);
  return g;
}

function door(x: number, z: number, color = '#5a3a22') {
  const g = new THREE.Group();
  g.add(box(0.95, 1.45, 0.1, '#f8f1e0', 0, 0, 0));
  g.add(box(0.75, 1.3, 0.12, color, 0, 0, 0));
  g.position.set(x, 0, z);
  return g;
}

/** Cottage: walls + gable roof + door + windows + optional chimney. */
function house(w: number, d: number, wallH: number, wall: string, roofC: string, chimney = true) {
  const g = new THREE.Group();
  g.add(box(w + 0.2, 0.3, d + 0.2, '#9a8f84', 0, 0, 0));
  g.add(box(w, wallH, d, wall, 0, 0.3, 0));
  g.add(roof(w + 0.5, wallH * 0.62, d + 0.6, roofC, wallH + 0.3));
  g.add(door(0, d / 2 + 0.02));
  for (const sx of [-1, 1]) if (w > 2.2) g.add(windowAt(sx * w * 0.3, 0.3 + wallH * 0.55, d / 2 + 0.03));
  for (const sx of [-1, 1]) g.add(windowAt(sx * (w / 2 + 0.03), 0.3 + wallH * 0.55, 0, true));
  if (chimney) {
    const c = box(0.45, 1.2, 0.45, '#8c7b6b', w * 0.25, wallH + 0.3 + wallH * 0.3, -d * 0.2);
    g.add(c);
    const anchor = new THREE.Object3D();
    anchor.position.set(w * 0.25, wallH + 0.3 + wallH * 0.3 + 1.3, -d * 0.2);
    anchor.name = 'chimney';
    g.add(anchor);
  }
  return g;
}

// --- Pitch texture -----------------------------------------------------------------
function pitchTexture(level: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 366;
  const x = c.getContext('2d')!;
  const dirt = level === 0;
  const stripes = level >= 2;
  const base = dirt ? '#b08a5a' : level === 1 ? '#7fae4a' : '#4fa63a';
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 366);
  if (stripes) {
    for (let i = 0; i < 10; i++) {
      x.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
      x.fillRect((i * 512) / 10, 0, 512 / 10, 366);
    }
  }
  // Worn or patchy spots on the lower levels.
  if (level <= 1) {
    for (let i = 0; i < 70; i++) {
      x.fillStyle = dirt ? 'rgba(120,85,50,0.35)' : 'rgba(150,120,70,0.35)';
      x.beginPath();
      x.ellipse(Math.random() * 512, Math.random() * 366, 6 + Math.random() * 18, 4 + Math.random() * 12, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.strokeStyle = dirt ? 'rgba(255,255,255,0.55)' : '#ffffff';
  x.lineWidth = 5;
  const m = 18;
  x.strokeRect(m, m, 512 - 2 * m, 366 - 2 * m);
  x.beginPath();
  x.moveTo(256, m);
  x.lineTo(256, 366 - m);
  x.stroke();
  x.beginPath();
  x.arc(256, 183, 44, 0, Math.PI * 2);
  x.stroke();
  for (const side of [0, 1]) {
    const bx = side ? 512 - m - 70 : m;
    x.strokeRect(bx, 183 - 85, 70, 170);
    x.strokeRect(side ? 512 - m - 28 : m, 183 - 40, 28, 80);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function goal(x: number, faceDir: number) {
  const g = new THREE.Group();
  const white = '#ffffff';
  g.add(cyl(0.07, 0.07, 1.2, white, 0, 0, -1.3));
  g.add(cyl(0.07, 0.07, 1.2, white, 0, 0, 1.3));
  const bar = cyl(0.07, 0.07, 2.6, white, 0, 0, 0);
  bar.rotation.x = Math.PI / 2;
  bar.position.y = 1.2;
  g.add(bar);
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.2),
    new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  net.rotation.y = Math.PI / 2;
  net.position.set(-0.6 * faceDir, 0.6, 0);
  g.add(net);
  g.position.x = x;
  return g;
}

// --- Buildings -------------------------------------------------------------------------
type Colors = [string, string];

function flag(color: string, height: number) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.05, height, '#dcdcdc'));
  const f = box(0.9, 0.55, 0.04, color, 0.47, height - 0.65, 0);
  f.name = 'flag';
  g.add(f);
  return g;
}

function buildOffice(level: number, colors: Colors) {
  const g = new THREE.Group();
  const w = 4.6 + level * 0.15;
  const h = 2.2 + Math.min(level, 3) * 0.35;
  g.add(house(w, 4, h, '#f3e6c8', '#3a6fd8'));
  // Porch with posts.
  g.add(box(2.4, 0.15, 1.1, '#a8743f', 0, 0.3, 2.45));
  for (const sx of [-1, 1]) g.add(box(0.15, 1.6, 0.15, '#7a4f2c', sx * 1.05, 0.3, 2.9));
  g.add(roof(2.8, 0.6, 1.3, '#2d5bb8', 1.9).translateZ(2.45));
  if (level >= 2) {
    const annex = house(2, 2.4, 1.8, '#efe0c0', '#2d5bb8', false);
    annex.position.set(-w / 2 - 0.9, 0, 0.4);
    g.add(annex);
  }
  if (level >= 4) {
    const tower = new THREE.Group();
    tower.add(box(1.2, 1.4, 1.2, '#f3e6c8', 0, 0, 0));
    tower.add(mesh(new THREE.ConeGeometry(1, 1.2, 4), '#2d5bb8', 0, 2, 0).rotateY(Math.PI / 4));
    tower.position.set(1.2, h + 0.3, -0.4);
    g.add(tower);
  }
  const f = flag(colors[0], 2.2 + level * 0.3);
  f.position.set(w / 2 + 0.4, 0, 1.8);
  g.add(f);
  return g;
}

function buildPitch(level: number) {
  const g = new THREE.Group();
  const [w, d] = size('stadium_grounds');
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.3, d - 0.3),
    new THREE.MeshStandardMaterial({ map: pitchTexture(level), roughness: 0.95 }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.06;
  surface.receiveShadow = true;
  g.add(surface);
  g.add(goal(-(w / 2) + 0.75, -1));
  g.add(goal(w / 2 - 0.75, 1));
  if (level >= 1) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cf = flag('#f2b632', 0.9);
      cf.scale.setScalar(0.5);
      cf.position.set(sx * (w / 2 - 0.6), 0, sz * (d / 2 - 0.6));
      g.add(cf);
    }
  }
  if (level >= 4) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = cyl(0.12, 0.16, 5.5, '#b9b9c2', sx * (w / 2 + 0.2), 0, sz * (d / 2 + 0.2));
      g.add(post);
      g.add(box(0.9, 0.5, 0.3, '#fff6c8', sx * (w / 2 + 0.2), 5.5, sz * (d / 2 + 0.2)));
    }
  }
  return g;
}

function buildStands(level: number, colors: Colors) {
  const g = new THREE.Group();
  const w = size('stands')[0] - 0.4;
  const rows = 1 + Math.min(level, 4);
  const depth = size('stands')[1] - 0.4;
  for (let i = 0; i < rows; i++) {
    const rowD = depth / rows;
    const z = depth / 2 - rowD * (i + 0.5);
    g.add(box(w, 0.4 + i * 0.45, rowD, '#a8743f', 0, 0, z));
    // Seats in the club colours, alternating.
    for (let s = 0; s < 9; s++) {
      g.add(box(0.7, 0.22, rowD * 0.5, s % 2 ? colors[0] : colors[1], -w / 2 + 0.6 + s * ((w - 1.2) / 8), 0.4 + i * 0.45, z));
    }
  }
  if (level >= 3) {
    const top = 0.4 + rows * 0.45 + 1.4;
    for (const sx of [-1, 1]) g.add(box(0.2, top, 0.2, '#7a4f2c', sx * (w / 2 - 0.2), 0, -depth / 2 + 0.2));
    // Covers the back rows only, so the seats stay visible.
    const canopy = box(w + 0.3, 0.12, depth * 0.5, colors[0], 0, top, -depth / 4);
    canopy.rotation.x = 0.18;
    g.add(canopy);
  }
  return g;
}

function buildTraining(level: number) {
  const g = new THREE.Group();
  const [w, d] = size('training_ground');
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), mat('#6fb544'));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.05;
  grass.receiveShadow = true;
  g.add(grass);
  const shed = house(2.4, 2, 1.7, '#f3e6c8', '#f2b632', false);
  shed.position.set(-w / 2 + 1.6, 0, -d / 2 + 1.4);
  g.add(shed);
  for (let i = 0; i < 3 + level * 2; i++) {
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.35, 6), '#f07a2a', 0.2 + (i % 5) * 0.9, 0.18, -0.6 + Math.floor(i / 5) * 1.2));
  }
  // Agility ladder.
  for (let i = 0; i < 6; i++) g.add(box(0.08, 0.04, 0.8, '#f2d22a', -1.8 + i * 0.4, 0.06, 1.8));
  if (level >= 2) {
    const mini = goal(w / 2 - 0.9, 1);
    mini.scale.setScalar(0.7);
    g.add(mini);
  }
  return g;
}

function buildAcademy(level: number, colors: Colors) {
  // A round clubhouse-yurt for the youngsters; grows a second one at Tier 3.
  const g = new THREE.Group();
  const yurt = (r: number, x: number, z: number) => {
    const y = new THREE.Group();
    y.add(cyl(r, r, 1.4, '#f3e6c8'));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      y.add(box(0.12, 1.4, 0.06, colors[0], Math.cos(a) * r, 0, Math.sin(a) * r).rotateY(-a));
    }
    y.add(mesh(new THREE.ConeGeometry(r * 1.15, 1.2, 12), colors[0], 0, 2, 0));
    y.add(door(0, r - 0.02));
    y.position.set(x, 0, z);
    return y;
  };
  g.add(yurt(1.6, level >= 3 ? -0.9 : 0, 0));
  if (level >= 3) g.add(yurt(1, 1.6, 0.6));
  return g;
}

function buildMedical(level: number) {
  const g = house(4.4 + level * 0.1, 2.8, 2 + level * 0.15, '#ffffff', '#d9483b', false);
  // Red cross on the front.
  const y = 1.6 + level * 0.1;
  g.add(box(0.9, 0.28, 0.06, '#e5402f', 1.2, y, 1.45), box(0.28, 0.9, 0.06, '#e5402f', 1.2, y - 0.31, 1.45));
  return g;
}

function buildScouting(level: number) {
  const g = new THREE.Group();
  const h = 2.4 + level * 0.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.18, h, 0.18, '#7a4f2c', sx * 0.9, 0, sz * 0.9));
  g.add(box(2.4, 0.18, 2.4, '#a8743f', 0, h, 0));
  for (const s of [-1, 1]) g.add(box(2.4, 0.5, 0.08, '#a8743f', 0, h + 0.18, s * 1.16), box(0.08, 0.5, 2.4, '#a8743f', s * 1.16, h + 0.18, 0));
  g.add(mesh(new THREE.ConeGeometry(1.8, 1, 4), '#3a6fd8', 0, h + 1.6, 0).rotateY(Math.PI / 4));
  for (const sx of [-1, 1]) g.add(box(0.12, 1.2, 0.12, '#7a4f2c', sx * 1.1, h, 1.1));
  const scope = cyl(0.08, 0.12, 0.8, '#3b3b44', 0.5, h + 0.6, 0.9);
  scope.rotation.x = 1.2;
  g.add(scope);
  return g;
}

function buildStaffHouse(level: number) {
  const g = house(4.4, 2.8, 1.9 + Math.min(level, 3) * 0.3, '#efe0c0', '#3aa655');
  if (level >= 3) g.add(box(1.4, 0.15, 0.6, '#7a4f2c', -1.2, 1.2, 1.6));
  return g;
}

function buildDugout(colors: Colors) {
  const g = new THREE.Group();
  g.add(box(3.4, 0.12, 1.4, '#9a8f84'));
  g.add(box(3.2, 1.3, 0.1, colors[0], 0, 0.12, -0.6));
  for (const sx of [-1, 1]) g.add(box(0.1, 1.3, 1.2, colors[0], sx * 1.6, 0.12, 0));
  const top = box(3.4, 0.08, 1.5, '#cfe8ff', 0, 1.45, 0);
  top.rotation.x = 0.12;
  g.add(top);
  g.add(box(3, 0.1, 0.4, '#3b3b44', 0, 0.45, -0.3));
  return g;
}

/** Fountain and benches on the reserved plaza cells. */
export function plaza() {
  const g = new THREE.Group();
  g.add(cyl(1.9, 2, 0.12, '#d8d2c6'));
  g.add(cyl(1.1, 1.2, 0.45, '#b9b2a6', 0, 0.12));
  g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 16), '#4aa8e0', 0, 0.55, 0));
  g.add(cyl(0.18, 0.25, 1.1, '#b9b2a6', 0, 0.55));
  g.add(sphere(0.3, '#cfe8ff', 0, 1.8, 0, 1));
  for (const a of [0.6, 2.2, 3.8, 5.4]) {
    const b = box(1.1, 0.1, 0.4, '#a8743f', Math.cos(a) * 2.6, 0.4, Math.sin(a) * 2.6);
    b.rotation.y = -a + Math.PI / 2;
    g.add(b);
  }
  return g;
}

/** Tier 0: an empty plot with a sign. While the first Tier is built, a frame and crates go up. */
function plot(key: CampusBuilding, building: boolean) {
  const g = new THREE.Group();
  const [w, d] = size(key);
  g.add(box(w - 0.4, 0.08, d - 0.4, '#a4794d', 0, 0, 0));
  const sign = new THREE.Group();
  sign.add(box(0.08, 0.9, 0.08, '#7a4f2c'));
  sign.add(box(0.7, 0.45, 0.06, '#f2b632', 0, 0.75, 0));
  sign.position.set(-w / 2 + 0.7, 0, d / 2 - 0.6);
  g.add(sign);
  if (!building) return g;
  const fw = Math.min(w, 4) - 0.8, fd = Math.min(d, 4) - 0.8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.16, 1.8, 0.16, '#c49a6c', (sx * fw) / 2, 0, (sz * fd) / 2));
  g.add(box(fw, 0.14, 0.14, '#c49a6c', 0, 1.8, -fd / 2), box(fw, 0.14, 0.14, '#c49a6c', 0, 1.8, fd / 2));
  g.add(box(0.7, 0.7, 0.7, '#b8864f', w / 2 - 0.9, 0, d / 2 - 0.9), box(0.5, 0.5, 0.5, '#a9763f', w / 2 - 1.7, 0, d / 2 - 0.8));
  return g;
}

function scaffolding(key: CampusBuilding) {
  const g = new THREE.Group();
  const [w, d] = size(key);
  const x = w / 2 - 0.5, z = d / 2 - 0.3;
  for (const sx of [-1, 1]) g.add(box(0.1, 3, 0.1, '#c49a6c', sx * x, 0, z), box(0.1, 3, 0.1, '#c49a6c', sx * x, 0, z - 0.6));
  g.add(box(w - 0.8, 0.08, 0.7, '#d9b07a', 0, 1.4, z - 0.3), box(w - 0.8, 0.08, 0.7, '#d9b07a', 0, 2.6, z - 0.3));
  return g;
}

/** A campus building at a facility Tier (dugout and office have none). */
export function buildingModel(key: CampusBuilding, tier: number, upgrading: boolean, colors: Colors) {
  const root = new THREE.Group();
  const facility = key !== 'dugout' && key !== 'office';
  if (facility && tier === 0 && key !== 'stadium_grounds') {
    root.add(plot(key, upgrading));
    return root;
  }
  const builders: Record<CampusBuilding, () => THREE.Object3D> = {
    office: () => buildOffice(1, colors),
    dugout: () => buildDugout(colors),
    stadium_grounds: () => buildPitch(tier),
    stands: () => buildStands(tier, colors),
    training_ground: () => buildTraining(tier),
    youth_academy: () => buildAcademy(tier, colors),
    medical_centre: () => buildMedical(tier),
    scouting: () => buildScouting(tier),
    staff_house: () => buildStaffHouse(tier),
  };
  root.add(builders[key]());
  if (upgrading) root.add(scaffolding(key));
  return root;
}

/** A little car facing +z. */
export function car(color: string) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.5, 2.1, color, 0, 0.25, 0));
  g.add(box(0.95, 0.45, 1.1, '#cfe8ff', 0, 0.75, -0.15));
  for (const [sx, sz] of [[-1, -0.65], [1, -0.65], [-1, 0.65], [1, 0.65]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), '#2b2b3a', sx * 0.55, 0.22, sz).rotateZ(Math.PI / 2));
  }
  return g;
}

/** The team bus, in club colours, facing +z. */
export function bus(colors: Colors) {
  const g = new THREE.Group();
  g.add(box(1.7, 1.5, 5, colors[0], 0, 0.35, 0));
  g.add(box(1.72, 0.45, 4.4, '#cfe8ff', 0, 1.1, -0.2));
  g.add(box(1.72, 0.3, 5.02, colors[1], 0, 0.55, 0));
  g.add(box(1.5, 0.6, 0.05, '#cfe8ff', 0, 1, 2.5));
  for (const [sx, sz] of [[-1, -1.7], [1, -1.7], [-1, 1.6], [1, 1.6]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 12), '#2b2b3a', sx * 0.85, 0.38, sz).rotateZ(Math.PI / 2));
  }
  return g;
}
