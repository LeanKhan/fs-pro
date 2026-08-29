import { IFieldPlayer } from '../../../interfaces/Player';
import { MatchSide } from '../../../classes/MatchSide';
import CO from '../../../utils/coordinates';
import { getResult } from '../../../utils/probability';

interface IShootProfile {
  threshold: number;
  distance: number;
}

interface IOutfieldShootProfile {
  shoot: { withMindset: IShootProfile; without: IShootProfile };
  longShot: { withMindset: IShootProfile; without: IShootProfile };
}

/**
 * Base shoot/long-shot thresholds and distances per outfield position.
 * These are still hand-tuned constants, but centralising them here means
 * makeDecision no longer repeats the same shoot/long-shot branch three
 * times with inline magic numbers - and `confidenceThreshold` below is
 * what actually adjusts them per-attempt (composure, pressure).
 */
const SHOOT_PROFILES: Record<'ATT' | 'MID' | 'DEF', IOutfieldShootProfile> = {
  MID: {
    shoot: {
      withMindset: { threshold: 70, distance: 2 },
      without: { threshold: 50, distance: 2 },
    },
    longShot: {
      withMindset: { threshold: 50, distance: 3 },
      without: { threshold: 30, distance: 3 },
    },
  },
  ATT: {
    shoot: {
      withMindset: { threshold: 90, distance: 3 },
      without: { threshold: 60, distance: 3 },
    },
    longShot: {
      withMindset: { threshold: 60, distance: 5 },
      without: { threshold: 40, distance: 5 },
    },
  },
  DEF: {
    shoot: {
      withMindset: { threshold: 40, distance: 3 },
      without: { threshold: 30, distance: 2 },
    },
    longShot: {
      withMindset: { threshold: 70, distance: 5 },
      without: { threshold: 40, distance: 3 },
    },
  },
};

export class Decider {
  public teams: MatchSide[];

  public strategy: IStrategy = { type: 'move', detail: 'normal' };

  constructor(teams: MatchSide[]) {
    this.teams = teams;
  }

  /**
   * MakeDecision
   *
   * Decide what player will do
   *
   * @param player
   * @param attackingSide
   * @param defendingSide
   * @returns {IStrategy} Strategy player will take
   */
  public makeDecision(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide
  ): IStrategy {
    switch (player.Position) {
      // If this guy is a midfielder...
      case 'MID':
        if (player.WithBall) {
          this.strategy =
            this.tryShoot(player, attackingSide, defendingSide, 'MID') ??
            (this.gimmeAChance() <= 80
              ? this.whatKindaPass(player, attackingSide, defendingSide)
              : { type: 'move', detail: 'normal' });
        }
        break;
      case 'GK':
        if (player.WithBall) {
          this.strategy = this.keeperPass(
            player,
            attackingSide,
            defendingSide,
            80
            // player.Attributes.Keeping
          );
        }
        break;
      case 'ATT':
        if (player.WithBall) {
          const shot = this.tryShoot(player, attackingSide, defendingSide, 'ATT');

          if (shot) {
            this.strategy = shot;
          } else if (this.isClosestToPost(player, attackingSide)) {
            // If the player is near the post, he should keep on moving...
            this.strategy = this.chanceToMoveForward(
              player,
              attackingSide,
              defendingSide,
              30,
              true,
              2
            );
          } else if (player.Attributes.AttackingMindset) {
            // here player is neither shooting or moving forward, therefore pass!
            // but what kind of pass?
            // It is possible for this to result in a 'move' strategy i.e
            // closest teammate is too far away
            this.strategy = this.chanceToMoveForward(
              player,
              attackingSide,
              defendingSide,
              30,
              false
            );
          } else {
            this.strategy = this.whatKindaPass(player, attackingSide, defendingSide);
          }
        }
        break;
      case 'DEF':
        if (player.WithBall) {
          // Defenders should be passing!
          const shot = this.tryShoot(player, attackingSide, defendingSide, 'DEF');

          if (shot) {
            this.strategy = shot;
          } else if (this.isClosestToPost(player, attackingSide)) {
            this.strategy = this.chanceToMoveForward(
              player,
              attackingSide,
              defendingSide,
              player.Attributes.AttackingMindset ? 50 : 40,
              true
            );
          } else {
            // here player is neither shooting or moving forward, therefore pass!
            // but what kind of pass?
            // It is possible for this to result in a 'move' strategy i.e
            // closest teammate is too far away
            this.strategy = this.whatKindaPass(player, attackingSide, defendingSide);
          }
        }
        break;
    }

    return this.strategy;
  }

