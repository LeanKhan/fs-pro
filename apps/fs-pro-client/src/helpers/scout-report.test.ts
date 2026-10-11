import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GridSlot } from '@repo/api-contract';
import {
  coerceScoutReport,
  laneLabel,
  normalizeOccupancy,
  occupancyOfGrid,
  powerBand,
  type ScoutReportView,
} from './scout-report';

const slot = (
  col: number,
  row: number,
  playerId: string,
  position: GridSlot['position']
): GridSlot => ({ col, row, playerId, position });

/** A server-shaped scout report: the opponent's Home Grid plus the threat read. */
function rawReport(): Record<string, unknown> {
  return {
    opponent: { id: 'opp', name: 'Rivals', code: 'RIV', power: 150 },
    tier: 4,
    league: 'Silver II',
    scoutingLevel: 0,
    rating: { low: 45, high: 75 },
    homeGrid: {
      slots: [
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
      ],
    },
    threat: {
      lanes: [
        { name: 'centre', players: 4, share: 0.4 },
        { name: 'left', players: 3, share: 0.3 },
        { name: 'right', players: 3, share: 0.3 },
      ],
      occupancy: [0, 3, 0, 4, 3, 0, 0, 0, 0],
      attacking: 0,
      highLine: true,
    },
    notes: ['Build a Scouting Department to sharpen this read.'],
  };
}

describe('powerBand', () => {
  it('labels the range and normalises an inverted pair', () => {
    assert.deepEqual(powerBand(45, 75), { low: 45, high: 75, label: '45–75' });
    assert.deepEqual(powerBand(75, 45), { low: 45, high: 75, label: '45–75' });
    assert.equal(powerBand(60, 60).label, '60–60');
  });
});

describe('laneLabel', () => {
  it('names the three width lanes and passes unknowns through', () => {
    assert.equal(laneLabel('left'), 'Left flank');
    assert.equal(laneLabel('centre'), 'Centre');
    assert.equal(laneLabel('right'), 'Right flank');
    assert.equal(laneLabel('sweeper'), 'sweeper');
  });
});

describe('normalizeOccupancy', () => {
  it('always returns a length-9 (X0..X8) clamped array', () => {
    assert.deepEqual(normalizeOccupancy([0, 3, 0, 4, 3]), [
      0, 3, 0, 4, 3, 0, 0, 0, 0,
    ]);
    // Extra columns are dropped; negatives and junk floor to zero.
    assert.deepEqual(normalizeOccupancy([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    assert.deepEqual(normalizeOccupancy([-2, 'x', null]), [
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    assert.deepEqual(normalizeOccupancy(null), [
      0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('occupancyOfGrid', () => {
  it('counts outfield players per column and ignores the keeper', () => {
    const grid: GridSlot[] = [
      slot(0, 3, 'gk', 'GK'),
      slot(1, 1, 'd1', 'DEF'),
      slot(1, 5, 'd3', 'DEF'),
      slot(3, 4, 'm3', 'MID'),
    ];
    assert.deepEqual(occupancyOfGrid(grid), [
      0, 2, 0, 1, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('coerceScoutReport', () => {
  it('coerces a well-formed report, masked to a band', () => {
    const view = coerceScoutReport(rawReport()) as ScoutReportView;
    assert.ok(view);
    assert.deepEqual(view.opponent, { id: 'opp', name: 'Rivals', code: 'RIV' });
    assert.equal(view.tier, 4);
    assert.equal(view.league, 'Silver II');
    assert.equal(view.scoutingLevel, 0);
    assert.deepEqual(view.band, { low: 45, high: 75, label: '45–75' });
    assert.equal(view.hasGrid, true);
    assert.equal(view.homeGrid?.length, 11);
    assert.deepEqual(view.occupancy, [0, 3, 0, 4, 3, 0, 0, 0, 0]);
    assert.equal(view.lanes[0]!.name, 'centre');
    assert.equal(view.attacking, 0);
    assert.equal(view.highLine, true);
    assert.deepEqual(view.notes, [
      'Build a Scouting Department to sharpen this read.',
    ]);
  });

  it('never carries the exact rating or power through', () => {
    const view = coerceScoutReport(rawReport()) as ScoutReportView;
    assert.equal('power' in view.opponent, false);
    assert.equal('rating' in view, false);
  });

  it('returns null when there is no identifiable opponent', () => {
    assert.equal(coerceScoutReport(null), null);
    assert.equal(coerceScoutReport('nope'), null);
    assert.equal(coerceScoutReport({}), null);
    assert.equal(coerceScoutReport({ opponent: {} }), null);
  });

  it('handles a club with no Home Grid: null grid, zeroed occupancy', () => {
    const raw = rawReport();
    raw.homeGrid = null;
    raw.threat = null;
    raw.notes = ['They have not set a Home Grid yet.'];
    const view = coerceScoutReport(raw) as ScoutReportView;
    assert.equal(view.hasGrid, false);
    assert.equal(view.homeGrid, null);
    assert.deepEqual(view.occupancy, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(view.lanes, []);
    assert.equal(view.highLine, false);
    assert.equal(view.league, 'Silver II');
  });

  it('derives occupancy from the grid when the threat read is missing', () => {
    const raw = rawReport();
    raw.threat = null;
    const view = coerceScoutReport(raw) as ScoutReportView;
    // Same rule as Go ThreatReadOf: keeper ignored, outfield counted per column.
    assert.deepEqual(view.occupancy, [0, 3, 0, 4, 3, 0, 0, 0, 0]);
    assert.deepEqual(view.lanes, []);
    assert.equal(view.hasGrid, true);
  });

  it('drops off-pitch and malformed slots instead of throwing', () => {
    const raw = rawReport();
    raw.homeGrid = {
      slots: [
        slot(0, 3, 'gk', 'GK'),
        { col: 99, row: 3, playerId: 'bad', position: 'DEF' },
        { col: 1, row: 1, playerId: 'ok', position: 'GOALKEEPER' },
        { col: 2, row: 2, playerId: 'ok2', position: 'MID' },
        'junk',
      ],
    };
    const view = coerceScoutReport(raw) as ScoutReportView;
    assert.deepEqual(view.homeGrid, [
      { col: 0, row: 3, playerId: 'gk', position: 'GK' },
      { col: 2, row: 2, playerId: 'ok2', position: 'MID' },
    ]);
  });

  it('defaults missing scalars safely', () => {
    const view = coerceScoutReport({
      opponent: { id: 'opp' },
    }) as ScoutReportView;
    assert.equal(view.opponent.name, 'Opponent');
    assert.equal(view.opponent.code, '');
    assert.equal(view.tier, 1);
    assert.equal(view.league, 'Unranked');
    assert.equal(view.scoutingLevel, 0);
    assert.deepEqual(view.band, { low: 0, high: 0, label: '0–0' });
    assert.equal(view.hasGrid, false);
    assert.deepEqual(view.notes, []);
  });
});
