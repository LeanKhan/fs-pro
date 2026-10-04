import * as THREE from 'three';

/**
 * The instanced world kit for the city around the campus: shared unit
 * geometries, a facade material that paints windows in the shader (so a whole
 * district of buildings is a handful of draw calls), and the building, tree
 * and prop archetypes that terrain.ts scatters per terrain.
 */

/** A placement: position, scale, then yaw (ry) applied after a local tilt (rx, rz). */
export const M = (x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );

// --- Unit geometries (base at y=0, 1 unit wide/deep/tall) ---------------------------------
function gableGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

const GEOS: Record<string, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  gable: gableGeo,
  hip: () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  cyl12: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0),
  trunk: () => new THREE.CylinderGeometry(0.15, 0.22, 1, 6).translate(0, 0.5, 0),
  cone: () => new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0),
  blob: () => new THREE.IcosahedronGeometry(1, 0),
  rock: () => new THREE.DodecahedronGeometry(1, 0),
  dome: () => new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  leaf: () => new THREE.ConeGeometry(0.28, 1, 4).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, 0, 0.5),
};
const geoCache = new Map<string, THREE.BufferGeometry>();
const geo = (key: string) => {
  if (!geoCache.has(key)) geoCache.set(key, GEOS[key]!());
  return geoCache.get(key)!;
};

// --- Materials -------------------------------------------------------------------------------
/** Window layout for a facade style, in world units. */
interface Facade {
  floorH: number;
  /** Height of the plinth below the first floor. */
  base: number;
  spacing: number;
  /** Window half-width as a fraction of `spacing`. */
  half: number;
  /** Window bottom and top as fractions of a floor. */
  sill: number;
  head: number;
  glass: string;
  frame: string;
  /** Ground floor is one wide shop window. */
  shop?: boolean;
  /** Horizontal log courses (cabins). */
  logs?: boolean;
}

export const FACADES = {
  house: { floorH: 1.4, base: 0.3, spacing: 1.7, half: 0.2, sill: 0.3, head: 0.78, glass: '#5b8fd6', frame: '#fbf6ea' },
  apartment: { floorH: 1.3, base: 0.3, spacing: 1.1, half: 0.27, sill: 0.28, head: 0.78, glass: '#4f84c9', frame: '#f3efe6' },
  tower: { floorH: 1.15, base: 0.4, spacing: 0.9, half: 0.42, sill: 0.15, head: 0.88, glass: '#6ea7dd', frame: '#d7e2ea' },
  shop: { floorH: 1.35, base: 0.1, spacing: 1.3, half: 0.24, sill: 0.3, head: 0.78, glass: '#4f84c9', frame: '#fbf6ea', shop: true },
  med: { floorH: 1.4, base: 0.2, spacing: 1.6, half: 0.16, sill: 0.3, head: 0.76, glass: '#2f6fb8', frame: '#2f6fb8' },
  stone: { floorH: 1.4, base: 0.4, spacing: 1.9, half: 0.15, sill: 0.32, head: 0.75, glass: '#3e5f86', frame: '#efe6d2' },
  cabin: { floorH: 1.5, base: 0.35, spacing: 2.2, half: 0.14, sill: 0.35, head: 0.75, glass: '#ffd27a', frame: '#4a2e1c', logs: true },
  chalet: { floorH: 1.5, base: 0.0, spacing: 1.8, half: 0.18, sill: 0.3, head: 0.78, glass: '#3e5f86', frame: '#f5f1e6' },
  barn: { floorH: 2.2, base: 0.2, spacing: 3.2, half: 0.12, sill: 0.25, head: 0.7, glass: '#f5f1e6', frame: '#f5f1e6' },
} satisfies Record<string, Facade>;
export type FacadeStyle = keyof typeof FACADES;

