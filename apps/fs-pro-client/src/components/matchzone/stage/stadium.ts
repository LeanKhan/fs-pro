/**
 * The ground around the pitch, in the campus's cozy style: flat-shaded,
 * low-poly, sunny. Raked two-tier stands in cream concrete with seats and
 * roofs in club colours, a chunky instanced crowd (idle bob, erupting on a
 * goal) waving flags, bunting, painted pitchside boards, floodlight masts,
 * dugouts, a wooden scoreboard, and a little town, trees, hills and clouds
 * beyond the walls.
 *
 * Coordinates: metres, pitch centred at the origin, x along the length,
 * z across. The broadcast camera sits on the -z touchline, so the main
 * stand and the dugouts face it from +z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PITCH_LENGTH, PITCH_WIDTH, hash01 } from '../playback';
import { adBoardTexture, shade } from './textures';

export interface StadiumOptions {
  homeCode: string;
  awayCode: string;
  homeKit: [string, string];
  awayKit: [string, string];
  /** 0-1: crowd density (lower on mobile). */
  crowdDensity: number;
  /** Lighter fans for phones. */
  lowPower?: boolean;
}

export interface StadiumKit {
  root: THREE.Group;
  update(dt: number, time: number): void;
  /** A goal: that side's fans erupt for a few seconds. */
  cheer(side: 'home' | 'away'): void;
  setScoreboard(text: { home: string; away: string; score: string; minute: string }): void;
}

const ROW_DEPTH = 0.95;
const ROW_RISE = 0.55;
const SEAT_SPACING = 0.78;
const CONCRETE = '#d9d0bf';
const CONCRETE_D = '#b8ad99';
const CREAM = '#f5f1e6';
const WOOD = '#8a5a3b';

/**
 * Collects flat-shaded parts as vertex-coloured, non-indexed geometry so a
 * whole structure draws in one call.
 */
export class Batch {
  private geos: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: string | THREE.Color, m?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geos.push(out);
    return this;
  }
  box(w: number, h: number, d: number, color: string, m: THREE.Matrix4) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, m);
  }
  build(name: string, opts: { shadow?: boolean } = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(
      mergeGeometries(this.geos),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 })
    );
    mesh.name = name;
    mesh.castShadow = !!opts.shadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

export const T = (x: number, y: number, z: number, ry = 0) =>
  new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);

interface StandSpec {
  /** Centre of the stand's inner edge. */
  origin: THREE.Vector3;
  /** Unit vector along the stand's length. */
  along: THREE.Vector3;
  /** Unit vector from the pitch into the stand. */
  back: THREE.Vector3;
  length: number;
  tiers: { rows: number; depthOffset: number; heightOffset: number }[];
  roof: boolean;
  /** Home-fan share per tier (the rest are visitors). */
  allegiance: number[];
}

/** A stepped rake: front wall, then `rows` steps up and back, then a back wall. */
function rakeShape(rows: number, frontWall: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, frontWall);
  let d = 0;
  let h = frontWall;
  for (let r = 0; r < rows; r++) {
    d += ROW_DEPTH;
    s.lineTo(d, h);
    h += ROW_RISE;
    s.lineTo(d, h);
  }
  s.lineTo(d + 1.4, h);
  s.lineTo(d + 1.4, h + 1.6);
  s.lineTo(d + 2, h + 1.6);
  s.lineTo(d + 2, 0);
  s.closePath();
  return s;
}

