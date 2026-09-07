import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import { TeamIntent } from '../team/TeamIntent';
import { PlayerObservation } from './PlayerObservation';
import { PlayerIntent } from './PlayerIntent';
import { PlayerTendencies } from './PlayerRole';

/**
 * Milestone 7 - the seam a future `NeuralPlayerPolicy` (or any other
 * decision strategy) would implement, swapped in via config once that's
 * a real thing (see the plan doc's Phase 28 framing). `RuleBasedPlayerPolicy`
 * is the only implementation today.
 */
export interface PlayerPolicy {
  decide(
    player: IFieldPlayer,
    observation: PlayerObservation,
    teamIntent: TeamIntent,
    /** Milestone 15 (Player Roles And Tendencies) - this player's own
     * derived tendencies (`player/PlayerRole.ts`), independent of the
     * team-wide `teamIntent`. */
    tendencies: PlayerTendencies,
    attackingSide: MatchSide,
    defendingSide: MatchSide
  ): PlayerIntent;
}
