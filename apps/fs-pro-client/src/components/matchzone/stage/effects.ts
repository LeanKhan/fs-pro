/**
 * What the engine's extra detail looks like on the pitch: the ball (with a
 * trail that shows each pass), xG-coloured shot arcs, confetti on a goal,
 * a pulse on a save, cards popping over the offender, and - in the
 * tactical camera - each team's defensive and midfield lines.
 */
import * as THREE from 'three';
import { PITCH_LENGTH, type BallState, type Moment, type Side, type TimelineEvent } from '../playback';
import { ballTexture } from './textures';

export interface EffectsKit {
  root: THREE.Group;
  update(m: Moment, dt: number, time: number, camera: THREE.Camera): void;
  /** Fire the effect for an event the playback just crossed. */
  trigger(e: TimelineEvent, m: Moment, headOf: (id: string) => THREE.Vector3 | null): void;
  setTactical(on: boolean): void;
  setArcsVisible(on: boolean): void;
  ball: THREE.Mesh;
}

const BALL_R = 0.3; // oversized, like everything on campus
const TRAIL = 24;
/** Real seconds a trail point lives: a streak behind the ball, not a pass map. */
const TRAIL_LIFE = 0.42;

/** xG -> colour: speculative blue, decent gold, big-chance red. */
export function xgColor(xg: number): string {
  return xg >= 0.3 ? '#e5402f' : xg >= 0.1 ? '#f5b82e' : '#7cc7f5';
}

