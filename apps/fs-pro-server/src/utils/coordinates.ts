/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
import Field, { ICoordinate, IBlock } from '../state/ImmutableState/FieldGrid';
import { IFieldPlayer } from '../interfaces/Player';
import log from '../helpers/logger';
export default class Coordinates {
  public static _co: Coordinates;
  public Field: Field;
  private PlayingField;
  private mapWidth;
  private mapHeight;

  public static get co() {
    return Coordinates._co;
  }

  constructor() {
    this.Field = new Field();
    this.PlayingField = this.Field.PlayingField;
    this.mapWidth = this.Field.mapWidth;
    this.mapHeight = this.Field.mapHeight;
    Coordinates._co = this;
  }

  /**
   * Returns the tile index of the given coordinates
   *
   * @param x
   * @param y
   * @param mapWidth
   *
   */
  // tslint:disable-next-line: no-shadowed-variable
  public XYToIndex(x: number, y: number, mapWidth: number): number {
    return y * mapWidth + x;
  }

  /**
   * Returns the x and y coordinates of the tile
   * @param index
   * @param mapWidth
   */
  // tslint:disable-next-line: no-shadowed-variable
  public indexToXY(index: number, mapWidth: number): ICoordinate {
    const i = { x: 0, y: 0 };

    i.x = index % mapWidth;

    i.y = Math.floor(index / mapWidth);

    return i;
  }

  /**
   * Coordinate to Block
   *  Returns the Field Block of the given coordinates
   *
   * @param pos
   * @returns {IBlock} Field Block
   */
  public coordinateToBlock(pos: ICoordinate): IBlock {
    return this.PlayingField[this.XYToIndex(pos.x, pos.y, this.mapWidth)];
  }

  /**
   * Index to Block
   *
   * Returns the given PlayingField block by index
   * @param index
   */
  public indexToBlock(index: number): IBlock {
    return this.PlayingField[index];
  }

  /**
   * Find closest player from a given coordinate
   *
   * @param originPlayer Player that is looking for someone to pass the ball to
   * @param ref Reference position
   * @param players Players to sort through
   */
  public findClosestPlayer(
    ref: ICoordinate,
    players: IFieldPlayer[],
    originPlayer?: IFieldPlayer,
    closest = false,
    _position?: string
  ): IFieldPlayer {
    let plyrs = players;

    plyrs = plyrs.sort((a, b) => {
      return this.calculateDistance(ref, a.BlockPosition) <
        this.calculateDistance(ref, b.BlockPosition)
        ? -1
        : 1;
    });

    log(
      plyrs.map((p) => ({
        Name: p.FirstName + ' ' + p.LastName,
        PlayerPosition: p.Position,
        Club: p.ClubCode,
        Position: p.BlockPosition.key,
        Distance: this.calculateDistance(ref, p.BlockPosition),
      })),
      'table'
    );

    /**
     * The index of the origin player so we can remove it :)
     */

    if (originPlayer) {
      plyrs = plyrs.filter((p) => p._id !== originPlayer._id);
    }

    // Now select a random player from the first three options

    const index = closest ? 0 : Math.round(Math.random() * 2);

    return plyrs[index];
  }

  /**
   * Find the closest player to something, including the current player
   * @param ref
   * @param players
   * @param _originPlayer
   */
  public findClosestPlayerInclusive(
    ref: ICoordinate,
    players: IFieldPlayer[],
    _originPlayer?: IFieldPlayer
  ) {
    let plyrs = players;

    plyrs = plyrs.sort((a, b) => {
      return this.calculateDistance(ref, a.BlockPosition) <
        this.calculateDistance(ref, b.BlockPosition)
        ? -1
        : 1;
    });

    // Now select a random player from the first three options
    return plyrs[0];
  }

  /**
   * Find the closest player that is not a keeper :)
   * @param ref
   * @param players
   * @param originPlayer
   */
  public findClosestFieldPlayer(
    ref: ICoordinate,
    players: IFieldPlayer[],
    originPlayer?: IFieldPlayer,
    limit?: number
  ) {
    // Remove Goalkeepers
    let plyrs: IFieldPlayer[] = players.filter((p) => {
      return p.Position !== 'GK';
    });

    // Sort by distance
    plyrs = plyrs.sort((a, b) => {
      return this.calculateDistance(ref, a.BlockPosition) <
        this.calculateDistance(ref, b.BlockPosition)
        ? -1
        : 1;
    });

    /**
     * The index of the origin player so we can remove it :)
     */
    if (originPlayer) {
      const psI = plyrs.findIndex((p) => {
        return p === originPlayer;
      });

      plyrs.slice(psI, 1);
    }

    if (limit) {
      plyrs = plyrs.filter((a) => {
        return this.calculateDistance(ref, a.BlockPosition) <= limit;
      });
    }

    return plyrs[0];
  }

