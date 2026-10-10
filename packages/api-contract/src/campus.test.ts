import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { campusContract } from './routes/campus';
import {
  CampusStateSchema,
  PlaceRequestSchema,
  UpgradeRequestSchema,
  UsePerkRequestSchema,
  type CampusState,
} from './schemas/campus';
import { LayoutsSchema, PitchGridDocumentSchema } from './schemas/layout';

/** A payload with exactly the shape the Go campus handler emits. */
function sampleCampus(): CampusState {
  return {
    clubId: 'c1',
    name: 'Test United',
    code: 'TST',
    cash: 12345,
    fans: 67,
    scoutTokens: 8,
    sponsorCredits: 9,
    standingPoints: 2500,
    guardUntil: null,
    clubhouse: {
      tier: 3,
      maxTier: 5,
      upgradingTo: 4,
      readyAt: '2026-10-10T12:30:00.000Z',
      missing: [{ facility: 'coaching_dept', level: 2 }],
    },
    collectors: [
      {
        key: 'turnstiles',
        name: 'Turnstiles',
        currency: 'cash',
        productionPerHour: 1800,
        capacity: 43200,
        pending: 9000,
        collectedAt: '2026-10-10T07:00:00.000Z',
        full: false,
        secondsToFull: 1000,
      },
    ],
    vaults: [{ currency: 'cash', level: 2, capacity: 43200, balance: 12345 }],
    groundskeepers: {
      count: 3,
      max: 6,
      active: 1,
      nextCost: 500,
      nextCurrency: 'sponsor_credits',
      nextEarnedBy: 'purchase',
    },
    obstacles: [{ id: 'o1', kind: 'weeds', x: 1, z: 2, rot: 0, clearCost: 500, clearBonus: 50 }],
    perks: [
      { key: 'cash_cache', name: 'Cash Cache', count: 2 },
      { key: 'fan_cache', name: 'Fan Cache', count: 0 },
      { key: 'talent_cache', name: 'Talent Cache', count: 1 },
    ],
    assets: [
      {
        type: 'clubhouse',
        name: 'Clubhouse',
        level: 3,
        maxLevel: 5,
        currency: 'cash',
        upgrade: {
          toLevel: 4,
          startAt: '2026-10-10T12:00:00.000Z',
          readyAt: '2026-10-10T12:30:00.000Z',
          secondsLeft: 1800,
        },
        next: null,
      },
    ],
    now: '2026-10-10T12:00:00.000Z',
  };
}

