import type { TownTerrain } from '@repo/api-contract';

export const TERRAINS: { key: TownTerrain; label: string; blurb: string }[] = [
  { key: 'city', label: 'City', blurb: 'Streets and rooftops' },
  { key: 'coastal', label: 'Coastal', blurb: 'Sea air and a promenade' },
  { key: 'hillside', label: 'Hillside', blurb: 'Terraces and pine trees' },
];

export const TERRAIN_LABEL: Record<TownTerrain, string> = { city: 'City', coastal: 'Coastal', hillside: 'Hillside' };