  /**
   *
   * @param ref The reference coordinate
   * @param players Array of players to sort through
   * @param originPlayer Player making the query :p
   */
  public findRandomPlayer(
    ref: ICoordinate,
    players: IFieldPlayer[],
    originPlayer?: IFieldPlayer
  ) {
    const ps = players;

    ps.sort((a, b) => {
      return this.calculateDistance(ref, a.BlockPosition) <
        this.calculateDistance(ref, b.BlockPosition)
        ? -1
        : 1;
    });

    /**
     * The index of the origin player so we can remove it :)
     */
    const psI = ps.findIndex((p) => {
      return p === originPlayer;
    });

    ps.slice(psI, 1);

    const index = Math.round(Math.random() * (players.length - 1));

    return ps[index];
  }

  public findClosestPlayerByPosition(
    ref: ICoordinate,
    position: string,
    originPlayer: IFieldPlayer,
    players: IFieldPlayer[]
  ) {
    // Remove Goalkeepers
    let plyrs: IFieldPlayer[] = players.filter((p) => {
      return p.Position === position;
    });

    // Sort by distance
    plyrs = plyrs.sort((a, b) => {
      return this.calculateDistance(ref, a.BlockPosition) <
        this.calculateDistance(ref, b.BlockPosition)
        ? -1
        : 1;
    });

    /**
     * The index of the origin player so we can remove it :)
     */
    const psI = plyrs.findIndex((p) => {
      return p === originPlayer;
    });

    plyrs.slice(psI, 1);

    return plyrs[0];
  }

  public findLongPlayer(
    ref: ICoordinate,
    players: IFieldPlayer[],
    _originPlayer?: IFieldPlayer
  ) {
    let plyrs = players;

    // Find players that are 5 blocks or more away
    plyrs = plyrs.filter((a, _b) => {
      return this.calculateDistance(ref, a.BlockPosition) >= 5;
    });

    /**
     * The index of the origin player so we can remove it :)
     */

    const index = Math.round(Math.random() * (plyrs.length - 1));

    return plyrs[index];
  }

  /**
   * Find the absolute distance between two coordinates
   * less is better :)
   *
   * @param {ICoordinate} ref  - Coordinate you are comparing with
   * @param {ICoordinate} pos - Coordinate you are comparing with reference
   */
  public calculateDistance(ref: ICoordinate, pos: ICoordinate): number {
    return Math.abs(pos.x - ref.x) + Math.abs(pos.y - ref.y);
  }

  /**
   * Every distance THRESHOLD in Decider.ts/Actions.ts (how close a
   * teammate needs to be to pass to, how near the post counts as a
   * shooting chance, etc.) was hand-tuned in block-counts against the
   * original 15x11 grid. When the grid was widened to 33x21 for more
   * realistic spacing (see FieldGrid.ts), those constants were never
   * rescaled - the same "4 blocks away" now covers less than half the real
   * pitch distance it used to, so on the finer grid almost nothing ever
   * reads as "close enough", starving passing/shooting decisions in favour
   * of a `move` fallback. This scales a threshold that was calibrated for
   * the original 15-wide grid up to whatever grid is actually in play, so
   * it keeps meaning the same real-world distance regardless of
   * resolution - the same reasoning FormationSlot's fractional x/y already
   * uses, applied to these threshold constants too.
   */
  public scaleDistance(distanceAt15WideGrid: number): number {
    const REFERENCE_WIDTH = 15;
    return distanceAt15WideGrid * (this.mapWidth / REFERENCE_WIDTH);
  }

  /**
   * Find the coordinate you want to move to
   *
   * Both axes are resolved independently so a target that is off-axis
   * (e.g. up and to the left) produces a diagonal single-step path instead
   * of one that only ever moves along x or y.
   *
   * @param ref
   * @param pos
   */
  public findPath(ref: ICoordinate, pos: ICoordinate): ICoordinate {
    const path: ICoordinate = { x: 0, y: 0 };
    const x = ref.x - pos.x;
    const y = ref.y - pos.y;

    if (x !== 0) {
      path.x = x < 0 ? -1 : 1;
    }

    if (y !== 0) {
      path.y = y < 0 ? -1 : 1;
    }

    return path;
  }

