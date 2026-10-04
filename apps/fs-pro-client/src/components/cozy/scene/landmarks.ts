import * as THREE from 'three';
import { mat } from './models';
import { mergeByMaterial } from './merge';

/** Each town terrain has one landmark in the city beyond the ring road. */
export type LandmarkKind = 'townhall' | 'lighthouse' | 'windmill' | 'watermill' | 'chapel';

/** A part that turns every frame about one of its local axes. */
export interface Spinner { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }

function part(g: THREE.Object3D, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
/** Box with its base at y. */
const box = (g: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) =>
  part(g, new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);
const cyl = (g: THREE.Object3D, rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 10) =>
  part(g, new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z);

/** Gable roof: wall-coloured ends, ridge along z. */
function gable(g: THREE.Object3D, w: number, h: number, d: number, roof: string, y: number, z = 0, x = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  part(g, new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), roof, x, y, z);
}
const hip = (g: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number) =>
  part(g, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d), color, x, y + h / 2, z);

/** Tall window with an arched head on a wall facing local +z, turned by ry. */
function arched(g: THREE.Object3D, x: number, y: number, z: number, w = 0.7, h = 1.6, glass = '#5b8fd6', ry = 0) {
  const a = new THREE.Group();
  box(a, w + 0.2, h, 0.08, '#f3ead6', 0, -0.1, 0);
  part(a, new THREE.CircleGeometry(w / 2 + 0.1, 10, 0, Math.PI), '#f3ead6', 0, h - 0.1, 0.041);
  box(a, w, h - 0.1, 0.1, glass, 0, 0, 0.01);
  part(a, new THREE.CircleGeometry(w / 2, 10, 0, Math.PI), glass, 0, h - 0.1, 0.065);
  a.position.set(x, y, z);
  a.rotation.y = ry;
  g.add(a);
}

/** A clock face on each side of a square tower centred at (0, y, cz) with half-width r. */
function clocks(g: THREE.Object3D, y: number, cz: number, r: number) {
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Group();
    part(f, new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16).rotateX(Math.PI / 2), '#fbf8f1', 0, 0, r);
    part(f, new THREE.TorusGeometry(0.88, 0.08, 4, 16), '#c9a227', 0, 0, r + 0.03);
    box(f, 0.09, 0.62, 0.05, '#2b2b3a', 0, -0.06, r + 0.07).rotation.z = -0.6;
    box(f, 0.09, 0.42, 0.05, '#2b2b3a', 0, -0.06, r + 0.08).rotation.z = 1.9;
    f.position.set(0, y, cz);
    f.rotation.y = (k * Math.PI) / 2;
    g.add(f);
  }
}

