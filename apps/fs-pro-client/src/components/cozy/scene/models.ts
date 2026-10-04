import * as THREE from 'three';
import { CAMPUS_BUILDINGS, type CampusBuilding } from '@repo/api-contract';
import { stageOf, type StageContext } from '../stages';

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

/** A modern flat-roofed block: window bands per floor, a door at the front. */
function block(w: number, d: number, floors: number, wall: string, roofC: string, glass = '#5b8fd6') {
  const g = new THREE.Group();
  const h = floors * 1.2 + 0.2;
  g.add(box(w, h, d, wall));
  for (let f = 0; f < floors; f++) g.add(box(w + 0.04, 0.45, d + 0.04, glass, 0, 0.45 + f * 1.2, 0));
  g.add(box(w + 0.2, 0.18, d + 0.2, roofC, 0, h, 0));
  g.add(door(0, d / 2 + 0.06));
  g.userData.top = h + 0.18;
  return g;
}

/** A canvas tent with an optional emblem on the front. */
function tent(w: number, d: number, h: number, canvas: string, emblem?: string) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  g.add(mesh(geo, canvas));
  if (emblem) g.add(box(0.5, 0.15, 0.04, emblem, 0, h * 0.45, d / 2 + 0.02), box(0.15, 0.5, 0.04, emblem, 0, h * 0.45 - 0.17, d / 2 + 0.02));
  return g;
}

function floodlights(w: number, d: number, height: number) {
  const g = new THREE.Group();
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(cyl(0.12, 0.16, height, '#b9b9c2', (sx * w) / 2, 0, (sz * d) / 2));
    g.add(box(1, 0.55, 0.3, '#fff6c8', (sx * w) / 2, height, (sz * d) / 2));
  }
  return g;
}

// --- Pitch → stadium ------------------------------------------------------------------------
/** Rows of seats along x, rising towards -z, facing +z. */
function standRows(len: number, rows: number, colors: Colors, roofed: boolean) {
  const g = new THREE.Group();
  const rowD = 0.3;
  for (let i = 0; i < rows; i++) {
    const z = -i * rowD;
    g.add(box(len, 0.25 + i * 0.32, rowD, '#c9c3b8', 0, 0, z));
    g.add(box(len - 0.1, 0.12, rowD * 0.55, i % 2 ? colors[0] : colors[1], 0, 0.25 + i * 0.32, z + 0.05));
  }
  if (roofed) {
    // Covers the back rows only, so the seats stay visible from above.
    const top = 0.6 + rows * 0.32;
    const depth = Math.max(0.6, rows * rowD * 0.5);
    g.add(box(len + 0.2, 0.12, depth, colors[0], 0, top, -(rows - 0.5) * rowD + depth / 2));
    for (const sx of [-1, 1]) g.add(box(0.12, top, 0.12, '#f5f1e6', (sx * len) / 2, 0, -rows * rowD));
  }
  return g;
}

