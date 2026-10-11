import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGrid, type GridSlot } from '@repo/api-contract';
import {
  auraAt,
  buildPreview,
  canPlace,
  cellFromDataset,
  cellKey,
  chebyshev,
  coercePreview,
  columnLabel,
  columnLockReason,
  GRID_REASON,
  gridSignature,
  isColumnUnlocked,
  maxColumnForTier,
  minTierForCells,
  minTierForColumn,
  rowLabel,
  toGridPosition,
  type GridCell,
} from './pitch-grid';

const slot = (
  col: number,
  row: number,
  playerId: string,
  position: GridSlot['position']
): GridSlot => ({ col, row, playerId, position });

describe('toGridPosition', () => {
  it('maps keeper and detailed codes onto the four grid bands', () => {
    assert.equal(toGridPosition('GK'), 'GK');
    assert.equal(toGridPosition('CB'), 'DEF');
    assert.equal(toGridPosition('LB'), 'DEF');
    assert.equal(toGridPosition('DEF'), 'DEF');
    assert.equal(toGridPosition('CM'), 'MID');
    assert.equal(toGridPosition('CAM'), 'MID');
    assert.equal(toGridPosition('ST'), 'ATT');
    assert.equal(toGridPosition('LW'), 'ATT');
    assert.equal(toGridPosition('ATT'), 'ATT');
    // Unknown / empty falls back to midfield, never to a grid-breaking band.
    assert.equal(toGridPosition(''), 'MID');
    assert.equal(toGridPosition(null), 'MID');
  });
});

describe('tier gating (03 §1.3)', () => {
  it('inverts maxColumnForTier exactly', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const max = maxColumnForTier(tier);
      assert.equal(minTierForColumn(max), tier);
      assert.equal(isColumnUnlocked(tier, max), true);
    }
    assert.equal(minTierForColumn(0), 1);
    assert.equal(minTierForColumn(8), 5);
    assert.equal(
      minTierForCells([
        { col: 0, row: 3 },
        { col: 3, row: 4 },
      ]),
      1
    );
    assert.equal(
      minTierForCells([
        { col: 0, row: 3 },
        { col: 7, row: 1 },
      ]),
      4
    );
  });

  it('reports the exact server reason and nothing when unlocked', () => {
    assert.equal(columnLockReason(1, 5), GRID_REASON.lockedColumn);
    assert.equal(columnLockReason(1, 4), null);
    assert.equal(columnLockReason(5, 8), null);
  });
});

describe('validity vocabulary is pinned to the shared contract', () => {
  const valid: GridSlot[] = [
    slot(0, 3, 'gk', 'GK'),
    slot(1, 1, 'd1', 'DEF'),
    slot(1, 3, 'd2', 'DEF'),
    slot(1, 5, 'd3', 'DEF'),
    slot(3, 0, 'm1', 'MID'),
    slot(3, 2, 'm2', 'MID'),
    slot(3, 4, 'm3', 'MID'),
    slot(3, 6, 'm4', 'MID'),
    slot(4, 1, 'a1', 'ATT'),
    slot(4, 3, 'a2', 'ATT'),
    slot(4, 5, 'a3', 'ATT'),
  ];

  it('every named reason equals the contract output verbatim', () => {
    const offPitch = valid.map((s) => ({ ...s }));
    offPitch[9]!.row = 9;
    assert.equal(validateGrid({ slots: offPitch }, 5), GRID_REASON.offPitch);

    const locked = valid.map((s) => ({ ...s }));
    locked[9]!.col = 6;
    assert.equal(validateGrid({ slots: locked }, 1), GRID_REASON.lockedColumn);

    const overlap = valid.map((s) => ({ ...s }));
    overlap[1] = { ...overlap[1]!, col: overlap[2]!.col, row: overlap[2]!.row };
    assert.equal(validateGrid({ slots: overlap }, 5), GRID_REASON.occupied);

    const keeperOut = valid.map((s) => ({ ...s }));
    keeperOut[0] = { ...keeperOut[0]!, col: 2 };
    assert.equal(validateGrid({ slots: keeperOut }, 5), GRID_REASON.keeperZone);

    const outfieldIn = valid.map((s) => ({ ...s }));
    outfieldIn[1] = { ...outfieldIn[1]!, col: 0 };
    assert.equal(
      validateGrid({ slots: outfieldIn }, 5),
      GRID_REASON.onlyKeeper
    );

    const noKeeper = valid.map((s) => ({ ...s }));
    // Zero keepers: the keeper is pulled out of the goal zone entirely.
    noKeeper[0] = { ...noKeeper[0]!, col: 2, row: 2, position: 'DEF' };
    assert.equal(validateGrid({ slots: noKeeper }, 5), GRID_REASON.oneKeeper);

    assert.equal(validateGrid({ slots: valid }, 5), null);
  });
});

