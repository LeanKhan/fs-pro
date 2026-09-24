import { eq, sql as drizzleSql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players, transferLedger } from '../../db/drizzle/schema';
import { getPerformance } from '../world/performance.service';
import { JevService, ChoiceAnswer } from './jev.service';
import { formScore } from '../world/club-standing.service';

export type BudgetJustification = 'TITLE_CHALLENGE' | 'SQUAD_DEPTH' | 'REINVEST_PROFITS' | 'PROMOTION_PUSH';

export interface BoardBudgetReport {
  status: 'ACCEPTED' | 'COMPROMISE' | 'REJECTED';
  requestedAmount: number;
  grantedAmount: number;
  newBudget: number;
  boardStatement: string;
  confidence: number;
  financialContext: {
    currentBudget: number;
    netMatchdayProfit: number;
    annualWageBill: number;
    wageToBudgetRatio: number;
  };
  source: 'jev' | 'local';
}

function generateBoardStatement(
  clubName: string,
  status: 'ACCEPTED' | 'COMPROMISE' | 'REJECTED',
  grantedAmount: number,
  requestedAmount: number,
  justification: BudgetJustification,
  financialHealth: string,
  standingDesc: string
): string {
  const grantedStr = `€${grantedAmount.toLocaleString()}`;
  const requestedStr = `€${requestedAmount.toLocaleString()}`;

  if (status === 'ACCEPTED') {
    switch (justification) {
      case 'TITLE_CHALLENGE':
        return `The Board of Directors has fully approved your request for ${grantedStr}. Our current ${standingDesc} and healthy financial standing demonstrate that our sporting ambition warrants serious investment. Deliver silverware to the fans.`;
      case 'REINVEST_PROFITS':
        return `Request approved in full (${grantedStr}). The club's matchday revenues and commercial returns have outperformed projections, and the Board is delighted to reinvest this surplus into strengthening the first team.`;
      case 'PROMOTION_PUSH':
        return `The Board endorses your promotion strategy and grants ${grantedStr}. Reaching the top flight is our collective institutional objective; use these resources decisively in the transfer market.`;
      case 'SQUAD_DEPTH':
      default:
        return `The Board acknowledges the squad demands of our competitive schedule and agrees to release ${grantedStr} to reinforce squad depth and quality.`;
    }
  }

  if (status === 'COMPROMISE') {
    return `While the Board cannot sanction the full ${requestedStr} without exposing the club to unnecessary liquidity risks, we recognize your sporting vision. We have agreed to a compromise grant of ${grantedStr} (${Math.round((grantedAmount / requestedAmount) * 100)}% of request) for squad investment.`;
  }

  // REJECTED
  if (financialHealth === 'OVERLEVERAGED' || financialHealth === 'TIGHT_MARGIN') {
    return `The Board has declined your request for ${requestedStr}. Our projected turnover and existing player wage obligations require strict fiscal discipline. We must rely on player sales or internal academy solutions at this stage.`;
  }

  return `The Board has deliberated and determined that allocating an additional ${requestedStr} is not prudent at this juncture. Continue to maximize results with our current squad before we reassess transfer capital.`;
}

