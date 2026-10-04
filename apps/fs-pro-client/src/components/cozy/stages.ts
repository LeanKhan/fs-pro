import type { CampusBuilding } from '@repo/api-contract';

/** What each campus building is called at each stage of its growth. Facilities
 * have a stage per Tier (0-5); the Office follows Club Level and the Dugout
 * the Staff House Tier, since neither has a Tier of its own. */
export const STAGES: Record<CampusBuilding, readonly string[]> = {
  stadium_grounds: ['Dirt Pitch', 'Grass Pitch', 'Floodlit Pitch', 'Community Stadium', 'Large Stadium', 'Mega Stadium'],
  stands: ['Empty Plot', 'Ticket Booth', 'Ticket Office', 'Box Office & Shop', 'Fan Zone', 'Fan Plaza'],
  training_ground: ['Empty Plot', 'Practice Field', 'Training Pitch', 'Training Centre', 'Performance Centre', 'Elite Training Campus'],
  youth_academy: ['Empty Plot', 'Youth Tent', 'Academy Yurts', 'Academy House', 'Academy School', 'Elite Academy'],
  medical_centre: ['Empty Plot', 'First Aid Tent', 'Physio Room', 'Medical Centre', 'Sports Clinic', 'Sports Science Hospital'],
  scouting: ['Empty Plot', 'Lookout Post', 'Scout Tower', 'Scouting Office', 'Analytics Hub', 'Global Scouting Network'],
  staff_house: ['Empty Plot', 'Staff Hut', 'Staff Cottage', 'Staff House', 'Coaching Lodge', 'Coaching HQ'],
  office: ['Portakabin', 'Clubhouse', 'Club Offices', 'HQ Tower'],
  dugout: ['Touchline Bench', 'Dugout', 'Technical Area'],
};

/** Everything a building's stage can depend on. */
export interface StageContext {
  /** The building's own Tier (facilities only). */
  tier: number;
  clubLevel: number;
  staffTier: number;
}

export function stageOf(key: CampusBuilding, ctx: StageContext): number {
  if (key === 'office') return ctx.clubLevel >= 10 ? 3 : ctx.clubLevel >= 6 ? 2 : ctx.clubLevel >= 3 ? 1 : 0;
  if (key === 'dugout') return ctx.staffTier >= 4 ? 2 : ctx.staffTier >= 2 ? 1 : 0;
  return Math.max(0, Math.min(STAGES[key].length - 1, ctx.tier));
}

export const stageName = (key: CampusBuilding, ctx: StageContext) => STAGES[key][stageOf(key, ctx)];

/** For the Office and Dugout, which grow with something else: what they become next, and when. */
export function growthHint(key: CampusBuilding, ctx: StageContext): string | null {
  const stage = stageOf(key, ctx);
  const next = STAGES[key][stage + 1];
  if (!next) return null;
  if (key === 'office') return `Becomes ${next} at Club Level ${[3, 6, 10][stage]}`;
  if (key === 'dugout') return `Becomes ${next} when the Staff House reaches Tier ${[2, 4][stage]}`;
  return null;
}