function buildPitch(tier: number, standsTier: number, colors: Colors) {
  const g = new THREE.Group();
  const [w, d] = size('stadium_grounds');
  const stadium = tier >= 3;
  // A stadium keeps a margin around the pitch for its stands.
  const pw = stadium ? w - 3.8 : w - 0.3;
  const pd = stadium ? d - 3.6 : d - 0.3;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshStandardMaterial({ map: pitchTexture(tier), roughness: 0.95 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.06;
  surface.receiveShadow = true;
  g.add(surface);
  g.add(goal(-(pw / 2) + 0.6, -1), goal(pw / 2 - 0.6, 1));
  if (tier >= 1) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cf = flag('#f2b632', 0.9);
      cf.scale.setScalar(0.5);
      cf.position.set(sx * (pw / 2 - 0.3), 0, sz * (pd / 2 - 0.3));
      g.add(cf);
    }
  }
  // The Stands Tier decides how big the seating is.
  const rows = 1 + Math.min(standsTier, 5);
  if (!stadium) {
    // Before the stadium: a touchline bench or small terrace along the far side.
    if (standsTier > 0) {
      const t = standRows(pw * 0.5, Math.min(rows, 3), colors, false);
      t.position.set(0, 0, -pd / 2 + 0.1);
      g.add(t);
    }
    if (tier >= 2) g.add(floodlights(w + 0.4, d + 0.4, 5.5));
    return g;
  }
  const extra = tier === 5 ? 1 : 0;
  const side = (len: number, roofed: boolean, x: number, z: number, ry: number) => {
    const s = standRows(len, rows + extra, colors, roofed);
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    g.add(s);
  };
  // Community: both long sides, the main stand covered.
  side(pw, true, 0, -pd / 2 - 0.25, 0);
  side(pw, tier >= 4, 0, pd / 2 + 0.25, Math.PI);
  // Large and up: ends too. Mega: corners filled and a roof ring.
  if (tier >= 4) {
    side(pd, tier >= 5, -pw / 2 - 0.25, 0, -Math.PI / 2);
    side(pd, tier >= 5, pw / 2 + 0.25, 0, Math.PI / 2);
  }
  if (tier >= 5) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(box(1.6, 0.6 + (rows + 1) * 0.32, 1.6, '#c9c3b8', sx * (pw / 2 + 0.9), 0, sz * (pd / 2 + 0.9)));
    }
    for (const sx of [-1, 1]) g.add(box(3, 1.6, 0.2, '#2b2b3a', sx * (pw / 2 - 2), 3.2, -pd / 2 - 1.9), box(2.8, 1.4, 0.22, '#5b8fd6', sx * (pw / 2 - 2), 3.3, -pd / 2 - 1.85));
  }
  g.add(floodlights(w - 0.4, d - 0.4, tier >= 4 ? 7.5 : 6));
  return g;
}

// --- Stands → ticket office / fan zone --------------------------------------------------------
function buildFanZone(tier: number, colors: Colors) {
  const g = new THREE.Group();
  const [w, d] = size('stands');
  const sign = (x: number, y: number, z: number, width: number) => g.add(box(width, 0.4, 0.08, colors[0], x, y, z));
  if (tier === 1) {
    // Ticket booth with a queue rail.
    g.add(box(1.4, 1.8, 1.2, '#f3e6c8', 0, 0, 0), box(1.6, 0.15, 1.4, colors[0], 0, 1.8, 0), box(0.9, 0.5, 0.06, '#5b8fd6', 0, 0.9, 0.62));
    for (let i = 0; i < 4; i++) g.add(box(0.06, 0.8, 0.06, '#9a958c', 1.2 + i * 0.6, 0, 0.9));
    g.add(box(1.9, 0.06, 0.06, '#d9483b', 2.1, 0.75, 0.9));
    return g;
  }
  const office = block(tier >= 3 ? 3 : 3.6, 2.4, 1, '#f3e6c8', colors[0]);
  office.position.set(tier >= 3 ? -w / 2 + 1.8 : 0, 0, -0.4);
  g.add(office);
  sign(office.position.x, 1.75, 0.85, 1.8);
  if (tier >= 3) {
    // The club shop next door, with an awning.
    const shop = block(2.6, 2.4, 1, '#efe0c0', colors[1]);
    shop.position.set(-w / 2 + 4.8, 0, -0.4);
    g.add(shop);
    for (let i = 0; i < 5; i++) {
      const s = box(0.52, 0.1, 0.9, i % 2 ? '#ffffff' : colors[0], -w / 2 + 3.76 + i * 0.52, 1.5, 1.1);
      s.rotation.x = 0.35;
      g.add(s);
    }
  }
  if (tier >= 4) {
    // Fan zone: a little stage, flags and picnic tables.
    g.add(box(2.4, 0.4, 1.6, '#8a5a3b', w / 2 - 1.5, 0, 0.6));
    for (const sx of [-1, 1]) g.add(box(0.1, 2.2, 0.1, '#5d6470', w / 2 - 1.5 + sx * 1.1, 0.4, 0));
    g.add(box(2.4, 0.12, 0.12, '#5d6470', w / 2 - 1.5, 2.6, 0));
    for (let i = 0; i < 3; i++) {
      const f = flag(i % 2 ? colors[1] : colors[0], 2.4);
      f.position.set(-w / 2 + 0.4 + i * 3.2, 0, d / 2 - 0.3);
      g.add(f);
    }
  }
  if (tier >= 5) {
    // Fan plaza: a big screen and a food truck.
    g.add(box(0.15, 3.4, 0.15, '#5d6470', w / 2 - 0.4, 0, -1.4), box(2.6, 1.5, 0.2, '#2b2b3a', w / 2 - 1.6, 3, -1.4), box(2.4, 1.3, 0.22, '#5b8fd6', w / 2 - 1.6, 3.1, -1.35));
    const truck = new THREE.Group();
    truck.add(box(1.2, 1.2, 2.2, '#f2b632', 0, 0.3, 0), box(1.22, 0.5, 1, '#ffffff', 0, 0.9, 0.3));
    truck.position.set(0.2, 0, 1.2);
    truck.rotation.y = Math.PI / 2;
    g.add(truck);
  }
  return g;
}