const n3 = (v: number) => v.toFixed(3);
const rgb = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${n3(c.r)}, ${n3(c.g)}, ${n3(c.b)})`;
};

const VARYINGS = 'varying vec3 vFacade;\nvarying vec3 vFacadeN;\nvarying float vFacadeH;\nvarying float vFacadeW;\nvarying float vFacadeSeed;';

function facadeMaterial(style: FacadeStyle) {
  const f: Facade = FACADES[style];
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VARYINGS}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 fScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 fOrigin = instanceMatrix[3].xyz;
      #else
        vec3 fScale = vec3(1.0);
        vec3 fOrigin = vec3(0.0);
      #endif
      vFacade = position * fScale;
      vFacadeN = normal;
      vFacadeH = fScale.y;
      vFacadeW = abs(normal.x) > 0.5 ? fScale.z : fScale.x;
      vFacadeSeed = fOrigin.x * 0.131 + fOrigin.z * 0.297;`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VARYINGS}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fWin = 0.0;
        vec3 fN = abs(vFacadeN);
        float fy = vFacade.y;
        if (fN.y < 0.5) {
          float u = fN.x > 0.5 ? vFacade.z : vFacade.x;
          float fl = (fy - ${n3(f.base)}) / ${n3(f.floorH)};
          float row = floor(fl);
          float v = fract(fl);
          float cell = floor(u / ${n3(f.spacing)} + 0.5);
          float cu = abs(fract(u / ${n3(f.spacing)} + 0.5) - 0.5);
          float hw = ${n3(f.half)};
          float sill = ${n3(f.sill)};
          float head = ${n3(f.head)};
          ${f.shop ? 'if (row < 0.5) { hw = 0.46; sill = 0.12; head = 0.86; }' : ''}
          // Whole windows only: inside the wall's width and below its top.
          float edge = (abs(cell) + hw + 0.07) * ${n3(f.spacing)};
          float inside = step(0.0, fl) * step(edge, vFacadeW * 0.5 - 0.1)
            * step((row + head) * ${n3(f.floorH)} + ${n3(f.base)}, vFacadeH - 0.1);
          float win = inside * step(cu, hw) * step(sill, v) * step(v, head);
          float fr = inside * step(cu, hw + 0.07) * step(sill - 0.06, v) * step(v, head + 0.06);
          // A few windows are lit or curtained, so facades don't read as stamped.
          float h = fract(sin(dot(vec2(cell, row), vec2(12.9898, 78.233)) + vFacadeSeed) * 43758.5453);
          vec3 g = ${rgb(f.glass)};
          g = h > 0.84 ? mix(g, vec3(1.0, 0.86, 0.55), 0.75) : h < 0.16 ? mix(g, vec3(0.95, 0.93, 0.88), 0.45) : g * (0.85 + h * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, ${rgb(f.frame)}, fr * (1.0 - win));
          diffuseColor.rgb = mix(diffuseColor.rgb, g, win);
          fWin = win;
          ${f.logs ? 'diffuseColor.rgb *= 1.0 - (1.0 - win) * 0.16 * step(0.78, fract(fy * 3.2));' : ''}
          // A darker plinth grounds the building.
          diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.55, fy));
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, fWin);');
  };
  m.customProgramCacheKey = () => `facade-${style}`;
  return m;
}

const matCache = new Map<string, THREE.Material>();

/** Shared kit materials (colour comes from the instance): 'flat', 'facade:<style>', 'glass', 'leaf'. */
export function kitMaterial(key: string): THREE.Material {
  let m = matCache.get(key);
  if (m) return m;
  if (key.startsWith('facade:')) m = facadeMaterial(key.slice(7) as FacadeStyle);
  else if (key === 'glass') m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.1, flatShading: true });
  else if (key === 'leaf') m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  else m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true });
  matCache.set(key, m);
  return m;
}

// --- Scatter ---------------------------------------------------------------------------------
interface Part { geo: string; mat: string; shadow: boolean; mats: THREE.Matrix4[]; tints: THREE.Color[] }

/** Collects instances by (geometry, material) and builds an InstancedMesh per pair (two when it spans the shadow box). */
export class Scatter {
  private parts = new Map<string, Part>();