function townhall() {
  const g = new THREE.Group();
  const brick = '#b5654a', stone = '#efe3c8', slate = '#56606e';
  // Plinth and front steps.
  box(g, 13, 0.5, 8.2, '#d8d2c6');
  for (let i = 0; i < 3; i++) box(g, 4.4 - i * 0.5, 0.18, 0.6, '#cfc8bb', 0, 0.5 + i * 0.18 - 0.18, 4.4 - i * 0.45);
  // Main hall with stone bands and a slate hip roof.
  box(g, 10, 4.4, 6.2, brick, 0, 0.5);
  for (const y of [0.5, 2.55, 4.7]) box(g, 10.2, 0.22, 6.4, stone, 0, y);
  hip(g, 10.8, 2.1, 6.9, slate, 0, 4.9, 0);
  for (const sx of [-1, 1]) {
    for (const k of [1.6, 3.3]) {
      arched(g, sx * k, 0.95, 3.12, 0.7, 1.15);
      arched(g, sx * k, 3.0, 3.12, 0.7, 1.15);
    }
    // Wings.
    box(g, 2.8, 3.4, 5, brick, sx * 6.4, 0.5, 0.2);
    box(g, 3.0, 0.22, 5.2, stone, sx * 6.4, 3.9, 0.2);
    hip(g, 3.3, 1.4, 5.5, slate, sx * 6.4, 4.1, 0.2);
    arched(g, sx * 6.4, 1.3, 2.72, 0.8, 1.3);
    // Flags at the corners of the square.
    cyl(g, 0.06, 0.06, 5.5, '#dcdcdc', sx * 5.6, 0.5, 4.6, 6);
    box(g, 1.2, 0.7, 0.04, sx > 0 ? '#3a6fd8' : '#f2b632', sx * 5.6 + 0.6, 5.2, 4.6);
    // Planters.
    box(g, 1.1, 0.5, 1.1, '#bfb6a6', sx * 3.4, 0.5, 4.6);
    part(g, new THREE.IcosahedronGeometry(0.55, 0), '#4f9e3f', sx * 3.4, 1.3, 4.6);
  }
  // Clock tower over the entrance.
  box(g, 1.3, 2.1, 0.12, '#5a3a22', 0, 0.5, 3.12);
  box(g, 2.8, 4.6, 2.8, stone, 0, 4.9, 1.6);
  box(g, 3.0, 0.25, 3.0, brick, 0, 7.3, 1.6);
  clocks(g, 8.4, 1.6, 1.45);
  box(g, 2.5, 1.5, 2.5, brick, 0, 9.5, 1.6);
  for (const [dx, dz] of [[0, 1.26], [0, -1.26], [1.26, 0], [-1.26, 0]] as const) box(g, dx ? 0.1 : 0.9, 1.0, dz ? 0.1 : 0.9, '#3b2f2a', dx, 9.7, 1.6 + dz);
  part(g, new THREE.ConeGeometry(1.9, 3.4, 4).rotateY(Math.PI / 4), '#4f7a6a', 0, 11 + 1.7, 1.6);
  part(g, new THREE.IcosahedronGeometry(0.2, 0), '#e2c06b', 0, 14.55, 1.6);
  return g;
}

function lighthouse() {
  const g = new THREE.Group();
  const spinners: Spinner[] = [];
  // Rocky base.
  const rocks = [[0, 0, 3.2], [2.6, 1.2, 1.6], [-2.4, 1.6, 1.4], [1.4, -2.6, 1.5], [-1.8, -2.2, 1.2]] as const;
  for (const [x, z, s] of rocks) part(g, new THREE.DodecahedronGeometry(s, 0).scale(1, 0.55, 1), '#8f8a84', x, s * 0.2, z);
  // Striped tapered tower.
  const H = 10, r0 = 1.75, r1 = 1.15, bands = 5;
  for (let i = 0; i < bands; i++) {
    const a = r0 + ((r1 - r0) * i) / bands, b = r0 + ((r1 - r0) * (i + 1)) / bands;
    cyl(g, b, a, H / bands, i % 2 ? '#fbf8f1' : '#d9483b', 0, 1.2 + (i * H) / bands, 0, 14);
  }
  for (const y of [3.6, 6.4]) box(g, 0.45, 0.6, 0.1, '#3e5f86', 0, y, 1.6);
  box(g, 0.7, 1.2, 0.1, '#5a3a22', 0, 1.2, 1.74);
  const top = 1.2 + H;
  cyl(g, 1.75, 1.75, 0.25, '#3b3b44', 0, top, 0, 14);
  part(g, new THREE.TorusGeometry(1.65, 0.05, 4, 20).rotateX(Math.PI / 2), '#3b3b44', 0, top + 0.85, 0);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    cyl(g, 0.04, 0.04, 0.85, '#3b3b44', Math.cos(a) * 1.65, top + 0.25, Math.sin(a) * 1.65, 4);
  }
  cyl(g, 1.0, 1.0, 1.4, '#fff1b0', 0, top + 0.25, 0, 10).material = mat('#fff1b0', { emissive: '#ffd36b' });
  part(g, new THREE.SphereGeometry(1.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#b5352b', 0, top + 1.65, 0);
  cyl(g, 0.05, 0.08, 0.7, '#3b3b44', 0, top + 2.8, 0, 6);
  // Two soft beams turning slowly.
  const lamp = new THREE.Group();
  lamp.name = 'lamp';
  lamp.position.y = top + 0.95;
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 12, 10, 1, true).rotateZ((s * Math.PI) / 2).translate(s * 6.5, 0, 0), beamMat);
    lamp.add(beam);
  }
  g.add(lamp);
  spinners.push({ obj: lamp, axis: 'y', speed: 0.6 });
  // Keeper's cottage.
  const cot = new THREE.Group();
  box(cot, 3, 1.8, 2.4, '#fbf8f1', 0, 1.0);
  gable(cot, 3.4, 1.2, 2.8, '#d9483b', 2.8);
  box(cot, 0.6, 1.1, 0.08, '#2f6fb8', 0, 1.0, 1.22);
  cot.position.set(3.2, 0, 1.4);
  cot.rotation.y = Math.PI / 2;
  g.add(cot);
  return { g, spinners };
}

