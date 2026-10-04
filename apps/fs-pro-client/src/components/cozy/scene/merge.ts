import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Plain opaque colours all share this one material; the colour lives in the vertices. */
const PAINTED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

const paintable = (m: THREE.Material) => {
  const s = m as THREE.MeshStandardMaterial;
  return s.isMeshStandardMaterial && !s.map && !s.transparent && !s.emissiveIntensity && s.side === THREE.FrontSide;
};

/**
 * Merges a model's static meshes so a building of fifty parts costs one or
 * two draw calls: plain opaque colours are baked into vertex colours under one
 * shared material, anything else (glass, nets, glowing lamps) merges per
 * material. Named objects (flags, sails, legs, the chimney anchor...) and
 * textured meshes are animated or unique, and stay as they are.
 */
export function mergeByMaterial<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const merged: THREE.Mesh[] = [];
  const color = new THREE.Color();

  const visit = (o: THREE.Object3D) => {
    if (o !== root && o.name) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && !(m.material as THREE.MeshStandardMaterial).map && !(m as THREE.InstancedMesh).isInstancedMesh) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      g.clearGroups();
      g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      const paint = paintable(m.material);
      if (paint) {
        color.copy((m.material as THREE.MeshStandardMaterial).color);
        const n = g.attributes.position!.count;
        const c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      const mat = paint ? PAINTED : (m.material as THREE.Material);
      const key = `${mat.uuid}|${m.castShadow}`;
      if (!groups.has(key)) groups.set(key, { mat, cast: m.castShadow, geos: [] });
      groups.get(key)!.geos.push(g);
      merged.push(m);
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);

  for (const m of merged) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const { mat, cast, geos } of groups.values()) {
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
