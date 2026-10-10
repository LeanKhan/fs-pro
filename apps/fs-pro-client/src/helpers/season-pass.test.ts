import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceSeason,
  nextClaimableTier,
  ownedPerks,
  seasonProgress,
} from './season-pass';

const RAW = {
  clubId: 'c1',
  name: 'Lakeside FC',
  seasonKey: '2026-10',
  points: 1350,
  tier: 6,
  maxTier: 30,
  nextThreshold: 1400,
  hasPass: true,
  silverClaimedTier: 4,
  goldClaimedTier: 2,
  endsAt: '2026-10-31T23:59:59.000Z',
  objectives: [
    {
      id: 'season-kickoff',
      code: 'season-kickoff',
      title: 'Win your first ranked raid',
      points: 250,
      goal: 1,
      progress: 1,
      complete: true,
      claimed: true,
      scope: 'individual',
    },
    {
      id: 'raid-stars-15',
      code: 'raid-stars-15',
      title: 'Earn 15 raid stars',
      points: 350,
      goal: 15,
      progress: 9,
      complete: false,
      claimed: false,
      scope: 'individual',
    },
  ],
  tiers: [
    {
      tier: 5,
      points: 1200,
      silver: { cash: 25000, fans: 5000 },
      gold: { cash: 50000, fans: 12500, scoutTokens: 25, perks: { instant_finish: 1 } },
      silverClaimed: true,
      goldClaimed: true,
      silverClaimable: false,
      goldClaimable: false,
    },
    {
      tier: 6,
      points: 1400,
      silver: { cash: 30000, fans: 6000 },
      gold: { cash: 60000, fans: 15000, scoutTokens: 30, perks: { instant_finish: 1, research_finish: 1 } },
      silverClaimed: false,
      goldClaimed: false,
      silverClaimable: false,
      goldClaimable: true,
    },
    {
      tier: 7,
      points: 1600,
      silver: { cash: 35000, fans: 7000 },
      gold: { cash: 70000, fans: 17500, scoutTokens: 35 },
      silverClaimed: false,
      goldClaimed: false,
      silverClaimable: false,
      goldClaimable: false,
    },
  ],
  bank: {
    seasonKey: '2026-10',
    accrued: 25000,
    claimed: 0,
    claimable: 25000,
    open: false,
    endsAt: '2026-10-31T23:59:59.000Z',
  },
  perks: [
    { perk: 'resource_cache', name: 'Resource Cache', category: 'resource', count: 2 },
    { perk: 'instant_finish', name: 'Instant Finish', category: 'construction', count: 1 },
    { perk: 'research_finish', name: 'Research Finish', category: 'research', count: 0 },
  ],
  now: '2026-10-10T12:00:00.000Z',
};

describe('coerceSeason', () => {
  it('coerces the untyped Go payload into a render-safe view', () => {
    const season = coerceSeason(RAW);
    assert.ok(season);
    assert.equal(season.clubId, 'c1');
    assert.equal(season.points, 1350);
    assert.equal(season.tier, 6);
    assert.equal(season.hasPass, true);
    assert.equal(season.endsAt, '2026-10-31T23:59:59.000Z');
    assert.equal(season.now, '2026-10-10T12:00:00.000Z');
    assert.equal(season.objectives.length, 2);
    assert.equal(season.objectives[1]!.fill, 9 / 15);
    assert.equal(season.objectives[0]!.complete, true);
    assert.equal(season.tiers.length, 3);
    assert.deepEqual(
      season.tiers[1]!.gold.perks.map((p) => p.key),
      ['instant_finish', 'research_finish']
    );
    assert.equal(season.tiers[0]!.silver.isEmpty, false);
    assert.equal(season.bank.claimable, 25000);
    assert.equal(season.bank.open, false);
  });

  it('returns null for a malformed payload', () => {
    assert.equal(coerceSeason(null), null);
    assert.equal(coerceSeason({ name: 'No id' }), null);
    assert.equal(coerceSeason('nope'), null);
  });

  it('tolerates missing arrays', () => {
    const season = coerceSeason({ clubId: 'c1' });
    assert.ok(season);
    assert.deepEqual(season.objectives, []);
    assert.deepEqual(season.tiers, []);
    assert.deepEqual(season.perks, []);
    assert.equal(season.bank.claimable, 0);
  });
});

describe('seasonProgress', () => {
  it('measures between the bracketing tier thresholds', () => {
    const season = coerceSeason(RAW)!;
    assert.equal(season.progress.current, 1350);
    assert.equal(season.progress.next, 1400);
    // 1350 between 1200 and 1400 → 0.75.
    assert.equal(season.progress.pct, 0.75);
  });

  it('reports full progress past the last threshold', () => {
    const tiers = coerceSeason(RAW)!.tiers;
    const p = seasonProgress(9999, tiers);
    assert.equal(p.next, null);
    assert.equal(p.pct, 1);
  });
});

describe('ownedPerks', () => {
  it('drops perks the club does not own', () => {
    const season = coerceSeason(RAW)!;
    assert.deepEqual(
      ownedPerks(season).map((p) => `${p.key}:${p.count}`),
      ['resource_cache:2', 'instant_finish:1']
    );
  });
});

describe('nextClaimableTier', () => {
  it('finds the next Gold claim (the pass is owned)', () => {
    const season = coerceSeason(RAW)!;
    assert.equal(nextClaimableTier(season, 'gold')?.tier, 6);
  });
  it('returns null when nothing is claimable on a track', () => {
    const season = coerceSeason(RAW)!;
    assert.equal(nextClaimableTier(season, 'silver'), null);
  });
});
