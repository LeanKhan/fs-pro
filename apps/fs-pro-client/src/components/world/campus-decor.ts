/**
 * Campus scenery that isn't a facility (city layout only): cars, a merch
 * stall and club signage, drawn from the old l0-* sprites
 * (public/campus/sprites). A sprite is anchored at its bottom centre and
 * sized by width, in scene units (1376 x 768).
 */
const SPRITE_DIR = '/campus/sprites/';

/** Natural pixel sizes of the sprite files (for aspect ratio). */
const SIZE: Record<string, [number, number]> = {
  'l0-merch-stall': [125, 130],
  'l0-lamp-short': [37, 106],
  'l0-car-blue': [75, 58],
  'l0-car-red': [78, 61],
  'l0-sign-billboard': [159, 215],
  'l0-sign-poster': [79, 208],
  'l0-sign-aframe': [129, 91],
};

export interface SpriteDef {
  img: string;
  x: number;
  y: number;
  w: number;
}

export interface PlacedSprite extends SpriteDef {
  src: string;
  h: number;
  left: number;
  top: number;
}

export const DECOR: SpriteDef[] = [
  { img: 'l0-car-blue', x: 1070, y: 600, w: 70 },
  { img: 'l0-car-red', x: 1190, y: 660, w: 72 },
  { img: 'l0-merch-stall', x: 940, y: 655, w: 100 },
  { img: 'l0-lamp-short', x: 1040, y: 565, w: 30 },
];

/** Signs with a blank panel the viewed club's crest is layered onto; the
 * panel inset is a fraction of the sign's own width/height. */
export const SIGN_PANELS: Record<string, { left: number; top: number; width: number; height: number }> = {
  'l0-sign-billboard': { left: 0.18, top: 0.13, width: 0.65, height: 0.45 },
  'l0-sign-poster': { left: 0.32, top: 0.1, width: 0.37, height: 0.53 },
  'l0-sign-aframe': { left: 0.17, top: 0.2, width: 0.59, height: 0.57 },
};
export const SIGNS: SpriteDef[] = [
  { img: 'l0-sign-billboard', x: 700, y: 140, w: 100 },
  { img: 'l0-sign-poster', x: 600, y: 645, w: 55 },
  { img: 'l0-sign-aframe', x: 1010, y: 610, w: 90 },
];

export function placeSprite(s: SpriteDef): PlacedSprite {
  const [nw, nh] = SIZE[s.img] ?? [1, 1];
  const h = (s.w * nh) / nw;
  return { ...s, src: `${SPRITE_DIR}${s.img}.png`, h, left: s.x - s.w / 2, top: s.y - h };
}
