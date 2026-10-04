/** World map building blocks (docs/WORLD-VIEW-UI-PLAN.md). The club campus
 * is the 3D scene in components/cozy. */

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
