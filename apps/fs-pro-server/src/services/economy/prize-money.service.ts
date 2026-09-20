import { and, eq, like, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, transferLedger } from '../../db/drizzle/schema';
import { getSeasonById } from '../../controllers/seasons/season.service';
import { getCompetitionById } from '../../controllers/competitions/competition.service';
import { getFixtures } from '../../controllers/fixtures/fixture.service';
import { compileStandings } from '../../utils/seasons';

/**
 * Prize money paid to clubs when a season finishes: every participant gets
 * an appearance fee, and the rest scales with how far the club got - league
 * position, or the furthest round reached in a cup / the continental
 * competition - with a bonus for the winner. All figures are placeholder
 * tuning values (a typical club Budget here is ~18M, a top league title
 * ~10M), meant to be adjusted in one place: this file.
 */

/** League prize pot scales down by division; unlisted divisions use the fallback. */
const LEAGUE_DIVISION_SCALE: Record<number, number> = { 1: 1, 2: 0.4 };
const LEAGUE_FALLBACK_SCALE = 0.25;
const LEAGUE_PARTICIPATION = 400_000;
/** Position prize: paid to 1st, falling linearly to 0 for last place. */
const LEAGUE_TOP_POSITION_PRIZE = 4_000_000;
const LEAGUE_CHAMPION_BONUS = 3_000_000;

const CUP_PARTICIPATION = 150_000;
/** Bonus for reaching a knockout round of this many clubs (the Final is 2). */
const CUP_ROUND_BONUS: Record<number, number> = {
  16: 100_000,
  8: 250_000,
  4: 500_000,
  2: 1_000_000,
};
const CUP_WINNER_BONUS = 2_000_000;

const CONTINENTAL_PARTICIPATION = 1_000_000;
const CONTINENTAL_ROUND_BONUS: Record<number, number> = {
  8: 750_000,
  4: 1_500_000,
  2: 3_000_000,
};
const CONTINENTAL_WINNER_BONUS = 6_000_000;

export interface PrizePayout {
  clubId: string;
  amount: number;
  reason: string;
}

/** Bracket size of a knockout stage name ("Round of 16" -> 16, "Final" -> 2). */
function stageSize(stage: string | null | undefined): number | null {
  if (!stage) return null;
  if (stage === 'Final') return 2;
  if (stage === 'Semi-Final') return 4;
  if (stage === 'Quarter-Final') return 8;
  const match = /^Round of (\d+)$/.exec(stage);
  return match ? Number(match[1]) : null;
}

function leaguePayouts(
  standings: ReturnType<typeof compileStandings>,
  division: number
): PrizePayout[] {
  const scale = LEAGUE_DIVISION_SCALE[division] ?? LEAGUE_FALLBACK_SCALE;
  const last = Math.max(1, standings.length - 1);

  return standings.map((row, index) => {
    const position = LEAGUE_TOP_POSITION_PRIZE * (1 - index / last);
    const champion = index === 0 ? LEAGUE_CHAMPION_BONUS : 0;
    const amount = Math.round(scale * (LEAGUE_PARTICIPATION + position + champion));
    return {
      clubId: row.ClubID as string,
      amount,
      reason:
        index === 0
          ? 'league champions'
          : `finished ${index + 1}${ordinalSuffix(index + 1)}`,
    };
  });
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}