describe('canPlace (advisory single-slot mirror)', () => {
  const base = [slot(0, 3, 'gk', 'GK'), slot(2, 3, 'd', 'DEF')];
  it('accepts a legal placement and rejects each illegal one with the reason', () => {
    assert.deepEqual(canPlace(base, { col: 5, row: 1 }, 'MID', 5), {
      ok: true,
      reason: null,
    });
    assert.equal(
      canPlace(base, { col: 5, row: 1 }, 'MID', 1).reason,
      GRID_REASON.lockedColumn
    );
    assert.equal(
      canPlace(base, { col: 9, row: 1 }, 'MID', 5).reason,
      GRID_REASON.offPitch
    );
    assert.equal(
      canPlace(base, { col: 2, row: 1 }, 'GK', 5).reason,
      GRID_REASON.keeperZone
    );
    assert.equal(
      canPlace(base, { col: 0, row: 1 }, 'MID', 5).reason,
      GRID_REASON.onlyKeeper
    );
    // Replacing an occupant is allowed (the editor moves it back to the rail).
    assert.equal(canPlace(base, { col: 2, row: 3 }, 'DEF', 5).ok, true);
  });
});

describe('cellFromDataset', () => {
  it('accepts only live cells', () => {
    assert.deepEqual(cellFromDataset({ col: '3', row: '4' }), {
      col: 3,
      row: 4,
    });
    assert.equal(cellFromDataset({ col: 'abc', row: '4' }), null);
    assert.equal(cellFromDataset({ col: '9', row: '0' }), null);
    assert.equal(cellFromDataset({ col: '0', row: '-1' }), null);
    assert.equal(cellFromDataset(null), null);
    assert.equal(cellFromDataset({}), null);
  });
});

describe('chebyshev / labels', () => {
  it('is the king-move distance', () => {
    assert.equal(chebyshev({ col: 0, row: 3 }, { col: 2, row: 1 }), 2);
    assert.equal(chebyshev({ col: 0, row: 0 }, { col: 8, row: 0 }), 8);
    assert.equal(chebyshev({ col: 4, row: 3 }, { col: 4, row: 3 }), 0);
  });
  it('labels columns and rows like the spec', () => {
    assert.equal(columnLabel(0), 'X0');
    assert.equal(columnLabel(8), 'X8');
    assert.equal(rowLabel(3), 'Y3');
    assert.equal(cellKey(2, 5), '2,5');
  });
});

