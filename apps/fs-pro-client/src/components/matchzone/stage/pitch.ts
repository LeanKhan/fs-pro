/**
 * The playing area: turf (striped, marked, worn), goals with nets that
 * ripple when a goal goes in, corner flags, and the surround it sits in.
 */
import * as THREE from 'three';
import { PITCH_LENGTH, PITCH_WIDTH } from '../playback';
import { TURF_LENGTH, TURF_WIDTH, grassDetailTexture, netTexture, pitchTexture } from './textures';

const GOAL_W = 7.32;
const GOAL_H = 2.44;
const GOAL_D = 2.2;
const POST_R = 0.09;

export interface Goal {
  group: THREE.Group;
  /** Back panel of the net - its vertices bulge when a goal goes in. */
  back: THREE.Mesh;
  rest: Float32Array;
  ripple: number;
  /** +1 east goal, -1 west: the net bulges away from the pitch. */
  end: 1 | -1;
}

export interface PitchKit {
  root: THREE.Group;
  goals: [Goal, Goal];
  flags: THREE.Mesh[];
  update(dt: number, time: number): void;
  rippleGoal(end: 1 | -1): void;
}

export function buildPitch(): PitchKit {
  const root = new THREE.Group();
  root.name = 'pitch';

  // Surround: the concourse floor around the turf.
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 170),
    new THREE.MeshStandardMaterial({ color: '#5ea83f', roughness: 1 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.03;
  surround.receiveShadow = true;
  root.add(surround);

  // Turf.
  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(TURF_LENGTH, TURF_WIDTH),
    new THREE.MeshStandardMaterial({
      map: pitchTexture(),
      bumpMap: grassDetailTexture(),
      bumpScale: 0.5,
      roughness: 0.95,
      metalness: 0,
    })
  );
  turf.name = 'turf';
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  root.add(turf);

  const frameMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, flatShading: true });
  const stanchionMat = new THREE.MeshStandardMaterial({ color: '#dcdcdc', roughness: 0.6, flatShading: true });
  const net = netTexture();
  const netMat = (rx: number, ry: number) => {
    const t = net.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({
      map: t,
      alphaTest: 0.35,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.8,
    });
  };

  const buildGoal = (end: 1 | -1): Goal => {
    const g = new THREE.Group();
    g.name = end > 0 ? 'goalEast' : 'goalWest';
    g.position.x = (end * PITCH_LENGTH) / 2;
    // Posts and crossbar (in front of the line, facing the pitch).
    const post = new THREE.CylinderGeometry(POST_R, POST_R, GOAL_H, 8);
    for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
      const m = new THREE.Mesh(post, frameMat);
      m.position.set(0, GOAL_H / 2, z);
      m.castShadow = true;
      g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GOAL_W + POST_R * 2, 8), frameMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, GOAL_H, 0);
    bar.castShadow = true;
    g.add(bar);
    // Stanchions: the frame that holds the net out behind the goal.
    const st = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
    const addRod = (a: THREE.Vector3, b: THREE.Vector3) => {
      const m = new THREE.Mesh(st, stanchionMat);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      m.position.copy(mid);
      m.scale.y = a.distanceTo(b);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
    };
    for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
      addRod(new THREE.Vector3(0, GOAL_H, z), new THREE.Vector3(end * GOAL_D * 0.6, GOAL_H * 0.85, z));
      addRod(new THREE.Vector3(end * GOAL_D * 0.6, GOAL_H * 0.85, z), new THREE.Vector3(end * GOAL_D, 0, z));
    }
    addRod(new THREE.Vector3(end * GOAL_D, 0.02, -GOAL_W / 2), new THREE.Vector3(end * GOAL_D, 0.02, GOAL_W / 2));

    // Net: back (subdivided for the ripple), roof and sides.
    const backGeo = new THREE.PlaneGeometry(GOAL_W, GOAL_H * 0.86, 20, 8);
    const back = new THREE.Mesh(backGeo, netMat(GOAL_W / 0.45, (GOAL_H * 0.86) / 0.45));
    back.rotation.y = Math.PI / 2;
    back.position.set(end * GOAL_D * 0.98, (GOAL_H * 0.86) / 2, 0);
    g.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_D * 0.62), netMat(GOAL_W / 0.45, (GOAL_D * 0.62) / 0.45));
    roof.rotation.x = -Math.PI / 2;
    roof.rotation.z = Math.PI / 2;
    roof.position.set(end * GOAL_D * 0.3, GOAL_H - 0.05, 0);
    roof.rotation.y = end * -0.12;
    g.add(roof);
    for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0, GOAL_H);
      shape.lineTo(GOAL_D * 0.6, GOAL_H * 0.85);
      shape.lineTo(GOAL_D, 0);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.45, uv.getY(i) / 0.45);
      const side = new THREE.Mesh(geo, netMat(1, 1));
      side.scale.x = end;
      side.position.z = z;
      g.add(side);
    }
    return { group: g, back, rest: Float32Array.from(backGeo.attributes.position.array as Float32Array), ripple: 0, end };
  };

  const goals: [Goal, Goal] = [buildGoal(1), buildGoal(-1)];
  goals.forEach((g) => root.add(g.group));

  // Corner flags.
  const flagPole = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6);
  const flagCloth = new THREE.PlaneGeometry(0.6, 0.42, 6, 1);
  flagCloth.translate(0.3, 0, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#dcdcdc', roughness: 0.6, flatShading: true });
  const clothMat = new THREE.MeshStandardMaterial({ color: '#f2b632', roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
  const flags: THREE.Mesh[] = [];
  for (const x of [-PITCH_LENGTH / 2, PITCH_LENGTH / 2]) {
    for (const z of [-PITCH_WIDTH / 2, PITCH_WIDTH / 2]) {
      const pole = new THREE.Mesh(flagPole, poleMat);
      pole.position.set(x, 0.8, z);
      pole.castShadow = true;
      root.add(pole);
      const cloth = new THREE.Mesh(flagCloth.clone(), clothMat);
      cloth.position.set(x, 1.38, z);
      root.add(cloth);
      flags.push(cloth);
    }
  }
  const flagRest = Float32Array.from(flagCloth.attributes.position.array as Float32Array);

  return {
    root,
    goals,
    flags,
    rippleGoal(end) {
      goals[end > 0 ? 0 : 1].ripple = 1;
    },
    update(dt, time) {
      for (const g of goals) {
        if (g.ripple <= 0) continue;
        g.ripple = Math.max(0, g.ripple - dt * 0.9);
        const pos = g.back.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = g.rest[i * 3];
          const y = g.rest[i * 3 + 1];
          const r = Math.hypot(x / 3.6, y / 1.1);
          const bulge = g.ripple * Math.max(0, 1 - r) * 0.9 * Math.cos(r * 7 - time * 14) * 0.6 + g.ripple * Math.max(0, 1 - r) * 0.5;
          pos.setZ(i, bulge * g.end);
        }
        pos.needsUpdate = true;
      }
      // Flags wave.
      for (const f of flags) {
        const pos = f.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = flagRest[i * 3];
          pos.setZ(i, Math.sin(time * 4 + x * 9) * 0.07 * (x / 0.6));
        }
        pos.needsUpdate = true;
      }
    },
  };
}
