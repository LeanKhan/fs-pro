import type { CampusLayout, PlotKey } from '../types';
import { CITY } from './city';
import { COASTAL } from './coastal';
import { HILLSIDE } from './hillside';

export const LAYOUTS: Record<CampusLayout['variant'], CampusLayout> = {
  city: CITY,
  coastal: COASTAL,
  hillside: HILLSIDE,
};

/** Every layout must place every facility plus the office and dugout. */
export const REQUIRED_PLOTS: PlotKey[] = [
  'stadium_grounds',
  'stands',
  'training_ground',
  'youth_academy',
  'scouting',
  'medical_centre',
  'staff_house',
  'office',
  'dugout',
];

export function missingPlots(layout: CampusLayout): PlotKey[] {
  const have = new Set(layout.plots.map((p) => p.key));
  return REQUIRED_PLOTS.filter((k) => !have.has(k));
}

/** A club's layout: its CampusLayout if set, else a stable pick from its id. */
export function variantFor(clubId: string, stored?: string | null): CampusLayout['variant'] {
  if (stored && stored in LAYOUTS) return stored as CampusLayout['variant'];
  let h = 0;
  for (const ch of clubId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (['city', 'coastal', 'hillside'] as const)[h % 3]!;
}

/** The layout to draw: the club's variant when its scene exists, else city. */
export function layoutFor(variant: CampusLayout['variant'], hasFile: (path: string) => boolean): CampusLayout {
  const layout = LAYOUTS[variant];
  return hasFile(layout.scene) ? layout : CITY;
}

if (import.meta.env.DEV) {
  for (const layout of Object.values(LAYOUTS)) {
    const missing = missingPlots(layout);
    if (missing.length) console.warn(`[campus] ${layout.variant} layout has no plot for: ${missing.join(', ')}`);
  }
}