export function buildEffects(kits: { home: [string, string]; away: [string, string] }): EffectsKit {
  const root = new THREE.Group();
  root.name = 'effects';

  // ---- Ball and its shadow -------------------------------------------------
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(BALL_R, 2),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55, flatShading: true })
  );
  ball.castShadow = true;
  ball.name = 'ball';
  root.add(ball);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_R * 1.3, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#1d3a12', transparent: true, opacity: 0.35, depthWrite: false })
  );
  blob.position.y = 0.03;
  root.add(blob);

  // ---- Trail: a camera-facing ribbon through the ball's recent path ----
  const trailPts: { p: THREE.Vector3; t: number }[] = [];
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailAlpha = new Float32Array(TRAIL * 2);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlpha, 1));
  const idx: number[] = [];
  for (let i = 0; i < TRAIL - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  trailGeo.setIndex(idx);
  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#ffffff') } },
    vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ gl_FragColor = vec4(uColor, vA * 0.85);
      #include <colorspace_fragment>
      }`,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.name = 'ballTrail';
  root.add(trail);

  // ---- Shot arcs -------------------------------------------------------
  interface Arc { mesh: THREE.Mesh; life: number }
  const arcs: Arc[] = [];
  const arcGroup = new THREE.Group();
  arcGroup.name = 'shotArcs';
  root.add(arcGroup);
  const addArc = (from: THREE.Vector3, to: THREE.Vector3, peak: number, color: string) => {
    const mid = from.clone().lerp(to, 0.5);
    mid.y += peak;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.07, 6, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
    );
    mesh.name = 'shotArc';
    arcGroup.add(mesh);
    arcs.push({ mesh, life: 2.6 });
  };

  // ---- Confetti --------------------------------------------------------
  const CONF = 420;
  const confetti = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.32, 0.2),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    CONF
  );
  confetti.frustumCulled = false;
  confetti.name = 'confetti';
  confetti.count = 0;
  const conf = Array.from({ length: CONF }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 }));
  root.add(confetti);
  const burst = (at: THREE.Vector3, side: Side) => {
    const palette = [kits[side][0], kits[side][1], '#f5b82e', '#ffffff'].map((c) => new THREE.Color(c));
    conf.forEach((c, i) => {
      c.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5));
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      c.v.set(Math.cos(a) * sp, 7 + Math.random() * 9, Math.sin(a) * sp);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      c.life = 3.5 + Math.random() * 1.5;
      confetti.setColorAt(i, palette[i % palette.length]!);
    });
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
    confetti.count = CONF;
  };

  // ---- Save pulse ------------------------------------------------------
  const pulses: { mesh: THREE.Mesh; life: number }[] = [];
  const pulse = (at: THREE.Vector3, color: string) => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.position.copy(at).setY(0.06);
    root.add(mesh);
    pulses.push({ mesh, life: 1 });
  };

  // ---- Cards -----------------------------------------------------------
  const cards: { mesh: THREE.Mesh; life: number; id: string; head: (id: string) => THREE.Vector3 | null }[] = [];
  const card = (id: string, color: string, head: (id: string) => THREE.Vector3 | null) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.25, 0.08),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, flatShading: true })
    );
    mesh.name = 'card';
    root.add(mesh);
    cards.push({ mesh, life: 2.8, id, head });
  };

  // ---- Tactical lines --------------------------------------------------
  const tactical = new THREE.Group();
  tactical.name = 'tacticalLines';
  tactical.visible = false;
  root.add(tactical);
  // Subbuteo-style team discs under each player, readable from above.
  const discs = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1.5, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }),
    24
  );
  const discRims = new THREE.InstancedMesh(
    new THREE.RingGeometry(1.5, 1.85, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false }),
    24
  );
  for (const d of [discs, discRims]) {
    d.frustumCulled = false;
    d.renderOrder = 3;
    d.count = 0;
    tactical.add(d);
  }
  const lineMeshes = new Map<string, THREE.Mesh>();
  const lineOf = (key: string, color: string) => {
    let mesh = lineMeshes.get(key);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
      );
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      lineMeshes.set(key, mesh);
      tactical.add(mesh);
    }
    return mesh;
  };
  /** A flat ribbon on the grass through points sorted across the pitch. */
  const ribbon = (mesh: THREE.Mesh, pts: { x: number; z: number }[], w: number) => {
    const sorted = [...pts].sort((a, b) => a.z - b.z);
    const pos: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * w;
      const nz = (dx / len) * w;
      pos.push(a.x + nx, 0.05, a.z + nz, a.x - nx, 0.05, a.z - nz, b.x + nx, 0.05, b.z + nz);
      pos.push(a.x - nx, 0.05, a.z - nz, b.x - nx, 0.05, b.z - nz, b.x + nx, 0.05, b.z + nz);
    }
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  };

  const lastBall = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  const placeBall = (b: BallState) => {
    ball.position.set(b.x, b.y + BALL_R - 0.11, b.z);
    const moved = tmpV.subVectors(ball.position, lastBall);
    const dist = moved.length();
    if (dist > 0 && dist < 30) {
      // Roll: rotate around the axis perpendicular to travel.
      const axis = new THREE.Vector3(moved.z, 0, -moved.x).normalize();
      if (axis.lengthSq() > 0) ball.rotateOnWorldAxis(axis, dist / BALL_R);
    }
    lastBall.copy(ball.position);
    blob.position.set(b.x, 0.03, b.z);
    const h = Math.max(0, b.y - 0.11);
    blob.scale.setScalar(1 + h * 0.25);
    (blob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.35 - h * 0.05);
  };

  return {
    root,
    ball,
    setTactical(on) {
      tactical.visible = on;
    },
    setArcsVisible(on) {
      arcGroup.visible = on;
    },
    trigger(e, m, headOf) {
      const shooterSide: Side | null = e.kind === 'save' ? (e.side === 'home' ? 'away' : 'home') : e.side;
      if (e.kind === 'goal' || e.kind === 'penalty-goal' || e.kind === 'save' || e.kind === 'miss' || e.kind === 'block') {
        // The arc runs from the shooter to where the ball ends up.
        const shooterId = e.kind === 'save' ? e.otherId : e.playerId;
        const shooter = m.players.find((p) => p.id === shooterId);
        const from = shooter ? new THREE.Vector3(shooter.x, 0.3, shooter.z) : ball.position.clone();
        const to = ball.position.clone();
        const d = from.distanceTo(to);
        if (d > 2) addArc(from, to, Math.max(1.4, Math.min(5, d * 0.12)), xgColor(e.xg ?? 0.05));
      }
      if (e.kind === 'goal' || e.kind === 'penalty-goal') {
        // Party poppers over the scorer (the celebration camera's subject);
        // the net ripples at the goal itself.
        const scorer = m.players.find((p) => p.id === e.playerId);
        const dir = ball.position.x >= 0 ? 1 : -1;
        const at = scorer ? new THREE.Vector3(scorer.x, 2.5, scorer.z) : new THREE.Vector3((dir * PITCH_LENGTH) / 2, 1.5, ball.position.z);
        burst(at, shooterSide ?? 'home');
      }
      if (e.kind === 'save') pulse(ball.position.clone(), '#ffffff');
      if (e.kind === 'block') pulse(ball.position.clone(), '#f5b82e');
      if ((e.kind === 'yellow' || e.kind === 'red') && e.playerId) card(e.playerId, e.kind === 'yellow' ? '#f5c62e' : '#e5402f', headOf);
    },
    update(m, dt, time, camera) {
      placeBall(m.ball);

      // Trail: a short streak while the ball travels, fading with age.
      if (m.ball.flying && dt > 0) {
        trailPts.unshift({ p: ball.position.clone(), t: time });
        if (trailPts.length > TRAIL) trailPts.pop();
        const holder = m.players.find((p) => p.withBall);
        trailMat.uniforms.uColor.value.set(holder ? kits[holder.side][0] : '#ffffff').lerp(new THREE.Color('#ffffff'), 0.55);
      }
      while (trailPts.length && time - trailPts[trailPts.length - 1]!.t > TRAIL_LIFE) trailPts.pop();
      for (let i = 0; i < TRAIL; i++) {
        const pt = trailPts[Math.min(i, trailPts.length - 1)];
        const p = pt?.p ?? ball.position;
        const n = trailPts[Math.min(i + 1, trailPts.length - 1)]?.p ?? p;
        const age = pt ? Math.min(1, (time - pt.t) / TRAIL_LIFE) : 1;
        tangent.subVectors(p, n);
        if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
        toCam.subVectors(camera.position, p);
        side.crossVectors(tangent, toCam).normalize().multiplyScalar(BALL_R * 0.9 * (1 - age));
        trailPos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        const a = i < trailPts.length ? (1 - age) * (1 - age) : 0;
        trailAlpha[i * 2] = a;
        trailAlpha[i * 2 + 1] = a;
      }
      trailGeo.attributes.position.needsUpdate = true;
      (trailGeo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;

      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]!;
        a.life -= dt;
        (a.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, a.life);
        if (a.life <= 0) {
          arcGroup.remove(a.mesh);
          a.mesh.geometry.dispose();
          (a.mesh.material as THREE.Material).dispose();
          arcs.splice(i, 1);
        }
      }

      if (confetti.count) {
        let alive = 0;
        conf.forEach((c, i) => {
          c.life -= dt;
          if (c.life > 0) alive++;
          c.v.y -= 9.8 * dt * 0.55;
          c.v.multiplyScalar(1 - dt * 0.9);
          c.p.addScaledVector(c.v, dt);
          if (c.p.y < 0.05) {
            c.p.y = 0.05;
            c.v.set(0, 0, 0);
          }
          c.r.x += c.spin.x * dt;
          c.r.y += c.spin.y * dt;
          c.r.z += c.spin.z * dt;
          dummy.position.copy(c.p);
          dummy.rotation.copy(c.r);
          dummy.scale.setScalar(c.life > 0 ? Math.min(1, c.life) : 0);
          dummy.updateMatrix();
          confetti.setMatrixAt(i, dummy.matrix);
        });
        confetti.instanceMatrix.needsUpdate = true;
        if (!alive) confetti.count = 0;
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]!;
        p.life -= dt * 1.4;
        p.mesh.scale.setScalar(1 + (1 - p.life) * 5);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life);
        if (p.life <= 0) {
          root.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          pulses.splice(i, 1);
        }
      }

      for (let i = cards.length - 1; i >= 0; i--) {
        const c = cards[i]!;
        c.life -= dt;
        const h = c.head(c.id);
        if (h) c.mesh.position.set(h.x, h.y + 1.1 + Math.min(0.6, (2.8 - c.life) * 1.5), h.z);
        c.mesh.rotation.y = time * 3;
        c.mesh.scale.setScalar(Math.min(1, (2.8 - c.life) * 5) * Math.min(1, c.life * 2));
        if (c.life <= 0) {
          root.remove(c.mesh);
          c.mesh.geometry.dispose();
          (c.mesh.material as THREE.Material).dispose();
          cards.splice(i, 1);
        }
      }

      if (tactical.visible) {
        let n = 0;
        for (const p of m.players) {
          if (p.sentOff || n >= 24) continue;
          dummy.position.set(p.x, 0.06, p.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          discs.setMatrixAt(n, dummy.matrix);
          discRims.setMatrixAt(n, dummy.matrix);
          discs.setColorAt(n, tmpColor.set(kits[p.side][p.pos === 'GK' ? 1 : 0]));
          n++;
        }
        discs.count = discRims.count = n;
        discs.instanceMatrix.needsUpdate = discRims.instanceMatrix.needsUpdate = true;
        if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
        for (const s of ['home', 'away'] as const) {
          const color = kits[s][0];
          const team = m.players.filter((p) => p.side === s && !p.sentOff);
          const defs = team.filter((p) => p.pos === 'DEF');
          const mids = team.filter((p) => p.pos === 'MID');
          const atts = team.filter((p) => p.pos === 'ATT');
          ribbon(lineOf(`${s}:def`, color), defs, 0.22);
          ribbon(lineOf(`${s}:mid`, color), mids, 0.14);
          ribbon(lineOf(`${s}:att`, color), atts, 0.1);
        }
      }
    },
  };
}
