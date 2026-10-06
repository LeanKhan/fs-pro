import type { CampusLayout, Plot } from '../types';

/**
 * The original campus (scene: public/world/campus/city/scene.jpg, 2752 x 1536,
 * drawn in 1376 x 768 scene units). Plot boxes are the union boxes of the old
 * hand-placed sprites, so the layout is unchanged; the b0 plates were
 * composited from those sprites (scripts/world/composite-b0-plates.py).
 */
export const CITY_PLOTS: Plot[] = [
  { key: 'stadium_grounds', title: 'Pitch', icon: '🌱', x: 671, y: 610, w: 700, h: 405.1, z: 0, pin: [800, 330] },
  {
    key: 'stands',
    title: 'Stands',
    icon: '🏟️',
    x: 672.5,
    y: 530,
    w: 689,
    h: 296.6,
    z: 1,
    pin: [470, 262],
    hit: [
      [405, 233.4, 170, 118.6],
      [790, 411.4, 170, 118.6],
      [328, 324.2, 34, 95.8],
      [983, 304.2, 34, 95.8],
    ],
  },
  { key: 'training_ground', title: 'Training Ground', icon: '🦺', x: 330, y: 275, w: 270, h: 182.4, z: 0 },
  { key: 'medical_centre', title: 'Medical Centre', icon: '➕', x: 560, y: 150, w: 110, h: 113.7, z: 1 },
  { key: 'staff_house', title: 'Staff House', icon: '👥', x: 900, y: 195, w: 200, h: 139, z: 1 },
  { key: 'scouting', title: 'Scouting', icon: '🔭', x: 110, y: 470, w: 95, h: 179.2, z: 1 },
  {
    key: 'youth_academy',
    title: 'Academy',
    icon: '🎓',
    x: 280,
    y: 610,
    w: 200,
    h: 106.8,
    z: 1,
    hit: [
      [180, 503.2, 120, 86.8],
      [300, 542.6, 80, 67.4],
    ],
  },
  { key: 'dugout', title: 'Dugout', icon: '📋', x: 660, y: 500, w: 100, h: 81, z: 1 },
  { key: 'office', title: 'Office', icon: '🏢', x: 1190, y: 360, w: 150, h: 120, z: 1 },
];

export const CITY: CampusLayout = {
  variant: 'city',
  width: 1376,
  height: 768,
  scene: 'campus/city/scene.jpg',
  plots: CITY_PLOTS,
};