  add(geoKey: string, matKey: string, m: THREE.Matrix4, color: string | THREE.Color, shadow = true) {
    const key = `${geoKey}|${matKey}|${shadow}`;
    let p = this.parts.get(key);
    if (!p) this.parts.set(key, (p = { geo: geoKey, mat: matKey, shadow, mats: [], tints: [] }));
    p.mats.push(m);
    p.tints.push(typeof color === 'string' ? new THREE.Color(color) : color);
  }

  build(group: THREE.Group) {
    for (const p of this.parts.values()) {
      // Only instances inside the sun's shadow box cast shadows; the rest would
      // be drawn into the shadow map for nothing.
      const idx = p.mats.map((_, i) => i);
      const near = p.shadow ? idx.filter((i) => inShadowBox(p.mats[i]!)) : [];
      const far = p.shadow ? idx.filter((i) => !inShadowBox(p.mats[i]!)) : idx;
      for (const [ids, cast] of [[near, true], [far, false]] as const) {
        if (!ids.length) continue;
        const im = new THREE.InstancedMesh(geo(p.geo), kitMaterial(p.mat), ids.length);
        ids.forEach((id, i) => {
          im.setMatrixAt(i, p.mats[id]!);
          im.setColorAt(i, p.tints[id]!);
        });
        im.castShadow = cast;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        group.add(im);
      }
    }
  }
}

/** The sun's shadow camera covers ±55 around the campus (see World). */
const SHADOW_BOX = 58;
function inShadowBox(m: THREE.Matrix4) {
  return Math.abs(m.elements[12]!) < SHADOW_BOX && Math.abs(m.elements[14]!) < SHADOW_BOX;
}

// --- Archetypes ------------------------------------------------------------------------------
export type Rand = () => number;
export const pick = <T,>(r: Rand, a: readonly T[]) => a[Math.floor(r() * a.length)]!;

export function shade(hex: string | THREE.Color, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
}

/** Rotates a local (lx, lz) offset by the lot's yaw and adds the lot origin. */
const at = (x: number, z: number, ry: number, lx: number, lz: number) => {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, z - lx * s + lz * c] as const;
};

/** A building lot: centre, ground height, size and yaw (multiples of 90°). */
export interface Lot { x: number; y: number; z: number; w: number; d: number; ry: number }

/** A pitched roof on a w×d wall top at height y: wall-coloured gable ends under two roof slabs. */
function gableRoof(sc: Scatter, l: Lot, y: number, rh: number, eave: number, roof: string | THREE.Color, wall: string | THREE.Color) {
  const along = l.d >= l.w;
  const span = along ? l.w : l.d, len = along ? l.d : l.w;
  const yaw = l.ry + (along ? 0 : Math.PI / 2);
  sc.add('gable', 'flat', M(l.x, y, l.z, span, rh, len, yaw), wall);
  const a = span / 2 + eave * 0.5;
  const slope = Math.hypot(a, rh), th = Math.atan2(rh, a);
  for (const s of [-1, 1]) {
    const [x, z] = at(l.x, l.z, yaw, (s * a) / 2, 0);
    sc.add('box', 'flat', M(x, y + rh / 2 - 0.06, z, slope + 0.08, 0.14, len + eave, yaw, 0, -s * th), roof);
  }
  // Ridge cap.
  sc.add('box', 'flat', M(l.x, y + rh - 0.04, l.z, 0.22, 0.14, len + eave + 0.05, yaw), shade(roof, -0.12), false);
}