function windmill() {
  const g = new THREE.Group();
  const spinners: Spinner[] = [];
  cyl(g, 2.6, 2.8, 0.4, '#a69c8c', 0, 0, 0, 12);
  cyl(g, 1.5, 2.2, 6.4, '#e2c98f', 0, 0.4, 0, 12);
  cyl(g, 1.55, 1.75, 0.25, '#bda577', 0, 3.4, 0, 12);
  box(g, 0.9, 1.5, 0.12, '#2f6fb8', 0, 0.4, 2.16);
  for (const y of [2.6, 4.6]) box(g, 0.5, 0.6, 0.1, '#3e5f86', 0.4, y, 1.95 - (y - 2.6) * 0.15);
  part(g, new THREE.ConeGeometry(1.9, 2.2, 12), '#6b4a2e', 0, 7.9, 0);
  cyl(g, 0.12, 0.18, 0.5, '#3b3b44', 0, 8.95, 0, 6);
  // The sails turn about the hub's axis.
  const sails = new THREE.Group();
  sails.name = 'sails';
  sails.position.set(0, 7.3, 2.0);
  part(sails, new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8).rotateX(Math.PI / 2), '#5a3a22', 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2 + 0.3;
    box(arm, 0.18, 5.4, 0.12, '#7a4f2c', 0, 0.2, 0.15);
    box(arm, 1.15, 4.2, 0.06, '#f5f1e6', 0.62, 1.2, 0.2);
    for (let i = 0; i < 5; i++) box(arm, 1.2, 0.06, 0.08, '#7a4f2c', 0.62, 1.4 + i * 0.95, 0.24);
    sails.add(arm);
  }
  g.add(sails);
  spinners.push({ obj: sails, axis: 'z', speed: -0.7 });
  // Sacks by the door and a short fence.
  for (let i = 0; i < 3; i++) part(g, new THREE.IcosahedronGeometry(0.32, 0).scale(1, 1.2, 1), '#e8dcb8', 1.4 + i * 0.5, 0.75, 2.4);
  for (let i = 0; i < 5; i++) box(g, 0.1, 0.8, 0.1, '#7a4f2c', -3 + i * 0.8, 0, 3);
  box(g, 3.4, 0.08, 0.06, '#7a4f2c', -1.4, 0.65, 3);
  return { g, spinners };
}

function watermill() {
  const g = new THREE.Group();
  const spinners: Spinner[] = [];
  box(g, 6.4, 1.1, 5.2, '#9a958c', 0, -0.4);
  box(g, 5.8, 3.0, 4.6, '#a8743f', 0, 0.7);
  for (let i = 0; i < 7; i++) box(g, 5.86, 0.07, 4.66, '#7a4f2c', 0, 0.85 + i * 0.42);
  gable(g, 6.6, 2.6, 5.3, '#3f6b3a', 3.7);
  box(g, 0.8, 4.2, 0.8, '#8e8a84', 1.8, 3.2, -1.6);
  box(g, 1.0, 1.7, 0.1, '#4a2e1c', 0.6, 0.7, 2.32);
  for (const x of [-1.6, 2.0]) {
    box(g, 0.7, 0.8, 0.1, '#f3ead6', x, 1.8, 2.32);
    box(g, 0.55, 0.65, 0.12, '#ffd27a', x, 1.87, 2.32);
  }
  // The wheel on the river side, turning about x.
  const wheel = new THREE.Group();
  wheel.name = 'wheel';
  wheel.position.set(-3.6, 1.4, 0);
  for (const dx of [-0.35, 0.35]) part(wheel, new THREE.TorusGeometry(2.1, 0.12, 4, 18).rotateY(Math.PI / 2), '#7a4f2c', dx, 0, 0);
  for (let k = 0; k < 4; k++) box(wheel, 0.12, 4.2, 0.14, '#6b4a2e', 0, -2.1, 0).rotation.x = (k * Math.PI) / 4;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const p = box(wheel, 0.9, 0.08, 0.6, '#a8743f', 0, 0, 0);
    p.position.set(0, Math.sin(a) * 2.15, Math.cos(a) * 2.15);
    p.rotation.x = -a;
  }
  part(wheel, new THREE.CylinderGeometry(0.25, 0.25, 1, 8).rotateZ(Math.PI / 2), '#3b3b44', 0, 0, 0);
  g.add(wheel);
  spinners.push({ obj: wheel, axis: 'x', speed: 0.8 });
  // Stacked logs.
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      part(g, new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8).rotateZ(Math.PI / 2), '#b98450', 2.2, 0.3 + row * 0.52, 3.3 + (i - (3 - row) / 2) * 0.62);
    }
  }
  return { g, spinners };
}

