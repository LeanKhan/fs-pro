import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs } from '../../db/drizzle/schema';
import { getAssetEffects } from '../facilities/facilities.service';
import { loadPlayers } from './transfer-market.service';

/**
 * Scouting Department facility feature: a shortlist of AI-recommended
 * transfer targets, refreshed on every read (no stored state - cheap enough
 * to recompute, and always reflects the current market). Length is gated by
 * the club's Scouting level (`scoutingReach`, 1 at Level 0 up to 5 at
 * Level 4+) - see asset-config.ts. This is separate from
 * transfer-scout.service.ts's `scoutPlayerTransfer`, which stays an
 * on-demand deep report for a player you've already picked from here (or
 * anywhere else).
 */

export interface ScoutedTarget {
  id: string;
  name: string;
  position: string | null;
  rating: number;
  value: number;
  isListed: boolean;
  askingPrice: number | null;
}

/** Simple "value for money" ranking: best rating per unit of value, so the
 * shortlist favours undervalued talent over just the highest-rated players
 * a club could never afford. */
function scoreOf(rating: number, value: number): number {
  return rating / (value + 1);
}

export async function getScoutedShortlist(clubId: string): Promise<ScoutedTarget[]> {
  const [club] = await DrizzleDatabase.getInstance().database
    .select({ id: clubs.id })
    .from(clubs)
    .where(eq(clubs.id, clubId));
  if (!club) throw new Error('Club not found');

  const reach = (await getAssetEffects(clubId)).scoutingReach ?? 1;
  const { byClub, freeAgents } = await loadPlayers();

  const candidates = [
    ...freeAgents,
    ...[...byClub.entries()]
      .filter(([id]) => id !== clubId)
      .flatMap(([, roster]) => roster.filter((p) => p.isTransferListed)),
  ];

  return candidates
    .sort((a, b) => scoreOf(b.Rating, b.Value) - scoreOf(a.Rating, a.Value))
    .slice(0, reach)
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.Position,
      rating: p.Rating,
      value: p.Value,
      isListed: !!p.isTransferListed,
      askingPrice: p.AskingPrice ?? null,
    }));
}