// --- Training ----------------------------------------------------------------------------------
function buildTraining(tier: number) {
  const g = new THREE.Group();
  const [w, d] = size('training_ground');
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), mat(tier >= 4 ? '#4fa63a' : '#6fb544'));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = 0.05;
  grass.receiveShadow = true;
  g.add(grass);
  for (let i = 0; i < 3 + tier * 2; i++) {
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.35, 6), '#f07a2a', 0.2 + (i % 5) * 0.9, 0.18, -0.6 + Math.floor(i / 5) * 1.2));
  }
  for (let i = 0; i < 6; i++) g.add(box(0.08, 0.04, 0.8, '#f2d22a', -1.8 + i * 0.4, 0.06, 1.8));
  if (tier >= 2) {
    const mini = goal(w / 2 - 0.9, 1);
    mini.scale.setScalar(0.7);
    g.add(mini);
  }
  // The clubhouse corner: a shed, then a training centre, then a gym block, then a dome.
  const corner = new THREE.Vector3(-w / 2 + 1.6, 0, -d / 2 + 1.4);
  if (tier === 2) g.add(house(1.8, 1.6, 1.3, '#f3e6c8', '#8a5a3b', false).translateX(corner.x).translateZ(corner.z));
  if (tier === 3) g.add(house(2.6, 2, 1.8, '#f3e6c8', '#f2b632', false).translateX(corner.x).translateZ(corner.z));
  if (tier >= 4) g.add(block(2.8, 2, tier >= 5 ? 2 : 1, '#e8eef4', '#f2b632').translateX(corner.x).translateZ(corner.z));
  if (tier >= 5) {
    const dome = mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#f5f1e6', w / 2 - 1.8, 0, -d / 2 + 1.7);
    g.add(dome);
  }
  return g;
}

// --- Academy --------------------------------------------------------------------------------------
function buildAcademy(tier: number, colors: Colors) {
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
  const kickabout = () => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), mat('#5fb04a'));
    p.rotation.x = -Math.PI / 2;
    p.position.set(1.2, 0.05, 1.6);
    g.add(p);
  };
  if (tier === 1) g.add(tent(2.6, 2.4, 1.8, '#efe3c6'));
  if (tier === 2) g.add(yurt(1.4, -0.9, 0), yurt(1, 1.6, 0.6));
  if (tier === 3) {
    g.add(house(3.2, 2.4, 1.8, '#f3e6c8', colors[0]).translateX(-1).translateZ(-1));
    kickabout();
  }
  if (tier >= 4) {
    g.add(block(3.6, 2.2, 2, '#f2d0b5', colors[0]).translateX(-0.9).translateZ(-1.5));
    kickabout();
  }
  if (tier >= 5) {
    // A dorm wing and a clock tower.
    g.add(block(1.6, 1.6, 2, '#efe0c0', colors[0]).translateX(2).translateZ(-1.9));
    const tower = new THREE.Group();
    tower.add(box(0.9, 4.2, 0.9, '#f2d0b5'), cyl(0.3, 0.3, 0.06, '#ffffff', 0, 3.4, 0.46).rotateX(Math.PI / 2));
    tower.add(mesh(new THREE.ConeGeometry(0.8, 1, 4), colors[0], 0, 4.7, 0).rotateY(Math.PI / 4));
    tower.position.set(-2.4, 0, 1.6);
    g.add(tower);
  }
  return g;
}