export async function processBoardBudgetRequest(
  clubId: string,
  requestedAmount: number,
  justification: BudgetJustification
): Promise<BoardBudgetReport> {
  const db = DrizzleDatabase.getInstance().database;

  // 1. Fetch club
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) {
    throw new Error('Club not found');
  }

  // 2. Fetch squad & calculate annual wage bill
  const squad = await db.select().from(players).where(eq(players.ClubId, clubId));
  const annualWageBill = squad.reduce((sum, p) => sum + (p.Wage ?? 0), 0);

  // 3. Financial history from club.Finances
  const finances = (club.Finances as Record<string, any>) || {};
  const totalMatchdayRevenue = Number(finances.totalMatchdayRevenue ?? 0);
  const totalMatchdayCosts = Number(finances.totalMatchdayCosts ?? 0);
  const netMatchdayProfit = Math.max(0, totalMatchdayRevenue - totalMatchdayCosts);
  const currentBudget = Number(club.Budget ?? 0);
  const wageToBudgetRatio = currentBudget > 0 ? Number((annualWageBill / currentBudget).toFixed(2)) : 1.0;

  // 4. Standing: the board judges general performance across every
  // competition this year against the target for the club's Level
  // (services/world/performance.service.ts), not a league position.
  let standingDesc = 'competitive campaign';
  let performanceScore = 0;
  let performanceTarget = 0;
  try {
    const perf = await getPerformance(clubId);
    performanceScore = perf.score;
    performanceTarget = perf.expected;
    standingDesc =
      perf.entries === 0
        ? 'lack of competitive entries this year'
        : `performance this year (${Math.round(perf.score * 100)} against a target of ${Math.round(perf.expected * 100)} for Level ${perf.level})`;
  } catch (e) {
    console.warn('Could not read performance for board review:', e);
  }

  // 5. Evaluate financial health category
  let financialHealth = 'MODERATE_SURPLUS';
  if (netMatchdayProfit > requestedAmount || (currentBudget > 10_000_000 && requestedAmount <= currentBudget * 0.3)) {
    financialHealth = 'STRONG_PROFIT';
  } else if (wageToBudgetRatio > 1.2 || (currentBudget < 500_000 && requestedAmount > 2_000_000)) {
    financialHealth = 'OVERLEVERAGED';
  } else if (requestedAmount > currentBudget * 0.8) {
    financialHealth = 'TIGHT_MARGIN';
  }

  const requestedRatioToBudget = currentBudget > 0 ? requestedAmount / currentBudget : 1;

  // 6. Consult Jev Decision Engine as the Board of Directors
  const state = {
    clubName: club.Name,
    currentBudget,
    netMatchdayProfit,
    annualWageBill,
    wageToBudgetRatio,
    requestedAmount,
    requestedRatioToBudget: Number(requestedRatioToBudget.toFixed(2)),
    justification,
    performanceScore,
    performanceTarget,
    performanceVsTarget: Number((performanceScore - performanceTarget).toFixed(3)),
    financialHealth,
    boardConfidence: club.BoardConfidence,
    recentForm: (club.Form?.recent ?? []).slice(0, 5).join(''),
  };

  const jevRes = await JevService.ask(state, {
    boardDecision: {
      type: 'choice',
      instructions:
        'As the Club Board of Directors, determine whether to ACCEPT (grant in full), COMPROMISE (grant partial), or REJECT the manager transfer budget increase request.',
      criteria: {
        ACCEPTED:
          'Club possesses healthy profit margins, strong matchday cashflow, or justifiable title/promotion ambitions for the full requested amount.',
        COMPROMISE:
          'Ambition is welcomed and cashflow is positive, but prudent risk management requires granting a partial budget increase (50% to 75%).',
        REJECTED:
          'Financial headroom is too tight, wage bill is already burdensome, requested amount is excessive relative to turnover, board confidence is low, recent form is poor, or performance does not warrant capital injection.',
      },
    },
    grantPercentage: {
      type: 'choice',
      instructions: 'Select the granted funding percentage.',
      criteria: {
        '100': 'Grant 100% of requested sum',
        '75': 'Grant 75% of requested sum',
        '50': 'Grant 50% of requested sum',
        '0': 'Reject - 0% grant',
      },
    },
  });

  const decisionAnswer = jevRes.answers?.boardDecision as ChoiceAnswer<'ACCEPTED' | 'COMPROMISE' | 'REJECTED'>;
  const grantAnswer = jevRes.answers?.grantPercentage as ChoiceAnswer<'100' | '75' | '50' | '0'>;

  let status: 'ACCEPTED' | 'COMPROMISE' | 'REJECTED' = decisionAnswer?.choice ?? 'COMPROMISE';
  let percentage = Number(grantAnswer?.choice ?? (status === 'ACCEPTED' ? 100 : status === 'COMPROMISE' ? 60 : 0));

  // Fallback sanity check if Jev is unavailable or returned contradictory choices
  if (status === 'ACCEPTED' && percentage === 0) percentage = 100;
  if (status === 'REJECTED') percentage = 0;
  if (percentage > 0 && status === 'REJECTED') status = percentage >= 100 ? 'ACCEPTED' : 'COMPROMISE';

  // Board confidence (moved by results, world/club-standing.service.ts) is a
  // hard ceiling whatever Jev says: a board that has lost faith won't fund.
  const confidenceCap =
    club.BoardConfidence < 20 ? 0 : club.BoardConfidence < 35 ? 50 : formScore(club.Form) < -0.4 ? 75 : 100;
  if (percentage > confidenceCap) {
    percentage = confidenceCap;
    status = percentage === 0 ? 'REJECTED' : 'COMPROMISE';
  }
  const lostFaith = confidenceCap === 0;

  const grantedAmount = Math.round((requestedAmount * percentage) / 100);
  const newBudget = currentBudget + grantedAmount;
  const confidence = Math.round((decisionAnswer?.confidence ?? 0.88) * 100);

  const boardStatement = lostFaith
    ? `The Board has declined your request for €${requestedAmount.toLocaleString()}. Confidence in the current direction is at a low ebb after recent results; there will be no further investment until performances improve.`
    : generateBoardStatement(
        club.Name,
        status,
        grantedAmount,
        requestedAmount,
        justification,
        financialHealth,
        standingDesc
      );

  // 7. If funds were granted, execute database atomic update & ledger entry
  if (grantedAmount > 0) {
    // Record in transfer ledger
    await db.insert(transferLedger).values({
      Type: 'board_grant',
      BuyerClubId: clubId,
      Amount: grantedAmount,
      Note: `Board Budget Grant (${status}): ${boardStatement.slice(0, 200)}`,
      updatedAt: new Date(),
    });

    // Update club budget and record request in finances
    const updatedFinances = {
      ...finances,
      lastBudgetGrant: {
        date: new Date(),
        status,
        requestedAmount,
        grantedAmount,
        justification,
      },
    };

    await db
      .update(clubs)
      .set({
        Budget: drizzleSql`coalesce(${clubs.Budget}, 0) + ${grantedAmount}`,
        Finances: updatedFinances,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, clubId));
  }

  return {
    status,
    requestedAmount,
    grantedAmount,
    newBudget,
    boardStatement,
    confidence,
    financialContext: {
      currentBudget,
      netMatchdayProfit,
      annualWageBill,
      wageToBudgetRatio,
    },
    source: jevRes.source ?? 'jev',
  };
}
