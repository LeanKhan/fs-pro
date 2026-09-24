/**
 * World view building blocks (docs/WORLD-VIEW-UI-PLAN.md): a scene is one
 * painted background plus fixed plots; each plot shows a plate (one image of
 * a whole facility at a band of Tiers) fitted into its box.
 */

export type FacilityKey =
  | 'stadium_grounds'
  | 'stands'
  | 'training_ground'
  | 'youth_academy'
  | 'scouting'
  | 'medical_centre'
  | 'staff_house';

export type PlotKey = FacilityKey | 'office' | 'dugout';

export interface Plot {
  key: PlotKey;
  title: string;
  icon: string;
  /** Bottom-centre anchor, scene units. */
  x: number;
  y: number;
  /** Box the plate is fitted into (contain), scene units. */
  w: number;
  h: number;
  /** 0 = ground (pitch, pens), 1 = upright. Upright plots draw in y order. */
  z: 0 | 1;
  /** Pin override, scene units; default = top centre of the box. */
  pin?: [number, number];
  /** Clickable boxes [x, y, w, h] when the plate is sparse (default: the box). */
  hit?: [number, number, number, number][];
}

export interface CampusLayout {
  variant: 'city' | 'coastal' | 'hillside';
  width: number;
  height: number;
  /** Scene image path under /world. */
  scene: string;
  plots: Plot[];
}

/** Anything the generic scene draws a pin and a hit box for. */
export interface SceneObject {
  id: string;
  label: string;
  /** Anchor (bottom centre) and box, scene units. */
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  /** Image fitted into the box; null draws the empty-plot placeholder. */
  src?: string | null;
  hit?: [number, number, number, number][];
  pin?: [number, number];
  /** Short pin text: name, then up to two facts (Tier, status). */
  icon?: string;
  badge?: string | null;
  status?: string | null;
  /** 0–100 progress under the pin (building timer). */
  progress?: number | null;
  /** Overlay effects drawn by code. */
  scaffold?: boolean;
  glow?: boolean;
  /** Pin shows an image (e.g. a club crest) instead of the icon. */
  pinImage?: string | null;
  tint?: string | null;
  kind?: string;
  /** Pin only: no plate and no empty-plot placeholder. */
  bare?: boolean;
}

/** Tier → art band: b0 = Tiers 0–1, b1 = 2–3, b2 = 4–5. */
export function bandForTier(tier: number) {
  return Math.max(0, Math.min(2, Math.floor(tier / 2)));
}
