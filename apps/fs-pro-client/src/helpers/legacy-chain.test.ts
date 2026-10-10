import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceHonours,
  coerceLegacy,
  legacyClaimable,
  prettify,
  remainingSteps,
} from './legacy-chain';

const RAW = {
  clubId: 'c1',
  name: 'Lakeside FC',
  chain: [
    { id: 'first-grounds', stars: 1, progress: 1, met: true },
    { id: 'first-raid-win', stars: 1, progress: 0, met: false },
    { id: 'custom-thing', stars: 2, progress: 1, met: false },
  ],
  totalStars: 2,
  maxStars: 17,
  complete: false,
  granted: 0,
  groundskeepers: { count: 3, max: 6 },
  honours: [
    {
      code: 'first-blood',
      title: 'Win your first fixture',
      goal: 1,
      progress: 1,
      complete: true,
      completed: true,
      reward: { cash: 0, fans: 0, sponsorCredits: 10, perks: null },
    },
    {
      code: 'home-fortress',
      title: 'Win 10 home raids',
      goal: 10,
      progress: 4,
      complete: false,
      completed: false,
      reward: { cash: 25000, perks: { regalia: 1 } },
    },
  ],
};

describe('prettify', () => {
  it('turns a slug into a sentence-case label', () => {
    assert.equal(prettify('first-raid-win'), 'First raid win');
    assert.equal(prettify('cup_run'), 'Cup run');
  });
});

describe('coerceLegacy', () => {
  it('labels known chain steps and falls back for unknown ones', () => {
    const legacy = coerceLegacy(RAW);
    assert.ok(legacy);
    assert.equal(
      legacy.chain[0]!.label,
      'Break ground on the first facility'
    );
    assert.equal(legacy.chain[2]!.label, 'Custom thing');
    assert.equal(legacy.chain[1]!.met, false);
    assert.equal(legacy.chain[1]!.fill, 0);
    assert.equal(legacy.groundskeepers.count, 3);
    assert.equal(legacy.groundskeepers.max, 6);
    assert.equal(legacy.honours.length, 2);
    assert.deepEqual(
      legacy.honours[1]!.reward.perks,
      [{ key: 'regalia', count: 1 }]
    );
  });

  it('returns null without a club id', () => {
    assert.equal(coerceLegacy({ name: 'x' }), null);
    assert.equal(coerceLegacy(42), null);
  });
});

describe('remainingSteps / legacyClaimable', () => {
  it('counts unmet steps and gates the claim on completion', () => {
    const legacy = coerceLegacy(RAW)!;
    assert.equal(remainingSteps(legacy), 2);
    assert.equal(legacyClaimable(legacy), false);
  });

  it('offers the claim once the chain is complete and ungranted', () => {
    const legacy = coerceLegacy({
      clubId: 'c1',
      chain: [{ id: 'first-grounds', stars: 1, progress: 1, met: true }],
      complete: true,
      granted: 0,
    })!;
    assert.equal(legacyClaimable(legacy), true);
    assert.equal(remainingSteps(legacy), 0);
  });
});

describe('coerceHonours', () => {
  it('coerces the honours-only read model', () => {
    const h = coerceHonours({ clubId: 'c1', name: 'Lakeside FC', honours: RAW.honours });
    assert.ok(h);
    assert.equal(h.honours[0]!.completed, true);
    assert.equal(h.honours[1]!.fill, 0.4);
    assert.equal(h.honours[1]!.reward.cash, 25000);
  });

  it('returns null without a club id', () => {
    assert.equal(coerceHonours({ honours: [] }), null);
  });
});