  /**
   * Try to shoot (normal, then long) for the given outfield position,
   * folding in the player's composure and how much pressure they're under
   * (see `confidenceThreshold`). Returns undefined if neither attempt
   * clears its chance roll, meaning the caller should fall back to
   * passing/moving.
   */
  private tryShoot(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    position: 'ATT' | 'MID' | 'DEF'
  ): IStrategy | undefined {
    const profile = SHOOT_PROFILES[position];
    const mindset = player.Attributes.AttackingMindset ? 'withMindset' : 'without';
    const shoot = profile.shoot[mindset];
    const longShot = profile.longShot[mindset];

    if (this.chanceToShoot(player, attackingSide, defendingSide, shoot.threshold, shoot.distance)) {
      return { type: 'shoot', detail: 'normal' };
    }

    if (
      this.chanceToShoot(player, attackingSide, defendingSide, longShot.threshold, longShot.distance)
    ) {
      return { type: 'shoot', detail: 'long' };
    }

    return undefined;
  }

  /**
   * How many opposing outfield players are pressuring this player, i.e.
   * within `radius` blocks of him.
   */
  private countPressure(
    player: IFieldPlayer,
    defendingSide: MatchSide,
    radius: number
  ): number {
    return defendingSide.StartingSquad.filter((opponent) => {
      return (
        opponent.Position !== 'GK' &&
        CO.co.calculateDistance(player.BlockPosition, opponent.BlockPosition) <= radius
      );
    }).length;
  }

  /**
   * Adjusts a base confidence threshold by the player's composure (Mental)
   * and how many opponents are pressuring him. A composed player under
   * little pressure gets a higher effective threshold (more likely to take
   * the shot/attempt); a low-Mental player swarmed by defenders gets a much
   * lower one (more likely to bail into a pass instead).
   */
  private confidenceThreshold(
    player: IFieldPlayer,
    defendingSide: MatchSide,
    base: number,
    pressureRadius = 3
  ): number {
    const composure = (player.Attributes.Mental - 50) * 0.3;
    const pressure = this.countPressure(player, defendingSide, pressureRadius) * 8;

    return Math.min(100, Math.max(0, base + composure - pressure));
  }

