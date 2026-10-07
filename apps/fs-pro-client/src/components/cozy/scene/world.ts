import * as THREE from 'three';
import {
  CAMPUS_BUILDING_KEYS, footprint,
  type CampusBuilding, type CampusPlacement, type Placed,
} from '@repo/api-contract';
import { stageOf } from '../stages';
import { dressCampus } from './campus-dressing';
import { mergeByMaterial } from './merge';
import { CELL, billboard, buildingModel, bus, car, mat, newsstand, plaza } from './models';
import { buildTerrain, CITY_PLACES, mulberry32, RING, terrainH, type CityVariant, type Terrain } from './terrain';

export type Pick = { kind: 'building' | 'player' | 'place'; id: string } | null;

export interface CampusView {
  /** Facility Tiers by asset type, and whether each is upgrading. */
  tiers: Record<string, { tier: number; upgrading: boolean }>;
  placement: CampusPlacement;
  players: { id: string; name: string; injured: boolean }[];
  fans: number;
  matchDay: boolean;
  /** Drives the Office's stage (stages.ts). */
  clubLevel: number;
  colors: [string, string];
}

/** World-space centre of a building's footprint. */
export function footprintCenter(key: CampusBuilding, p: Placed) {
  const [w, d] = footprint(key, p.rot);
  return { x: (p.x + w / 2) * CELL, z: (p.z + d / 2) * CELL };
}

const SKINS = ['#f6d3b3', '#e8b48f', '#c98e64', '#a06a43', '#6e4428', '#4a2e1c'];
const HAIRS = ['#2b1d14', '#5a3a22', '#9b6a3c', '#e2c06b', '#c2522d', '#1a1a1a', '#dcdcdc'];
const CAR_COLORS = ['#e0483e', '#3a6fd8', '#f2b632', '#f5f1e6', '#3aa655', '#2b2b3a', '#8e4fd1'];
const seedOf = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const fanCount = (fans: number) => 2 * (fans < 500 ? 3 : fans < 5000 ? 6 : fans < 25000 ? 10 : 15);

/** A vertical sky gradient, drawn behind the scene. */
function skyGradient(top: string, horizon: string) {
  const cv = document.createElement('canvas');
  cv.width = 2;
  cv.height = 256;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.75, horizon);
  g.addColorStop(1, horizon);
  x.fillStyle = g;
  x.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Removes an object and frees its geometry (materials are shared and cached). */
function disposeTree(obj: THREE.Object3D) {
  obj.removeFromParent();
  obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}

interface Walker {
  obj: THREE.Group;
  legs: THREE.Object3D[];
  target: THREE.Vector3;
  wait: number;
  speed: number;
  phase: number;
  id: string;
  /** Injured players wait around the Medical Centre instead of the pitch. */
  injured?: boolean;
}