// --- Medical ---------------------------------------------------------------------------------------
function buildMedical(tier: number) {
  const cross = (g: THREE.Object3D, x: number, y: number, z: number, s = 1) =>
    g.add(box(0.9 * s, 0.28 * s, 0.06, '#e5402f', x, y, z), box(0.28 * s, 0.9 * s, 0.06, '#e5402f', x, y - 0.31 * s, z));
  if (tier === 1) return tent(3.2, 2.4, 2, '#ffffff', '#e5402f');
  if (tier <= 3) {
    const g = house(tier === 2 ? 3.2 : 4.4, tier === 2 ? 2.4 : 2.8, tier === 2 ? 1.7 : 2.3, '#ffffff', '#d9483b', false);
    cross(g, 1.0, tier === 2 ? 1.4 : 1.8, tier === 2 ? 1.25 : 1.45);
    return g;
  }
  const g = block(5, 3, tier === 4 ? 2 : 3, '#ffffff', '#d9483b', '#9fd3f0');
  cross(g, 1.6, 1.9, 1.56);
  if (tier >= 5) {
    // A helipad on the roof.
    const top = g.userData.top as number;
    g.add(box(2.4, 0.06, 2.2, '#5d6470', 0, top, 0), box(0.18, 0.04, 1.2, '#ffffff', -0.35, top + 0.06, 0), box(0.18, 0.04, 1.2, '#ffffff', 0.35, top + 0.06, 0), box(0.6, 0.04, 0.18, '#ffffff', 0, top + 0.06, 0));
  }
  return g;
}

// --- Scouting -------------------------------------------------------------------------------------
function lookout(h: number, roofed: boolean) {
  const g = new THREE.Group();
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.18, h, 0.18, '#7a4f2c', sx * 0.8, 0, sz * 0.8));
  g.add(box(2.1, 0.18, 2.1, '#a8743f', 0, h, 0));
  for (const s of [-1, 1]) g.add(box(2.1, 0.5, 0.08, '#a8743f', 0, h + 0.18, s * 1.02), box(0.08, 0.5, 2.1, '#a8743f', s * 1.02, h + 0.18, 0));
  if (roofed) g.add(mesh(new THREE.ConeGeometry(1.6, 1, 4), '#3a6fd8', 0, h + 1.6, 0).rotateY(Math.PI / 4));
  for (const sx of [-1, 1]) if (roofed) g.add(box(0.12, 1.2, 0.12, '#7a4f2c', sx * 1, h, 1));
  const scope = cyl(0.08, 0.12, 0.8, '#3b3b44', 0.5, h + 0.6, 0.8);
  scope.rotation.x = 1.2;
  g.add(scope);
  return g;
}

function dish(r: number) {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.1, 0.8, '#b9b9c2'));
  const bowl = mesh(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 3), '#f5f1e6', 0, 0.8 + r, 0);
  bowl.rotation.x = Math.PI * 0.75;
  g.add(bowl);
  return g;
}

function buildScouting(tier: number) {
  if (tier === 1) return lookout(1.6, false);
  if (tier === 2) return lookout(3.4, true);
  const g = new THREE.Group();
  if (tier === 3) {
    g.add(house(2.4, 2, 1.6, '#f3e6c8', '#3a6fd8', false).translateX(-0.6).translateZ(0.6));
    const tower = lookout(2.6, true);
    tower.position.set(0.9, 0, -0.9);
    tower.scale.setScalar(0.7);
    g.add(tower);
    return g;
  }
  const b = block(3.2, 3, tier === 4 ? 2 : 3, '#e8eef4', '#3a6fd8');
  g.add(b);
  g.add(dish(tier === 4 ? 0.6 : 0.9).translateY(b.userData.top as number).translateX(0.6));
  if (tier >= 5) g.add(cyl(0.05, 0.12, 3, '#b9b9c2', -1, b.userData.top as number, -0.8), sphere(0.15, '#e5402f', -1, (b.userData.top as number) + 3.1, -0.8));
  return g;
}

