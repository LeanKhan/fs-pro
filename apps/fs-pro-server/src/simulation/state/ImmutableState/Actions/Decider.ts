import { IFieldPlayer } from '../../../../interfaces/Player';
import { MatchSide } from '../../../classes/MatchSide';
import CO from '../../../utils/coordinates';
import { getResult } from '../../../utils/probability';
import {
  createRandomSource,
  RandomInput,
  RandomSource,
} from '../../../randomness';

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
  /** Public since Milestone 8's `ShotResolver` (resolver/ShotResolver.ts)
   * shares this exact instance (not a fresh fork) so its shot-target roll
   * stays in the same temporal draw order as every other roll this
   * Decider instance makes - see that file's own doc comment. */
  public readonly random: RandomSource;

  constructor(teams: MatchSide[], random?: RandomInput) {
    this.teams = teams;
    this.random = createRandomSource(random);
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
          const shot = this.tryShoot(
            player,
            attackingSide,
            defendingSide,
            'ATT'
          );

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
            this.strategy = this.whatKindaPass(
              player,
              attackingSide,
              defendingSide
            );
          }
        }
        break;
      case 'DEF':
        if (player.WithBall) {
          // Defenders should be passing!
          const shot = this.tryShoot(
            player,
            attackingSide,
            defendingSide,
            'DEF'
          );

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
            this.strategy = this.whatKindaPass(
              player,
              attackingSide,
              defendingSide
            );
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
    const mindset = player.Attributes.AttackingMindset
      ? 'withMindset'
      : 'without';
    const shoot = profile.shoot[mindset];
    const longShot = profile.longShot[mindset];

    if (
      this.chanceToShoot(
        player,
        attackingSide,
        defendingSide,
        shoot.threshold,
        shoot.distance
      )
    ) {
      return { type: 'shoot', detail: 'normal' };
    }

    if (
      this.chanceToShoot(
        player,
        attackingSide,
        defendingSide,
        longShot.threshold,
        longShot.distance
      )
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
    const scaledRadius = CO.co.scaleDistance(radius);

    return defendingSide.ActivePlayers.filter((opponent) => {
      return (
        opponent.Position !== 'GK' &&
        CO.co.calculateDistance(player.BlockPosition, opponent.BlockPosition) <=
          scaledRadius
      );
    }).length;
  }

  /**
   * Adjusts a base confidence threshold by the player's composure (Mental),
   * how many opponents are pressuring him, and his own team's playing style.
   * A composed player under little pressure gets a higher effective
   * threshold (more likely to take the shot/attempt); a low-Mental player
   * swarmed by defenders gets a much lower one (more likely to bail into a
   * pass instead). A higher-tempo style nudges every such attempt more
   * eager; a patient style nudges it more cautious.
   */
  private confidenceThreshold(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    base: number,
    pressureRadius = 3
  ): number {
    const composure = (player.Attributes.Mental - 50) * 0.3;
    const pressure =
      this.countPressure(player, defendingSide, pressureRadius) * 8;
    const tempoBias = (attackingSide.Tactic.style.tempo - 0.5) * 20;

    return Math.min(100, Math.max(0, base + composure - pressure + tempoBias));
  }

  /**
   * GimmeAChance - _just give me a chance!_
   *
   * Returns a random percentage
   * @returns {number} chance threshold
   */
  public gimmeAChance(): number {
    return Math.round(this.random.next() * 100);
  }

  private chanceToShoot(
    player: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    threshold: number,
    distance: number
  ) {
    const inRange =
      CO.co.calculateDistance(
        player.BlockPosition,
        attackingSide.ScoringSide
      ) <= CO.co.scaleDistance(distance);

    if (!inRange) {
      return false;
    }

    return (
      this.gimmeAChance() <=
      this.confidenceThreshold(player, attackingSide, defendingSide, threshold)
    );
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
      this.passability(
        player,
        attackingSide,
        defendingSide,
        passingDistance,
        !pos
      ) &&
      this.gimmeAChance() <=
        this.confidenceThreshold(
          player,
          attackingSide,
          defendingSide,
          threshold
        )
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
    // Check the several closest teammates, not just the single nearest one.
    // With realistic defensive shape (players spread across a formation
    // rather than swarming the ball), the single closest teammate's lane
    // being blocked is common - that shouldn't kill the whole pass
    // evaluation when another nearby teammate is completely open.
    const candidates = attackingSide.ActivePlayers.filter((p) => p !== player)
      .sort(
        (a, b) =>
          CO.co.calculateDistance(player.BlockPosition, a.BlockPosition) -
          CO.co.calculateDistance(player.BlockPosition, b.BlockPosition)
      )
      .slice(0, 3);

    const scaledDistance = CO.co.scaleDistance(distance);

    return candidates.some((teammate) => {
      const teammateIsClose =
        CO.co.calculateDistance(player.BlockPosition, teammate.BlockPosition) <=
        scaledDistance;

      if (!teammateIsClose) {
        return false;
      }

      const laneIsClear = this.laneIsClear(player, teammate, defendingSide);

      if (teammatePosition) {
        // Pass to Attackers or Midfielders
        return (
          (teammate.Position === 'ATT' || teammate.Position === 'MID') &&
          laneIsClear
        );
      }

      return laneIsClear;
    });
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
    return !defendingSide.ActivePlayers.some((opponent) => {
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
    const scaledDistance = CO.co.scaleDistance(distance);

    if (ownPost) {
      return (
        CO.co.calculateDistance(
          player.BlockPosition,
          attackingSide.KeepingSide
        ) <= scaledDistance
      );
    } else {
      return (
        CO.co.calculateDistance(
          player.BlockPosition,
          attackingSide.ScoringSide
        ) <= scaledDistance
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
        attackingSide.ActivePlayers
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