function chapel() {
  const g = new THREE.Group();
  const plaster = '#f7f3ea', shingle = '#4a3626', snow = '#f7fbff';
  box(g, 4.6, 0.6, 7.2, '#9a958c');
  box(g, 4.2, 3.2, 6.6, plaster, 0, 0.6);
  gable(g, 5.0, 3.0, 7.2, shingle, 3.8, -0.1);
  gable(g, 4.0, 0.6, 7.25, snow, 3.8 + 2.4, -0.1);
  for (const sx of [-1, 1]) for (const z of [-1.8, 0.6]) arched(g, sx * 2.11, 1.4, z, 0.5, 1.1, '#3e5f86', (sx * Math.PI) / 2);
  // Bell tower at the front with an onion dome.
  box(g, 2.2, 7.4, 2.2, plaster, 0, 0.6, 3.5);
  box(g, 1.0, 1.7, 0.1, '#5a3a22', 0, 0.6, 4.62);
  const round = part(g, new THREE.CylinderGeometry(0.45, 0.45, 0.12, 12), '#3e5f86', 0, 3.4, 4.62);
  round.rotation.x = Math.PI / 2;
  for (const [dx, dz] of [[0, 1.11], [0, -1.11], [1.11, 0], [-1.11, 0]] as const) box(g, dx ? 0.1 : 0.7, 1.1, dz ? 0.1 : 0.7, '#3b2f2a', dx, 6.3, 3.5 + dz);
  box(g, 2.5, 0.25, 2.5, '#d8cbb0', 0, 8.0, 3.5);
  const onion = new THREE.LatheGeometry(
    [[0, 0], [0.9, 0.05], [1.25, 0.55], [1.15, 1.1], [0.6, 1.7], [0.18, 2.1], [0.08, 2.6], [0, 2.7]].map(([x, y]) => new THREE.Vector2(x, y)),
    12,
  );
  part(g, onion, '#4fa38a', 0, 8.25, 3.5);
  part(g, new THREE.IcosahedronGeometry(0.16, 0), '#e2c06b', 0, 11.05, 3.5);
  box(g, 0.06, 0.6, 0.06, '#e2c06b', 0, 11.1, 3.5);
  box(g, 0.36, 0.06, 0.06, '#e2c06b', 0, 11.5, 3.5);
  // A bench and a path stone or two.
  box(g, 1.4, 0.1, 0.4, '#7a4f2c', 2.8, 0.45, 4.5);
  return g;
}

/** Builds a landmark, merged by material to keep draw calls low, plus its moving parts. */
export function landmark(kind: LandmarkKind): { root: THREE.Group; spinners: Spinner[] } {
  const built =
    kind === 'townhall' ? { g: townhall(), spinners: [] } :
    kind === 'lighthouse' ? lighthouse() :
    kind === 'windmill' ? windmill() :
    kind === 'watermill' ? watermill() :
    { g: chapel(), spinners: [] };
  mergeByMaterial(built.g);
  return { root: built.g, spinners: built.spinners };
}
