import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FormBonus, Standing, StandingPool } from '@repo/api-contract';
import {
  formBonusView,
  leagueLabel,
  multiplierLabel,
  poolView,
  standingView,
  vaultClaimGate,
} from './league-ladder';

describe('leagueLabel', () => {
  it('turns a rung code into a player-facing label', () => {
    assert.equal(leagueLabel('bronze_3'), 'Bronze III');
    assert.equal(leagueLabel('gold_1'), 'Gold I');
    assert.equal(leagueLabel('champion_2'), 'Champion II');
    assert.equal(leagueLabel('legend'), 'Legend');
    assert.equal(leagueLabel('unranked'), 'Unranked');
    assert.equal(leagueLabel(''), 'Unranked');
  });
});

describe('multiplierLabel', () => {
  it('renders a x100 multiplier with two places', () => {
    assert.equal(multiplierLabel(130), 'x1.30');
    assert.equal(multiplierLabel(100), 'x1.00');
    assert.equal(multiplierLabel(210), 'x2.10');
  });
});

describe('standingView', () => {
  it('derives the league label and multiplier', () => {
    const s: Standing = {
      clubId: 'c1',
      points: 1224,
      leagueCode: 'gold_3',
      division: 3,
      multiplierX100: 130,
      rank: 412,
    };
    const view = standingView(s);
    assert.equal(view.leagueLabel, 'Gold III');
    assert.equal(view.multiplier, 1.3);
    assert.equal(view.multiplierLabel, 'x1.30');
    assert.equal(view.rank, 412);
  });

  it('keeps a null rank (server has not ranked the club)', () => {
    const view = standingView({
      clubId: 'c1',
      points: 0,
      leagueCode: 'unranked',
      division: 0,
      multiplierX100: 100,
      rank: null,
    });
    assert.equal(view.rank, null);
    assert.equal(view.leagueLabel, 'Unranked');
  });
});

describe('poolView', () => {
  it('clamps attacks-left to zero when the allowance is spent', () => {
    const p: StandingPool = {
      weekKey: '2026-W41',
      leagueCode: 'gold_3',
      pool: 2,
      attacks: 12,
      attacksAllowed: 12,
      defenses: 4,
      stars: 30,
      placement: null,
    };
    const view = poolView(p);
    assert.equal(view.attacksLeft, 0);
    assert.equal(view.attacksUsed, 12);
    assert.equal(view.defenses, 4);
  });

  it('reports the remaining allowance', () => {
    const view = poolView({
      weekKey: '2026-W41',
      leagueCode: 'bronze_3',
      pool: 0,
      attacks: 2,
      attacksAllowed: 6,
      defenses: 0,
      stars: 5,
      placement: 3,
    });
    assert.equal(view.attacksLeft, 4);
    assert.equal(view.placement, 3);
  });
});

describe('formBonusView', () => {
  it('fills against the required stars and keeps the reset instant', () => {
    const f: FormBonus = {
      stars: 3,
      required: 5,
      ready: false,
      nextResetAt: '2026-10-11T12:00:00.000Z',
    };
    const view = formBonusView(f);
    assert.equal(view.label, '3 / 5');
    assert.equal(view.fill, 0.6);
    assert.equal(view.ready, false);
    assert.equal(view.nextResetAt, '2026-10-11T12:00:00.000Z');
  });

  it('is full and ready at 5 stars', () => {
    const view = formBonusView({
      stars: 5,
      required: 5,
      ready: true,
      nextResetAt: null,
    });
    assert.equal(view.fill, 1);
    assert.equal(view.ready, true);
    assert.equal(view.nextResetAt, null);
  });

  it('never divides by zero', () => {
    const view = formBonusView({
      stars: 0,
      required: 0,
      ready: false,
      nextResetAt: null,
    });
    assert.equal(view.fill, 0);
  });
});

describe('vaultClaimGate', () => {
  it('offers the claim when the vault holds loot or the bonus is ready', () => {
    assert.equal(vaultClaimGate(1000, false).claimable, true);
    assert.equal(vaultClaimGate(0, true).claimable, true);
  });
  it('hides the claim (with a reason) when empty', () => {
    const gate = vaultClaimGate(0, false);
    assert.equal(gate.claimable, false);
    assert.match(gate.reason ?? '', /empty/i);
  });
});
