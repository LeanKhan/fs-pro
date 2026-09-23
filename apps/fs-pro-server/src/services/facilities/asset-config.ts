/**
 * Club facility definitions: what can be built, what each level costs, how
 * how many real minutes it takes and what it does. Balancing lives here only -
 * a new club starts at Level 0 everywhere (dirt pitch, no stands) and pays
 * cash + waits real time for each level. All figures are placeholder tuning
 * values (a typical club Budget is ~18M).
 */

export const ASSET_TYPES = [
  'stadium_grounds',
  'stands',
  'training_ground',
  'youth_academy',
  'scouting',
  'medical_centre',
  'staff_house',
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
  /** Real minutes to build level N = baseMinutes * N. */
  baseMinutes: number;
  /** Other assets that must already be at (target level - offset) or better. */
  requires?: { type: AssetType; levelOffset: number }[];
  /** Human-readable effect at a given level, for the UI. */
  effectLabel: (level: number) => string;
  /** Numeric effects at a given level, consumed by the game systems. */
  effects: (level: number) => Record<string, number>;
}

/** Home-stand seats per Stands level (Level 0 = an open dirt bank). */
const CAPACITY_BY_LEVEL = [1_000, 3_000, 8_000, 18_000, 32_000, 55_000];

/**
 * Levels an already-existing club is given by the one-off backfill
 * (scripts/migration/backfill-club-assets.ts), scaled by its league division
 * (1 = top flight). Newly created clubs do NOT use this - they start at
 * Level 0 everywhere. A club that is claimed later keeps whatever it has.
 */
export function legacyClubLevels(division: number | null): Record<AssetType, number> {
  const tier =
    division === 1
      ? { stadium_grounds: 3, stands: 3, training_ground: 2, youth_academy: 2, scouting: 0, medical_centre: 0, staff_house: 0 }
      : division === 2
        ? { stadium_grounds: 2, stands: 2, training_ground: 1, youth_academy: 1, scouting: 0, medical_centre: 0, staff_house: 0 }
        : { stadium_grounds: 1, stands: 1, training_ground: 1, youth_academy: 0, scouting: 0, medical_centre: 0, staff_house: 0 };
  return tier;
}

export const ASSET_CONFIG: Record<AssetType, AssetDefinition> = {
  stadium_grounds: {
    type: 'stadium_grounds',
    name: 'Stadium Grounds',
    description: 'Pitch quality and floodlights. Starts as a bare dirt turf.',
    baseCost: 250_000,
    costGrowth: 2.4,
    baseMinutes: 20,
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
    baseMinutes: 30,
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
    baseMinutes: 20,
    effectLabel: (l) => `+${l * 8}% training growth`,
    effects: (l) => ({ trainingGrowthMultiplier: 1 + l * 0.08 }),
  },
  youth_academy: {
    type: 'youth_academy',
    name: 'Youth Academy',
    description: 'Improves the quality of the yearly youth intake.',
    baseCost: 350_000,
    costGrowth: 2.4,
    baseMinutes: 40,
    requires: [{ type: 'training_ground', levelOffset: 1 }],
    effectLabel: (l) => `Youth intake quality +${l * 6}%`,
    effects: (l) => ({ youthQualityBonus: l * 0.06 }),
  },
  scouting: {
    type: 'scouting',
    name: 'Scouting Department',
    description: 'Finds transfer talent: a shortlist of recommended signings, refreshed as you upgrade.',
    baseCost: 220_000,
    costGrowth: 2.3,
    baseMinutes: 25,
    effectLabel: (l) => `${1 + Math.min(l, 4)} scouted transfer target${l === 0 ? '' : 's'}`,
    effects: (l) => ({ scoutingReach: 1 + Math.min(l, 4) }),
  },
  medical_centre: {
    type: 'medical_centre',
    name: 'Medical Centre',
    description: 'Your squad recovers faster between matches with specialized treatment bays.',
    baseCost: 260_000,
    costGrowth: 2.4,
    baseMinutes: 25,
    requires: [{ type: 'training_ground', levelOffset: 1 }],
    effectLabel: (l) =>
      l === 0
        ? '1 Treatment Bay · Standard recovery'
        : `${1 + Math.floor(l / 2)} Treatment Bays · -${l * 8}% match fatigue · -${l * 10}% rest cooldown`,
    effects: (l) => ({
      medicalLevel: l,
      cooldownMultiplier: 1 - l * 0.1,
      fatigueReduction: l * 0.08,
      injuryRiskReduction: l * 0.1,
      injuryDurationReduction: Math.min(l, 3),
      treatmentBays: 1 + Math.floor(l / 2),
      treatmentDiscount: l * 0.08,
      passiveRecoveryRate: 10 + l * 5,
    }),
  },
  staff_house: {
    type: 'staff_house',
    name: 'Staff House',
    description: 'Houses specialist coaches. Higher levels unlock tactical abilities (coming soon).',
    baseCost: 300_000,
    costGrowth: 2.5,
    baseMinutes: 35,
    requires: [{ type: 'training_ground', levelOffset: 1 }],
    effectLabel: (l) => `Coaching level ${l}`,
    effects: (l) => ({ coachingLevel: l }),
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

/** Real minutes it takes to build `targetLevel` of an asset. */
export function upgradeMinutes(type: AssetType, targetLevel: number): number {
  return ASSET_CONFIG[type].baseMinutes * targetLevel;
}
