import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import CO from '../utils/coordinates';
import { getResult } from '../utils/probability';
import { RandomSource } from '../randomness';
import { getSimulationConfig } from '../config';
import { getFatigueMultiplier } from '../player/PlayerCondition';

/**
 * Milestone 8 (Resolver Layer) - moved verbatim out of `Decider.ts`'s
 * `getShotResult`/`getShotTarget` (see the simulation-engine-isolation
 * plan). Takes the SAME `RandomSource` instance `Decider` itself uses
 * (via its now-public `random` field), not a freshly forked one - a
 * fresh fork would draw from a differently-ordered stream than before
 * (the shot-target roll used to interleave, in call order, with every
 * other roll `Decider.gimmeAChance()` makes) - same class of risk
 * Milestone 7 avoided by wrapping the existing `Decider` instance
 * instead of constructing a second one.
 *
 * `isNearScoringPost` is a small, deliberate duplicate of `Decider`'s
 * private `isNearPost()` (which stays in `Decider.ts` - it's also used
 * by the decision-making side, `whatKindaPass()`) rather than an
 * "extract to a shared location" refactor for one short, pure geometric
 * helper - same tradeoff already made for helpers/logger.ts/misc.ts back
 * in Milestone 2.
 */
export class ShotResolver {
  constructor(
    private teams: MatchSide[],
    private random: RandomSource
  ) {}

  public resolve(
    shooter: IFieldPlayer,
    keeper: IFieldPlayer
  ): { onTarget: boolean; goal: boolean } {
    const onTarget = this.getShotTarget(shooter);

    if (!keeper && onTarget) {
      return { onTarget, goal: true };
    } else {
      if (onTarget) {
        const { shooterPower, keeperPower } = getSimulationConfig().shooting.duel;
        // Milestone 20 - "fatigue affects... shot precision" - both the
        // shooter's finishing and the keeper's own handling degrade with
        // their own fatigue.
        const shooterFatigue = getFatigueMultiplier(shooter);
        const keeperFatigue = getFatigueMultiplier(keeper);
        const result = getResult(
          [
            shooter.Attributes.Shooting * shooterFatigue,
            shooter.Attributes.Mental * shooterFatigue,
          ],
          [
            keeper.Attributes.Keeping * keeperFatigue,
            keeper.Attributes.Control * keeperFatigue,
          ],
          shooterPower,
          keeperPower
        );

        return { onTarget, goal: result };
      } else {
        return { onTarget, goal: false };
      }
    }
  }

  private gimmeAChance(): number {
    return Math.round(this.random.next() * 100);
  }

  private getShotTarget(shooter: IFieldPlayer): boolean {
    const chance = this.gimmeAChance();

    const teamIndex = this.teams.findIndex(
      (t) => t.ClubCode === shooter.ClubCode
    );

    const shooterFatigue = getFatigueMultiplier(shooter);

    if (
      this.isNearScoringPost(
        shooter,
        this.teams[teamIndex],
        getSimulationConfig().shooting.nearPostDistance
      )
    ) {
      return chance <= shooter.Attributes.Shooting * shooterFatigue;
    } else {
      return (
        chance <=
        ((shooter.Attributes.SetPiece + shooter.Attributes.Shooting) / 2) * shooterFatigue
      );
    }
  }

  private isNearScoringPost(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    distance: number
  ): boolean {
    return (
      CO.co.calculateDistance(player.BlockPosition, attackingSide.ScoringSide) <=
      CO.co.scaleDistance(distance)
    );
  }
}
