import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { Decider } from '../state/ImmutableState/Actions/Decider';
import { TeamIntent } from '../team/TeamIntent';
import { PlayerObservation } from './PlayerObservation';
import { PlayerIntent, toPlayerIntent } from './PlayerIntent';
import { PlayerPolicy } from './PlayerPolicy';
import { PlayerTendencies } from './PlayerRole';

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
 * `observation`/`tendencies` are accepted here but not consumed BY THIS
 * CLASS directly - `Decider.makeDecision()` reads pressure/lane facts via
 * Milestone 10's shared `spatial/` functions (the same ones `observation`
 * was built from) and derives its own `PlayerTendencies` via `PlayerRole.
 * deriveTendencies()` (the same pure function this file's caller used to
 * build the `tendencies` argument) directly from `player` - a second call
 * to the same deterministic function, not a second, drifting
 * implementation of the same concept (the thing Milestone 10 actually
 * fixed for pressure/lanes). `teamIntent.phase`, however, IS now passed
 * through as of Milestone 18 (Score-Based Decisions) - `Decider` had no
 * equivalent of its own to recompute phase from, so this is the one field
 * of the three params that was genuinely unused before and now isn't.
 */
export class RuleBasedPlayerPolicy implements PlayerPolicy {
  constructor(private decider: Decider) {}

  public decide(
    player: IFieldPlayer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    observation: PlayerObservation,
    teamIntent: TeamIntent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tendencies: PlayerTendencies,
    attackingSide: MatchSide,
    defendingSide: MatchSide
  ): PlayerIntent {
    const strategy = this.decider.makeDecision(
      player,
      attackingSide,
      defendingSide,
      teamIntent.phase
    );
    return toPlayerIntent(strategy);
  }
}
