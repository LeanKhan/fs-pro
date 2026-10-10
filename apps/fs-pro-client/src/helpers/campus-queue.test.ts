import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CampusAssetState,
  CampusState,
  CollectorState,
  VaultState,
} from '@repo/api-contract';
import {
  buildersQueue,
  canCollectAll,
  campusTimers,
  collectableCollectors,
  collectorViews,
  currencyLabel,
  optimisticallyCollected,
  vaultsView,
} from './campus-queue';
import { formatCountdown } from './countdown';

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
    perks: [],
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

describe('currencyLabel', () => {
  it('names every campus currency and passes an unknown through', () => {
    assert.equal(currencyLabel('cash'), 'Cash');
    assert.equal(currencyLabel('fans'), 'Fans');
    assert.equal(currencyLabel('scout_tokens'), 'Scout Tokens');
    assert.equal(currencyLabel('sponsor_credits'), 'Sponsor Credits');
    assert.equal(currencyLabel('gems'), 'gems');
  });
});

describe('vaultsView', () => {
  const vault = (
    currency: VaultState['currency'],
    balance: number,
    capacity: number,
    level = 1
  ): VaultState => ({ currency, level, balance, capacity });

  it('maps balance/cap to a clamped fill and a full flag', () => {
    const campus = makeCampus({
      vaults: [
        vault('cash', 500, 2000),
        vault('fans', 3000, 2000, 3),
        vault('scout_tokens', 0, 0),
      ],
    });
    const views = vaultsView(campus);
    assert.deepEqual(
      views.map((v) => v.label),
      ['Cash', 'Fans', 'Scout Tokens']
    );
    assert.equal(views[0]!.fill, 0.25);
    assert.equal(views[0]!.full, false);
    assert.equal(views[1]!.fill, 1);
    assert.equal(views[1]!.full, true);
    assert.equal(views[1]!.level, 3);
    // No capacity → no fill and never "full".
    assert.equal(views[2]!.fill, 0);
    assert.equal(views[2]!.full, false);
  });
});

describe('collectorViews', () => {
  it('derives an absolute fill instant from collectedAt + secondsToFull', () => {
    const campus = makeCampus({
      collectors: [
        {
          key: 'shop',
          name: 'Shop',
          currency: 'cash',
          productionPerHour: 1000,
          capacity: 5000,
          pending: 1250,
          collectedAt: NOW,
          full: false,
          secondsToFull: 13_500,
        },
      ],
    });
    const [c] = collectorViews(campus);
    assert.equal(c!.label, 'Cash');
    assert.equal(c!.fill, 0.25);
    assert.equal(c!.full, false);
    assert.equal(c!.fullAt, iso(nowMs + 13_500_000));
    assert.equal(formatCountdown(c!.fullAt, campus.now), '3h 45m');
  });

  it('points an already-full collector at a past, ready instant', () => {
    const campus = makeCampus({
      collectors: [
        {
          key: 'full',
          name: 'Full',
          currency: 'fans',
          productionPerHour: 1000,
          capacity: 5000,
          pending: 5000,
          collectedAt: NOW,
          full: true,
          secondsToFull: 0,
        },
      ],
    });
    const [c] = collectorViews(campus);
    assert.equal(c!.full, true);
    assert.equal(formatCountdown(c!.fullAt, campus.now), 'ready');
  });
});

describe('campusTimers (countdown wiring, 04 §12)', () => {
  it('anchors every running timer to campus.now as an absolute instant', () => {
    const campus = makeCampus({
      clubhouse: {
        tier: 2,
        maxTier: 5,
        upgradingTo: 3,
        readyAt: iso(nowMs + 2 * 86_400_000),
        missing: [],
      },
      guardUntil: iso(nowMs + 2 * 3_600_000),
      assets: [makeAsset('stands', nowMs + 45_000)],
    });
    const timers = campusTimers(campus);
    assert.deepEqual(
      timers.map((t) => t.kind),
      ['clubhouse', 'build', 'guard']
    );
    assert.deepEqual(
      timers.map((t) => t.label),
      ['Clubhouse → T3', 'stands → L2', 'Pre-Match Buffer']
    );
    for (const t of timers) {
      assert.equal(t.serverNow, campus.now);
      assert.equal(Number.isNaN(Date.parse(t.at)), false);
      assert.equal(
        formatCountdown(t.at, t.serverNow),
        formatCountdown(t.at, campus.now)
      );
    }
    assert.equal(formatCountdown(timers[0]!.at, campus.now), '2d');
    assert.equal(formatCountdown(timers[1]!.at, campus.now), '45s');
    assert.equal(formatCountdown(timers[2]!.at, campus.now), '2h');
  });

  it('is empty for a settled campus', () => {
    assert.deepEqual(campusTimers(makeCampus()), []);
  });

  it('leaves the absolute deadline untouched as the server clock advances', () => {
    const at = iso(nowMs + 3_600_000);
    const clubhouse = {
      tier: 1,
      maxTier: 5,
      upgradingTo: 2,
      readyAt: at,
      missing: [],
    };
    const early = campusTimers(
      makeCampus({ clubhouse, now: iso(nowMs) })
    )[0]!;
    const late = campusTimers(
      makeCampus({ clubhouse, now: iso(nowMs + 3_000_000) })
    )[0]!;
    assert.equal(early.at, late.at);
    assert.notEqual(early.serverNow, late.serverNow);
    assert.equal(formatCountdown(early.at, early.serverNow), '1h');
    assert.equal(formatCountdown(late.at, late.serverNow), '10m');
  });
});

describe('optimisticallyCollected (optimistic timer, authoritative state)', () => {
  it('zeroes pending, restarts accrual at server now, and resets the fill timer', () => {
    const campus = makeCampus({
      collectors: [
        {
          key: 'shop',
          name: 'Shop',
          currency: 'cash',
          productionPerHour: 1000,
          capacity: 5000,
          pending: 1250,
          collectedAt: iso(nowMs - 60_000),
          full: false,
          secondsToFull: 13_500,
        },
      ],
    });
    const optimistic = optimisticallyCollected(campus);
    const [c] = optimistic.collectors;
    assert.equal(c!.pending, 0);
    assert.equal(c!.full, false);
    assert.equal(c!.collectedAt, campus.now);
    // capacity / rate * 3600 = 5000 / 1000 * 3600.
    assert.equal(c!.secondsToFull, 18_000);
    // It is a copy: the source campus is untouched.
    assert.equal(campus.collectors[0]!.pending, 1250);
  });

  it('is a no-op for a collector with no production', () => {
    const campus = makeCampus({
      collectors: [
        {
          key: 'idle',
          name: 'Idle',
          currency: 'fans',
          productionPerHour: 0,
          capacity: 0,
          pending: 0,
          collectedAt: NOW,
          full: false,
          secondsToFull: 0,
        },
      ],
    });
    assert.equal(
      optimisticallyCollected(campus).collectors[0]!.secondsToFull,
      0
    );
  });
});
