import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GRID_STARTERS, validateGrid, type GridSlot } from '@repo/api-contract';
import { buildPreview, minTierForCells, type GridCell } from './pitch-grid';
import {
  candidateFromPlayer,
  GRID_PRESETS,
  presetMinTier,
  presetToGrid,
  type GridPreset,
  type SquadCandidate,
} from './pitch-grid-presets';

/** A preset as a real grid with placeholder ids, for the shared validator. */
function asGrid(preset: GridPreset): GridSlot[] {
  return preset.cells.map((c, i) => ({
    col: c.col,
    row: c.row,
    playerId: `p${i}`,
    position: c.position,
  }));
}

describe('GRID_PRESETS', () => {
  it('ships exactly the six named start points', () => {
    assert.deepEqual(
      GRID_PRESETS.map((p) => p.id),
      [
        '4-3-3',
        '4-4-2',
        'low-block',
        'wing-overload',
        'bunker-poacher',
        'high-press',
      ]
    );
    assert.deepEqual(
      GRID_PRESETS.map((p) => p.name),
      [
        '4-3-3',
        '4-4-2',
        'Low Block',
        'Wing Overload',
        'Bunker + Poacher',
        'High Press',
      ]
    );
  });

  for (const preset of GRID_PRESETS) {
    it(`${preset.name}: is a legal XI at its minimum tier, and gated below it`, () => {
      assert.equal(preset.cells.length, GRID_STARTERS, 'eleven cells');

      const keys = new Set(
        preset.cells.map((c: GridCell) => `${c.col},${c.row}`)
      );
      assert.equal(keys.size, GRID_STARTERS, 'no shared cells');

      for (const c of preset.cells) {
        assert.ok(
          c.col >= 0 && c.col < 9 && c.row >= 0 && c.row < 7,
          'in bounds'
        );
      }

      const keepers = preset.cells.filter((c) => c.position === 'GK');
      assert.equal(keepers.length, 1, 'exactly one keeper');
      assert.equal(keepers[0]!.col, 0, 'the keeper stands in X0');
      assert.equal(
        preset.cells.some((c) => c.position !== 'GK' && c.col === 0),
        false,
        'no outfield in the keeper zone'
      );

      const tier = presetMinTier(preset);
      assert.equal(tier, minTierForCells(preset.cells));
      assert.equal(validateGrid({ slots: asGrid(preset) }, tier), null);
      if (tier > 1) {
        assert.equal(
          validateGrid({ slots: asGrid(preset) }, tier - 1),
          'That column is locked until your Clubhouse reaches a higher tier'
        );
      }
    });
  }

  it('gives each Clubhouse band at least one shape', () => {
    const byTier = new Map<number, number>();
    for (const p of GRID_PRESETS) {
      byTier.set(presetMinTier(p), (byTier.get(presetMinTier(p)) ?? 0) + 1);
    }
    assert.equal(byTier.get(1), 1); // Low Block
    assert.equal(byTier.get(2), 1); // 4-4-2
    assert.ok((byTier.get(3) ?? 0) >= 1);
    assert.ok((byTier.get(4) ?? 0) >= 1);
  });

  it('Bunker + Poacher maroons a lone striker — Island, and long-ball-only', () => {
    const bunker = GRID_PRESETS.find((p) => p.id === 'bunker-poacher')!;
    const preview = buildPreview(asGrid(bunker));
    assert.ok(preview.synergies.includes('island'));
    // No connector in the middle: the graph is broken (03 §1.5) — the exact
    // teaching moment the editor's dashed-red state renders.
    assert.equal(preview.connected, false);
  });
});

function pool(): SquadCandidate[] {
  const out: SquadCandidate[] = [];
  out.push({ id: 'gk', position: 'GK', rating: 70 });
  for (let i = 0; i < 6; i++)
    out.push({ id: `d${i}`, position: 'DEF', rating: 60 + i });
  for (let i = 0; i < 6; i++)
    out.push({ id: `m${i}`, position: 'MID', rating: 60 + i });
  for (let i = 0; i < 6; i++)
    out.push({ id: `a${i}`, position: 'ATT', rating: 60 + i });
  return out;
}

describe('presetToGrid', () => {
  const fourThreeThree = GRID_PRESETS[0]!;

  it('assigns the best available matching player and yields a valid grid', () => {
    const slots = presetToGrid(fourThreeThree, pool());
    assert.equal(slots.length, GRID_STARTERS);
    assert.equal(validateGrid({ slots }, presetMinTier(fourThreeThree)), null);
    // The keeper cell is filled by the only keeper.
    const gk = slots.find((s) => s.col === 0)!;
    assert.equal(gk.playerId, 'gk');
    assert.equal(gk.position, 'GK');
    // Highest-rated defender takes the first defender cell.
    assert.equal(slots.find((s) => s.playerId === 'd5')?.position, 'DEF');
  });

  it('never uses the same player twice', () => {
    const slots = presetToGrid(fourThreeThree, pool());
    assert.equal(new Set(slots.map((s) => s.playerId)).size, slots.length);
  });

  it('skips injured players and leaves the keeper cell empty without a keeper', () => {
    const injuredKeeper = pool().map((p) =>
      p.id === 'gk' ? { ...p, injured: true } : p
    );
    const slots = presetToGrid(fourThreeThree, injuredKeeper);
    assert.equal(
      slots.some((s) => s.position === 'GK'),
      false
    );
    assert.equal(slots.length, GRID_STARTERS - 1);
    // Incomplete, never illegal-looking: the shared validator says why first.
    const expected = `A grid needs exactly ${GRID_STARTERS} players - you have ${GRID_STARTERS - 1}`;
    assert.equal(
      validateGrid({ slots }, presetMinTier(fourThreeThree)),
      String(expected)
    );
  });

  it('falls back to an outfield player for an outfield cell when no band fits', () => {
    const noAttackers = pool().filter((p) => p.position !== 'ATT');
    const slots = presetToGrid(fourThreeThree, noAttackers);
    assert.equal(slots.length, GRID_STARTERS);
    const attCell = slots.find((s) => s.col === 6)!;
    assert.notEqual(attCell, undefined);
    assert.notEqual(attCell.position, 'GK');
  });

  it('is deterministic', () => {
    assert.deepEqual(
      presetToGrid(fourThreeThree, pool()),
      presetToGrid(fourThreeThree, pool())
    );
  });
});

describe('candidateFromPlayer', () => {
  it('maps the club player shape and flags injuries', () => {
    const c = candidateFromPlayer({
      _id: 'p1',
      Position: 'ST',
      Rating: 77,
      Injury: { daysRemaining: 3 },
    });
    assert.deepEqual(c, {
      id: 'p1',
      position: 'ATT',
      rating: 77,
      injured: true,
    });
    assert.equal(candidateFromPlayer({ Position: 'GK' }), null);
  });
});