// --- Staff house -------------------------------------------------------------------------------------
function buildStaffHouse(tier: number) {
  if (tier === 1) return house(2.4, 2, 1.4, '#c49a6c', '#8a5a3b', false);
  if (tier === 2) return house(3.4, 2.4, 1.7, '#efe0c0', '#3aa655');
  if (tier === 3) return house(4.4, 2.8, 2.2, '#efe0c0', '#3aa655');
  if (tier === 4) {
    const g = house(3.6, 2.8, 2.4, '#efe0c0', '#2e8a45');
    g.add(house(1.6, 2.2, 1.8, '#efe0c0', '#2e8a45', false).translateX(2.5).translateZ(0.3));
    g.add(box(1.6, 0.15, 0.6, '#7a4f2c', -0.6, 1.4, 1.6));
    return g;
  }
  // Coaching HQ: glass block with a green roof terrace.
  const g = block(5, 3, 2, '#e8eef4', '#3aa655', '#9fd3f0');
  const top = g.userData.top as number;
  for (let i = 0; i < 4; i++) g.add(sphere(0.3, '#5db04a', -1.8 + i * 1.2, top + 0.25, -0.8));
  return g;
}

// --- Office (Club Level) and Dugout (Staff House Tier) ------------------------------------------------------
function buildOffice(stage: number, colors: Colors) {
  if (stage === 0) {
    // Portakabin.
    const g = new THREE.Group();
    g.add(box(4.4, 1.9, 2.4, '#d9e4ee', 0, 0.2, 0), box(4.5, 0.12, 2.5, '#9a958c', 0, 2.1, 0));
    for (const sx of [-1, 1]) g.add(windowAt(sx * 1.3, 1.2, 1.23));
    g.add(door(0, 1.24), box(1.2, 0.3, 0.6, '#9a958c', 0, 0, 1.5));
    const f = flag(colors[0], 2.6);
    f.position.set(2.6, 0, 1.2);
    g.add(f);
    return g;
  }
  if (stage === 1) {
    // The clubhouse: blue roof, porch and flag.
    const g = new THREE.Group();
    g.add(house(4.75, 4, 2.55, '#f3e6c8', '#3a6fd8'));
    g.add(box(2.4, 0.15, 1.1, '#a8743f', 0, 0.3, 2.45));
    for (const sx of [-1, 1]) g.add(box(0.15, 1.6, 0.15, '#7a4f2c', sx * 1.05, 0.3, 2.9));
    g.add(roof(2.8, 0.6, 1.3, '#2d5bb8', 1.9).translateZ(2.45));
    const f = flag(colors[0], 2.5);
    f.position.set(2.8, 0, 1.8);
    g.add(f);
    return g;
  }
  const floors = stage === 2 ? 2 : 4;
  const g = block(stage === 2 ? 5 : 4, stage === 2 ? 4 : 3.6, floors, '#f3e6c8', colors[0]);
  // A stripe of club colour up the front.
  g.add(box(0.5, floors * 1.2, 0.06, colors[0], -1.4, 0.2, (stage === 2 ? 2 : 1.8) + 0.05));
  for (const sx of [-1, 1]) {
    const f = flag(sx > 0 ? colors[0] : colors[1], 3);
    f.position.set(sx * 2.7, 0, 2.6);
    g.add(f);
  }
  return g;
}

