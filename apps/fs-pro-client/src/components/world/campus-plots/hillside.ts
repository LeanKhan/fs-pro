import type { CampusLayout } from '../types';
import { CITY_PLOTS } from './city';

/** Terraced ground: everything north of the pitch sits one terrace higher
 * (the slope rises behind the stands). Used once
 * public/world/campus/hillside/scene.jpg exists. */
const LIFT = 40;
const upper = new Set(['training_ground', 'medical_centre', 'staff_house', 'office']);
export const HILLSIDE: CampusLayout = {
  variant: 'hillside',
  width: 1376,
  height: 768,
  scene: 'campus/hillside/scene.jpg',
  plots: CITY_PLOTS.map((p) => {
    if (!upper.has(p.key)) return { ...p };
    return {
      ...p,
      y: p.y - LIFT,
      pin: p.pin ? [p.pin[0], p.pin[1] - LIFT] : undefined,
      hit: p.hit?.map(([x, y, w, h]) => [x, y - LIFT, w, h] as [number, number, number, number]),
    };
  }),
};
