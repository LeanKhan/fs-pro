import type { CampusBuilding } from '@repo/api-contract';

/** What each campus building is called at each stage of its growth: a stage
 * per Tier (0-5); the Office is the Clubhouse and follows the Clubhouse tier. */
export const STAGES: Record<CampusBuilding, readonly string[]> = {
  office: ['Portakabin Clubhouse', 'Clubhouse', 'Club Offices', 'HQ Tower'],
  stadium_grounds: ['Dirt Pitch', 'Grass Pitch', 'Floodlit Pitch', 'Community Stadium', 'Large Stadium', 'Mega Stadium'],
  club_shop: ['Empty Plot', 'Merch Stall', 'Club Shop', 'Club Store', 'Megastore', 'Flagship Store'],
  cash_vault: ['Empty Plot', 'Cash Box', 'Strongroom', 'Club Vault', 'Bank Vault', 'Treasury'],
  training_ground: ['Empty Plot', 'Practice Field', 'Training Pitch', 'Training Centre', 'Performance Centre', 'Elite Training Campus'],
  youth_academy: ['Empty Plot', 'Youth Tent', 'Academy Yurts', 'Academy House', 'Academy School', 'Elite Academy'],
  medical_centre: ['Empty Plot', 'First Aid Tent', 'Physio Room', 'Medical Centre', 'Sports Clinic', 'Sports Science Hospital'],
};

/** Everything a building's stage can depend on. */
export interface StageContext {
  /** The building's own Tier (facilities only). */
  tier: number;
  /** The Clubhouse tier (1-5): the Office (Clubhouse) grows with it. */
  clubLevel: number;
  staffTier: number;
}

export function stageOf(key: CampusBuilding, ctx: StageContext): number {
  if (key === 'office') return ctx.clubLevel >= 5 ? 3 : ctx.clubLevel >= 3 ? 2 : ctx.clubLevel >= 2 ? 1 : 0;
  return Math.max(0, Math.min(STAGES[key].length - 1, ctx.tier));
}

export const stageName = (key: CampusBuilding, ctx: StageContext) => STAGES[key][stageOf(key, ctx)];

/** For the Office (Clubhouse), which grows with the Clubhouse tier: what it becomes next, and when. */
export function growthHint(key: CampusBuilding, ctx: StageContext): string | null {
  const stage = stageOf(key, ctx);
  const next = STAGES[key][stage + 1];
  if (!next) return null;
  if (key === 'office') return `Becomes ${next} at Clubhouse tier ${[2, 3, 5][stage]}`;
  return null;
}
