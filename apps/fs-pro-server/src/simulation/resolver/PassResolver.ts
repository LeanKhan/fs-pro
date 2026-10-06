import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { RandomSource } from '../randomness';
import { passModel } from './outcomeModel';

/**
 * Resolves whether a pass arrives, with ONE draw against the pass model:
 * pass type and distance, pressure on passer and receiver, defenders in the
 * lane, the passer's/receiver's/interceptor's attributes and - for through
 * balls - how much space the opponent's defensive line leaves behind it.
 *
 * Every pass can fail, not only ones with a defender standing in the lane:
 * a long ball under pressure goes astray even into open space. Choosing
 * which defender wins a failed pass is Actions.pass()'s job.
 */
export class PassResolver {
  constructor(private random: RandomSource) {}

  public resolve(
    passer: IFieldPlayer,
    receiver: IFieldPlayer,
    type: string,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    interceptor?: IFieldPlayer
  ): boolean {
    const { pComplete } = passModel(passer, receiver, type, attackingSide, defendingSide, interceptor);
    return this.random.next() < pComplete;
  }
}