export function buildStadium(opts: StadiumOptions): StadiumKit {
  const root = new THREE.Group();
  root.name = 'stadium';

  const halfL = PITCH_LENGTH / 2;
  const halfW = PITCH_WIDTH / 2;
  const SIDE_GAP = 9;
  const END_GAP = 10;
  const lowerRows = 13;
  const upperRows = 10;
  const front = 1.3;
  const tiers = [
    { rows: lowerRows, depthOffset: 0, heightOffset: 0 },
    { rows: upperRows, depthOffset: lowerRows * ROW_DEPTH + 3, heightOffset: lowerRows * ROW_RISE + front + 3.2 },
  ];
  const tier0 = tiers[0]!;
  const tier1 = tiers[1]!;

  const stands: StandSpec[] = [
    // Main stand, facing the camera.
    { origin: new THREE.Vector3(0, 0, halfW + SIDE_GAP), along: new THREE.Vector3(1, 0, 0), back: new THREE.Vector3(0, 0, 1), length: PITCH_LENGTH + 12, tiers, roof: true, allegiance: [0.88, 0.94] },
    // Behind the camera: one low tier, rarely in shot.
    { origin: new THREE.Vector3(0, 0, -halfW - SIDE_GAP), along: new THREE.Vector3(-1, 0, 0), back: new THREE.Vector3(0, 0, -1), length: PITCH_LENGTH + 12, tiers: [tier0], roof: false, allegiance: [0.9] },
    // Home end.
    { origin: new THREE.Vector3(halfL + END_GAP, 0, 0), along: new THREE.Vector3(0, 0, -1), back: new THREE.Vector3(1, 0, 0), length: PITCH_WIDTH + 10, tiers, roof: true, allegiance: [1, 1] },
    // Away end: the visitors fill the upper tier.
    { origin: new THREE.Vector3(-halfL - END_GAP, 0, 0), along: new THREE.Vector3(0, 0, 1), back: new THREE.Vector3(-1, 0, 0), length: PITCH_WIDTH + 10, tiers, roof: true, allegiance: [0.85, 0.04] },
  ];

  /** Maps stand-local (along, up, back) into the world. */
  const basis = (s: StandSpec) =>
    new THREE.Matrix4().makeBasis(s.along, new THREE.Vector3(0, 1, 0), s.back).setPosition(s.origin);
  const local = (s: StandSpec, a: number, y: number, b: number) => new THREE.Matrix4().makeTranslation(a, y, b).premultiply(basis(s));

  // ---- Stand structures, seats, roofs ----------------------------------
  const shell = new Batch();
  const seatsB = new Batch();
  const roofB = new Batch();
  for (const s of stands) {
    const m = basis(s);
    s.tiers.forEach((t, ti) => {
      const geo = new THREE.ExtrudeGeometry(rakeShape(t.rows, front), { depth: s.length, bevelEnabled: false });
      // Profile (depth, height) extruded along +z -> (along, up, back).
      geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -s.length / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
      geo.translate(0, t.heightOffset, t.depthOffset);
      shell.add(geo, CONCRETE, m);
      // Seat benches: alternating club colours, row by row.
      const share = s.allegiance[ti] ?? 1;
      const kit = share < 0.5 ? opts.awayKit : opts.homeKit;
      for (let r = 0; r < t.rows; r++) {
        const y = t.heightOffset + front + r * ROW_RISE + 0.12;
        const z = t.depthOffset + r * ROW_DEPTH + ROW_DEPTH * 0.62;
        seatsB.box(s.length - 1, 0.24, 0.42, r % 2 ? kit[0] : shade(kit[0], 0.18), local(s, 0, y, z));
      }
      // Gangway stairs every 14 m, lighter concrete.
      for (let a = -s.length / 2 + 7; a < s.length / 2 - 3; a += 14) {
        for (let r = 0; r < t.rows; r++) {
          seatsB.box(1.1, 0.3, ROW_DEPTH, CREAM, local(s, a, t.heightOffset + front + r * ROW_RISE + 0.15, t.depthOffset + r * ROW_DEPTH + ROW_DEPTH / 2));
        }
      }
      // Side walls closing the ends of each tier.
      const topH = t.heightOffset + front + t.rows * ROW_RISE + 1.6;
      const depth = t.rows * ROW_DEPTH + 2;
      for (const side of [-1, 1]) {
        const wall = new THREE.Shape();
        wall.moveTo(0, 0);
        wall.lineTo(0, t.heightOffset + front + 0.4);
        wall.lineTo(depth, topH);
        wall.lineTo(depth, 0);
        wall.closePath();
        const wg = new THREE.ExtrudeGeometry(wall, { depth: 0.6, bevelEnabled: false });
        wg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, side * (s.length / 2) - 0.3, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
        wg.translate(0, 0, t.depthOffset);
        shell.add(wg, CONCRETE_D, m);
      }
    });
    if (s.tiers.length > 1) {
      // Fascia between tiers in the home colour with a cream trim.
      shell.box(s.length, 1.6, 0.5, opts.homeKit[0], local(s, 0, tier1.heightOffset - 0.3, tier1.depthOffset - 0.5));
      shell.box(s.length, 0.22, 0.6, CREAM, local(s, 0, tier1.heightOffset + 0.55, tier1.depthOffset - 0.5));
    }
    if (s.roof) {
      // A sloped canopy in the club colour, white trusses and a scalloped
      // cream fascia along its front edge.
      const top = tier1.heightOffset + front + upperRows * ROW_RISE + 5.5;
      const depth = tier1.depthOffset + upperRows * ROW_DEPTH + 2.5;
      const roofDepth = depth * 0.78;
      const roofColor = s.allegiance[1]! < 0.5 ? opts.awayKit[0] : opts.homeKit[0];
      const tilt = new THREE.Matrix4().makeRotationX(-0.12);
      roofB.box(s.length + 2, 0.45, roofDepth, roofColor, local(s, 0, top, depth - roofDepth / 2).multiply(tilt));
      // Stripes on the roof so it reads from above.
      for (let a = -s.length / 2 + 4; a < s.length / 2; a += 8) {
        roofB.box(3.6, 0.5, roofDepth + 0.02, shade(roofColor, 0.22), local(s, a + 2, top + 0.01, depth - roofDepth / 2).multiply(tilt));
      }
      const frontZ = depth - roofDepth;
      const frontY = top + Math.sin(0.12) * roofDepth * 0.5;
      roofB.box(s.length + 2.2, 0.9, 0.35, CREAM, local(s, 0, frontY - 0.3, frontZ));
      for (let a = -s.length / 2 + 0.6; a < s.length / 2; a += 1.2) {
        const cone = new THREE.ConeGeometry(0.6, 0.7, 4, 1);
        cone.rotateX(Math.PI);
        cone.rotateY(Math.PI / 4);
        roofB.add(cone, CREAM, local(s, a, frontY - 1.05, frontZ));
      }
      for (let a = -s.length / 2 + 6; a <= s.length / 2 - 6; a += 12) {
        shell.box(0.6, top + 1, 0.6, CREAM, local(s, a, (top + 1) / 2, depth + 0.4));
        const brace = new THREE.CylinderGeometry(0.16, 0.16, roofDepth * 1.02, 6);
        brace.rotateX(Math.PI / 2 - 0.12);
        shell.add(brace, CREAM, local(s, a, top + 0.65, depth - roofDepth / 2));
      }
    }
  }
  // Corner blocks that close the bowl, each with a big wooden gate.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (halfL + END_GAP + 6);
      const z = sz * (halfW + SIDE_GAP + 6);
      shell.box(12, 9, 12, CONCRETE_D, T(x, 4.5, z));
      shell.box(12.6, 0.6, 12.6, CREAM, T(x, 9.3, z));
      shell.box(4, 3.2, 0.4, WOOD, T(x, 1.6, z + sz * 6.05));
    }
  }
  root.add(shell.build('stands', { shadow: true }));
  root.add(seatsB.build('seats'));
  root.add(roofB.build('roofs', { shadow: true }));

  // ---- Pitchside boards ------------------------------------------------
  const boardTex = adBoardTexture(opts.homeCode, opts.awayCode, [opts.homeKit[0], opts.awayKit[0]]);
  const boardGeos: THREE.BufferGeometry[] = [];
  const BOARD_OFF = 4.2;
  const boardRuns: [number, number, number, number][] = [
    [-halfL, halfW + BOARD_OFF, halfL, halfW + BOARD_OFF],
    [halfL, -halfW - BOARD_OFF, -halfL, -halfW - BOARD_OFF],
    [halfL + BOARD_OFF + 1, -halfW + 2, halfL + BOARD_OFF + 1, halfW - 2],
    [-halfL - BOARD_OFF - 1, halfW - 2, -halfL - BOARD_OFF - 1, -halfW + 2],
  ];
  const boardBack = new Batch();
  for (const [x0, z0, x1, z1] of boardRuns) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const g = new THREE.PlaneGeometry(len, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 34);
    g.translate(0, 0.62, 0);
    // Face the pitch.
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(ang + Math.PI));
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    boardGeos.push(g);
    const out = new THREE.Vector3(-(z1 - z0), 0, x1 - x0).normalize().multiplyScalar(-0.18);
    boardBack.box(len, 1.1, 0.3, WOOD, T((x0 + x1) / 2 + out.x, 0.6, (z0 + z1) / 2 + out.z, ang));
  }
  const boards = new THREE.Mesh(
    mergeGeometries(boardGeos),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.18 })
  );
  boards.name = 'adBoards';
  root.add(boards);
  root.add(boardBack.build('boardFrames'));

  // ---- Crowd -----------------------------------------------------------
  interface Seat { pos: THREE.Vector3; facing: number; team: number; color: THREE.Color; flag: boolean }
  const seats: Seat[] = [];
  const pal = (kit: [string, string]) => [kit[0], kit[0], kit[0], kit[1], shade(kit[0], 0.25), shade(kit[0], -0.2)].map((c) => new THREE.Color(c));
  const homeColors = pal(opts.homeKit);
  const awayColors = pal(opts.awayKit);
  const neutral = ['#f5f1e6', '#3b4a6b', '#5a4632', '#e0483e', '#3aa655', '#f2b632'].map((c) => new THREE.Color(c));
  stands.forEach((s, si) => {
    const m = basis(s);
    const facing = Math.atan2(-s.back.x, -s.back.z);
    s.tiers.forEach((t, ti) => {
      const homeShare = s.allegiance[ti] ?? 0.9;
      for (let r = 0; r < t.rows; r++) {
        const depth = t.depthOffset + r * ROW_DEPTH + ROW_DEPTH * 0.45;
        const height = t.heightOffset + front + r * ROW_RISE + 0.24;
        for (let a = -s.length / 2 + 1; a < s.length / 2 - 1; a += SEAT_SPACING) {
          const key = `${si}:${ti}:${r}:${a.toFixed(2)}`;
          if (hash01(key) > 0.93 * opts.crowdDensity) continue; // empty seat
          const gang = (((a + s.length / 2 - 7) % 14) + 14) % 14;
          if (gang < 0.7 || gang > 13.3) continue; // gangway
          const p = new THREE.Vector3(a + (hash01(key + 'j') - 0.5) * 0.2, height, depth).applyMatrix4(m);
          const away = hash01(key + 'a') > homeShare;
          const palette = hash01(key + 'n') < 0.1 ? neutral : away ? awayColors : homeColors;
          const color = palette[Math.floor(hash01(key + 'c') * palette.length)]!.clone();
          color.offsetHSL(0, 0, (hash01(key + 'l') - 0.5) * 0.06);
          seats.push({ pos: p, facing, team: away ? 1 : 0, color, flag: hash01(key + 'f') < 0.035 });
        }
      }
    });
  });

  const crowdUniforms = { uTime: { value: 0 }, uCheer: { value: new THREE.Vector2(0, 0) } };
  const crowdChunk = `
    float cheer = mix(uCheer.x, uCheer.y, aTeam);
    float idle = sin(uTime * (1.2 + aSeed * 1.6) + aSeed * 40.0) * 0.05;
    float jump = cheer * abs(sin(uTime * (6.5 + aSeed * 3.0) + aSeed * 25.0)) * 0.7;`;
  const crowdMaterial = (extra = '', doubleSide = false) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = crowdUniforms.uTime;
      shader.uniforms.uCheer = crowdUniforms.uCheer;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSeed;\nattribute float aTeam;\nuniform float uTime;\nuniform vec2 uCheer;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>${crowdChunk}\n${extra}\ntransformed.y += idle + jump;`);
    };
    // Each variant compiles its own program.
    mat.customProgramCacheKey = () => `crowd:${extra.length}:${doubleSide}`;
    return mat;
  };
  const posNormal = (g: THREE.BufferGeometry) => {
    const q2 = new THREE.BufferGeometry();
    const n = g.index ? g.toNonIndexed() : g;
    q2.setAttribute('position', n.attributes.position);
    q2.setAttribute('normal', n.attributes.normal);
    return q2;
  };
  // A chunky fan: rounded body with arms, and a head (the campus walker,
  // seated). Arms rise when their side cheers.
  const body = new THREE.CylinderGeometry(0.24, 0.3, 0.62, opts.lowPower ? 5 : 6, 1, !!opts.lowPower);
  body.translate(0, 0.31, 0);
  const arms = [-1, 1].map((sx) => new THREE.BoxGeometry(0.12, 0.42, 0.12).translate(sx * 0.32, 0.38, 0.02));
  const fanGeo = mergeGeometries([body, ...arms].map(posNormal))!;
  const headGeo = opts.lowPower ? new THREE.OctahedronGeometry(0.24, 0) : new THREE.IcosahedronGeometry(0.22, 0);
  headGeo.translate(0, 0.86, 0);
  // Arm vertices (out to the side) swing up with the cheer; a few fans
  // wave anyway.
  const armLift = `
    if (abs(position.x) > 0.25) {
      float lift = clamp(cheer * 1.4 + step(0.92, fract(aSeed * 13.0)) * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 9.0)), 0.0, 1.0);
      transformed.y += lift * (position.y - 0.17) * 1.4 + lift * 0.25;
    }`;
  const crowdBody = new THREE.InstancedMesh(fanGeo, crowdMaterial(armLift), seats.length);
  const crowdHead = new THREE.InstancedMesh(headGeo, crowdMaterial(), seats.length);
  crowdBody.name = 'crowd';
  crowdHead.name = 'crowdHeads';
  const seed = new Float32Array(seats.length);
  const team = new Float32Array(seats.length);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const skins = ['#f6d3b3', '#e8b48f', '#c98e64', '#a06a43', '#6e4428', '#4a2e1c'].map((c) => new THREE.Color(c));
  seats.forEach((s, i) => {
    q.setFromAxisAngle(up, s.facing);
    const sc = 1 + (hash01('s' + i) - 0.5) * 0.18;
    mtx.compose(s.pos, q, new THREE.Vector3(sc, sc, sc));
    crowdBody.setMatrixAt(i, mtx);
    crowdHead.setMatrixAt(i, mtx);
    crowdBody.setColorAt(i, s.color);
    crowdHead.setColorAt(i, skins[Math.floor(hash01('k' + i) * skins.length)]!);
    seed[i] = hash01(String(i));
    team[i] = s.team;
  });
  for (const mesh of [crowdBody, crowdHead]) {
    mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    mesh.geometry.setAttribute('aTeam', new THREE.InstancedBufferAttribute(team, 1));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  // Handheld flags, waving harder when their side scores.
  const flagSeats = seats.map((s, i) => ({ s, i })).filter((f) => f.s.flag);
  const pole = new THREE.CylinderGeometry(0.025, 0.025, 1.6, 4).translate(0.3, 1.2, 0);
  const cloth = new THREE.PlaneGeometry(0.9, 0.6, 4, 1).translate(0.75, 1.68, 0);
  const flagGeo = mergeGeometries([pole, cloth].map(posNormal))!;
  const flagWave = `
    if (position.x > 0.31) {
      float k = (position.x - 0.3) / 0.9;
      transformed.z += sin(uTime * (5.0 + cheer * 6.0) + aSeed * 30.0 + position.x * 5.0) * 0.22 * k;
    }`;
  const flags = new THREE.InstancedMesh(flagGeo, crowdMaterial(flagWave, true), flagSeats.length);
  const fseed = new Float32Array(flagSeats.length);
  const fteam = new Float32Array(flagSeats.length);
  flagSeats.forEach(({ s, i }, k) => {
    q.setFromAxisAngle(up, s.facing);
    mtx.compose(s.pos, q, new THREE.Vector3(1, 1, 1));
    flags.setMatrixAt(k, mtx);
    const kit = s.team ? opts.awayKit : opts.homeKit;
    flags.setColorAt(k, new THREE.Color(hash01('fc' + i) < 0.6 ? kit[0] : kit[1]));
    fseed[k] = seed[i]!;
    fteam[k] = s.team;
  });
  flags.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(fseed, 1));
  flags.geometry.setAttribute('aTeam', new THREE.InstancedBufferAttribute(fteam, 1));
  flags.frustumCulled = false;
  flags.name = 'crowdFlags';
  root.add(flags);

  // ---- Floodlight masts and bunting ----------------------------------------
  const masts = new Batch();
  const MAST_H = 34;
  const towerSpots: [number, number][] = [
    [halfL + END_GAP + 6, halfW + SIDE_GAP + 6],
    [-halfL - END_GAP - 6, halfW + SIDE_GAP + 6],
    [halfL + END_GAP + 6, -halfW - SIDE_GAP - 6],
    [-halfL - END_GAP - 6, -halfW - SIDE_GAP - 6],
  ];
  const lampMats: THREE.Matrix4[] = [];
  for (const [x, z] of towerSpots) {
    masts.add(new THREE.CylinderGeometry(0.55, 0.9, MAST_H, 8), CREAM, T(x, 9 + MAST_H / 2, z));
    const head = new THREE.Vector3(x, 9 + MAST_H + 1.5, z);
    // lookAt from the origin towards the head: the frame's +z faces away
    // from the pitch, so lamps sit on its -z side.
    const face = new THREE.Matrix4().lookAt(head, new THREE.Vector3(0, 0, 0), up).setPosition(head);
    masts.add(new THREE.BoxGeometry(7, 4.2, 0.7), '#b9b9c2', face);
    for (let gx = 0; gx < 4; gx++) {
      for (let gy = 0; gy < 3; gy++) {
        lampMats.push(face.clone().multiply(new THREE.Matrix4().makeTranslation(-2.55 + gx * 1.7, -1.3 + gy * 1.3, -0.45)));
      }
    }
  }
  root.add(masts.build('floodlightMasts', { shadow: true }));
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 1.0, 0.2), new THREE.MeshBasicMaterial({ color: '#fff6c8' }), lampMats.length);
  lampMats.forEach((mm, i) => lamps.setMatrixAt(i, mm));
  lamps.name = 'floodlightLamps';
  root.add(lamps);

  // Bunting: strings of pennants in club colours along each tier fascia.
  const bunting = new Batch();
  const pennant = new THREE.BufferGeometry();
  pennant.setAttribute('position', new THREE.Float32BufferAttribute([-0.35, 0, 0, 0.35, 0, 0, 0, -0.7, 0], 3));
  pennant.computeVertexNormals();
  const bColors = [opts.homeKit[0], opts.homeKit[1], '#f5b82e', opts.awayKit[0], '#5cc23a', '#3a8ee0'];
  for (const s of stands) {
    if (!s.tiers[1]) continue;
    const y0 = tier1.heightOffset - 1.3;
    const z0 = tier1.depthOffset - 0.85;
    for (let a = -s.length / 2 + 0.6, k = 0; a < s.length / 2; a += 1.05, k++) {
      const sag = Math.sin(((a + s.length / 2) / 8) * Math.PI) * 0.3;
      bunting.add(pennant.clone(), bColors[k % bColors.length]!, local(s, a, y0 - Math.abs(sag), z0));
    }
  }
  const buntingMesh = bunting.build('bunting');
  (buntingMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  root.add(buntingMesh);

  // ---- Dugouts (+z, either side of halfway) -----------------------------
  const dug = new Batch();
  for (const [x, kit] of [[-9, opts.homeKit], [9, opts.awayKit]] as const) {
    dug.box(8, 0.4, 2.6, CONCRETE_D, T(x, 0.2, halfW + 6.6));
    dug.box(7.6, 0.45, 0.7, kit[0], T(x, 0.62, halfW + 7.3));
    dug.box(7.6, 0.7, 0.18, kit[0], T(x, 1.0, halfW + 7.65));
    // Half-pipe canopy, open towards the pitch.
    const canopy = new THREE.CylinderGeometry(1.7, 1.7, 8, 10, 1, true, -Math.PI / 2, Math.PI);
    canopy.rotateZ(Math.PI / 2);
    dug.add(canopy, shade(kit[0], 0.35), T(x, 0.4, halfW + 7.4));
  }
  const dugMesh = dug.build('dugouts', { shadow: true });
  (dugMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  root.add(dugMesh);

  // ---- Scoreboard: a wooden frame above the away end ---------------------
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 200;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screenTop = tier1.heightOffset + front + upperRows * ROW_RISE + 8;
  const sbGroup = new THREE.Group();
  sbGroup.position.set(-halfL - END_GAP - 8, screenTop + 4.5, 0);
  sbGroup.lookAt(0, screenTop * 0.6, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 6.25), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.z = 0.36;
  screen.name = 'scoreboard';
  sbGroup.add(screen);
  const sbFrame = new Batch();
  sbFrame.box(17.4, 7.6, 0.6, WOOD, new THREE.Matrix4());
  sbFrame.box(18, 0.6, 1, '#5e3b22', T(0, 3.9, 0));
  for (const sx of [-1, 1]) sbFrame.box(0.7, 9, 0.7, '#5e3b22', T(sx * 6, -7.5, -0.4));
  sbGroup.add(sbFrame.build('scoreboardFrame', { shadow: true }));
  root.add(sbGroup);
  const font = (w: number, px: number) => `${w} ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
  const drawScoreboard = (t: { home: string; away: string; score: string; minute: string }) => {
    const g = screenCanvas.getContext('2d')!;
    g.fillStyle = '#fdf4df';
    g.fillRect(0, 0, 512, 200);
    g.fillStyle = '#f6e7c4';
    g.fillRect(0, 150, 512, 50);
    g.fillStyle = opts.homeKit[0];
    g.beginPath();
    g.roundRect(14, 22, 150, 110, 18);
    g.fill();
    g.fillStyle = opts.awayKit[0];
    g.beginPath();
    g.roundRect(348, 22, 150, 110, 18);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = font(700, 44);
    g.fillText(t.home, 89, 79);
    g.fillText(t.away, 423, 79);
    g.fillStyle = '#5e3b22';
    g.font = font(700, 80);
    g.fillText(t.score, 256, 82);
    g.fillStyle = '#e5402f';
    g.font = font(600, 34);
    g.fillText(t.minute, 256, 176);
    screenTex.needsUpdate = true;
  };
  drawScoreboard({ home: opts.homeCode, away: opts.awayCode, score: '0 - 0', minute: "0'" });

  // ---- Beyond the walls ------------------------------------------------
  root.add(surroundings());
  const clouds = cloudLayer();
  root.add(clouds);

  let cheerHome = 0;
  let cheerAway = 0;
  return {
    root,
    cheer(side) {
      if (side === 'home') cheerHome = 1;
      else cheerAway = 1;
    },
    setScoreboard: drawScoreboard,
    update(dt, time) {
      crowdUniforms.uTime.value = time;
      cheerHome = Math.max(0, cheerHome - dt * 0.2);
      cheerAway = Math.max(0, cheerAway - dt * 0.2);
      crowdUniforms.uCheer.value.set(cheerHome, cheerAway);
      boardTex.offset.x = (time * 0.03) % 1;
      clouds.rotation.y = time * 0.004;
    },
  };
}