describe('campus contract', () => {
  it('mirrors the Go route ids, paths and status codes', () => {
    const routes = campusContract as unknown as Record<
      string,
      { method: string; path: string; responses: Record<string, unknown> }
    >;
    const expected: Record<string, [string, string, number[]]> = {
      get: ['GET', '/campus/:clubId', [200, 404]],
      upgrade: ['POST', '/campus/:clubId/upgrade', [200, 400, 401, 403, 404, 409]],
      place: ['POST', '/campus/:clubId/place', [200, 400, 401, 403, 404]],
      collect: ['POST', '/campus/:clubId/collect', [200, 400, 401, 403, 404, 409]],
      clearObstacle: ['POST', '/campus/:clubId/obstacle/clear', [200, 400, 401, 403, 404, 409]],
      buyGroundskeeper: ['POST', '/campus/:clubId/groundskeeper/buy', [200, 400, 401, 403, 404, 409]],
      usePerk: ['POST', '/campus/:clubId/perk/use', [200, 400, 401, 403, 404, 409]],
    };
    for (const [key, [method, path, statuses]] of Object.entries(expected)) {
      const route = routes[key];
      assert.ok(route, `missing campus.${key}`);
      assert.equal(route.method, method, key);
      assert.equal(route.path, path, key);
      assert.deepEqual(
        Object.keys(route.responses).map(Number).sort((a, b) => a - b),
        statuses,
        key
      );
    }
  });

  it('parses a campus payload shaped exactly like the Go response', () => {
    const parsed = CampusStateSchema.parse(sampleCampus());
    assert.equal(parsed.collectors[0]!.currency, 'cash');
    assert.equal(parsed.groundskeepers.nextEarnedBy, 'purchase');
    assert.equal(parsed.clubhouse.upgradingTo, 4);
    assert.equal(parsed.perks[0]!.key, 'cash_cache');
    assert.equal(parsed.perks[0]!.count, 2);
    // The Board-Perks consume request: instanceId is the optional idempotency key.
    assert.equal(UsePerkRequestSchema.safeParse({ perk: 'cash_cache' }).success, true);
    assert.equal(
      UsePerkRequestSchema.safeParse({ perk: 'cash_cache', instanceId: 'x-1' }).success,
      true
    );
    assert.equal(UsePerkRequestSchema.safeParse({ perk: '' }).success, false);
    assert.equal(UsePerkRequestSchema.safeParse({ perk: 'cash_cache', instanceId: '' }).success, false);
  });

  it('types the perk target as the campus facility enum (OW-H05)', () => {
    // Optional: a resource/combat/cosmetic perk carries no target.
    assert.equal(UsePerkRequestSchema.safeParse({ perk: 'instant_finish' }).success, true);
    // The construction/research targets the Go campus accepts.
    for (const target of [
      'turnstiles',
      'club_shop',
      'cash_vault',
      'fan_vault',
      'clubhouse',
      'coaching_dept',
      'video_analysis',
    ]) {
      assert.equal(
        UsePerkRequestSchema.safeParse({ perk: 'instant_finish', target }).success,
        true,
        target
      );
    }
    // A bare string outside the enum (the old free-string behaviour) is refused.
    assert.equal(
      UsePerkRequestSchema.safeParse({ perk: 'instant_finish', target: 'stadium_grounds' }).success,
      false
    );
    assert.equal(
      UsePerkRequestSchema.safeParse({ perk: 'instant_finish', target: 'nope' }).success,
      false
    );
    assert.equal(UsePerkRequestSchema.safeParse({ perk: 'instant_finish', target: '' }).success, false);
  });

  it('rejects a bad groundskeeper mode and a bad currency', () => {
    const bad = sampleCampus() as unknown as Record<string, unknown>;
    bad.groundskeepers = {
      count: 3,
      max: 6,
      active: 1,
      nextCost: null,
      nextCurrency: null,
      nextEarnedBy: 'free',
    };
    assert.equal(CampusStateSchema.safeParse(bad).success, false);
  });

  it('rejects malformed place and upgrade requests', () => {
    assert.equal(PlaceRequestSchema.safeParse({ building: 'stands', x: 0, z: 0, rot: 0 }).success, true);
    assert.equal(PlaceRequestSchema.safeParse({ building: 'stands', x: 0, z: 0, rot: 4 }).success, false);
    assert.equal(PlaceRequestSchema.safeParse({ building: 'stands', x: 0.5, z: 0, rot: 0 }).success, false);
    assert.equal(UpgradeRequestSchema.safeParse({ assetType: '' }).success, false);
    assert.equal(UpgradeRequestSchema.safeParse({ assetType: 'club_shop' }).success, true);
  });

  it('validates the shared layout document', () => {
    const grid = {
      slots: [{ col: 0, row: 3, playerId: 'gk', position: 'GK' }],
    };
    assert.equal(PitchGridDocumentSchema.safeParse(grid).success, true);
    assert.equal(LayoutsSchema.safeParse({ home: grid, match: grid, derby: grid }).success, true);
    assert.equal(LayoutsSchema.safeParse({ keeper: grid }).success, false);
    assert.equal(
      PitchGridDocumentSchema.safeParse({ slots: [{ col: 0, row: 3, playerId: 'gk', position: 'KEEPER' }] })
        .success,
      false
    );
  });
});
