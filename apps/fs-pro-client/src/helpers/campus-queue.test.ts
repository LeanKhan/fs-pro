import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CampusAssetState,
  CampusState,
  CollectorState,
} from '@repo/api-contract';
import {
  buildersQueue,
  canCollectAll,
  collectableCollectors,
} from './campus-queue';

const NOW = '2026-10-10T12:00:00.000Z';
const nowMs = Date.parse(NOW);
const iso = (ms: number) => new Date(ms).toISOString();

function makeCampus(overrides: Partial<CampusState> = {}): CampusState {
  return {
    clubId: 'club-1',
    name: 'Test FC',
    code: 'TST',
    cash: 0,
    fans: 0,
    scoutTokens: 0,
    sponsorCredits: 0,
    standingPoints: 0,
    guardUntil: null,
    clubhouse: {
      tier: 1,
      maxTier: 5,
      upgradingTo: null,
      readyAt: null,
      missing: [],
    },
    collectors: [],
    vaults: [],
    groundskeepers: {
      count: 2,
      max: 6,
      active: 1,
      nextCost: 100,
      nextCurrency: 'sponsor_credits',
      nextEarnedBy: 'purchase',
    },
    obstacles: [],
    assets: [],
    now: NOW,
    ...overrides,
  };
}

function makeCollector(key: string, pending: number): CollectorState {
  return {
    key,
    name: key,
    currency: 'cash',
    productionPerHour: 1000,
    capacity: 5000,
    pending,
    collectedAt: NOW,
    full: pending >= 5000,
    secondsToFull: 0,
  };
}

function makeAsset(type: string, readyAtMs: number | null): CampusAssetState {
  return {
    type,
    name: type,
    level: 1,
    maxLevel: 5,
    currency: 'cash',
    upgrade:
      readyAtMs === null
        ? null
        : {
            toLevel: 2,
            startAt: NOW,
            readyAt: iso(readyAtMs),
            secondsLeft: 0,
          },
    next: null,
  };
}

describe('buildersQueue', () => {
  it('keeps only in-flight upgrades, soonest first, labelled from the server clock', () => {
    const campus = makeCampus({
      assets: [
        makeAsset('turnstiles', nowMs + 3 * 3_600_000 + 12 * 60_000),
        makeAsset('club_shop', null),
        makeAsset('stands', nowMs + 45_000),
      ],
    });
    const queue = buildersQueue(campus);
    assert.equal(queue.length, 2);
    assert.deepEqual(
      queue.map((job) => job.assetType),
      ['stands', 'turnstiles']
    );
    assert.deepEqual(
      queue.map((job) => job.label),
      ['45s', '3h 12m']
    );
    assert.equal(queue[0]!.toLevel, 2);
  });

  it('labels a finished upgrade "ready"', () => {
    const campus = makeCampus({
      assets: [makeAsset('stands', nowMs - 60_000)],
    });
    assert.equal(buildersQueue(campus)[0]!.label, 'ready');
  });

  it('is empty with no upgrades', () => {
    assert.deepEqual(buildersQueue(makeCampus()), []);
  });
});

describe('collectableCollectors / canCollectAll', () => {
  it('only offers collectors with a bankable unit', () => {
    const campus = makeCampus({
      collectors: [
        makeCollector('empty', 0),
        makeCollector('drip', 0.5),
        makeCollector('one', 1),
        makeCollector('full', 5000),
      ],
    });
    assert.deepEqual(
      collectableCollectors(campus).map((c) => c.key),
      ['one', 'full']
    );
    assert.equal(canCollectAll(campus), true);
  });

  it('is false when nothing has accrued', () => {
    const campus = makeCampus({
      collectors: [makeCollector('a', 0), makeCollector('b', 0.99)],
    });
    assert.equal(canCollectAll(campus), false);
    assert.deepEqual(collectableCollectors(campus), []);
  });
});
