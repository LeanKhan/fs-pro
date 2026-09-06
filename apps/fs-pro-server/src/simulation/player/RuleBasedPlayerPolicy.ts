import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { Decider } from '../state/ImmutableState/Actions/Decider';
import { TeamIntent } from '../team/TeamIntent';
import { PlayerObservation } from './PlayerObservation';
import { PlayerIntent, toPlayerIntent } from './PlayerIntent';
import { PlayerPolicy } from './PlayerPolicy';

/**
 * Milestone 7 - wraps the EXISTING `Decider` instance (passed in, never
 * constructed here) rather than building its own from `teams`/`random`.
 * `Actions.ts` already builds exactly one `Decider` per match, used for
 * both decision-making (`makeDecision`) and every outcome formula
 * (`getPassResult`/`getShotResult`/etc, still called directly by
 * `Actions.ts`, untouched by this milestone) - a second instance would
 * desync the shared seeded-RNG call ordering even though each stays
 * individually deterministic. See the simulation-engine-isolation plan.
 *
 * `observation`/`teamIntent` are accepted (satisfying "player policy
 * receives observation and team intent") but not yet consumed here -
 * `Decider.makeDecision()`'s internals still recompute their own
 * equivalent values (pressure, tempo) directly from `attackingSide`/
 * `defendingSide`. Wiring decision logic to actually read the passed-in
 * observation/intent instead of recomputing is deferred to Milestone 10
 * (Spatial Analyzer) - see this file's own plan note for why forcing
 * that now would risk this pass's "keep existing formulas" guarantee.
 */
export class RuleBasedPlayerPolicy implements PlayerPolicy {
  constructor(private decider: Decider) {}

  public decide(
    player: IFieldPlayer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    observation: PlayerObservation,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    teamIntent: TeamIntent,
    attackingSide: MatchSide,
    defendingSide: MatchSide
  ): PlayerIntent {
    const strategy = this.decider.makeDecision(player, attackingSide, defendingSide);
    return toPlayerIntent(strategy);
  }
}