interface Puff { mesh: THREE.Mesh; life: number; vx: number; vz: number }
interface Car { obj: THREE.Group; path: THREE.Vector3[]; t: number; speed: number }

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector3(3, 0, 0);
  private dist = 62;
  private places = new Map<string, THREE.Group>();
  private board: ReturnType<typeof billboard>;
  private boardLines: string[] = [];
  private boardIndex = -1;
  private boardTimer = 0;
  private terrain: Terrain;
  private buildingObjs = new Map<string, { obj: THREE.Group; key: string }>();
  private walkers = new Map<string, Walker>();
  private fans: Walker[] = [];
  private cars: Car[] = [];
  private view: CampusView | null = null;
  /** Lawn trees, flower beds and benches, rebuilt when the layout changes. */
  private dressing: THREE.Group | null = null;
  private dressingKey = '';
  private puffs: Puff[] = [];
  private puffTimer = 0;
  /** Coin / confetti pieces from burst(): ballistic, spinning, then gone. */
  private sparks: { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number; ttl: number }[] = [];
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private plate: THREE.Mesh;
  private selectPlate: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private selectedId: string | null = null;
  /** Freezes simulation (people, traffic, smoke) while rendering continues. */
  paused = false;
  /** Renderer counts from the last frame, for diagnostics. */
  stats = { calls: 0, triangles: 0, geometries: 0, textures: 0 };
  onTap: (pick: Pick, ground: THREE.Vector3 | null) => void = () => {};
  onHover: (ground: THREE.Vector3 | null) => void = () => {};

  constructor(private container: HTMLElement, private variant: CityVariant) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 400);

    this.scene.add(new THREE.HemisphereLight('#e4f2ff', '#5d7d3c', 1.6));
    const sun = new THREE.DirectionalLight('#fff0d6', 2.6);
    sun.position.set(-30, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 180;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);

    this.terrain = buildTerrain(variant);
    const { sky, fog } = this.terrain.biome;
    this.scene.background = skyGradient(sky[0], sky[1]);
    this.scene.fog = new THREE.Fog(sky[1], fog[0], fog[1]);
    this.scene.add(this.terrain.group, mergeByMaterial(plaza()));

    // World places in the city (see CITY_PLACES).
    this.board = billboard();
    for (const [id, obj] of [['newsstand', mergeByMaterial(newsstand())], ['billboard', this.board.group]] as const) {
      const at = CITY_PLACES[id];
      obj.position.set(at.x, terrainH(at.x, at.z, variant), at.z);
      obj.userData.pick = { kind: 'place', id };
      this.scene.add(obj);
      this.places.set(id, obj);
    }
    this.setBillboard([]);

    const plateMat = new THREE.MeshBasicMaterial({ color: '#5ee06a', transparent: true, opacity: 0.45, depthWrite: false });
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat);
    this.plate.rotation.x = -Math.PI / 2;
    this.plate.visible = false;
    this.scene.add(this.plate);
    this.selectPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.selectPlate.rotation.x = -Math.PI / 2;
    this.selectPlate.visible = false;
    this.scene.add(this.selectPlate);

    this.spawnCars();
    this.bindControls();
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.coinGeo.dispose();
    this.coinMat.dispose();
    this.confettiGeo.dispose();
    for (const m of this.confettiMats.values()) m.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // --- Camera ------------------------------------------------------------------------
  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Pull back on narrow screens so the village still fits.
    this.camera.fov = w < h ? 48 : 32;
    this.camera.updateProjectionMatrix();
  };

  private updateCamera() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -30, 32);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -24, 26);
    this.dist = THREE.MathUtils.clamp(this.dist, 28, 110);
    const pitch = THREE.MathUtils.degToRad(46);
    this.camera.position.set(
      this.target.x,
      this.target.y + Math.sin(pitch) * this.dist,
      this.target.z + Math.cos(pitch) * this.dist,
    );
    this.camera.lookAt(this.target);
  }

  private bindControls() {
    const el = this.renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinchDist = 0;

    el.addEventListener('pointerdown', (e) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointer */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this.onHover(this.groundAt(e.clientX, e.clientY));
        return;
      }
      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist) this.dist *= pinchDist / d;
        pinchDist = d;
        return;
      }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) moved = true;
      if (moved) {
        const k = (this.dist * 0.0021 * 32) / this.camera.fov;
        this.target.x -= dx * k;
        this.target.z -= dy * k * 1.25;
      }
      if (e.pointerType === 'mouse') this.onHover(this.groundAt(e.clientX, e.clientY));
    });
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0 && downAt && !moved) {
        this.onTap(this.pickAt(e.clientX, e.clientY), this.groundAt(e.clientX, e.clientY));
      }
      if (pointers.size === 0) downAt = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist *= e.deltaY > 0 ? 1.1 : 0.9;
    }, { passive: false });
  }

  private ndc(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  groundAt(x: number, y: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  pickAt(x: number, y: number): Pick {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const objs = [
      ...[...this.walkers.values()].map((w) => w.obj),
      ...[...this.buildingObjs.values()].map((b) => b.obj),
      ...this.places.values(),
    ];
    for (const hit of this.raycaster.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick as Pick;
    }
    return null;
  }

  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, visible: p.z < 1 };
  }

  focus(x: number, z: number) {
    this.target.set(x, 0, z);
  }

  zoom(dist: number) {
    this.dist = dist;
  }

  // --- Sync with fs-pro data ----------------------------------------------------------------
  sync(view: CampusView) {
    this.view = view;
    for (const key of CAMPUS_BUILDING_KEYS) {
      const p = view.placement[key];
      const t = view.tiers[key] ?? { tier: 1, upgrading: false };
      const ctx = this.stageContext(key);
      const sig = `${stageOf(key, ctx)}|${ctx.standsTier}|${t.upgrading}|${p.x},${p.z},${p.rot}|${view.colors.join()}`;
      const cur = this.buildingObjs.get(key);
      if (cur?.key === sig) continue;
      if (cur) disposeTree(cur.obj);
      const obj = buildingModel(key, ctx, t.upgrading, view.colors, this.terrain.biome.campus);
      const c = footprintCenter(key, p);
      obj.position.set(c.x, 0, c.z);
      obj.rotation.y = -p.rot * (Math.PI / 2);
      obj.userData.pick = { kind: 'building', id: key };
      // A little pop when something changes.
      if (cur) obj.userData.pop = 0.35;
      this.scene.add(obj);
      this.buildingObjs.set(key, { obj, key: sig });
    }
    const layout = JSON.stringify(view.placement);
    if (layout !== this.dressingKey) {
      this.dressing?.removeFromParent();
      this.dressing?.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
      this.dressing = dressCampus(this.variant, view.placement);
      this.dressingKey = layout;
      this.scene.add(this.dressing);
    }
    this.syncPeople(view);
    this.select(this.selectedId);
  }

  /** What a building's stage depends on (stages.ts), from the current view. */
  private stageContext(key: CampusBuilding) {
    const tier = (k: string) => this.view?.tiers[k]?.tier ?? 0;
    return { tier: tier(key), clubLevel: this.view?.clubLevel ?? 0, staffTier: tier('staff_house'), standsTier: tier('stands') };
  }

  /** World position above a building, for HTML bubbles. */
  anchor(id: string): THREE.Vector3 | null {
    const obj = this.buildingObjs.get(id)?.obj ?? this.places.get(id);
    if (!obj) return null;
    const box = new THREE.Box3().setFromObject(obj);
    return new THREE.Vector3(obj.position.x, box.max.y + 1.2, obj.position.z);
  }

  /** Headlines for the billboard; it shows one at a time and rotates. */
  setBillboard(lines: string[]) {
    this.boardLines = lines;
    this.boardIndex = -1;
    this.boardTimer = 0;
  }

  private drawBoard() {
    const { canvas, texture } = this.board;
    const x = canvas.getContext('2d')!;
    const lines = this.boardLines.length ? this.boardLines : ['Transfer window news appears here'];
    this.boardIndex = (this.boardIndex + 1) % lines.length;
    x.fillStyle = '#fff8e6';
    x.fillRect(0, 0, canvas.width, canvas.height);
    x.fillStyle = '#d9483b';
    x.fillRect(0, 0, canvas.width, 50);
    x.fillStyle = '#fff';
    x.font = 'bold 30px Fredoka, sans-serif';
    x.fillText('TRANSFER NEWS', 18, 36);
    x.fillStyle = '#4a3220';
    x.font = 'bold 34px Fredoka, sans-serif';
    // Word-wrap the headline into at most four lines.
    const words = lines[this.boardIndex].split(' ');
    let row = '', y = 98;
    for (const w of words) {
      if (x.measureText(`${row}${w} `).width > canvas.width - 36 && row) {
        x.fillText(row, 18, y);
        row = '';
        y += 42;
        if (y > 230) break;
      }
      row += `${w} `;
    }
    if (y <= 230) x.fillText(row, 18, y);
    texture.needsUpdate = true;
  }

  select(key: string | null) {
    this.selectedId = key;
    const p = key && this.view ? this.view.placement[key as CampusBuilding] : null;
    if (!p) {
      this.selectPlate.visible = false;
      return;
    }
    const [w, d] = footprint(key as CampusBuilding, p.rot);
    const c = footprintCenter(key as CampusBuilding, p);
    this.selectPlate.scale.set(w * CELL, d * CELL, 1);
    this.selectPlate.position.set(c.x, 0.08, c.z);
    this.selectPlate.visible = true;
  }

  /** The translucent building that follows the pointer in Move mode. */
  setGhost(key: CampusBuilding | null, p?: Placed, valid = true) {
    if (!key || !p) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostKey = '';
      this.plate.visible = false;
      return;
    }
    const sig = `${key}|${p.rot}`;
    if (sig !== this.ghostKey) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = buildingModel(key, this.stageContext(key), false, this.view?.colors ?? ['#fff', '#fff'], this.terrain.biome.campus);
      this.ghost.rotation.y = -p.rot * (Math.PI / 2);
      this.ghost.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          m.material = (m.material as THREE.Material).clone();
          (m.material as THREE.Material).transparent = true;
          (m.material as THREE.Material).opacity = 0.7;
          m.castShadow = false;
        }
      });
      this.scene.add(this.ghost);
      this.ghostKey = sig;
    }
    const c = footprintCenter(key, p);
    const [w, d] = footprint(key, p.rot);
    this.ghost!.position.set(c.x, 0.15, c.z);
    this.plate.visible = true;
    this.plate.scale.set(w * CELL, d * CELL, 1);
    this.plate.position.set(c.x, 0.1, c.z);
    (this.plate.material as THREE.MeshBasicMaterial).color.set(valid ? '#5ee06a' : '#ff5a4f');
  }

  /** Hides a building while it is being moved (the ghost stands in for it). */
  setHidden(key: string | null) {
    for (const [k, b] of this.buildingObjs) b.obj.visible = k !== key;
  }

  // --- People -------------------------------------------------------------------------
  private person(skin: string, hair: string, shirt: string, shorts: string) {
    const g = new THREE.Group();
    const part = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const legs: THREE.Object3D[] = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = 'leg';
      pivot.position.set(sx * 0.13, 0.5, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat(shorts));
      leg.position.y = -0.25;
      leg.castShadow = false;
      pivot.add(leg);
      g.add(pivot);
      legs.push(pivot);
    }
    part(new THREE.BoxGeometry(0.42, 0.22, 0.26), shorts, 0, 0.56, 0);
    part(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8), shirt, 0, 0.9, 0);
    for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.11, 0.42, 0.11), skin, sx * 0.3, 0.92, 0);
    part(new THREE.IcosahedronGeometry(0.24, 1), skin, 0, 1.38, 0);
    const cap = part(new THREE.SphereGeometry(0.255, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.4, -0.02);
    cap.rotation.x = -0.25;
    g.scale.setScalar(1.5);
    mergeByMaterial(g);
    return { g, legs };
  }

  private syncPeople(view: CampusView) {
    // Players: one per squad member, in kit, around the pitch.
    const ids = new Set(view.players.map((p) => p.id));
    for (const [id, w] of this.walkers) if (!ids.has(id)) { this.scene.remove(w.obj); this.walkers.delete(id); }
    for (const p of view.players) {
      const existing = this.walkers.get(p.id);
      if (existing) {
        existing.injured = p.injured;
        continue;
      }
      const r = mulberry32(seedOf(p.id));
      const { g, legs } = this.person(SKINS[Math.floor(r() * SKINS.length)], HAIRS[Math.floor(r() * HAIRS.length)], view.colors[0], view.colors[1]);
      g.userData.pick = { kind: 'player', id: p.id };
      const start = this.playerPoint(p.injured) ?? new THREE.Vector3();
      g.position.copy(start);
      this.scene.add(g);
      this.walkers.set(p.id, { obj: g, legs, target: start.clone(), wait: Math.random() * 3, speed: 1.6 + Math.random() * 0.8, phase: Math.random() * 6, id: p.id, injured: p.injured });
    }
    // Fans: townsfolk in club colours on the sidewalks and plaza.
    const want = Math.round(fanCount(view.fans) * (view.matchDay ? 1.8 : 1));
    while (this.fans.length > want) this.scene.remove(this.fans.pop()!.obj);
    while (this.fans.length < want) {
      const i = this.fans.length;
      const { g, legs } = this.person(SKINS[i % SKINS.length], HAIRS[i % HAIRS.length], i % 3 ? view.colors[0] : '#f5f1e6', ['#3b4a6b', '#5a4632', '#2b2b3a'][i % 3]);
      const start = this.fanPoint();
      g.position.copy(start);
      this.scene.add(g);
      this.fans.push({ obj: g, legs, target: start.clone(), wait: Math.random() * 4, speed: 1.2 + Math.random() * 0.6, phase: Math.random() * 6, id: `fan${i}` });
    }
  }

  /** Around the pitch, training ground or dugout; around the Medical Centre if injured. */
  private playerPoint(injured = false): THREE.Vector3 | null {
    if (!this.view) return null;
    const keys: CampusBuilding[] = injured ? ['medical_centre'] : ['stadium_grounds', 'stadium_grounds', 'training_ground', 'dugout'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const p = this.view.placement[key];
    const [w, d] = footprint(key, p.rot);
    return new THREE.Vector3((p.x - 0.5 + Math.random() * (w + 1)) * CELL, 0, (p.z - 0.5 + Math.random() * (d + 1)) * CELL);
  }

  /** The campus-side sidewalk of the ring road, the plaza, or (match day) by the Stands. */
  private fanPoint(): THREE.Vector3 {
    const r = Math.random();
    if (this.view?.matchDay && r < 0.4) {
      const c = footprintCenter('stands', this.view.placement.stands);
      return new THREE.Vector3(c.x + (Math.random() - 0.5) * 8, 0, c.z + (Math.random() - 0.5) * 4);
    }
    if (r < 0.25) {
      const a = Math.random() * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2);
    }
    const sx = RING.x - 2.75, sz = RING.z - 2.75;
    const t = Math.random() * 4 * (sx + sz);
    if (t < 2 * sx) return new THREE.Vector3(-sx + t, 0, -sz);
    if (t < 2 * sx + 2 * sz) return new THREE.Vector3(sx, 0, -sz + (t - 2 * sx));
    if (t < 4 * sx + 2 * sz) return new THREE.Vector3(sx - (t - 2 * sx - 2 * sz), 0, sz);
    return new THREE.Vector3(-sx, 0, sz - (t - 4 * sx - 2 * sz));
  }

  private stepWalker(w: Walker, dt: number, area: () => THREE.Vector3 | null, maxDist = Infinity) {
    const pos = w.obj.position;
    if (w.wait > 0) {
      w.wait -= dt;
      w.legs.forEach((l) => (l.rotation.x *= 0.8));
      return;
    }
    const to = w.target.clone().sub(pos);
    to.y = 0;
    const d = to.length();
    if (d < 0.2) {
      w.wait = 1 + Math.random() * 4;
      for (let i = 0; i < 12; i++) {
        const p = area();
        if (p && p.distanceTo(pos) < maxDist) {
          w.target.copy(p);
          break;
        }
      }
      return;
    }
    to.normalize();
    pos.addScaledVector(to, Math.min(d, w.speed * dt));
    w.obj.rotation.y = Math.atan2(to.x, to.z);
    w.phase += dt * w.speed * 5;
    w.legs.forEach((l, i) => (l.rotation.x = Math.sin(w.phase + i * Math.PI) * 0.6));
    pos.y = Math.abs(Math.sin(w.phase)) * 0.05;
  }

  // --- Traffic ------------------------------------------------------------------------
  private spawnCars() {
    const { x: rx, z: rz } = RING;
    const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    const loops: THREE.Vector3[][] = [
      [v(-rx - 1, -rz - 1), v(rx + 1, -rz - 1), v(rx + 1, rz + 1), v(-rx - 1, rz + 1)],
      [v(-rx + 1, -rz + 1), v(-rx + 1, rz - 1), v(rx - 1, rz - 1), v(rx - 1, -rz + 1)],
    ];
    // Avenues: out on one lane, back on the other.
    for (const [ax, az, bx, bz] of this.terrain.roads.slice(4)) {
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      loops.push([v(ax + nx, az + nz), v(bx + nx, bz + nz), v(bx - nx, bz - nz), v(ax - nx, az - nz)]);
    }
    loops.forEach((path, i) => {
      for (let k = 0; k < (i < 2 ? 4 : 2); k++) {
        const obj = mergeByMaterial(car(CAR_COLORS[(i * 3 + k) % CAR_COLORS.length]!));
        this.scene.add(obj);
        this.cars.push({ obj, path, t: k * 40 + i * 13, speed: 5 + ((i + k) % 3) });
      }
    });
  }

  /** Position and heading at distance t along a polyline (closed when looping). */
  private along(path: THREE.Vector3[], t: number, loop: boolean) {
    const segs = loop ? path.length : path.length - 1;
    const lens = Array.from({ length: segs }, (_, i) => path[i].distanceTo(path[(i + 1) % path.length]));
    const total = lens.reduce((a, b) => a + b, 0);
    let rest = loop ? ((t % total) + total) % total : Math.min(t, total);
    for (let i = 0; i < segs; i++) {
      if (rest <= lens[i] || i === segs - 1) {
        const a = path[i], b = path[(i + 1) % path.length];
        return { pos: a.clone().lerp(b, Math.min(1, rest / lens[i])), dir: b.clone().sub(a).normalize(), done: !loop && t >= total };
      }
      rest -= lens[i];
    }
    return { pos: path[0].clone(), dir: new THREE.Vector3(0, 0, 1), done: true };
  }

  private moveAlong(obj: THREE.Object3D, path: THREE.Vector3[], t: number, loop: boolean) {
    const { pos, dir, done } = this.along(path, t, loop);
    obj.position.set(pos.x, terrainH(pos.x, pos.z, this.variant), pos.z);
    obj.rotation.y = Math.atan2(dir.x, dir.z);
    return done;
  }

  // --- Team bus ------------------------------------------------------------------------
  private busRun: { obj: THREE.Group; path: THREE.Vector3[]; t: number; done: () => void } | null = null;
  private follow: THREE.Object3D | null = null;

  /** Up the south avenue and along the ring to the stop nearest the stadium. */
  private busRoute() {
    const pitch = this.view ? footprintCenter('stadium_grounds', this.view.placement.stadium_grounds) : { x: 0, z: 0 };
    const stopX = THREE.MathUtils.clamp(pitch.x, -RING.x + 3, RING.x - 3);
    return [new THREE.Vector3(-1, 0, 52), new THREE.Vector3(-1, 0, RING.z + 1), new THREE.Vector3(stopX, 0, RING.z + 1)];
  }

  private runBus(colors: [string, string], path: THREE.Vector3[], keep: boolean) {
    return new Promise<void>((resolve) => {
      if (this.busRun) this.scene.remove(this.busRun.obj);
      const obj = mergeByMaterial(bus(colors));
      this.scene.add(obj);
      this.follow = obj;
      this.busRun = {
        obj, path, t: 0,
        done: () => {
          this.follow = null;
          if (!keep) this.scene.remove(obj);
          resolve();
        },
      };
    });
  }

  /** A team bus in the given colours pulls up at the stadium. */
  playArrival(colors: [string, string]) {
    return this.runBus(colors, this.busRoute(), true);
  }

  /** The team bus leaves the stadium for an away match. */
  playDeparture(colors: [string, string]) {
    return this.runBus(colors, this.busRoute().reverse(), false);
  }

  // --- Frame ----------------------------------------------------------------------------
  render() {
    const delta = Math.min(0.05, this.clock.getDelta());
    const dt = this.paused ? 0 : delta;
    const t = this.clock.elapsedTime;
    if (this.follow) this.target.lerp(new THREE.Vector3(this.follow.position.x, 0, this.follow.position.z - 4), Math.min(1, dt * 3));
    this.updateCamera();

    this.terrain.water.offset.y -= dt * 0.35;
    for (const s of this.terrain.spinners) s.obj.rotation[s.axis] += s.speed * dt;

    for (const { obj } of this.buildingObjs.values()) {
      if (obj.userData.pop > 0) {
        obj.userData.pop = Math.max(0, obj.userData.pop - dt);
        const k = obj.userData.pop / 0.35;
        obj.scale.set(1 + Math.sin(k * Math.PI) * 0.12, 1 - Math.sin(k * Math.PI) * 0.08 + Math.sin(k * Math.PI * 2) * 0.06, 1 + Math.sin(k * Math.PI) * 0.12);
      }
      obj.traverse((o) => {
        if (o.name === 'flag') o.rotation.y = Math.sin(t * 2.5 + o.id) * 0.25;
      });
    }

    this.puffTimer -= dt;
    if (this.puffTimer <= 0) {
      this.puffTimer = 0.45;
      for (const { obj } of this.buildingObjs.values()) {
        const ch = obj.getObjectByName('chimney');
        if (ch) this.spawnPuff(ch.getWorldPosition(new THREE.Vector3()));
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      p.mesh.position.y += dt * 1.2;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(0.3 + p.life * 0.5);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.8 - p.life * 0.32);
      if (p.life > 2.5) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }

    for (const w of this.walkers.values()) this.stepWalker(w, dt, () => this.playerPoint(w.injured));
    this.boardTimer -= dt;
    if (this.boardTimer <= 0) {
      this.boardTimer = 6;
      this.drawBoard();
    }
    // Fans stroll: short hops along the sidewalk rather than across the map.
    for (const f of this.fans) this.stepWalker(f, dt, () => this.fanPoint(), 16);
    for (const c of this.cars) {
      c.t += c.speed * dt;
      this.moveAlong(c.obj, c.path, c.t, true);
    }
    if (this.busRun) {
      this.busRun.t += 9 * dt;
      if (this.moveAlong(this.busRun.obj, this.busRun.path, this.busRun.t, false)) {
        const run = this.busRun;
        this.busRun = null;
        run.done();
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt;
      s.v.y -= 22 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      if (s.mesh.position.y < 0.15) {
        // Bounce once, then settle and shrink away.
        s.mesh.position.y = 0.15;
        s.v.multiplyScalar(0.35);
        s.v.y = Math.abs(s.v.y);
      }
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      const fade = s.life > s.ttl - 0.4 ? Math.max(0, (s.ttl - s.life) / 0.4) : 1;
      s.mesh.scale.setScalar(fade);
      if (s.life >= s.ttl) {
        s.mesh.removeFromParent();
        this.sparks.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
    const { render, memory } = this.renderer.info;
    this.stats = { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  }

  private coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 12);
  private coinMat = new THREE.MeshStandardMaterial({ color: '#f5c542', emissive: '#7a5200', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3, flatShading: true });
  private confettiGeo = new THREE.PlaneGeometry(0.28, 0.16);
  private confettiMats = new Map<string, THREE.MeshStandardMaterial>();

  /** A celebratory burst from a building: coins (shop takings) or confetti
   * in the club's colours (a finished upgrade, a level-up). */
  burst(key: string, kind: 'coins' | 'confetti', count = kind === 'coins' ? 18 : 40) {
    const at = this.anchor(key);
    if (!at) return;
    at.y -= 0.8;
    const colors = [...(this.view?.colors ?? ['#3a6fd8', '#f5f1e6']), '#f2b632', '#3aa655'];
    for (let i = 0; i < count; i++) {
      let mesh: THREE.Mesh;
      if (kind === 'coins') mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      else {
        const c = colors[i % colors.length];
        let m = this.confettiMats.get(c);
        if (!m) this.confettiMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, flatShading: true })));
        mesh = new THREE.Mesh(this.confettiGeo, m);
      }
      mesh.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const out = kind === 'coins' ? 2 + Math.random() * 3 : 3 + Math.random() * 5;
      const v = new THREE.Vector3(Math.cos(a) * out, 9 + Math.random() * 6, Math.sin(a) * out);
      const spin = new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12);
      this.scene.add(mesh);
      this.sparks.push({ mesh, v, spin, life: 0, ttl: kind === 'coins' ? 1.6 : 2.4 });
    }
    const obj = this.buildingObjs.get(key)?.obj;
    if (obj) obj.userData.pop = 0.35;
  }

  private puffMat = new THREE.MeshStandardMaterial({ color: '#f2f2f2', transparent: true, opacity: 0.8, flatShading: true, depthWrite: false });
  private spawnPuff(at: THREE.Vector3, scale = 1) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * scale, 0), this.puffMat.clone());
    m.position.copy(at);
    this.scene.add(m);
    this.puffs.push({ mesh: m, life: 0, vx: 0.3 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.2 });
  }
}
