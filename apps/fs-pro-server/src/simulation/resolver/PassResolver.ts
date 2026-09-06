import { IFieldPlayer } from '../../interfaces/Player';
import { getResult } from '../utils/probability';

/**
 * Milestone 8 (Resolver Layer) - moved verbatim out of `Decider.ts`'s
 * `getPassResult` (see the simulation-engine-isolation plan). The
 * formulas themselves are byte-identical; only two confirmed-dead bits
 * were dropped during the move: the `luck` parameter (never read in the
 * original body) and a `tally`/`chance` computation that was immediately
 * overwritten by the real `getResult()` call right after it.
 */
export class PassResolver {
  public resolve(
    passer: IFieldPlayer,
    reciever: IFieldPlayer,
    type: string,
    interceptor?: IFieldPlayer
  ): boolean {
    let result = true;

    switch (type) {
      case 'short':
        if (interceptor) {
          // Checked real generated attributes (src/scripts/
          // checkAttributeDistribution.ts): passing-relevant stats and
          // Tackling are both clustered ~65-70 for every position - nearly
          // identical. Any duel formula that weighs them head-on lands
          // close to 50/50 regardless of threshold tuning, but real short
          // passes complete 70-92% of the time even under some pressure -
          // being NEAR the lane isn't the same as actually cutting the
          // pass out. So the interceptor's Tackling is discounted (70%)
          // AND weighted mostly toward luck (20%), while the passer stays
          // skill-dominated (90%) - not just a threshold nudge, an
          // intentional structural bias toward the passer.
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 50 },
              { v: passer.Attributes.Mental, p: 25 },
              { v: reciever.Attributes.Control, p: 25 },
            ],
            [interceptor.Attributes.Tackling * 0.7],
            90,
            20
          );
        } else {
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 75 },
              { v: passer.Attributes.Mental, p: 25 },
            ],
            [30],
            80,
            50
          );
        }
        break;
      case 'long':
        if (interceptor) {
          // Same rebalancing as the short-pass case above, and for the same
          // reason (LongPass/Mental cluster in the same ~65-70 range as
          // Tackling in the real data).
          result = getResult(
            [passer.Attributes.LongPass, passer.Attributes.Mental],
            [interceptor.Attributes.Tackling * 0.7],
            85,
            20
          );
        } else {
          result = getResult(
            [
              { v: passer.Attributes.LongPass, p: 75 },
              { v: passer.Attributes.Mental, p: 25 },
            ],
            [30],
            70,
            50
          );
        }
        break;

      default:
        break;
    }

    return result;
  }
}
