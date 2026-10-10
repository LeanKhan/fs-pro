import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GRID_STARTERS,
  cellToNorm,
  compileGrid,
  maxColumnForTier,
  positionForColumn,
  validateGrid,
  type PitchGrid,
} from './grid';

/** The same legal tier-1 layout the Go server's `validGrid()` test uses. */
function validGrid(): PitchGrid {
  return {
    slots: [
      { col: 0, row: 3, playerId: 'gk', position: 'GK' },
      { col: 1, row: 1, playerId: 'd1', position: 'DEF' },
      { col: 1, row: 3, playerId: 'd2', position: 'DEF' },
      { col: 1, row: 5, playerId: 'd3', position: 'DEF' },
      { col: 3, row: 0, playerId: 'm1', position: 'MID' },
      { col: 3, row: 2, playerId: 'm2', position: 'MID' },
      { col: 3, row: 4, playerId: 'm3', position: 'MID' },
      { col: 3, row: 6, playerId: 'm4', position: 'MID' },
      { col: 4, row: 1, playerId: 'a1', position: 'ATT' },
      { col: 4, row: 3, playerId: 'a2', position: 'ATT' },
      { col: 4, row: 5, playerId: 'a3', position: 'ATT' },
    ],
  };
}

describe('pitch grid (parity with apps/fs-pro-server-go/internal/grid)', () => {
  it('maxColumnForTier', () => {
    assert.equal(maxColumnForTier(0), 4);
    assert.equal(maxColumnForTier(1), 4);
    assert.equal(maxColumnForTier(2), 5);
    assert.equal(maxColumnForTier(3), 6);
    assert.equal(maxColumnForTier(5), 8);
    assert.equal(maxColumnForTier(9), 8);
  });

  it('positionForColumn', () => {
    assert.equal(positionForColumn(0), 'GK');
    assert.equal(positionForColumn(1), 'DEF');
    assert.equal(positionForColumn(2), 'DEF');
    assert.equal(positionForColumn(3), 'MID');
    assert.equal(positionForColumn(5), 'MID');
    assert.equal(positionForColumn(6), 'ATT');
    assert.equal(positionForColumn(8), 'ATT');
  });

  it('cellToNorm', () => {
    assert.deepEqual(cellToNorm(0, 0), { x: 0.5 / 9, y: 0.5 / 7 });
    assert.deepEqual(cellToNorm(8, 6), { x: 8.5 / 9, y: 6.5 / 7 });
  });

  it('accepts a valid grid', () => {
    assert.equal(validateGrid(validGrid(), 1), null);
  });

  it('reports the exact reason strings the Go server uses', () => {
    const locked = validGrid();
    locked.slots[8]!.col = 5;
    assert.equal(
      validateGrid(locked, 1),
      'That column is locked until your Clubhouse reaches a higher tier'
    );
    assert.equal(validateGrid(locked, 2), null);

    const overlap = validGrid();
    overlap.slots[1]!.col = overlap.slots[2]!.col;
    overlap.slots[1]!.row = overlap.slots[2]!.row;
    assert.equal(
      validateGrid(overlap, 1),
      'Two players cannot stand in the same cell'
    );

    const offPitch = validGrid();
    offPitch.slots[8]!.row = 7;
    assert.equal(validateGrid(offPitch, 1), 'A player is off the pitch');

    const keeperOut = validGrid();
    keeperOut.slots[0]!.col = 2;
    assert.equal(
      validateGrid(keeperOut, 3),
      'The goalkeeper must stand in the goal zone (column X0)'
    );

    const twoKeepers = validGrid();
    twoKeepers.slots[1] = { col: 0, row: 5, playerId: 'd1', position: 'GK' };
    assert.equal(
      validateGrid(twoKeepers, 1),
      'A grid needs exactly one goalkeeper'
    );

    const outfieldInZone = validGrid();
    outfieldInZone.slots[1]!.col = 0;
    assert.equal(
      validateGrid(outfieldInZone, 1),
      'Only the goalkeeper may stand in the goal zone'
    );

    const short = validGrid();
    short.slots = short.slots.slice(0, 10);
    assert.equal(
      validateGrid(short, 1),
      `A grid needs exactly ${GRID_STARTERS} players - you have 10`
    );
  });

  it('compiles deterministically to sim-core anchors', () => {
    const first = compileGrid(validGrid());
    const second = compileGrid(validGrid());
    assert.equal(first.length, GRID_STARTERS);
    assert.deepEqual(first, second);
    assert.deepEqual(first[0], {
      playerId: 'gk',
      position: 'GK',
      x: 0.5 / 9,
      y: 3.5 / 7,
    });
  });
});
