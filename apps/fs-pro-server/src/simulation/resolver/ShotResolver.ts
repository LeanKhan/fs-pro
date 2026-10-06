import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { RandomSource } from '../randomness';
import { shotModel, ShotKind } from './outcomeModel';

export interface ShotResolution {
  onTarget: boolean;
  goal: boolean;
  /** Chance quality of the attempt (see outcomeModel.shotModel) - recorded
   * on the shot event so match stats and analysis can show it. */
  xG: number;
  /** Metres from goal. */
  distance: number;
}

/**
 * Resolves a shot with ONE draw against the shot model: goal, saved or
 * missed. Chance quality (distance, angle, blockers, pressure, clean
 * through) sets the odds, the shooter-vs-keeper skill gap shifts them - so
 * a team that creates better chances scores more, rather than every shot
 * in range being equally dangerous.
 */
export class ShotResolver {
  constructor(private random: RandomSource) {}

  public resolve(
    shooter: IFieldPlayer,
    keeper: IFieldPlayer | undefined,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    kind: ShotKind = 'open-play'
  ): ShotResolution {
    const model = shotModel(shooter, keeper, attackingSide, defendingSide, kind);
    const roll = this.random.next();

    if (roll < model.pGoal) {
      return { onTarget: true, goal: true, xG: model.xG, distance: model.distance };
    }
    const onTarget = roll < model.pGoal + (1 - model.pGoal) * model.pOnTargetIfNoGoal;
    return { onTarget, goal: false, xG: model.xG, distance: model.distance };
  }
}
