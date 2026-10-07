/**
 * The 22 players and the referee, drawn as the campus walkers in match kit:
 * chunky low-poly bodies, big heads, swinging limbs. Every body part is one
 * instanced mesh, so the whole squad costs a handful of draw calls.
 *
 * Bodies face +x in local space (heading 0), matching playback headings.
 */
import * as THREE from 'three';
import type { Moment, PlayerState, Side } from '../playback';
import { hairTone, numberAtlasTexture, skinTone } from './textures';

export interface Kits {
  home: [string, string];
  away: [string, string];
}

export interface PlayersKit {
  root: THREE.Group;
  update(m: Moment, dt: number, time: number): void;
  /** World position of a player's head (for HUD tags), or null. */
  headOf(id: string): THREE.Vector3 | null;
}

/** World scale on the campus walker: readable from the broadcast camera. */
const S = 1.6;
const MAX = 24;
const REF_ID = '__ref';

const GK_COLORS = ['#f2c230', '#5ee0d0', '#ff8a3d', '#c6e34a', '#b07cf0', '#ff6fa8'];

/** The goalkeeper colour furthest from both outfield kits. */
function keeperColor(avoid: string[]): string {
  const cs = avoid.map((c) => new THREE.Color(c));
  let best = GK_COLORS[0]!;
  let bestD = -1;
  for (const k of GK_COLORS) {
    const kc = new THREE.Color(k);
    const d = Math.min(...cs.map((c) => Math.abs(c.r - kc.r) + Math.abs(c.g - kc.g) + Math.abs(c.b - kc.b)));
    if (d > bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

interface Slot {
  heading: number;
  phase: number;
  x: number;
  z: number;
  /** Smoothed displayed speed, m/s real time. */
  v: number;
  jump: number;
  /** Seconds into a goal celebration (decays after it). */
  celebT: number;
}

const part = (geo: THREE.BufferGeometry, name: string, mat: THREE.Material) => {
  const m = new THREE.InstancedMesh(geo, mat, MAX);
  m.name = name;
  m.castShadow = true;
  m.frustumCulled = false;
  m.count = 0;
  return m;
};

const vcolor = (geo: THREE.BufferGeometry, fn: (y: number) => [number, number, number]) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.set(fn(pos.getY(i)), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

export function buildPlayers(kits: Kits): PlayersKit {
  const root = new THREE.Group();
  root.name = 'players';
  const flat = (vertexColors = false) => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, vertexColors });

  // Geometry, in walker units (1.6 tall before scale). Pivots: legs hang
  // from the hip (y 0.5), arms from the shoulder (y 1.12).
  const torsoGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8).translate(0, 0.9, 0);
  const collarGeo = new THREE.CylinderGeometry(0.13, 0.17, 0.08, 8).translate(0, 1.16, 0);
  // Shirt hem band in the kit's second colour.
  const hemGeo = new THREE.CylinderGeometry(0.255, 0.258, 0.07, 8).translate(0, 0.68, 0);
  const hipsGeo = new THREE.BoxGeometry(0.26, 0.24, 0.44).translate(0, 0.58, 0);
  // Leg: sock-coloured shin (tinted per kit) over a dark boot.
  const legGeo = vcolor(new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(0, -0.25, 0), (y) => (y < -0.42 ? [0.12, 0.12, 0.14] : [1, 1, 1]));
  const armGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11).translate(0, -0.2, 0);
  const sleeveGeo = new THREE.BoxGeometry(0.14, 0.16, 0.14).translate(0, -0.05, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.24, 1).translate(0, 1.38, 0);
  const hairGeo = new THREE.SphereGeometry(0.255, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(0.25).translate(-0.02, 1.4, 0);
  const numGeo = new THREE.PlaneGeometry(0.3, 0.3).rotateY(-Math.PI / 2).translate(-0.24, 0.94, 0);
  // A small chest number, for the close-ups.
  const chestGeo = new THREE.PlaneGeometry(0.15, 0.15).rotateY(Math.PI / 2).translate(0.225, 1.0, 0.07);

  const torso = part(torsoGeo, 'shirts', flat());
  const collar = part(collarGeo, 'collars', flat());
  const hem = part(hemGeo, 'hems', flat());
  const hips = part(hipsGeo, 'shorts', flat());
  const legsInst = new THREE.InstancedMesh(legGeo, flat(true), MAX * 2);
  legsInst.name = 'legs';
  legsInst.castShadow = true;
  legsInst.frustumCulled = false;
  const armsInst = new THREE.InstancedMesh(armGeo, flat(), MAX * 2);
  armsInst.name = 'arms';
  armsInst.castShadow = true;
  armsInst.frustumCulled = false;
  const sleevesInst = new THREE.InstancedMesh(sleeveGeo, flat(), MAX * 2);
  sleevesInst.name = 'sleeves';
  sleevesInst.frustumCulled = false;
  const head = part(headGeo, 'heads', flat());
  const hair = part(hairGeo, 'hair', flat());

  // Shirt numbers: one atlas, each instance picks its cell.
  const atlas = numberAtlasTexture();
  const numMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  numMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aNum;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         vMapUv = vec2(uv.x, 1.0 - uv.y) * 0.1 + vec2(mod(aNum, 10.0), floor(aNum / 10.0)) * 0.1;`
      );
  };
  const numbers = part(numGeo, 'numbers', numMat);
  numbers.castShadow = false;
  const aNum = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  numbers.geometry.setAttribute('aNum', aNum);
  const chest = part(chestGeo, 'chestNumbers', numMat);
  chest.castShadow = false;
  chest.geometry.setAttribute('aNum', aNum);

  // Ball-holder ring on the grass, in the holder's kit colour.
  // White rim with a kit-coloured pool inside: readable on any grass.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.32, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false })
  );
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false })
  );
  pool.position.y = -0.005;
  ring.add(pool);
  ring.position.y = 0.04;
  ring.renderOrder = 2;
  pool.renderOrder = 1;
  ring.name = 'holderRing';

  root.add(torso, collar, hem, chest, hips, legsInst, armsInst, sleevesInst, head, hair, numbers, ring);

  const gk = keeperColor([...kits.home, ...kits.away]);
  const gkAway = keeperColor([...kits.home, ...kits.away, gk]);
  const shirtOf = (p: { side: Side; pos: string }) =>
    p.pos === 'GK' ? (p.side === 'home' ? gk : gkAway) : kits[p.side][0];
  const shortsOf = (p: { side: Side; pos: string }) => (p.pos === 'GK' ? '#2b2b3a' : kits[p.side][1]);

  const slots = new Map<string, Slot>();
  let lastScorer: { id: string; side: Side; x: number; z: number } | null = null;
  const smoothstep = (t: number) => t * t * (3 - 2 * t);
  const heads = new Map<string, THREE.Vector3>();
  const c = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const base = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(S, S, S);
  const v3 = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const swingM = new THREE.Matrix4();
  const skins = new Map<string, THREE.Color>();
  const hairs = new Map<string, THREE.Color>();
  const skinOf = (id: string) => skins.get(id) ?? (skins.set(id, skinTone(id)), skins.get(id)!);
  const hairOf = (id: string) => hairs.get(id) ?? (hairs.set(id, hairTone(id)), hairs.get(id)!);

  const angleLerp = (a: number, b: number, k: number) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };

  return {
    root,
    headOf(id) {
      return heads.get(id) ?? null;
    },
    update(m, dt, time) {
      const list: (PlayerState & { ref?: boolean })[] = m.players.filter((p) => !p.sentOff);
      // The referee trails play from a diagonal, a few metres off the ball.
      list.push({
        id: REF_ID, ref: true, side: 'home', pos: 'REF', num: '0', withBall: false, heading: 0, speed: 0,
        sentOff: false, yellow: 0, red: 0, x: m.ball.x - 9, z: m.ball.z + (m.ball.z > 0 ? -10 : 10),
      });

      if (m.celebrating) {
        const sc = m.players.find((p) => p.id === m.celebrating!.scorerId);
        if (sc) lastScorer = { id: sc.id, side: sc.side, x: sc.x, z: sc.z };
      }

      let n = 0;
      for (const p of list) {
        if (n >= MAX) break;
        let s = slots.get(p.id);
        if (!s) {
          s = { heading: 0, phase: hash(p.id) * 6, x: p.x, z: p.z, v: 0, jump: 0, celebT: 0 };
          slots.set(p.id, s);
        }
        if (p.ref) {
          // Ease towards the target so the referee jogs instead of snapping.
          const k = 1 - Math.exp(-dt * 1.5);
          p.x = s.x + (p.x - s.x) * k;
          p.z = s.z + (p.z - s.z) * k;
        }
        // Goal: teammates run in and mob the scorer, then drift back.
        const celebrating = !!m.celebrating && !p.ref && p.side === m.celebrating.side;
        const isScorer = celebrating && m.celebrating?.scorerId === p.id;
        s.celebT = m.celebrating && !p.ref ? s.celebT + dt : Math.max(0, s.celebT - dt * 2);
        const mob = s.celebT > 0 && lastScorer && !p.ref && p.side === lastScorer.side && p.id !== lastScorer.id && p.pos !== 'GK' &&
          Math.hypot(p.x - lastScorer.x, p.z - lastScorer.z) < 40;
        if (mob) {
          const ang = hash(p.id + 'a') * Math.PI * 2;
          const r = 1.6 + hash(p.id + 'r') * 1.4;
          const k = smoothstep(Math.min(1, s.celebT / 1.4));
          p.x += (lastScorer!.x + Math.cos(ang) * r - p.x) * k;
          p.z += (lastScorer!.z + Math.sin(ang) * r - p.z) * k;
        }
        // Opponents near the scorer drift away, heads down.
        if (s.celebT > 0 && lastScorer && !p.ref && p.side !== lastScorer.side) {
          const dx = p.x - lastScorer.x;
          const dz = p.z - lastScorer.z;
          const d = Math.hypot(dx, dz);
          if (d < 6 && d > 1e-3) {
            const k = smoothstep(Math.min(1, s.celebT / 1.6)) * (6 - d) / d;
            p.x += dx * k;
            p.z += dz * k;
          }
        }
        const moved = Math.hypot(p.x - s.x, p.z - s.z);
        const inst = dt > 0 ? Math.min(14, moved / dt) : 0;
        s.v += (inst - s.v) * Math.min(1, dt * 8);
        // Face the direction of travel; when standing, face the ball (or
        // the scorer, in a celebration).
        const look = mob ? lastScorer! : { x: m.ball.x, z: m.ball.z };
        const want = moved > 0.02 ? Math.atan2(-(p.z - s.z), p.x - s.x) : Math.atan2(-(look.z - p.z), look.x - p.x);
        s.heading = angleLerp(s.heading, want, Math.min(1, dt * 7));
        s.x = p.x;
        s.z = p.z;
        s.phase += (s.v / (0.9 * S)) * Math.PI * dt;

        s.jump = celebrating ? Math.abs(Math.sin(time * 7 + hash(p.id) * 9)) * (isScorer ? 0.9 : 0.45) : Math.max(0, s.jump - dt * 3);

        const stride = Math.min(1, s.v / 4);
        const bob = Math.abs(Math.sin(s.phase)) * 0.06 * stride + s.jump;
        q.setFromAxisAngle(up, s.heading);
        base.compose(v3.set(p.x, bob, p.z), q, scale);

        const shirt = p.ref ? '#1d1f26' : shirtOf(p);
        const shorts = p.ref ? '#1d1f26' : shortsOf(p);
        const sock = p.ref ? '#1d1f26' : p.pos === 'GK' ? shirt : kits[p.side][0];
        torso.setMatrixAt(n, base);
        torso.setColorAt(n, c.set(shirt));
        collar.setMatrixAt(n, base);
        collar.setColorAt(n, c.set(p.ref ? '#f2c230' : shorts));
        hem.setMatrixAt(n, base);
        hem.setColorAt(n, c.set(p.ref ? '#1d1f26' : p.pos === 'GK' ? '#2b2b3a' : kits[p.side][1]));
        hips.setMatrixAt(n, base);
        hips.setColorAt(n, c.set(shorts));
        head.setMatrixAt(n, base);
        head.setColorAt(n, skinOf(p.id));
        hair.setMatrixAt(n, base);
        hair.setColorAt(n, hairOf(p.id));
        numbers.setMatrixAt(n, p.ref ? m4.makeScale(0, 0, 0) : base);
        chest.setMatrixAt(n, p.ref ? m4.makeScale(0, 0, 0) : base);
        aNum.setX(n, Math.min(99, Number(p.num) || 0));

        // Legs swing in the sagittal plane (around local z).
        const swing = Math.sin(s.phase) * 0.75 * stride;
        for (const [k, side] of [[0, -1], [1, 1]] as const) {
          tmp.makeRotationAxis(zAxis, side < 0 ? swing : -swing).setPosition(0, 0.5, side * 0.12);
          legsInst.setMatrixAt(n * 2 + k, m4.multiplyMatrices(base, tmp));
          legsInst.setColorAt(n * 2 + k, c.set(sock));
          // Arms counter-swing; up and waving in a celebration.
          const raise = celebrating ? Math.PI * 0.85 + Math.sin(time * 9 + k * 2) * 0.25 : 0;
          const armSwing = celebrating ? 0 : (side < 0 ? -swing : swing) * 0.8;
          tmp.makeRotationAxis(xAxis, -side * (0.12 + raise)).premultiply(swingM.makeRotationAxis(zAxis, armSwing));
          tmp.setPosition(0, 1.12, side * 0.3);
          const arm = m4.multiplyMatrices(base, tmp);
          armsInst.setMatrixAt(n * 2 + k, arm);
          armsInst.setColorAt(n * 2 + k, skinOf(p.id));
          sleevesInst.setMatrixAt(n * 2 + k, arm);
          sleevesInst.setColorAt(n * 2 + k, c.set(shirt));
        }

        if (p.withBall && !m.ball.flying) {
          ring.visible = true;
          ring.position.set(p.x, 0.04, p.z);
          (pool.material as THREE.MeshBasicMaterial).color.set(kits[p.side][0]);
        }
        let h = heads.get(p.id);
        if (!h) heads.set(p.id, (h = new THREE.Vector3()));
        h.set(p.x, bob + 1.75 * S, p.z);
        n++;
      }
      if (!list.some((p) => p.withBall) || m.ball.flying) ring.visible = false;
      ring.scale.setScalar(1 + Math.sin(time * 5) * 0.06);

      for (const mesh of [torso, collar, hem, chest, hips, head, hair, numbers]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      for (const mesh of [legsInst, armsInst, sleevesInst]) {
        mesh.count = n * 2;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      aNum.needsUpdate = true;
    },
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