describe('buildPreview — auras (mirrors Go 03 §1.4, OW-P01)', () => {
  it('projects the band-derived weights; keeper projects nothing', () => {
    // MID ≈ midfield engine: radius 1, weighted higher (own 1, neighbours ½).
    const mid = buildPreview([slot(4, 3, 'm', 'MID')]);
    assert.equal(mid.aura.length, 63);
    assert.equal(auraAt(mid, 4, 3), 1);
    assert.equal(auraAt(mid, 3, 2), 0.5);
    assert.equal(auraAt(mid, 4, 2), 0.5);
    assert.equal(auraAt(mid, 5, 4), 0.5);
    // Two cells away is out of the aura.
    assert.equal(auraAt(mid, 4, 5), 0);
    assert.equal(auraAt(mid, 6, 3), 0);

    // DEF ≈ Anchor/Tank: radius 1 incl. diagonals, own 0.8 / neighbours 0.4.
    const def = buildPreview([slot(4, 3, 'd', 'DEF')]);
    assert.equal(auraAt(def, 4, 3), 0.8);
    assert.equal(auraAt(def, 3, 3), 0.4);
    assert.equal(auraAt(def, 3, 2), 0.4);
    assert.equal(auraAt(def, 6, 3), 0);

    // ATT ≈ Sniper/Playmaker: soft — its own cell only, at 0.5.
    const att = buildPreview([slot(4, 3, 'a', 'ATT')]);
    assert.equal(auraAt(att, 4, 3), 0.5);
    assert.equal(auraAt(att, 3, 3), 0);
    assert.equal(auraAt(att, 4, 2), 0);

    // A lone keeper adds nothing.
    const gk = buildPreview([slot(0, 3, 'gk', 'GK')]);
    assert.equal(
      gk.aura.every((v) => v === 0),
      true
    );
  });

  it('stacks overlaps with diminishing returns p = 1 − Π(1 − pᵢ)', () => {
    // Two stacked defenders: additive would be 1.2, the product is
    // 0.8 + 0.4·(1 − 0.8) = 0.88 on each shared cell.
    const defs = buildPreview([slot(1, 3, 'a', 'DEF'), slot(1, 4, 'b', 'DEF')]);
    assert.equal(auraAt(defs, 1, 3), 0.88);
    assert.equal(auraAt(defs, 1, 4), 0.88);
    // Two MIDs: own cells saturate at 1; the shared diagonal edge sees
    // 1 − (1 − 0.5)² = 0.75.
    const mids = buildPreview([slot(4, 3, 'a', 'MID'), slot(4, 4, 'b', 'MID')]);
    assert.equal(auraAt(mids, 4, 3), 1);
    assert.equal(auraAt(mids, 4, 4), 1);
    assert.equal(auraAt(mids, 3, 3), 0.75);
    // Pressure is a probability: never below 0, never above 1.
    assert.ok(mids.aura.every((v) => v >= 0 && v <= 1));
  });

  it('is deterministic', () => {
    const slots = [slot(0, 3, 'gk', 'GK'), slot(2, 1, 'd', 'DEF')];
    assert.deepEqual(buildPreview(slots), buildPreview(slots));
  });
});

describe('buildPreview — passing links (03 §1.5)', () => {
  it('links pairs within 2 cells (Chebyshev, diagonals included), keeper too', () => {
    const p = buildPreview([
      slot(0, 3, 'gk', 'GK'),
      slot(1, 3, 'd', 'DEF'),
      slot(2, 1, 'd2', 'DEF'),
      slot(5, 3, 'm', 'MID'),
    ]);
    const pairs = p.links.map((l) => `${l.from}>${l.to}`);
    assert.deepEqual(pairs, ['gk>d', 'gk>d2', 'd>d2']);
    // m stands 3 cells from d2: no link.
    assert.equal(
      p.links.some((l) => l.from === 'm' || l.to === 'm'),
      false
    );
  });

  it('exactly 2 cells links; 3 does not', () => {
    const two = buildPreview([slot(0, 0, 'a', 'DEF'), slot(2, 0, 'b', 'DEF')]);
    assert.equal(two.links.length, 1);
    const three = buildPreview([
      slot(0, 0, 'a', 'DEF'),
      slot(3, 0, 'b', 'DEF'),
    ]);
    assert.equal(three.links.length, 0);
  });
});

