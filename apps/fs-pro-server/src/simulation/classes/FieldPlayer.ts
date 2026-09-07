import {
  IFieldPlayer,
  IPositions,
  PlayerInterface,
  PlayerMatchStatus,
} from '../../interfaces/Player';
import Player from './Player';
import Ball from './Ball';
import { ICoordinate, IBlock } from '../state/ImmutableState/FieldGrid';
import CO from '../utils/coordinates';
import log from '../../helpers/logger';
import { createInitialCondition, IPlayerCondition } from '../player/PlayerCondition';
import { createInitialMemory, IPlayerMemory } from '../player/PlayerMemory';

abstract class FieldPlayerClass {
  public static instances: number;
}

// tslint:disable-next-line: max-classes-per-file
export default class FieldPlayer
  extends Player
  implements IFieldPlayer, FieldPlayerClass
{
  public static instances = 0;
  public Points = 0;
  public Substitute: boolean;
  public BlockPosition: IBlock;
  public Ball: Ball;
  public StartingPosition: IBlock;
  public MatchStatus: PlayerMatchStatus = 'active';
  /** Milestone 20 - constructor-initialized (not lazy), same treatment as
   * `MatchStatus`/`GameStats` - the deliberate consequence is that
   * `MatchSide.substitutePlayer()`'s brand-new `FieldPlayer` for the
   * incoming sub gets fresh condition/memory for free, zero extra
   * wiring, since it goes through this same constructor. */
  public Condition: IPlayerCondition = createInitialCondition();
  public Memory: IPlayerMemory = createInitialMemory();
  // public Team: MatchSide;

  /**
   * Milestone 17 (Independent Ball Model) - derived, not stored. Reads
   * `Ball.holderId` (the single canonical source of truth, see `Ball.ts`)
   * instead of an independently-maintained boolean this class used to
   * reactively recompute on every ball move via a per-player
   * `ballMove.on()` listener (22 of them per match, each redundantly
   * comparing its own position to the ball's) - removed along with that
   * listener, since there's nothing left for it to push: a getter reads
   * the current, single source whenever asked, it doesn't need telling
   * when that source changes.
   */
  public get WithBall(): boolean {
    return this._id !== undefined && this.Ball.holderId === this._id;
  }

  /**
   *
   * @param {PlayerInterface} player The player guy
   * @param {boolean} starting Is the player starting?
   * @param {IBlock} pos starting position
   * @param {IBall} ball the match ball
   * @param {MatchSide} team player's team
   */
  constructor(
    player: PlayerInterface,
    starting: boolean,
    pos: IBlock,
    ball: Ball
    // team: MatchSide
  ) {
    super(player);
    this.Ball = ball;
    this.isStarting = starting;
    this.Substitute = !this.isStarting;
    this.StartingPosition = pos;
    // this.Team = team;

    this.BlockPosition = pos;
    this.setBlockOccupant(this, this.BlockPosition);

    FieldPlayer.instances++;
  }

  /** @param holderId Milestone 17 - the id of whoever's actually receiving
   * this pass (the target teammate on a clean pass, the interceptor on a
   * failed one) - `Actions.pass()` always already knows which before
   * calling this, so it's passed explicitly rather than re-derived from
   * position matching afterward. */
  public pass(pos: ICoordinate, holderId: string) {
    this.Ball.move(pos, holderId);
    log(`${this.LastName} passed the ball to ${JSON.stringify(pos)}`);
  }

  public shoot(pos: ICoordinate) {
    // Milestone 17 - the ball is loose (in flight) the instant it leaves
    // the shooter's foot, not still "held" by them - `Referee.handleShot()`
    // explicitly reassigns it to the keeper right after (goal, miss, or
    // save all end with the keeper collecting/retrieving it), same as
    // before this milestone, just now an explicit holder assignment
    // instead of an implicit position-match.
    this.Ball.move(pos, null);
    log(`${this.LastName} shot the ball to ${JSON.stringify(pos)}`);
  }

  public increaseGoalTally() {
    this.GameStats.Goals = this.GameStats.Goals + 1;
  }

  public increasePoints(pnts: number) {
    this.GameStats.Points += pnts;
    if (this.GameStats.Points > 10) {
      this.GameStats.Points = 10;
    }
  }

  public move(pos: ICoordinate): void {
    // First set occupant of current Block to null
    this.setBlockOccupant(null, this.BlockPosition);
    // Then set this players BlockPosition to his current Block coordinates

    const newPos = {
      x: this.BlockPosition.x + pos.x,
      y: this.BlockPosition.y + pos.y,
    };

    this.BlockPosition = CO.co.coordinateToBlock(newPos);

    // Then set the Block Occupant of current block to this player
    this.setBlockOccupant(this, this.BlockPosition);
    if (this.WithBall) {
      this.Ball.move(pos);
    }
    log(
      `${this.FirstName} ${this.LastName} [${
        this.ClubCode
      }] moved  ${JSON.stringify(pos)} steps.
      And is at {x: ${this.BlockPosition.x}, y: ${this.BlockPosition.y}}
      `
    );
    // Milestone 17 - `WithBall` is now derived straight from `Ball.holderId`
    // (see the getter above), so there's nothing to separately update here
    // regardless of whether this move happened to land on the ball's
    // block. Before that, this comment documented the same invariant the
    // hard way: an unrelated positional move (marking, pressing, holding
    // shape) must never itself hand a bystander possession just by
    // coinciding with the ball's square - the root cause of matches with
    // 99% possession and 0 passes for one side. That invariant is now
    // structural rather than a documented discipline to maintain by hand:
    // `holderId` only ever changes via an explicit assignment (a real
    // pass/shot/tackle/restart), never as a side effect of a position
    // happening to match. The carry-forward call just above (`WithBall`
    // already true -> move the ball WITH this player, holder unchanged)
    // is the one legitimate case where a plain positional move also moves
    // the ball - a genuine dribble/carry, not a coincidence.
  }

  public substitute() {
    this.isSubstituted = false;
  }

  public start() {
    this.isStarting = true;
  }

  public changeStartingPosition(block: IBlock) {
    this.StartingPosition = block;
  }

  /**
   *
   * Get first blocks around the player
   * Circumference: 1
   *
   * Bounds are read off the block's own Field reference, so this works for
   * whatever grid size Field was constructed with - previously hardcoded
   * to 14/10, which only matched a 15x11 grid.
   */
  public checkNextBlocks() {
    const maxX = this.BlockPosition.Field.mapWidth - 1;
    const maxY = this.BlockPosition.Field.mapHeight - 1;

    const around: IPositions = {
      top: undefined,
      left: undefined,
      right: undefined,
      bottom: undefined,
    };
    around.top =
      this.BlockPosition.y - 1 < 0
        ? undefined
        : CO.co.coordinateToBlock({
            x: this.BlockPosition.x,
            y: this.BlockPosition.y - 1,
          });
    around.left =
      this.BlockPosition.x - 1 < 0
        ? undefined
        : CO.co.coordinateToBlock({
            x: this.BlockPosition.x - 1,
            y: this.BlockPosition.y,
          });
    around.right =
      this.BlockPosition.x + 1 > maxX
        ? undefined
        : CO.co.coordinateToBlock({
            x: this.BlockPosition.x + 1,
            y: this.BlockPosition.y,
          });
    around.bottom =
      this.BlockPosition.y + 1 > maxY
        ? undefined
        : CO.co.coordinateToBlock({
            x: this.BlockPosition.x,
            y: this.BlockPosition.y + 1,
          });

    return around;
  }

  /**
   * Get the blocks around a player by radius
   * @param radius how many block around?
   */
  public getBlocksAround(radius: number): any[] {
    const maxX = this.BlockPosition.Field.mapWidth - 1;
    const maxY = this.BlockPosition.Field.mapHeight - 1;

    // Get the blocks around for each side.
    const blocks: any[] = [];
    for (let side = 1; side <= 4; side++) {
      switch (side) {
        case 1:
          // Top side
          for (let r = 1; r <= radius; r++) {
            const block =
              this.BlockPosition.y - r < 0
                ? undefined
                : CO.co.coordinateToBlock({
                    x: this.BlockPosition.x,
                    y: this.BlockPosition.y - r,
                  });
            blocks.push(block);
          }
          break;

        case 2:
          // Left side
          for (let r = 1; r <= radius; r++) {
            const block =
              this.BlockPosition.x - r < 0
                ? undefined
                : CO.co.coordinateToBlock({
                    x: this.BlockPosition.x - r,
                    y: this.BlockPosition.y,
                  });
            blocks.push(block);
          }
          break;
        case 3:
          // Right side
          for (let r = 1; r <= radius; r++) {
            const block =
              this.BlockPosition.x + r > maxX
                ? undefined
                : CO.co.coordinateToBlock({
                    x: this.BlockPosition.x + r,
                    y: this.BlockPosition.y,
                  });
            blocks.push(block);
          }
          break;
        case 4:
          // Bottom side
          for (let r = 1; r <= radius; r++) {
            const block =
              this.BlockPosition.y + r > maxY
                ? undefined
                : CO.co.coordinateToBlock({
                    x: this.BlockPosition.x,
                    y: this.BlockPosition.y + r,
                  });
            blocks.push(block);
          }
          break;

        default:
          break;
      }
    }
    return blocks;
  }

  /**
   *
   * @param pos new block position
   */
  public changePosition(pos: IBlock) {
    // Empty old block position
    this.setBlockOccupant(null, this.BlockPosition);

    // Change player's BlockPosition to initial position
    this.BlockPosition = pos;

    // Move to new position
    this.setBlockOccupant(this, pos);
  }

  private setBlockOccupant(who: any, pos: ICoordinate): void {
    CO.co.coordinateToBlock(pos).occupant = who;
  }
}
