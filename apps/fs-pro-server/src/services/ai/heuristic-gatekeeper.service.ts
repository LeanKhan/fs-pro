import { JevService, ChoiceAnswer, ScoreAnswer, NoulAnswer } from './jev.service';

export interface GatekeeperResult<T> {
  resolvedBy: 'heuristic' | 'jev';
  decision: T;
  confidence?: number;
}

export class HeuristicGatekeeperService {
  /**
   * Evaluates halftime tactical adjustments for an AI manager.
   * If game is proceeding normally, keeps tactic without calling Jev.
   * Only escalates to Jev when team is facing an urgent crisis (trailing by 2+ or down a man).
   */
  public static async evaluateHalftimeTactic(params: {
    minute: number;
    teamScore: number;
    opponentScore: number;
    hasRedCard: boolean;
    currentStyle: string;
  }): Promise<GatekeeperResult<string>> {
    const { teamScore, opponentScore, hasRedCard, currentStyle } = params;
    const goalDiff = teamScore - opponentScore;

    // 1. Deterministic Heuristic: Leading or drawing without a red card -> Maintain
    if (goalDiff >= 0 && !hasRedCard) {
      return {
        resolvedBy: 'heuristic',
        decision: 'maintain',
      };
    }

    // 2. Trailing by 1 goal late in match without a red card -> Small attacking nudge
    if (goalDiff === -1 && !hasRedCard) {
      return {
        resolvedBy: 'heuristic',
        decision: 'high-press',
      };
    }

    // 3. Ambiguous / Crisis: Trailing by 2+ OR playing with 10 men -> Escalate to Jev
    const response = await JevService.ask(
      {
        goalDiff,
        hasRedCard,
        currentStyle,
      },
      {
        tacticalShift: {
          type: 'choice',
          instructions: 'What tactical adjustment should the manager make given the crisis?',
          criteria: {
            maintain: 'Keep current shape and play through the deficit',
            'low-block': 'Compact into low block to prevent goal differential blowout',
            'high-press': 'Overload attack and press high despite risks',
          },
        },
      }
    );

    const answer = response.answers.tacticalShift as ChoiceAnswer;
    return {
      resolvedBy: 'jev',
      decision: answer?.choice ?? 'maintain',
      confidence: answer?.confidence,
    };
  }

  /**
   * Evaluates an incoming transfer offer for an AI club.
   * Auto-rejects lowballs (< 75% Value), auto-accepts huge overpays (> 160% Value on non-stars),
   * and escalates realistic offers to Jev.
   */
  public static async evaluateTransferOffer(params: {
    playerValue: number;
    offerAmount: number;
    playerRating: number;
    squadSize: number;
  }): Promise<GatekeeperResult<'accept' | 'reject' | 'negotiate'>> {
    const { playerValue, offerAmount, squadSize } = params;
    const ratio = playerValue > 0 ? offerAmount / playerValue : 1;

    // 1. Can't sell if squad is too small
    if (squadSize <= 13) {
      return {
        resolvedBy: 'heuristic',
        decision: 'reject',
      };
    }

    // 2. Low-ball bid (< 75% of market value) -> Auto-reject
    if (ratio < 0.75) {
      return {
        resolvedBy: 'heuristic',
        decision: 'reject',
      };
    }

    // 3. Huge overpay (>= 160% of market value) -> Auto-accept
    if (ratio >= 1.6) {
      return {
        resolvedBy: 'heuristic',
        decision: 'accept',
      };
    }

    // 4. Ambiguous (75% - 159%) -> Escalate to Jev
    const response = await JevService.ask(
      {
        playerValue,
        offerAmount,
        ratio,
        squadSize,
      },
      {
        offerVerdict: {
          type: 'choice',
          instructions: 'Should the club accept this transfer offer, negotiate for more, or reject?',
          criteria: {
            accept: 'Accept the offer at current price',
            negotiate: 'Demand a higher transfer fee',
            reject: 'Reject the offer and keep the player',
          },
        },
      }
    );

    const answer = response.answers.offerVerdict as ChoiceAnswer<'accept' | 'negotiate' | 'reject'>;
    return {
      resolvedBy: 'jev',
      decision: answer?.choice ?? 'negotiate',
      confidence: answer?.confidence,
    };
  }

  /**
   * Evaluates whether an owner should sack the manager.
   * Auto-backs winning/meeting target managers; escalates severe underperformance to Jev.
   */
  public static async evaluateManagerJobSecurity(params: {
    targetPosition: number;
    currentPosition: number;
    gamesWithoutWin: number;
    fanApproval: number;
  }): Promise<GatekeeperResult<'back' | 'warn' | 'sack'>> {
    const { targetPosition, currentPosition, gamesWithoutWin } = params;
    const posDiff = currentPosition - targetPosition;

    // 1. Meeting or exceeding targets -> 100% Back
    if (posDiff <= 0 && gamesWithoutWin < 4) {
      return {
        resolvedBy: 'heuristic',
        decision: 'back',
      };
    }

    // 2. Catastrophic crisis (8+ games without win AND 8+ places below target) -> Auto-sack
    if (gamesWithoutWin >= 8 && posDiff >= 8) {
      return {
        resolvedBy: 'heuristic',
        decision: 'sack',
      };
    }

    // 3. Borderline / Tension -> Escalate to Jev
    const response = await JevService.ask(
      {
        targetPosition,
        currentPosition,
        gamesWithoutWin,
        fanApproval: params.fanApproval,
      },
      {
        boardAction: {
          type: 'choice',
          instructions: 'What action should the board take regarding the manager?',
          criteria: {
            back: 'Give the manager more time and public backing',
            warn: 'Issue a formal warning and ultimatum',
            sack: 'Terminate the manager contract immediately',
          },
        },
      }
    );

    const answer = response.answers.boardAction as ChoiceAnswer<'back' | 'warn' | 'sack'>;
    return {
      resolvedBy: 'jev',
      decision: answer?.choice ?? 'back',
      confidence: answer?.confidence,
    };
  }
}