/** Gable or hip-roofed house of 1-3 floors, with chimney. */
export function house(sc: Scatter, r: Rand, l: Lot, o: { wall: string; roof: string; floors: number; hip?: boolean; style?: FacadeStyle; pitch?: number; eave?: number }) {
  const h = o.floors * FACADES.house.floorH + 0.3;
  sc.add('box', `facade:${o.style ?? 'house'}`, M(l.x, l.y, l.z, l.w, h, l.d, l.ry), o.wall);
  const eave = o.eave ?? 0.4;
  const rh = Math.min(l.w, l.d) * (o.pitch ?? 0.45);
  if (o.hip) sc.add('hip', 'flat', M(l.x, l.y + h, l.z, l.w + eave, rh, l.d + eave, l.ry), o.roof);
  else gableRoof(sc, l, l.y + h, rh, eave, o.roof, o.wall);
  if (r() < 0.6) {
    const [cx, cz] = at(l.x, l.z, l.ry, l.w * 0.22, -l.d * 0.2);
    sc.add('box', 'flat', M(cx, l.y + h, cz, 0.42, rh * 0.8 + 0.45, 0.42, l.ry), '#8c7b6b');
  }
}

/** Narrow gabled houses side by side, each its own colour. */
export function terrace(sc: Scatter, r: Rand, l: Lot, walls: readonly string[], roofs: readonly string[]) {
  const n = Math.max(2, Math.round(l.w / 1.9));
  const uw = l.w / n;
  const floors = 2 + Math.floor(r() * 2);
  const roof = pick(r, roofs);
  for (let i = 0; i < n; i++) {
    const [x, z] = at(l.x, l.z, l.ry, -l.w / 2 + uw * (i + 0.5), 0);
    // Each unit's ridge runs front to back, so the row reads as a sawtooth of gables.
    house(sc, r, { ...l, x, z, w: uw - 0.04, d: Math.max(l.d, uw + 0.1) }, { wall: pick(r, walls), roof: i % 2 ? roof : shade(roof, -0.07).getStyle(), floors, pitch: 0.75, eave: 0.12 });
  }
}

