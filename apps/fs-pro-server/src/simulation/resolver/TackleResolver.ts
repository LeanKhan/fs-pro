import { IFieldPlayer } from '../../interfaces/Player';
import { RandomSource } from '../randomness';
import { dribbleProbability, tackleProbability } from './outcomeModel';

/**
 * 1v1 duels, each one draw against a logistic skill contest (see
 * outcomeModel.ts) - Tackling/Marking/Strength vs Dribbling/Control/
 * Agility, reduced by fatigue.
 */
export class TackleResolver {
  constructor(private random: RandomSource) {}

  /** True when the tackler wins the ball. */
  public resolveTackle(tackler: IFieldPlayer, ballHolder: IFieldPlayer): boolean {
    return this.random.next() < tackleProbability(tackler, ballHolder);
  }

  /** True when the dribbler beats the defender. */
  public resolveDribble(dribbler: IFieldPlayer, opponent: IFieldPlayer): boolean {
    return this.random.next() < dribbleProbability(dribbler, opponent);
  }
}