describe('buildPreview — connectivity & directness (03 §1.5)', () => {
  it('a connected chain from the keeper has directness 0.3', () => {
    const p = buildPreview([
      slot(0, 3, 'gk', 'GK'),
      slot(1, 3, 'd', 'DEF'),
      slot(3, 3, 'm', 'MID'),
      slot(4, 3, 'a', 'ATT'),
    ]);
    assert.equal(p.connected, true);
    assert.equal(p.directness, 0.3);
  });

  it('a broken graph is disconnected and raises directness (0.3 + 0.5·(1−f))', () => {
    const p = buildPreview([
      slot(0, 3, 'gk', 'GK'),
      slot(8, 0, 'a1', 'ATT'),
      slot(8, 3, 'a2', 'ATT'),
      slot(8, 6, 'a3', 'ATT'),
    ]);
    assert.equal(p.connected, false);
    // Only the keeper is reachable: f = ¼.
    assert.equal(p.directness, 0.3 + 0.5 * (1 - 1 / 4));
  });

  it('an empty grid is not connected and has directness 0.8', () => {
    const p = buildPreview([]);
    assert.equal(p.connected, false);
    // n === 0 → fraction 0 → 0.3 + 0.5.
    assert.equal(p.directness, 0.8);
  });
});

describe('buildPreview — synergies (03 §1.6)', () => {
  it('one-two-combo: two attackers in adjacent cells', () => {
    const p = buildPreview([slot(5, 1, 'a', 'ATT'), slot(5, 2, 'b', 'ATT')]);
    assert.deepEqual(p.synergies, ['one-two-combo']);
  });

  it('the-shield: two central mids adjacent; central lanes only', () => {
    const central = buildPreview([
      slot(3, 3, 'm', 'MID'),
      slot(3, 4, 'n', 'MID'),
    ]);
    assert.deepEqual(central.synergies, ['the-shield']);
    // Same adjacency but on the wings (rows 0/1) is not a shield.
    const wing = buildPreview([slot(3, 0, 'm', 'MID'), slot(3, 1, 'n', 'MID')]);
    assert.deepEqual(wing.synergies, []);
  });

  it('island: an attacker ≥3 columns from every teammate (OW-P02)', () => {
    const marooned = buildPreview([
      slot(8, 0, 'a', 'ATT'),
      slot(5, 3, 'm', 'MID'),
    ]);
    assert.deepEqual(marooned.synergies, ['island']);
    const close = buildPreview([
      slot(8, 0, 'a', 'ATT'),
      slot(6, 1, 'm', 'MID'),
    ]);
    assert.deepEqual(close.synergies, []);
  });

  it('island is measured in columns, not Chebyshev cells', () => {
    // Same column (dx = 0) but Chebyshev 5: not far enough in x.
    const sameColumn = buildPreview([
      slot(3, 0, 'a', 'ATT'),
      slot(3, 5, 'm', 'MID'),
    ]);
    assert.deepEqual(sameColumn.synergies, []);
    // Three columns away in adjacent rows: provably an island.
    const threeColumns = buildPreview([
      slot(6, 3, 'a', 'ATT'),
      slot(3, 4, 'm', 'MID'),
    ]);
    assert.deepEqual(threeColumns.synergies, ['island']);
  });

  it('lists synergies in the fixed Go order', () => {
    const p = buildPreview([
      slot(5, 1, 'a', 'ATT'),
      slot(5, 2, 'b', 'ATT'),
      slot(3, 3, 'm', 'MID'),
      slot(3, 4, 'n', 'MID'),
      slot(8, 0, 'lonely', 'ATT'),
    ]);
    assert.deepEqual(p.synergies, ['one-two-combo', 'the-shield', 'island']);
  });
});