  /**
   * GetPassResult
   *
   * Determines the success or failure of a pass attempt
   *
   * @param {IFieldPlayer} passer
   * @param {IFieldPlayer} reciever
   * @param {boolean} type
   * @param {number} luck
   * @param {IFieldPlayer | undefined} interceptor
   * @returns {boolean} true/false
   */
  public getPassResult(
    passer: IFieldPlayer,
    reciever: IFieldPlayer,
    type: string,
    luck: number,
    interceptor?: IFieldPlayer
  ): boolean {
    // check their properties
    let result = true;
    const chance = this.gimmeAChance();
    switch (type) {
      case 'short':
        if (interceptor) {
          result = getResult(
            [
              { v: passer.Attributes.ShortPass, p: 50 },
              { v: passer.Attributes.Mental, p: 25 },
              { v: reciever.Attributes.Control, p: 25 },
            ],
            [interceptor.Attributes.Tackling],
            80,
            80
          );
        } else {
          const tally =
            passer.Attributes.ShortPass +
            reciever.Attributes.Control / 2 +
            passer.Attributes.Mental / 2 -
            chance;

          result = chance > tally;

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
        // let chance = Math.round(Math.random() * 100);
        if (interceptor) {
          result = getResult(
            [passer.Attributes.LongPass, passer.Attributes.Mental],
            [interceptor.Attributes.Tackling],
            70,
            60
          );
        } else {
          // TODO: Chance would be form...

          // compare the passers passing skill to a random number
          // TODO: come up with better criteria)
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

  /**
   * GetDribbleResult
   *
   * Determine the success or failure of a dribble attempt
   *
   * @param dribbler
   * @param opponent
   * @returns {boolean} true/false
   */
  public getDribbleResult(
    dribbler: IFieldPlayer,
    opponent: IFieldPlayer
  ): boolean {
    const chance = this.gimmeAChance();
    const tally =
      dribbler.Attributes.Dribbling / 2 +
      dribbler.Attributes.Speed / 2 -
      opponent.Attributes.Tackling;
    return chance <= tally;
  }

  /**
   * GetTackleResult
   *
   * Determine the success or failure of a tackle attempt
   *
   * @param tackler
   * @param ballHolder
   * @returns {boolean} true/false
   */
  public getTackleResult(
    tackler: IFieldPlayer,
    ballHolder: IFieldPlayer
  ): boolean {
    // TODO: Improve the distribution of attributes here...

    const result = getResult(
      [tackler.Attributes.Tackling, tackler.Attributes.Strength],
      [ballHolder.Attributes.Dribbling, ballHolder.Attributes.Control],
      80,
      70
    );

    return result;
  }

  /**
   * GetShotResult
   *
   * Returns the result of a goal attempt
   * @param shooter
   * @param keeper
   */
  public getShotResult(shooter: IFieldPlayer, keeper: IFieldPlayer) {
    // Let's see what happens.
    // What determines a goal? Shooter's shooting (duh), ball control, Keepers keeping and the *le randomness* :)
    const onTarget = this.getShotTarget(shooter);

    // TODO: consider distance of shot...

    if (!keeper && onTarget) {
      return { onTarget, goal: true };
    } else {
      if (onTarget) {
        const result = getResult(
          [shooter.Attributes.Shooting, shooter.Attributes.Mental],
          [keeper.Attributes.Keeping, keeper.Attributes.Control],
          80,
          70
        );

        return { onTarget, goal: result };
      } else {
        return { onTarget, goal: false };
      }
    }
  }

  /**
   * GimmeAChance - _just give me a chance!_
   *
   * Returns a random percentage
   * @returns {number} chance threshold
   */
  public gimmeAChance(): number {
    return Math.round(Math.random() * 100);
  }

  private chanceToShoot(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    threshold: number,
    distance: number
  ) {
    const inRange =
      CO.co.calculateDistance(player.BlockPosition, attackingSide.ScoringSide) <= distance;

    if (!inRange) {
      return false;
    }

    return this.gimmeAChance() <= this.confidenceThreshold(player, defendingSide, threshold);
  }

  /**
   * GetShotTarget
   *
   * Used to see if player will shoot on target or not
   *
   * - Uses their Shooting to get their normal shot success percentage
   *
   * - Uses their Shooting and Shooting divided by 2 to get long shot success
   *   percentage
   *
   * @param shooter
   */
  private getShotTarget(shooter: IFieldPlayer) {
    // if distance from post is near post...
    const chance = this.gimmeAChance();

    // Get shooter's team shey?

    const teamIndex = this.teams.findIndex(
      (t) => t.ClubCode === shooter.ClubCode
    );

    if (this.isNearPost(shooter, this.teams[teamIndex], 2)) {
      // here player is 80% likely to shoot on target
      return chance <= shooter.Attributes.Shooting;
    } else {
      return (
        chance <=
        (shooter.Attributes.SetPiece + shooter.Attributes.Shooting) / 2
      );
    }
  }

  /**
   * ChanceToMoveForward
   *
   * determines a strategy for the player whether he should move forward
   * or pass
   *
   * @param player
   * @param attackingSide
   * @param threshold
   * @param teammatePosition
   * @param passingDistance
   */
  private chanceToMoveForward(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    threshold: number,
    teammatePosition: boolean,
    passingDistance = 4
  ): IStrategy {
    let strategy: IStrategy = { type: 'move', detail: 'normal' };

    if (
      CO.co.atExtremeBlock(player.BlockPosition) &&
      player.Attributes.LongPass > 30 &&
      player.Position !== 'ATT'
    ) {
      if (this.gimmeAChance() < 50) {
        return { type: 'pass', detail: 'long' };
      } else {
        return { type: 'pass', detail: 'short' };
      }
    }

    // const closest = this.isClosestToPost(player, attackingSide);

    const pos = player.Position === 'ATT';

    if (
      this.passability(player, attackingSide, defendingSide, passingDistance, !pos) &&
      this.gimmeAChance() <= this.confidenceThreshold(player, defendingSide, threshold)
    ) {
      //  If the closest teammate is also an attacker then pass
      strategy = { type: 'pass', detail: 'short' };
    } else {
      strategy = { type: 'move', detail: 'normal' };
    }

    return strategy;
  }

  /**
   * Passability
   *
   * This determines if passing is a good move for the player: is a
   * suitable teammate close enough, AND is the lane to them actually clear
   * of defenders (rather than just checking distance to the receiver).
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @param {MatchSide} defendingSide
   * @param {number} distance max distance a teammate should be
   */
  private passability(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    distance: number,
    teammatePosition: boolean
  ): boolean {
    const teammate = CO.co.findClosestPlayer(
      player.BlockPosition,
      attackingSide.StartingSquad,
      player,
      true
    );

    const teammateIsClose =
      CO.co.calculateDistance(player.BlockPosition, teammate.BlockPosition) <=
      distance;

    const laneIsClear = this.laneIsClear(player, teammate, defendingSide);

    if (teammatePosition) {
      // Pass to Attackers or Midfielders
      return (
        (teammate.Position === 'ATT' || teammate.Position === 'MID') &&
        teammateIsClose &&
        laneIsClear
      );
    }

    return teammateIsClose && laneIsClear;
  }

  /**
   * Is the straight line between player and teammate free of defenders?
   * Uses actual lane geometry (perpendicular distance to the pass line)
   * rather than just proximity to the receiver.
   */
  private laneIsClear(
    player: IFieldPlayer,
    teammate: IFieldPlayer,
    defendingSide: MatchSide,
    laneWidth = 1.5
  ): boolean {
    return !defendingSide.StartingSquad.some((opponent) => {
      return (
        opponent.Position !== 'GK' &&
        CO.co.distanceToSegment(
          opponent.BlockPosition,
          player.BlockPosition,
          teammate.BlockPosition
        ) <= laneWidth
      );
    });
  }

  /**
   * isNearPost
   *
   * Check if player is near the post
   * @param {IFieldPlayer} player Player in focus
   * @param {MatchSide} attackingSide Player's team
   * @returns {boolean} true/false
   */
  private isNearPost(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    distance: number,
    ownPost = false
  ): boolean {
    if (ownPost) {
      return (
        CO.co.calculateDistance(
          player.BlockPosition,
          attackingSide.KeepingSide
        ) <= distance
      );
    } else {
      return (
        CO.co.calculateDistance(
          player.BlockPosition,
          attackingSide.ScoringSide
        ) <= distance
      );
    }
  }

  /**
   * isClosestToPost
   *
   * Check if player is the closest in his team to the post
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @returns {boolean} true/false
   */
  private isClosestToPost(
    player: IFieldPlayer,
    attackingSide: MatchSide
  ): boolean {
    return (
      CO.co.findClosestPlayerInclusive(
        attackingSide.ScoringSide,
        attackingSide.StartingSquad
      ) === player
    );
  }

  /**
   * WhatKindaPass
   *
   * Determines the kind of pass this player will make, but
   * can also result in the player moving forward
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @returns {IStrategy} Strategy to take: pass or move
   */
  private whatKindaPass(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide
  ): IStrategy {
    let strategy: IStrategy = { type: 'pass', detail: 'short' };

    if (CO.co.atExtremeBlock(player.BlockPosition)) {
      if (this.passability(player, attackingSide, defendingSide, 4, true)) {
        return { type: 'pass', detail: 'short' };
      } else {
        return { type: 'pass', detail: 'long' };
      }
    }

    if (this.isNearPost(player, attackingSide, 5, true)) {
      if (this.gimmeAChance() <= 50) {
        return { type: 'pass', detail: 'pass to post' };
      } else {
        return { type: 'pass', detail: 'short' };
      }
    }

    // Check if his closest teammate is 3 steps away or less
    if (this.passability(player, attackingSide, defendingSide, 4, true)) {
      strategy = { type: 'pass', detail: 'short' };
    } else if (
      this.passability(player, attackingSide, defendingSide, 7, true) &&
      !this.isClosestToPost(player, attackingSide)
    ) {
      strategy = { type: 'pass', detail: 'long' };
    } else {
      strategy = { type: 'move', detail: 'normal' };
    }

    return strategy;
  }

  /**
   * KeeperPass
   *
   * Determines the kind of pass keeper will make
   * @param {IFieldPlayer} player
   * @param {MatchSide} attackingSide
   * @param {boolean} chance
   * @returns {IStrategy} kind of pass
   */
  private keeperPass(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    chance: number
  ): IStrategy {
    let strategy: IStrategy = { type: 'pass', detail: 'long' };

    if (this.passability(player, attackingSide, defendingSide, 3, false)) {
      if (
        player.Attributes.LongPass > player.Attributes.ShortPass &&
        this.gimmeAChance() <= chance
      ) {
        strategy = { type: 'pass', detail: 'long' };
      } else {
        strategy = { type: 'pass', detail: 'short' };
      }
    } else {
      strategy = { type: 'pass', detail: 'long' };
    }

    return strategy;
  }
}

interface deciderPart {
  attribute: string;
  weight: number;
  value: number;
}
export interface IStrategy {
  type: 'pass' | 'move' | 'shoot';
  detail?: string;
}
