import * as THREE from 'three';
import { CAMPUS_BUILDING_KEYS } from '@repo/api-contract';
import { buildingModel } from './models';

/** Renders each campus building once and exposes them as CSS backgrounds (.art-<type>). */
export function renderThumbs(colors: [string, string]) {
  const size = 192;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6b8a4a', 2));
  const sun = new THREE.DirectionalLight('#fff3dd', 2.4);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const rules: string[] = [];

  const shoot = (key: string, obj: THREE.Object3D) => {
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(15)) * 0.95;
    camera.position.set(c.x + dist * 0.55, c.y + dist * 0.6, c.z + dist * 0.6);
    camera.lookAt(c);
    renderer.render(scene, camera);
    rules.push(`.art-${key}{background-image:url(${renderer.domElement.toDataURL('image/png')})}`);
    scene.remove(obj);
  };

  for (const key of CAMPUS_BUILDING_KEYS) shoot(key, buildingModel(key, 3, false, colors));
  renderer.dispose();
  renderer.forceContextLoss();

  let style = document.getElementById('thumb-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'thumb-css';
    document.head.appendChild(style);
  }
  style.textContent = rules.join('\n');
}
