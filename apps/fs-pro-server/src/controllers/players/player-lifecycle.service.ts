import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { players, transferLedger } from '../../db/drizzle/schema';
import { PlayerRepositoryFactory } from '../../repositories/PlayerRepositoryFactory';
import { getClubs } from '../clubs/club.service';
import { generatePlayer } from '../../utils/players';
import { pickPlaceholderName } from '../../utils/placeholder-names';
import { pickRandomFromArray } from '../../helpers/misc';
import { nationalityIdForCulture } from '../../services/nationality';
import type { PlayerInterface } from '../../interfaces/Player';
import { getAssetEffects } from '../../services/facilities/facilities.service';

let playerRepo: ReturnType<typeof PlayerRepositoryFactory.create> | null = null;
function getPlayerRepo() {
  if (!playerRepo) playerRepo = PlayerRepositoryFactory.create();
  return playerRepo;
}

/**
 * Age -> retirement probability [0,1], one entry per Age. Placeholder
 * game-balance numbers (flag for sign-off, same tuning-constant discipline
 * as WAGE_RATIO in utils/players.ts and TARGET_SQUAD_SIZE below): a small
 * chance from 33, rising through the late 30s, effectively guaranteed by
 * the low 40s. Ages below 33 never retire (0); ages at/after 42 are
 * treated as guaranteed (1).
 */
export const RETIREMENT_CHANCE_BY_AGE: Record<number, number> = {
  33: 0.03,
  34: 0.05,
  35: 0.08,
  36: 0.13,
  37: 0.2,
  38: 0.3,
  39: 0.45,
  40: 0.65,
  41: 0.85,
  42: 1.0,
};

export function retirementChanceForAge(age: number): number {
  if (age >= 42) return 1;
  return RETIREMENT_CHANCE_BY_AGE[age] ?? 0;
}

/** A player who retired at the end of a season cycle. */
export interface RetiredPlayerSummary {
  playerId: string;
  name: string;
  age: number | null;
  position: string | null;
  rating: number | null;
  /** Club they left, captured before their club ties are cleared. */
  clubCode: string | null;
}

/**
 * Rolls every currently-active (isRetired:false) Player's age-based
 * retirement chance for `year` and, for every roll that hits, marks them
 * retired and clears their club ties - the exact same field set a normal
 * "release from club" write already uses (club.router.ts's
 * removePlayerFromClub -> player.service.ts's toggleSigned(...,null,null)),
 * plus isRetired:true. Called once per year from calendar.router.ts's
 * endSeasonCycle, AFTER updateAllPlayerDetailsForYear (so `Age` here is
 * already this year's post-increment value - a player turning 40 this
 * cycle is evaluated at 40, not 39) and AFTER deductWagesForYear (so a
 * retiring player's final year of wages still gets charged to their
 * outgoing club - they were on the books nearly the whole year). Runs
 * BEFORE runYouthIntakeForYear/refreshAllClubsRatings.
 *
 * Applies regardless of isSigned - an un-retired free agent would
 * otherwise clutter the transfer market indefinitely.
 *
 * Naturally idempotent for anyone already retired (the isRetired:false
 * scan below can't re-select them). A second same-year call would still
 * re-roll *survivors* against this year's Age a second time - a narrower
 * instance of the same pre-existing endSeasonCycle non-idempotency
 * updateAllPlayerDetailsForYear's Age increment already has (see
 * deductWagesForYear's own doc comment on this), not something this
 * function alone can or should try to close.
 */
