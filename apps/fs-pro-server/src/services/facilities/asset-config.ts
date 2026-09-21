/**
 * Club facility definitions: what can be built, what each level costs, how
 * many calendar days it takes and what it does. Balancing lives here only -
 * a new club starts at Level 0 everywhere (dirt pitch, no stands) and pays
 * cash + waits game days for each level. All figures are placeholder tuning
 * values (a typical club Budget is ~18M).
 */

export const ASSET_TYPES = [
  'stadium_grounds',
  'stands',
  'training_ground',
  'youth_academy',
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const MAX_ASSET_LEVEL = 5;

/** Concurrent upgrade projects per club (CoC's "builders"). */
export const MAX_CONCURRENT_UPGRADES = 1;

export interface AssetDefinition {
  type: AssetType;
  name: string;
  description: string;
  /** Cost of the first level; later levels scale by `costGrowth`. */
  baseCost: number;
  costGrowth: number;
  /** Game days to build level N = baseDays * N. */
  baseDays: number;
  /** Other assets that must already be at (target level - offset) or better. */
  requires?: { type: AssetType; levelOffset: number }[];
  /** Human-readable effect at a given level, for the UI. */
  effectLabel: (level: number) => string;
  /** Numeric effects at a given level, consumed by the game systems. */
  effects: (level: number) => Record<string, number>;
}

/** Home-stand seats per Stands level (Level 0 = an open dirt bank). */
const CAPACITY_BY_LEVEL = [500, 2_000, 6_000, 15_000, 30_000, 55_000];

export const ASSET_CONFIG: Record<AssetType, AssetDefinition> = {
  stadium_grounds: {
    type: 'stadium_grounds',
    name: 'Stadium Grounds',
    description: 'Pitch quality and floodlights. Starts as a bare dirt turf.',
    baseCost: 250_000,
    costGrowth: 2.4,
    baseDays: 5,
    effectLabel: (l) =>
      ['Dirt turf', 'Patchy grass', 'Maintained grass', 'Pro pitch', 'Floodlit pitch', 'World-class pitch'][l] ??
      `Level ${l}`,
    effects: (l) => ({ pitchQuality: l }),
  },
  stands: {
    type: 'stands',
    name: 'Stands',
    description: 'Seating capacity. More seats mean more matchday income.',
    baseCost: 300_000,
    costGrowth: 2.5,
    baseDays: 6,
    requires: [{ type: 'stadium_grounds', levelOffset: 1 }],
    effectLabel: (l) => `${(CAPACITY_BY_LEVEL[l] ?? 0).toLocaleString('en-US')} capacity`,
    effects: (l) => ({ capacity: CAPACITY_BY_LEVEL[l] ?? 0 }),
  },
  training_ground: {
    type: 'training_ground',
    name: 'Training Ground',
    description: 'Boosts player growth from training.',
    baseCost: 200_000,
    costGrowth: 2.3,
    baseDays: 5,
    effectLabel: (l) => `+${l * 8}% training growth`,
    effects: (l) => ({ trainingGrowthMultiplier: 1 + l * 0.08 }),
  },
  youth_academy: {
    type: 'youth_academy',
    name: 'Youth Academy',
    description: 'Improves the quality of the yearly youth intake.',
    baseCost: 350_000,
    costGrowth: 2.4,
    baseDays: 8,
    requires: [{ type: 'training_ground', levelOffset: 1 }],
    effectLabel: (l) => `Youth intake quality +${l * 6}%`,
    effects: (l) => ({ youthQualityBonus: l * 0.06 }),
  },
};

export function isAssetType(value: string): value is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(value);
}

/** Cash cost to build `targetLevel` (1..MAX_ASSET_LEVEL) of an asset. */
export function upgradeCost(type: AssetType, targetLevel: number): number {
  const def = ASSET_CONFIG[type];
  return Math.round(def.baseCost * Math.pow(def.costGrowth, targetLevel - 1));
}

/** Game days it takes to build `targetLevel` of an asset. */
export function upgradeDays(type: AssetType, targetLevel: number): number {
  return ASSET_CONFIG[type].baseDays * targetLevel;
}
