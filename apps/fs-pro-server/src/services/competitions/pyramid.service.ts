import { and, count, eq, isNotNull, max } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { competitions } from '../../db/drizzle/schema';
import { parentPod, relegationTargetPod } from './pyramid-config';

/**
 * League-pyramid lookups and the promotion/relegation move planner. Leagues
 * with a non-null `Competitions.Tier` are pyramid leagues; everything else
 * keeps the legacy two-division rules in seasons/season.controller.ts.
 */

const db = () => DrizzleDatabase.getInstance().database;

export interface TierInfo {
  competitionId: string;
  tier: number;
  pod: number;
  countryId: string | null;
  teamsPromoted: number | null;
  teamsRelegated: number | null;
}

export interface LeagueRef {
  id: string;
  name: string;
  code: string;
  tier: number;
  pod: number;
}

/** Null when the competition is not part of the pyramid. */
export async function getTierInfo(competitionId: string): Promise<TierInfo | null> {
  const [row] = await db().select().from(competitions).where(eq(competitions.id, competitionId));
  if (!row || row.Tier == null) return null;
  return {
    competitionId: row.id,
    tier: row.Tier,
    pod: row.Pod ?? 0,
    countryId: row.CountryId ?? null,
    teamsPromoted: row.TeamsPromoted ?? null,
    teamsRelegated: row.TeamsRelegated ?? null,
  };
}

/** Lowest tier (highest Tier number) that exists in a country's pyramid. */
export async function bottomTierOf(countryId: string | null): Promise<number> {
  const [row] = await db()
    .select({ bottom: max(competitions.Tier) })
    .from(competitions)
    .where(
      countryId
        ? and(isNotNull(competitions.Tier), eq(competitions.CountryId, countryId))
        : isNotNull(competitions.Tier)
    );
  return row?.bottom ?? 1;
}

/** Number of leagues in a tier of a country's pyramid. */
async function podCount(tier: number, countryId: string | null): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(competitions)
    .where(
      and(
        eq(competitions.Tier, tier),
        countryId ? eq(competitions.CountryId, countryId) : isNotNull(competitions.Tier)
      )
    );
  return Number(row?.n ?? 0);
}

/** Real pods-per-parent ratio between `tier` and the tier below it (1 when
 * the tier below is empty or narrower). Derived from the data, so countries
 * with different pyramid shapes each work. */
export async function fanoutBelow(tier: number, countryId: string | null): Promise<number> {
  const [here, below] = await Promise.all([podCount(tier, countryId), podCount(tier + 1, countryId)]);
  if (here === 0 || below === 0) return 1;
  return Math.max(1, Math.ceil(below / here));
}

/** The league at (tier, pod) in a country, or null if it does not exist yet. */
export async function findLeague(
  tier: number,
  pod: number,
  countryId: string | null
): Promise<LeagueRef | null> {
  const [row] = await db()
    .select()
    .from(competitions)
    .where(
      and(
        eq(competitions.Tier, tier),
        eq(competitions.Pod, pod),
        countryId ? eq(competitions.CountryId, countryId) : isNotNull(competitions.Tier)
      )
    );
  return row
    ? { id: row.id, name: row.Name, code: row.CompetitionCode, tier, pod }
    : null;
}

export interface PlannedMove {
  clubId: string;
  direction: 'promoted' | 'relegated';
  from: { tier: number; pod: number };
  /** null = the destination league does not exist (caller must decide). */
  to: LeagueRef | null;
  toTier: number;
  toPod: number;
}

/**
 * Where do a finished league's promoted / relegated clubs go? `promoted` and
 * `relegated` are club ids in finishing order (best first for promoted, the
 * order clubs finished for relegated). Pure planning: nothing is written.
 */
export async function planMoves(
  info: TierInfo,
  promoted: string[],
  relegated: string[]
): Promise<PlannedMove[]> {
  const from = { tier: info.tier, pod: info.pod };
  const moves: PlannedMove[] = [];
  // Promotion targets the tier above (its fanout to us), relegation the tier below.
  const fanoutUp = await fanoutBelow(info.tier - 1, info.countryId);
  const fanoutDown = await fanoutBelow(info.tier, info.countryId);

  for (const clubId of promoted) {
    const toTier = info.tier - 1;
    const toPod = parentPod(info.pod, fanoutUp);
    moves.push({
      clubId,
      direction: 'promoted',
      from,
      to: await findLeague(toTier, toPod, info.countryId),
      toTier,
      toPod,
    });
  }
  for (const [i, clubId] of relegated.entries()) {
    const toTier = info.tier + 1;
    const toPod = relegationTargetPod(info.pod, i, fanoutDown);
    moves.push({
      clubId,
      direction: 'relegated',
      from,
      to: await findLeague(toTier, toPod, info.countryId),
      toTier,
      toPod,
    });
  }
  return moves;
}