export async function retireEligiblePlayersForYear(
  year: string
): Promise<{ retiredCount: number; retired: RetiredPlayerSummary[] }> {
  const db = DrizzleDatabase.getInstance().database;

  const active = await db
    .select({
      id: players.id,
      Age: players.Age,
      FirstName: players.FirstName,
      LastName: players.LastName,
      Position: players.Position,
      Rating: players.Rating,
      ClubCode: players.ClubCode,
    })
    .from(players)
    .where(eq(players.isRetired, false));

  const rolled = active.filter(
    (p) => p.Age != null && Math.random() < retirementChanceForAge(p.Age)
  );

  // A club must never lose its last goalkeeper - the match engine can't
  // run without one (Referee.handleShot has no keeper to resolve against).
  // Spare the best-rated retiring GK of any club that would be left with none.
  const remainingGKsByClub = new Map<string, number>();
  for (const p of active) {
    if (p.Position === 'GK' && p.ClubCode) {
      remainingGKsByClub.set(
        p.ClubCode,
        (remainingGKsByClub.get(p.ClubCode) ?? 0) + 1
      );
    }
  }
  const retiring: typeof rolled = [];
  for (const p of [...rolled].sort((a, b) => (a.Rating ?? 0) - (b.Rating ?? 0))) {
    if (p.Position === 'GK' && p.ClubCode) {
      const left = remainingGKsByClub.get(p.ClubCode) ?? 0;
      if (left <= 1) continue;
      remainingGKsByClub.set(p.ClubCode, left - 1);
    }
    retiring.push(p);
  }
  const retiringIds = retiring.map((p) => p.id);

  if (retiringIds.length) {
    await getPlayerRepo().updateManyByIds(retiringIds, {
      isRetired: true,
      isSigned: false,
      ClubId: null,
      ClubCode: null,
    } as unknown as Partial<PlayerInterface>);
  }

  console.log(`[player-lifecycle] ${year}: ${retiringIds.length} player(s) retired.`);
  return {
    retiredCount: retiringIds.length,
    // Captured before the club ties were cleared above, for the season report.
    retired: retiring.map((p) => ({
      playerId: p.id,
      name: `${p.FirstName} ${p.LastName}`,
      age: p.Age,
      position: p.Position,
      rating: p.Rating,
      clubCode: p.ClubCode,
    })),
  };
}

/** 11 starters + BENCH_SIZE (7, see classes/MatchSide.ts) - the "useful
 * matchday squad size" already established via the Substitutions feature,
 * reused here as the youth-intake gate. Placeholder/tunable like every
 * other constant in this file. */
export const TARGET_SQUAD_SIZE = 18;

/** randomBetween's exclusive-max convention yields 16-18 inclusive -
 * distinctly younger than generatePlayer()'s generic [18,30). */
export const YOUTH_AGE_RANGE: [number, number] = [16, 19];
/** Distinctly lower than the generic [20,60) range - a raw prospect, not a
 * ready first-teamer. Real growth happens organically afterward via the
 * existing end-of-year newAttributeRatings() progression. */
export const YOUTH_ATTRIBUTE_RANGE: [number, number] = [10, 35];
/** Still elevated (their specialty), but far below the adult flat 64. */
export const YOUTH_POSITION_ATTRIBUTE_RANGE: [number, number] = [30, 45];

/** Weighted position pool (~9% GK / 27% DEF / 36% MID / 27% ATT) -
 * approximates a realistic squad shape without being club-need-aware
 * (explicitly out of scope this pass). */
const YOUTH_POSITION_POOL = [
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'MID',
  'ATT',
  'ATT',
  'ATT',
];

/** Generates `count` raw youth Player rows (placeholder-name, low-attribute,
 * age 16-18) - not yet inserted, not yet tied to any Club. Shared recipe
 * between the automatic once-per-year runYouthIntakeForYear and the
 * on-demand admin recruitYouthPlayersForClub below - same generation logic,
 * different insertion/guard rules around it. */
/** Shifts a [min, max] range up by `bonus` (both ends, capped at 99 - the
 * game's attribute ceiling elsewhere) - used to make a better Youth Academy
 * produce measurably better intake, not just more of them. */