function buildDugout(stage: number, colors: Colors) {
  const g = new THREE.Group();
  if (stage === 0) {
    g.add(box(2.4, 0.1, 0.5, '#a8743f', 0, 0.45, 0), box(2.4, 0.35, 0.08, '#a8743f', 0, 0.55, -0.22));
    for (const sx of [-1, 1]) g.add(box(0.08, 0.45, 0.45, '#3b3b44', sx * 1.1, 0, 0));
    return g;
  }
  const len = stage === 2 ? 3.8 : 3.2;
  g.add(box(len + 0.2, 0.12, 1.4, '#9a958c'));
  g.add(box(len, 1.3, 0.1, colors[0], 0, 0.12, -0.6));
  for (const sx of [-1, 1]) g.add(box(0.1, 1.3, 1.2, stage === 2 ? '#cfe8ff' : colors[0], (sx * len) / 2, 0.12, 0));
  const top = box(len + 0.2, 0.08, 1.5, '#cfe8ff', 0, 1.45, 0);
  top.rotation.x = 0.12;
  g.add(top);
  g.add(box(len - 0.2, 0.1, 0.4, '#3b3b44', 0, 0.45, -0.3));
  if (stage === 2) {
    // Technical area: padded seats and an analysis screen.
    for (let i = 0; i < 5; i++) g.add(box(0.5, 0.4, 0.4, colors[1], -len / 2 + 0.6 + i * 0.65, 0.5, -0.3));
    g.add(box(0.9, 0.6, 0.06, '#2b2b3a', len / 2 + 0.5, 1, 0.4), box(0.06, 1, 0.06, '#5d6470', len / 2 + 0.5, 0, 0.4));
  }
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

/** A campus building at its stage (see stages.ts): facilities by Tier, the
 * Office by Club Level, the Dugout by Staff House Tier. The stadium's seating
 * follows the Stands Tier. */
export function buildingModel(key: CampusBuilding, ctx: StageContext & { standsTier: number }, upgrading: boolean, colors: Colors) {
  const root = new THREE.Group();
  const stage = stageOf(key, ctx);
  const facility = key !== 'dugout' && key !== 'office';
  if (facility && stage === 0 && key !== 'stadium_grounds') {
    root.add(plot(key, upgrading));
    return root;
  }
  const builders: Record<CampusBuilding, () => THREE.Object3D> = {
    office: () => buildOffice(stage, colors),
    dugout: () => buildDugout(stage, colors),
    stadium_grounds: () => buildPitch(stage, ctx.standsTier, colors),
    stands: () => buildFanZone(stage, colors),
    training_ground: () => buildTraining(stage),
    youth_academy: () => buildAcademy(stage, colors),
    medical_centre: () => buildMedical(stage),
    scouting: () => buildScouting(stage),
    staff_house: () => buildStaffHouse(stage),
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

/** A street newsstand: kiosk, striped awning and stacks of papers. */
export function newsstand() {
  const g = new THREE.Group();
  g.add(box(2.2, 1.6, 1.4, '#3aa655', 0, 0, 0));
  g.add(box(1.8, 0.7, 0.1, '#cfe8ff', 0, 0.8, 0.71));
  for (let i = 0; i < 5; i++) {
    const s = box(0.46, 0.1, 1.1, i % 2 ? '#ffffff' : '#d9483b', -0.92 + i * 0.46, 1.9, 0.55);
    s.rotation.x = 0.35;
    g.add(s);
  }
  g.add(box(2.4, 0.2, 1.6, '#2e8a45', 0, 1.6, 0));
  for (let i = 0; i < 3; i++) g.add(box(0.5, 0.18 + i * 0.06, 0.35, '#f5f1e6', -0.7 + i * 0.7, 0, 1.05));
  return g;
}

/** A roadside billboard. Draw on the returned canvas, then set texture.needsUpdate. */
export function billboard() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) g.add(box(0.2, 3.2, 0.2, '#5d6470', sx * 2.2, 0, 0));
  g.add(box(5.4, 2.6, 0.25, '#8a5a3b', 0, 3, 0));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 240;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.3), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.set(0, 4.3, 0.14);
  g.add(face);
  return { group: g, canvas, texture };
}
