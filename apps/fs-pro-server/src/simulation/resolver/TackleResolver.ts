import { IFieldPlayer } from '../../interfaces/Player';
import { getResult } from '../utils/probability';
import { getSimulationConfig } from '../config';

/**
 * Milestone 8 (Resolver Layer) - moved verbatim out of `Decider.ts`'s
 * `getTackleResult`/`getDribbleResult` (see the simulation-engine-
 * isolation plan). Dribble resolution folds in here rather than getting
 * its own file: the tracker's own target structure never listed a
 * separate `DribbleResolver.ts`, and the two are already tightly coupled
 * in `Actions.move()` today - a failed dribble attempt falls straight
 * through into a tackle attempt.
 */
export class TackleResolver {
  public resolveTackle(tackler: IFieldPlayer, ballHolder: IFieldPlayer): boolean {
    const { tacklerPower, ballHolderPower } = getSimulationConfig().tackling.contest;
    return getResult(
      [tackler.Attributes.Tackling, tackler.Attributes.Strength],
      [ballHolder.Attributes.Dribbling, ballHolder.Attributes.Control],
      tacklerPower,
      ballHolderPower
    );
  }

  public resolveDribble(dribbler: IFieldPlayer, opponent: IFieldPlayer): boolean {
    // Previously: chance <= (Dribbling+Speed)/2 - Tackling, with chance
    // drawn uniformly from 0-100. At roughly EQUAL attributes (the common
    // case) that tally is close to 0, and since chance can never be
    // negative, success was only possible in the rare case chance rolled
    // exactly 0 - a genuine 50/50 matchup succeeded well under 5% of the
    // time instead of ~50%. Switched to the same getResult() duel used for
    // every other contest in this file (tackles, shots, passes), which
    // doesn't have that asymmetry.
    // Unlike short passing (70-92% real completion, structurally favored
    // above), dribbling past a defender is a lower-percentage, riskier
    // action even for a good dribbler - real success rates run closer to
    // 40-55%. So this stays a genuinely even-ish duel rather than getting
    // the same passer-favoring treatment: the defender is weighted
    // slightly MORE on skill (80%) than the dribbler (65%), since actual
    // attribute values cluster together the same way passing/Tackling do.
    const contest = getSimulationConfig().dribbling.contest;
    return getResult(
      [
        { v: dribbler.Attributes.Dribbling, p: contest.dribblerDribblingWeight },
        { v: dribbler.Attributes.Speed, p: contest.dribblerSpeedWeight },
      ],
      [opponent.Attributes.Tackling],
      contest.dribblerPower,
      contest.opponentPower
    );
  }
}
