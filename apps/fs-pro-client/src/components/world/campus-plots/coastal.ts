import type { CampusLayout } from '../types';
import { CITY_PLOTS } from './city';

/** Shoreline along the left edge: the city plan mirrored, so the pitch keeps
 * its size and the sea side stays open. Used once
 * public/world/campus/coastal/scene.jpg exists. */
const W = 1376;
export const COASTAL: CampusLayout = {
  variant: 'coastal',
  width: W,
  height: 768,
  scene: 'campus/coastal/scene.jpg',
  plots: CITY_PLOTS.map((p) => ({
    ...p,
    x: W - p.x,
    pin: p.pin ? [W - p.pin[0], p.pin[1]] : undefined,
    hit: p.hit?.map(([x, y, w, h]) => [W - x - w, y, w, h] as [number, number, number, number]),
  })),
};