  /**
   * Perpendicular distance from a point to the segment a-b.
   *
   * Used to judge whether a defender is actually standing in a passing
   * lane, rather than just "close to the receiver".
   */
  public distanceToSegment(
    point: ICoordinate,
    a: ICoordinate,
    b: ICoordinate
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return this.calculateDistance(point, a);
    }

    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projection = { x: a.x + t * dx, y: a.y + t * dy };
    return Math.hypot(point.x - projection.x, point.y - projection.y);
  }

  /**
   * Find the player whose position lies closest to the line between a and b
   * (e.g. a pass lane), rather than closest to either endpoint.
   *
   * @param limit only consider players within this lane distance
   */
  public findClosestToSegment(
    a: ICoordinate,
    b: ICoordinate,
    players: IFieldPlayer[],
    limit?: number
  ): IFieldPlayer | undefined {
    let plyrs = players.filter((p) => p.Position !== 'GK');

    plyrs = plyrs.sort((x, y) => {
      return (
        this.distanceToSegment(x.BlockPosition, a, b) -
        this.distanceToSegment(y.BlockPosition, a, b)
      );
    });

    if (limit !== undefined) {
      plyrs = plyrs.filter(
        (p) => this.distanceToSegment(p.BlockPosition, a, b) <= limit
      );
    }

    return plyrs[0];
  }

  /**
   * Calcualte the difference between two coordinates
   * i.e from 'pos' to 'dest'
   * @param ref the destination i.e tackler
   * @param pos the current location i.e tackled
   */
  public calculateDifference(dest: ICoordinate, pos: ICoordinate) {
    const path: ICoordinate = { x: 0, y: 0 };

    log(`Dest => ${JSON.stringify({ x: dest.x, y: dest.y })}`);
    log(`Pos => ${JSON.stringify({ x: pos.x, y: pos.y })}`);

    let x = dest.x - pos.x;
    let y = dest.y - pos.y;

    // if x is -ve
    if (x < 0 && pos.x === 0) {
      x = Math.abs(x);
    }

    // If y is -ve
    if (y < 0 && pos.y === 0) {
      y = Math.abs(y);
    }

    // These checks prevent sending

    path.x = x;
    path.y = y;

    return path;
  }

  /**
   * Is this position on the boundary of the pitch?
   *
   * Previously hardcoded to a 15x11 grid (x === 14, y === 10). Now reads
   * the actual grid size off this.mapWidth/mapHeight, so it stays correct
   * whatever xBlocks/yBlocks Field is constructed with.
   */
  public atExtremeBlock(pos: ICoordinate) {
    return (
      pos.x === 0 ||
      pos.x === this.mapWidth - 1 ||
      pos.y === 0 ||
      pos.y === this.mapHeight - 1
    );
  }

  public getBlocksAround(Block: IBlock, radius: number): any[] {
    // Get the blocks around for each side.
    const blocks: any[] = [];
    for (let side = 1; side <= 4; side++) {
      switch (side) {
        case 1:
          // Top side
          for (let r = 1; r <= radius; r++) {
            const block =
              Block.y - r < 0
                ? undefined
                : this.coordinateToBlock({
                    x: Block.x,
                    y: Block.y - r,
                  });
            blocks.push(block);
          }
          break;

        case 2:
          // Left side
          for (let r = 1; r <= radius; r++) {
            const block =
              Block.x - r < 0
                ? undefined
                : this.coordinateToBlock({
                    x: Block.x - r,
                    y: Block.y,
                  });
            blocks.push(block);
          }
          break;
        case 3:
          // Right side
          for (let r = 1; r <= radius; r++) {
            const block =
              Block.x + r > this.mapWidth - 1
                ? undefined
                : this.coordinateToBlock({
                    x: Block.x + r,
                    y: Block.y,
                  });
            blocks.push(block);
          }
          break;
        case 4:
          // Bottom side
          for (let r = 1; r <= radius; r++) {
            const block =
              Block.y + r > this.mapHeight - 1
                ? undefined
                : this.coordinateToBlock({
                    x: Block.x,
                    y: Block.y + r,
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
}
