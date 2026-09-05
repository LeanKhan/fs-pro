import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { players, transferLedger } from '../../db/drizzle/schema';
import { PlayerRepositoryFactory } from '../../repositories/PlayerRepositoryFactory';
import { getClubs } from '../clubs/club.service';
import { generatePlayer } from '../../utils/players';
import { pickPlaceholderName } from '../../utils/placeholder-names';
import { pickRandomFromArray } from '../../helpers/misc';
import type { PlayerInterface } from '../../interfaces/Player';

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
): Promise<{ retiredCount: number }> {
  const db = DrizzleDatabase.getInstance().database;

  const active = await db
    .select({ id: players.id, Age: players.Age })
    .from(players)
    .where(eq(players.isRetired, false));

  const retiringIds = active
    .filter((p) => p.Age != null && Math.random() < retirementChanceForAge(p.Age))
    .map((p) => p.id);

  if (retiringIds.length) {
    await getPlayerRepo().updateManyByIds(retiringIds, {
      isRetired: true,
      isSigned: false,
      ClubId: null,
      ClubCode: null,
    } as unknown as Partial<PlayerInterface>);
  }

  console.log(`[player-lifecycle] ${year}: ${retiringIds.length} player(s) retired.`);
  return { retiredCount: retiringIds.length };
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
function generateYouthPlayers(count: number) {
  return Array.from({ length: count }, () => {
    const { firstName, lastName } = pickPlaceholderName();
    return generatePlayer({
      position: pickRandomFromArray(YOUTH_POSITION_POOL),
      firstname: firstName,
      lastname: lastName,
      nationality: pickRandomFromArray(['kev', 'bellean']),
      ageRange: YOUTH_AGE_RANGE,
      attributeRange: YOUTH_ATTRIBUTE_RANGE,
      positionAttributeRange: YOUTH_POSITION_ATTRIBUTE_RANGE,
    });
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

  const allClubs = await getClubs();
  let addedCount = 0;

  for (const club of allClubs) {
    const clubId = club._id as string;
    const current = countByClub.get(clubId) ?? 0;
    if (current >= TARGET_SQUAD_SIZE) continue;

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
      const youngsters = generateYouthPlayers(intakeCount).map(
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
  count: number
) {
  const db = DrizzleDatabase.getInstance().database;

  const recruits = generateYouthPlayers(count).map((generated) => ({
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
    Note: `${created.length} youth player(s) scouted by admin`,
    updatedAt: new Date(),
  });

  return created;
}
