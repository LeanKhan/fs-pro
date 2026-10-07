/**
 * The Matchzone's three.js stage: renderer, campus-style lighting, the
 * stadium, players and effects, the camera director, and the loop that
 * drives a Playback and reports what happened to the HUD.
 */
import * as THREE from 'three';
import { PITCH_LENGTH, PITCH_WIDTH, type Moment, type Playback, type TimelineEvent } from '../playback';
import { buildEffects, type EffectsKit } from './effects';
import { buildPitch, type PitchKit } from './pitch';
import { buildPlayers, type PlayersKit } from './players';
import { buildStadium, type StadiumKit } from './stadium';

export type CameraMode = 'broadcast' | 'tactical' | 'follow' | 'intro';

export interface StageClub {
  code: string;
  name: string;
  kit: [string, string];
}

export interface StageOptions {
  home: StageClub;
  away: StageClub;
  playback: Playback;
  /** Fewer fans, lower pixel ratio and smaller shadows. */
  lowPower?: boolean;
}

export interface StageDiagnostics {
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  fps: number;
  camera: CameraMode;
}

/** A sky gradient for scene.background, like the campus's. */
function skyGradient(top: string, horizon: string) {
  const cv = document.createElement('canvas');
  cv.width = 2;
  cv.height = 256;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.7, horizon);
  g.addColorStop(1, horizon);
  x.fillStyle = g;
  x.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MatchStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly playback: Playback;
  /** Called with the events crossed each frame (HUD banners, ticker). */
  onEvents: (events: TimelineEvent[], m: Moment) => void = () => {};
  /** Called ~12 times a second with the current moment (HUD clock, score). */
  onMoment: (m: Moment) => void = () => {};

  private pitch: PitchKit;
  private stadium: StadiumKit;
  private players: PlayersKit;
  private effects: EffectsKit;
  private mode: CameraMode = 'intro';
  /** Goal celebrations take over the camera until this time. */
  private cinematicUntil = 0;
  private cinematicTarget: string | null = null;
  /** Camera angle off the goal line for the celebration (clear of opponents). */
  private cinematicTheta = 0.45;
  private camPos = new THREE.Vector3(0, 60, -110);
  private camLook = new THREE.Vector3();
  private shake = 0;
  private time = 0;
  private raf = 0;
  private last = 0;
  private hudTimer = 0;
  private frozen = false;
  private fps = 60;
  private moment: Moment;
  private resizeObs: ResizeObserver;
  private lastScoreboard = '';

  constructor(private container: HTMLElement, private opts: StageOptions) {
    this.playback = opts.playback;
    const low = !!opts.lowPower;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 1400);

    // Campus lighting: sky/grass hemisphere and a warm afternoon sun.
    this.scene.background = skyGradient('#7cc0ee', '#d8eef8');
    this.scene.fog = new THREE.Fog('#d8eef8', 260, 620);
    this.scene.add(new THREE.HemisphereLight('#e4f2ff', '#5d7d3c', 1.5));
    const sun = new THREE.DirectionalLight('#fff0d6', 2.7);
    sun.position.set(-60, 110, -45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -95;
    sc.right = 95;
    sc.top = 80;
    sc.bottom = -80;
    sc.near = 10;
    sc.far = 320;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);

    const kits = { home: opts.home.kit, away: opts.away.kit };
    this.pitch = buildPitch();
    this.stadium = buildStadium({
      homeCode: opts.home.code,
      awayCode: opts.away.code,
      homeKit: opts.home.kit,
      awayKit: opts.away.kit,
      crowdDensity: low ? 0.55 : 1,
      lowPower: low,
    });
    this.players = buildPlayers(kits);
    this.effects = buildEffects(kits);
    this.scene.add(this.pitch.root, this.stadium.root, this.players.root, this.effects.root);

    this.moment = this.playback.moment();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.snapCamera();
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
      this.step(this.frozen ? 0 : dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Freezes time (playback and animation) - for deterministic captures. */
  setFrozen(frozen: boolean) {
    this.frozen = frozen;
  }

  setCamera(mode: CameraMode) {
    this.mode = mode;
    this.effects.setTactical(mode === 'tactical');
  }

  get cameraMode(): CameraMode {
    return this.mode;
  }

  /** Jump the camera to its target (after a seek or state change). */
  snapCamera() {
    const t = this.cameraTarget(this.moment);
    this.camPos.copy(t.pos);
    this.camLook.copy(t.look);
    this.camera.fov = t.fov;
    this.camera.updateProjectionMatrix();
    this.camera.up.copy(t.up ?? new THREE.Vector3(0, 1, 0));
    this.applyCamera();
  }

  /**
   * Re-render at the playback's current position without advancing it.
   * `effects` replays the events at that instant (for test states).
   */
  refresh(events: TimelineEvent[] = [], warmSeconds = 0) {
    const wasPlaying = this.playback.playing;
    this.playback.playing = false;
    this.step(0);
    if (events.length) this.fire(events, this.moment);
    // Let effects (confetti, cheering) develop without moving the match.
    for (let s = 0; s < warmSeconds; s += 1 / 30) this.step(1 / 30);
    this.step(0);
    this.playback.playing = wasPlaying;
    this.snapCamera();
    this.render();
  }

  /** Screen position (CSS px within the container) of a player's head. */
  project(id: string): { x: number; y: number } | null {
    const h = this.players.headOf(id);
    if (!h) return null;
    const v = h.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.container.clientWidth, y: ((1 - v.y) / 2) * this.container.clientHeight };
  }

  diagnostics(): StageDiagnostics {
    const info = this.renderer.info;
    return {
      renderer: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures },
      fps: Math.round(this.fps),
      camera: this.mode,
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------------
  private step(dt: number) {
    this.time += dt;
    const events = this.playback.advance(dt);
    this.moment = this.playback.moment();
    if (events.length) this.fire(events, this.moment);

    this.players.update(this.moment, dt, this.time);
    // Shot arcs explain play from the wide cameras; in a close-up they're clutter.
    this.effects.setArcsVisible(!(this.time < this.cinematicUntil && this.cinematicTarget));
    this.effects.update(this.moment, dt, this.time, this.camera);
    this.pitch.update(dt, this.time);
    this.stadium.update(dt, this.time);

    const m = this.moment;
    const sb = `${m.score[0]}-${m.score[1]}-${m.minute}`;
    if (sb !== this.lastScoreboard) {
      this.lastScoreboard = sb;
      this.stadium.setScoreboard({
        home: this.opts.home.code,
        away: this.opts.away.code,
        score: `${m.score[0]} - ${m.score[1]}`,
        minute: this.playback.finished ? 'FULL TIME' : `${m.minute}'`,
      });
    }

    this.updateCamera(dt);
    this.render();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0 || dt === 0) {
      this.hudTimer = 1 / 12;
      this.onMoment(m);
    }
  }

  private fire(events: TimelineEvent[], m: Moment) {
    for (const e of events) {
      this.effects.trigger(e, m, (id) => this.players.headOf(id));
      if (e.kind === 'goal' || e.kind === 'penalty-goal') {
        const side = e.side ?? 'home';
        this.stadium.cheer(side);
        this.pitch.rippleGoal(this.effects.ball.position.x >= 0 ? 1 : -1);
        this.shake = 1;
        if (this.mode !== 'tactical') {
          this.cinematicUntil = this.time + 4.2;
          this.cinematicTarget = e.playerId ?? null;
          this.cinematicTheta = this.clearAngle(m, e.playerId);
        }
      } else if (e.kind === 'save' || e.kind === 'miss') {
        this.shake = Math.max(this.shake, 0.25);
      }
    }
    this.onEvents(events, m);
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private get portrait() {
    return this.camera.aspect < 0.9;
  }

  private cameraTarget(m: Moment): { pos: THREE.Vector3; look: THREE.Vector3; fov: number; up?: THREE.Vector3 } {
    const ball = m.ball;
    const portrait = this.portrait;
    if (this.time < this.cinematicUntil && this.cinematicTarget) {
      const p = m.players.find((pl) => pl.id === this.cinematicTarget);
      if (p) {
        // From the pitch side of the scorer, looking back at them with the
        // end they scored in (and its fans) behind - drifting slowly.
        const frame = this.playback.frames[Math.floor(m.t)]!;
        const dir = this.playback.attackDir(p.side, frame);
        const r = portrait ? 19 : 17;
        // Angle off the goal line (positive: the broadcast, -z, side).
        const th = this.cinematicTheta + Math.sin(this.time * 0.5) * 0.18;
        const pos = new THREE.Vector3(p.x - dir * r * Math.cos(th), 7.5, p.z - r * Math.sin(th));
        return { pos, look: new THREE.Vector3(p.x + dir * 2, portrait ? 3.4 : 2.6, p.z), fov: portrait ? 56 : 38 };
      }
    }
    switch (this.mode) {
      case 'intro': {
        const a = -Math.PI / 2 + Math.sin(this.time * 0.08) * 0.6;
        const r = portrait ? 150 : 120;
        return { pos: new THREE.Vector3(Math.cos(a) * r, portrait ? 85 : 58, Math.sin(a) * r), look: new THREE.Vector3(0, 0, 4), fov: portrait ? 50 : 36 };
      }
      case 'tactical':
        if (portrait) {
          // Top-down with the pitch's length up the screen, fitted to it.
          const half = Math.tan(THREE.MathUtils.degToRad(21));
          const h = Math.max((PITCH_LENGTH / 2 + 6) / half, (PITCH_WIDTH / 2 + 5) / (half * this.camera.aspect));
          return { pos: new THREE.Vector3(0, h, 0.1), look: new THREE.Vector3(0, 0, 0), fov: 42, up: new THREE.Vector3(1, 0, 0) };
        }
        return { pos: new THREE.Vector3(0, 98, -52), look: new THREE.Vector3(0, 0, 3), fov: 44 };
      case 'follow': {
        const holder = m.players.find((p) => p.withBall);
        const dir = holder ? this.playback.attackDir(holder.side, this.playback.frames[Math.floor(m.t)]!) : 1;
        const fx = holder?.x ?? ball.x;
        const fz = holder?.z ?? ball.z;
        return {
          pos: new THREE.Vector3(fx - dir * (portrait ? 26 : 20), portrait ? 16 : 10, fz - 6),
          look: new THREE.Vector3(fx + dir * 14, 1, fz),
          fov: portrait ? 62 : 46,
        };
      }
      default: {
        // TV gantry: a camera high on the halfway line that pans and
        // tracks along with play rather than flying beside it.
        const tx = THREE.MathUtils.clamp(ball.x, -PITCH_LENGTH / 2 + 14, PITCH_LENGTH / 2 - 14);
        const tz = ball.z * 0.35;
        if (portrait) return { pos: new THREE.Vector3(tx * 0.6, 36, -PITCH_WIDTH / 2 - 20), look: new THREE.Vector3(tx, 0, tz + 5), fov: 52 };
        return { pos: new THREE.Vector3(tx * 0.35, 29, -PITCH_WIDTH / 2 - 34), look: new THREE.Vector3(tx, 0, tz + 2), fov: 31 };
      }
    }
  }

  /** The celebration angle with the fewest opponents between camera and scorer. */
  private clearAngle(m: Moment, scorerId?: string): number {
    const p = m.players.find((pl) => pl.id === scorerId);
    if (!p) return 0.45;
    const dir = this.playback.attackDir(p.side, this.playback.frames[Math.floor(m.t)]!);
    const r = this.portrait ? 19 : 17;
    let best = 0.45;
    let bestScore = Infinity;
    for (const th of [0.45, 0.8, 0.15, 1.1, -0.45, -0.8]) {
      const cx = p.x - dir * r * Math.cos(th);
      const cz = p.z - r * Math.sin(th);
      let blocked = 0;
      for (const o of m.players) {
        if (o.side === p.side || o.sentOff) continue;
        // Distance from the camera->scorer segment, ignoring the scorer's end.
        const vx = p.x - cx, vz = p.z - cz;
        const t = ((o.x - cx) * vx + (o.z - cz) * vz) / (vx * vx + vz * vz);
        if (t < 0.05 || t > 0.99) continue;
        const d = Math.hypot(o.x - (cx + vx * t), o.z - (cz + vz * t));
        if (d < 2.2) blocked++;
      }
      // Prefer the broadcast side when it's equally clear.
      const score = blocked * 10 + (th < 0 ? 1 : 0) + Math.abs(th - 0.45) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = th;
      }
    }
    return best;
  }

  private updateCamera(dt: number) {
    const target = this.cameraTarget(this.moment);
    const k = dt === 0 ? 0 : 1 - Math.exp(-dt * (this.mode === 'follow' ? 3 : 2.2));
    this.camPos.lerp(target.pos, k);
    this.camLook.lerp(target.look, k);
    if (Math.abs(this.camera.fov - target.fov) > 0.01) {
      this.camera.fov += (target.fov - this.camera.fov) * (dt === 0 ? 1 : k);
      this.camera.updateProjectionMatrix();
    }
    this.camera.up.copy(target.up ?? new THREE.Vector3(0, 1, 0));
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.applyCamera();
  }

  private applyCamera() {
    const s = this.shake * this.shake * 0.6;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * s,
      this.camPos.y + (Math.random() - 0.5) * s,
      this.camPos.z + (Math.random() - 0.5) * s
    );
    this.camera.lookAt(this.camLook);
  }
}