function shiftRange(range: [number, number], bonus: number): [number, number] {
  if (!bonus) return range;
  return [Math.min(range[0] + bonus, 99), Math.min(range[1] + bonus, 99)];
}

async function generateYouthPlayers(
  count: number,
  forceGK = false,
  /** Youth Academy facility bonus (0 at Level 0) - see
   * asset-config.ts's `youth_academy.effects`. Shifts the generated
   * attribute ranges up; 0 leaves generation exactly as before. */
  qualityBonus = 0
) {
  const cultures = ['kev', 'bellean'];
  const nationalityIds = new Map(
    await Promise.all(
      cultures.map(
        async (c) => [c, await nationalityIdForCulture(c)] as [string, string]
      )
    )
  );
  // qualityBonus (0-0.3ish) scaled onto the attribute point ranges, not used
  // directly as points - keeps the shift modest without a second tuning knob.
  const pointBonus = Math.round(qualityBonus * 40);
  return Array.from({ length: count }, (_, i) => {
    const { firstName, lastName } = pickPlaceholderName();
    const culture = pickRandomFromArray(cultures);
    return {
      ...generatePlayer({
        position:
          forceGK && i === 0 ? 'GK' : pickRandomFromArray(YOUTH_POSITION_POOL),
        firstname: firstName,
        lastname: lastName,
        nationality: culture,
        nationalityId: nationalityIds.get(culture),
        ageRange: YOUTH_AGE_RANGE,
        attributeRange: shiftRange(YOUTH_ATTRIBUTE_RANGE, pointBonus),
        positionAttributeRange: shiftRange(YOUTH_POSITION_ATTRIBUTE_RANGE, pointBonus),
      }),
      isYouth: true,
    };
  });
}

/**
 * For every Club whose current active (isSigned:true, isRetired:false)
 * roster is below TARGET_SQUAD_SIZE, generates 1-2 youth Players
 * (placeholder-name, low-attribute, age 16-18) and adds them DIRECTLY to
 * that Club's roster (isSigned:true, ClubId/ClubCode set immediately - no
 * separate free-agent sign step, per locked scope). Clubs already at/above
 * target get none. Called once per year from calendar.router.ts's
 * endSeasonCycle, AFTER retireEligiblePlayersForYear (so a Club that lost
 * players to retirement THIS SAME year is evaluated against its
 * post-retirement roster size, not a stale pre-retirement one) and BEFORE
 * refreshAllClubsRatings.
 *
 * Guarded per-club-per-year via a TransferLedger existence check
 * (Type:'youth_intake', BuyerClubId, Year) - the exact same double-
 * invocation guard deductWagesForYear already established. Unlike
 * retirement, this genuinely needs the guard: a re-run could otherwise
 * push an already-topped-up Club over target a second time (retirement's
 * isRetired:true is monotonic/self-guarding; a roster count is not).
 */
