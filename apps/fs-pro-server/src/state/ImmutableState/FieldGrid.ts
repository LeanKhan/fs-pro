import { IFieldPlayer } from '../../interfaces/Player';

/**
 * Default grid resolution.
 *
 * A real pitch is roughly 105m x 68m (~1.54:1 ratio). The old 15x11 default
 * (165 cells) was too coarse for realistic spacing - players were forced
 * into near-identical blocks and passing lanes were trivially short.
 *
 * 33x21 (693 cells, ~1.57:1 ratio) keeps that real-world ratio while giving
 * roughly 4x the positional resolution. Bump these further if you want even
 * finer movement - pathfinding/AI cost scales with cell count, not player
 * count, so this is cheap to tune.
 */
export const DEFAULT_X_BLOCKS = 33;
export const DEFAULT_Y_BLOCKS = 21;

export default class Field {
  public PlayingField: IBlock[];
  public mapWidth: number;
  public mapHeight: number;

  /**
   * Create a new Playing Field
   *
   * @param xBlocks default is 33
   * @param yBlocks default is 21
   */
  constructor(xBlocks = DEFAULT_X_BLOCKS, yBlocks = DEFAULT_Y_BLOCKS) {
    this.PlayingField = this.createGrid(xBlocks, yBlocks);
    this.mapWidth = xBlocks;
    this.mapHeight = yBlocks;
  }

  /** Check if this block is at the flanks (sides) of the field */
  public checkIfFlank(x: number, y: number, xBlocks: number, yBlocks: number) {
    return y == yBlocks - 1 || y == 0;
  }

  /** Check if this block is at the Head or Tail of the Field */
  public checkIfEnds(x: number, y: number, xBlocks: number, yBlocks: number) {
    return x == xBlocks - 1 || x == 0;
  }

  /**
   * Resolve a fractional pitch coordinate to the nearest actual block.
   *
   * This is what lets formations be defined independently of grid size:
   * a formation slot at { x: 0.18, y: 0.5 } will always land on the same
   * relative spot on the pitch, whether the grid is 15x11 or 33x21 or
   * anything else.
   *
   * @param xFrac 0 = own goal line, 1 = opponent's goal line
   * @param yFrac 0 = one flank, 1 = other flank
   */
  public getBlockByFraction(xFrac: number, yFrac: number): IBlock {
    const xClamped = Math.min(Math.max(xFrac, 0), 1);
    const yClamped = Math.min(Math.max(yFrac, 0), 1);

    const x = Math.round(xClamped * (this.mapWidth - 1));
    const y = Math.round(yClamped * (this.mapHeight - 1));

    return this.getBlockAt(x, y);
  }

  /** Look up a block by its raw x,y grid coordinates */
  public getBlockAt(x: number, y: number): IBlock {
    const block = this.PlayingField.find((b) => b.x === x && b.y === y);
    if (!block) {
      throw new Error(
        `No block found at (${x}, ${y}) on a ${this.mapWidth}x${this.mapHeight} grid`
      );
    }
    return block;
  }

  /**
   * Creates a playing field with all the things...
   * @param xBlocks The number on the x-axis
   * @param yBlocks The number on the y-axis
   */
  private createGrid = (xBlocks: number, yBlocks: number) => {
    let blockNumber = 0;
    // make Block a class...
    const blocks: IBlock[] = [];
    for (let y = 0; y < yBlocks; y++) {
      for (let x = 0; x < xBlocks; x++) {
        blocks.push({
          x,
          y,
          occupant: null,
          key: `P${blockNumber}`,
          isFlank: this.checkIfFlank(x, y, xBlocks, yBlocks),
          isEnds: this.checkIfEnds(x, y, xBlocks, yBlocks),
          Field: this,
        });
        // After each push increment the counter
        blockNumber++;
      }
    }

    return blocks;
  };
}

export interface ICoordinate {
  x: number;
  y: number;
}

export interface IBlock extends ICoordinate {
  key: string;
  occupant: IFieldPlayer | null;
  isFlank: boolean;
  isEnds: boolean;
  Field: Field;
}
