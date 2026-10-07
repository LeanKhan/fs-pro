import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players } from '../../db/drizzle/schema';

/**
 * A club with no saved team sheet gets one: the best fit players for a
 * Balanced 4-3-3, in the slot order the team sheet uses (GK, LB, CB, CB, RB,
 * CM, CDM, CM, LW, ST, RW), and a 7-man bench. New clubs can press PLAY
 * without visiting the team sheet first (docs/CORE-LOOP.md). A saved lineup
 * is never touched.
 */

const db = () => DrizzleDatabase.getInstance().database;

const SLOTS_433 = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] as const;
const BENCH_SIZE = 7;

export async function ensureDefaultLineup(clubId: string): Promise<boolean> {
  const [club] = await db().select({ lineup: clubs.Lineup, tactic: clubs.Tactic }).from(clubs).where(eq(clubs.id, clubId));
  if (!club || club.lineup?.startingXI?.length) return false;

  const squad = await db()
    .select({ id: players.id, pos: players.Position, rating: players.Rating, injury: players.Injury })
    .from(players)
    .where(and(eq(players.ClubId, clubId), eq(players.isSigned, true), eq(players.isRetired, false)));
  if (squad.length < 11) return false;

  const fit = squad
    .filter((p) => !(Number(p.injury?.daysRemaining) > 0))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const pool = fit.length >= 11 ? fit : [...squad].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const used = new Set<string>();
  const take = (pos?: string) => {
    const p = pool.find((x) => !used.has(x.id) && (!pos || x.pos === pos));
    if (p) used.add(p.id);
    return p?.id;
  };
  const startingXI = SLOTS_433.map((pos) => take(pos) ?? take()).filter((id): id is string => !!id);
  const bench: string[] = [];
  while (bench.length < BENCH_SIZE) {
    const id = take();
    if (!id) break;
    bench.push(id);
  }

  // Only fill it if it's still empty (a save from the team sheet wins a race).
  const updated = await db()
    .update(clubs)
    .set({
      Lineup: { startingXI, bench },
      Tactic: club.tactic ?? { formationName: '433', styleName: 'Balanced' },
      updatedAt: new Date(),
    })
    .where(and(eq(clubs.id, clubId), sql`coalesce(jsonb_array_length(${clubs.Lineup}->'startingXI'), 0) = 0`))
    .returning({ id: clubs.id });
  return updated.length > 0;
}
