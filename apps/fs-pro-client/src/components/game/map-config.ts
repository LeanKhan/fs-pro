/**
 * Layout of the club map (public/campus/base-land.jpg, 2752 x 1536).
 * Coordinates are in a 1376 x 768 space (half the image), drawn in an SVG with
 * the same viewBox, so everything stays aligned with the picture at any size.
 *
 * The base is bare land; every facility is a set of sprites placed on it.
 * A sprite is anchored at its bottom-centre (x, y) and sized by width `w`
 * (height follows the image's aspect). A facility's clickable area is the
 * union box of its sprites, and its pin sits above that box.
 *
 * Each facility has `tiers`: the last tier whose `from` <= the facility's level
 * is shown, so new art is just another tier. Only level-0 art exists so far.
 */
export const MAP_WIDTH = 1376;
export const MAP_HEIGHT = 768;
export const MAP_IMAGE = '/campus/base-land.jpg';
/** Plain-grass surround, 3x the map each way and centred on it (for the zoomed-out view). */
export const GROUND_IMAGE = '/campus/ground.jpg';

const SPRITE_DIR = '/campus/sprites/';

/** Natural pixel sizes of the sprite files (for aspect ratio). */
const SIZE: Record<string, [number, number]> = {
  'l0-cabin': [213, 148],
  'l0-bench-long': [172, 120],
  'l0-bench-short': [105, 85],
  'l0-medical-hut': [118, 122],
  'l0-merch-stall': [125, 130],
  'l0-floodlight': [44, 124],
  'l0-lamp-short': [37, 106],
  'l0-comms-tower': [114, 215],
  'l0-cones-hoops': [130, 94],
  'l0-cone-stack': [38, 50],
  'l0-mini-goals': [89, 75],
  'l0-car-blue': [75, 58],
  'l0-car-red': [78, 61],
  'l0-regulation-pitch': [470, 272],
  'l0-training-pen': [302, 204],
  'l0-sign-billboard': [159, 215],
  'l0-sign-poster': [79, 208],
  'l0-sign-aframe': [129, 91],
};

export interface SpriteDef {
  /** File name without extension (public/campus/sprites). */
  img: string;
  /** Bottom-centre anchor, map units. */
  x: number;
  y: number;
  /** Width in map units. */
  w: number;
  /** Draw layer: 0 = ground (pitch, pens), default 1 = upright things. */
  z?: number;
  /** Mirror horizontally (to run along the other diagonal). */
  flip?: boolean;
}

export interface PlacedSprite extends SpriteDef {
  src: string;
  h: number;
  left: number;
  top: number;
}

export interface HotspotDef {
  key: string;
  title: string;
  icon: string;
  /** Pin position override (map units); default is the top-centre of the sprites. */
  pin?: [number, number];
  /** Sprites per level tier: the last tier with `from` <= level is shown. */
  tiers: { from: number; sprites: SpriteDef[] }[];
  /** Not a leveled ClubAssets facility - no upgrade economy, no "Lv N" pin
   * badge, and its click is handled specially (see club-game.vue). Used for
   * the Dugout, which opens the Team Sheet tactics editor directly. */
  nonFacility?: boolean;
}

