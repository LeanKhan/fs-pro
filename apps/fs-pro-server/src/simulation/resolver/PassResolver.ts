import { IFieldPlayer } from '../../interfaces/Player';
import { getResult } from '../utils/probability';

/**
 * Milestone 8 (Resolver Layer) - moved verbatim out of `Decider.ts`'s
 * `getPassResult` (see the simulation-engine-isolation plan). The 'short'/
 * 'long' formulas themselves are byte-identical to the original; only two
 * confirmed-dead bits were dropped during the move: the `luck` parameter
 * (never read in the original body) and a `tally`/`chance` computation
 * that was immediately overwritten by the real `getResult()` call right
 * after it.
 *
 * Milestone 13 (Passing Options And Decision Evaluation) added 'backward'/
 * 'through'/'wide' - before this, any type this switch didn't recognize
 * fell to `default: break`, leaving `result` at its initial `true` and
 * skipping the dice roll entirely. That was harmless while 'pass to post'
 * was the only such type (a deliberate near-certain backpass), but
 * Milestone 13's new candidate-scored pass types needed their own real
 * resolution - a through ball should NOT be risk-free. Each is modelled
 * as a variation on the existing 'short'/'long' formulas (same
 * `getResult()` mechanism, adjusted weights), not new physics:
 * 'backward' is safer than 'short' (a lay-off under less pressure than a
 * forward pass into a marked teammate), 'through' is riskier than 'long'
 * (threading a ball into space the defense is actively protecting), and
 * 'wide' sits between 'short' and 'long' (a flank pass, moderate distance,
 * moderate risk).
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
      case 'backward':
        if (interceptor) {
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 50 },
              { v: passer.Attributes.Mental, p: 25 },
              { v: reciever.Attributes.Control, p: 25 },
            ],
            [interceptor.Attributes.Tackling * 0.6],
            92,
            15
          );
        } else {
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 75 },
              { v: passer.Attributes.Mental, p: 25 },
            ],
            [20],
            85,
            60
          );
        }
        break;
      case 'wide':
        if (interceptor) {
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 35 },
              { v: passer.Attributes.LongPass, p: 35 },
              { v: passer.Attributes.Mental, p: 30 },
            ],
            [interceptor.Attributes.Tackling * 0.7],
            87,
            20
          );
        } else {
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 50 },
              { v: passer.Attributes.LongPass, p: 25 },
              { v: passer.Attributes.Mental, p: 25 },
            ],
            [30],
            75,
            50
          );
        }
        break;
      case 'through':
        if (interceptor) {
          result = getResult(
            [passer.Attributes.LongPass, passer.Attributes.Mental],
            [interceptor.Attributes.Tackling * 0.85],
            75,
            30
          );
        } else {
          result = getResult(
            [
              { v: passer.Attributes.LongPass, p: 60 },
              { v: passer.Attributes.Mental, p: 40 },
            ],
            [40],
            60,
            55
          );
        }
        break;
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