/** Flat-roofed apartment block with rooftop plant and the odd water tower. */
export function apartment(sc: Scatter, r: Rand, l: Lot, o: { wall: string; floors: number }) {
  const h = o.floors * FACADES.apartment.floorH + 0.3;
  sc.add('box', 'facade:apartment', M(l.x, l.y, l.z, l.w, h, l.d, l.ry), o.wall);
  sc.add('box', 'flat', M(l.x, l.y + h, l.z, l.w + 0.2, 0.25, l.d + 0.2, l.ry), shade(o.wall, -0.18));
  for (let i = 0; i < 2; i++) {
    const [ux, uz] = at(l.x, l.z, l.ry, (r() - 0.5) * l.w * 0.6, (r() - 0.5) * l.d * 0.6);
    sc.add('box', 'flat', M(ux, l.y + h + 0.25, uz, 0.6 + r() * 0.6, 0.4, 0.5 + r() * 0.5, l.ry), '#b9b9c2', false);
  }
  if (r() < 0.3) {
    const [tx, tz] = at(l.x, l.z, l.ry, l.w * 0.22, l.d * 0.2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sc.add('box', 'flat', M(tx + sx * 0.3, l.y + h + 0.25, tz + sz * 0.3, 0.08, 0.7, 0.08), '#6b4a2e', false);
    sc.add('cyl', 'flat', M(tx, l.y + h + 0.95, tz, 0.95, 0.75, 0.95), '#a8743f');
    sc.add('cone', 'flat', M(tx, l.y + h + 1.7, tz, 1.05, 0.35, 1.05), '#6b4a2e');
  }
}

/** Office tower in two or three setbacks with a glass crown and antenna. */
export function tower(sc: Scatter, r: Rand, l: Lot, o: { wall: string; floors: number }) {
  let y = l.y, w = l.w, d = l.d;
  const tiers = o.floors > 8 ? 3 : 2;
  for (let t = 0; t < tiers; t++) {
    const f = Math.max(2, Math.round((o.floors / tiers) * (t === 0 ? 1.3 : 0.85)));
    const h = f * FACADES.tower.floorH + 0.4;
    sc.add('box', 'facade:tower', M(l.x, y, l.z, w, h, d, l.ry), o.wall);
    sc.add('box', 'flat', M(l.x, y + h, l.z, w + 0.15, 0.18, d + 0.15, l.ry), shade(o.wall, -0.25));
    y += h + 0.18;
    w *= 0.74;
    d *= 0.74;
  }
  sc.add('box', 'glass', M(l.x, y, l.z, w * 0.8, 0.7, d * 0.8, l.ry), '#8fc3ea');
  if (r() < 0.7) sc.add('cyl', 'flat', M(l.x, y + 0.7, l.z, 0.12, 2 + r() * 2, 0.12), '#d8d2c6', false);
}

/** Two- or three-storey shops with awnings over the street. */
export function shops(sc: Scatter, r: Rand, l: Lot, o: { wall: string; awning: string }) {
  const floors = 2 + Math.floor(r() * 2);
  const h = floors * FACADES.shop.floorH + 0.1;
  sc.add('box', 'facade:shop', M(l.x, l.y, l.z, l.w, h, l.d, l.ry), o.wall);
  sc.add('box', 'flat', M(l.x, l.y + h, l.z, l.w + 0.25, 0.3, l.d + 0.25, l.ry), shade(o.wall, -0.2));
  for (const side of [-1, 1]) {
    const [ax, az] = at(l.x, l.z, l.ry, 0, side * (l.d / 2 + 0.4));
    sc.add('box', 'flat', M(ax, l.y + 1.3, az, l.w * 0.9, 0.1, 0.85, l.ry, side * 0.32), o.awning, false);
  }
}

/** Whitewashed seaside house: low terracotta hip, or a roof terrace with a domed stair house. */
export function seaHouse(sc: Scatter, r: Rand, l: Lot, o: { wall: string; roof: string; accent: string }) {
  const floors = 1 + Math.floor(r() * 2);
  const h = floors * FACADES.med.floorH + 0.2;
  sc.add('box', 'facade:med', M(l.x, l.y, l.z, l.w, h, l.d, l.ry), o.wall);
  if (r() < 0.5) {
    sc.add('hip', 'flat', M(l.x, l.y + h, l.z, l.w + 0.35, Math.min(l.w, l.d) * 0.3, l.d + 0.35, l.ry), o.roof);
  } else {
    sc.add('box', 'flat', M(l.x, l.y + h, l.z, l.w + 0.1, 0.3, l.d + 0.1, l.ry), shade(o.wall, -0.04));
    const [sx, sz] = at(l.x, l.z, l.ry, l.w * 0.22, -l.d * 0.2);
    sc.add('box', 'facade:med', M(sx, l.y + h, sz, 1.3, 1.2, 1.3, l.ry), o.wall);
    sc.add('dome', 'flat', M(sx, l.y + h + 1.2, sz, 1.3, 1.1, 1.3), o.accent);
  }
  // Pergola with a vine on the street side.
  const [px, pz] = at(l.x, l.z, l.ry, 0, l.d / 2 + 0.55);
  sc.add('box', 'flat', M(px, l.y + 1.3, pz, l.w * 0.7, 0.08, 1, l.ry), '#a8743f', false);
  sc.add('blob', 'flat', M(px - l.w * 0.15, l.y + 1.45, pz, 0.5, 0.25, 0.5), '#5db04a', false);
}

/** Stone farm cottage with a slate roof. */
export function cottage(sc: Scatter, r: Rand, l: Lot, o: { wall: string; roof: string }) {
  house(sc, r, l, { wall: o.wall, roof: o.roof, floors: 1 + (r() < 0.3 ? 1 : 0), style: 'stone', pitch: 0.6 });
}

/** Barn with a silo and hay bales. */
export function barn(sc: Scatter, r: Rand, l: Lot, o: { wall: string; roof: string }) {
  const h = 2.4;
  sc.add('box', 'facade:barn', M(l.x, l.y, l.z, l.w, h, l.d, l.ry), o.wall);
  gableRoof(sc, l, l.y + h, Math.min(l.w, l.d) * 0.5, 0.4, o.roof, o.wall);
  const [sx, sz] = at(l.x, l.z, l.ry, l.w / 2 + 1.1, -l.d * 0.2);
  sc.add('cyl12', 'flat', M(sx, l.y, sz, 1.6, 4.4 + r() * 1.2, 1.6), '#cfc8bc');
  sc.add('dome', 'flat', M(sx, l.y + 4.4, sz, 1.65, 1.2, 1.65), '#8e959e');
  for (let i = 0; i < 3; i++) {
    const [hx, hz] = at(l.x, l.z, l.ry, -l.w / 2 - 0.8, -0.8 + i * 0.85);
    sc.add('cyl', 'flat', M(hx, l.y + 0.35, hz, 0.7, 0.7, 0.7, l.ry, 0, Math.PI / 2), '#e2c36b', false);
  }
}

/** Log cabin: steep roof, stone chimney, a woodpile. */
export function cabin(sc: Scatter, r: Rand, l: Lot, o: { wall: string; roof: string }) {
  const h = FACADES.cabin.floorH + 0.35;
  sc.add('box', 'facade:cabin', M(l.x, l.y, l.z, l.w, h, l.d, l.ry), o.wall);
  const rh = Math.min(l.w, l.d) * 0.8;
  gableRoof(sc, l, l.y + h, rh, 0.5, o.roof, o.wall);
  const [cx, cz] = at(l.x, l.z, l.ry, -l.w / 2 - 0.1, 0);
  sc.add('box', 'flat', M(cx, l.y, cz, 0.7, h + rh * 0.85, 0.7, l.ry), '#8e8a84');
  if (r() < 0.7) {
    const [px, pz] = at(l.x, l.z, l.ry, l.w / 2 + 0.6, l.d * 0.2);
    for (let i = 0; i < 3; i++) sc.add('cyl', 'flat', M(px, l.y + 0.18 + i * 0.3, pz, 0.32, 1.3, 0.32, l.ry, Math.PI / 2), '#a8743f', false);
  }
}

/** Alpine chalet: stone ground floor, timber upper floor with balconies, wide snowy eaves. */
export function chalet(sc: Scatter, r: Rand, l: Lot, o: { timber: string; roof: string }) {
  sc.add('box', 'facade:stone', M(l.x, l.y, l.z, l.w, 1.4, l.d, l.ry), '#d9d3c7');
  sc.add('box', 'facade:chalet', M(l.x, l.y + 1.4, l.z, l.w, 1.5, l.d, l.ry), o.timber);
  const rh = Math.min(l.w, l.d) * 0.36;
  gableRoof(sc, l, l.y + 2.9, rh, 1.1, o.roof, o.timber);
  // Snow on the slabs: a thinner white roof just above.
  gableRoof(sc, { ...l, w: l.w * 0.92, d: l.d * 0.92 }, l.y + 2.9 + 0.13, rh, 0.9, '#f7fbff', o.timber);
  const along = l.d >= l.w;
  for (const side of [-1, 1]) {
    const [bx, bz] = along ? at(l.x, l.z, l.ry, 0, side * (l.d / 2 + 0.35)) : at(l.x, l.z, l.ry, side * (l.w / 2 + 0.35), 0);
    const yaw = l.ry + (along ? 0 : Math.PI / 2);
    const len = (along ? l.w : l.d) * 0.8;
    sc.add('box', 'flat', M(bx, l.y + 1.4, bz, len, 0.12, 0.7, yaw), '#7a4f2c', false);
    sc.add('box', 'flat', M(bx, l.y + 1.52, bz, len, 0.45, 0.7, yaw), '#a8743f', false);
  }
  if (r() < 0.5) bush(sc, r, l.x + l.w / 2 + 0.6, l.y, l.z, 0.8, '#3f7a3a', '#e5402f');
}

// --- Vegetation and props --------------------------------------------------------------------
export const TREE = {
  round(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number, leaf = '#4f9e3f') {
    sc.add('trunk', 'flat', M(x, y, z, s), '#6b4a2e');
    sc.add('blob', 'flat', M(x, y + 1.6 * s, z, 0.95 * s, 0.9 * s, 0.95 * s, r() * 6), shade(leaf, (r() - 0.5) * 0.1));
    sc.add('blob', 'flat', M(x + 0.45 * s, y + 2 * s, z + 0.2 * s, 0.65 * s, 0.65 * s, 0.65 * s, r() * 6), shade(leaf, 0.05 + (r() - 0.5) * 0.1));
  },
  pine(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number, leaf = '#2f7a4a', snow = false) {
    sc.add('trunk', 'flat', M(x, y, z, s * 0.8), '#5a3a22');
    const c = shade(leaf, (r() - 0.5) * 0.08);
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.25;
      sc.add('cone', 'flat', M(x, y + s * (0.6 + i * 0.75), z, 1.7 * s * k, 1.3 * s, 1.7 * s * k, r() * 6), c);
    }
    if (snow) sc.add('cone', 'flat', M(x, y + s * 2.35, z, 0.8 * s, 0.65 * s, 0.8 * s), '#f7fbff', false);
  },
  birch(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number, leaf = '#9cc94a') {
    sc.add('trunk', 'flat', M(x, y, z, s * 0.6, s * 2.1, s * 0.6), '#efeae0');
    sc.add('blob', 'flat', M(x, y + 2.4 * s, z, 0.7 * s, 1.15 * s, 0.7 * s, r() * 6), shade(leaf, (r() - 0.5) * 0.12));
  },
  poplar(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number, leaf = '#5a9e3c') {
    sc.add('trunk', 'flat', M(x, y, z, s * 0.7), '#6b4a2e');
    sc.add('blob', 'flat', M(x, y + 2.2 * s, z, 0.55 * s, 1.7 * s, 0.55 * s, r() * 6), shade(leaf, (r() - 0.5) * 0.1));
  },
  palm(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number) {
    // A gently leaning trunk of four segments, then a crown of fronds.
    const yaw = r() * Math.PI * 2, lean = 0.12 + r() * 0.12;
    const dx = Math.cos(yaw), dz = -Math.sin(yaw);
    let px = x, py = y, pz = z;
    for (let i = 0; i < 4; i++) {
      const tilt = lean * (i + 1);
      sc.add('trunk', 'flat', M(px, py, pz, s * (0.8 - i * 0.08), s * 0.95, s * (0.8 - i * 0.08), yaw, 0, -tilt), '#a8865a');
      px += Math.sin(tilt) * s * 0.92 * dx;
      pz += Math.sin(tilt) * s * 0.92 * dz;
      py += Math.cos(tilt) * s * 0.92;
    }
    for (let i = 0; i < 7; i++) sc.add('leaf', 'leaf', M(px, py, pz, s * 1.4, s, s * 2.1, (i / 7) * Math.PI * 2 + yaw, 0.35 + r() * 0.25), shade('#3f9a3a', (r() - 0.5) * 0.12));
    sc.add('blob', 'flat', M(px, py - 0.1 * s, pz, 0.25 * s), '#7a5a2c', false);
  },
};

export function bush(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number, leaf = '#4f9e3f', flowers?: string) {
  sc.add('blob', 'flat', M(x, y + 0.25 * s, z, 0.6 * s, 0.45 * s, 0.6 * s, r() * 6), shade(leaf, (r() - 0.5) * 0.12), false);
  if (flowers) for (let i = 0; i < 3; i++) sc.add('blob', 'flat', M(x + (r() - 0.5) * s, y + 0.55 * s, z + (r() - 0.5) * s, 0.12 * s), flowers, false);
}

export function rock(sc: Scatter, r: Rand, x: number, y: number, z: number, s: number, color = '#9a958c') {
  sc.add('rock', 'flat', M(x, y + 0.2 * s, z, s * (0.8 + r() * 0.5), s * (0.5 + r() * 0.4), s * (0.8 + r() * 0.5), r() * 6, (r() - 0.5) * 0.4), shade(color, (r() - 0.5) * 0.12));
}