export const HOTSPOTS: HotspotDef[] = [
  {
    key: 'stadium_grounds',
    title: 'Pitch',
    icon: '🌱',
    pin: [690, 430],
    tiers: [{ from: 0, sprites: [{ img: 'l0-regulation-pitch', x: 671, y: 610, w: 700, z: 0 }] }],
  },
  {
    key: 'stands',
    title: 'Stands',
    icon: '🏟️',
    pin: [470, 262],
    tiers: [
      {
        from: 0,
        sprites: [
          { img: 'l0-bench-long', x: 490, y: 352, w: 170, flip: true },
          { img: 'l0-bench-long', x: 875, y: 530, w: 170, flip: true },
          { img: 'l0-floodlight', x: 345, y: 420, w: 34 },
          { img: 'l0-floodlight', x: 1000, y: 400, w: 34 },
        ],
      },
    ],
  },
  {
    key: 'training_ground',
    title: 'Training Ground',
    icon: '🦺',
    tiers: [{ from: 0, sprites: [{ img: 'l0-training-pen', x: 330, y: 275, w: 270, z: 0 }] }],
  },
  {
    key: 'medical_centre',
    title: 'Medical Centre',
    icon: '➕',
    tiers: [{ from: 0, sprites: [{ img: 'l0-medical-hut', x: 560, y: 150, w: 110 }] }],
  },
  {
    key: 'staff_house',
    title: 'Staff House',
    icon: '👥',
    tiers: [{ from: 0, sprites: [{ img: 'l0-cabin', x: 900, y: 195, w: 200 }] }],
  },
  {
    key: 'scouting',
    title: 'Scouting',
    icon: '🔭',
    tiers: [{ from: 0, sprites: [{ img: 'l0-comms-tower', x: 110, y: 470, w: 95 }] }],
  },
  {
    key: 'youth_academy',
    title: 'Academy',
    icon: '🎓',
    tiers: [
      {
        from: 0,
        sprites: [
          { img: 'l0-cones-hoops', x: 240, y: 590, w: 120 },
          { img: 'l0-mini-goals', x: 340, y: 610, w: 80 },
        ],
      },
    ],
  },
  {
    key: 'dugout',
    title: 'Dugout',
    icon: '📋',
    nonFacility: true,
    tiers: [{ from: 0, sprites: [{ img: 'l0-bench-short', x: 660, y: 500, w: 100 }] }],
  },
];

/** Scenery that isn't a facility (drawn under the facilities, not clickable). */
export const DECOR: SpriteDef[] = [
  { img: 'l0-car-blue', x: 1070, y: 600, w: 70 },
  { img: 'l0-car-red', x: 1190, y: 660, w: 72 },
  { img: 'l0-merch-stall', x: 940, y: 655, w: 100 },
  { img: 'l0-lamp-short', x: 1040, y: 565, w: 30 },
];

/**
 * Club signage: real signboard props (cut from club-signage.png, the
 * isometric stadium-signage sheet) with a blank panel that the club's real
 * crest (SVG, /club-icons/{ClubCode}.svg - the same set used elsewhere in
 * the app) is layered onto live, so the map carries the viewed club's own
 * branding rather than one baked-in logo. Each sign type has its own panel
 * inset (fraction of its own width/height, shrunk a little inside the
 * white area to allow for the isometric skew). Placed in open lawn, clear
 * of every hotspot/DECOR item above.
 */
export interface SignDef {
  img: 'l0-sign-billboard' | 'l0-sign-poster' | 'l0-sign-aframe';
  x: number;
  y: number;
  w: number;
}
export const SIGN_PANELS: Record<SignDef['img'], { left: number; top: number; width: number; height: number }> = {
  'l0-sign-billboard': { left: 0.18, top: 0.13, width: 0.65, height: 0.45 },
  'l0-sign-poster': { left: 0.32, top: 0.1, width: 0.37, height: 0.53 },
  'l0-sign-aframe': { left: 0.17, top: 0.2, width: 0.59, height: 0.57 },
};
export const SIGNS: SignDef[] = [
  // Gap between Medical Centre and Staff House - clear of the screen-fixed HUD panels.
  { img: 'l0-sign-billboard', x: 700, y: 140, w: 100 },
  // Open grass below the pitch, before the car park.
  { img: 'l0-sign-poster', x: 600, y: 645, w: 55 },
  // Beside the merch stall, near the car park.
  { img: 'l0-sign-aframe', x: 1010, y: 610, w: 90 },
];

export function placeSprite(s: SpriteDef): PlacedSprite {
  const [nw, nh] = SIZE[s.img] ?? [1, 1];
  const h = (s.w * nh) / nw;
  return { ...s, src: `${SPRITE_DIR}${s.img}.png`, h, left: s.x - s.w / 2, top: s.y - h };
}

/** The sprites a facility shows at `level`. */
export function spritesFor(def: HotspotDef, level: number): PlacedSprite[] {
  const tier = [...def.tiers].reverse().find((t) => t.from <= level) ?? def.tiers[0];
  return tier.sprites.map(placeSprite);
}