/** Grass, hills, trees and a ring of little houses around the ground. */
function surroundings(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'surroundings';
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(520, 48),
    new THREE.MeshStandardMaterial({ color: '#7cc04f', roughness: 1, flatShading: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  g.add(ground);

  const b = new Batch();
  // A sandy path ring around the stadium.
  const ring = new THREE.RingGeometry(98, 106, 48, 1);
  ring.rotateX(-Math.PI / 2);
  b.add(ring, '#e9d7a8', T(0, -0.02, 0));
  // Hills on the horizon.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hash01('ha' + i) * 0.3;
    const r = 330 + hash01('hr' + i) * 90;
    const s = 50 + hash01('hs' + i) * 60;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * r, -s * 0.15, Math.sin(a) * r),
      new THREE.Quaternion(),
      new THREE.Vector3(s * 1.6, s * 0.55, s)
    );
    b.add(new THREE.IcosahedronGeometry(1, 1), i % 2 ? '#6fb446' : '#8acb5a', m);
  }
  // Houses: cottages in campus wall/roof colours.
  const walls = ['#f3e6c8', '#efe0c0', '#f6d7c3', '#e8eef2', '#f2e2b3'];
  const roofs = ['#d9534f', '#c2522d', '#3a6fd8', '#5e8a3a', '#8a5a3b'];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + hash01('pa' + i) * 0.08;
    const r = 128 + hash01('pr' + i) * 60;
    const w = 7 + hash01('pw' + i) * 5;
    const d = 6 + hash01('pd' + i) * 3;
    const h = 4 + Math.floor(hash01('ph' + i) * 3) * 2.6;
    const at = T(Math.cos(a) * r, 0, Math.sin(a) * r, -a + Math.PI / 2);
    b.box(w, h, d, walls[i % walls.length]!, at.clone().multiply(T(0, h / 2, 0)));
    const roof = new THREE.Shape();
    roof.moveTo(-w / 2 - 0.4, 0);
    roof.lineTo(w / 2 + 0.4, 0);
    roof.lineTo(0, 3);
    roof.closePath();
    const rg = new THREE.ExtrudeGeometry(roof, { depth: d + 0.6, bevelEnabled: false });
    rg.translate(0, h, -(d + 0.6) / 2);
    b.add(rg, roofs[Math.floor(hash01('rc' + i) * roofs.length)]!, at);
    for (const sx of [-0.25, 0.25]) b.box(1.1, 1.1, 0.1, '#5b8fd6', at.clone().multiply(T(sx * w, h * 0.55, d / 2 + 0.02)));
  }
  // Trees: round and conifer, in clumps between the houses and the stadium.
  for (let i = 0; i < 120; i++) {
    const a = hash01('ta' + i) * Math.PI * 2;
    const r = 108 + hash01('tr' + i) * 110;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.8 + hash01('ts' + i) * 0.7;
    b.add(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 3 * s, 5), '#7a5134', T(x, 1.5 * s, z));
    if (hash01('tk' + i) < 0.5) {
      b.add(new THREE.IcosahedronGeometry(3 * s, 0), i % 3 ? '#4f9e3f' : '#5fb04a', T(x, 4.6 * s, z, i));
    } else {
      b.add(new THREE.ConeGeometry(2.6 * s, 6 * s, 6), '#3f8a3a', T(x, 6 * s, z));
    }
  }
  g.add(b.build('town'));
  return g;
}

/** Puffy low-poly clouds drifting overhead. */
function cloudLayer(): THREE.Mesh {
  const b = new Batch();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + hash01('ca' + i);
    const r = 180 + hash01('cr' + i) * 160;
    const y = 90 + hash01('cy' + i) * 50;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const n = 3 + Math.floor(hash01('cn' + i) * 3);
    for (let k = 0; k < n; k++) {
      const s = 10 + hash01(`cs${i}:${k}`) * 9;
      b.add(new THREE.IcosahedronGeometry(s, 0), '#ffffff', T(cx + (k - n / 2) * s * 1.1, y + hash01(`cz${i}:${k}`) * 5, cz + (hash01(`cw${i}:${k}`) - 0.5) * 12, k));
    }
  }
  const m = b.build('clouds');
  const mat = m.material as THREE.MeshStandardMaterial;
  mat.emissive = new THREE.Color('#dfe9f5');
  mat.emissiveIntensity = 0.55;
  mat.fog = false;
  return m;
}