describe('buildPreview — Go parity (golden layout)', () => {
  // The exact `validGrid()` the Go `TestCompileShapeGolden` pins (03 §1.4-1.6).
  // If the Go model and this mirror ever drift, one of the two fails.
  const valid: GridSlot[] = [
    slot(0, 3, 'gk', 'GK'),
    slot(1, 1, 'd1', 'DEF'),
    slot(1, 3, 'd2', 'DEF'),
    slot(1, 5, 'd3', 'DEF'),
    slot(3, 0, 'm1', 'MID'),
    slot(3, 2, 'm2', 'MID'),
    slot(3, 4, 'm3', 'MID'),
    slot(3, 6, 'm4', 'MID'),
    slot(4, 1, 'a1', 'ATT'),
    slot(4, 3, 'a2', 'ATT'),
    slot(4, 5, 'a3', 'ATT'),
  ];

  it('reproduces the Go golden aura exactly', () => {
    const p = buildPreview(valid);
    const goldenAura = [
      0.4, 0.4, 0.7, 1, 0.5, 0, 0, 0, 0,
      0.4, 0.8, 0.85, 0.75, 0.875, 0, 0, 0, 0,
      0.64, 0.64, 0.8200000000000001, 1, 0.5, 0, 0, 0, 0,
      0.4, 0.8, 0.85, 0.75, 0.875, 0, 0, 0, 0,
      0.64, 0.64, 0.8200000000000001, 1, 0.5, 0, 0, 0, 0,
      0.4, 0.8, 0.85, 0.75, 0.875, 0, 0, 0, 0,
      0.4, 0.4, 0.7, 1, 0.5, 0, 0, 0, 0,
    ];
    assert.deepEqual(p.aura, goldenAura);
    // Unchanged verdicts (links/directness/connectivity are not part of OW-P01/02).
    assert.equal(p.connected, true);
    assert.equal(p.directness, 0.3);
    assert.deepEqual(p.synergies, []);
    assert.equal(p.links.length, 22);
  });
});

describe('coercePreview (server reconcile guard)', () => {
  it('accepts a well-formed server preview', () => {
    const shaped = buildPreview([
      slot(0, 3, 'gk', 'GK'),
      slot(1, 3, 'd', 'DEF'),
    ]);
    const parsed = coercePreview(JSON.parse(JSON.stringify(shaped)));
    assert.deepEqual(parsed, shaped);
  });

  it('rejects malformed payloads instead of throwing', () => {
    assert.equal(coercePreview(null), null);
    assert.equal(coercePreview('nope'), null);
    assert.equal(coercePreview({}), null);
    assert.equal(
      coercePreview({ aura: [1, 2], connected: true, directness: 0.3 }),
      null
    );
    const good = buildPreview([slot(0, 3, 'gk', 'GK')]);
    assert.equal(coercePreview({ ...good, connected: 'yes' }), null);
    // Unknown synergy ids are dropped, not surfaced.
    const withJunk = coercePreview({
      ...good,
      synergies: ['island', 'not-real'],
    });
    assert.deepEqual(withJunk?.synergies, ['island']);
  });
});

describe('gridSignature', () => {
  it('is order-independent and changes when the shape or assignment changes', () => {
    const a: GridSlot[] = [slot(0, 3, 'gk', 'GK'), slot(1, 3, 'd', 'DEF')];
    const b: GridSlot[] = [slot(1, 3, 'd', 'DEF'), slot(0, 3, 'gk', 'GK')];
    assert.equal(gridSignature(a), gridSignature(b));
    const moved: GridSlot[] = [slot(0, 3, 'gk', 'GK'), slot(2, 3, 'd', 'DEF')];
    assert.notEqual(gridSignature(a), gridSignature(moved));
    const swapped: GridSlot[] = [
      slot(0, 3, 'other', 'GK'),
      slot(1, 3, 'd', 'DEF'),
    ];
    assert.notEqual(gridSignature(a), gridSignature(swapped));
  });
});

describe('cell helper shape', () => {
  it('cells are plain coordinates', () => {
    const c: GridCell = { col: 1, row: 2 };
    assert.deepEqual(c, { col: 1, row: 2 });
  });
});