export async function runYouthIntakeForYear(
  year: string
): Promise<{ addedCount: number }> {
  const db = DrizzleDatabase.getInstance().database;

  const rosterCounts = await db
    .select({ ClubId: players.ClubId, count: drizzleSql<number>`count(*)` })
    .from(players)
    .where(and(eq(players.isSigned, true), eq(players.isRetired, false)))
    .groupBy(players.ClubId);
  const countByClub = new Map(
    rosterCounts.map((r) => [r.ClubId, Number(r.count)])
  );

  // Clubs with no active goalkeeper get topped up regardless of roster
  // size, with a guaranteed GK youngster.
  const gkRows = await db
    .select({ ClubId: players.ClubId })
    .from(players)
    .where(
      and(
        eq(players.isSigned, true),
        eq(players.isRetired, false),
        eq(players.Position, 'GK')
      )
    )
    .groupBy(players.ClubId);
  const clubsWithGK = new Set(gkRows.map((r) => r.ClubId));

  const allClubs = await getClubs();
  let addedCount = 0;

  for (const club of allClubs) {
    const clubId = club._id as string;
    const current = countByClub.get(clubId) ?? 0;
    const needsGK = !clubsWithGK.has(clubId);
    if (current >= TARGET_SQUAD_SIZE && !needsGK) continue;

    await db.transaction(async (tx) => {
      const already = await tx.query.transferLedger.findFirst({
        where: and(
          eq(transferLedger.Type, 'youth_intake'),
          eq(transferLedger.BuyerClubId, clubId),
          eq(transferLedger.Year, year)
        ),
      });
      if (already) return;

      const intakeCount = pickRandomFromArray([1, 1, 2]);
      const qualityBonus = (await getAssetEffects(clubId)).youthQualityBonus ?? 0;
      const youngsters = (await generateYouthPlayers(intakeCount, needsGK, qualityBonus)).map(
        (generated) => ({
          ...generated,
          isSigned: true,
          ClubId: clubId,
          ClubCode: club.ClubCode,
        })
      );

      // Raw tx.insert(), not the repository - same reason
      // transfer.service.ts's executePurchase writes players/transferLedger
      // via tx directly: the repository is bound to the singleton db, not
      // this transaction, so calling it here would autocommit outside the
      // atomic guard-check-then-write.
      await tx
        .insert(players)
        .values(youngsters.map((p) => ({ ...p, updatedAt: new Date() })));
      addedCount += youngsters.length;

      await tx.insert(transferLedger).values({
        Type: 'youth_intake',
        BuyerClubId: clubId,
        Amount: 0,
        Year: year,
        Note: `${youngsters.length} youth player(s) added`,
        updatedAt: new Date(),
      });
    });
  }

  console.log(`[player-lifecycle] ${year}: ${addedCount} youth player(s) added.`);
  return { addedCount };
}

/** Max youth players an admin can scout for a Club in one action - a
 * sanity cap on the request body, not a game-balance constant like
 * TARGET_SQUAD_SIZE. */
export const MAX_ADMIN_YOUTH_RECRUITS = 3;

/**
 * On-demand admin action (NOT the automatic yearly system above): generate
 * `count` youth Players right now and add them directly to `club`'s
 * academy roster. Deliberately has none of runYouthIntakeForYear's guards -
 * no TARGET_SQUAD_SIZE gate, no once-per-year check - because this is an
 * explicit admin decision to scout for a specific Club, not the automatic
 * per-year balancer. Uses the repository's normal `create()` (not a raw
 * tx.insert) since there's no atomic guard-check-then-write to protect
 * here, just `count` (1-3) independent inserts.
 *
 * Recorded under TransferLedger Type 'youth_scouted', NOT 'youth_intake' -
 * runYouthIntakeForYear's per-club-per-year guard filters specifically on
 * 'youth_intake', so using a distinct Type keeps the two systems fully
 * independent: an admin can scout freely without silently suppressing (or
 * double-counting against) that Club's automatic yearly top-up.
 */
export async function recruitYouthPlayersForClub(
  club: { _id: string; ClubCode: string },
  count: number,
  opts: { forceGK?: boolean; note?: string } = {}
) {
  const db = DrizzleDatabase.getInstance().database;

  const qualityBonus = (await getAssetEffects(club._id)).youthQualityBonus ?? 0;
  const recruits = (await generateYouthPlayers(count, opts.forceGK, qualityBonus)).map((generated) => ({
    ...generated,
    isSigned: true,
    ClubId: club._id,
    ClubCode: club.ClubCode,
  }));

  const created = await Promise.all(
    recruits.map((data) =>
      getPlayerRepo().create(data as unknown as Partial<PlayerInterface>)
    )
  );

  await db.insert(transferLedger).values({
    Type: 'youth_scouted',
    BuyerClubId: club._id,
    Amount: 0,
    Note: opts.note ?? `${created.length} youth player(s) scouted by admin`,
    updatedAt: new Date(),
  });

  return created;
}