/** Cup and continental payouts: appearance fee + the furthest round each club reached. */
function knockoutPayouts(
  fixtures: { HomeTeamId: string; AwayTeamId: string; Stage?: string | null }[],
  winnerId: string | null,
  config: {
    participation: number;
    roundBonus: Record<number, number>;
    winnerBonus: number;
  }
): PrizePayout[] {
  // Smallest bracket size a club appeared in = the furthest round it reached
  // (group-stage fixtures have no size, so those clubs only get the fee).
  const furthest = new Map<string, number | null>();
  for (const f of fixtures) {
    const size = stageSize(f.Stage);
    for (const id of [f.HomeTeamId, f.AwayTeamId]) {
      const current = furthest.get(id);
      if (current === undefined) furthest.set(id, size);
      else if (size !== null && (current === null || size < current)) furthest.set(id, size);
    }
  }

  return [...furthest.entries()].map(([clubId, size]) => {
    let amount = config.participation;
    let reason = 'participation';
    if (size !== null && config.roundBonus[size] !== undefined) {
      amount += config.roundBonus[size];
      reason = size === 2 ? 'reached the final' : `reached the round of ${size}`;
    }
    if (clubId === winnerId) {
      amount += config.winnerBonus;
      reason = 'winners';
    }
    return { clubId, amount, reason };
  });
}

/**
 * Pays out a finished season's prize money and returns what was paid.
 * Idempotent: a club already paid for this SeasonCode (a 'prize' ledger row)
 * is skipped, so calling it twice - or from both the finish button and the
 * tournament engine - never pays twice. Each club is paid in its own
 * transaction (Budget credit + ledger row), like deductWagesForYear.
 *
 * Ledger convention: `BuyerClubId` is the club RECEIVING the prize,
 * `Year` the season's Year label, and `Note` starts with the SeasonCode.
 */
export async function payoutSeasonPrizes(seasonId: string): Promise<PrizePayout[]> {
  const { season, competition, payouts } = await computeSeasonPrizes(seasonId);

  const db = DrizzleDatabase.getInstance().database;
  const paid: PrizePayout[] = [];

  for (const payout of payouts) {
    if (!payout.clubId || payout.amount <= 0) continue;

    const wasPaid = await db.transaction(async (tx) => {
      const already = await tx.query.transferLedger.findFirst({
        where: and(
          eq(transferLedger.Type, 'prize'),
          eq(transferLedger.BuyerClubId, payout.clubId),
          like(transferLedger.Note, `${season.SeasonCode}:%`)
        ),
      });
      if (already) return false;

      await tx
        .update(clubs)
        .set({
          Budget: drizzleSql`coalesce(${clubs.Budget}, 0) + ${payout.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(clubs.id, payout.clubId));

      await tx.insert(transferLedger).values({
        Type: 'prize',
        BuyerClubId: payout.clubId,
        Amount: payout.amount,
        Year: season.Year,
        Note: `${season.SeasonCode}: ${competition.Name} - ${payout.reason}`,
        updatedAt: new Date(),
      });
      return true;
    });

    if (wasPaid) paid.push(payout);
  }

  console.log(`[prize-money] ${season.SeasonCode}: paid ${paid.length} club(s).`);
  return paid;
}

/** What each club would be paid for a season - no writes, so it can be
 * inspected or tested against real data safely. */
export async function computeSeasonPrizes(seasonId: string) {
  const season = await getSeasonById(seasonId);
  if (!season) throw new Error(`Season [${seasonId}] does not exist`);
  const competition = await getCompetitionById(season.CompetitionId as string);
  if (!competition) throw new Error(`Competition for Season [${seasonId}] does not exist`);

  const type = competition.Type?.toLowerCase();
  let payouts: PrizePayout[];

  if (type === 'cup' || type === 'tournament') {
    const fixtures = await getFixtures({ SeasonId: seasonId });
    payouts = knockoutPayouts(fixtures, season.WinnerId ?? null, {
      participation: type === 'cup' ? CUP_PARTICIPATION : CONTINENTAL_PARTICIPATION,
      roundBonus: type === 'cup' ? CUP_ROUND_BONUS : CONTINENTAL_ROUND_BONUS,
      winnerBonus: type === 'cup' ? CUP_WINNER_BONUS : CONTINENTAL_WINNER_BONUS,
    });
  } else {
    payouts = leaguePayouts(compileStandings(season.Standings), competition.Division ?? 0);
  }

  return { season, competition, payouts };
}
